'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createGame } = require('./harness');

test('boots into wave 1 with a full magazine and no enemies yet', () => {
  const g = createGame();
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.state, 'play');
  assert.strictEqual(s.wave, 1);
  assert.strictEqual(s.hp, 100);
  assert.strictEqual(s.ammo, 30);
  assert.ok(s.walls.length > 0);
});

test('spawns hostiles that close in on the player', () => {
  const g = createGame({ seed: 7 });
  g.steps(60);
  const early = g.api.snapshot();
  assert.ok(early.enemies.length > 0, 'expected hostiles on the field');
  for (const e of early.enemies) {
    assert.ok(e.x > 0 && e.x < 960 && e.y > 0 && e.y < 600);
    assert.ok(Math.hypot(e.x - early.player.x, e.y - early.player.y) >= 330, 'spawn keeps distance');
  }
  const near = (s) => Math.min(...s.enemies.map((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y)));
  g.steps(240);
  const late = g.api.snapshot();
  assert.ok(near(late) < near(early), 'hostiles should approach the player');
  assert.ok(near(late) < 320, 'hostiles should reach engagement range');
});

test('switches weapons and the USP fires once per press', () => {
  const g = createGame({ seed: 5 });
  g.steps(1);
  g.key('2');
  let s = g.api.snapshot();
  assert.strictEqual(s.weapon, 'pistol');
  assert.strictEqual(s.ammo, 12);
  g.move(700, 200);
  g.down(700, 200);
  g.steps(40);
  s = g.api.snapshot();
  assert.strictEqual(s.ammo, 11, 'holding the trigger must not autofire the USP');
  g.up();
  g.down(700, 200);
  g.steps(20);
  s = g.api.snapshot();
  assert.strictEqual(s.ammo, 10, 'a fresh press fires again');
  g.up();
  g.key('1');
  s = g.api.snapshot();
  assert.strictEqual(s.weapon, 'ak');
  assert.strictEqual(s.ammo, 30, 'each slot keeps its own magazine');
  assert.strictEqual(s.slots.pistol.ammo, 10);
  g.key('q');
  assert.strictEqual(g.api.snapshot().weapon, 'pistol');
});

test('best score is recorded and restored from storage', () => {
  const store = {
    data: Object.create(null),
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
    },
    setItem(key, value) {
      this.data[key] = String(value);
    }
  };
  const g = createGame({ seed: 9, storage: store });
  g.steps(60);
  g.api.wipeEnemies();
  const s = g.api.snapshot();
  assert.ok(s.kills > 0, 'the wipe should bank kills');
  assert.strictEqual(s.best, s.score);
  assert.strictEqual(store.data['dustline.best'], String(s.score));
  g.api.reset();
  assert.strictEqual(g.api.snapshot().best, s.score, 'reset keeps the record');
  const g2 = createGame({ seed: 9, storage: store });
  g2.steps(1);
  assert.strictEqual(g2.api.snapshot().best, s.score);
});

test('clicks while paused neither fire nor queue a shot', () => {
  const g = createGame({ seed: 4 });
  g.steps(1);
  g.key('escape');
  assert.strictEqual(g.api.snapshot().paused, true);
  g.down(700, 200);
  g.steps(30);
  assert.strictEqual(g.api.snapshot().ammo, 30);
  g.key('escape');
  g.steps(30);
  assert.strictEqual(g.api.snapshot().ammo, 30, 'resume must not replay a paused click');
});

test('entities never settle inside solid cover', () => {
  const g = createGame({ seed: 11 });
  g.steps(1);
  g.key('d');
  for (let i = 0; i < 900; i++) {
    if (i % 120 === 0) g.move(120 + ((i * 7) % 700), 120 + ((i * 11) % 360));
    if (i % 240 === 0) g.down(700, 200);
    g.step();
    const s = g.api.snapshot();
    const bodies = [{ x: s.player.x, y: s.player.y, r: s.player.r }].concat(s.enemies);
    for (const body of bodies) {
      for (const w of s.walls) {
        const nx = Math.max(w.x, Math.min(body.x, w.x + w.w));
        const ny = Math.max(w.y, Math.min(body.y, w.y + w.h));
        const gap = Math.hypot(body.x - nx, body.y - ny);
        assert.ok(gap >= body.r - 0.5, 'body intersects cover at frame ' + i);
      }
      assert.ok(body.x >= 0 && body.x <= 960 && body.y >= 0 && body.y <= 600);
    }
  }
});

test('combat helpers stay hidden outside the test harness', () => {
  const g = createGame({ testSeam: false });
  g.steps(1);
  assert.strictEqual(typeof g.api.snapshot, 'function');
  assert.strictEqual(g.api.damage, undefined);
  assert.strictEqual(g.api.wipeEnemies, undefined);
});

test('walls block movement', () => {
  const g = createGame();
  g.steps(1);
  const start = g.api.snapshot().player;
  g.key('s');
  g.steps(120);
  g.key('s', false);
  const end = g.api.snapshot().player;
  assert.ok(end.y > start.y + 20, 'player should move down');
  const crate = g.api.snapshot().walls.find((w) => Math.abs(w.x - 430) < 1 && Math.abs(w.y - 250) < 1);
  assert.ok(crate, 'central crate exists');
  assert.ok(end.y <= crate.y - end.r + 0.5, 'player must stop at the crate face');
});

test('kill, score and wave advance', () => {
  const g = createGame();
  g.steps(60);
  assert.ok(g.api.snapshot().enemies.length > 0);
  g.api.wipeEnemies();
  assert.strictEqual(g.api.snapshot().score, g.api.snapshot().kills * 100);
  let wave = 1;
  for (let i = 0; i < 900 && wave < 2; i++) {
    if (i % 8 === 0) g.api.wipeEnemies();
    g.step();
    wave = g.api.snapshot().wave;
  }
  const s = g.api.snapshot();
  assert.strictEqual(s.wave, 2);
  assert.strictEqual(s.hp, 100, 'wave 2 restores health');
  assert.ok(s.score >= 400, 'each hostile is worth 100');
});

test('firing consumes ammo and reload refills from reserve', () => {
  const g = createGame();
  g.steps(1);
  g.move(700, 200);
  g.down(700, 200);
  g.steps(30);
  g.up();
  const fired = g.api.snapshot();
  assert.ok(fired.ammo < 30, 'firing must consume ammo');
  g.key('r');
  g.steps(140);
  const reloaded = g.api.snapshot();
  assert.strictEqual(reloaded.reloading, false);
  assert.ok(reloaded.ammo > fired.ammo, 'reload refills the magazine');
  assert.ok(reloaded.reserve < 150, 'reload draws from reserve');
});

test('death ends the run and Enter redeploys', () => {
  const g = createGame();
  g.steps(1);
  g.api.damage(999);
  g.steps(40);
  assert.strictEqual(g.api.snapshot().state, 'over');
  g.key('enter');
  const s = g.api.snapshot();
  assert.strictEqual(s.state, 'play');
  assert.strictEqual(s.hp, 100);
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.wave, 1);
});

test('pause freezes simulation updates', () => {
  const g = createGame();
  g.steps(1);
  g.key('escape');
  const before = g.api.snapshot();
  g.steps(60);
  const after = g.api.snapshot();
  assert.strictEqual(after.paused, true);
  assert.deepStrictEqual(after.enemies, before.enemies);
  g.key('escape');
  assert.strictEqual(g.api.snapshot().paused, false);
});
