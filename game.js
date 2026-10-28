'use strict';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = 960;
const H = 600;
const B = 18;

const WEAPONS = {
  ak: {
    name: 'AK-47',
    dmg: 20,
    rate: 0.095,
    mag: 30,
    reserve: 150,
    spread: 0.012,
    recoil: 0.02,
    reload: 1.9,
    auto: true,
    speed: 980,
    color: '#ffe28a'
  },
  pistol: {
    name: 'USP-S',
    dmg: 34,
    rate: 0.19,
    mag: 12,
    reserve: 60,
    spread: 0.008,
    recoil: 0.012,
    reload: 1.35,
    auto: false,
    speed: 1050,
    color: '#ffe9b8'
  }
};

function freshSlots() {
  const slots = {};
  for (const key of Object.keys(WEAPONS)) {
    slots[key] = { ammo: WEAPONS[key].mag, reserve: WEAPONS[key].reserve };
  }
  return slots;
}

function readBest() {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const value = Number(localStorage.getItem('dustline.best'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (err) {
    return 0;
  }
}

function writeBest(value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('dustline.best', String(value));
  } catch (err) {
    return;
  }
}

let best = readBest();

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const d2 = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

const walls = [
  { x: 150, y: 110, w: 130, h: 44 },
  { x: 680, y: 110, w: 130, h: 44 },
  { x: 150, y: 446, w: 130, h: 44 },
  { x: 680, y: 446, w: 130, h: 44 },
  { x: 430, y: 250, w: 100, h: 100 },
  { x: 70, y: 260, w: 42, h: 90 },
  { x: 848, y: 260, w: 42, h: 90 },
  { x: 400, y: 54, w: 160, h: 30 },
  { x: 400, y: 516, w: 160, h: 30 }
];

const keys = Object.create(null);
const mouse = { x: W / 2, y: H / 3, down: false };

let player;
let enemies = [];
let bullets = [];
let particles = [];
let decals = [];
let floaters = [];

let state = 'play';
let paused = false;
let score = 0;
let kills = 0;
let wave = 1;
let spawnPend = 0;
let maxAlive = 3;
let spawnTimer = 0;
let waveCd = 0;
let banner = '';
let bannerT = 0;
let shake = 0;
let dmgFlash = 0;
let overT = 0;

let ac = null;
let noiseBuf = null;

function initAudio() {
  if (!ac) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      const len = Math.floor(ac.sampleRate * 0.25);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (err) {
      ac = null;
      return;
    }
  }
  if (ac.state === 'suspended') ac.resume();
}

function env(gain, t, vol, dur) {
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
}

function noiseShot(vol, dur, freq, q, t0) {
  if (!ac) return;
  const t = t0 === undefined ? ac.currentTime : t0;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ac.createGain();
  env(g, t, vol, dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(type, f0, f1, vol, dur, t0) {
  if (!ac) return;
  const t = t0 === undefined ? ac.currentTime : t0;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ac.createGain();
  env(g, t, vol, dur);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const sfx = {
  shoot() { noiseShot(0.2, 0.09, 1800, 0.8); tone('square', 160, 60, 0.11, 0.09); },
  eshoot() { noiseShot(0.08, 0.08, 1200, 1.2); tone('square', 110, 50, 0.045, 0.08); },
  hit() { tone('triangle', 900, 300, 0.06, 0.05); },
  kill() { noiseShot(0.12, 0.16, 500, 0.7); tone('sawtooth', 220, 70, 0.07, 0.2); },
  hurt() { noiseShot(0.14, 0.18, 320, 0.6); },
  reload() {
    if (!ac) return;
    const t = ac.currentTime;
    tone('square', 700, 500, 0.045, 0.04, t);
    tone('square', 500, 900, 0.045, 0.05, t + 0.75);
  },
  empty() { tone('square', 300, 200, 0.045, 0.03); },
  swap() { tone('square', 520, 360, 0.04, 0.035); },
  wave() {
    if (!ac) return;
    const t = ac.currentTime;
    tone('sine', 420, 620, 0.05, 0.18, t);
    tone('sine', 620, 860, 0.045, 0.22, t + 0.18);
  }
};

function circleHitsRect(x, y, r, rc) {
  const nx = clamp(x, rc.x, rc.x + rc.w);
  const ny = clamp(y, rc.y, rc.y + rc.h);
  return d2(x, y, nx, ny) < r * r;
}

function inWall(x, y) {
  for (const w of walls) {
    if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
  }
  return false;
}

function segHitsRect(x1, y1, x2, y2, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

function hasLOS(x1, y1, x2, y2) {
  for (const w of walls) {
    if (segHitsRect(x1, y1, x2, y2, w)) return false;
  }
  return true;
}

function moveEntity(e, dx, dy) {
  e.x += dx;
  for (const w of walls) {
    if (circleHitsRect(e.x, e.y, e.r, w)) {
      if (dx > 0) e.x = w.x - e.r - 0.01;
      else if (dx < 0) e.x = w.x + w.w + e.r + 0.01;
    }
  }
  e.x = clamp(e.x, B + e.r, W - B - e.r);
  e.y += dy;
  for (const w of walls) {
    if (circleHitsRect(e.x, e.y, e.r, w)) {
      if (dy > 0) e.y = w.y - e.r - 0.01;
      else if (dy < 0) e.y = w.y + w.h + e.r + 0.01;
    }
  }
  e.y = clamp(e.y, B + e.r, H - B - e.r);
}

function burst(x, y, count, color, spd, size, life) {
  for (let i = 0; i < count; i++) {
    const a = rnd(0, Math.PI * 2);
    const v = rnd(spd * 0.25, spd);
    const l = rnd(life * 0.5, life);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: l,
      max: l,
      color,
      size: rnd(size * 0.5, size)
    });
  }
  if (particles.length > 350) particles.splice(0, particles.length - 350);
}

function addFloater(x, y, text, color) {
  floaters.push({ x, y, text, color, life: 0.9, max: 0.9 });
  if (floaters.length > 30) floaters.shift();
}

function spawnBullet(x, y, ang, speed, dmg, owner) {
  bullets.push({
    x,
    y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    dmg,
    owner,
    life: 0.9,
    dead: false
  });
}

function shootPlayer() {
  const p = player;
  const gun = WEAPONS[p.weapon];
  const slot = p.slots[p.weapon];
  slot.ammo--;
  p.fireCd = gun.rate;
  const ang = p.angle + rnd(-1, 1) * (gun.spread + p.spread);
  const mx = p.x + Math.cos(p.angle) * (p.r + 6);
  const my = p.y + Math.sin(p.angle) * (p.r + 6);
  spawnBullet(mx, my, ang, gun.speed, gun.dmg, 'p');
  p.spread = Math.min(0.12, p.spread + gun.recoil);
  p.flash = 0.05;
  shake = Math.max(shake, gun.auto ? 2 : 2.6);
  burst(mx, my, 3, gun.color, 190, 2, 0.14);
  sfx.shoot();
}

function enemyShoot(e) {
  const ang = e.angle + rnd(-1, 1) * 0.09;
  const mx = e.x + Math.cos(e.angle) * (e.r + 14);
  const my = e.y + Math.sin(e.angle) * (e.r + 14);
  spawnBullet(mx, my, ang, 640, 9, 'e');
  e.mf = 0.05;
  burst(mx, my, 2, '#ff9a5a', 130, 1.6, 0.1);
  sfx.eshoot();
}

function tryReload() {
  if (state !== 'play' || paused) return;
  const gun = WEAPONS[player.weapon];
  const slot = player.slots[player.weapon];
  if (player.reloading || slot.ammo >= gun.mag || slot.reserve <= 0) return;
  player.reloading = true;
  player.reloadT = gun.reload;
  sfx.reload();
}

function switchWeapon(name) {
  if (state !== 'play' || paused) return;
  if (!WEAPONS[name] || player.weapon === name) return;
  player.weapon = name;
  player.reloading = false;
  player.reloadT = 0;
  player.spread = 0;
  player.fireCd = 0;
  player.triggerHeld = true;
  sfx.swap();
}

function startWave(n) {
  if (n > 1) {
    player.hp = Math.min(100, player.hp + 30);
    player.slots.ak.reserve = Math.min(300, player.slots.ak.reserve + 60);
    player.slots.pistol.reserve = Math.min(180, player.slots.pistol.reserve + 30);
  }
  wave = n;
  spawnPend = Math.min(3 + n * 2, 20);
  maxAlive = Math.min(2 + n, 9);
  spawnTimer = 0.2;
  waveCd = 3;
  banner = 'WAVE ' + n;
  bannerT = 2.2;
  sfx.wave();
}

function spawnEnemy() {
  const corners = [
    { x: 80, y: 80 },
    { x: W - 80, y: 80 },
    { x: 80, y: H - 80 },
    { x: W - 80, y: H - 80 }
  ].filter((c) => !walls.some((w) => circleHitsRect(c.x, c.y, 20, w)));
  corners.sort((a, b) => d2(b.x, b.y, player.x, player.y) - d2(a.x, a.y, player.x, player.y));
  const fallback = corners[0] || { x: W / 2, y: H / 2 };
  let x = fallback.x;
  let y = fallback.y;
  for (let i = 0; i < 80; i++) {
    let px;
    let py;
    if (Math.random() < 0.5) {
      px = rnd(60, W - 60);
      py = Math.random() < 0.5 ? rnd(46, 96) : rnd(H - 96, H - 46);
    } else {
      py = rnd(60, H - 60);
      px = Math.random() < 0.5 ? rnd(46, 96) : rnd(W - 96, W - 46);
    }
    if (d2(px, py, player.x, player.y) < 340 * 340) continue;
    if (walls.some((w) => circleHitsRect(px, py, 20, w))) continue;
    x = px;
    y = py;
    break;
  }
  const hp = 40 + (wave - 1) * 6;
  enemies.push({
    x,
    y,
    r: 14,
    hp,
    maxHp: hp,
    speed: Math.min(150, 82 + wave * 5 + rnd(-8, 8)),
    angle: 0,
    fireCd: rnd(0.7, 1.4),
    strafe: Math.random() < 0.5 ? -1 : 1,
    flip: rnd(0.8, 2.2),
    grace: 0.8,
    flash: 0,
    mf: 0
  });
  burst(x, y, 8, '#ffb37a', 150, 2.5, 0.3);
}

function damagePlayer(dmg) {
  if (state !== 'play') return;
  player.hp -= dmg;
  dmgFlash = 0.55;
  shake = 6;
  burst(player.x, player.y, 4, '#d23c3c', 120, 2.5, 0.3);
  sfx.hurt();
  if (player.hp <= 0) {
    player.hp = 0;
    state = 'over';
    overT = 0;
    shake = 10;
    burst(player.x, player.y, 26, '#b3202a', 260, 4, 0.7);
    sfx.kill();
  }
}

function killEnemy(e) {
  e.dead = true;
  kills++;
  score += 100;
  if (score > best) {
    best = score;
    writeBest(best);
  }
  decals.push({ x: e.x, y: e.y, r: rnd(10, 18), a: 0.5 });
  if (decals.length > 90) decals.shift();
  burst(e.x, e.y, 18, '#b3202a', 250, 3.5, 0.55);
  burst(e.x, e.y, 6, '#4a2a1a', 150, 2.5, 0.4);
  addFloater(e.x, e.y - 18, '+100', '#ffd27a');
  shake = Math.max(shake, 3);
  sfx.kill();
}

function hitEnemy(e, b) {
  e.hp -= b.dmg;
  e.flash = 0.08;
  burst(b.x, b.y, 5, '#c22b33', 200, 2.5, 0.3);
  sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function reset() {
  player = {
    x: 480,
    y: 170,
    r: 14,
    speed: 215,
    hp: 100,
    angle: Math.PI / 2,
    weapon: 'ak',
    slots: freshSlots(),
    reloading: false,
    reloadT: 0,
    fireCd: 0,
    spread: 0,
    flash: 0,
    triggerHeld: false
  };
  enemies = [];
  bullets = [];
  particles = [];
  decals = [];
  floaters = [];
  state = 'play';
  paused = false;
  score = 0;
  kills = 0;
  wave = 0;
  spawnPend = 0;
  maxAlive = 3;
  spawnTimer = 0;
  waveCd = 0;
  banner = '';
  bannerT = 0;
  shake = 0;
  dmgFlash = 0;
  overT = 0;
  mouse.down = false;
  startWave(1);
}

function updatePlayer(dt) {
  const p = player;
  let mx = 0;
  let my = 0;
  if (keys['w'] || keys['arrowup']) my--;
  if (keys['s'] || keys['arrowdown']) my++;
  if (keys['a'] || keys['arrowleft']) mx--;
  if (keys['d'] || keys['arrowright']) mx++;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  const spd = p.speed * (keys['shift'] ? 1.3 : 1);
  moveEntity(p, mx * spd * dt, my * spd * dt);
  p.angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
  p.flash = Math.max(0, p.flash - dt);

  if (p.reloading) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const gun = WEAPONS[p.weapon];
      const slot = p.slots[p.weapon];
      const need = gun.mag - slot.ammo;
      const take = Math.min(need, slot.reserve);
      slot.ammo += take;
      slot.reserve -= take;
      p.reloading = false;
    }
    return;
  }

  p.fireCd -= dt;
  const gun = WEAPONS[p.weapon];
  const slot = p.slots[p.weapon];
  const wantFire = mouse.down || keys[' '];
  if (wantFire && (gun.auto || !p.triggerHeld)) {
    if (slot.ammo > 0) {
      if (p.fireCd <= 0) shootPlayer();
    } else if (slot.reserve > 0) {
      tryReload();
    } else if (p.fireCd <= 0) {
      p.fireCd = 0.6;
      sfx.empty();
    }
  }
  p.triggerHeld = wantFire;
}

function updateEnemies(dt) {
  for (const e of enemies) {
    e.flash = Math.max(0, e.flash - dt);
    e.mf = Math.max(0, e.mf - dt);
    e.grace -= dt;
    e.fireCd -= dt;
    e.flip -= dt;
    if (e.flip <= 0) {
      e.flip = rnd(0.8, 2.2);
      e.strafe *= -1;
    }
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    e.angle = Math.atan2(dy, dx);
    let vx = 0;
    let vy = 0;
    if (d > 300) {
      vx = ux;
      vy = uy;
    } else if (d < 170) {
      vx = -ux;
      vy = -uy;
    } else {
      vx = -uy * e.strafe;
      vy = ux * e.strafe;
    }
    if (vx !== 0 || vy !== 0) {
      const probe = 46;
      let blocked = false;
      for (const w of walls) {
        if (circleHitsRect(e.x + vx * probe, e.y + vy * probe, e.r, w)) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        const sideX = -vy * e.strafe;
        const sideY = vx * e.strafe;
        vx = sideX;
        vy = sideY;
      }
    }
    moveEntity(e, vx * e.speed * dt, vy * e.speed * dt);
    if (e.grace <= 0 && e.fireCd <= 0 && d < 640 && hasLOS(e.x, e.y, player.x, player.y)) {
      enemyShoot(e);
      e.fireCd = rnd(0.8, 1.6) * (wave > 3 ? 0.8 : 1);
    }
  }
  separate();
}

function pushOutOfWalls(e) {
  for (let pass = 0; pass < 2; pass++) {
    for (const w of walls) {
      if (!circleHitsRect(e.x, e.y, e.r, w)) continue;
      const cx = clamp(e.x, w.x, w.x + w.w);
      const cy = clamp(e.y, w.y, w.y + w.h);
      const dx = e.x - cx;
      const dy = e.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        e.x = cx + (dx / d) * (e.r + 0.01);
        e.y = cy + (dy / d) * (e.r + 0.01);
      } else {
        const left = e.x - w.x;
        const right = w.x + w.w - e.x;
        const top = e.y - w.y;
        const bottom = w.y + w.h - e.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) e.x = w.x - e.r - 0.01;
        else if (m === right) e.x = w.x + w.w + e.r + 0.01;
        else if (m === top) e.y = w.y - e.r - 0.01;
        else e.y = w.y + w.h + e.r + 0.01;
      }
    }
  }
  e.x = clamp(e.x, B + e.r, W - B - e.r);
  e.y = clamp(e.y, B + e.r, H - B - e.r);
}

function separate() {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
    const dx = a.x - player.x;
    const dy = a.y - player.y;
    const d = Math.hypot(dx, dy);
    const min = a.r + player.r;
    if (d > 0.01 && d < min) {
      a.x += (dx / d) * (min - d);
      a.y += (dy / d) * (min - d);
    }
    a.x = clamp(a.x, B + a.r, W - B - a.r);
    a.y = clamp(a.y, B + a.r, H - B - a.r);
    pushOutOfWalls(a);
  }
}

function updateBullets(dt) {
  for (const b of bullets) {
    if (b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) {
      b.dead = true;
      continue;
    }
    const dx = b.vx * dt;
    const dy = b.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 9));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let s = 0; s < steps && !b.dead; s++) {
      b.x += sx;
      b.y += sy;
      if (b.x < B || b.x > W - B || b.y < B || b.y > H - B) {
        b.dead = true;
        break;
      }
      if (inWall(b.x, b.y)) {
        b.dead = true;
        burst(b.x, b.y, 4, '#ffd27a', 220, 2.2, 0.22);
        break;
      }
      if (b.owner === 'p') {
        for (const e of enemies) {
          if (e.dead) continue;
          if (d2(b.x, b.y, e.x, e.y) < (e.r + 4) * (e.r + 4)) {
            hitEnemy(e, b);
            b.dead = true;
            break;
          }
        }
      } else if (state === 'play' && d2(b.x, b.y, player.x, player.y) < (player.r + 4) * (player.r + 4)) {
        damagePlayer(b.dmg);
        b.dead = true;
        break;
      }
    }
  }
  bullets = bullets.filter((b) => !b.dead);
  enemies = enemies.filter((e) => !e.dead);
}

function updateWaves(dt) {
  if (spawnPend > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < maxAlive) {
      spawnEnemy();
      spawnPend--;
      spawnTimer = 0.55;
    }
  } else if (enemies.length === 0) {
    waveCd -= dt;
    if (waveCd <= 0) startWave(wave + 1);
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - Math.min(0.9, 5 * dt);
    p.vy *= 1 - Math.min(0.9, 5 * dt);
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floaters) {
    f.y -= 26 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
}

function update(dt) {
  shake = Math.max(0, shake - 26 * dt);
  dmgFlash = Math.max(0, dmgFlash - 2.2 * dt);
  bannerT = Math.max(0, bannerT - dt);
  updateParticles(dt);
  if (state === 'over') {
    overT += dt;
    return;
  }
  updatePlayer(dt);
  player.spread = Math.max(0, player.spread - 0.3 * dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateWaves(dt);
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(6,10,13,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  rr(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
}

function drawFloor() {
  ctx.fillStyle = '#151d21';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = B; x <= W - B; x += 48) {
    ctx.moveTo(x, B);
    ctx.lineTo(x, H - B);
  }
  for (let y = B; y <= H - B; y += 48) {
    ctx.moveTo(B, y);
    ctx.lineTo(W - B, y);
  }
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = 'rgba(255,190,80,0.06)';
  ctx.fillRect(640, 330, 270, 210);
  ctx.strokeStyle = 'rgba(255,190,80,0.22)';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.strokeRect(640, 330, 270, 210);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,200,110,0.35)';
  ctx.font = '700 14px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('BOMB SITE A', 654, 354);
  ctx.restore();

  ctx.lineWidth = B * 2;
  ctx.strokeStyle = '#0a0e11';
  ctx.strokeRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  ctx.strokeRect(B, B, W - B * 2, H - B * 2);
}

function drawDecals() {
  for (const d of decals) {
    ctx.fillStyle = 'rgba(110,12,18,' + d.a + ')';
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWalls() {
  for (const w of walls) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(w.x + 5, w.y + 7, w.w, w.h);
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = '#8b6239';
    ctx.lineWidth = 3;
    ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w.x + 6, w.y + w.h / 2);
    ctx.lineTo(w.x + w.w - 6, w.y + w.h / 2);
    ctx.moveTo(w.x + w.w / 2, w.y + 6);
    ctx.lineTo(w.x + w.w / 2, w.y + w.h - 6);
    ctx.stroke();
  }
}

function drawBullets() {
  ctx.lineCap = 'round';
  for (const b of bullets) {
    const tx = b.x - b.vx * 0.014;
    const ty = b.y - b.vy * 0.014;
    ctx.strokeStyle = b.owner === 'p' ? 'rgba(255,235,150,0.22)' : 'rgba(255,150,90,0.2)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = b.owner === 'p' ? '#ffe28a' : '#ff9a5a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(3, 4, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  ctx.fillStyle = '#20262b';
  ctx.fillRect(8, -3, 26, 6);
  ctx.fillStyle = '#39424a';
  ctx.fillRect(30, -2, 8, 4);
  ctx.fillStyle = '#2f6fb5';
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0d1c2b';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(3, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d3f63';
  ctx.beginPath();
  ctx.arc(1, 0, 7, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  if (p.flash > 0) {
    const fg = ctx.createRadialGradient(34, 0, 0, 34, 0, 24);
    fg.addColorStop(0, 'rgba(255,245,190,0.95)');
    fg.addColorStop(0.35, 'rgba(255,190,80,0.6)');
    fg.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(34, 0, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEnemies() {
  for (const e of enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(3, 4, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(e.angle);
    ctx.fillStyle = '#241c16';
    ctx.fillRect(7, -3, 20, 6);
    ctx.fillStyle = '#a97a4a';
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5c3f24';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#c9a26b';
    ctx.beginPath();
    ctx.arc(3, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a3f2a';
    ctx.fillRect(-e.r + 3, -2, 6, 4);
    if (e.mf > 0) {
      const fg = ctx.createRadialGradient(28, 0, 0, 28, 0, 18);
      fg.addColorStop(0, 'rgba(255,235,180,0.9)');
      fg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(28, 0, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (e.flash / 0.08) * 0.5 + ')';
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (e.hp < e.maxHp) {
      const w = 30;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
      ctx.fillStyle = '#d3563f';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.textAlign = 'center';
  ctx.font = '700 14px Consolas, monospace';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawRadar() {
  const rx = 20;
  const ry = 20;
  const rw = 150;
  const rh = 112;
  panel(rx, ry, rw, rh);
  ctx.fillStyle = '#4b5a63';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText('RADAR', rx + 10, ry + 16);
  const mx0 = rx + 10;
  const my0 = ry + 24;
  const mw = rw - 20;
  const mh = rh - 34;
  ctx.fillStyle = 'rgba(90,190,120,0.07)';
  ctx.fillRect(mx0, my0, mw, mh);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (const w of walls) {
    ctx.fillRect(mx0 + (w.x / W) * mw, my0 + (w.y / H) * mh, Math.max(1, (w.w / W) * mw), Math.max(1, (w.h / H) * mh));
  }
  ctx.fillStyle = '#e2563f';
  for (const e of enemies) {
    ctx.beginPath();
    ctx.arc(mx0 + (e.x / W) * mw, my0 + (e.y / H) * mh, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#5ce07a';
  ctx.beginPath();
  ctx.arc(mx0 + (player.x / W) * mw, my0 + (player.y / H) * mh, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawHUD() {
  const p = player;
  const gun = WEAPONS[p.weapon];
  const slot = p.slots[p.weapon];
  drawRadar();

  panel(W - 240, 20, 220, 92);
  ctx.fillStyle = '#77858f';
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('WAVE', W - 224, 40);
  ctx.fillStyle = '#e7eef3';
  ctx.font = '700 24px Consolas, monospace';
  ctx.fillText(String(wave), W - 224, 66);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#77858f';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText('SCORE', W - 36, 40);
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 22px Consolas, monospace';
  ctx.fillText(String(score), W - 36, 66);
  ctx.fillStyle = 'rgba(255,210,122,0.55)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('BEST ' + best, W - 36, 92);

  panel(20, H - 96, 260, 76);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#77858f';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText('HEALTH', 36, H - 76);
  const hpCol = p.hp > 60 ? '#58c46a' : p.hp > 30 ? '#e0b13c' : '#d34a4a';
  ctx.fillStyle = hpCol;
  ctx.font = '700 26px Consolas, monospace';
  ctx.fillText(String(Math.ceil(p.hp)), 36, H - 42);
  ctx.fillStyle = '#232c33';
  ctx.fillRect(104, H - 58, 160, 12);
  ctx.fillStyle = hpCol;
  ctx.fillRect(104, H - 58, 160 * clamp(p.hp / 100, 0, 1), 12);

  panel(W - 280, H - 96, 260, 76);
  ctx.fillStyle = '#77858f';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText(gun.name, W - 264, H - 76);
  ctx.textAlign = 'right';
  ctx.font = '700 34px Consolas, monospace';
  ctx.fillStyle = slot.ammo === 0 ? '#e2563f' : '#e7eef3';
  ctx.fillText(String(slot.ammo), W - 96, H - 44);
  ctx.font = '600 15px Consolas, monospace';
  ctx.fillStyle = '#8794a0';
  ctx.fillText('/ ' + slot.reserve, W - 36, H - 44);
  if (p.reloading) {
    const prog = 1 - clamp(p.reloadT / gun.reload, 0, 1);
    ctx.fillStyle = '#28323a';
    ctx.fillRect(W - 264, H - 31, 228, 5);
    ctx.fillStyle = '#e0b13c';
    ctx.fillRect(W - 264, H - 31, 228 * prog, 5);
  }
  ctx.textAlign = 'left';

  if (spawnPend === 0 && enemies.length === 0 && state === 'play') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(220,230,238,0.65)';
    ctx.font = '600 14px Consolas, monospace';
    ctx.fillText('NEXT WAVE IN ' + Math.max(0, waveCd).toFixed(1), W / 2, H - 30);
    ctx.textAlign = 'left';
  }

  if (bannerT > 0) {
    const a = clamp(bannerT / 0.6, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 44px Consolas, monospace';
    ctx.fillText(banner, W / 2, 148);
    ctx.fillStyle = 'rgba(220,230,238,0.75)';
    ctx.font = '600 13px Consolas, monospace';
    ctx.fillText('HOSTILES INBOUND', W / 2, 174);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  const cx = mouse.x;
  const cy = mouse.y;
  const gap = 7 + p.spread * 180;
  const col = p.reloading ? 'rgba(255,200,90,0.9)' : 'rgba(120,235,140,0.9)';
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - gap - 8, cy);
  ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy);
  ctx.lineTo(cx + gap + 8, cy);
  ctx.moveTo(cx, cy - gap - 8);
  ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap);
  ctx.lineTo(cx, cy + gap + 8);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
  if (p.reloading) {
    const gun = WEAPONS[p.weapon];
    ctx.strokeStyle = 'rgba(255,200,90,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + (1 - clamp(p.reloadT / gun.reload, 0, 1)) * Math.PI * 2);
    ctx.stroke();
  }
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (dmgFlash > 0) {
    const r = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
    r.addColorStop(0, 'rgba(180,20,20,0)');
    r.addColorStop(1, 'rgba(180,20,20,' + dmgFlash * 0.6 + ')');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawOverlays() {
  if (state === 'over') {
    const a = clamp(overT / 0.5, 0, 1);
    ctx.fillStyle = 'rgba(8,6,8,' + 0.72 * a + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6b52';
    ctx.font = '700 52px Consolas, monospace';
    ctx.fillText('TERRORISTS WIN', W / 2, H / 2 - 40);
    ctx.fillStyle = '#c9d4dc';
    ctx.font = '600 18px Consolas, monospace';
    ctx.fillText('SCORE ' + score + '   \u00b7   BEST ' + best, W / 2, H / 2 + 6);
    ctx.fillStyle = 'rgba(201,212,220,0.75)';
    ctx.font = '600 14px Consolas, monospace';
    ctx.fillText('WAVE ' + wave + '   \u00b7   KILLS ' + kills, W / 2, H / 2 + 30);
    if (overT > 0.6) {
      ctx.fillStyle = 'rgba(220,230,238,0.7)';
      ctx.font = '600 14px Consolas, monospace';
      ctx.fillText('CLICK OR PRESS ENTER TO REDEPLOY', W / 2, H / 2 + 62);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
  if (paused) {
    ctx.fillStyle = 'rgba(6,10,13,0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e7eef3';
    ctx.font = '700 40px Consolas, monospace';
    ctx.fillText('PAUSED', W / 2, H / 2 - 6);
    ctx.fillStyle = 'rgba(220,230,238,0.7)';
    ctx.font = '600 14px Consolas, monospace';
    ctx.fillText('PRESS ESC TO RESUME', W / 2, H / 2 + 30);
    ctx.textAlign = 'left';
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0.1) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
  drawFloor();
  drawDecals();
  drawWalls();
  drawBullets();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawFloaters();
  ctx.restore();
  drawHUD();
  drawVignette();
  drawOverlays();
}

function setMouse(e) {
  const r = cv.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) * W) / r.width;
  mouse.y = ((e.clientY - r.top) * H) / r.height;
}

function onKeyDown(e) {
  initAudio();
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === '1') switchWeapon('ak');
  if (k === '2') switchWeapon('pistol');
  if (k === 'q') switchWeapon(player.weapon === 'ak' ? 'pistol' : 'ak');
  if (k === 'r') tryReload();
  if (k === 'escape' && state === 'play') {
    paused = !paused;
    mouse.down = false;
    player.triggerHeld = true;
  }
  if (k === 'enter' && state === 'over' && overT > 0.5) reset();
  if (k === ' ' || k.indexOf('arrow') === 0) e.preventDefault();
}

function onKeyUp(e) {
  keys[e.key.toLowerCase()] = false;
}

cv.addEventListener('mousemove', setMouse);
cv.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  initAudio();
  if (paused) return;
  setMouse(e);
  if (state === 'over') {
    if (overT > 0.5) reset();
    return;
  }
  player.triggerHeld = false;
  mouse.down = true;
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mouseup', () => { mouse.down = false; });
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', () => {
  for (const k in keys) delete keys[k];
  mouse.down = false;
});

reset();

window.Dustline = {
  reset,
  snapshot() {
    return {
      state,
      paused,
      score,
      kills,
      wave,
      hp: player.hp,
      weapon: player.weapon,
      ammo: player.slots[player.weapon].ammo,
      reserve: player.slots[player.weapon].reserve,
      slots: {
        ak: { ammo: player.slots.ak.ammo, reserve: player.slots.ak.reserve },
        pistol: { ammo: player.slots.pistol.ammo, reserve: player.slots.pistol.reserve }
      },
      best,
      reloading: player.reloading,
      player: { x: player.x, y: player.y, r: player.r },
      enemies: enemies.map((e) => ({ x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, r: e.r })),
      bullets: bullets.length,
      walls: walls.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }))
    };
  }
};

if (window.__DUSTLINE_TEST__) {
  window.Dustline.damage = damagePlayer;
  window.Dustline.wipeEnemies = () => {
    for (const e of enemies) if (!e.dead) killEnemy(e);
  };
}

let last = 0;

function frame(t) {
  const dt = last === 0 ? 0.016 : Math.min(0.033, (t - last) / 1000);
  last = t;
  if (!paused) update(dt);
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
