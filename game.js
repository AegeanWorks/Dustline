'use strict';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = 960;
const H = 600;
const TAU = Math.PI * 2;

const DPR = Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
if (DPR > 1) {
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
}

function canOffscreen() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function makeOffscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

function segHitsCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x0 + dx * t - cx;
  const py = y0 + dy * t - cy;
  return px * px + py * py <= r * r;
}

function segHitsRect(x0, y0, x1, y1, rc) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - rc.x, rc.x + rc.w - x0, y0 - rc.y, rc.y + rc.h - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
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

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const DEFAULT_SETTINGS = { volume: 70, shake: true, damageNumbers: true };
const SETTINGS_KEY = 'dustline.settings';
const SAVE_KEY = 'dustline.save';
const SAVE_VERSION = 2;

function readStore(key) {
  try {
    const raw = globalThis.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function writeStore(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    return;
  }
}


const HAZARDS = {
  quicksand: { name: 'QUICKSAND', color: 'rgba(150,120,70,0.20)', playerSpeed: 0.62 },
  ice: { name: 'BLACK ICE', color: 'rgba(190,225,255,0.20)', playerSpeed: 1.28, enemySpeed: 1.1 },
  embers: { name: 'EMBER VENTS', color: 'rgba(255,110,60,0.20)', burn: 5 },
  vines: { name: 'CHOKE VINES', color: 'rgba(80,140,70,0.22)', enemySpeed: 0.72 }
};

const MUTATORS = [
  { id: 'glass', name: 'GLASS CANNON', blurb: '+40% damage dealt, +60% taken', shard: 1.2, color: '#ff8a8a' },
  { id: 'swarm', name: 'SWARM', blurb: '+50% spawns, -15% mob health', shard: 1.25, color: '#c9a8ff' },
  { id: 'elite', name: 'ELITE HUNT', blurb: 'Triple champion rate', shard: 1.3, color: '#ffd27a' },
  { id: 'fog', name: 'FOG', blurb: 'Permanent reduced vision', shard: 1.25, color: '#9fd8ff' },
  { id: 'vampiric', name: 'VAMPIRIC HORDE', blurb: 'Enemies heal when they hit', shard: 1.3, color: '#ff7f8f' },
  { id: 'bounty', name: 'BOUNTY', blurb: 'Hunters every 45 seconds', shard: 1.35, color: '#e2563f' }
];

const MUTATOR_ORDER = ['glass', 'swarm', 'elite', 'fog', 'vampiric', 'bounty'];

const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'FIRST BLOOD', desc: 'Kill 1 enemy', goal: (s) => s.totalKills, target: 1, reward: 10 },
  { id: 'culler', name: 'CULLER', desc: 'Kill 250 enemies', goal: (s) => s.totalKills, target: 250, reward: 25 },
  { id: 'exterminator', name: 'EXTERMINATOR', desc: 'Kill 2,500 enemies', goal: (s) => s.totalKills, target: 2500, reward: 80 },
  { id: 'survivor', name: 'SURVIVOR', desc: 'Survive 5 minutes', goal: (s) => s.bestTime, target: 300, reward: 30 },
  { id: 'marathon', name: 'MARATHON', desc: 'Survive 10 minutes', goal: (s) => s.bestTime, target: 600, reward: 70 },
  { id: 'boss_slayer', name: 'BOSS SLAYER', desc: 'Kill 5 bosses', goal: (s) => s.bossKills, target: 5, reward: 40 },
  { id: 'mega_slayer', name: 'MEGA SLAYER', desc: 'Kill a mega boss', goal: (s) => s.megaKills || 0, target: 1, reward: 60 },
  { id: 'banker', name: 'BANKER', desc: 'Bank 500 shards', goal: (s) => s.bankedTotal || 0, target: 500, reward: 50 },
  { id: 'jackpot', name: 'JACKPOT', desc: 'Hit 100 critical data rolls', goal: (s) => s.jackpots || 0, target: 100, reward: 30 },
  { id: 'collector', name: 'COLLECTOR', desc: 'Open 25 supply caches', goal: (s) => s.chests || 0, target: 25, reward: 40 },
  { id: 'hunter', name: 'HUNTER KILLER', desc: 'Kill 10 NetWatch hunters', goal: (s) => s.hunters || 0, target: 10, reward: 45 },
  { id: 'contractor', name: 'CONTRACTOR', desc: 'Complete 20 contracts', goal: (s) => s.contracts || 0, target: 20, reward: 50 },
  { id: 'rush_first', name: 'FIRST CLEAR', desc: 'Clear Boss Rush', goal: (s) => s.rushClears || 0, target: 1, reward: 60 },
  { id: 'rush_speed', name: 'SPEEDRUNNER', desc: 'Clear Boss Rush under 90 seconds', goal: (s) => (s.rushBest > 0 && s.rushBest <= 90 ? 1 : 0), target: 1, reward: 90 },
  { id: 'relic_hoarder', name: 'RELIC HOARDER', desc: 'Hold 5 salvage relics at once', goal: (s) => s.relics || 0, target: 5, reward: 50 },
  { id: 'wyrm_slayer', name: 'WYRM SLAYER', desc: 'Kill a WYRM', goal: (s) => s.wyrmKills || 0, target: 1, reward: 70 },
  { id: 'shield_wall', name: 'SHIELD WALL', desc: 'Absorb 10 hits with the Aegis', goal: (s) => s.shieldSaves || 0, target: 10, reward: 45 },
  { id: 'full_loadout', name: 'FULL LOADOUT', desc: 'Fill every offense and defense slot', goal: (s) => s.slotsFull || 0, target: 1, reward: 55 },
  { id: 'daily_done', name: 'DAILY DRIVER', desc: 'Finish a daily challenge', goal: (s) => s.dailyDone || 0, target: 1, reward: 40 },
  { id: 'daily_win', name: 'DAILY ACE', desc: 'Win a daily challenge', goal: (s) => s.dailyWins || 0, target: 1, reward: 80 }
];

function achievementUnlocked() {
  return ACHIEVEMENTS.filter((a) => save.achievements && save.achievements[a.id]).length;
}

function achievementStats() {
  const live = G && screen === 'play';
  return {
    totalKills: save.totalKills + (live ? G.kills : 0),
    bestTime: Math.max(save.bestTime, live ? G.time : 0),
    bossKills: save.bossKills + (live ? G.bossKills || 0 : 0),
    megaKills: (save.megaKills || 0) + (live ? G.megaKills || 0 : 0),
    bankedTotal: (save.bankedTotal || 0) + (live ? Math.floor(G.banked) : 0),
    jackpots: (save.jackpots || 0) + (live ? G.stats.jackpots : 0),
    chests: (save.chests || 0) + (live ? G.stats.chests || 0 : 0),
    hunters: (save.hunters || 0) + (live ? G.stats.hunters : 0),
    contracts: (save.contracts || 0) + (live ? G.stats.contracts : 0),
    rushClears: (save.rushClears || 0) + (live && G.mode === 'bossrush' && G.rush && G.rush.index >= G.rush.target ? 1 : 0),
    rushBest: save.rushBest || 0,
    bestWave: Math.max(save.bestWave || 1, live ? G.wave : 0),
    shieldSaves: (save.shieldSaves || 0) + (live ? G.stats.shieldSaves || 0 : 0),
    wyrmKills: (save.killsByType.wyrm || 0) + (live ? G.killsByType.wyrm || 0 : 0),
    relics: live ? G.relics.length : 0,
    slotsFull:
      live && slotsUsed('offense') >= slotCap('offense') && slotsUsed('passive') >= slotCap('passive') ? 1 : 0,
    dailyDone: Object.keys(save.dailyBest || {}).length + (live && G.daily != null ? 1 : 0),
    dailyWins:
      Object.keys(save.dailyBest || {}).filter((day) => save.dailyBest[day].win).length +
      (live && G.daily != null && G.victory ? 1 : 0)
  };
}

function checkAchievements() {
  let earned = 0;
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    if (a.goal(achievementStats()) >= a.target) {
      save.achievements[a.id] = true;
      save.shards += a.reward;
      earned++;
      if (G && screen === 'play') {
        G.banner = 'ACHIEVEMENT · ' + a.name;
        G.bannerSub = '+' + a.reward + ' SHARDS';
        G.bannerT = 2.4;
        G.news = 'Achievement unlocked: ' + a.name + '.';
        sfx.victory();
      }
    }
  }
  if (earned > 0) writeStore(SAVE_KEY, save);
  return earned;
}

function mutatorDef(id) {
  return MUTATORS.find((m) => m.id === id) || null;
}

function hasMutator(id) {
  return !!(G && G.mutators && G.mutators.indexOf(id) >= 0);
}

function mutatorShardMult() {
  if (!G || !G.mutators) return 1;
  return G.mutators.reduce((mult, id) => {
    const def = mutatorDef(id);
    return mult * (def ? def.shard : 1);
  }, 1);
}

const META_ORDER = ['power', 'armor', 'speed', 'greed', 'magnet', 'luck', 'rig'];
const META = {
  power: { name: 'BALLISTICS', desc: '+6% damage per rank', max: 5, cost: (n) => 60 + 45 * n },
  armor: { name: 'PLATE CARRIER', desc: '+10 max health per rank', max: 5, cost: (n) => 60 + 45 * n },
  speed: { name: 'RUNNING SHOES', desc: '+4% move speed per rank', max: 5, cost: (n) => 55 + 40 * n },
  greed: { name: 'SCAVENGER KIT', desc: '+10% XP per rank', max: 5, cost: (n) => 70 + 50 * n },
  magnet: { name: 'POWER MAGNET', desc: '+12 pickup radius per rank', max: 5, cost: (n) => 50 + 35 * n },
  luck: { name: 'LOADED DICE', desc: '+1 reroll and better drops', max: 3, cost: (n) => 110 + 70 * n },
  rig: { name: 'LOADOUT RIG', desc: '+1 offense and defense slot per rank', max: 2, cost: (n) => 150 + 100 * n }
};

const SLOT_BASE = 6;

function defaultSave() {
  return {
    v: SAVE_VERSION,
    shards: 0,
    totalKills: 0,
    runs: 0,
    wins: 0,
    bestTime: 0,
    bestKills: 0,
    bossKills: 0,
    damageDealt: 0,
    jackpots: 0,
    nearMisses: 0,
    hunters: 0,
    contracts: 0,
    bankedTotal: 0,
    lostTotal: 0,
    champions: 0,
    chests: 0,
    megaKills: 0,
    rushClears: 0,
    rushBest: 0,
    bestWave: 1,
    shieldSaves: 0,
    dailyBest: {},
    achievements: {},
    lastSeed: 20261029,
    killsByType: {},
    meta: { power: 0, armor: 0, speed: 0, greed: 0, magnet: 0, luck: 0, rig: 0 },
    unlocked: { weapons: ['ak'], maps: ['desert'] }
  };
}

function loadSave() {
  const raw = readStore(SAVE_KEY);
  if (!raw || typeof raw !== 'object') return defaultSave();
  if (raw.v !== 1 && raw.v !== SAVE_VERSION) return defaultSave();
  const fresh = defaultSave();
  if (raw.v === 1) {
    fresh.bestTime = Number(raw.bestTime) || 0;
    fresh.bestKills = Number(raw.bestKills) || 0;
    fresh.totalKills = Number(raw.totalKills) || 0;
    fresh.shards = Number(raw.shards) || 0;
  }
  const merged = Object.assign(fresh, raw);
  merged.v = SAVE_VERSION;
  merged.meta = Object.assign({ power: 0, armor: 0, speed: 0, greed: 0, magnet: 0, luck: 0 }, raw.meta || {});
  for (const key of META_ORDER) {
    merged.meta[key] = clamp(Math.round(Number(merged.meta[key]) || 0), 0, META[key].max);
  }
  merged.killsByType = Object.assign({}, raw.killsByType || {});
  merged.achievements = Object.assign({}, raw.achievements || {});
  merged.unlocked = Object.assign({ weapons: ['ak'], maps: ['desert'] }, raw.unlocked || {});
  for (const key of ['shards', 'totalKills', 'runs', 'wins', 'bossKills', 'damageDealt', 'jackpots', 'nearMisses', 'hunters', 'contracts', 'bankedTotal', 'lostTotal', 'champions', 'chests', 'megaKills', 'rushClears', 'shieldSaves']) {
    merged[key] = Math.max(0, Math.round(Number(merged[key]) || 0));
  }
  for (const key of ['bestTime', 'bestKills', 'rushBest']) merged[key] = Math.max(0, Number(merged[key]) || 0);
  merged.bestWave = Math.max(1, Math.round(Number(merged.bestWave) || 1));
  merged.lastSeed = (Number(merged.lastSeed) >>> 0) || 20261029;
  const cleanBest = {};
  if (merged.dailyBest && typeof merged.dailyBest === 'object') {
    const days = Object.keys(merged.dailyBest)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a)
      .slice(0, 30);
    for (const day of days) {
      const e = merged.dailyBest[day] || merged.dailyBest[String(day)];
      if (!e || typeof e !== 'object') continue;
      cleanBest[day] = {
        win: !!e.win,
        kills: Math.max(0, Math.round(Number(e.kills) || 0)),
        time: Math.max(0, Number(e.time) || 0)
      };
    }
  }
  merged.dailyBest = cleanBest;
  return merged;
}

function loadSettings() {
  const raw = readStore(SETTINGS_KEY);
  const merged = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    if (Number.isFinite(raw.volume)) merged.volume = clamp(Math.round(raw.volume), 0, 100);
    if (typeof raw.shake === 'boolean') merged.shake = raw.shake;
    if (typeof raw.damageNumbers === 'boolean') merged.damageNumbers = raw.damageNumbers;
  }
  return merged;
}

let settings = loadSettings();
let save = loadSave();
let best = { time: save.bestTime, kills: save.bestKills };
let screen = 'menu';
let settingsReturn = 'menu';
let upgradesReturn = 'menu';
let statsReturn = 'menu';
let mapReturn = 'paused';
let manualTab = 'enemies';
let dailyOverride = null;
let uiButtons = [];
let uiT = 0;

const keys = Object.create(null);
const mouse = { x: W / 2, y: H / 2 };

let G = null;
let shake = 0;
checkAchievements();

let ac = null;
let noiseBuf = null;
let master = null;

function initAudio() {
  if (!ac) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      const len = Math.floor(ac.sampleRate * 0.5);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      master = ac.createGain();
      master.gain.value = settings.volume / 100;
      master.connect(ac.destination);
    } catch (err) {
      ac = null;
      master = null;
      return;
    }
  }
  if (ac.state === 'suspended') ac.resume();
  if (master) master.gain.value = settings.volume / 100;
}

function out() {
  return master || (ac ? ac.destination : null);
}

function env(gain, t, amount, dur) {
  gain.gain.setValueAtTime(Math.max(0.0001, amount), t);
  gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
}

function noiseShot(amount, dur, freq, q) {
  if (!ac || noiseBuf === null) return;
  if (settings.volume <= 0) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rnd(0.92, 1.08);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ac.createGain();
  env(g, t, amount, dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(out());
  src.start(t, rnd(0, 0.2));
  src.stop(t + dur + 0.02);
}

function noiseSweep(amount, dur, f0, f1, type) {
  if (!ac || noiseBuf === null) return;
  if (settings.volume <= 0) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rnd(0.9, 1.1);
  const f = ac.createBiquadFilter();
  f.type = type || 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  f.Q.value = 1.2;
  const g = ac.createGain();
  env(g, t, amount, dur);
  src.connect(f);
  f.connect(g);
  g.connect(out());
  src.start(t, rnd(0, 0.2));
  src.stop(t + dur + 0.02);
}

function tone(type, f0, f1, amount, dur) {
  if (!ac) return;
  if (settings.volume <= 0) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ac.createGain();
  env(g, t, amount, dur);
  o.connect(g);
  g.connect(out());
  o.start(t);
  o.stop(t + dur + 0.02);
}

function pad(notes, amount, dur, step) {
  notes.forEach((freq, i) => {
    const t = ac ? ac.currentTime + i * (step || 0.07) : 0;
    if (!ac) return;
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amount), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(out());
    o.start(t);
    o.stop(t + dur + 0.02);
  });
}

const sfx = {
  rifle() {
    noiseShot(0.16, 0.045, 2400, 0.7);
    noiseSweep(0.1, 0.09, 1800, 260, 'lowpass');
    tone('square', 140, 55, 0.07, 0.06);
  },
  smg() { noiseShot(0.11, 0.035, 2800, 0.9); tone('square', 190, 90, 0.04, 0.04); },
  rail() { noiseSweep(0.12, 0.22, 2400, 300, 'bandpass'); tone('sawtooth', 1200, 120, 0.08, 0.22); noiseShot(0.06, 0.3, 900, 0.4); },
  dmr() {
    noiseShot(0.22, 0.09, 1500, 0.5);
    noiseSweep(0.16, 0.16, 1200, 140, 'lowpass');
    tone('square', 110, 40, 0.11, 0.12);
  },
  shotgun() {
    noiseShot(0.24, 0.13, 1000, 0.5);
    noiseSweep(0.2, 0.2, 900, 90, 'lowpass');
    tone('square', 95, 34, 0.12, 0.14);
  },
  soldier() { noiseShot(0.06, 0.04, 2400, 1.1); tone('square', 240, 120, 0.03, 0.04); },
  enemyShot() { noiseSweep(0.1, 0.12, 1400, 320, 'bandpass'); tone('sawtooth', 300, 120, 0.03, 0.08); },
  spit() { noiseSweep(0.09, 0.16, 700, 220, 'lowpass'); },
  screech() { tone('sawtooth', 1400, 900, 0.05, 0.22); tone('square', 1900, 1200, 0.03, 0.18); },
  chest() { pad([660, 880, 1174], 0.08, 0.3, 0.06); noiseShot(0.1, 0.12, 1600, 0.8); },
  bossRoar() { tone('sawtooth', 120, 45, 0.16, 0.7); noiseSweep(0.16, 0.7, 500, 70, 'lowpass'); },
  throwBomb() { tone('sine', 420, 180, 0.05, 0.16); },
  hit() { tone('triangle', 850, 320, 0.045, 0.035); },
  crit() { tone('square', 1400, 900, 0.05, 0.05); tone('sine', 2100, 1500, 0.03, 0.06); },
  kill(streak) {
    const step = Math.min(6, streak || 0);
    noiseShot(0.09, 0.1, 520, 0.7);
    tone('sawtooth', 210, 70, 0.055, 0.14);
    if (step > 0) tone('sine', 620 + step * 90, 900 + step * 120, 0.035, 0.1);
  },
  combo(streak) {
    const base = 500 + Math.min(10, streak) * 70;
    pad([base, base * 1.26, base * 1.5], 0.05, 0.16, 0.05);
  },
  hurt() { noiseShot(0.13, 0.16, 340, 0.6); tone('sawtooth', 150, 65, 0.07, 0.18); },
  heartbeat() { tone('sine', 70, 46, 0.1, 0.18); },
  boom() {
    noiseSweep(0.34, 0.4, 700, 55, 'lowpass');
    noiseShot(0.2, 0.3, 180, 0.4);
    tone('sawtooth', 95, 26, 0.18, 0.42);
  },
  pick(streak) {
    const f = 780 + Math.min(14, streak || 0) * 55;
    tone('sine', f, f * 1.5, 0.05, 0.08);
  },
  heal() { pad([520, 660, 780], 0.07, 0.2, 0.05); },
  level() { pad([523, 659, 784, 1046], 0.09, 0.28, 0.07); },
  upgrade() { pad([392, 587, 784], 0.08, 0.24, 0.06); },
  wave() { pad([330, 440, 587], 0.07, 0.3, 0.1); },
  click() { tone('square', 660, 520, 0.03, 0.03); },
  swap() { tone('square', 500, 340, 0.03, 0.03); },
  denied() { tone('square', 200, 140, 0.04, 0.09); },
  victory() { pad([523, 659, 784, 1046, 1318], 0.1, 0.5, 0.11); },
  over() { tone('sawtooth', 220, 55, 0.12, 0.9); noiseSweep(0.18, 0.6, 420, 60, 'lowpass'); }
};

const SKILL_ORDER = [
  'rifle', 'smg', 'shotgun', 'dmr', 'rail', 'blades', 'grenade', 'turret', 'aura',
  'squad', 'speed', 'vitality', 'aegis', 'magnet', 'damage',
  'bulletSpeed', 'lifesteal', 'dashPower', 'crit'
];

const SKILLS = {
  rifle: {
    name: 'AK-47',
    short: 'AK',
    max: 5,
    kind: 'weapon',
    desc: 'Workhorse auto rifle with steady damage.',
    color: '#ffd27a'
  },
  smg: {
    name: 'SMG-45',
    short: 'SMG',
    max: 5,
    kind: 'weapon',
    desc: 'Very fast, low-damage spray.',
    color: '#ffcf5c'
  },
  shotgun: {
    name: 'SPAS-12',
    short: 'SG',
    max: 5,
    kind: 'weapon',
    desc: 'Point-blank pellet spread.',
    color: '#ffb066'
  },
  dmr: {
    name: 'DMR-308',
    short: 'DMR',
    max: 5,
    kind: 'weapon',
    desc: 'Slow, heavy, shots pierce the line.',
    color: '#ffeab0'
  },
  rail: {
    name: 'RAILGUN',
    short: 'RG',
    max: 5,
    kind: 'weapon',
    desc: 'Slow charge, punches through whole lines.',
    color: '#9fe8ff'
  },
  blades: {
    name: 'Bayonet Blades',
    short: 'BL',
    max: 5,
    kind: 'active',
    desc: 'Orbiting knives shred nearby enemies.',
    color: '#c9d8ff'
  },
  grenade: {
    name: 'Frag Grenade',
    short: 'FR',
    max: 5,
    kind: 'active',
    desc: 'Lobs explosives into the horde.',
    color: '#ff8a5c'
  },
  turret: {
    name: 'Sentry Turret',
    short: 'TR',
    max: 5,
    kind: 'active',
    desc: 'Deploys a gun that fires on its own.',
    color: '#b8c6d0'
  },
  aura: {
    name: 'Ember Aura',
    short: 'AU',
    max: 5,
    kind: 'active',
    desc: 'Burns every enemy close to you.',
    color: '#ff9f6a'
  },
  squad: {
    name: 'Recruit Soldier',
    short: 'SQ',
    max: 5,
    kind: 'active',
    desc: 'A squadmate joins and fires for you.',
    color: '#7fd0ff'
  },
  speed: {
    name: 'Combat Boots',
    short: 'SP',
    max: 5,
    kind: 'passive',
    desc: '+8% movement speed per level.',
    color: '#9be59b'
  },
  vitality: {
    name: 'Body Armor',
    short: 'HP',
    max: 5,
    kind: 'passive',
    desc: '+25 max health and heals 25.',
    color: '#7fe0a0'
  },
  aegis: {
    name: 'Aegis Field',
    short: 'AEG',
    max: 5,
    kind: 'passive',
    desc: 'Regenerating shield blocks one hit per charge.',
    color: '#9fd8ff'
  },
  magnet: {
    name: 'Field Magnet',
    short: 'MG',
    max: 5,
    kind: 'passive',
    desc: '+45 pickup radius per level.',
    color: '#9fe8e0'
  },
  damage: {
    name: 'Hollow Points',
    short: 'DMG',
    max: 5,
    kind: 'passive',
    desc: '+12% damage from every source.',
    color: '#ff9f9f'
  },
  bulletSpeed: {
    name: 'Match Ammo',
    short: 'VEL',
    max: 5,
    kind: 'passive',
    desc: '+10% bullet speed and range.',
    color: '#ffe08a'
  },
  lifesteal: {
    name: 'Blood Leech',
    short: 'LS',
    max: 5,
    kind: 'passive',
    desc: 'Heal on kill for a share of damage.',
    color: '#ff7f8f'
  },
  dashPower: {
    name: 'Shock Boots',
    short: 'DSH',
    max: 5,
    kind: 'passive',
    desc: 'Dash crushes enemies it passes through.',
    color: '#9fd8ff'
  },
  crit: {
    name: 'Killer Instinct',
    short: 'CRT',
    max: 5,
    kind: 'passive',
    desc: '+7% critical chance for double damage.',
    color: '#ff8ad8'
  }
};

const COMBOS = [
  {
    id: 'overclocked',
    name: 'OVERCLOCKED',
    needs: ['rifle', 'bulletSpeed'],
    desc: '+20% fire rate',
    color: '#ffe08a'
  },
  {
    id: 'riposte',
    name: 'RIPOSTE',
    needs: ['blades', 'dashPower'],
    desc: 'Dash blades cut twice as deep',
    color: '#c9d8ff'
  },
  {
    id: 'vampire',
    name: 'VAMPIRE',
    needs: ['lifesteal', 'vitality'],
    desc: 'Leech heals twice as much',
    color: '#ff7f8f'
  },
  {
    id: 'shrapnel',
    name: 'SHRAPNEL',
    needs: ['shotgun', 'crit'],
    desc: 'Pellets crit for triple damage',
    color: '#ffb066'
  },
  {
    id: 'demolition',
    name: 'DEMOLITION',
    needs: ['grenade', 'damage'],
    desc: '+35% blast radius',
    color: '#ff8a5c'
  },
  {
    id: 'scavenger',
    name: 'SCAVENGER',
    needs: ['magnet', 'speed'],
    desc: 'Pickups are worth +1 XP',
    color: '#9be59b'
  },
  {
    id: 'bastion',
    name: 'BASTION',
    needs: ['aegis', 'vitality'],
    desc: 'Shield recharges 40% faster',
    color: '#9fd8ff'
  }
];

const RELICS = [
  { id: 'chrono', name: 'CHRONO COIL', desc: '+15% fire rate', color: '#9fd8ff' },
  { id: 'voidlens', name: 'VOID LENS', desc: '+10% critical chance', color: '#ff8ad8' },
  { id: 'overclock', name: 'OVERCLOCK CORE', desc: '+25% bullet speed', color: '#ffe08a' },
  { id: 'volatile', name: 'VOLATILE ROUNDS', desc: '+30% explosion radius', color: '#ff8a5c' },
  { id: 'warhead', name: 'WARHEAD CASING', desc: 'Bigger, stronger bombs', color: '#ffb066' },
  { id: 'bloodstone', name: 'BLOODSTONE', desc: '+3% lifesteal on damage', color: '#ff7f8f' },
  { id: 'aegiscore', name: 'AEGIS CORE', desc: '+1 shield charge', color: '#9fd8ff' },
  { id: 'lodestone', name: 'LODESTONE', desc: '+60 pickup radius', color: '#9fe8e0' },
  { id: 'thornhide', name: 'THORNHIDE', desc: 'Reflect contact damage', color: '#8a9b3a' },
  { id: 'greedengine', name: 'GREED ENGINE', desc: '+20% shard gain', color: '#63dcc0' }
];

const ENEMY_TIPS = {
  grunt: 'Slow pack filler. Kite it in circles.',
  runner: 'Fast straggler that dies to anything.',
  tank: 'Armored bruiser; slow but very tough.',
  marksman: 'Shoots from range. Break line of sight.',
  spitter: 'Acid shots, then retreats. Close the gap.',
  bomber: 'Runs in and detonates. Kill it early.',
  swarm: 'Tiny and quick, arrives in numbers.',
  warden: 'Plating resists hits. Crits cut through.',
  weaver: 'Blinks toward you.',
  splitter: 'Splits into two swarmlings when it dies.',
  leech: 'Drains health and steals shards.',
  shielder: 'Shields nearby allies. Kill it first.',
  tunneler: 'Burrows, then erupts next to you.',
  screamer: 'Enrages every mob nearby.',
  phantom: 'Phases out and ignores damage.',
  mortar: 'Lobs shells from range. Keep moving.',
  widower: 'Web bolts slow you. Dodge them.',
  husk: 'Dies into acid that burns everyone.',
  hunter: 'Elite NetWatch killer; pays big shards.'
};

const BOSS_TIPS = {
  warlord: 'Charges then fans fire. Sidestep the charge.',
  overseer: 'Bullet spray; enrages below half health.',
  bombardier: 'Lobs bombs. Watch the target reticles.',
  hive: 'Fires bullet rings and spawns broods.',
  sentinel: 'Telegraphs a lance beam. Leave the line.',
  colossus: 'Three phases of radial barrages and summons.',
  leviathan: 'Three phases of charges plus broad sprays.',
  wyrm: 'Burrows untargetable, erupts and spawns husks.'
};

const WEAPONS = {
  ak: { name: 'AK-47', skill: 'rifle', blurb: 'Balanced auto rifle', color: '#ffd27a' },
  smg: { name: 'SMG-45', skill: 'smg', blurb: 'Fast and frantic', color: '#ffcf5c' },
  spas: { name: 'SPAS-12', skill: 'shotgun', blurb: 'Close-range shredder', color: '#ffb066' },
  dmr: { name: 'DMR-308', skill: 'dmr', blurb: 'Piercing precision', color: '#ffeab0' },
  rail: { name: 'RAILGUN', skill: 'rail', blurb: 'Punches through lines', color: '#9fe8ff' }
};

const WEAPON_ORDER = ['ak', 'smg', 'spas', 'dmr', 'rail'];

const MAPS = {
  desert: {
    name: 'DUST BASIN',
    blurb: 'Open sand and stone',
    sky: ['#b19b74', '#ab9570', '#a6916c'],
    accent: '#d8b877',
    hazard: 'quicksand',
    props: { building: '#8a7250', rock: '#8d8375', tree: '#6d7a45' }
  },
  frost: {
    name: 'WHITEOUT RIDGE',
    blurb: 'Frozen huts, pines',
    sky: ['#c3ced9', '#bcc8d4', '#b4c1ce'],
    accent: '#9fd8ff',
    hazard: 'ice',
    props: { building: '#7a8492', rock: '#9aa6b2', tree: '#3f5a4a' }
  },
  ash: {
    name: 'ASHFALL',
    blurb: 'Burnt ruins, basalt',
    sky: ['#5a4a44', '#54453f', '#4e403a'],
    accent: '#ff8a5c',
    hazard: 'embers',
    props: { building: '#3d302c', rock: '#46403c', tree: '#2f2a26' }
  },
  jungle: {
    name: 'GREENFALL',
    blurb: 'Temples and palms',
    sky: ['#7f8f5e', '#798a59', '#728354'],
    accent: '#9be59b',
    hazard: 'vines',
    props: { building: '#7d7a5c', rock: '#6d6b5a', tree: '#3f6b3a' }
  }
};

const MAP_ORDER = ['desert', 'frost', 'ash', 'jungle'];

const TIME_LIMITS = [
  { id: 'endless', label: 'ENDLESS', sec: 0 },
  { id: '5', label: '5 MIN', sec: 300 },
  { id: '10', label: '10 MIN', sec: 600 },
  { id: '15', label: '15 MIN', sec: 900 }
];

const DIFFICULTIES = [
  { id: 'normal', name: 'NORMAL', blurb: 'The intended fight', spawn: 1, hp: 1, dmg: 1, shard: 1, color: '#7fe0a0' },
  { id: 'brutal', name: 'BRUTAL', blurb: 'More, tougher, hits harder', spawn: 1.25, hp: 1.4, dmg: 1.25, shard: 1.35, color: '#ffcf5c' },
  { id: 'nightmare', name: 'NIGHTMARE', blurb: 'For the reckless', spawn: 1.5, hp: 1.9, dmg: 1.5, shard: 1.8, color: '#e2563f' }
];

const DIFFICULTY_ORDER = ['normal', 'brutal', 'nightmare'];

const EVOLUTIONS = {
  rifle: { id: 'ripper', name: 'RIPPER', needs: 'bulletSpeed', desc: 'Triple-shot spread, +60% damage' },
  smg: { id: 'storm', name: 'STORM', needs: 'crit', desc: 'Twin-linked shots, +10% crit' },
  shotgun: { id: 'breaker', name: 'BREAKER', needs: 'damage', desc: '+4 pellets, piercing shells' },
  dmr: { id: 'reaper', name: 'REAPER', needs: 'lifesteal', desc: '+3 pierce, +30% damage, double leech' },
  rail: { id: 'lancer', name: 'LANCER', needs: 'bulletSpeed', desc: 'Infinite pierce, +40% damage, faster' },
  blades: { id: 'tempest', name: 'TEMPEST', needs: 'dashPower', desc: '+2 blades, +50% spin and damage' },
  grenade: { id: 'cluster', name: 'CLUSTER', needs: 'damage', desc: 'Twin grenades, +30% blast' },
  turret: { id: 'overwatch', name: 'OVERWATCH', needs: 'crit', desc: 'Third turret, +30% fire rate and life' },
  aura: { id: 'crown', name: 'SOLAR CROWN', needs: 'vitality', desc: '+35% radius, pulses 60% faster' }
};

const BOSS_AFFIXES = [
  { id: 'frenzied', name: 'FRENZIED', color: '#ffcf5c', speed: 1.3 },
  { id: 'shielded', name: 'SHIELDED', color: '#9fd8ff' },
  { id: 'volatile', name: 'VOLATILE', color: '#ff8a5c' }
];

const CHAMPION_AFFIXES = [
  { id: 'volatile', name: 'VOLATILE', color: '#ff8a5c', desc: 'explodes on death' },
  { id: 'shielded', name: 'SHIELDED', color: '#9fd8ff', desc: 'takes 30% less damage' },
  { id: 'swift', name: 'SWIFT', color: '#7fe0a0', desc: 'moves and strikes faster' }
];

const ENEMY_TYPES = {
  grunt: { hp: 26, speed: 50, r: 14, touch: 9, xp: 1, color: '#7d9a4f', dark: '#39461f', name: 'Crawler' },
  runner: { hp: 16, speed: 110, r: 11, touch: 7, xp: 1, color: '#c2704a', dark: '#4a2a1a', name: 'Stalker' },
  tank: { hp: 130, speed: 30, r: 23, touch: 18, xp: 5, color: '#4f5d3a', dark: '#222a19', name: 'Bulwark' },
  marksman: { hp: 38, speed: 48, r: 13, touch: 6, xp: 3, color: '#6b5b8f', dark: '#2c2440', name: 'Hexer' },
  spitter: { hp: 42, speed: 42, r: 14, touch: 8, xp: 3, color: '#8a9b3a', dark: '#3d4416', name: 'Spitter' },
  bomber: { hp: 60, speed: 62, r: 17, touch: 10, xp: 4, color: '#a34b3b', dark: '#48211b', name: 'Bomber' },
  swarm: { hp: 11, speed: 120, r: 8, touch: 4, xp: 1, color: '#96a86a', dark: '#414a2b', name: 'Swarmling' },
  warden: { hp: 165, speed: 34, r: 22, touch: 16, xp: 6, color: '#5b6f7a', dark: '#22303a', name: 'Warden', guard: true },
  weaver: { hp: 34, speed: 74, r: 12, touch: 8, xp: 3, color: '#7a5b9e', dark: '#2f2340', name: 'Weaver', blink: true },
  splitter: { hp: 70, speed: 46, r: 18, touch: 11, xp: 3, color: '#8a6a3a', dark: '#3a2a14', name: 'Splitter', split: true },
  leech: { hp: 46, speed: 58, r: 13, touch: 5, xp: 3, color: '#7a2f3a', dark: '#3a1218', name: 'Leech', drain: true },
  shielder: { hp: 110, speed: 38, r: 17, touch: 12, xp: 6, color: '#4f7a8a', dark: '#1d333d', name: 'Shielder', aura: true },
  tunneler: { hp: 85, speed: 62, r: 15, touch: 14, xp: 5, color: '#6a5a3a', dark: '#2a2214', name: 'Tunneler', burrow: true },
  screamer: { hp: 65, speed: 44, r: 15, touch: 9, xp: 4, color: '#8a4a6a', dark: '#3a1a2a', name: 'Screamer', scream: true },
  phantom: { hp: 70, speed: 78, r: 13, touch: 12, xp: 5, color: '#5a7a8a', dark: '#20303a', name: 'Phantom', ghost: true },
  mortar: { hp: 90, speed: 34, r: 16, touch: 8, xp: 6, color: '#8a7a5a', dark: '#3a3222', name: 'Mortar', artillery: true },
  widower: { hp: 95, speed: 56, r: 16, touch: 8, xp: 6, color: '#6a5a8a', dark: '#2a2240', name: 'Widower', web: true },
  husk: { hp: 55, speed: 68, r: 14, touch: 7, xp: 3, color: '#7a8a4a', dark: '#2f3a1a', name: 'Husk', acid: true },
  hunter: { hp: 240, speed: 98, r: 18, touch: 14, xp: 14, color: '#c23a4a', dark: '#3a0d13', name: 'HUNTER', elite: true }
};

const BOSS_TYPES = {
  warlord: { hp: 780, speed: 34, r: 36, touch: 30, xp: 45, color: '#8a2f2f', dark: '#3a0f12', name: 'WARLORD', style: 'charge' },
  overseer: { hp: 700, speed: 30, r: 33, touch: 24, xp: 45, color: '#5d3f8a', dark: '#241733', name: 'OVERSEER', style: 'spray' },
  bombardier: { hp: 840, speed: 26, r: 38, touch: 26, xp: 50, color: '#8a5a2f', dark: '#3a2410', name: 'BOMBARDIER', style: 'bomb' },
  hive: { hp: 900, speed: 20, r: 40, touch: 24, xp: 55, color: '#5f8a3a', dark: '#23340f', name: 'HIVE', style: 'hive' },
  sentinel: { hp: 820, speed: 28, r: 34, touch: 22, xp: 55, color: '#4a6a8a', dark: '#17273a', name: 'SENTINEL', style: 'beam' },
  colossus: {
    hp: 2100, speed: 24, r: 54, touch: 36, xp: 170, color: '#3f4f6a', dark: '#141c28',
    name: 'COLOSSUS', style: 'mega', mega: true
  },
  leviathan: {
    hp: 2400, speed: 27, r: 58, touch: 38, xp: 190, color: '#5a2f4f', dark: '#241020',
    name: 'LEVIATHAN', style: 'mega2', mega: true
  },
  wyrm: {
    hp: 2600, speed: 30, r: 52, touch: 34, xp: 200, color: '#7a5a3a', dark: '#2e2114',
    name: 'WYRM', style: 'wyrm', mega: true
  }
};

const BOSS_ORDER = ['warlord', 'overseer', 'bombardier', 'hive', 'sentinel'];
const MEGA_ORDER = ['colossus', 'leviathan', 'wyrm'];
const RUSH_ORDER = BOSS_ORDER.concat(MEGA_ORDER);
const RUSH_TARGET = 8;
const MODES = [
  { id: 'survivors', name: 'SURVIVORS', blurb: 'Endless horde waves' },
  { id: 'bossrush', name: 'BOSS RUSH', blurb: 'Eight bosses, no waves' }
];

const OPERATORS = [
  { id: 'ranger', name: 'RANGER', blurb: 'Balanced baseline', color: '#9be59b' },
  { id: 'vanguard', name: 'VANGUARD', blurb: '+30 HP · -10% damage taken', color: '#7fe0a0' },
  { id: 'marksman', name: 'MARKSMAN', blurb: '+15% velocity · +8% crit', color: '#ffe08a' },
  { id: 'engineer', name: 'ENGINEER', blurb: 'Turrets +60% life · aura +15%', color: '#b8c6d0' },
  { id: 'scavenger', name: 'SCAVENGER', blurb: '+20% shards · 4 relic picks', color: '#63dcc0' }
];

const OPERATOR_ORDER = ['ranger', 'vanguard', 'marksman', 'engineer', 'scavenger'];
const BOSS_EVERY = 5;
const MEGA_EVERY_BOSSES = 4;

const CHIPS = {
  shards: { name: 'DATA SHARD', color: '#63dcc0', desc: '+6 unbanked' },
  aegis: { name: 'AEGIS', color: '#9fd8ff', desc: '4s shield' },
  frenzy: { name: 'FRENZY', color: '#ffcf5c', desc: '6s rapid fire' },
  bomb: { name: 'ORDNANCE', color: '#ff8a5c', desc: 'bomb refill' },
  repair: { name: 'NANITE REPAIR', color: '#7fe0a0', desc: '+25 HP' }
};

const EVENTS = [
  { id: 'surge', name: 'HORDE SURGE', news: 'Mass migration detected on the basin floor' },
  { id: 'supply', name: 'SUPPLY DROP', news: 'Airdrop inbound: medkits and tech' },
  { id: 'sandstorm', name: 'SANDSTORM', news: 'Visibility collapsing, hostiles closing' },
  { id: 'blackout', name: 'BLACKOUT', news: 'Grid offline: optics degraded' },
  { id: 'bounty', name: 'BOUNTY', news: 'NetWatch hunter deployed to your sector' }
];

const CONTRACTS = [
  { id: 'cull', name: 'CULL THE HORDE', target: 45, reward: 12, goal: (g) => g.kills },
  { id: 'boss', name: 'BOSS HUNTER', target: 1, reward: 22, goal: (g) => g.bossKills || 0 },
  { id: 'survive', name: 'HOLD THE LINE', target: 120, reward: 14, goal: (g) => Math.floor(g.time) },
  { id: 'gems', name: 'DATA RECOVERY', target: 35, reward: 10, goal: (g) => g.stats.gems },
  { id: 'bomb', name: 'DEMOLITION', target: 4, reward: 12, goal: (g) => g.stats.bombs },
  { id: 'chip', name: 'TECH SALVAGE', target: 3, reward: 14, goal: (g) => g.stats.chips },
  { id: 'dash', name: 'EVASION', target: 12, reward: 10, goal: (g) => g.stats.dashes },
  { id: 'streak', name: 'CHAIN KILLER', target: 35, reward: 16, goal: (g) => g.bestStreak }
];

function srnd() {
  G.rng = (Math.imul(G.rng, 1664525) + 1013904223) >>> 0;
  return G.rng / 4294967296;
}

function pickContracts() {
  const pool = CONTRACTS.slice();
  const picks = [];
  while (picks.length < 3 && pool.length > 0) {
    const i = Math.floor(srnd() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks.map((c) => ({ id: c.id, name: c.name, target: c.target, reward: c.reward, done: false }));
}

const FORMATION = [
  [-34, 30],
  [34, 30],
  [-58, 2],
  [58, 2],
  [0, 56]
];

function levelNeed(level) {
  return Math.round(6 + 6 * level);
}

function metaRank(id) {
  return save.meta[id] || 0;
}

function operatorDef() {
  const id = (G && G.operator) || (setup && setup.operator) || 'ranger';
  return OPERATORS.find((o) => o.id === id) || OPERATORS[0];
}

function operatorDefName() {
  const op = OPERATORS.find((o) => o.id === setup.operator);
  return op ? op.name : OPERATORS[0].name;
}

const DAY_MS = 86400000;
const DAILY_DIFFS = ['normal', 'brutal', 'nightmare'];

function dailyDay() {
  if (dailyOverride !== null) return dailyOverride;
  return Math.floor(Date.now() / DAY_MS);
}

function dailyRules(day) {
  const d = Number(day) || 0;
  const mode = d % 3 === 2 ? 'bossrush' : 'survivors';
  return {
    day: d,
    seed: (Math.imul(d, 2654435761) >>> 0) || 20261029,
    operator: OPERATOR_ORDER[d % OPERATOR_ORDER.length],
    weapon: WEAPON_ORDER[(d + 2) % WEAPON_ORDER.length],
    map: MAP_ORDER[d % MAP_ORDER.length],
    difficulty: DAILY_DIFFS[d % DAILY_DIFFS.length],
    mode,
    mutators: mode === 'survivors' ? [MUTATOR_ORDER[(d * 7) % MUTATOR_ORDER.length]] : []
  };
}

function dailyInfo() {
  const rules = dailyRules(dailyDay());
  const best = (save.dailyBest && save.dailyBest[rules.day]) || null;
  return { rules, best, active: !!(G && G.daily === rules.day) };
}

function isOperator(id) {
  return !!(G && G.operator === id);
}

function baseMaxHp() {
  return 100 + 10 * metaRank('armor') + (isOperator('vanguard') ? 30 : 0);
}

function skillGroup(id) {
  return SKILLS[id].kind === 'passive' ? 'passive' : 'offense';
}

function slotCap(group) {
  return SLOT_BASE + metaRank('rig');
}

function slotsUsed(group) {
  return SKILL_ORDER.filter((id) => G.skills[id] > 0 && skillGroup(id) === group).length;
}

function canTakeSkill(id) {
  if (G.skills[id] > 0) return true;
  const group = skillGroup(id);
  return slotsUsed(group) < slotCap(group);
}

function upgradablePool() {
  return SKILL_ORDER.filter(
    (id) => G.skills[id] < SKILLS[id].max && G.banned.indexOf(id) < 0 && canTakeSkill(id)
  );
}

function hasCombo(id) {
  const combo = COMBOS.find((c) => c.id === id);
  if (!combo || !G) return false;
  return combo.needs.every((skill) => G.skills[skill] >= 2);
}

function activeCombos() {
  return COMBOS.filter((c) => hasCombo(c.id));
}

function playerSpeed() {
  return 210 * (1 + 0.08 * G.skills.speed) * (1 + 0.04 * metaRank('speed'));
}

function auraRadius() {
  return G.skills.aura > 0
    ? (72 + 9 * G.skills.aura) * (hasEvolution('aura') ? 1.35 : 1) * (isOperator('engineer') ? 1.15 : 1)
    : 0;
}

function shieldRefill() {
  return Math.max(4, 9 - 0.8 * G.skills.aegis) * (hasCombo('bastion') ? 0.6 : 1);
}

function hasRelic(id) {
  return !!(G && G.relics && G.relics.indexOf(id) >= 0);
}

function shieldMax() {
  return G.skills.aegis + (hasRelic('aegiscore') ? 1 : 0);
}

function blastMult() {
  return (
    (hasCombo('demolition') ? 1.35 : 1) *
    (hasRelic('volatile') ? 1.3 : 1) *
    (hasRelic('warhead') ? 1.25 : 1)
  );
}

function fireRateMult() {
  return (odActive() ? 1.25 : 1) * (G.frenzyT > 0 ? 1.5 : 1) * (hasRelic('chrono') ? 1.15 : 1);
}

function damageMult() {
  const od = odActive() ? 1.4 : 1;
  const glass = hasMutator('glass') ? 1.4 : 1;
  return (1 + 0.12 * G.skills.damage) * (1 + 0.06 * metaRank('power')) * od * glass;
}

function magnetRadius() {
  return 120 + 45 * G.skills.magnet + 12 * metaRank('magnet') + (hasRelic('lodestone') ? 60 : 0);
}

function bulletSpeedMult() {
  return 1 + 0.10 * G.skills.bulletSpeed + (hasRelic('overclock') ? 0.25 : 0) + (isOperator('marksman') ? 0.15 : 0);
}

function critChance() {
  return (
    0.07 * G.skills.crit +
    (hasEvolution('smg') ? 0.1 : 0) +
    (G.surgeT > 0 ? 0.15 : 0) +
    (hasRelic('voidlens') ? 0.1 : 0) +
    (isOperator('marksman') ? 0.08 : 0)
  );
}

function lifestealHeal(dmg) {
  const relicRate = hasRelic('bloodstone') ? 0.03 : 0;
  if (G.skills.lifesteal <= 0 && relicRate <= 0) return 0;
  const rate =
    0.025 * G.skills.lifesteal * (hasCombo('vampire') ? 2 : 1) * (hasEvolution('dmr') ? 2 : 1) + relicRate;
  return Math.max(1, Math.round(dmg * rate));
}

function xpMult() {
  return 1 + 0.10 * metaRank('greed');
}

function streakMult() {
  return 1 + Math.min(0.5, G.streak * 0.015);
}

function odActive() {
  return !!(G && G.od.active && G.od.heat > 0);
}

function addUnbanked(value) {
  if (!(value > 0)) return;
  G.unbanked +=
    value *
    G.market *
    (G.diff ? G.diff.shard : 1) *
    mutatorShardMult() *
    (hasRelic('greedengine') ? 1.2 : 1) *
    (isOperator('scavenger') ? 1.2 : 1);
}

function bankUnbanked() {
  const v = Math.floor(G.unbanked);
  if (v <= 0) return 0;
  G.banked += v;
  G.unbanked -= v;
  G.stats.banked += v;
  return v;
}

function spawnBeacon(x, y) {
  G.beacon = { x, y, t: 30, max: 30 };
}

function applyChip(kind) {
  const chip = CHIPS[kind];
  if (!chip) return;
  if (kind === 'shards') addUnbanked(6);
  else if (kind === 'aegis') G.invulnT = Math.max(G.invulnT, 4);
  else if (kind === 'frenzy') G.frenzyT = 6;
  else if (kind === 'bomb') G.bomb.cd = 0;
  else if (kind === 'repair') G.hp = Math.min(G.maxHp, G.hp + 25);
  G.stats.chips++;
  spawnFloater(G.player.x, G.player.y - 30, chip.name, chip.color, 14);
  sfx.upgrade();
}

function openChest() {
  if (!G) return 0;
  addUnbanked(8);
  let granted = 0;
  const canUpgrade = (G.stats.chests || 0) < 10;
  for (let i = 0; i < 1 && canUpgrade; i++) {
    const pool = upgradablePool();
    if (pool.length === 0) break;
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (applyUpgrade(id)) granted++;
  }
  if (granted === 0) addUnbanked(12);
  G.stats.chests = (G.stats.chests || 0) + 1;
  G.banner = 'SUPPLY CACHE';
  G.bannerSub = granted > 0 ? '+' + granted + ' FIELD UPGRADE' + (granted > 1 ? 'S' : '') : '+8 SHARDS';
  G.bannerT = 2.2;
  G.news = 'Supply cache opened.';
  sfx.chest();
  return granted;
}

function spawnHunter() {
  const ang = rnd(0, TAU);
  const e = spawnEnemyAt('hunter', G.player.x + Math.cos(ang) * 680, G.player.y + Math.sin(ang) * 680);
  if (e) {
    G.alert = Math.min(100, G.alert + 8);
    G.banner = 'HUNTER DEPLOYED';
    G.bannerSub = 'NETWATCH IS TRACKING YOU';
    G.bannerT = 2.4;
    sfx.bossRoar();
  }
  return e;
}

function triggerEvent(id) {
  const def = EVENTS.find((e) => e.id === id);
  if (!def) return false;
  G.news = def.news;
  if (id === 'surge') {
    for (let i = 0; i < 12; i++) spawnWaveEnemy();
    G.banner = def.name;
    G.bannerSub = 'THE HORDE BREAKS THROUGH';
    G.bannerT = 2.4;
  } else if (id === 'supply') {
    for (let i = 0; i < 3; i++) {
      const a = rnd(0, TAU);
      const r = rnd(80, 210);
      G.medkits.push({ x: G.player.x + Math.cos(a) * r, y: G.player.y + Math.sin(a) * r });
    }
    for (let i = 0; i < 2; i++) {
      const a = rnd(0, TAU);
      const r = rnd(90, 230);
      const kinds = Object.keys(CHIPS);
      G.chips.push({
        x: G.player.x + Math.cos(a) * r,
        y: G.player.y + Math.sin(a) * r,
        kind: kinds[Math.floor(srnd() * kinds.length)],
        spin: 0
      });
    }
    G.banner = def.name;
    G.bannerSub = 'LOOT ON THE GROUND';
    G.bannerT = 2.4;
  } else if (id === 'bounty') {
    spawnHunter();
    return true;
  } else {
    G.event = { id, name: def.name, t: 14, max: 14 };
    G.eventT = 14;
    G.banner = def.name;
    G.bannerSub = id === 'sandstorm' ? 'ENEMIES CLOSE IN FAST' : 'OPTICS DEGRADED';
    G.bannerT = 2.4;
  }
  sfx.wave();
  return true;
}

function progressContracts() {
  for (const contract of G.contracts) {
    if (contract.done) continue;
    const def = CONTRACTS.find((c) => c.id === contract.id);
    if (!def) continue;
    if (def.goal(G) >= contract.target) {
      contract.done = true;
      G.stats.contracts++;
      addUnbanked(contract.reward);
      G.news = 'Contract complete: ' + contract.name + ' (+' + contract.reward + ')';
      G.banner = 'CONTRACT COMPLETE';
      G.bannerSub = contract.name + '  ·  +' + contract.reward + ' SHARDS';
      G.bannerT = 2.2;
      sfx.upgrade();
    }
  }
}

function primarySkill() {
  return G.weapon && WEAPONS[G.weapon] ? WEAPONS[G.weapon].skill : 'rifle';
}

function addSoldier() {
  const index = G.soldiers.length;
  const slot = FORMATION[index % FORMATION.length];
  G.soldiers.push({
    x: G.player.x + slot[0],
    y: G.player.y + slot[1],
    fireCd: rnd(0.2, 0.6),
    angle: 0,
    flash: 0
  });
}

let setup = { weapon: 'ak', map: 'desert', limit: 'endless', difficulty: 'normal', mutators: [], mode: 'survivors', operator: 'ranger' };

function freshSkills() {
  const skills = {};
  for (const id of SKILL_ORDER) skills[id] = 0;
  skills[WEAPONS[setup.weapon] ? WEAPONS[setup.weapon].skill : 'rifle'] = 1;
  return skills;
}

function findLimit(id) {
  return TIME_LIMITS.find((l) => l.id === id) || TIME_LIMITS[0];
}

function findDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

function startRun(options) {
  const opts = options || {};
  if (opts.weapon && WEAPONS[opts.weapon]) setup.weapon = opts.weapon;
  if (opts.map && MAPS[opts.map]) setup.map = opts.map;
  if (opts.limit) {
    const found = TIME_LIMITS.some((l) => l.id === opts.limit);
    if (found) setup.limit = opts.limit;
  }
  if (opts.difficulty && DIFFICULTIES.some((d) => d.id === opts.difficulty)) {
    setup.difficulty = opts.difficulty;
  }
  if (opts.mode && MODES.some((m) => m.id === opts.mode)) setup.mode = opts.mode;
  if (opts.operator && OPERATOR_ORDER.indexOf(opts.operator) >= 0) setup.operator = opts.operator;
  if (Array.isArray(opts.mutators)) setup.mutators = opts.mutators.slice(0, 2);
  const limit = findLimit(setup.limit);
  const diff = findDifficulty(setup.difficulty);
  const maxHp = 100 + 10 * metaRank('armor') + (setup.operator === 'vanguard' ? 30 : 0);
  const fixedSeed = opts.seed != null ? Number(opts.seed) >>> 0 : null;
  const seed = fixedSeed !== null && fixedSeed > 0 ? fixedSeed : (save.lastSeed >>> 0) || 20261029;
  if (fixedSeed === null) save.lastSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  writeStore(SAVE_KEY, save);
  G = {
    weapon: setup.weapon,
    mode: setup.mode,
    operator: OPERATOR_ORDER.indexOf(setup.operator) >= 0 ? setup.operator : 'ranger',
    daily: opts.daily != null ? Number(opts.daily) : null,
    rush: setup.mode === 'bossrush' ? { index: 0, target: RUSH_TARGET, next: 2, alive: false } : null,
    map: setup.map,
    difficulty: diff.id,
    diff,
    limitSec: limit.sec,
    limitLabel: limit.label,
    victory: false,
    seed,
    rng: seed,
    market: 0.9 + ((seed % 1000) / 1000) * 0.3,
    time: 0,
    wave: 1,
    kills: 0,
    level: 1,
    xp: 0,
    xpNext: levelNeed(1),
    pending: 0,
    hp: maxHp,
    maxHp,
    invulnT: 0.4,
    hurtT: 0,
    invulnerable: false,
    player: { x: 0, y: 0, angle: 0 },
    cam: { x: -W / 2, y: -H / 2 },
    soldiers: [],
    enemies: [],
    bullets: [],
    gems: [],
    medkits: [],
    chips: [],
    chests: [],
    grenades: [],
    particles: [],
    floaters: [],
    bombs: [],
    skills: freshSkills(),
    cds: { rifle: 0.25, smg: 0.2, shotgun: 0.6, dmr: 0.9, grenade: 1.6, bladeAngle: 0, spawn: 1.2, turret: 3, aura: 0 },
    dash: { t: 0, cd: 0, dx: 0, dy: 0, held: false },
    bomb: { cd: 0, max: 6, held: false },
    shield: { charges: 0, t: 0 },
    slowT: 0,
    pools: [],
    relics: [],
    relicOffers: [],
    salvage: [],
    streak: 0,
    streakT: 0,
    bestStreak: 0,
    surgeT: 0,
    frenzyT: 0,
    od: { active: false, heat: 100, held: false },
    alert: 0,
    hunterCd: 24,
    event: null,
    eventT: 0,
    eventCd: 30,
    news: 'Sector quiet. Stay mobile.',
    unbanked: 0,
    banked: 0,
    lost: 0,
    beacon: null,
    contracts: [],
    mutators: [],
    turrets: [],
    burnCd: 0,
    evolved: {},
    rerolls: 2 + metaRank('luck'),
    banishes: 1,
    banned: [],
    damageDealt: 0,
    killsByType: {},
    bossKills: 0,
    megaKills: 0,
    explored: Object.create(null),
    offers: [],
    combosSeen: [],
    banner: '',
    bannerSub: '',
    bannerT: 0,
    stats: {
      shots: { rifle: 0, smg: 0, shotgun: 0, dmr: 0, soldier: 0, enemy: 0 },
      bladeHits: 0,
      grenadeHits: 0,
      bombs: 0,
      crits: 0,
      healing: 0,
      gems: 0,
      chips: 0,
      jackpots: 0,
      nearMisses: 0,
      dashes: 0,
      hunters: 0,
      contracts: 0,
      champions: 0,
      chests: 0,
      shieldSaves: 0,
      banked: 0,
      lost: 0
    }
  };
  G.mutators = Array.isArray(setup.mutators) ? setup.mutators.slice(0, 2) : [];
  G.contracts = pickContracts();
  screen = 'play';
  shake = 0;
  for (const k in keys) delete keys[k];
  markExplored();
}

function goMenu() {
  screen = 'menu';
  G = null;
  shake = 0;
}

function recordRun(outcome) {
  addUnbanked(Math.max(2, Math.floor(G.time / 15)));
  let rush = 0;
  if (outcome === 'win') {
    addUnbanked(30);
    rush = 12 + Math.floor((G.hp / G.maxHp) * 24) + G.wave * 2;
    G.rushBonus = rush;
    addUnbanked(rush);
    G.banked += Math.floor(G.unbanked);
    G.unbanked = 0;
    save.wins += 1;
  } else {
    const lost = Math.floor(G.unbanked * 0.5);
    G.lost = lost;
    G.stats.lost += lost;
    G.banked += Math.floor(G.unbanked) - lost;
    G.unbanked = 0;
  }
  const shards = Math.max(0, Math.floor(G.banked));
  save.shards += shards;
  save.totalKills += G.kills;
  save.runs += 1;
  save.damageDealt += Math.round(G.damageDealt);
  save.bossKills += G.bossKills || 0;
  save.jackpots += G.stats.jackpots;
  save.nearMisses += G.stats.nearMisses;
  save.hunters += G.stats.hunters;
  save.contracts += G.stats.contracts;
  save.bankedTotal += Math.floor(G.banked);
  save.lostTotal += G.stats.lost;
  save.champions += G.stats.champions || 0;
  save.megaKills += G.megaKills || 0;
  save.chests += G.stats.chests || 0;
  save.shieldSaves += G.stats.shieldSaves || 0;
  if (G.daily != null) {
    const prev = save.dailyBest[G.daily] || null;
    const cand = { win: outcome === 'win', kills: G.kills, time: G.time };
    const better =
      !prev ||
      (cand.win && !prev.win) ||
      (cand.win === prev.win && (cand.win ? cand.time < prev.time : cand.kills > prev.kills));
    if (better) {
      save.dailyBest[G.daily] = cand;
      const days = Object.keys(save.dailyBest).map(Number).sort((a, b) => b - a).slice(0, 30);
      const pruned = {};
      for (const day of days) pruned[day] = save.dailyBest[day];
      save.dailyBest = pruned;
    }
  }
  if (G.mode === 'bossrush') {
    if (outcome === 'win') {
      save.rushClears += 1;
      if (!save.rushBest || G.time < save.rushBest) save.rushBest = G.time;
    }
  } else {
    save.bestWave = Math.max(save.bestWave || 1, G.wave);
  }
  if (G.time > save.bestTime) {
    save.bestTime = G.time;
    save.bestKills = G.kills;
  }
  for (const type in G.killsByType) {
    save.killsByType[type] = (save.killsByType[type] || 0) + G.killsByType[type];
  }
  best = { time: save.bestTime, kills: save.bestKills };
  checkAchievements();
  writeStore(SAVE_KEY, save);
  return shards;
}

function gameOver() {
  G.victory = false;
  G.shardsEarned = recordRun('lose');
  screen = 'over';
  shake = 10;
  sfx.over();
}

function winRun() {
  G.victory = true;
  G.shardsEarned = recordRun('win');
  screen = 'over';
  shake = 4;
  sfx.victory();
}

function abandonRun() {
  if (!G) {
    goMenu();
    return;
  }
  G.abandoned = true;
  G.shardsEarned = recordRun('lose');
  goMenu();
}

const PROP_TILE = 300;

function mapDef() {
  return MAPS[(G && G.map) || setup.map] || MAPS.desert;
}

const HAZARD_TILE = 280;

function hazardAt(x, y) {
  if (!G) return null;
  const def = mapDef();
  if (!def.hazard) return null;
  const tx = Math.floor(x / HAZARD_TILE);
  const ty = Math.floor(y / HAZARD_TILE);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = tx + i;
      const gy = ty + j;
      const h = hash2(gx * 13 + 7, gy * 17 + 3);
      if (h > 0.24) continue;
      const cx = gx * HAZARD_TILE + HAZARD_TILE / 2 + (hash2(gx * 23, gy * 29) - 0.5) * 70;
      const cy = gy * HAZARD_TILE + HAZARD_TILE / 2 + (hash2(gx * 31, gy * 37) - 0.5) * 70;
      const r = 58 + hash2(gx * 41, gy * 43) * 40;
      if (dist2(x, y, cx, cy) < r * r) return def.hazard;
    }
  }
  return null;
}

function drawHazards(cam) {
  if (!G) return;
  const def = mapDef();
  const hz = HAZARDS[def.hazard];
  if (!hz) return;
  const sprite = hazardSprite();
  const TS = HAZARD_TILE;
  const x0 = Math.floor(cam.x / TS) - 1;
  const y0 = Math.floor(cam.y / TS) - 1;
  const x1 = Math.ceil((cam.x + W) / TS) + 1;
  const y1 = Math.ceil((cam.y + H) / TS) + 1;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const h = hash2(tx * 13 + 7, ty * 17 + 3);
      if (h > 0.24) continue;
      const cx = tx * TS + TS / 2 + (hash2(tx * 23, ty * 29) - 0.5) * 70;
      const cy = ty * TS + TS / 2 + (hash2(tx * 31, ty * 37) - 0.5) * 70;
      const r = 58 + hash2(tx * 41, ty * 43) * 40;
      if (sprite) {
        ctx.drawImage(sprite, cx - r, cy - r * 0.72, r * 2, r * 1.44);
      } else {
        ctx.fillStyle = hz.color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.72, h * TAU, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = withAlpha(hz.color, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.72, h * TAU, 0, TAU);
      ctx.stroke();
      if (def.hazard === 'embers') {
        ctx.fillStyle = 'rgba(255,140,80,' + (0.25 + 0.2 * Math.sin(uiT * 2 + tx)) + ')';
        ctx.beginPath();
        ctx.arc(cx + Math.sin(uiT + ty) * 12, cy + Math.cos(uiT * 1.3 + tx) * 8, 4, 0, TAU);
        ctx.fill();
      }
    }
  }
}

function propTile(tx, ty) {
  const out = [];
  const h = hash2(tx * 7 + 11, ty * 13 + 5);
  if (h < 0.55) return out;
  const count = h > 0.9 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const seed = hash2(tx * 31 + i * 17, ty * 47 + i * 23);
    const kindRoll = hash2(tx * 53 + i * 7, ty * 59 + i * 3);
    const px = tx * PROP_TILE + 40 + hash2(tx * 17 + i, ty * 19 + i) * (PROP_TILE - 80);
    const py = ty * PROP_TILE + 40 + hash2(tx * 23 + i, ty * 29 + i) * (PROP_TILE - 80);
    if (Math.hypot(px, py) < 300) continue;
    if (kindRoll < 0.3) {
      out.push({
        kind: 'building',
        x: px,
        y: py,
        w: 78 + Math.round(seed * 52),
        h: 62 + Math.round(hash2(tx + 5, ty + 9) * 44)
      });
    } else if (kindRoll < 0.7) {
      out.push({ kind: 'rock', x: px, y: py, r: 18 + Math.round(seed * 18) });
    } else {
      out.push({ kind: 'tree', x: px, y: py, r: 13 + Math.round(seed * 8) });
    }
  }
  return out;
}

function propsNear(x, y, radius) {
  const out = [];
  const tx0 = Math.floor((x - radius) / PROP_TILE);
  const ty0 = Math.floor((y - radius) / PROP_TILE);
  const tx1 = Math.floor((x + radius) / PROP_TILE);
  const ty1 = Math.floor((y + radius) / PROP_TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      for (const prop of propTile(tx, ty)) {
        if (Math.abs(prop.x - x) <= radius + 140 && Math.abs(prop.y - y) <= radius + 140) {
          out.push(prop);
        }
      }
    }
  }
  return out;
}

function resolveSolid(x, y, r) {
  const props = propsNear(x, y, r + 90);
  for (const prop of props) {
    if (prop.kind === 'building') {
      const cx = clamp(x, prop.x - prop.w / 2, prop.x + prop.w / 2);
      const cy = clamp(y, prop.y - prop.h / 2, prop.y + prop.h / 2);
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d < r) {
        if (d > 0.001) {
          x = cx + (dx / d) * r;
          y = cy + (dy / d) * r;
        } else {
          const left = x - (prop.x - prop.w / 2);
          const right = (prop.x + prop.w / 2) - x;
          const top = y - (prop.y - prop.h / 2);
          const bottom = (prop.y + prop.h / 2) - y;
          const min = Math.min(left, right, top, bottom);
          if (min === left) x = prop.x - prop.w / 2 - r;
          else if (min === right) x = prop.x + prop.w / 2 + r;
          else if (min === top) y = prop.y - prop.h / 2 - r;
          else y = prop.y + prop.h / 2 + r;
        }
      }
    } else {
      const dx = x - prop.x;
      const dy = y - prop.y;
      const d = Math.hypot(dx, dy);
      const min = r + prop.r;
      if (d > 0.001 && d < min) {
        x = prop.x + (dx / d) * min;
        y = prop.y + (dy / d) * min;
      }
    }
  }
  return { x, y };
}

function moveWithSolids(ent, dx, dy, r) {
  ent.x += dx;
  let p = resolveSolid(ent.x, ent.y, r);
  ent.x = p.x;
  ent.y = p.y;
  ent.y += dy;
  p = resolveSolid(ent.x, ent.y, r);
  ent.x = p.x;
  ent.y = p.y;
}

function bulletBlocked(x0, y0, x1, y1) {
  const props = propsNear((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 + 120);
  for (const prop of props) {
    if (prop.kind !== 'building') continue;
    const rc = { x: prop.x - prop.w / 2, y: prop.y - prop.h / 2, w: prop.w, h: prop.h };
    if (segHitsRect(x0, y0, x1, y1, rc)) return true;
  }
  return false;
}

function markExplored() {
  if (!G) return;
  const CELL = 120;
  const cx = Math.floor(G.player.x / CELL);
  const cy = Math.floor(G.player.y / CELL);
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      G.explored[(cx + i) + ',' + (cy + j)] = 1;
    }
  }
  const exploredKeys = Object.keys(G.explored); // aikit:allow-secret
  if (exploredKeys.length > 4000) delete G.explored[exploredKeys[0]];
}

function clusterPoint(radius) {
  if (!G.enemies.length) return null;
  let best = null;
  let bestScore = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    let score = 0;
    for (const o of G.enemies) {
      if (o.dead) continue;
      if (dist2(e.x, e.y, o.x, o.y) < radius * radius) score += o.boss ? 4 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best ? { x: best.x, y: best.y, score: bestScore } : null;
}

function nearestEnemy(x, y, maxD) {
  let found = null;
  let bestD = maxD * maxD;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      found = e;
    }
  }
  return found;
}

function spawnGem(x, y, value, tier) {
  G.gems.push({ x, y, value, tier: tier || 0, spin: rnd(0, TAU), vx: rnd(-40, 40), vy: rnd(-40, 40) });
}

function spawnFloater(x, y, text, color, size) {
  G.floaters.push({ x, y, text, color, size: size || 13, life: 0.8, max: 0.8 });
  if (G.floaters.length > 40) G.floaters.shift();
}

function burst(x, y, count, color, spd, size, life) {
  for (let i = 0; i < count; i++) {
    const a = rnd(0, TAU);
    const v = rnd(spd * 0.25, spd);
    const l = rnd(life * 0.5, life);
    G.particles.push({
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
  if (G.particles.length > 420) G.particles.splice(0, G.particles.length - 420);
}

function spawnBullet(x, y, ang, speed, dmg, owner, color, opts) {
  const o = opts || {};
  G.bullets.push({
    x,
    y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    ang,
    dmg,
    owner,
    color,
    pierce: o.pierce || 0,
    crit: !!o.crit,
    web: !!o.web,
    hits: [],
    life: o.life || 1.4,
    dead: false
  });
}

function rollCrit(base) {
  if (critChance() > 0 && Math.random() < critChance()) {
    G.stats.crits++;
    return { dmg: base * 2, crit: true };
  }
  return { dmg: base, crit: false };
}

function muzzle(x, y, ang, color) {
  for (let i = 0; i < 3; i++) {
    const a = ang + rnd(-0.5, 0.5);
    G.particles.push({
      x: x + Math.cos(ang) * 20,
      y: y + Math.sin(ang) * 20,
      vx: Math.cos(a) * rnd(60, 220),
      vy: Math.sin(a) * rnd(60, 220),
      life: 0.09,
      max: 0.09,
      color: color || '#ffe28a',
      size: rnd(1.5, 3)
    });
  }
}

function hasEvolution(skill) {
  return !!(G && G.evolved && G.evolved[skill]);
}

function checkEvolutions() {
  if (!G) return;
  for (const skill of Object.keys(EVOLUTIONS)) {
    if (G.evolved[skill]) continue;
    const evo = EVOLUTIONS[skill];
    if (G.skills[skill] >= SKILLS[skill].max && G.skills[evo.needs] >= 3) {
      G.evolved[skill] = evo.id;
      G.banner = 'EVOLVED · ' + evo.name;
      G.bannerSub = SKILLS[skill].name + ' + ' + SKILLS[evo.needs].name;
      G.bannerT = 2.8;
      G.news = SKILLS[skill].name + ' evolved into ' + evo.name + '.';
      shake = Math.max(shake, settings.shake ? 6 : 0);
      sfx.victory();
    }
  }
}

function rifleStats() {
  const lvl = G.skills.rifle;
  const st = {
    dmg: (14 + 5 * (lvl - 1)) * damageMult(),
    cd: Math.max(0.16, 0.55 - 0.055 * lvl) * (hasCombo('overclocked') ? 0.8 : 1),
    range: 560,
    speed: 920,
    color: '#ffe28a',
    sfx: 'rifle',
    shots: 1,
    spread: 0
  };
  if (hasEvolution('rifle')) {
    st.dmg *= 1.6;
    st.cd *= 0.85;
    st.shots = 3;
    st.spread = 0.18;
    st.label = 'RIPPER';
  }
  return st;
}

function smgStats() {
  const lvl = G.skills.smg;
  const st = {
    dmg: (6 + 2.2 * (lvl - 1)) * damageMult(),
    cd: Math.max(0.07, 0.19 - 0.012 * lvl),
    range: 470,
    speed: 880,
    color: '#ffcf5c',
    sfx: 'smg',
    shots: 1,
    spread: 0
  };
  if (hasEvolution('smg')) {
    st.cd *= 0.9;
    st.shots = 2;
    st.spread = 0.1;
    st.label = 'STORM';
  }
  return st;
}

function shotgunStats() {
  const lvl = Math.max(1, G.skills.shotgun);
  const st = {
    dmg: (7 + 2 * lvl) * damageMult(),
    cd: Math.max(0.4, 1.15 - 0.06 * lvl),
    pellets: 2 + lvl,
    spread: 0.32,
    range: 430,
    speed: 820,
    color: '#ffb066',
    sfx: 'shotgun',
    pierce: 0
  };
  if (hasEvolution('shotgun')) {
    st.dmg *= 1.1;
    st.pellets += 4;
    st.pierce = 1;
    st.label = 'BREAKER';
  }
  return st;
}

function dmrStats() {
  const lvl = G.skills.dmr;
  const st = {
    dmg: (34 + 14 * (lvl - 1)) * damageMult(),
    cd: Math.max(0.5, 1.0 - 0.06 * lvl),
    range: 780,
    speed: 1400,
    pierce: 2 + Math.floor(lvl / 2),
    color: '#ffeab0',
    sfx: 'dmr',
    shots: 1,
    spread: 0
  };
  if (hasEvolution('dmr')) {
    st.dmg *= 1.3;
    st.pierce += 3;
    st.label = 'REAPER';
  }
  return st;
}

function railStats() {
  const lvl = G.skills.rail;
  const st = {
    dmg: (46 + 20 * (lvl - 1)) * damageMult(),
    cd: Math.max(0.55, 1.3 - 0.07 * lvl),
    range: 900,
    speed: 1700,
    pierce: 4 + Math.floor(lvl / 2),
    color: '#9fe8ff',
    sfx: 'rail',
    shots: 1,
    spread: 0
  };
  if (hasEvolution('rail')) {
    st.dmg *= 1.4;
    st.cd *= 0.8;
    st.pierce = 99;
    st.label = 'LANCER';
  }
  return st;
}

function weaponStats(id) {
  if (id === 'rifle') return rifleStats();
  if (id === 'smg') return smgStats();
  if (id === 'shotgun') return shotgunStats();
  if (id === 'dmr') return dmrStats();
  if (id === 'rail') return railStats();
  return null;
}

function bladesCount() {
  const lvl = G.skills.blades;
  if (lvl <= 0) return 0;
  return lvl + 1 + (hasEvolution('blades') ? 2 : 0);
}

function fireWeapon(id, dt) {
  if (G.skills[id] <= 0) return;
  G.cds[id] -= dt;
  if (G.cds[id] > 0) return;
  const st = weaponStats(id);
  const near = nearestEnemy(G.player.x, G.player.y, st.range);
  if (!near) return;
  const ang = Math.atan2(near.y - G.player.y, near.x - G.player.x);
  const speed = st.speed * bulletSpeedMult();
  const life = (st.range * bulletSpeedMult()) / speed;
  if (id === 'shotgun') {
    for (let i = 0; i < st.pellets; i++) {
      const off = (i / Math.max(1, st.pellets - 1) - 0.5) * st.spread;
      const hit = rollCrit(st.dmg);
      spawnBullet(
        G.player.x + Math.cos(ang) * 18,
        G.player.y + Math.sin(ang) * 18,
        ang + off + rnd(-0.03, 0.03),
        speed,
        hit.dmg,
        'p',
        st.color,
        { crit: hit.crit, pierce: st.pierce || 0, life }
      );
    }
    G.stats.shots.shotgun += st.pellets;
  } else {
    const shots = st.shots || 1;
    for (let i = 0; i < shots; i++) {
      const off = shots > 1 ? (i / (shots - 1) - 0.5) * st.spread : 0;
      const hit = rollCrit(st.dmg);
      spawnBullet(
        G.player.x + Math.cos(ang) * 18,
        G.player.y + Math.sin(ang) * 18,
        ang + off + rnd(-0.025, 0.025),
        speed,
        hit.dmg,
        'p',
        st.color,
        { crit: hit.crit, pierce: st.pierce || 0, life }
      );
    }
    G.stats.shots[id] = (G.stats.shots[id] || 0) + shots;
  }
  G.cds[id] = st.cd / fireRateMult();
  shake = Math.max(shake, id === 'shotgun' ? 2.2 : id === 'dmr' ? 2 : 1.1);
  muzzle(G.player.x, G.player.y, ang, st.color);
  sfx[st.sfx]();
}

function updateSkills(dt) {
  const target = nearestEnemy(G.player.x, G.player.y, 620);
  if (target) G.player.angle = Math.atan2(target.y - G.player.y, target.x - G.player.x);

  for (const id of ['rifle', 'smg', 'shotgun', 'dmr', 'rail']) fireWeapon(id, dt);

  if (G.skills.grenade > 0) {
    G.cds.grenade -= dt;
    if (G.cds.grenade <= 0) {
      const cluster = clusterPoint(130);
      const lvl = G.skills.grenade;
      if (cluster) {
        const throws = hasEvolution('grenade') ? 2 : 1;
        for (let i = 0; i < throws; i++) {
          G.grenades.push({
            x: G.player.x,
            y: G.player.y,
            tx: cluster.x + (i ? rnd(-55, 55) : 0),
            ty: cluster.y + (i ? rnd(-55, 55) : 0),
            t: 0.55,
            max: 0.55,
            radius: (78 + 6 * lvl) * blastMult() * (hasEvolution('grenade') ? 1.3 : 1),
            dmg: (30 + 18 * lvl) * damageMult(),
            color: '#ffb066'
          });
        }
        G.cds.grenade = Math.max(1.6, 3.6 - 0.28 * lvl);
        sfx.throwBomb();
      }
    }
  }

  G.cds.bladeAngle += dt * 2.6 * (hasEvolution('blades') ? 1.5 : 1);
  const count = bladesCount();
  if (count > 0) {
    const radius = 64;
    const dmg = (8 + 6 * G.skills.blades) * damageMult() * (hasEvolution('blades') ? 1.5 : 1);
    for (let i = 0; i < count; i++) {
      const a = G.cds.bladeAngle + (i / count) * TAU;
      const bx = G.player.x + Math.cos(a) * radius;
      const by = G.player.y + Math.sin(a) * radius;
      for (const e of G.enemies) {
        if (e.dead || e.bladeCd > 0) continue;
        if (dist2(bx, by, e.x, e.y) < (14 + e.r) * (14 + e.r)) {
          e.bladeCd = 0.45;
          damageEnemy(e, dmg, bx, by, false);
          G.stats.bladeHits++;
        }
      }
    }
  }

  if (G.dash.t > 0 && G.skills.dashPower > 0) {
    const dmg = (10 + 8 * G.skills.dashPower) * damageMult() * (hasCombo('riposte') ? 2 : 1);
    for (const e of G.enemies) {
      if (e.dead || e.dashCd > 0) continue;
      if (dist2(G.player.x, G.player.y, e.x, e.y) < (40 + e.r) * (40 + e.r)) {
        e.dashCd = 0.5;
        damageEnemy(e, dmg, e.x, e.y, false);
        burst(e.x, e.y, 5, '#9fd8ff', 160, 2.5, 0.3);
      }
    }
  }

  if (G.skills.turret > 0) {
    const lvl = G.skills.turret;
    G.cds.turret -= dt;
    if (G.cds.turret <= 0) {
      G.cds.turret = Math.max(5, 11 - 1.1 * lvl);
      if (G.turrets.length >= (hasEvolution('turret') ? 3 : 2)) G.turrets.shift();
      const life = (10 + 1.5 * lvl) * (hasEvolution('turret') ? 1.3 : 1) * (isOperator('engineer') ? 1.6 : 1);
      G.turrets.push({ x: G.player.x, y: G.player.y, angle: G.player.angle, fireCd: 0.2, life, max: life, lvl });
      G.stats.turrets = (G.stats.turrets || 0) + 1;
      spawnFloater(G.player.x, G.player.y - 26, 'TURRET DEPLOYED', '#b8c6d0', 11);
      sfx.swap();
    }
  }
  for (const turret of G.turrets) {
    turret.life -= dt;
    turret.fireCd -= dt;
    const near = nearestEnemy(turret.x, turret.y, 430);
    if (near) turret.angle = Math.atan2(near.y - turret.y, near.x - turret.x);
    if (near && turret.fireCd <= 0) {
      turret.fireCd = Math.max(0.18, (0.5 - 0.04 * turret.lvl) * (hasEvolution('turret') ? 0.7 : 1) * (hasRelic('chrono') ? 0.87 : 1));
      spawnBullet(turret.x + Math.cos(turret.angle) * 14, turret.y + Math.sin(turret.angle) * 14, turret.angle + rnd(-0.05, 0.05), 900, (9 + 4 * turret.lvl) * damageMult(), 't', '#b8c6d0');
      G.stats.shots.turret = (G.stats.shots.turret || 0) + 1;
      sfx.soldier();
    }
  }
  G.turrets = G.turrets.filter((x) => x.life > 0);

  if (G.skills.aura > 0) {
    G.cds.aura -= dt;
    if (G.cds.aura <= 0) {
      G.cds.aura = 0.5 * (hasEvolution('aura') ? 0.4 : 1);
      const radius = auraRadius();
      const dmg = (4 + 3 * G.skills.aura) * damageMult();
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (dist2(G.player.x, G.player.y, e.x, e.y) < (radius + e.r) * (radius + e.r)) {
          damageEnemy(e, dmg, e.x, e.y, false);
          G.stats.auraHits = (G.stats.auraHits || 0) + 1;
        }
      }
    }
  }
}

function updateSoldiers(dt) {
  for (let i = 0; i < G.soldiers.length; i++) {
    const s = G.soldiers[i];
    const slot = FORMATION[i % FORMATION.length];
    const tx = G.player.x + slot[0];
    const ty = G.player.y + slot[1];
    const lerp = 1 - Math.exp(-7 * dt);
    s.x += (tx - s.x) * lerp;
    s.y += (ty - s.y) * lerp;
    s.flash = Math.max(0, s.flash - dt);
    s.fireCd -= dt;
    const near = nearestEnemy(s.x, s.y, 440);
    if (near) s.angle = Math.atan2(near.y - s.y, near.x - s.x);
    if (near && s.fireCd <= 0) {
      const dmg = (8 + 3 * G.skills.squad) * damageMult();
      spawnBullet(s.x + Math.cos(s.angle) * 13, s.y + Math.sin(s.angle) * 13, s.angle + rnd(-0.05, 0.05), 780, dmg, 's', '#7fd0ff');
      s.fireCd = Math.max(0.5, 0.9 - 0.05 * G.skills.squad);
      s.flash = 0.05;
      G.stats.shots.soldier++;
      sfx.soldier();
    }
  }
}

function pickEnemyType() {
  const t = G.time;
  const pool = [['grunt', 10]];
  if (t > 25) pool.push(['swarm', 7 + Math.min(10, t / 30)]);
  if (t > 15) pool.push(['runner', 6 + Math.min(8, t / 25)]);
  if (t > 45) pool.push(['spitter', 3 + Math.min(6, t / 45)]);
  if (t > 50) pool.push(['marksman', 3 + Math.min(6, t / 45)]);
  if (t > 75) pool.push(['bomber', 2 + Math.min(5, t / 60)]);
  if (t > 90) pool.push(['tank', 2 + Math.min(5, t / 60)]);
  if (t > 110) pool.push(['weaver', 2 + Math.min(4, t / 90)]);
  if (t > 130) pool.push(['leech', 2 + Math.min(4, t / 100)]);
  if (t > 150) pool.push(['splitter', 2 + Math.min(4, t / 110)]);
  if (t > 180) pool.push(['warden', 1 + Math.min(3, t / 130)]);
  if (t > 120) pool.push(['shielder', 1 + Math.min(3, t / 150)]);
  if (t > 140) pool.push(['tunneler', 1 + Math.min(3, t / 160)]);
  if (t > 160) pool.push(['screamer', 1 + Math.min(3, t / 170)]);
  if (t > 175) pool.push(['phantom', 1 + Math.min(3, t / 180)]);
  if (t > 95) pool.push(['mortar', 1 + Math.min(3, t / 150)]);
  if (t > 125) pool.push(['widower', 1 + Math.min(3, t / 160)]);
  if (t > 105) pool.push(['husk', 2 + Math.min(4, t / 130)]);
  let total = 0;
  for (const entry of pool) total += entry[1];
  let roll = Math.random() * total;
  for (const entry of pool) {
    roll -= entry[1];
    if (roll <= 0) return entry[0];
  }
  return 'grunt';
}

function isBossType(type) {
  return Object.prototype.hasOwnProperty.call(BOSS_TYPES, type);
}

function spawnEnemyAt(type, x, y) {
  if (!G) return null;
  const boss = isBossType(type);
  const base = boss ? BOSS_TYPES[type] : (ENEMY_TYPES[type] || ENEMY_TYPES.grunt);
  const diffHp = G.diff ? G.diff.hp : 1;
  const hpScale = (1 + G.time / 120 + (boss ? G.time / 300 : 0)) * diffHp * (hasMutator('swarm') ? 0.85 : 1);
  const e = {
    type,
    x,
    y,
    r: base.r,
    hp: Math.round(base.hp * hpScale),
    maxHp: Math.round(base.hp * hpScale),
    speed: base.speed,
    touch: base.touch * (1 + G.time / 200),
    xp: base.xp,
    boss,
    mega: !!base.mega,
    elite: !!base.elite,
    champion: false,
    affix: null,
    auraShield: false,
    burrowed: false,
    burrowT: 0,
    burrowCd: rnd(1.8, 3),
    spawnCd: rnd(2, 3.4),
    beamState: 'idle',
    beamCd: rnd(2, 3.4),
    beamT: 0,
    beamAngle: 0,
    beamHit: false,
    subT: 0,
    wyrmCd: rnd(5, 7),
    ghost: false,
    ghostT: 0,
    screamCd: rnd(2, 3.5),
    rageT: 0,
    style: base.style || null,
    fireCd: rnd(0.6, 1.4),
    touchCd: 0,
    flash: 0,
    bladeCd: 0,
    dashCd: 0,
    strafe: Math.random() < 0.5 ? -1 : 1,
    flip: rnd(0.8, 2.2),
    charge: 0,
    chargeCd: rnd(2.5, 4),
    blinkCd: rnd(1.6, 3),
    fuse: 0,
    phase: 0,
    nearMiss: false,
    dead: false
  };
  if (!boss && !base.elite && srnd() < (hasMutator('elite') ? 0.09 : 0.03)) {
    const affix = CHAMPION_AFFIXES[Math.floor(srnd() * CHAMPION_AFFIXES.length)];
    e.champion = true;
    e.affix = affix.id;
    e.hp = Math.round(e.hp * 2.1);
    e.maxHp = e.hp;
    e.r *= 1.12;
    e.xp *= 3;
    if (affix.id === 'swift') {
      e.speed *= 1.35;
      e.touchCd = 0;
    }
  }
  G.enemies.push(e);
  return e;
}

function spawnRushBoss() {
  const rush = G.rush;
  if (!rush || rush.index >= rush.target) return null;
  const type = RUSH_ORDER[rush.index % RUSH_ORDER.length];
  const ang = rnd(0, TAU);
  const boss = spawnEnemyAt(type, G.player.x + Math.cos(ang) * 560, G.player.y + Math.sin(ang) * 560);
  if (!boss) return null;
  boss.hp = Math.round(boss.hp * (1 + 0.14 * rush.index));
  boss.maxHp = boss.hp;
  if (srnd() < 0.4) {
    const affix = BOSS_AFFIXES[Math.floor(srnd() * BOSS_AFFIXES.length)];
    boss.affix = affix.id;
    if (affix.speed) boss.speed *= affix.speed;
    if (affix.id === 'shielded') {
      boss.hp = Math.round(boss.hp * 1.15);
      boss.maxHp = boss.hp;
    }
  }
  rush.alive = true;
  G.banner = 'BOSS ' + (rush.index + 1) + ' / ' + rush.target;
  G.bannerSub = BOSS_TYPES[type].name + ' · ' + (boss.affix ? boss.affix.toUpperCase() + ' · ' : '') + (boss.mega ? 'MEGA' : 'SALVAGE RUN');
  G.bannerT = 2.6;
  G.news = BOSS_TYPES[type].name + ' engaged.';
  shake = Math.max(shake, settings.shake ? 10 : 0);
  sfx.bossRoar();
  return boss;
}

function spawnWaveEnemy() {
  const ang = rnd(0, TAU);
  const radius = rnd(640, 780);
  const x = G.player.x + Math.cos(ang) * radius;
  const y = G.player.y + Math.sin(ang) * radius;
  spawnEnemyAt(pickEnemyType(), x, y);
}

function spawnBoss() {
  if (!G) return null;
  const slot = Math.max(1, Math.round(G.wave / BOSS_EVERY));
  const mega = slot % MEGA_EVERY_BOSSES === 0;
  const type = mega
    ? MEGA_ORDER[(Math.floor(slot / MEGA_EVERY_BOSSES) - 1) % MEGA_ORDER.length]
    : BOSS_ORDER[(slot - 1) % BOSS_ORDER.length];
  const ang = rnd(0, TAU);
  const x = G.player.x + Math.cos(ang) * 640;
  const y = G.player.y + Math.sin(ang) * 640;
  const boss = spawnEnemyAt(type, x, y);
  if (boss) {
    if (srnd() < 0.35) {
      const affix = BOSS_AFFIXES[Math.floor(srnd() * BOSS_AFFIXES.length)];
      boss.affix = affix.id;
      if (affix.speed) boss.speed *= affix.speed;
      if (affix.id === 'shielded') {
        boss.hp = Math.round(boss.hp * 1.15);
        boss.maxHp = boss.hp;
      }
    }
    G.banner = BOSS_TYPES[type].name + ' INCOMING';
    G.bannerSub = (boss.affix ? boss.affix.toUpperCase() + ' · ' : '') + (mega ? 'MEGA BOSS · THREE PHASES' : 'A BOSS ENTERS THE FIELD');
    G.bannerT = 2.8;
    G.news = mega ? BOSS_TYPES[type].name + ' has entered the sector' : 'Boss signature detected';
    shake = Math.max(shake, settings.shake ? (mega ? 14 : 9) : 0);
    sfx.bossRoar();
  }
  return boss;
}

function updateSpawner(dt) {
  if (G.mode === 'bossrush') return;
  G.cds.spawn -= dt;
  if (G.cds.spawn > 0) return;
  const ready = Math.max(0.2, 1.05 - G.time * 0.008) / (G.diff ? G.diff.spawn : 1) / (hasMutator('swarm') ? 1.5 : 1);
  G.cds.spawn = ready;
  const cap = 150;
  if (G.enemies.length >= cap) return;
  const batch = 1 + Math.min(3, Math.floor(G.time / 60));
  for (let i = 0; i < batch && G.enemies.length < cap; i++) spawnWaveEnemy();
}

function updateEnemies(dt) {
  const shielders = [];
  for (const e of G.enemies) {
    e.auraShield = false;
    if (!e.dead && e.type === 'shielder') shielders.push(e);
  }
  if (shielders.length) {
    for (const e of G.enemies) {
      if (e.dead || e === undefined) continue;
      for (const s of shielders) {
        if (s === e) continue;
        if (dist2(e.x, e.y, s.x, s.y) < 170 * 170) {
          e.auraShield = true;
          break;
        }
      }
    }
  }

  for (const e of G.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.touchCd -= dt;
    e.bladeCd -= dt;
    e.dashCd -= dt;
    e.fireCd -= dt;
    e.flip -= dt;
    e.chargeCd -= dt;
    e.rageT = Math.max(0, e.rageT - dt);
    if (e.flip <= 0) {
      e.flip = rnd(0.8, 2.2);
      e.strafe *= -1;
    }
    const dx = G.player.x - e.x;
    const dy = G.player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    let vx = ux;
    let vy = uy;
    let speed = e.speed * (e.rageT > 0 ? 1.3 : 1);
    const eHz = HAZARDS[hazardAt(e.x, e.y)];
    if (eHz && eHz.enemySpeed) speed *= eHz.enemySpeed;
    if (G.event && G.event.id === 'sandstorm') speed *= 1.2;

    if (e.type === 'tunneler') {
      if (e.burrowed) {
        e.burrowT -= dt;
        speed = 0;
        vx = 0;
        vy = 0;
        if (e.burrowT <= 0) {
          e.burrowed = false;
          e.burrowCd = rnd(2.2, 3.6);
          const a = rnd(0, TAU);
          const r = rnd(55, 120);
          const p = resolveSolid(G.player.x + Math.cos(a) * r, G.player.y + Math.sin(a) * r, e.r);
          e.x = p.x;
          e.y = p.y;
          burst(e.x, e.y, 10, '#6a5a3a', 170, 2.6, 0.4);
        }
      } else {
        e.burrowCd -= dt;
        if (e.burrowCd <= 0) {
          e.burrowed = true;
          e.burrowT = 1.5;
          burst(e.x, e.y, 8, '#6a5a3a', 140, 2.2, 0.35);
        }
      }
    } else if (e.type === 'phantom') {
      e.ghostT -= dt;
      if (e.ghostT <= 0) {
        e.ghost = !e.ghost;
        e.ghostT = e.ghost ? 0.8 : 1.6;
        burst(e.x, e.y, 4, '#9fd8ff', 100, 1.8, 0.25);
      }
    } else if (e.type === 'screamer') {
      e.screamCd -= dt;
      if (e.screamCd <= 0) {
        e.screamCd = rnd(3, 4.2);
        for (const o of G.enemies) {
          if (o.dead || o === e) continue;
          if (dist2(o.x, o.y, e.x, e.y) < 240 * 240) o.rageT = 2.2;
        }
        burst(e.x, e.y, 14, '#ff9fd0', 240, 2.6, 0.4);
        spawnFloater(e.x, e.y - e.r - 10, 'SCREECH', '#ff9fd0', 11);
        sfx.screech();
      }
    }

    if (e.mega) {
      if (e.style === 'wyrm') {
        if (e.subT > 0) {
          e.subT -= dt;
          speed *= 2.8;
          e.burrowed = true;
          if (e.subT <= 0) {
            e.burrowed = false;
            explodeAt(e.x, e.y, 150, 30 * (1 + G.time / 300), '#c9a37c', 'e');
            for (let i = 0; i < 3; i++) spawnEnemyAt('husk', e.x + rnd(-60, 60), e.y + rnd(-60, 60));
            shake = Math.max(shake, settings.shake ? 12 : 0);
            G.news = 'The Wyrm erupts from below.';
            sfx.bossRoar();
          }
        } else {
          e.wyrmCd -= dt;
          if (e.wyrmCd <= 0) {
            e.wyrmCd = rnd(6.5, 8.5);
            e.subT = 2;
            burst(e.x, e.y, 14, '#6a5a3a', 220, 3, 0.4);
          }
        }
      }
      if (e.style === 'mega2' && e.chargeCd <= 0 && d < 520) {
        e.charge = 0.7;
        e.chargeCd = rnd(4.5, 6.5);
        burst(e.x, e.y, 16, '#b46aff', 240, 3.4, 0.5);
        sfx.bossRoar();
      }
      if (e.charge > 0) {
        e.charge -= dt;
        speed *= 2.6;
      }
      if (e.fireCd <= 0) {
        e.fireCd = e.hp < e.maxHp * 0.5 ? 2.2 : 3.2;
        const ang = Math.atan2(dy, dx);
        const count = 16;
        for (let i = 0; i < count; i++) {
          spawnBullet(e.x, e.y, ang + (i / count) * TAU, 285, 15 * (1 + G.time / 260), 'e', '#ff3b30', { life: 2.4 });
        }
        G.stats.shots.enemy += count;
        sfx.enemyShot();
      }
      const frac = e.hp / e.maxHp;
      const want = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
      if (want > e.phase) {
        e.phase = want;
        G.banner = BOSS_TYPES[e.type].name + ' PHASE ' + (want + 1);
        G.bannerSub = 'IT CALLS THE HORDE';
        G.bannerT = 2.2;
        G.alert = Math.min(100, G.alert + 10);
        shake = Math.max(shake, settings.shake ? 12 : 0);
        sfx.bossRoar();
        for (let i = 0; i < 20; i++) {
          spawnBullet(e.x, e.y, (i / 20) * TAU, 300, 14 * (1 + G.time / 260), 'e', '#ff3b30', { life: 2.6 });
        }
        for (let i = 0; i < 4; i++) {
          spawnEnemyAt(i % 2 ? 'runner' : 'swarm', e.x + rnd(-70, 70), e.y + rnd(-70, 70));
        }
      }
    } else if (e.style === 'charge') {
      if (e.charge > 0) {
        e.charge -= dt;
        speed *= 3.4;
      } else if (d < 420 && e.chargeCd <= 0) {
        e.charge = 0.55;
        e.chargeCd = rnd(3.2, 4.6);
        burst(e.x, e.y, 12, '#ff6a4a', 220, 3, 0.4);
        sfx.bossRoar();
      }
      if (d < 300 && e.fireCd <= 0) {
        e.fireCd = 4.2;
        const ang = Math.atan2(dy, dx);
        for (let i = -2; i <= 2; i++) {
          spawnBullet(e.x, e.y, ang + i * 0.28, 300, 14 * (1 + G.time / 260), 'e', '#ff3b30', { life: 2 });
        }
        G.stats.shots.enemy += 5;
        sfx.enemyShot();
      }
    } else if (e.style === 'spray') {
      if (d < 300) {
        vx = -ux;
        vy = -uy;
      } else if (d < 420) {
        vx = -uy * e.strafe;
        vy = ux * e.strafe;
      }
      if (e.fireCd <= 0 && d < 560) {
        const ang = Math.atan2(dy, dx);
        const burstCount = e.hp < e.maxHp * 0.5 ? 12 : 7;
        for (let i = 0; i < burstCount; i++) {
          const spread = 0.9;
          spawnBullet(
            e.x,
            e.y,
            ang + (i / (burstCount - 1) - 0.5) * spread,
            360,
            11 * (1 + G.time / 300),
            'e',
            '#ff3b30',
            { life: 2 }
          );
        }
        e.fireCd = e.hp < e.maxHp * 0.5 ? 1.5 : 2.4;
        G.stats.shots.enemy += burstCount;
        sfx.enemyShot();
      }
    } else if (e.style === 'bomb') {
      if (d < 260) {
        vx = -ux * 0.6;
        vy = -uy * 0.6;
      }
      if (e.fireCd <= 0 && d < 620) {
        e.fireCd = rnd(2.0, 3.0);
        G.bombs.push({
          x: e.x,
          y: e.y,
          tx: G.player.x + rnd(-40, 40),
          ty: G.player.y + rnd(-40, 40),
          t: 1.1,
          max: 1.1,
          radius: 92,
          dmg: 22 * (1 + G.time / 300),
          owner: 'e',
          color: '#ff3b30'
        });
        sfx.throwBomb();
      }
    } else if (e.style === 'hive') {
      if (e.fireCd <= 0) {
        e.fireCd = 2.8;
        const ringAng = Math.atan2(dy, dx);
        for (let i = 0; i < 10; i++) {
          spawnBullet(e.x, e.y, ringAng + (i / 10) * TAU, 240, 12 * (1 + G.time / 300), 'e', '#ff3b30', { life: 2.4 });
        }
        G.stats.shots.enemy += 10;
        sfx.enemyShot();
      }
      e.spawnCd -= dt;
      if (e.spawnCd <= 0) {
        e.spawnCd = 3.4;
        for (let i = 0; i < 3; i++) spawnEnemyAt(i % 2 ? 'runner' : 'swarm', e.x + rnd(-70, 70), e.y + rnd(-70, 70));
        burst(e.x, e.y, 10, '#7fbf4f', 180, 2.6, 0.4);
      }
    } else if (e.style === 'beam') {
      if (e.beamState === 'idle') {
        e.beamCd -= dt;
        if (e.beamCd <= 0 && d < 760) {
          e.beamState = 'charge';
          e.beamT = 0.9;
          e.beamAngle = Math.atan2(dy, dx);
          e.beamHit = false;
          sfx.bossRoar();
        }
      } else if (e.beamState === 'charge') {
        vx = 0;
        vy = 0;
        speed = 0;
        e.beamT -= dt;
        if (e.beamT <= 0) { e.beamState = 'fire'; e.beamT = 0.4; }
      } else if (e.beamState === 'fire') {
        vx = 0;
        vy = 0;
        speed = 0;
        e.beamT -= dt;
        if (!e.beamHit) {
          const bx = e.x + Math.cos(e.beamAngle) * 820;
          const by = e.y + Math.sin(e.beamAngle) * 820;
          if (segHitsCircle(e.x, e.y, bx, by, G.player.x, G.player.y, 18)) {
            e.beamHit = true;
            damagePlayer(34 * (1 + G.time / 300));
          }
        }
        if (e.beamT <= 0) { e.beamState = 'idle'; e.beamCd = 2.6; }
      }
    } else if (e.type === 'mortar') {
      if (d < 380) {
        vx = -ux;
        vy = -uy;
      }
      if (e.fireCd <= 0 && d < 720 && d > 160) {
        e.fireCd = rnd(3.0, 4.2);
        G.bombs.push({
          x: e.x,
          y: e.y,
          tx: G.player.x + rnd(-30, 30),
          ty: G.player.y + rnd(-30, 30),
          t: 1.5,
          max: 1.5,
          radius: 84,
          dmg: 16 * (1 + G.time / 300),
          owner: 'e',
          color: '#c9b89a'
        });
        sfx.throwBomb();
      }
    } else if (e.type === 'widower') {
      if (d < 200) {
        vx = -ux;
        vy = -uy;
      } else if (d < 300) {
        vx = -uy * e.strafe;
        vy = ux * e.strafe;
      }
      if (e.fireCd <= 0 && d < 560) {
        e.fireCd = rnd(2.6, 3.6);
        const ang = Math.atan2(dy, dx);
        spawnBullet(
          e.x + Math.cos(ang) * 14,
          e.y + Math.sin(ang) * 14,
          ang + rnd(-0.05, 0.05),
          250,
          6 * (1 + G.time / 400),
          'e',
          '#b48cff',
          { life: 2.6, web: true }
        );
        G.stats.shots.enemy++;
        sfx.spit();
      }
    } else if (e.type === 'marksman' || e.type === 'spitter') {
      if (e.type === 'spitter') {
        if (d < 220) {
          vx = -ux;
          vy = -uy;
        } else if (d < 300) {
          vx = -uy * e.strafe;
          vy = ux * e.strafe;
        }
      } else if (d < 250) {
        vx = -ux;
        vy = -uy;
      } else if (d < 340) {
        vx = -uy * e.strafe;
        vy = ux * e.strafe;
      }
      if (e.fireCd <= 0 && d < 430) {
        const ang = Math.atan2(dy, dx);
        const speedB = e.type === 'spitter' ? 300 : 340;
        spawnBullet(
          e.x + Math.cos(ang) * 14,
          e.y + Math.sin(ang) * 14,
          ang + rnd(-0.06, 0.06),
          speedB,
          (e.type === 'spitter' ? 8 : 10) * (1 + G.time / 300),
          'e',
          '#ff3b30',
          { life: 2 }
        );
        e.fireCd = e.type === 'spitter' ? rnd(1.6, 2.4) : rnd(2.0, 2.8);
        G.stats.shots.enemy++;
        if (e.type === 'spitter') sfx.spit();
        else sfx.enemyShot();
      }
    } else if (e.type === 'runner' && d < 240) {
      vx = ux + -uy * e.strafe * 0.35;
      vy = uy + ux * e.strafe * 0.35;
    } else if (e.type === 'weaver') {
      e.blinkCd -= dt;
      if (e.blinkCd <= 0 && d > 90) {
        e.blinkCd = rnd(2.6, 3.8);
        burst(e.x, e.y, 7, '#b48cff', 150, 2.4, 0.3);
        const step = Math.min(d - 50, 145);
        const p = resolveSolid(e.x + ux * step, e.y + uy * step, e.r);
        e.x = p.x;
        e.y = p.y;
        burst(e.x, e.y, 7, '#b48cff', 150, 2.4, 0.3);
        vx = 0;
        vy = 0;
      }
    } else if (e.type === 'bomber') {
      if (d < e.r + 26 && e.fuse <= 0) e.fuse = 1.1;
      if (e.fuse > 0) {
        e.fuse -= dt;
        vx = 0;
        vy = 0;
        if (e.fuse <= 0) {
          explodeAt(e.x, e.y, 84, 24 * (1 + G.time / 240), '#ff6a4a', 'e');
          killEnemy(e);
          continue;
        }
      }
    }

    const lenE = Math.hypot(vx, vy) || 1;
    const stepX = (vx / lenE) * speed * dt;
    const stepY = (vy / lenE) * speed * dt;
    if (e.boss) {
      e.x += stepX;
      e.y += stepY;
    } else {
      moveWithSolids(e, stepX, stepY, e.r);
    }
    if (!e.burrowed && d < e.r + 15 && e.touchCd <= 0) {
      e.touchCd = 0.9;
      damagePlayer(e.touch);
      if (hasRelic('thornhide')) damageEnemy(e, 12 + G.time * 0.02, G.player.x, G.player.y, false);
      if (e.type === 'leech') {
        e.hp = Math.min(e.maxHp, e.hp + 6);
        const stolen = Math.min(1, Math.floor(G.unbanked));
        G.unbanked = Math.max(0, G.unbanked - stolen);
        spawnFloater(e.x, e.y - e.r - 10, 'DRAIN', '#ff7a6a', 11);
      }
      if (hasMutator('vampiric')) e.hp = Math.min(e.maxHp, e.hp + 5);
      if (screen !== 'play') break;
    }
  }
  separateEnemies();
  G.enemies = G.enemies.filter((e) => !e.dead);
}

function separateEnemies() {
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.r + b.r - 2;
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
  }
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    if (b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) {
      b.dead = true;
      continue;
    }
    const x0 = b.x;
    const y0 = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.owner === 'e') {
      if (segHitsCircle(x0, y0, b.x, b.y, G.player.x, G.player.y, 18)) {
        b.dead = true;
        if (b.web) {
          G.slowT = Math.max(G.slowT, 1.8);
          spawnFloater(G.player.x, G.player.y - 24, 'WEBBED', '#b48cff', 12);
        }
        damagePlayer(b.dmg);
        burst(b.x, b.y, 4, b.web ? '#b48cff' : '#ff3b30', 140, 2, 0.25);
      }
      continue;
    }
    if (bulletBlocked(x0, y0, b.x, b.y)) {
      b.dead = true;
      burst(b.x, b.y, 4, '#c9b89a', 120, 1.6, 0.2);
      continue;
    }
    for (const e of G.enemies) {
      if (e.dead || b.hits.indexOf(e) >= 0) continue;
      if (segHitsCircle(x0, y0, b.x, b.y, e.x, e.y, e.r + 4)) {
        b.hits.push(e);
        damageEnemy(e, b.dmg, b.x, b.y, b.crit);
        if (b.pierce > 0) {
          b.pierce--;
        } else {
          b.dead = true;
          break;
        }
      }
    }
  }
  G.bullets = G.bullets.filter((b) => !b.dead);
  G.enemies = G.enemies.filter((e) => !e.dead);
}

function explodeAt(x, y, radius, dmg, color, owner) {
  burst(x, y, 26, color || '#ffb066', 300, 4, 0.5);
  burst(x, y, 12, '#4a4038', 180, 5, 0.6);
  shake = Math.max(shake, settings.shake ? 8 : 0);
  sfx.boom();
  if (owner === 'e') {
    if (dist2(x, y, G.player.x, G.player.y) < radius * radius) damagePlayer(dmg);
    return;
  }
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (dist2(x, y, e.x, e.y) < (radius + e.r) * (radius + e.r)) {
      damageEnemy(e, dmg, x, y, false);
      G.stats.grenadeHits++;
    }
  }
}

function updateGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.t -= dt;
    if (g.t > 0) continue;
    G.grenades.splice(i, 1);
    explodeAt(g.tx, g.ty, g.radius, g.dmg, g.color, 'p');
  }
  for (let i = G.bombs.length - 1; i >= 0; i--) {
    const b = G.bombs[i];
    b.t -= dt;
    if (b.t > 0) continue;
    G.bombs.splice(i, 1);
    explodeAt(b.tx, b.ty, b.radius, b.dmg, b.color, b.owner);
  }
}

function updatePools(dt) {
  for (const p of G.pools) {
    p.t -= dt;
    p.tick -= dt;
    if (p.tick > 0) continue;
    p.tick = 0.5;
    for (const e of G.enemies) {
      if (e.dead || e.burrowed) continue;
      if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) * (p.r + e.r)) damageEnemy(e, p.dmg, e.x, e.y, false);
    }
    if (dist2(p.x, p.y, G.player.x, G.player.y) < p.r * p.r) damagePlayer(4 * (1 + G.time / 400));
  }
  G.pools = G.pools.filter((p) => p.t > 0);
}

function drawPools() {
  for (const p of G.pools) {
    ctx.fillStyle = 'rgba(140,190,70,' + (0.14 + 0.1 * Math.min(1, p.t / 4)) + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,230,120,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.stroke();
  }
}

function drawShield() {
  if (!G.shield || G.shield.charges <= 0) return;
  for (let i = 0; i < G.shield.charges; i++) {
    ctx.strokeStyle = 'rgba(159,216,255,' + (0.34 - 0.04 * i) + ')';
    ctx.lineWidth = i === 0 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(G.player.x, G.player.y, 24 + i * 5, 0, TAU);
    ctx.stroke();
  }
}

function throwBomb() {
  if (!G || G.bomb.cd > 0) return false;
  const cluster = clusterPoint(140);
  const tx = cluster ? cluster.x : G.player.x + Math.cos(G.player.angle) * 220;
  const ty = cluster ? cluster.y : G.player.y + Math.sin(G.player.angle) * 220;
  const lvl = G.skills.grenade;
  G.bombs.push({
    x: G.player.x,
    y: G.player.y,
    tx,
    ty,
    t: 0.85,
    max: 0.85,
    radius: (95 + 8 * lvl) * blastMult(),
    dmg: (70 + 12 * lvl) * damageMult() * (hasRelic('warhead') ? 1.2 : 1),
    owner: 'p',
    color: '#ffb066'
  });
  G.bomb.max = Math.max(2.5, 6 - 0.4 * lvl);
  G.bomb.cd = G.bomb.max;
  G.stats.bombs++;
  sfx.throwBomb();
  return true;
}

function damageEnemy(e, dmg, x, y, crit) {
  if (e.dead) return;
  if (e.burrowed) return;
  if (e.ghost) return;
  let dealt = dmg;
  if (e.type === 'warden' && !crit) dealt *= 0.55;
  if (e.affix === 'shielded') dealt *= 0.7;
  if (e.auraShield) dealt *= 0.75;
  e.hp -= dealt;
  e.flash = 0.08;
  G.damageDealt += dealt;
  if (settings.damageNumbers) {
    const value = Math.round(dealt);
    spawnFloater(x, y - e.r, (crit ? '!' : '') + '-' + value, crit ? '#ff8ad8' : '#ffd27a', crit ? 16 : 12);
  }
  burst(x, y, 2, '#a33', 120, 1.8, 0.2);
  if (crit) sfx.crit();
  if (G.skills.lifesteal > 0) {
    const heal = lifestealHeal(dealt);
    if (heal > 0 && G.hp < G.maxHp) {
      G.hp = Math.min(G.maxHp, G.hp + heal);
      G.stats.healing += heal;
    }
  }
  if (e.hp > 0 && e.hp <= e.maxHp * 0.06 && !e.nearMiss) {
    e.nearMiss = true;
    G.stats.nearMisses++;
    spawnFloater(x, y - e.r - 8, 'NEAR MISS', '#9fd8ff', 12);
    if (G.surgeT <= 0) {
      G.surgeT = 3;
      spawnFloater(x, y - e.r - 22, 'SURGE +CRIT', '#ff8ad8', 13);
      sfx.combo(14);
    }
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  G.kills++;
  G.killsByType[e.type] = (G.killsByType[e.type] || 0) + 1;
  G.streak += 1;
  G.streakT = 2.6;
  if (G.streak > G.bestStreak) G.bestStreak = G.streak;
  G.alert = Math.min(100, G.alert + (e.boss ? 12 : e.elite ? 4 : 0.7));

  const roll = srnd();
  const luck = metaRank('luck');
  if (roll < 0.68 - 0.02 * luck) {
    spawnGem(e.x, e.y, e.xp, 0);
  } else if (roll < 0.88) {
    G.stats.jackpots++;
    spawnGem(e.x, e.y, e.xp * 2.5, 1);
    spawnFloater(e.x, e.y - e.r - 10, 'CRIT DATA x2.5', '#ffd27a', 13);
  } else {
    spawnGem(e.x, e.y, e.xp, 2);
    const kinds = Object.keys(CHIPS);
    G.chips.push({
      x: e.x + rnd(-12, 12),
      y: e.y + rnd(-12, 12),
      kind: kinds[Math.floor(srnd() * kinds.length)],
      spin: 0
    });
    G.news = 'Hardware chip recovered from ' + (ENEMY_TYPES[e.type] ? ENEMY_TYPES[e.type].name : 'hostile');
  }
  addUnbanked(0.3 + e.xp * 0.24 * streakMult());
  checkAchievements();

  if (G.streak % 10 === 0) {
    sfx.combo(G.streak);
    spawnFloater(e.x, e.y - e.r - 20, G.streak + ' STREAK  x' + streakMult().toFixed(2), '#ffd27a', 15);
  }
  if (Math.random() < 0.03) G.medkits.push({ x: e.x, y: e.y });

  if (e.champion) {
    G.stats.champions = (G.stats.champions || 0) + 1;
    G.chests.push({ x: e.x, y: e.y, spin: 0 });
    const affix = CHAMPION_AFFIXES.find((a) => a.id === e.affix);
    spawnFloater(e.x, e.y - e.r - 26, (affix ? affix.name + ' CHAMPION DOWN' : 'CHAMPION DOWN'), '#ffd27a', 15);
    if (e.affix === 'volatile') {
      explodeAt(e.x, e.y, 96, 26 * (1 + G.time / 240), '#ff8a5c', 'e');
    }
  } else if (Math.random() < 0.006) {
    G.chests.push({ x: e.x, y: e.y, spin: 0 });
  }

  if (e.type === 'splitter') {
    for (const side of [-1, 1]) spawnEnemyAt('swarm', e.x + side * 22, e.y + rnd(-8, 8));
    spawnFloater(e.x, e.y - e.r - 12, 'SPLIT', '#8a6a3a', 12);
  }
  if (e.type === 'husk') {
    if (G.pools.length >= 14) G.pools.shift();
    G.pools.push({ x: e.x, y: e.y, r: 56, t: 4, tick: 0.2, dmg: 8 * (1 + G.time / 400) });
    spawnFloater(e.x, e.y - e.r - 12, 'ACID', '#9fbf5a', 12);
  }
  if (e.type === 'hunter') {
    G.stats.hunters++;
    addUnbanked(20);
    G.medkits.push({ x: e.x, y: e.y });
    for (let i = 0; i < 4; i++) spawnGem(e.x + rnd(-30, 30), e.y + rnd(-30, 30), 6, 1);
    spawnFloater(e.x, e.y - e.r - 14, 'HUNTER DOWN +20', '#ffd27a', 16);
  }

  if (e.boss) {
    if (e.affix === 'volatile') explodeAt(e.x, e.y, 150, 32 * (1 + G.time / 240), '#ff8a5c', 'e');
    G.bossKills = (G.bossKills || 0) + 1;
    const def = BOSS_TYPES[e.type];
    const mega = !!(def && def.mega);
    if (mega) G.megaKills = (G.megaKills || 0) + 1;
    G.medkits.push({ x: e.x, y: e.y });
    const gemCount = mega ? 22 : 8;
    for (let i = 0; i < gemCount; i++) spawnGem(e.x + rnd(-60, 60), e.y + rnd(-60, 60), 5, i % 3 === 0 ? 1 : 0);
    if (mega) {
      G.medkits.push({ x: e.x, y: e.y - 40 });
      G.medkits.push({ x: e.x, y: e.y + 40 });
      const kinds = Object.keys(CHIPS);
      for (let i = 0; i < 2; i++) {
        G.chips.push({ x: e.x + rnd(-50, 50), y: e.y + rnd(-50, 50), kind: kinds[Math.floor(srnd() * kinds.length)], spin: 0 });
      }
      addUnbanked(60);
      G.news = def.name + ' destroyed. Extraction beacon armed.';
    } else {
      addUnbanked(25);
      G.news = def.name + ' down. Extraction beacon armed.';
    }
    spawnBeacon(e.x, e.y);
    G.salvage.push({ x: e.x, y: e.y, spin: 0, t: 40 });
    spawnFloater(e.x, e.y - e.r - 14, def.name + ' DOWN', '#ffd27a', 18);
    shake = Math.max(shake, settings.shake ? 14 : 0);
    sfx.victory();
    if (G.mode === 'bossrush' && G.rush) {
      G.rush.index++;
      G.rush.alive = false;
      if (G.rush.index >= G.rush.target) {
        G.news = 'All ' + G.rush.target + ' bosses destroyed.';
        winRun();
        return;
      }
      G.rush.next = 4;
      G.hp = Math.min(G.maxHp, G.hp + Math.round(G.maxHp * 0.3));
      G.news = 'Boss down. Next signature in 4s.';
    }
  } else {
    sfx.kill(G.streak);
  }
  burst(e.x, e.y, 14, '#8a1f24', 220, 3.2, 0.5);
  burst(e.x, e.y, 5, '#2a1a12', 130, 2.4, 0.4);
}

function damagePlayer(dmg) {
  if (!G || G.invulnerable || screen !== 'play') return;
  if (G.invulnT > 0) return;
  if (G.shield && G.shield.charges > 0) {
    G.shield.charges--;
    G.shield.t = shieldRefill();
    G.invulnT = 0.4;
    G.hurtT = 0.2;
    G.stats.shieldSaves = (G.stats.shieldSaves || 0) + 1;
    checkAchievements();
    spawnFloater(G.player.x, G.player.y - 24, 'SHIELD', '#9fd8ff', 13);
    burst(G.player.x, G.player.y, 10, '#9fd8ff', 180, 2.6, 0.3);
    sfx.swap();
    return;
  }
  const taken =
    dmg *
    (G.diff ? G.diff.dmg : 1) *
    (odActive() ? 1.5 : 1) *
    (hasMutator('glass') ? 1.6 : 1) *
    (isOperator('vanguard') ? 0.9 : 1);
  G.hp -= taken;
  if (G.streak > 0) {
    G.streak = 0;
    G.streakT = 0;
    spawnFloater(G.player.x, G.player.y - 34, 'COMBO LOST', '#ff7a6a', 13);
  }
  G.invulnT = 0.4;
  G.hurtT = 0.35;
  shake = Math.max(shake, settings.shake ? 6 : 0);
  if (settings.damageNumbers) spawnFloater(G.player.x, G.player.y - 18, '-' + Math.round(taken), '#ff7a6a', 14);
  sfx.hurt();
  if (G.hp <= 0) {
    G.hp = 0;
    burst(G.player.x, G.player.y, 30, '#8a1f24', 260, 4, 0.7);
    gameOver();
  }
}

function updatePickups(dt) {
  const pr = magnetRadius();
  for (const gem of G.gems) {
    gem.spin += dt * 4;
    const dx = G.player.x - gem.x;
    const dy = G.player.y - gem.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < pr) {
      const pull = 220 + (1 - d / pr) * 380;
      gem.x += (dx / d) * pull * dt;
      gem.y += (dy / d) * pull * dt;
    } else {
      gem.x += gem.vx * dt;
      gem.y += gem.vy * dt;
      gem.vx *= 1 - Math.min(0.9, 4 * dt);
      gem.vy *= 1 - Math.min(0.9, 4 * dt);
    }
    if (d < 22) {
      gem.dead = true;
      G.stats.gems++;
      const bonus = hasCombo('scavenger') ? 1 : 0;
      addXp((gem.value + bonus) * xpMult());
      sfx.pick(G.streak);
    }
  }
  G.gems = G.gems.filter((g) => !g.dead && dist2(g.x, g.y, G.player.x, G.player.y) < 2200 * 2200);
  for (const chip of G.chips) {
    chip.spin += dt * 3;
    const dx = G.player.x - chip.x;
    const dy = G.player.y - chip.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < pr) {
      const pull = 200 + (1 - d / pr) * 340;
      chip.x += (dx / d) * pull * dt;
      chip.y += (dy / d) * pull * dt;
    }
    if (d < 26) {
      chip.dead = true;
      applyChip(chip.kind);
    }
  }
  G.chips = G.chips.filter((c) => !c.dead && dist2(c.x, c.y, G.player.x, G.player.y) < 2200 * 2200);
  for (const chest of G.chests) {
    chest.spin += dt * 2.4;
    const dx = G.player.x - chest.x;
    const dy = G.player.y - chest.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < pr) {
      const pull = 170 + (1 - d / pr) * 260;
      chest.x += (dx / d) * pull * dt;
      chest.y += (dy / d) * pull * dt;
    }
    if (d < 30) {
      chest.dead = true;
      openChest();
    }
  }
  G.chests = G.chests.filter((c) => !c.dead && dist2(c.x, c.y, G.player.x, G.player.y) < 2200 * 2200);
  for (const s of G.salvage) {
    s.spin += dt * 2.2;
    s.t -= dt;
    if (screen === 'play' && dist2(s.x, s.y, G.player.x, G.player.y) < 34 * 34) {
      s.dead = true;
      openSalvage();
    }
  }
  G.salvage = G.salvage.filter((s) => !s.dead && s.t > 0);
  if (G.beacon && dist2(G.beacon.x, G.beacon.y, G.player.x, G.player.y) < 34 * 34) {
    const banked = bankUnbanked();
    if (banked > 0) {
      spawnFloater(G.player.x, G.player.y - 36, '+' + banked + ' BANKED', '#63dcc0', 16);
      G.news = 'Extraction complete: ' + banked + ' shards secured.';
      G.banner = 'EXTRACTED';
      G.bannerSub = banked + ' SHARDS SECURED';
      G.bannerT = 2;
      G.beacon = null;
      sfx.victory();
    }
  }
  for (const kit of G.medkits) {
    kit.spin = (kit.spin || 0) + dt * 2;
    const dx = G.player.x - kit.x;
    const dy = G.player.y - kit.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < pr) {
      const pull = 200 + (1 - d / pr) * 340;
      kit.x += (dx / d) * pull * dt;
      kit.y += (dy / d) * pull * dt;
    }
    if (d < 24) {
      kit.dead = true;
      G.hp = Math.min(G.maxHp, G.hp + 30);
      G.stats.healing += 30;
      spawnFloater(kit.x, kit.y - 12, '+30 HP', '#7fe0a0', 13);
      sfx.heal();
    }
  }
  G.medkits = G.medkits.filter((k) => !k.dead && dist2(k.x, k.y, G.player.x, G.player.y) < 2200 * 2200);
}

function updateParticles(dt) {
  const drag = Math.pow(0.45, dt * 6);
  for (const p of G.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.vy *= drag;
    p.life -= dt;
  }
  G.particles = G.particles.filter((p) => p.life > 0);
  for (const f of G.floaters) {
    f.y -= 28 * dt;
    f.life -= dt;
  }
  G.floaters = G.floaters.filter((f) => f.life > 0);
}

function levelOffers() {
  const copy = upgradablePool();
  const picks = [];
  while (picks.length < 3 && copy.length > 0) {
    const weights = copy.map((id) => (G.skills[id] > 0 ? 2 : 1));
    let total = 0;
    for (const w of weights) total += w;
    let roll = Math.random() * total;
    let idx = copy.length - 1;
    for (let i = 0; i < copy.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    picks.push(copy.splice(idx, 1)[0]);
  }
  return picks;
}

function rerollOffers() {
  if (!G || G.rerolls <= 0) {
    if (G) sfx.denied();
    return false;
  }
  G.rerolls--;
  G.offers = levelOffers();
  if (G.offers.length === 0) {
    G.pending = 0;
    screen = 'play';
  }
  sfx.swap();
  return true;
}

function banishOffer(index) {
  if (!G || G.banishes <= 0) {
    if (G) sfx.denied();
    return false;
  }
  const id = G.offers[index];
  if (!id) return false;
  G.banishes--;
  if (G.banned.indexOf(id) < 0) G.banned.push(id);
  G.offers = levelOffers();
  if (G.offers.length === 0) {
    G.pending = 0;
    screen = 'play';
  }
  G.news = SKILLS[id].name + ' banished for this run.';
  sfx.denied();
  return true;
}

function combosNow() {
  return COMBOS.filter((c) => c.needs.every((s) => G.skills[s] >= 2)).map((c) => c.id);
}

function announceCombos() {
  for (const combo of COMBOS) {
    const active = combo.needs.every((s) => G.skills[s] >= 2);
    if (active && G.combosSeen.indexOf(combo.id) < 0) {
      G.combosSeen.push(combo.id);
      G.banner = combo.name;
      G.bannerSub = 'SKILL COMBO · ' + combo.desc;
      G.bannerT = 2.2;
      sfx.upgrade();
    }
  }
}

function openLevelUp() {
  G.offers = levelOffers();
  if (G.offers.length === 0) {
    G.pending = 0;
    screen = 'play';
    return;
  }
  for (const key in keys) delete keys[key];
  screen = 'levelup';
  sfx.level();
}

function openSalvage() {
  if (!G || screen !== 'play') return false;
  const pool = RELICS.filter((r) => G.relics.indexOf(r.id) < 0);
  if (pool.length === 0) {
    addUnbanked(30);
    G.banner = 'SALVAGE';
    G.bannerSub = 'ALL RELICS FOUND · +30 SHARDS';
    G.bannerT = 2.2;
    sfx.chest();
    return false;
  }
  const copy = pool.slice();
  const offers = [];
  const offerCount = isOperator('scavenger') ? 4 : 3;
  while (offers.length < offerCount && copy.length > 0) {
    offers.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0].id);
  }
  G.relicOffers = offers;
  for (const key in keys) delete keys[key];
  screen = 'relic';
  sfx.upgrade();
  return true;
}

function chooseRelic(index) {
  if (!G || screen !== 'relic') return false;
  const id = G.relicOffers[index];
  if (!id) return false;
  G.relics.push(id);
  G.relicOffers = [];
  if (id === 'aegiscore') {
    G.shield.charges = Math.min(shieldMax(), G.shield.charges + 1);
    G.shield.t = shieldRefill();
  }
  const relic = RELICS.find((r) => r.id === id);
  G.banner = 'RELIC · ' + relic.name;
  G.bannerSub = relic.desc;
  G.bannerT = 2.4;
  G.news = relic.name + ' salvaged from the wreck.';
  screen = 'play';
  sfx.victory();
  checkAchievements();
  return true;
}

function addXp(value) {
  G.xp += value;
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.xpNext = levelNeed(G.level);
    G.pending++;
  }
  if (G.pending > 0 && screen === 'play') openLevelUp();
}

function applyUpgrade(id) {
  if (!SKILLS[id] || G.skills[id] >= SKILLS[id].max) return false;
  if (G.skills[id] <= 0 && !canTakeSkill(id)) {
    sfx.denied();
    G.news = SKILLS[id].name + ' needs a free ' + skillGroup(id) + ' slot.';
    return false;
  }
  G.skills[id]++;
  if (id === 'squad') addSoldier();
  if (id === 'vitality') {
    G.maxHp = baseMaxHp() + 25 * G.skills.vitality;
    G.hp = Math.min(G.maxHp, G.hp + 25);
  }
  if (id === 'aegis') {
    G.shield.t = shieldRefill();
    G.shield.charges = Math.min(shieldMax(), G.shield.charges + 1);
  }
  announceCombos();
  checkEvolutions();
  checkAchievements();
  return true;
}

function chooseUpgrade(index) {
  const id = G.offers[index];
  if (!id) return;
  applyUpgrade(id);
  G.pending = Math.max(0, G.pending - 1);
  if (G.pending > 0) {
    G.offers = levelOffers();
    if (G.offers.length === 0) {
      G.pending = 0;
      screen = 'play';
    }
    return;
  }
  G.offers = [];
  G.invulnT = Math.max(G.invulnT, 0.6);
  screen = 'play';
}

function updateRun(dt) {
  G.time += dt;
  if (G.limitSec > 0 && G.time >= G.limitSec) {
    winRun();
    return;
  }
  if (G.mode === 'bossrush') {
    const rush = G.rush;
    if (!rush.alive) {
      rush.next -= dt;
      if (rush.next <= 0) spawnRushBoss();
    }
  } else {
    const wave = 1 + Math.floor(G.time / 40);
    if (wave !== G.wave) {
      G.wave = wave;
      G.banner = 'WAVE ' + wave;
      G.bannerSub = 'THE HORDE GROWS';
      G.bannerT = 2.2;
      sfx.wave();
      if (wave % BOSS_EVERY === 0) spawnBoss();
    }
  }
  G.bannerT = Math.max(0, G.bannerT - dt);
  G.invulnT = Math.max(0, G.invulnT - dt);
  G.hurtT = Math.max(0, G.hurtT - dt);
  G.slowT = Math.max(0, G.slowT - dt);
  if (shieldMax() > 0 && G.shield.charges < shieldMax()) {
    G.shield.t -= dt;
    if (G.shield.t <= 0) {
      G.shield.charges = Math.min(shieldMax(), G.shield.charges + 1);
      G.shield.t = shieldRefill();
    }
  }
  G.streakT = Math.max(0, G.streakT - dt);
  if (G.streakT <= 0 && G.streak > 0) G.streak = 0;
  G.surgeT = Math.max(0, G.surgeT - dt);
  G.frenzyT = Math.max(0, G.frenzyT - dt);
  G.alert = Math.max(0, G.alert - 0.35 * dt);
  G.hunterCd -= dt;
  if ((G.alert >= 60 || hasMutator('bounty')) && G.hunterCd <= 0) {
    G.hunterCd = hasMutator('bounty') ? 45 : 28;
    spawnHunter();
  }
  G.eventCd -= dt;
  if (G.eventT > 0) {
    G.eventT -= dt;
    if (G.eventT <= 0) {
      G.event = null;
      G.news = 'Sector calm. Keep moving.';
    }
  }
  if (G.eventCd <= 0) {
    G.eventCd = rnd(30, 46);
    const ids = EVENTS.map((ev) => ev.id);
    triggerEvent(ids[Math.floor(srnd() * ids.length)]);
  }
  if (G.beacon) {
    G.beacon.t -= dt;
    if (G.beacon.t <= 0) {
      G.beacon = null;
      G.news = 'Extraction window missed. Shards stay at risk.';
    }
  }

  const odKey = !!keys['r'];
  if (odKey && !G.od.held) {
    if (G.od.active) {
      G.od.active = false;
      G.news = 'Overdrive disengaged.';
    } else if (G.od.heat > 15) {
      G.od.active = true;
      G.news = 'OVERDRIVE engaged: more damage, more risk.';
      sfx.upgrade();
    } else {
      sfx.denied();
    }
  }
  G.od.held = odKey;
  if (G.od.active) {
    G.od.heat = Math.max(0, G.od.heat - 18 * dt);
    if (G.od.heat <= 0) {
      G.od.active = false;
      G.news = 'Overdrive heat exhausted.';
    }
  } else {
    G.od.heat = Math.min(100, G.od.heat + 10 * dt);
  }

  progressContracts();
  if (G.hp > 0 && G.hp < G.maxHp * 0.25 && Math.floor(G.time * 2) !== Math.floor((G.time - dt) * 2)) {
    sfx.heartbeat();
  }
  shake = Math.max(0, shake - 26 * dt);

  let mx = 0;
  let my = 0;
  if (keys['w'] || keys['arrowup']) my--;
  if (keys['s'] || keys['arrowdown']) my++;
  if (keys['a'] || keys['arrowleft']) mx--;
  if (keys['d'] || keys['arrowright']) mx++;
  let len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }

  G.dash.cd = Math.max(0, G.dash.cd - dt);
  const dashHeld = !!(keys['shift'] || keys[' ']);
  if (dashHeld && !G.dash.held && G.dash.cd <= 0 && len > 0) {
    G.dash.t = 0.18;
    G.dash.cd = 1.5;
    G.dash.dx = mx;
    G.dash.dy = my;
    G.invulnT = Math.max(G.invulnT, 0.3);
    G.stats.dashes++;
    burst(G.player.x, G.player.y, 8, '#9fd8ff', 120, 2.5, 0.3);
    sfx.swap();
  }
  G.dash.held = dashHeld;

  if (G.dash.t > 0) {
    G.dash.t = Math.max(0, G.dash.t - dt);
    const boost = playerSpeed() * 3.4;
    moveWithSolids(G.player, G.dash.dx * boost * dt, G.dash.dy * boost * dt, 15);
  } else if (len > 0) {
    const hz = HAZARDS[hazardAt(G.player.x, G.player.y)];
    const hzSpeed = hz && hz.playerSpeed ? hz.playerSpeed : 1;
    const sf = G.slowT > 0 ? 0.55 : 1;
    moveWithSolids(G.player, mx * playerSpeed() * hzSpeed * sf * dt, my * playerSpeed() * hzSpeed * sf * dt, 15);
  }
  const fixed = resolveSolid(G.player.x, G.player.y, 15);
  G.player.x = fixed.x;
  G.player.y = fixed.y;

  if (hazardAt(G.player.x, G.player.y) === 'embers') {
    G.burnCd = (G.burnCd || 0) - dt;
    if (G.burnCd <= 0) {
      G.burnCd = 0.6;
      G.hp = Math.max(0, G.hp - 5);
      G.hurtT = 0.2;
      spawnFloater(G.player.x, G.player.y - 20, 'BURN', '#ff8a5c', 11);
      if (G.hp <= 0) { gameOver(); return; }
    }
  }
  G.bomb.cd = Math.max(0, G.bomb.cd - dt);
  const bombHeld = !!keys['e'];
  if (bombHeld && !G.bomb.held) throwBomb();
  G.bomb.held = bombHeld;

  updateSkills(dt);
  updateSoldiers(dt);
  updateSpawner(dt);
  updateEnemies(dt);
  if (screen !== 'play') return;
  updateBullets(dt);
  if (screen !== 'play') return;
  updateGrenades(dt);
  updatePools(dt);
  updatePickups(dt);
  updateParticles(dt);
  markExplored();

  if (screen !== 'play') return;

  const k = 1 - Math.exp(-8 * dt);
  G.cam.x += (G.player.x - W / 2 - G.cam.x) * k;
  G.cam.y += (G.player.y - H / 2 - G.cam.y) * k;
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
  ctx.fillStyle = 'rgba(8,11,14,0.82)';
  ctx.strokeStyle = 'rgba(224,178,92,0.28)';
  ctx.lineWidth = 1;
  rr(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function drawButton(id, label, cx, y, w, h, sub) {
  const x = cx - w / 2;
  uiButtons.push({ id, label, x, y, w, h });
  const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  ctx.fillStyle = hover ? 'rgba(224,178,92,0.22)' : 'rgba(18,22,26,0.9)';
  ctx.strokeStyle = hover ? 'rgba(255,213,140,0.9)' : 'rgba(224,178,92,0.45)';
  rr(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hover ? '#fff3d6' : '#e8dcc0';
  ctx.font = '700 ' + (sub ? 16 : 18) + 'px Consolas, monospace';
  ctx.fillText(label, cx, y + (sub ? h / 2 - 7 : h / 2));
  if (sub) {
    ctx.fillStyle = 'rgba(200,190,165,0.65)';
    ctx.font = '600 11px Consolas, monospace';
    ctx.fillText(sub, cx, y + h / 2 + 12);
  }
  ctx.textBaseline = 'alphabetic';
}

function drawMenuBackdrop() {
  const g = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, '#2b2a22');
  g.addColorStop(1, '#0b0b09');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(224,178,92,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -H; x < W + H; x += 64) {
    ctx.moveTo(x + ((uiT * 12) % 64), 0);
    ctx.lineTo(x - H + ((uiT * 12) % 64), H);
  }
  ctx.stroke();
  for (let i = 0; i < 34; i++) {
    const x = (hash2(i, 1) * W + uiT * (10 + hash2(i, 2) * 18)) % W;
    const y = hash2(i, 3) * H;
    ctx.fillStyle = 'rgba(255,225,170,' + (0.03 + hash2(i, 4) * 0.06) + ')';
    ctx.fillRect(x, y, 2, 2);
  }
}

function groundPalette() {
  const sky = mapDef().sky;
  return { base: sky[1], warm: sky[0], cool: sky[2] };
}

const GROUND_TS = 140;
const GROUND_VARIANTS = 8;
const groundCache = [];
let groundCacheMap = null;
let vignetteCanvas = null;
const hazardCache = Object.create(null);
let hazardCacheMap = null;

function withAlpha(color, alpha) {
  const match = /^rgba?\(([^)]+)\)$/.exec(String(color));
  if (!match) return color;
  const parts = match[1].split(',').map((part) => part.trim());
  if (parts.length < 3) return color;
  return 'rgba(' + parts[0] + ',' + parts[1] + ',' + parts[2] + ',' + alpha + ')';
}

function hazardSprite() {
  const mapId = (G && G.map) || setup.map;
  if (hazardCacheMap !== mapId) {
    for (const key of Object.keys(hazardCache)) delete hazardCache[key];
    hazardCacheMap = mapId;
  }
  const hz = HAZARDS[mapDef().hazard];
  if (!hz) return null;
  if (hazardCache[hz.name]) return hazardCache[hz.name];
  if (!canOffscreen()) return null;
  const size = 256;
  const sprite = makeOffscreen(size, size);
  const g = sprite.getContext && sprite.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2 - 4);
  grad.addColorStop(0, withAlpha(hz.color, 0.65));
  grad.addColorStop(0.5, withAlpha(hz.color, 0.45));
  grad.addColorStop(0.82, withAlpha(hz.color, 0.22));
  grad.addColorStop(1, withAlpha(hz.color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  hazardCache[hz.name] = sprite;
  return sprite;
}

function groundTilesReady() {
  const mapId = (G && G.map) || setup.map;
  if (groundCacheMap === mapId && groundCache.length === GROUND_VARIANTS) return true;
  if (!canOffscreen()) return false;
  for (let v = 0; v < GROUND_VARIANTS; v++) {
    const tile = makeOffscreen(GROUND_TS * DPR, GROUND_TS * DPR);
    const tc = tile.getContext && tile.getContext('2d');
    if (!tc) return false;
    if (tc.scale) tc.scale(DPR, DPR);
    paintGroundTile(tc, v, v * 7, false);
    groundCache[v] = tile;
  }
  groundCacheMap = mapId;
  return true;
}

function groundTileFor(tx, ty) {
  const v = Math.floor(hash2(tx * 3, ty * 5) * GROUND_VARIANTS);
  return groundCache[v] || null;
}

function paintGroundTile(draw, tx, ty, absolute) {
  const TS = GROUND_TS;
  const ox = absolute ? tx * TS : 0;
  const oy = absolute ? ty * TS : 0;
  const palette = groundPalette();
  const h = hash2(tx * 3, ty * 5);
  draw.fillStyle = palette.base;
  draw.fillRect(ox, oy, TS, TS);
  const px = ox + 42 + h * 56;
  const py = oy + 38 + hash2(tx * 5, ty * 7) * 56;
  draw.fillStyle = h < 0.5 ? palette.warm : palette.cool;
  draw.globalAlpha = 0.10 + h * 0.07;
  draw.beginPath();
  draw.ellipse(px, py, 24 + h * 14, 16 + h * 10, h * TAU, 0, TAU);
  draw.fill();
  draw.globalAlpha = 1;
  const detail = 1 + Math.floor(hash2(tx * 11, ty * 13) * 3);
  for (let i = 0; i < detail; i++) {
    const rx = ox + 18 + hash2(tx * 17 + i, ty * 19 + i) * (TS - 36);
    const ry = oy + 18 + hash2(tx * 23 + i, ty * 29 + i) * (TS - 36);
    const kind = hash2(tx * 31 + i, ty * 37 + i);
    if (kind < 0.4) {
      draw.fillStyle = 'rgba(0,0,0,0.12)';
      draw.beginPath();
      draw.ellipse(rx + 3, ry + 4, 10, 6, 0, 0, TAU);
      draw.fill();
      draw.fillStyle = 'rgba(255,255,255,0.07)';
      draw.beginPath();
      draw.ellipse(rx, ry, 9, 6, kind * TAU, 0, TAU);
      draw.fill();
    } else if (kind < 0.72) {
      draw.strokeStyle = 'rgba(0,0,0,0.14)';
      draw.lineWidth = 2;
      draw.beginPath();
      draw.moveTo(rx - 5, ry + 6);
      draw.lineTo(rx - 2, ry - 8);
      draw.moveTo(rx + 1, ry + 6);
      draw.lineTo(rx + 4, ry - 6);
      draw.stroke();
    } else {
      draw.strokeStyle = 'rgba(0,0,0,0.10)';
      draw.lineWidth = 1.5;
      draw.beginPath();
      draw.moveTo(rx - 10, ry);
      draw.lineTo(rx, ry - 4);
      draw.lineTo(rx + 9, ry + 3);
      draw.stroke();
    }
  }
  const specks = 2 + Math.floor(hash2(tx * 43, ty * 47) * 4);
  for (let i = 0; i < specks; i++) {
    const sx = ox + 8 + hash2(tx * 53 + i, ty * 59 + i) * (TS - 16);
    const sy = oy + 8 + hash2(tx * 61 + i, ty * 67 + i) * (TS - 16);
    draw.fillStyle = hash2(tx * 71 + i, ty * 73 + i) < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    draw.fillRect(sx, sy, 2, 2);
  }
}

function drawGround(cam) {
  const sky = mapDef().sky;
  ctx.fillStyle = sky[0];
  ctx.fillRect(cam.x - 4, cam.y - 4, W + 8, H + 8);
  const TS = GROUND_TS;
  const x0 = Math.floor(cam.x / TS) - 1;
  const y0 = Math.floor(cam.y / TS) - 1;
  const x1 = Math.ceil((cam.x + W) / TS) + 1;
  const y1 = Math.ceil((cam.y + H) / TS) + 1;
  if (groundTilesReady()) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = groundTileFor(tx, ty);
        if (tile) ctx.drawImage(tile, tx * TS, ty * TS, TS, TS);
        else paintGroundTile(ctx, tx, ty, false);
      }
    }
  } else {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) paintGroundTile(ctx, tx, ty, true);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  const GS = 70;
  ctx.beginPath();
  for (let x = Math.floor(cam.x / GS) * GS; x < cam.x + W; x += GS) {
    ctx.moveTo(x, cam.y);
    ctx.lineTo(x, cam.y + H);
  }
  for (let y = Math.floor(cam.y / GS) * GS; y < cam.y + H; y += GS) {
    ctx.moveTo(cam.x, y);
    ctx.lineTo(cam.x + W, y);
  }
  ctx.stroke();
}

function drawProps(cam) {
  const palette = mapDef().props;
  const props = propsNear(cam.x + W / 2, cam.y + H / 2, Math.hypot(W, H) / 2 + 120);
  props.sort((a, b) => a.y - b.y);
  for (const p of props) {
    if (p.kind === 'building') {
      const x = p.x - p.w / 2;
      const y = p.y - p.h / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(x + 8, y + 10, p.w, p.h);
      ctx.fillStyle = palette.building;
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, p.w, 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, p.w - 1, p.h - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      const doorW = Math.min(30, p.w * 0.3);
      ctx.fillRect(p.x - doorW / 2, y + p.h - 22, doorW, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let wx = x + 14; wx < x + p.w - 18; wx += 34) {
        ctx.fillRect(wx, y + 20, 12, 10);
      }
    } else if (p.kind === 'rock') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + 4, p.y + 5, p.r, p.r * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = palette.rock;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.42, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + 5, p.y + 6, p.r * 1.3, p.r * 0.7, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5a4732';
      ctx.fillRect(p.x - 3, p.y - 4, 6, p.r + 8);
      ctx.fillStyle = palette.tree;
      ctx.beginPath();
      ctx.arc(p.x, p.y - p.r * 0.6, p.r * 1.35, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.5, p.y - p.r, p.r * 0.6, 0, TAU);
      ctx.fill();
    }
  }
}

function drawPickups() {
  for (const s of G.salvage) {
    ctx.save();
    ctx.translate(s.x, s.y);
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 4 + s.spin);
    ctx.globalAlpha = 0.2 + 0.14 * pulse;
    ctx.fillStyle = '#63dcc0';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(s.spin * 0.4);
    ctx.fillStyle = '#1a2a2a';
    rr(-13, -13, 26, 26, 4);
    ctx.fill();
    ctx.strokeStyle = '#63dcc0';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#63dcc0';
    ctx.fillRect(-9, -3, 18, 6);
    ctx.fillRect(-3, -9, 6, 18);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(99,220,192,0.8)';
    ctx.font = '700 9px Consolas, monospace';
    ctx.fillText('SALVAGE', s.x, s.y - 24);
    ctx.textAlign = 'left';
  }
  for (const gem of G.gems) {
    ctx.save();
    ctx.translate(gem.x, gem.y);
    ctx.rotate(gem.spin);
    const jackpot = gem.tier === 1;
    ctx.fillStyle = jackpot ? '#ffd27a' : gem.tier === 2 ? '#c9a8ff' : gem.value > 1 ? '#ffd27a' : '#7fe8c8';
    ctx.strokeStyle = 'rgba(10,20,18,0.6)';
    ctx.lineWidth = 1.5;
    const s = jackpot ? 7.5 : gem.value > 1 ? 6 : 4.5;
    if (jackpot) {
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (const chip of G.chips) {
    const def = CHIPS[chip.kind] || CHIPS.shards;
    ctx.save();
    ctx.translate(chip.x, chip.y);
    ctx.rotate(chip.spin);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = 'rgba(8,11,14,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const x = Math.cos(a) * 8;
      const y = Math.sin(a) * 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (const chest of G.chests) {
    ctx.save();
    ctx.translate(chest.x, chest.y);
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 4 + chest.spin);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(0, 0, 18 + pulse * 4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(-9, -6, 18, 13);
    ctx.fillStyle = '#c9a45c';
    ctx.fillRect(-9, -6, 18, 4);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(-2, -3, 4, 7);
    ctx.strokeStyle = 'rgba(20,14,8,0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-9, -6, 18, 13);
    ctx.restore();
  }
  for (const kit of G.medkits) {
    ctx.fillStyle = '#e8e2d6';
    ctx.fillRect(kit.x - 8, kit.y - 6, 16, 12);
    ctx.fillStyle = '#c23a3a';
    ctx.fillRect(kit.x - 2, kit.y - 4, 4, 8);
    ctx.fillRect(kit.x - 5, kit.y - 1, 10, 3);
  }
  if (G.beacon) {
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 5);
    ctx.strokeStyle = 'rgba(99,220,192,' + (0.45 + 0.4 * pulse) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(G.beacon.x, G.beacon.y, 26 + pulse * 8, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(99,220,192,0.16)';
    ctx.beginPath();
    ctx.arc(G.beacon.x, G.beacon.y, 22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#63dcc0';
    ctx.font = '700 10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXTRACT', G.beacon.x, G.beacon.y - 34);
    ctx.fillText(Math.ceil(G.beacon.t) + 's', G.beacon.x, G.beacon.y - 22);
    ctx.textAlign = 'left';
  }
}

function enemyLook(e) {
  return e.boss ? BOSS_TYPES[e.type] : (ENEMY_TYPES[e.type] || ENEMY_TYPES.grunt);
}

function drawEnemies() {
  for (const e of G.enemies) {
    const def = enemyLook(e);
    const base = def.color;
    const dark = def.dark;
    if (e.burrowed) {
      const wyrm = e.style === 'wyrm';
      const moundR = wyrm ? e.r * 1.15 : e.r * Math.max(0.2, e.burrowT / 1.5);
      ctx.fillStyle = 'rgba(20,16,10,0.5)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, moundR * 1.2, moundR * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = wyrm ? 'rgba(200,160,110,0.7)' : 'rgba(140,115,70,0.5)';
      ctx.lineWidth = wyrm ? 3 : 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, moundR, 0, TAU);
      ctx.stroke();
      if (wyrm) {
        ctx.strokeStyle = 'rgba(150,120,80,0.45)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const rr = e.r * (0.45 + i * 0.28) + Math.sin(uiT * 5 + i) * 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, rr, 0.2, 2.8);
          ctx.stroke();
        }
      }
      continue;
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 4, e.r, e.r * 0.9, 0, 0, TAU);
    ctx.fill();
    const facing = Math.atan2(G.player.y - e.y, G.player.x - e.x);

    if (e.ghost) ctx.globalAlpha = 0.35;
    if (e.champion) {
      const affix = CHAMPION_AFFIXES.find((a) => a.id === e.affix);
      ctx.strokeStyle = affix ? affix.color : '#ffd27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 7, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = affix ? affix.color : '#ffd27a';
      ctx.beginPath();
      ctx.moveTo(-5, -e.r - 8);
      ctx.lineTo(0, -e.r - 15);
      ctx.lineTo(5, -e.r - 8);
      ctx.closePath();
      ctx.fill();
    }
    if (e.boss && e.affix) {
      const affix = BOSS_AFFIXES.find((a) => a.id === e.affix);
      if (affix) {
        const ring = e.r + 11;
        ctx.strokeStyle = affix.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, ring, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = affix.color;
        ctx.fillStyle = affix.color;
        if (e.affix === 'frenzied') {
          ctx.lineWidth = 2.5;
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU + uiT * 1.6;
            const cx = Math.cos(a) * ring;
            const cy = Math.sin(a) * ring;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a + 2.3) * 7, cy + Math.sin(a + 2.3) * 7);
            ctx.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
            ctx.lineTo(cx + Math.cos(a - 2.3) * 7, cy + Math.sin(a - 2.3) * 7);
            ctx.stroke();
          }
        } else if (e.affix === 'shielded') {
          ctx.lineWidth = 4;
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + Math.PI / 4;
            ctx.beginPath();
            ctx.arc(0, 0, ring + 4, a - 0.26, a + 0.26);
            ctx.stroke();
          }
        } else if (e.affix === 'volatile') {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + uiT * 2.2;
            const r2 = ring + 6 + Math.sin(uiT * 9 + i) * 3;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * r2, Math.sin(a) * r2, 2.2, 0, TAU);
            ctx.fill();
          }
        }
      }
    }
    if (e.auraShield) {
      ctx.strokeStyle = 'rgba(120,200,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 3, 0, TAU);
      ctx.stroke();
    }

    if (e.boss) {
      ctx.rotate(facing);
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,70,0.75)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,160,130,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r - 9, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#f0c9a0';
      ctx.beginPath();
      ctx.arc(7, 0, e.r * 0.32, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1a0709';
      ctx.beginPath();
      ctx.arc(10, -e.r * 0.3, e.r * 0.15, 0, TAU);
      ctx.arc(10, e.r * 0.3, e.r * 0.15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      if (e.style === 'charge') {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-e.r * 0.1, side * e.r * 0.7);
          ctx.lineTo(e.r * 0.85, side * e.r * 1.25);
          ctx.lineTo(e.r * 0.35, side * e.r * 0.75);
          ctx.stroke();
        }
      } else if (e.style === 'spray') {
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 10, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 0.18, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,90,70,0.6)';
        ctx.beginPath();
        ctx.moveTo(-e.r * 0.75, 0);
        ctx.lineTo(-e.r * 1.2, 0);
        ctx.stroke();
      } else if (e.style === 'hive') {
        ctx.strokeStyle = 'rgba(127,191,79,0.75)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + uiT * 0.6;
          const pr = e.r * (0.2 + 0.05 * Math.sin(uiT * 3 + i));
          ctx.beginPath();
          ctx.arc(Math.cos(a) * e.r * 0.6, Math.sin(a) * e.r * 0.6, pr, 0, TAU);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(210,255,170,' + (0.22 + 0.22 * Math.sin(uiT * 5)) + ')';
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 0.42, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#1c2a10';
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 0.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ff3b30';
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + uiT * 1.4;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * e.r * 0.42, Math.sin(a) * e.r * 0.42, e.r * 0.07, 0, TAU);
          ctx.fill();
        }
      } else if (e.style === 'beam') {
        ctx.fillStyle = '#17324a';
        ctx.beginPath();
        ctx.moveTo(e.r, 0);
        ctx.lineTo(0, e.r * 0.72);
        ctx.lineTo(-e.r * 0.85, 0);
        ctx.lineTo(0, -e.r * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(159,232,255,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        const eyeR = e.r * (0.18 + (e.beamState !== 'idle' ? 0.06 + 0.03 * Math.sin(uiT * 22) : 0));
        ctx.fillStyle = e.beamState === 'idle' ? '#9fd8ff' : '#ff5a4a';
        ctx.beginPath();
        ctx.arc(e.r * 0.26, 0, eyeR, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#0a1420';
        ctx.beginPath();
        ctx.arc(e.r * 0.26, 0, e.r * 0.08, 0, TAU);
        ctx.fill();
      } else if (e.style === 'wyrm') {
        for (let i = 3; i >= 0; i--) {
          ctx.fillStyle = i === 0 ? base : dark;
          ctx.beginPath();
          ctx.arc(-i * e.r * 0.5, Math.sin(uiT * 6 + i * 1.3) * e.r * 0.16, e.r * (1 - i * 0.15), 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,207,92,0.28)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.fillStyle = '#ffcf5c';
        ctx.beginPath();
        ctx.arc(e.r * 0.5, -e.r * 0.16, e.r * 0.09, 0, TAU);
        ctx.arc(e.r * 0.5, e.r * 0.16, e.r * 0.09, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#3a1a0a';
        ctx.beginPath();
        ctx.arc(e.r * 0.74, 0, e.r * 0.2, 0, TAU);
        ctx.fill();
      } else if (e.mega) {
        ctx.strokeStyle = 'rgba(180,140,255,0.6)';
        ctx.lineWidth = 2;
        for (let ring = 1; ring <= 2; ring++) {
          ctx.beginPath();
          ctx.arc(0, 0, e.r + 10 * ring, 0, TAU);
          ctx.stroke();
        }
        ctx.fillStyle = '#ff3b30';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * e.r * 0.55, Math.sin(a) * e.r * 0.55, e.r * 0.09, 0, TAU);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,90,70,0.55)';
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 0.28, 0, TAU);
        ctx.stroke();
        if (e.phase > 0) {
          ctx.strokeStyle = 'rgba(255,60,40,' + (0.3 + 0.3 * Math.sin(uiT * 10)) + ')';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, e.r + 24, 0, TAU);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(e.r * 0.2, -e.r * 0.24, e.r * 0.95, e.r * 0.48);
        ctx.strokeStyle = '#ff6a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.r * 1.15, 0, e.r * 0.26, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,180,90,' + (0.5 + 0.4 * Math.sin(uiT * 22)) + ')';
        ctx.beginPath();
        ctx.arc(e.r * 1.15, 0, e.r * 0.12, 0, TAU);
        ctx.fill();
      }
      if (e.charge > 0) {
        ctx.strokeStyle = 'rgba(255,80,60,' + (0.4 + 0.4 * Math.sin(uiT * 30)) + ')';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 12, 0, TAU);
        ctx.stroke();
      }
    } else if (e.type === 'runner' || e.type === 'swarm') {
      ctx.rotate(facing);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(e.r, 0);
      ctx.lineTo(-e.r * 0.9, e.r * 0.8);
      ctx.lineTo(-e.r * 0.9, -e.r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(e.r * 0.35, 0, e.r * 0.3, 0, TAU);
      ctx.fill();
    } else if (e.type === 'weaver' || e.type === 'hunter') {
      ctx.rotate(facing);
      if (e.type === 'hunter') {
        ctx.strokeStyle = 'rgba(255,60,70,' + (0.35 + 0.3 * Math.sin(uiT * 8)) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 9, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-e.r - 16, 0);
        ctx.lineTo(-e.r - 6, 0);
        ctx.moveTo(e.r + 6, 0);
        ctx.lineTo(e.r + 16, 0);
        ctx.stroke();
      }
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(e.r, 0);
      ctx.lineTo(0, e.r * 0.86);
      ctx.lineTo(-e.r, 0);
      ctx.lineTo(0, -e.r * 0.86);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(e.r * 0.32, 0, e.r * 0.26, 0, TAU);
      ctx.fill();
      if (e.type === 'weaver') {
        ctx.strokeStyle = 'rgba(190,140,255,0.5)';
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 4, 0, TAU);
        ctx.stroke();
      }
    } else if (e.type === 'warden') {
      ctx.rotate(facing);
      ctx.fillStyle = base;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const x = Math.cos(a) * e.r;
        const y = Math.sin(a) * e.r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200,230,255,0.75)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 4, -0.8, 0.8);
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(e.r * 0.3, 0, e.r * 0.22, 0, TAU);
      ctx.fill();
    } else if (e.type === 'splitter') {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(-e.r * 0.28, 0, e.r * 0.78, 0, TAU);
      ctx.arc(e.r * 0.28, 0, e.r * 0.78, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 0.6);
      ctx.lineTo(0, e.r * 0.6);
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(-e.r * 0.3, 0, e.r * 0.2, 0, TAU);
      ctx.arc(e.r * 0.3, 0, e.r * 0.2, 0, TAU);
      ctx.fill();
    } else if (e.type === 'leech') {
      ctx.rotate(facing);
      ctx.strokeStyle = 'rgba(180,60,80,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + Math.sin(uiT * 3 + i) * 0.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * e.r * 1.7, Math.sin(a) * e.r * 1.7);
        ctx.stroke();
      }
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ff7a8a';
      ctx.beginPath();
      ctx.arc(e.r * 0.3, 0, e.r * 0.22, 0, TAU);
      ctx.fill();
    } else if (e.type === 'shielder') {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,200,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 6, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#bfe6f2';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,200,255,0.14)';
      ctx.fillStyle = 'rgba(120,200,255,0.07)';
      ctx.beginPath();
      ctx.arc(0, 0, 170, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (e.type === 'screamer') {
      ctx.rotate(facing);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1a0a12';
      ctx.beginPath();
      ctx.arc(e.r * 0.35, 0, e.r * 0.42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,159,208,' + (0.3 + 0.25 * Math.sin(uiT * 8)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 8, 0, TAU);
      ctx.stroke();
    } else if (e.type === 'phantom') {
      ctx.rotate(facing);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(e.r, 0);
      ctx.lineTo(0, e.r);
      ctx.lineTo(-e.r * 0.8, 0);
      ctx.lineTo(0, -e.r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(159,216,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(e.r * 0.3, 0, e.r * 0.22, 0, TAU);
      ctx.fill();
    } else if (e.type === 'shielder') {
      ctx.fillStyle = base;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + uiT * 0.25;
        const px = Math.cos(a) * e.r;
        const py = Math.sin(a) * e.r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7fd0ff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(127,208,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.5, 0, TAU);
      ctx.stroke();
    } else if (e.type === 'leech') {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + uiT * 1.1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.r * 0.7, Math.sin(a) * e.r * 0.7);
        ctx.quadraticCurveTo(
          Math.cos(a) * e.r * 1.5,
          Math.sin(a) * e.r * 1.5,
          Math.cos(a + 0.45) * e.r * 1.85,
          Math.sin(a + 0.45) * e.r * 1.85
        );
        ctx.stroke();
      }
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ff4d6a';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.32, 0, TAU);
      ctx.fill();
    } else if (e.type === 'screamer') {
      ctx.fillStyle = dark;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + Math.sin(uiT * 2) * 0.08;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.17) * e.r, Math.sin(a - 0.17) * e.r);
        ctx.lineTo(Math.cos(a) * (e.r + 9), Math.sin(a) * (e.r + 9));
        ctx.lineTo(Math.cos(a + 0.17) * e.r, Math.sin(a + 0.17) * e.r);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#f0d0e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(3, 0, e.r * 0.5, -0.9, 0.9);
      ctx.stroke();
    } else if (e.type === 'husk') {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30,40,16,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.55, -e.r * 0.4);
      ctx.lineTo(-e.r * 0.1, 0);
      ctx.lineTo(-e.r * 0.5, e.r * 0.45);
      ctx.moveTo(e.r * 0.15, -e.r * 0.55);
      ctx.lineTo(e.r * 0.5, -e.r * 0.15);
      ctx.stroke();
      ctx.fillStyle = '#c8e06a';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.6;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.r * 0.45, Math.sin(a) * e.r * 0.45, 3, 0, TAU);
        ctx.fill();
      }
    } else if (e.type === 'phantom') {
      ctx.rotate(facing);
      ctx.fillStyle = 'rgba(90,122,138,0.5)';
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.3, -e.r * 0.75);
      ctx.lineTo(-e.r * 2.1 - Math.sin(uiT * 6) * 4, 0);
      ctx.lineTo(-e.r * 0.3, e.r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,245,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#0d1a22';
      ctx.beginPath();
      ctx.arc(e.r * 0.25, 0, e.r * 0.3, 0, TAU);
      ctx.fill();
    } else if (e.type === 'mortar') {
      ctx.rotate(facing);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.4, -e.r * 0.7);
      ctx.lineTo(-e.r * 1.2, -e.r * 1.15);
      ctx.moveTo(-e.r * 0.4, e.r * 0.7);
      ctx.lineTo(-e.r * 1.2, e.r * 1.15);
      ctx.stroke();
      ctx.fillStyle = '#2f2a1e';
      ctx.fillRect(0, -4, e.r + 13, 8);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(-2, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(-2, 0, e.r * 0.3, 0, TAU);
      ctx.fill();
    } else if (e.type === 'widower') {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2.5;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const a = side * (0.5 + i * 0.45);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * e.r * 0.5, Math.sin(a) * e.r * 0.5);
          ctx.lineTo(Math.cos(a) * e.r * 2, Math.sin(a) * e.r * 2);
          ctx.stroke();
        }
      }
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#b48cff';
      ctx.beginPath();
      ctx.arc(e.r * 0.35, 0, e.r * 0.26, 0, TAU);
      ctx.fill();
    } else if (e.type === 'hunter') {
      ctx.fillStyle = '#1a1014';
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e8e2d6';
      ctx.fillRect(-e.r * 0.5, -e.r - 3, e.r * 0.95, 5);
      ctx.fillRect(-e.r * 0.5, e.r - 2, e.r * 0.95, 5);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(0, -2.5, e.r * 0.8, 5);
    } else if (e.type === 'tank' || e.type === 'bomber') {
      if (e.type === 'bomber') {
        ctx.fillStyle = dark;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + uiT * 0.4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.14) * e.r, Math.sin(a - 0.14) * e.r);
          ctx.lineTo(Math.cos(a) * (e.r + 7), Math.sin(a) * (e.r + 7));
          ctx.lineTo(Math.cos(a + 0.14) * e.r, Math.sin(a + 0.14) * e.r);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r - 6, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = e.type === 'bomber' ? '#ff8a3a' : '#c9a37c';
      ctx.beginPath();
      ctx.arc(4, 0, e.r * 0.3, 0, TAU);
      ctx.fill();
      if (e.type === 'bomber' && e.fuse > 0) {
        ctx.fillStyle = 'rgba(255,90,40,' + (0.35 + 0.35 * Math.sin(uiT * 40)) + ')';
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 10, 0, TAU);
        ctx.fill();
      }
    } else if (e.type === 'marksman' || e.type === 'spitter') {
      ctx.rotate(facing);
      ctx.fillStyle = dark;
      ctx.fillRect(4, -3, e.r + 10, 6);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#f0e2b8';
      ctx.beginPath();
      ctx.arc(3, 0, e.r * 0.42, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#c0281f';
      ctx.beginPath();
      ctx.arc(3, 0, e.r * 0.16, 0, TAU);
      ctx.fill();
      if (e.type === 'spitter') {
        ctx.strokeStyle = 'rgba(255,59,48,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 4, -0.4, 0.4);
        ctx.stroke();
      }
    } else {
      ctx.rotate(facing);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#d8cba0';
      ctx.beginPath();
      ctx.arc(3, 0, e.r * 0.45, 0, TAU);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(-e.r + 3, -2, 5, 4);
      ctx.fillStyle = '#c0281f';
      ctx.beginPath();
      ctx.arc(3, 0, e.r * 0.18, 0, TAU);
      ctx.fill();
    }

    if (e.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (e.flash / 0.08) * 0.45 + ')';
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (!e.boss && e.hp < e.maxHp) {
      const w = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
      ctx.fillStyle = e.type === 'tank' ? '#e0a13c' : '#d3563f';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }
  for (const e of G.enemies) {
    if (e.dead || e.style !== 'beam' || e.beamState === 'idle') continue;
    const bx = e.x + Math.cos(e.beamAngle) * 820;
    const by = e.y + Math.sin(e.beamAngle) * 820;
    if (e.beamState === 'charge') {
      ctx.strokeStyle = 'rgba(255,90,74,' + (0.22 + 0.3 * Math.abs(Math.sin(uiT * 16))) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
    } else if (e.beamState === 'fire') {
      ctx.strokeStyle = 'rgba(159,232,255,0.3)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = '#ff5a4a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
}

function drawAura() {
  if (!G.skills.aura) return;
  const radius = auraRadius();
  const pulse = 0.5 + 0.5 * Math.sin(uiT * 4);
  ctx.strokeStyle = 'rgba(255,150,90,' + (0.18 + 0.12 * pulse) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(G.player.x, G.player.y, radius, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,60,' + (0.05 + 0.03 * pulse) + ')';
  ctx.beginPath();
  ctx.arc(G.player.x, G.player.y, radius, 0, TAU);
  ctx.fill();
}

function drawTurrets() {
  for (const t of G.turrets) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 13, 11, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(t.angle);
    ctx.fillStyle = '#2a3238';
    ctx.fillRect(4, -3, 18, 6);
    ctx.fillStyle = '#b8c6d0';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#59656d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#7fe0a0';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
    const pct = clamp(t.life / t.max, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(t.x - 11, t.y - 17, 22, 3);
    ctx.fillStyle = '#b8c6d0';
    ctx.fillRect(t.x - 11, t.y - 17, 22 * pct, 3);
  }
}

function drawBlades() {
  const count = bladesCount();
  if (!count) return;
  for (let i = 0; i < count; i++) {
    const a = G.cds.bladeAngle + (i / count) * TAU;
    const bx = G.player.x + Math.cos(a) * 64;
    const by = G.player.y + Math.sin(a) * 64;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = '#dfe8ff';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(4, 6);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,60,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

function drawSoldiers() {
  for (const s of G.soldiers) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(2, 3, 11, 0, TAU);
    ctx.fill();
    ctx.rotate(s.angle);
    ctx.fillStyle = '#20262b';
    ctx.fillRect(6, -2.5, 16, 5);
    ctx.fillStyle = '#2a6f9e';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#0d2534';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(2, 0, 5, 0, TAU);
    ctx.fill();
    if (s.flash > 0) {
      ctx.fillStyle = 'rgba(180,230,255,0.9)';
      ctx.beginPath();
      ctx.arc(23, 0, 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function evolutionTier(level) {
  if (level >= 18) return 3;
  if (level >= 10) return 2;
  if (level >= 5) return 1;
  return 0;
}

function accentColor() {
  const owned = SKILL_ORDER.filter((id) => G.skills[id] > 0 && SKILLS[id].kind !== 'passive');
  owned.sort((a, b) => G.skills[b] - G.skills[a]);
  return owned.length ? SKILLS[owned[0]].color : '#ffd27a';
}

function drawPlayer() {
  const p = G.player;
  const tier = evolutionTier(G.level);
  const accent = accentColor();
  const scale = 1 + tier * 0.06;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.arc(3, 4, 15 * scale, 0, TAU);
  ctx.fill();

  if (tier >= 2) {
    ctx.fillStyle = 'rgba(255,210,122,' + (0.06 + 0.03 * tier) + ')';
    ctx.beginPath();
    ctx.arc(0, 0, 30 + Math.sin(uiT * 4) * 3, 0, TAU);
    ctx.fill();
  }
  if (G.invulnT > 0) {
    ctx.strokeStyle = 'rgba(140,220,255,' + (0.25 + 0.25 * Math.sin(uiT * 20)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, TAU);
    ctx.stroke();
  }

  ctx.rotate(p.angle);
  ctx.scale(scale, scale);

  if (tier >= 3) {
    ctx.fillStyle = 'rgba(190,60,50,0.85)';
    ctx.fillRect(-24, -9, 16, 18);
  }
  if (tier >= 2) {
    ctx.fillStyle = '#4a5560';
    ctx.beginPath();
    ctx.arc(-6, -13, 6, 0, TAU);
    ctx.arc(-6, 13, 6, 0, TAU);
    ctx.fill();
  }

  const primary = primarySkill();
  if (primary === 'rail') {
    ctx.fillStyle = '#20262b';
    ctx.fillRect(8, -2.5, 38, 5);
    ctx.fillStyle = '#9fe8ff';
    ctx.fillRect(30, -1, 16, 2);
    ctx.fillStyle = '#39424a';
    ctx.fillRect(14, -6, 8, 3);
  }
  if (primary === 'smg') {
    ctx.fillStyle = '#20262b';
    ctx.fillRect(8, -3.5, 18, 7);
    ctx.fillStyle = '#39424a';
    ctx.fillRect(24, -2, 6, 4);
    ctx.fillStyle = '#39424a';
    ctx.fillRect(10, 6, 5, 8);
  } else if (primary === 'shotgun') {
    ctx.fillStyle = '#20262b';
    ctx.fillRect(8, -4, 28, 8);
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(20, -5, 10, 10);
    ctx.fillStyle = '#39424a';
    ctx.fillRect(35, -2.5, 5, 5);
  } else if (primary === 'dmr') {
    ctx.fillStyle = '#20262b';
    ctx.fillRect(8, -3, 34, 6);
    ctx.fillStyle = '#39424a';
    ctx.fillRect(20, -7, 9, 3);
    ctx.fillRect(40, -1.5, 6, 3);
  } else {
    ctx.fillStyle = '#20262b';
    ctx.fillRect(8, -3, 24, 6);
    ctx.fillStyle = '#39424a';
    ctx.fillRect(27, -2, 7, 4);
    ctx.fillRect(12, 5, 4, 7);
  }

  ctx.fillStyle = tier >= 1 ? '#2b6a5e' : '#2f6fb5';
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = tier > 0 ? 2.5 : 2;
  ctx.stroke();
  if (tier >= 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(3, 0, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = tier >= 2 ? '#a3232a' : '#1d3f63';
  ctx.beginPath();
  ctx.arc(1, 0, 7, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  if (tier >= 3) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(240,230,205,0.75)';
  ctx.font = '700 9px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(['RECRUIT', 'VETERAN', 'ELITE', 'LEGEND'][tier], p.x, p.y - 24 * scale - 4);
  ctx.textAlign = 'left';
}

function drawBombArc(x0, y0, tx, ty, t, max, color) {
  const p = clamp(1 - t / max, 0, 1);
  const x = x0 + (tx - x0) * p;
  const y = y0 + (ty - y0) * p - Math.sin(p * Math.PI) * 34;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(tx, ty + 4, 22, 11, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(tx, ty, 20, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3f4a3a';
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, TAU);
  ctx.stroke();
}

function drawGrenades() {
  for (const g of G.grenades) drawBombArc(g.x, g.y, g.tx, g.ty, g.t, g.max, '#ffb066');
  const blink = 0.35 + 0.35 * Math.sin(uiT * 18);
  for (const b of G.bombs) drawBombArc(b.x, b.y, b.tx, b.ty, b.t, b.max, b.owner === 'e' ? 'rgba(255,59,48,' + blink + ')' : '#ffcf5c');
}

function drawBullets() {
  ctx.lineCap = 'round';
  for (const b of G.bullets) {
    const enemy = b.owner === 'e';
    const tx = b.x - b.vx * (enemy ? 0.02 : 0.014);
    const ty = b.y - b.vy * (enemy ? 0.02 : 0.014);
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = enemy ? 0.4 : 0.25;
    ctx.lineWidth = enemy ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = enemy ? 3 : 1.8;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (enemy) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,90,70,0.28)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 7, 0, TAU);
      ctx.fill();
    }
  }
}

function drawParticles() {
  for (const p of G.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.textAlign = 'center';
  for (const f of G.floaters) {
    ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = '700 ' + f.size + 'px Consolas, monospace';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

function drawSkull(x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(8,11,14,0.92)';
  ctx.beginPath();
  ctx.arc(-size * 0.36, -size * 0.1, size * 0.24, 0, TAU);
  ctx.arc(size * 0.36, -size * 0.1, size * 0.24, 0, TAU);
  ctx.fill();
  ctx.fillRect(-size * 0.5, size * 0.42, size, size * 0.2);
  ctx.fillStyle = color;
  ctx.fillRect(-size * 0.28, size * 0.58, size * 0.16, size * 0.22);
  ctx.fillRect(size * 0.12, size * 0.58, size * 0.16, size * 0.22);
  ctx.restore();
}

function drawHUD() {
  const xpPct = clamp(G.xp / G.xpNext, 0, 1);

  panel(14, 14, 250, 92);
  drawSkull(42, 42, 13, '#e8dcc0');
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa7ad';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText('KILLS', 64, 32);
  ctx.fillStyle = '#f4efe2';
  ctx.font = '700 24px Consolas, monospace';
  ctx.fillText(String(G.kills), 64, 56);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,210,122,0.72)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('BEST ' + save.bestKills + '  ·  ' + fmtTime(best.time), 252, 32);
  ctx.fillStyle = G.streak >= 10 ? '#ffd27a' : 'rgba(180,175,155,0.6)';
  ctx.fillText('STREAK ' + G.streak + '  x' + streakMult().toFixed(2), 252, 50);
  ctx.fillStyle = '#63dcc0';
  ctx.fillText('UNBANKED ' + Math.floor(G.unbanked) + '  ·  SEC ' + Math.floor(G.banked), 252, 66);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(190,185,165,0.55)';
  ctx.font = '600 9px Consolas, monospace';
  const news = G.news.length > 44 ? G.news.slice(0, 42) + '...' : G.news;
  ctx.fillText(news, 26, 86);
  if (G.mutators && G.mutators.length) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8a87c';
    ctx.font = '700 9px Consolas, monospace';
    ctx.fillText('MUTATORS · ' + G.mutators.map((id) => (mutatorDef(id) || {}).name || id).join(' + '), 26, 100);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(6,10,13,0.62)';
  ctx.fillRect(W / 2 - 104, 14, 208, 76);
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 30px Consolas, monospace';
  ctx.fillText(fmtTime(G.time), W / 2, 42);
  ctx.fillStyle = '#b9ac92';
  ctx.font = '600 11px Consolas, monospace';
  const limitText = G.limitSec > 0 ? '  ·  LEFT ' + fmtTime(Math.max(0, G.limitSec - G.time)) : '';
  const runText =
    G.mode === 'bossrush'
      ? 'BOSS ' + Math.min(G.rush.index + 1, G.rush.target) + ' / ' + G.rush.target + ' · L' + G.level + limitText
      : 'W' + G.wave + ' · L' + G.level + ' · ' + (G.diff ? G.diff.name : 'NORMAL') + limitText;
  ctx.fillText((G.daily != null ? 'DAILY · ' : '') + runText, W / 2, 62);

  if (screen === 'play') {
    const alertColor = G.alert > 80 ? '#e2563f' : G.alert > 55 ? '#e0b13c' : '#63dcc0';
    ctx.fillStyle = '#1d2a28';
    ctx.fillRect(W / 2 - 104, 84, 208, 6);
    ctx.fillStyle = alertColor;
    ctx.fillRect(W / 2 - 104, 84, 208 * clamp(G.alert / 100, 0, 1), 6);
    ctx.fillStyle = alertColor;
    ctx.font = '600 9px Consolas, monospace';
    const eventText = G.event ? '  ·  ' + G.event.name + ' ' + Math.ceil(G.eventT) + 's' : '';
    ctx.textAlign = 'left';
    ctx.fillText('ALERT ' + Math.round(G.alert) + '%' + eventText, W / 2 - 104, 80);
    ctx.textAlign = 'center';
  }

  const owned = SKILL_ORDER.filter((id) => G.skills[id] > 0);
  const rowH = 19;
  const sh = owned.length * rowH + 54;
  panel(W - 214, 14, 200, sh);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa7ad';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText('LOADOUT · ' + operatorDef().name, W - 200, 32);
  ctx.fillStyle = '#8f9ba4';
  ctx.font = '600 9px Consolas, monospace';
  ctx.fillText(
    'OFF ' + slotsUsed('offense') + '/' + slotCap('offense') + '  ·  DEF ' + slotsUsed('passive') + '/' + slotCap('passive'),
    W - 200,
    45
  );
  ctx.fillStyle = G.relics.length ? '#63dcc0' : '#8f9ba4';
  ctx.fillText('RELICS ' + G.relics.length + ' / ' + RELICS.length, W - 200, 58);
  owned.forEach((id, i) => {
    const y = 74 + i * rowH;
    ctx.fillStyle = SKILLS[id].color;
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(SKILLS[id].short, W - 200, y);
    ctx.fillStyle = '#c9d4dc';
    ctx.font = '600 10px Consolas, monospace';
    ctx.fillText(SKILLS[id].name, W - 168, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8f9ba4';
    ctx.fillText('LV' + G.skills[id], W - 26, y);
    ctx.textAlign = 'left';
  });

  const combo = activeCombos();
  if (combo.length) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(combo.map((c) => c.name).join(' · '), W - 200, 14 + sh + 14);
  }

  const boss = G.enemies.find((e) => e.boss && !e.dead);
  if (boss && screen === 'play') {
    const bw = 400;
    const bx = W / 2 - bw / 2;
    const by = 96;
    ctx.fillStyle = 'rgba(6,10,13,0.72)';
    ctx.fillRect(bx - 6, by, bw + 12, 32);
    ctx.fillStyle = '#2a1113';
    ctx.fillRect(bx, by + 15, bw, 10);
    ctx.fillStyle = boss.hp < boss.maxHp * 0.35 ? '#ff6a4a' : '#d24a3a';
    ctx.fillRect(bx, by + 15, bw * clamp(boss.hp / boss.maxHp, 0, 1), 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd0c0';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(
      (boss.mega ? 'MEGA · ' : '') + (boss.affix ? boss.affix.toUpperCase() + ' ' : '') + BOSS_TYPES[boss.type].name +
        (boss.mega ? '  P' + ((boss.phase || 0) + 1) : '') +
        '  ' + Math.ceil(boss.hp) + ' / ' + boss.maxHp,
      W / 2,
      by + 11
    );
    ctx.textAlign = 'left';
  }

  panel(14, H - 108, 260, 58);
  ctx.fillStyle = '#9aa7ad';
  ctx.font = '10px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('HEALTH', 28, H - 86);
  ctx.textAlign = 'right';
  ctx.fillStyle = G.hp > 50 ? '#7fe0a0' : G.hp > 25 ? '#e0b13c' : '#e2563f';
  ctx.font = '700 14px Consolas, monospace';
  ctx.fillText(Math.ceil(G.hp) + ' / ' + G.maxHp, 260, H - 86);
  ctx.fillStyle = '#232c33';
  ctx.fillRect(28, H - 78, 232, 9);
  ctx.fillStyle = G.hp > 50 ? '#58c46a' : G.hp > 25 ? '#e0b13c' : '#d34a4a';
  ctx.fillRect(28, H - 78, 232 * clamp(G.hp / G.maxHp, 0, 1), 9);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa7ad';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText('SQUAD', 28, H - 60);
  for (let i = 0; i < G.soldiers.length; i++) {
    ctx.fillStyle = '#7fd0ff';
    ctx.beginPath();
    ctx.arc(80 + i * 16, H - 64, 5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#123a52';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (shieldMax() > 0) {
    ctx.fillStyle = '#9aa7ad';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SHIELD', 186, H - 60);
    for (let i = 0; i < shieldMax(); i++) {
      ctx.fillStyle = i < G.shield.charges ? '#9fd8ff' : 'rgba(159,216,255,0.16)';
      ctx.fillRect(230 + i * 9, H - 68, 7, 8);
    }
  }

  const dw = 100;
  const gap = 8;
  const totalW = dw * 3 + gap * 2;
  const left = W / 2 - totalW / 2;
  const dashReady = G.dash.cd <= 0;
  const bombReady = G.bomb.cd <= 0;
  const odOn = odActive();
  panel(left, H - 40, dw, 26);
  panel(left + dw + gap, H - 40, dw, 26);
  panel(left + (dw + gap) * 2, H - 40, dw, 26);
  ctx.font = '700 10px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = dashReady ? '#9fd8ff' : 'rgba(159,216,255,0.38)';
  ctx.fillText(dashReady ? 'SHIFT DASH' : 'DASH ' + G.dash.cd.toFixed(1), left + dw / 2, H - 35);
  ctx.fillStyle = bombReady ? '#ffcf5c' : 'rgba(255,207,92,0.38)';
  ctx.fillText(bombReady ? 'E BOMB' : 'BOMB ' + G.bomb.cd.toFixed(1), left + dw + gap + dw / 2, H - 35);
  const odX = left + (dw + gap) * 2;
  ctx.fillStyle = odOn ? '#ff8a5c' : G.od.heat > 15 ? '#e0b13c' : 'rgba(255,138,92,0.35)';
  ctx.fillText(odOn ? 'OVERDRIVE' : 'R OD ' + Math.round(G.od.heat), odX + dw / 2, H - 35);
  if (!dashReady) {
    ctx.fillStyle = 'rgba(159,216,255,0.3)';
    ctx.fillRect(left + 2, H - 31, (dw - 4) * (1 - G.dash.cd / 1.5), 3);
  }
  if (!bombReady) {
    ctx.fillStyle = 'rgba(255,207,92,0.3)';
    ctx.fillRect(left + dw + gap + 2, H - 31, (dw - 4) * (1 - G.bomb.cd / (G.bomb.max || 6)), 3);
  }
  ctx.fillStyle = 'rgba(255,138,92,0.35)';
  ctx.fillRect(odX + 2, H - 31, (dw - 4) * clamp(G.od.heat / 100, 0, 1), 3);

  ctx.fillStyle = 'rgba(8,11,14,0.92)';
  ctx.fillRect(0, H - 16, W, 16);
  ctx.fillStyle = '#1d2a28';
  ctx.fillRect(0, H - 14, W, 14);
  ctx.fillStyle = '#63dcc0';
  ctx.fillRect(0, H - 14, W * xpPct, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, H - 14, W * xpPct, 4);
  ctx.fillStyle = 'rgba(8,11,14,0.82)';
  ctx.fillRect(4, H - 13, 96, 12);
  ctx.fillRect(W - 108, H - 13, 104, 12);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7fe8d4';
  ctx.font = '700 9px Consolas, monospace';
  ctx.fillText('LEVEL ' + G.level, 9, H - 4);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#d9fff4';
  ctx.fillText('XP ' + Math.floor(G.xp) + ' / ' + G.xpNext, W - 9, H - 4);

  if (G.bannerT > 0 && screen === 'play') {
    const a = clamp(G.bannerT / 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 40px Consolas, monospace';
    ctx.fillText(G.banner, W / 2, 176);
    ctx.fillStyle = 'rgba(230,220,200,0.9)';
    ctx.font = '600 13px Consolas, monospace';
    ctx.fillText(G.bannerSub || 'THE HORDE GROWS', W / 2, 200);
    ctx.restore();
  }

  ctx.textAlign = 'left';
}

function drawWeather() {
  if (!G) return;
  if (!G.event && hasMutator('fog')) {
    const px = G.player.x - G.cam.x;
    const py = G.player.y - G.cam.y;
    const g = ctx.createRadialGradient(px, py, 90, px, py, 300);
    g.addColorStop(0, 'rgba(210,220,230,0)');
    g.addColorStop(0.5, 'rgba(170,185,200,0.20)');
    g.addColorStop(1, 'rgba(130,145,160,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  if (!G.event) return;
  if (G.event.id === 'sandstorm') {
    ctx.fillStyle = 'rgba(190,160,110,0.14)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(230,210,170,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const x = (i * 137 + uiT * 260) % (W + 40);
      const y = (i * 83 + uiT * 120) % (H + 20);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 28, y + 9);
    }
    ctx.stroke();
  } else if (G.event.id === 'blackout') {
    const px = G.player.x - G.cam.x;
    const py = G.player.y - G.cam.y;
    const g = ctx.createRadialGradient(px, py, 70, px, py, 370);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0.86)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawVignette() {
  if (vignetteCanvas) {
    ctx.drawImage(vignetteCanvas, 0, 0, W, H);
  } else if (canOffscreen()) {
    const c = makeOffscreen(W * DPR, H * DPR);
    const g2 = c.getContext && c.getContext('2d');
    if (g2) {
      if (g2.scale) g2.scale(DPR, DPR);
      const g = g2.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.92);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      g2.fillStyle = g;
      g2.fillRect(0, 0, W, H);
      vignetteCanvas = c;
      ctx.drawImage(c, 0, 0, W, H);
    }
  } else {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.92);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (G && G.hurtT > 0) {
    ctx.fillStyle = 'rgba(170,25,25,' + (G.hurtT * 0.55) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

function overlay(alpha) {
  ctx.fillStyle = 'rgba(6,8,10,' + alpha + ')';
  ctx.fillRect(0, 0, W, H);
}

function drawMenuScreen() {
  drawMenuBackdrop();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b25c';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('A I K I T   ·   B U I L T   F O R   T H E   H O R D E', W / 2, 104);
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 58px Consolas, monospace';
  ctx.fillText('DUSTLINE', W / 2, 162);
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 20px Consolas, monospace';
  ctx.fillText('S U R V I V O R S', W / 2, 194);
  ctx.fillStyle = 'rgba(210,200,175,0.7)';
  ctx.font = '600 12px Consolas, monospace';
  ctx.fillText('You move. The squad shoots. The horde never ends.', W / 2, 224);

  drawButton('play', 'DEPLOY', W / 2, 246, 260, 48);
  drawButton('armory', 'ARMORY', W / 2 - 134, 302, 128, 40, 'SHARDS ' + save.shards);
  drawButton('daily', 'DAILY', W / 2 + 134, 302, 128, 40);
  drawButton('statistics', 'STATS', W / 2 - 134, 350, 128, 40);
  drawButton('upgrades', 'UPGRADES', W / 2 + 134, 350, 128, 40);
  drawButton('manual', 'MANUAL', W / 2 - 134, 398, 128, 40);
  drawButton('settings', 'SETTINGS', W / 2 + 134, 398, 128, 40);
  drawButton('help', 'HOW TO PLAY', W / 2, 446, 260, 40);

  ctx.fillStyle = 'rgba(220,205,175,0.6)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('BEST SURVIVAL ' + fmtTime(best.time) + '   ·   ' + best.kills + ' KILLS   ·   ' + save.runs + ' RUNS', W / 2, 512);
  ctx.fillStyle = 'rgba(200,190,165,0.45)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('TOTAL KILLS ' + save.totalKills + '   ·   BOSSES ' + save.bossKills + '   ·   WINS ' + save.wins + '   ·   ACHIEVEMENTS ' + achievementUnlocked() + '/' + ACHIEVEMENTS.length, W / 2, 534);
}

function drawSetupScreen() {
  drawMenuBackdrop();
  overlay(0.35);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 26px Consolas, monospace';
  ctx.fillText('LOADOUT', W / 2, 46);
  ctx.fillStyle = 'rgba(200,190,165,0.65)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('WEAPON · MAP · TIME LIMIT · DIFFICULTY · ' + slotCap('offense') + ' OFF / ' + slotCap('passive') + ' DEF SLOTS', W / 2, 64);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('WEAPON', 92, 84);
  WEAPON_ORDER.forEach((id, i) => {
    const w = WEAPONS[id];
    const chosen = setup.weapon === id;
    const x = 92 + i * 166;
    const y = 92;
    uiButtons.push({ id: 'weapon-' + id, label: w.name, x, y, w: 158, h: 58 });
    const hover = mouse.x >= x && mouse.x <= x + 158 && mouse.y >= y && mouse.y <= y + 54;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.24)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.92)';
    ctx.strokeStyle = chosen ? '#ffd27a' : 'rgba(224,178,92,0.3)';
    rr(x, y, 158, 54, 7);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = w.color;
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillText(w.name, x + 12, y + 26);
    ctx.fillStyle = 'rgba(210,205,190,0.72)';
    ctx.font = '600 10px Consolas, monospace';
    ctx.fillText(w.blurb, x + 12, y + 46);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('MAP', 92, 166);
  MAP_ORDER.forEach((id, i) => {
    const m = MAPS[id];
    const chosen = setup.map === id;
    const x = 92 + i * 196;
    const y = 174;
    uiButtons.push({ id: 'map-' + id, label: m.name, x, y, w: 184, h: 54 });
    const hover = mouse.x >= x && mouse.x <= x + 184 && mouse.y >= y && mouse.y <= y + 54;
    ctx.fillStyle = m.sky[0];
    rr(x, y, 184, 54, 7);
    ctx.fill();
    ctx.globalAlpha = chosen ? 0.3 : 0.55;
    ctx.fillStyle = '#06080a';
    rr(x, y, 184, 54, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = chosen ? m.accent : hover ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = chosen ? 2.5 : 1.5;
    rr(x, y, 184, 54, 7);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? '#fff6e2' : '#e8e2d4';
    ctx.font = '700 13px Consolas, monospace';
    ctx.fillText(m.name, x + 12, y + 23);
    ctx.fillStyle = 'rgba(235,230,215,0.75)';
    ctx.font = '600 10px Consolas, monospace';
    ctx.fillText('HAZARD · ' + HAZARDS[m.hazard].name, x + 12, y + 42);
    ctx.fillStyle = m.props.building;
    ctx.fillRect(x + 138, y + 14, 9, 9);
    ctx.fillStyle = m.props.rock;
    ctx.beginPath();
    ctx.arc(x + 156, y + 18, 4.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = m.props.tree;
    ctx.beginPath();
    ctx.arc(x + 170, y + 18, 4, 0, TAU);
    ctx.fill();
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('TIME LIMIT', 92, 246);
  TIME_LIMITS.forEach((lim, i) => {
    const chosen = setup.limit === lim.id;
    const x = 92 + i * 196;
    const y = 254;
    uiButtons.push({ id: 'limit-' + lim.id, label: lim.label, x, y, w: 184, h: 28 });
    const hover = mouse.x >= x && mouse.x <= x + 184 && mouse.y >= y && mouse.y <= y + 28;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.24)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? '#ffd27a' : 'rgba(224,178,92,0.3)';
    rr(x, y, 184, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = chosen ? '#fff3d6' : '#cfc6ad';
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText(lim.label, x + 92, y + 19);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('DIFFICULTY', 92, 300);
  DIFFICULTY_ORDER.forEach((id, i) => {
    const diff = findDifficulty(id);
    const chosen = setup.difficulty === id;
    const x = 92 + i * 260;
    const y = 308;
    uiButtons.push({ id: 'difficulty-' + id, label: diff.name, x, y, w: 248, h: 40 });
    const hover = mouse.x >= x && mouse.x <= x + 248 && mouse.y >= y && mouse.y <= y + 40;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.22)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? diff.color : 'rgba(224,178,92,0.25)';
    rr(x, y, 248, 40, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? diff.color : '#d8d0bd';
    ctx.font = '700 13px Consolas, monospace';
    ctx.fillText(diff.name, x + 12, y + 17);
    ctx.fillStyle = 'rgba(200,195,180,0.65)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(diff.blurb + '  ·  LOOT x' + diff.shard, x + 12, y + 31);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('MODE', 92, 358);
  MODES.forEach((mode, i) => {
    const chosen = setup.mode === mode.id;
    const x = 92 + i * 260;
    const y = 364;
    uiButtons.push({ id: 'mode-' + mode.id, label: mode.name, x, y, w: 248, h: 26 });
    const hover = mouse.x >= x && mouse.x <= x + 248 && mouse.y >= y && mouse.y <= y + 26;
    ctx.fillStyle = chosen ? 'rgba(99,220,192,0.2)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? '#63dcc0' : 'rgba(224,178,92,0.22)';
    rr(x, y, 248, 26, 5);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? '#63dcc0' : '#cfc6ad';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(mode.name, x + 10, y + 12);
    ctx.fillStyle = 'rgba(190,185,170,0.6)';
    ctx.font = '600 8px Consolas, monospace';
    ctx.fillText(mode.blurb, x + 10, y + 22);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('OPERATOR', 92, 404);
  OPERATOR_ORDER.forEach((id, i) => {
    const op = OPERATORS.find((o) => o.id === id);
    const chosen = setup.operator === id;
    const x = 92 + i * 166;
    const y = 410;
    uiButtons.push({ id: 'operator-' + id, label: op.name, x, y, w: 158, h: 26 });
    const hover = mouse.x >= x && mouse.x <= x + 158 && mouse.y >= y && mouse.y <= y + 26;
    ctx.fillStyle = chosen ? 'rgba(99,220,192,0.2)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? op.color : 'rgba(224,178,92,0.22)';
    rr(x, y, 158, 26, 5);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? op.color : '#cfc6ad';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(op.name, x + 9, y + 12);
    ctx.fillStyle = 'rgba(190,185,170,0.6)';
    ctx.font = '600 8px Consolas, monospace';
    ctx.fillText(op.blurb, x + 9, y + 22);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('MUTATORS · CHOOSE UP TO 2 FOR EXTRA LOOT', 92, 450);
  MUTATOR_ORDER.forEach((id, i) => {
    const def = mutatorDef(id);
    const chosen = setup.mutators.indexOf(id) >= 0;
    const x = 92 + (i % 3) * 260;
    const y = 456 + Math.floor(i / 3) * 26;
    uiButtons.push({ id: 'mutator-' + id, label: def.name, x, y, w: 248, h: 24 });
    const hover = mouse.x >= x && mouse.x <= x + 248 && mouse.y >= y && mouse.y <= y + 24;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.22)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? def.color : 'rgba(224,178,92,0.22)';
    rr(x, y, 248, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? def.color : '#cfc6ad';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(def.name, x + 10, y + 11);
    ctx.fillStyle = 'rgba(190,185,170,0.6)';
    ctx.font = '600 8px Consolas, monospace';
    ctx.fillText(def.blurb + '  ·  LOOT x' + def.shard, x + 10, y + 21);
  });

  drawButton(
    'setup-start',
    'DEPLOY',
    W / 2,
    512,
    380,
    40,
    WEAPONS[setup.weapon].name + ' · ' + MAPS[setup.map].name + ' · ' +
      findLimit(setup.limit).label + ' · ' + findDifficulty(setup.difficulty).name + ' · ' +
      operatorDefName() + ' · ' + (setup.mode === 'bossrush' ? RUSH_TARGET + ' BOSSES' : 'SURVIVORS')
  );
  drawButton('back-setup', 'BACK', W / 2, 558, 180, 28);
}

function drawArmoryScreen() {
  drawMenuBackdrop();
  overlay(0.3);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText('ARMORY', W / 2, 72);
  ctx.fillStyle = 'rgba(200,190,165,0.7)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('PERMANENT UPGRADES · PAID WITH SHARDS FROM ANY RUN', W / 2, 94);
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 18px Consolas, monospace';
  ctx.fillText('SHARDS ' + save.shards, W / 2, 124);

  META_ORDER.forEach((id, i) => {
    const meta = META[id];
    const rank = metaRank(id);
    const maxed = rank >= meta.max;
    const cost = meta.cost(rank);
    const y = 146 + i * 46;
    ctx.fillStyle = 'rgba(16,20,24,0.92)';
    ctx.strokeStyle = 'rgba(224,178,92,0.28)';
    rr(300, y, 420, 40, 7);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2e6c8';
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText(meta.name, 318, y + 17);
    ctx.fillStyle = 'rgba(200,195,180,0.7)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(meta.desc, 318, y + 31);
    for (let r = 0; r < meta.max; r++) {
      ctx.fillStyle = r < rank ? '#63dcc0' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(548 + r * 14, y + 14, 10, 4);
    }
    const canBuy = !maxed && save.shards >= cost;
    drawButton('meta-' + id, maxed ? 'MAX' : cost + ' SH', 636, y + 4, 76, 32);
    if (!canBuy && !maxed) {
      ctx.fillStyle = 'rgba(255,90,70,0.75)';
      ctx.font = '700 9px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('NEED ' + cost, 548, y + 31);
    }
    ctx.textAlign = 'left';
  });

  ctx.textAlign = 'center';
  drawButton('back-armory', 'BACK', W / 2, 496, 180, 34);
}

function drawStatisticsScreen() {
  drawMenuBackdrop();
  overlay(0.3);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText('STATISTICS', W / 2, 72);
  ctx.fillStyle = 'rgba(200,190,165,0.65)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('ALL RUNS ON THIS BROWSER', W / 2, 94);

  const rows = [
    ['RUNS', String(save.runs)],
    ['TOTAL KILLS', String(save.totalKills)],
    ['BOSSES SLAIN', String(save.bossKills)],
    ['VICTORIES', String(save.wins)],
    ['BEST SURVIVAL', fmtTime(save.bestTime)],
    ['MOST KILLS IN A RUN', String(save.bestKills)],
    ['DAMAGE DEALT', String(save.damageDealt)],
    ['SHARDS EARNED', String(save.shards)],
    ['SHARDS SECURED', String(save.bankedTotal || 0)],
    ['SHARDS LOST', String(save.lostTotal || 0)],
    ['CRIT DATA JACKPOTS', String(save.jackpots || 0)],
    ['NEAR MISSES', String(save.nearMisses || 0)],
    ['HUNTERS DOWN', String(save.hunters || 0)],
    ['CONTRACTS DONE', String(save.contracts || 0)],
    ['CHAMPIONS SLAIN', String(save.champions || 0)],
    ['CACHES OPENED', String(save.chests || 0)],
    ['RUSH CLEARS', String(save.rushClears || 0)],
    ['BEST RUSH', save.rushBest > 0 ? fmtTime(save.rushBest) : '—'],
    ['BEST WAVE', String(save.bestWave || 1)],
    ['ACHIEVEMENTS', achievementUnlocked() + ' / ' + ACHIEVEMENTS.length],
    ['ARMORY RANKS', String(META_ORDER.reduce((sum, id) => sum + metaRank(id), 0))]
  ];
  ctx.textAlign = 'left';
  rows.forEach((row, i) => {
    const col = i % 3;
    const line = Math.floor(i / 3);
    const x = 142 + col * 228;
    const y = 118 + line * 38;
    ctx.fillStyle = 'rgba(16,20,24,0.9)';
    rr(x, y, 214, 34, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,175,155,0.7)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(row[0], x + 12, y + 14);
    ctx.fillStyle = '#f2e6c8';
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillText(row[1], x + 12, y + 28);
  });

  const types = Object.keys(save.killsByType);
  ctx.fillStyle = 'rgba(180,175,155,0.7)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('KILLS BY TYPE', 142, 394);
  if (!types.length) {
    ctx.fillStyle = 'rgba(160,155,145,0.6)';
    ctx.fillText('NO KILLS RECORDED YET', 142, 408);
  } else {
    types.sort((a, b) => save.killsByType[b] - save.killsByType[a]);
    types.slice(0, 12).forEach((type, i) => {
      const def = ENEMY_TYPES[type] || BOSS_TYPES[type];
      const x = 142 + (i % 4) * 180;
      const y = 412 + Math.floor(i / 4) * 26;
      ctx.fillStyle = def ? def.color : '#888';
      ctx.beginPath();
      ctx.arc(x + 5, y + 3, 4.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,215,200,0.8)';
      ctx.font = '600 10px Consolas, monospace';
      ctx.fillText((def ? def.name : type) + '  ' + save.killsByType[type], x + 15, y + 7);
    });
  }

  ctx.textAlign = 'center';
  drawButton('back-stats', 'BACK', W / 2, 500, 180, 40);
}

function drawSettingsScreen() {
  if (G) {
    overlay(0.78);
  } else {
    drawMenuBackdrop();
    overlay(0.35);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 30px Consolas, monospace';
  ctx.fillText('SETTINGS', W / 2, 96);

  const rowLabel = (label, y, note) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cbbf9f';
    ctx.font = '600 15px Consolas, monospace';
    ctx.fillText(label, 246, y);
    if (note) {
      ctx.fillStyle = 'rgba(180,175,155,0.6)';
      ctx.font = '600 10px Consolas, monospace';
      ctx.fillText(note, 246, y + 16);
    }
    ctx.textAlign = 'center';
  };

  rowLabel('MASTER VOLUME', 190, 'All game audio');
  drawButton('volume-down', '-', 636, 166, 46, 34);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e7eef3';
  ctx.font = '700 18px Consolas, monospace';
  ctx.fillText(settings.volume + '%', 690, 188);
  drawButton('volume-up', '+', 744, 166, 46, 34);

  rowLabel('SCREEN SHAKE', 256, 'Camera kick on hits and blasts');
  drawButton('shake', settings.shake ? 'ON' : 'OFF', 744, 232, 110, 34);

  rowLabel('DAMAGE NUMBERS', 322, 'Floating hit values');
  drawButton('damage-numbers', settings.damageNumbers ? 'ON' : 'OFF', 744, 298, 110, 34);

  drawButton('back-settings', 'BACK', W / 2, 388, 180, 44);
  ctx.fillStyle = 'rgba(190,180,155,0.55)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SETTINGS ARE SAVED AUTOMATICALLY', W / 2, 456);
}

function startDaily() {
  const rules = dailyRules(dailyDay());
  dailyOverride !== null ? null : null;
  startRun({
    weapon: rules.weapon,
    map: rules.map,
    difficulty: rules.difficulty,
    mode: rules.mode,
    operator: rules.operator,
    mutators: rules.mutators,
    seed: rules.seed,
    daily: rules.day
  });
  G.banner = 'DAILY CHALLENGE';
  G.bannerSub = OPERATORS.find((o) => o.id === rules.operator).name + ' · ' + rules.difficulty.toUpperCase() + ' · ' + (rules.mode === 'bossrush' ? 'BOSS RUSH' : 'SURVIVORS');
  G.bannerT = 3;
  G.news = 'Daily seed ' + rules.seed + ' engaged.';
}

function drawDailyScreen() {
  drawMenuBackdrop();
  overlay(0.34);
  const info = dailyInfo();
  const r = info.rules;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#63dcc0';
  ctx.font = '700 30px Consolas, monospace';
  ctx.fillText('DAILY CHALLENGE', W / 2, 78);
  ctx.fillStyle = 'rgba(200,190,165,0.7)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('ONE SEED SHARED BY EVERYONE · BEST RUN OF THE DAY IS KEPT', W / 2, 100);

  const rows = [
    ['OPERATOR', OPERATORS.find((o) => o.id === r.operator).name],
    ['WEAPON', WEAPONS[r.weapon].name],
    ['MAP', MAPS[r.map].name],
    ['DIFFICULTY', findDifficulty(r.difficulty).name],
    ['MODE', r.mode === 'bossrush' ? 'BOSS RUSH · ' + RUSH_TARGET + ' BOSSES' : 'SURVIVORS'],
    ['MUTATORS', r.mutators.length ? r.mutators.map((id) => mutatorDef(id).name).join(' + ') : 'NONE'],
    ['SEED', String(r.seed)]
  ];
  rows.forEach((row, i) => {
    const x = 240;
    const y = 132 + i * 40;
    ctx.fillStyle = 'rgba(16,20,24,0.9)';
    rr(x, y, 480, 32, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(99,220,192,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(170,165,150,0.75)';
    ctx.font = '600 10px Consolas, monospace';
    ctx.fillText(row[0], x + 14, y + 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e6efe9';
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText(row[1], x + 466, y + 20);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200,195,180,0.65)';
  ctx.font = '600 10px Consolas, monospace';
  if (info.best) {
    const b = info.best;
    ctx.fillText(
      'TODAY BEST · ' + (b.win ? 'WIN' : 'LOSS') + ' · ' + b.kills + ' KILLS · ' + fmtTime(b.time),
      W / 2,
      432
    );
  } else {
    ctx.fillText('NO ATTEMPT YET TODAY', W / 2, 432);
  }

  drawButton('start-daily', 'START DAILY', W / 2, 458, 300, 44);
  drawButton('back-daily', 'BACK', W / 2, 512, 180, 32);
}

function drawManualScreen() {
  drawMenuBackdrop();
  overlay(0.34);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText('FIELD MANUAL', W / 2, 56);
  ctx.fillStyle = 'rgba(200,190,165,0.65)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('EVERY HOSTILE, BOSS AND RELIC · KILL COUNTS ARE LIFETIME', W / 2, 76);

  const tabs = [
    ['manual-enemies', 'HOSTILES · ' + Object.keys(ENEMY_TYPES).length, 'enemies'],
    ['manual-bosses', 'BOSSES · ' + Object.keys(BOSS_TYPES).length, 'bosses'],
    ['manual-relics', 'RELICS · ' + RELICS.length, 'relics']
  ];
  tabs.forEach(([id, label, key], i) => {
    const x = W / 2 - 300 + i * 200;
    const chosen = manualTab === key;
    uiButtons.push({ id, label, x, y: 92, w: 190, h: 28 });
    const hover = mouse.x >= x && mouse.x <= x + 190 && mouse.y >= 92 && mouse.y <= 120;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.24)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? '#ffd27a' : 'rgba(224,178,92,0.26)';
    rr(x, 92, 190, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = chosen ? '#fff3d6' : '#cfc6ad';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(label, x + 95, 111);
  });

  const live = G && (screen === 'play' || screen === 'paused');
  const killsFor = (type) =>
    (save.killsByType[type] || 0) + (live ? G.killsByType[type] || 0 : 0);

  if (manualTab === 'enemies') {
    const ids = Object.keys(ENEMY_TYPES);
    ids.forEach((id, i) => {
      const def = ENEMY_TYPES[id];
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 28 + col * 226;
      const y = 126 + row * 60;
      ctx.fillStyle = 'rgba(14,18,22,0.86)';
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      rr(x, y, 216, 54, 6);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = def.color;
      ctx.font = '700 11px Consolas, monospace';
      ctx.fillText(def.name.toUpperCase(), x + 9, y + 15);
      ctx.textAlign = 'right';
      ctx.fillStyle = killsFor(id) > 0 ? '#63dcc0' : 'rgba(150,150,150,0.5)';
      ctx.font = '600 9px Consolas, monospace';
      ctx.fillText(killsFor(id) + ' KILLED', x + 207, y + 15);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(175,170,155,0.75)';
      ctx.font = '600 8px Consolas, monospace';
      ctx.fillText('HP ' + def.hp + ' · SPD ' + def.speed + ' · DMG ' + def.touch + ' · XP ' + def.xp, x + 9, y + 30);
      ctx.fillStyle = 'rgba(215,210,195,0.72)';
      ctx.fillText(ENEMY_TIPS[id] || '', x + 9, y + 44);
    });
  } else if (manualTab === 'bosses') {
    const ids = Object.keys(BOSS_TYPES);
    ids.forEach((id, i) => {
      const def = BOSS_TYPES[id];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 120 + col * 380;
      const y = 136 + row * 96;
      ctx.fillStyle = 'rgba(14,18,22,0.9)';
      ctx.strokeStyle = def.mega ? 'rgba(180,140,255,0.5)' : 'rgba(255,90,70,0.35)';
      ctx.lineWidth = def.mega ? 2 : 1;
      rr(x, y, 360, 86, 8);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = def.color;
      ctx.font = '700 15px Consolas, monospace';
      ctx.fillText(def.name, x + 12, y + 22);
      ctx.textAlign = 'right';
      ctx.fillStyle = def.mega ? '#b48cff' : '#ff8a7a';
      ctx.font = '700 9px Consolas, monospace';
      ctx.fillText(def.mega ? 'MEGA BOSS' : 'BOSS', x + 348, y + 22);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(175,170,155,0.75)';
      ctx.font = '600 9px Consolas, monospace';
      ctx.fillText('BASE HP ' + def.hp + ' · SPEED ' + def.speed + ' · TOUCH ' + def.touch, x + 12, y + 40);
      ctx.fillStyle = 'rgba(215,210,195,0.75)';
      ctx.font = '600 10px Consolas, monospace';
      const words = (BOSS_TIPS[id] || '').split(' ');
      let line = '';
      let ly = y + 58;
      for (const word of words) {
        const next = line ? line + ' ' + word : word;
        if (next.length > 46 && line) {
          ctx.fillText(line, x + 12, ly);
          ly += 13;
          line = word;
        } else {
          line = next;
        }
      }
      if (line) ctx.fillText(line, x + 12, ly);
      ctx.fillStyle = 'rgba(150,145,130,0.55)';
      ctx.font = '600 9px Consolas, monospace';
      ctx.fillText('BEST WAVE ' + (save.bestWave || 1), x + 12, y + 78);
    });
  } else {
    RELICS.forEach((relic, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 120 + col * 380;
      const y = 132 + row * 70;
      const owned = live && G.relics.indexOf(relic.id) >= 0;
      ctx.fillStyle = 'rgba(14,18,22,0.9)';
      ctx.strokeStyle = owned ? relic.color : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = owned ? 2 : 1;
      rr(x, y, 360, 60, 6);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = relic.color;
      ctx.font = '700 12px Consolas, monospace';
      ctx.fillText(relic.name, x + 12, y + 20);
      ctx.fillStyle = 'rgba(215,210,195,0.75)';
      ctx.font = '600 10px Consolas, monospace';
      ctx.fillText(relic.desc, x + 12, y + 38);
      ctx.fillStyle = 'rgba(150,145,130,0.55)';
      ctx.font = '600 8px Consolas, monospace';
      ctx.fillText('FROM BOSS SALVAGE', x + 12, y + 52);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(190,185,170,0.55)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText('OWN ALL TEN AND CRATES PAY 30 SHARDS INSTEAD', W / 2, 496);
  }

  ctx.textAlign = 'center';
  drawButton('back-manual', 'BACK', W / 2, 540, 180, 32);
}

function drawHelpScreen() {
  drawMenuBackdrop();
  overlay(0.3);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 30px Consolas, monospace';
  ctx.fillText('HOW TO PLAY', W / 2, 82);
  const lines = [
    ['MOVE', 'WASD or arrows. The map is infinite and dotted with cover.'],
    ['DASH', 'Shift or Space bursts forward with brief invulnerability.'],
    ['BOMB', 'Press E to throw a bomb at the thickest part of the horde.'],
    ['OVERDRIVE', 'Press R to burn heat: +40% damage, +50% damage taken.'],
    ['FIGHT', 'Your weapon fires automatically at the nearest hostile.'],
    ['LEVEL UP', 'Collect gems, then pick one of three upgrades every level.'],
    ['COMBOS', 'Some skill pairs unlock a bonus once both reach level 2.'],
    ['WAVES', 'Every 40s the horde grows. New enemy types join over time.'],
    ['BOSS', 'Bosses every 5th wave; every 4th boss is a MEGA boss.'],
    ['EVOLVE', 'Max a weapon and take its partner to level 3 to evolve it.'],
    ['DIFFICULTY', 'Normal, Brutal or Nightmare: tougher mobs pay more shards.'],
    ['HAZARDS', 'Each map has a terrain hazard: quicksand, ice, embers or vines.'],
    ['MUTATORS', 'Take up to two run modifiers for extra shard loot.'],
    ['EXTRACT', 'Bosses arm a beacon: bank shards there or risk losing half.'],
    ['EVENTS', 'Horde surges, supply drops, storms and hunters hit the sector.'],
    ['MAP', 'Press M during a run to see contracts, alerts and the beacon.'],
    ['DAILY', 'One seeded run per day with a fixed loadout. Beat your best.'],
    ['SLOTS', 'Six offense and six defense skills per run. Rig ranks add more.'],
    ['PAUSE', 'Esc opens the pause menu with settings, map and restart.']
  ];
  let y = 100;
  for (const line of lines) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e0b25c';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(line[0], 146, y);
    ctx.fillStyle = 'rgba(225,215,195,0.82)';
    ctx.font = '600 12px Consolas, monospace';
    ctx.fillText(line[1], 270, y);
    y += 22;
  }
  drawButton('back-help', 'BACK', W / 2, 532, 180, 30);
}

function drawUpgradesScreen() {
  if (G) {
    overlay(0.8);
  } else {
    drawMenuBackdrop();
    overlay(0.35);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText('UPGRADES', W / 2, 58);
  ctx.fillStyle = 'rgba(200,190,165,0.65)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('EVERY SKILL CAPS AT LEVEL 5 · PICK THREE CARDS ON LEVEL UP', W / 2, 78);

  SKILL_ORDER.forEach((id, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 42 + col * 178;
    const y = 100 + row * 72;
    const skill = SKILLS[id];
    const lvl = G ? G.skills[id] : 0;
    ctx.fillStyle = 'rgba(14,18,22,0.78)';
    ctx.strokeStyle = lvl > 0 ? skill.color : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = lvl > 0 ? 1.5 : 1;
    rr(x, y, 168, 66, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = skill.color;
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText(skill.name, x + 10, y + 16);
    ctx.fillStyle = 'rgba(210,205,190,0.68)';
    ctx.font = '600 9px Consolas, monospace';
    const words = skill.desc.split(' ');
    let line = '';
    let ly = y + 30;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (next.length > 27 && line) {
        ctx.fillText(line, x + 10, ly);
        ly += 10;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x + 10, ly);
    ctx.fillStyle = 'rgba(180,175,155,0.6)';
    ctx.font = '600 9px Consolas, monospace';
    const evo = EVOLUTIONS[id];
    const tail = evo
      ? 'LV ' + lvl + '/' + skill.max + ' · EVO ' + evo.name + ' (' + SKILLS[evo.needs].short + '3)'
      : 'LV ' + lvl + '/' + skill.max + ' · ' + skill.kind.toUpperCase();
    ctx.fillText(tail, x + 10, y + 60);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(180,175,155,0.7)';
  ctx.font = '600 9px Consolas, monospace';
  ctx.fillText('COMBOS', 42, 392);
  COMBOS.forEach((combo, i) => {
    const x = 42 + (i % 3) * 300;
    const y = 406 + Math.floor(i / 3) * 34;
    const active = G ? combo.needs.every((s) => G.skills[s] >= 2) : false;
    ctx.fillStyle = active ? combo.color : 'rgba(200,195,180,0.45)';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText((active ? '● ' : '○ ') + combo.name, x, y);
    ctx.fillStyle = 'rgba(190,185,170,0.55)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(combo.needs.map((s) => SKILLS[s].short).join(' + '), x, y + 11);
    ctx.fillText(combo.desc, x, y + 22);
  });

  drawButton('back-upgrades', 'BACK', W / 2, 512, 180, 34);
}

function drawPauseScreen() {
  overlay(0.68);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 38px Consolas, monospace';
  ctx.fillText('PAUSED', W / 2, 128);
  drawButton('resume', 'RESUME', W / 2, 154, 260, 46);
  drawButton('mapview-pause', 'MAP', W / 2, 210, 260, 40);
  drawButton('upgrades-pause', 'UPGRADES', W / 2, 258, 260, 40);
  drawButton('settings-pause', 'SETTINGS', W / 2, 306, 260, 40);
  drawButton('restart', 'RESTART RUN', W / 2, 354, 260, 40);
  drawButton('menu-pause', 'MAIN MENU', W / 2, 402, 260, 40);
  ctx.fillStyle = 'rgba(200,190,165,0.55)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('ESC RESUMES', W / 2, 466);
}

function drawLevelUpScreen() {
  overlay(0.74);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 32px Consolas, monospace';
  ctx.fillText('LEVEL ' + G.level, W / 2, 92);
  ctx.fillStyle = 'rgba(220,210,190,0.72)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('CHOOSE AN UPGRADE — PRESS 1, 2 OR 3   ·   R REROLLS', W / 2, 114);

  const startX = (W - (240 * 3 + 24 * 2)) / 2;
  const cardY = 142;
  G.offers.forEach((id, i) => {
    const x = startX + i * 264;
    uiButtons.push({ id: 'banish-' + i, label: 'BANISH', x: x + 240 - 30, y: cardY + 8, w: 22, h: 22 });
  });

  G.offers.forEach((id, i) => {
    const skill = SKILLS[id];
    const lvl = G.skills[id];
    const evo = EVOLUTIONS[id];
    const x = startX + i * 264;
    const y = cardY;
    const w = 240;
    const h = 286;
    uiButtons.push({ id: 'upgrade-' + i, label: skill.name, x, y, w, h });
    const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    ctx.fillStyle = hover ? 'rgba(36,40,44,0.98)' : 'rgba(18,22,26,0.94)';
    ctx.strokeStyle = hover ? skill.color : 'rgba(224,178,92,0.4)';
    rr(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(180,175,155,0.55)';
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillText('×', x + w - 21, y + 24);
    ctx.textAlign = 'center';
    ctx.fillStyle = skill.color;
    ctx.font = '700 17px Consolas, monospace';
    ctx.fillText(skill.name, x + w / 2, y + 50);
    ctx.fillStyle = 'rgba(190,185,165,0.65)';
    ctx.font = '600 11px Consolas, monospace';
    const group = skillGroup(id);
    const tag = group === 'passive' ? 'DEF' : 'OFF';
    ctx.fillText(
      lvl === 0 ? 'NEW · ' + tag + ' ' + slotsUsed(group) + '/' + slotCap(group) : 'LEVEL ' + lvl + ' → ' + (lvl + 1),
      x + w / 2,
      y + 74
    );
    ctx.fillStyle = 'rgba(220,215,200,0.85)';
    ctx.font = '600 12px Consolas, monospace';
    const words = skill.desc.split(' ');
    let line = '';
    let ly = y + 122;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (next.length > 26 && line) {
        ctx.fillText(line, x + w / 2, ly);
        ly += 18;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x + w / 2, ly);
    if (evo) {
      ctx.fillStyle = G.evolved[id] ? '#7fe0a0' : 'rgba(255,210,122,0.62)';
      ctx.font = '600 10px Consolas, monospace';
      ctx.fillText(
        G.evolved[id] ? 'EVOLVED · ' + evo.name : 'EVOLVES · ' + SKILLS[evo.needs].name,
        x + w / 2,
        y + h - 52
      );
    }
    ctx.fillStyle = skill.color;
    ctx.font = '700 40px Consolas, monospace';
    ctx.fillText(String(i + 1), x + w / 2, y + h - 22);
  });

  drawButton('reroll', 'REROLL (' + G.rerolls + ')', W / 2 - 120, 446, 170, 38);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(190,185,170,0.55)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('CLICK × TO BANISH (' + G.banishes + ' LEFT)', W / 2 + 120, 470);
}

function drawRelicScreen() {
  overlay(0.74);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#63dcc0';
  ctx.font = '700 32px Consolas, monospace';
  ctx.fillText('SALVAGE', W / 2, 92);
  ctx.fillStyle = 'rgba(220,210,190,0.72)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('CHOOSE ONE RELIC — PERMANENT FOR THIS RUN — PRESS 1, 2 OR 3', W / 2, 114);

  const count = G.relicOffers.length;
  const startX = (W - (240 * count + 24 * (count - 1))) / 2;
  const cardY = 150;
  G.relicOffers.forEach((id, i) => {
    const relic = RELICS.find((r) => r.id === id);
    const x = startX + i * 264;
    const y = cardY;
    const w = 240;
    const h = 240;
    uiButtons.push({ id: 'relic-' + i, label: relic.name, x, y, w, h });
    const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    ctx.fillStyle = hover ? 'rgba(36,40,44,0.98)' : 'rgba(18,22,26,0.94)';
    ctx.strokeStyle = hover ? relic.color : 'rgba(99,220,192,0.4)';
    rr(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = relic.color;
    ctx.font = '700 17px Consolas, monospace';
    ctx.fillText(relic.name, x + w / 2, y + 58);
    ctx.fillStyle = 'rgba(220,215,200,0.85)';
    ctx.font = '600 12px Consolas, monospace';
    const words = relic.desc.split(' ');
    let line = '';
    let ly = y + 108;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (next.length > 26 && line) {
        ctx.fillText(line, x + w / 2, ly);
        ly += 18;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x + w / 2, ly);
    ctx.fillStyle = relic.color;
    ctx.font = '700 40px Consolas, monospace';
    ctx.fillText(String(i + 1), x + w / 2, y + h - 22);
  });

  ctx.fillStyle = 'rgba(190,185,170,0.55)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('RELICS OWNED ' + G.relics.length + ' / ' + RELICS.length, W / 2, 424);
}

function drawMapView() {
  overlay(0.8);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 26px Consolas, monospace';
  ctx.fillText('MAP · ' + MAPS[G.map].name, W / 2, 44);
  ctx.fillStyle = 'rgba(200,190,165,0.7)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('EXPLORED TERRITORY, COVER AND HOSTILES', W / 2, 64);

  const view = 420;
  const left = W / 2 - view / 2;
  const top = 84;
  const CELL = 120;
  const scale = view / 2400;
  const px = G.player.x;
  const py = G.player.y;
  const toScreen = (x, y) => ({
    x: left + view / 2 + (x - px) * scale,
    y: top + view / 2 + (y - py) * scale
  });

  ctx.fillStyle = 'rgba(6,8,10,0.85)';
  ctx.fillRect(left, top, view, view);

  const cells = Object.keys(G.explored);
  const cx = Math.floor(px / CELL);
  const cy = Math.floor(py / CELL);
  for (const key of cells) {
    const parts = key.split(',');
    const gx = Number(parts[0]);
    const gy = Number(parts[1]);
    const p = toScreen(gx * CELL, gy * CELL);
    ctx.fillStyle = 'rgba(224,178,92,0.10)';
    ctx.fillRect(p.x, p.y, CELL * scale + 1, CELL * scale + 1);
  }

  const props = propsNear(px, py, 1200);
  for (const prop of props) {
    const p = toScreen(prop.x, prop.y);
    if (p.x < left || p.x > left + view || p.y < top || p.y > top + view) continue;
    if (prop.kind === 'building') {
      ctx.fillStyle = '#a58a5c';
      ctx.fillRect(p.x - (prop.w * scale) / 2, p.y - (prop.h * scale) / 2, Math.max(2, prop.w * scale), Math.max(2, prop.h * scale));
    } else {
      ctx.fillStyle = prop.kind === 'rock' ? '#8d8375' : '#4d7a45';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, prop.r * scale), 0, TAU);
      ctx.fill();
    }
  }

  for (const e of G.enemies) {
    const p = toScreen(e.x, e.y);
    if (p.x < left || p.x > left + view || p.y < top || p.y > top + view) continue;
    ctx.fillStyle = e.boss ? '#ff6a4a' : '#c0281f';
    ctx.beginPath();
    ctx.arc(p.x, p.y, e.boss ? 4.5 : 2.2, 0, TAU);
    ctx.fill();
  }

  if (G.beacon) {
    const p = toScreen(G.beacon.x, G.beacon.y);
    ctx.strokeStyle = '#63dcc0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#63dcc0';
    ctx.font = '700 8px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXTRACT', p.x, p.y - 11);
    ctx.textAlign = 'left';
  }

  const me = toScreen(px, py);
  ctx.fillStyle = '#7fd0ff';
  ctx.beginPath();
  ctx.arc(me.x, me.y, 5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(me.x, me.y);
  ctx.lineTo(me.x + Math.cos(G.player.angle) * 12, me.y + Math.sin(G.player.angle) * 12);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(224,178,92,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, view - 1, view - 1);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(200,195,180,0.7)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('BLUE YOU   ·   RED HOSTILES   ·   TAN BUILDINGS   ·   GREEN TREES', left, top + view + 18);

  const cx0 = left + view + 16;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(200,195,180,0.75)';
  ctx.font = '700 10px Consolas, monospace';
  ctx.fillText('CONTRACTS', cx0, top + 18);
  G.contracts.forEach((c, i) => {
    const def = CONTRACTS.find((d) => d.id === c.id);
    const progress = def ? Math.min(c.target, def.goal(G)) : 0;
    ctx.fillStyle = c.done ? '#63dcc0' : 'rgba(200,195,180,0.65)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText((c.done ? '[x] ' : '[ ] ') + c.name, cx0, top + 40 + i * 30);
    ctx.fillStyle = c.done ? 'rgba(99,220,192,0.7)' : 'rgba(170,165,150,0.6)';
    ctx.fillText((c.done ? 'DONE' : progress + ' / ' + c.target) + '   +' + c.reward + ' SH', cx0 + 12, top + 51 + i * 30);
  });
  ctx.fillStyle = 'rgba(255,210,122,0.8)';
  ctx.font = '700 10px Consolas, monospace';
  ctx.fillText('UNBANKED ' + Math.floor(G.unbanked), cx0, top + 150);
  ctx.fillStyle = '#63dcc0';
  ctx.fillText('SECURED ' + Math.floor(G.banked), cx0, top + 166);
  ctx.fillStyle = G.alert > 55 ? '#e0b13c' : 'rgba(200,195,180,0.7)';
  ctx.fillText('ALERT ' + Math.round(G.alert) + '%', cx0, top + 182);
  ctx.fillStyle = 'rgba(190,185,170,0.6)';
  ctx.font = '600 9px Consolas, monospace';
  ctx.fillText('MARKET x' + G.market.toFixed(2), cx0, top + 198);

  ctx.textAlign = 'center';
  drawButton('map-close', 'CLOSE', W / 2, 532, 180, 38);
}

function drawOverScreen() {
  overlay(0.78);
  ctx.textAlign = 'center';
  if (G.victory) {
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 44px Consolas, monospace';
    ctx.fillText(G.mode === 'bossrush' ? 'BOSS RUSH CLEARED' : 'SURVIVED THE LIMIT', W / 2, 126);
    ctx.fillStyle = '#e7eef3';
    ctx.font = '700 26px Consolas, monospace';
    ctx.fillText(fmtTime(G.time) + ' ON ' + MAPS[G.map].name, W / 2, 166);
  } else {
    ctx.fillStyle = '#ff6b52';
    ctx.font = '700 44px Consolas, monospace';
    ctx.fillText('THE HORDE WINS', W / 2, 126);
    ctx.fillStyle = '#e7eef3';
    ctx.font = '700 26px Consolas, monospace';
    ctx.fillText('SURVIVED ' + fmtTime(G.time), W / 2, 166);
  }
  ctx.fillStyle = 'rgba(215,205,185,0.8)';
  ctx.font = '600 13px Consolas, monospace';
  ctx.fillText(G.kills + ' KILLS   ·   LEVEL ' + G.level + '   ·   SQUAD ' + G.soldiers.length + '   ·   BOSSES ' + (G.bossKills || 0), W / 2, 192);
  const record = G.time > best.time - 0.001 && G.time > 0;
  ctx.fillStyle = record ? '#ffd27a' : 'rgba(200,190,165,0.6)';
  ctx.font = '600 12px Consolas, monospace';
  ctx.fillText(record ? 'NEW PERSONAL BEST' : 'BEST ' + fmtTime(best.time), W / 2, 214);
  ctx.fillStyle = '#63dcc0';
  ctx.font = '700 16px Consolas, monospace';
  ctx.fillText('+' + (G.shardsEarned || 0) + ' SHARDS   ·   ' + save.shards + ' TOTAL', W / 2, 244);
  ctx.fillStyle = 'rgba(190,185,165,0.65)';
  ctx.font = '600 10px Consolas, monospace';
  const modeLine =
    G.mode === 'bossrush'
      ? 'BOSS RUSH · ' + G.rush.index + ' / ' + G.rush.target + ' BOSSES'
      : 'SURVIVORS · WAVE ' + G.wave;
  ctx.fillText(operatorDef().name + ' · ' + modeLine + (G.relics.length ? '   ·   RELICS ' + G.relics.length + '/' + RELICS.length : ''), W / 2, 266);
  if (G.relics.length) {
    const names = G.relics.map((id) => RELICS.find((r) => r.id === id).name).join(' · ');
    ctx.fillStyle = 'rgba(99,220,192,0.75)';
    ctx.fillText(names, W / 2, 282);
  }
  const combo = activeCombos();
  if (combo.length) {
    ctx.fillStyle = 'rgba(255,210,122,0.8)';
    ctx.font = '600 10px Consolas, monospace';
    ctx.fillText('COMBOS: ' + combo.map((c) => c.name).join(' · '), W / 2, 298);
  }
  drawButton('retry', 'REDEPLOY', W / 2 - 130, 292, 240, 48);
  drawButton('menu-over', 'MAIN MENU', W / 2 + 130, 292, 240, 48);
  drawButton('stats-over', 'STATISTICS', W / 2, 354, 240, 40);
}

function drawScreens() {
  if (screen === 'menu') drawMenuScreen();
  else if (screen === 'setup') drawSetupScreen();
  else if (screen === 'armory') drawArmoryScreen();
  else if (screen === 'statistics') drawStatisticsScreen();
  else if (screen === 'settings') drawSettingsScreen();
  else if (screen === 'help') drawHelpScreen();
  else if (screen === 'manual') drawManualScreen();
  else if (screen === 'daily') drawDailyScreen();
  else if (screen === 'upgrades') drawUpgradesScreen();
  else if (screen === 'paused') drawPauseScreen();
  else if (screen === 'mapview') drawMapView();
  else if (screen === 'levelup') drawLevelUpScreen();
  else if (screen === 'relic') drawRelicScreen();
  else if (screen === 'over') drawOverScreen();
}

function buyMeta(id) {
  const meta = META[id];
  if (!meta) return false;
  const rank = metaRank(id);
  if (rank >= meta.max) {
    sfx.denied();
    return false;
  }
  const cost = meta.cost(rank);
  if (save.shards < cost) {
    sfx.denied();
    return false;
  }
  save.shards -= cost;
  save.meta[id] = rank + 1;
  writeStore(SAVE_KEY, save);
  sfx.upgrade();
  return true;
}

function pressButton(id) {
  sfx.click();
  if (id === 'play') {
    screen = 'setup';
    return;
  }
  if (id === 'setup-start' || id === 'retry') {
    startRun();
    return;
  }
  if (id === 'back-setup') {
    screen = 'menu';
    return;
  }
  if (id.indexOf('weapon-') === 0) {
    const weapon = id.slice(7);
    if (WEAPONS[weapon]) setup.weapon = weapon;
    return;
  }
  if (id.indexOf('map-') === 0 && id !== 'map-close' && id !== 'mapview-pause') {
    const map = id.slice(4);
    if (MAPS[map]) setup.map = map;
    return;
  }
  if (id.indexOf('limit-') === 0) {
    const limit = id.slice(6);
    if (TIME_LIMITS.some((l) => l.id === limit)) setup.limit = limit;
    return;
  }
  if (id.indexOf('difficulty-') === 0) {
    const diff = id.slice(11);
    if (DIFFICULTIES.some((d) => d.id === diff)) setup.difficulty = diff;
    return;
  }
  if (id.indexOf('mutator-') === 0) {
    const mut = id.slice(8);
    if (!mutatorDef(mut)) return;
    const idx = setup.mutators.indexOf(mut);
    if (idx >= 0) setup.mutators.splice(idx, 1);
    else if (setup.mutators.length < 2) setup.mutators.push(mut);
    else sfx.denied();
    return;
  }
  if (id === 'reroll') {
    rerollOffers();
    return;
  }
  if (id.indexOf('banish-') === 0) {
    banishOffer(Number(id.slice(7)));
    return;
  }
  if (id === 'armory') {
    screen = 'armory';
    return;
  }
  if (id === 'back-armory') {
    screen = 'menu';
    return;
  }
  if (id.indexOf('meta-') === 0) {
    buyMeta(id.slice(5));
    return;
  }
  if (id === 'statistics' || id === 'stats-over') {
    statsReturn = id === 'stats-over' ? 'over' : 'menu';
    screen = 'statistics';
    return;
  }
  if (id === 'back-stats') {
    screen = statsReturn;
    return;
  }
  if (id === 'settings' || id === 'settings-pause') {
    settingsReturn = id === 'settings' ? 'menu' : 'paused';
    screen = 'settings';
    return;
  }
  if (id === 'upgrades' || id === 'upgrades-pause') {
    upgradesReturn = id === 'upgrades' ? 'menu' : 'paused';
    screen = 'upgrades';
    return;
  }
  if (id === 'help') {
    screen = 'help';
    return;
  }
  if (id === 'manual') {
    screen = 'manual';
    return;
  }
  if (id === 'daily') {
    screen = 'daily';
    return;
  }
  if (id === 'back-daily') {
    goMenu();
    return;
  }
  if (id === 'start-daily') {
    startDaily();
    return;
  }
  if (id === 'back-manual') {
    goMenu();
    return;
  }
  if (id === 'manual-enemies' || id === 'manual-bosses' || id === 'manual-relics') {
    manualTab = id.slice(7);
    return;
  }
  if (id === 'mapview-pause') {
    mapReturn = 'paused';
    screen = 'mapview';
    return;
  }
  if (id === 'map-close') {
    screen = mapReturn;
    return;
  }
  if (id === 'back-settings') {
    screen = settingsReturn;
    return;
  }
  if (id === 'back-upgrades') {
    screen = upgradesReturn;
    return;
  }
  if (id === 'back-help') {
    screen = 'menu';
    return;
  }
  if (id === 'volume-down' || id === 'volume-up') {
    settings.volume = clamp(settings.volume + (id === 'volume-up' ? 10 : -10), 0, 100);
    writeStore(SETTINGS_KEY, settings);
    initAudio();
    return;
  }
  if (id === 'shake') {
    settings.shake = !settings.shake;
    writeStore(SETTINGS_KEY, settings);
    return;
  }
  if (id === 'damage-numbers') {
    settings.damageNumbers = !settings.damageNumbers;
    writeStore(SETTINGS_KEY, settings);
    return;
  }
  if (id === 'resume') {
    screen = 'play';
    return;
  }
  if (id === 'restart') {
    abandonRun();
    startRun();
    return;
  }
  if (id === 'menu-pause') {
    abandonRun();
    return;
  }
  if (id === 'menu-over') {
    goMenu();
    return;
  }
  if (id.indexOf('operator-') === 0) {
    const op = id.slice(9);
    if (OPERATOR_ORDER.indexOf(op) >= 0) setup.operator = op;
    return;
  }
  if (id.indexOf('mode-') === 0) {
    const mode = id.slice(5);
    if (MODES.some((m) => m.id === mode)) setup.mode = mode;
    return;
  }
  if (id.indexOf('upgrade-') === 0) {
    const index = Number(id.slice(8));
    if (screen === 'levelup') chooseUpgrade(index);
  }
  if (id.indexOf('relic-') === 0) {
    const index = Number(id.slice(6));
    if (screen === 'relic') chooseRelic(index);
  }
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  uiButtons = [];

  if (G && screen !== 'menu' && screen !== 'setup' && screen !== 'armory' && screen !== 'statistics') {
    ctx.save();
    if (shake > 0.1 && settings.shake) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
    ctx.translate(-G.cam.x, -G.cam.y);
    drawGround(G.cam);
    drawHazards(G.cam);
    drawProps(G.cam);
    drawPools();
    drawPickups();
    drawGrenades();
    drawAura();
    drawEnemies();
    drawBlades();
    drawSoldiers();
    drawTurrets();
    drawPlayer();
    drawShield();
    drawBullets();
    drawParticles();
    drawFloaters();
    ctx.restore();
    drawWeather();
    if (screen === 'play' || screen === 'paused') drawHUD();
    drawVignette();
  }

  drawScreens();

  if (screen === 'play') {
    cv.style.cursor = 'none';
  } else {
    cv.style.cursor = 'pointer';
  }
}

function update(dt) {
  uiT += dt;
  if (screen === 'play' && G) updateRun(dt);
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
  if (k === 'escape') {
    if (screen === 'play') {
      screen = 'paused';
      for (const key in keys) delete keys[key];
    } else if (screen === 'paused') {
      screen = 'play';
    } else if (screen === 'settings') {
      screen = settingsReturn;
    } else if (screen === 'upgrades') {
      screen = upgradesReturn;
    } else if (screen === 'help') {
      screen = 'menu';
    } else if (screen === 'setup' || screen === 'armory' || screen === 'statistics') {
      screen = 'menu';
    } else if (screen === 'mapview') {
      screen = mapReturn;
    }
  }
  if (screen === 'levelup' && (k === '1' || k === '2' || k === '3')) {
    chooseUpgrade(Number(k) - 1);
  }
  if (screen === 'relic' && (k === '1' || k === '2' || k === '3')) {
    chooseRelic(Number(k) - 1);
  }
  if (screen === 'levelup' && k === 'r') {
    rerollOffers();
  }
  if (k === 'm') {
    if (screen === 'play') {
      mapReturn = 'play';
      screen = 'mapview';
    } else if (screen === 'paused') {
      mapReturn = 'paused';
      screen = 'mapview';
    } else if (screen === 'mapview') {
      screen = mapReturn;
    }
  }
  if (k === 'enter') {
    if (screen === 'menu') screen = 'setup';
    else if (screen === 'setup') startRun();
    else if (screen === 'over' && G.time > 0.5) startRun();
    else if (screen === 'paused') screen = 'play';
  }
  if (k === ' ' || k.indexOf('arrow') === 0) e.preventDefault();
}

function onKeyUp(e) {
  keys[e.key.toLowerCase()] = false;
}

function clickAt(x, y) {
  for (const b of uiButtons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      pressButton(b.id);
      return true;
    }
  }
  return false;
}

cv.addEventListener('mousemove', setMouse);
cv.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  initAudio();
  setMouse(e);
  clickAt(mouse.x, mouse.y);
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('mouseup', () => {});
window.addEventListener('blur', () => {
  for (const k in keys) delete keys[k];
  if (screen === 'play') screen = 'paused';
});

window.Dustline = {
  snapshot() {
    const snap = {
      screen,
      settings: { ...settings },
      best: { ...best },
      save: {
        shards: save.shards,
        totalKills: save.totalKills,
        runs: save.runs,
        wins: save.wins,
        bossKills: save.bossKills,
        bestTime: save.bestTime,
        bestKills: save.bestKills,
        damageDealt: save.damageDealt,
        jackpots: save.jackpots || 0,
        nearMisses: save.nearMisses || 0,
        hunters: save.hunters || 0,
        contracts: save.contracts || 0,
        bankedTotal: save.bankedTotal || 0,
        lostTotal: save.lostTotal || 0,
        champions: save.champions || 0,
        chests: save.chests || 0,
        megaKills: save.megaKills || 0,
        rushClears: save.rushClears || 0,
        rushBest: save.rushBest || 0,
        bestWave: save.bestWave || 1,
        shieldSaves: save.shieldSaves || 0,
        dailyBest: JSON.parse(JSON.stringify(save.dailyBest || {})),
        achievements: Object.assign({}, save.achievements || {}),
        achievementCount: achievementUnlocked(),
        killsByType: { ...save.killsByType },
        meta: { ...save.meta }
      },
      setup: { ...setup, mutators: setup.mutators.slice() },
      daily: dailyInfo(),
      manual: {
        tab: manualTab,
        enemies: Object.keys(ENEMY_TYPES).length,
        bosses: Object.keys(BOSS_TYPES).length,
        relics: RELICS.length,
        enemyTips: Object.keys(ENEMY_TIPS).length,
        bossTips: Object.keys(BOSS_TIPS).length
      },
      buttons: uiButtons.map((b) => ({ id: b.id, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h }))
    };
    if (G) {
      snap.time = G.time;
      snap.wave = G.wave;
      snap.kills = G.kills;
      snap.level = G.level;
      snap.tier = evolutionTier(G.level);
      snap.xp = G.xp;
      snap.xpNext = G.xpNext;
      snap.hp = G.hp;
      snap.maxHp = G.maxHp;
      snap.squad = G.soldiers.length;
      snap.skills = { ...G.skills };
      snap.combos = activeCombos().map((c) => c.id);
      snap.weapon = G.weapon;
      snap.difficulty = G.difficulty;
      snap.mutators = G.mutators.slice();
      snap.mutatorLoot = mutatorShardMult();
      snap.hazard = mapDef().hazard;
      snap.diffMods = { spawn: G.diff.spawn, hp: G.diff.hp, dmg: G.diff.dmg, shard: G.diff.shard };
      snap.evolved = { ...G.evolved };
      snap.rerolls = G.rerolls;
      snap.banishes = G.banishes;
      snap.banned = G.banned.slice();
      snap.map = G.map;
      snap.limitSec = G.limitSec;
      snap.victory = G.victory;
      snap.shardsEarned = G.shardsEarned || 0;
      snap.bossKills = G.bossKills || 0;
      snap.megaKills = G.megaKills || 0;
      snap.streak = G.streak;
      snap.streakMult = streakMult();
      snap.bestStreak = G.bestStreak;
      snap.seed = G.seed;
      snap.market = G.market;
      snap.alert = G.alert;
      snap.unbanked = G.unbanked;
      snap.banked = G.banked;
      snap.lost = G.lost || 0;
      snap.rushBonus = G.rushBonus || 0;
      snap.news = G.news;
      snap.event = G.event ? { id: G.event.id, t: G.eventT } : null;
      snap.beacon = G.beacon ? { x: G.beacon.x, y: G.beacon.y, t: G.beacon.t } : null;
      snap.overdrive = { active: !!G.od.active, heat: G.od.heat };
      snap.damageMult = damageMult();
      snap.hunterCd = G.hunterCd;
      snap.frenzy = G.frenzyT;
      snap.surge = G.surgeT;
      snap.chips = G.chips.map((c) => c.kind);
      snap.contracts = G.contracts.map((c) => {
        const def = CONTRACTS.find((d) => d.id === c.id);
        return {
          id: c.id,
          name: c.name,
          target: c.target,
          reward: c.reward,
          done: c.done,
          progress: def ? Math.min(c.target, def.goal(G)) : 0
        };
      });
      snap.player = { x: G.player.x, y: G.player.y, angle: G.player.angle };
      snap.cam = { x: G.cam.x, y: G.cam.y };
      snap.soldiers = G.soldiers.map((s) => ({ x: s.x, y: s.y }));
      snap.enemies = G.enemies.map((e) => ({
        type: e.type,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        r: e.r,
        speed: e.speed,
        boss: !!e.boss,
        style: e.style || null,
        champion: !!e.champion,
        affix: e.affix || null,
        shielding: !!e.auraShield,
        ghost: !!e.ghost,
        burrowed: !!e.burrowed,
        rage: e.rageT || 0
      }));
      snap.enemyTypes = Array.from(new Set(G.enemies.map((e) => e.type)));
      snap.gems = G.gems.length;
      snap.chests = G.chests.length;
      snap.turrets = G.turrets.length;
      snap.auraRadius = auraRadius();
      snap.medkits = G.medkits.length;
      snap.floaters = G.floaters.length;
      snap.bombs = G.bombs.length;
      snap.grenades = G.grenades.length;
      snap.explored = Object.keys(G.explored).length;
      snap.offers = G.offers.slice();
      snap.shots = { ...G.stats.shots };
      snap.stats = {
        shots: { ...G.stats.shots },
        bladeHits: G.stats.bladeHits,
        grenadeHits: G.stats.grenadeHits,
        bombs: G.stats.bombs,
        crits: G.stats.crits,
        healing: G.stats.healing,
        gems: G.stats.gems,
        chips: G.stats.chips,
        jackpots: G.stats.jackpots,
        nearMisses: G.stats.nearMisses,
        dashes: G.stats.dashes,
        hunters: G.stats.hunters,
        contracts: G.stats.contracts,
        champions: G.stats.champions || 0,
        turrets: G.stats.turrets || 0,
        auraHits: G.stats.auraHits || 0,
        chests: G.stats.chests || 0,
        shieldSaves: G.stats.shieldSaves || 0,
        banked: G.stats.banked,
        lost: G.stats.lost
      };
      snap.bullets = G.bullets.map((b) => b.owner);
      snap.bulletColors = Array.from(new Set(G.bullets.map((b) => b.color)));
      snap.bannerT = G.bannerT;
      snap.dash = { ready: G.dash.cd <= 0, cd: G.dash.cd, t: G.dash.t };
      snap.bomb = { ready: G.bomb.cd <= 0, cd: G.bomb.cd };
      snap.shield = { charges: G.shield.charges, max: shieldMax(), t: G.shield.t };
      snap.slow = G.slowT;
      snap.pools = G.pools.length;
      snap.slots = {
        offense: { used: slotsUsed('offense'), cap: slotCap('offense') },
        passive: { used: slotsUsed('passive'), cap: slotCap('passive') }
      };
      snap.mode = G.mode;
      snap.operator = G.operator;
      snap.daily = G.daily != null ? dailyInfo() : null;
      snap.dailyDay = dailyDay();      snap.rush = G.rush ? { index: G.rush.index, target: G.rush.target, alive: G.rush.alive, next: G.rush.next } : null;
      snap.relics = G.relics.slice();
      snap.relicOffers = G.relicOffers.slice();
      snap.salvage = G.salvage.length;
      snap.mods = {
        fireRate: fireRateMult(),
        crit: critChance(),
        bulletSpeed: bulletSpeedMult(),
        magnet: magnetRadius(),
        blast: blastMult(),
        shard: hasRelic('greedengine') ? 1.2 : 1,
        lifestealBonus: hasRelic('bloodstone') ? 0.03 : 0,
        shield: shieldMax()
      };
      const boss = G.enemies.find((e) => e.boss && !e.dead);
      snap.boss = boss
        ? {
            type: boss.type,
            style: boss.style,
            hp: boss.hp,
            maxHp: boss.maxHp,
            mega: !!boss.mega,
            phase: boss.phase || 0,
            affix: boss.affix || null,
            beamState: boss.beamState || null
          }
        : null;
    }
    return snap;
  }
};

if (window.__DUSTLINE_TEST__) {
  window.Dustline.clickButton = (id) => {
    const found = uiButtons.find((b) => b.id === id);
    if (!found) return false;
    pressButton(found.id);
    return true;
  };
  window.Dustline.giveXp = (value) => {
    if (G) addXp(value);
  };
  window.Dustline.spawnEnemy = (type, x, y) => {
    if (!G) return false;
    spawnEnemyAt(type, G.player.x + x, G.player.y + y);
    return true;
  };
  window.Dustline.hurt = (value) => {
    if (!G) return;
    G.invulnT = 0;
    damagePlayer(value);
  };
  window.Dustline.applyUpgrade = (id) => {
    if (!G) return false;
    return applyUpgrade(id);
  };
  window.Dustline.setInvulnerable = (value) => {
    if (G) G.invulnerable = !!value;
  };
  window.Dustline.spawnBoss = (type) => {
    if (!G) return false;
    if (type) {
      const boss = spawnEnemyAt(type, G.player.x + 500, G.player.y);
      return !!boss;
    }
    return !!spawnBoss();
  };
  window.Dustline.setTime = (value) => {
    if (G) G.time = Math.max(0, Number(value) || 0);
  };
  window.Dustline.killEnemies = () => {
    if (!G) return;
    for (const e of G.enemies.slice()) if (!e.dead) killEnemy(e);
  };
  window.Dustline.startRun = (opts) => {
    startRun(opts || {});
  };
  window.Dustline.throwBomb = () => (G ? throwBomb() : false);
  window.Dustline.spawnMedkit = (x, y) => {
    if (G) G.medkits.push({ x: G.player.x + x, y: G.player.y + y });
  };
  window.Dustline.grantShards = (value) => {
    save.shards = Math.max(0, save.shards + Math.round(Number(value) || 0));
    writeStore(SAVE_KEY, save);
  };
  window.Dustline.buyMeta = (id) => buyMeta(id);
  window.Dustline.props = (x, y, r) => propsNear(x, y, r).map((p) => ({ kind: p.kind, x: p.x, y: p.y, w: p.w || 0, h: p.h || 0, r: p.r || 0 }));
  window.Dustline.setPlayer = (x, y) => {
    if (!G) return;
    G.player.x = Number(x) || 0;
    G.player.y = Number(y) || 0;
    G.cam.x = G.player.x - W / 2;
    G.cam.y = G.player.y - H / 2;
  };
  window.Dustline.setAlert = (value) => {
    if (G) G.alert = clamp(Number(value) || 0, 0, 100);
  };
  window.Dustline.setUnbanked = (value) => {
    if (G) G.unbanked = Math.max(0, Number(value) || 0);
  };
  window.Dustline.bankNow = () => (G ? bankUnbanked() : 0);
  window.Dustline.triggerEvent = (id) => (G ? triggerEvent(id) : false);
  window.Dustline.setEventCd = (value) => {
    if (G) G.eventCd = Math.max(0, Number(value) || 0);
  };
  window.Dustline.setRng = (value) => {
    if (G) G.rng = Number(value) >>> 0;
  };
  window.Dustline.setEnemyHp = (index, hp) => {
    if (!G || !G.enemies[index]) return false;
    G.enemies[index].hp = Math.max(1, Number(hp) || 1);
    return true;
  };
  window.Dustline.setOverdrive = (active) => {
    if (!G) return;
    G.od.active = !!active;
    G.od.heat = active ? 100 : 0;
  };
  window.Dustline.spawnChip = (kind, x, y) => {
    if (!G) return;
    G.chips.push({ kind: CHIPS[kind] ? kind : 'shards', x: G.player.x + (x || 0), y: G.player.y + (y || 0), spin: 0 });
  };
  window.Dustline.hazardAtPoint = (x, y) => hazardAt(Number(x) || 0, Number(y) || 0);
  window.Dustline.setMutators = (ids) => {
    if (!G || !Array.isArray(ids)) return false;
    G.mutators = ids.filter((id) => !!mutatorDef(id)).slice(0, 2);
    return true;
  };
  window.Dustline.spawnChest = (x, y) => {
    if (!G) return;
    G.chests.push({ x: G.player.x + (x || 0), y: G.player.y + (y || 0), spin: 0 });
  };
  window.Dustline.reroll = () => (G ? rerollOffers() : false);
  window.Dustline.banish = (index) => (G ? banishOffer(Number(index) || 0) : false);
  window.Dustline.setGhost = (index, value) => {
    if (!G || !G.enemies[index]) return false;
    G.enemies[index].ghost = !!value;
    G.enemies[index].ghostT = value ? 99 : 99;
    return true;
  };
  window.Dustline.setBurrowed = (index, value) => {
    if (!G || !G.enemies[index]) return false;
    G.enemies[index].burrowed = !!value;
    G.enemies[index].burrowT = value ? 99 : 0;
    G.enemies[index].burrowCd = 99;
    return true;
  };
  window.Dustline.forceChampion = (index, affix) => {
    if (!G || !G.enemies[index]) return false;
    const e = G.enemies[index];
    const chosen = CHAMPION_AFFIXES.find((a) => a.id === affix) || CHAMPION_AFFIXES[0];
    e.champion = true;
    e.affix = chosen.id;
    e.hp = Math.round(e.hp * 2.1);
    e.maxHp = e.hp;
    e.xp *= 3;
    if (chosen.id === 'swift') e.speed *= 1.35;
    return true;
  };
  window.Dustline.forceBossAffix = (index, affix) => {
    if (!G || !G.enemies[index]) return false;
    const e = G.enemies[index];
    const chosen = BOSS_AFFIXES.find((a) => a.id === affix);
    if (!chosen) return false;
    e.affix = chosen.id;
    if (chosen.speed) e.speed *= chosen.speed;
    if (chosen.id === 'shielded') {
      e.hp = Math.round(e.hp * 1.15);
      e.maxHp = e.hp;
    }
    return true;
  };
  window.Dustline.grantRelic = (id) => {
    if (!G || !RELICS.some((r) => r.id === id) || G.relics.indexOf(id) >= 0) return false;
    G.relics.push(id);
    if (id === 'aegiscore') {
      G.shield.charges = Math.min(shieldMax(), G.shield.charges + 1);
      G.shield.t = shieldRefill();
    }
    checkAchievements();
    return true;
  };
  window.Dustline.spawnSalvage = (x, y) => {
    if (!G) return false;
    G.salvage.push({ x: Number(x) || 0, y: Number(y) || 0, spin: 0, t: 40 });
    return true;
  };
  window.Dustline.setDay = (day) => {
    dailyOverride = Number.isFinite(Number(day)) ? Number(day) : null;
    return dailyDay();
  };
  window.Dustline.hitEnemy = (index, dmg) => {
    if (!G || !G.enemies[index]) return false;
    const e = G.enemies[index];
    damageEnemy(e, Number(dmg) || 1, e.x, e.y, false);
    return true;
  };
  window.Dustline.setHunterCd = (value) => {
    if (G) G.hunterCd = Number(value) || 0;
  };
  window.Dustline.forceContracts = (ids) => {
    if (!G || !Array.isArray(ids)) return false;
    G.contracts = ids
      .map((id) => CONTRACTS.find((c) => c.id === id))
      .filter(Boolean)
      .slice(0, 3)
      .map((c) => ({ id: c.id, name: c.name, target: c.target, reward: c.reward, done: false }));
    return true;
  };
  window.Dustline.enemyLimit = () => (G ? G.enemies.length : 0);
}

let last = 0;

function frame(t) {
  const dt = last === 0 ? 0.016 : Math.min(0.033, (t - last) / 1000);
  last = t;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
