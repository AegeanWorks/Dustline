'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createGame } = require('./harness');

function makeStore(initial) {
  return {
    data: Object.assign(Object.create(null), initial || {}),
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
    },
    setItem(key, value) {
      this.data[key] = String(value);
    }
  };
}

function boot(options) {
  const g = createGame(options);
  g.steps(4);
  return g;
}

function enterSetup(g) {
  assert.ok(g.api.clickButton('play'), 'play button exists');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'setup');
}

function deploy(g, opts) {
  if (g.api.snapshot().screen === 'menu') enterSetup(g);
  if (opts && (opts.weapon || opts.operator)) {
    g.api.clickButton('setup-tab-0');
    g.steps(1);
  }
  if (opts && opts.weapon) g.api.clickButton('weapon-' + opts.weapon);
  if (opts && opts.operator) g.api.clickButton('operator-' + opts.operator);
  if (opts && (opts.map || opts.mode || opts.limit || opts.difficulty)) {
    g.api.clickButton('setup-tab-1');
    g.steps(1);
  }
  if (opts && opts.map) g.api.clickButton('map-' + opts.map);
  if (opts && opts.mode) g.api.clickButton('mode-' + opts.mode);
  if (opts && opts.limit) g.api.clickButton('limit-' + opts.limit);
  if (opts && opts.difficulty) g.api.clickButton('difficulty-' + opts.difficulty);
  if (opts && (opts.mutators || opts.mutation)) {
    g.api.clickButton('setup-tab-2');
    g.steps(1);
  }
  if (opts && opts.mutators) for (const m of opts.mutators) g.api.clickButton('mutator-' + m);
  if (opts && opts.mutation) g.api.clickButton('mutation-' + opts.mutation);
  if (opts) g.steps(1);
  assert.ok(g.api.clickButton('setup-start'), 'deploy button exists');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'play');
}

test('boots to the main menu with the full navigation', () => {
  const g = boot();
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'menu');
  assert.strictEqual(
    JSON.stringify(s.buttons.map((b) => b.id)),
    JSON.stringify(['play', 'armory', 'daily', 'statistics', 'upgrades', 'manual', 'settings', 'leaderboard', 'help', 'shop'])
  );
  assert.strictEqual(s.settings.volume, 70);
  assert.strictEqual(s.save.shards, 0);
  assert.strictEqual(s.save.runs, 0);
});

test('the setup screen offers weapons, maps and time limits that apply to the run', () => {
  const g = boot({ seed: 3 });
  enterSetup(g);
  const ids = g.api.snapshot().buttons.map((b) => b.id);
  for (const weapon of ['ak', 'smg', 'spas', 'dmr']) assert.ok(ids.includes('weapon-' + weapon), weapon);
  for (const map of ['desert', 'frost', 'ash', 'jungle', 'crater', 'toxic', 'glass']) assert.ok(ids.includes('map-' + map), map);
  const mapButtons = g.api.snapshot().buttons.filter((b) => b.id.indexOf('map-') === 0);
  assert.strictEqual(mapButtons.length, 7, 'seven maps');
  for (let i = 0; i < mapButtons.length - 1; i++) {
    assert.ok(mapButtons[i].x + mapButtons[i].w <= mapButtons[i + 1].x, 'map cards do not overlap');
  }
  assert.ok(mapButtons[mapButtons.length - 1].x + mapButtons[mapButtons.length - 1].w <= 960, 'the seventh map stays on screen');
  for (const limit of ['endless', '5', '10', '15']) assert.ok(ids.includes('limit-' + limit), limit);

  g.api.clickButton('weapon-dmr');
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  g.api.grantShards(500);
  g.api.clickButton('map-jungle');
  g.api.clickButton('limit-10');
  g.steps(1);
  assert.strictEqual(JSON.stringify(g.api.snapshot().setup), JSON.stringify({ weapon: 'dmr', map: 'jungle', limit: '10', difficulty: 'normal', mutators: [], mode: 'survivors', operator: 'ranger', mutation: 'none' }));
  g.api.clickButton('setup-start');
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play');
  assert.strictEqual(s.weapon, 'dmr');
  assert.strictEqual(s.map, 'jungle');
  assert.strictEqual(s.limitSec, 600);
  assert.strictEqual(s.skills.dmr, 1);
  assert.strictEqual(s.skills.rifle, 0);
});

test('deploy starts a run alone with the chosen weapon', () => {
  const g = boot({ seed: 5 });
  deploy(g);
  const s = g.api.snapshot();
  assert.strictEqual(s.hp, 100);
  assert.strictEqual(s.maxHp, 100);
  assert.strictEqual(s.squad, 0, 'you start alone');
  assert.strictEqual(s.soldiers.length, 0);
  assert.strictEqual(s.skills.rifle, 1);
  assert.strictEqual(s.skills.squad, 0);
  assert.ok(s.time < 0.05);
  assert.strictEqual(s.enemyTypes.length, 0);
  assert.ok(s.explored > 0, 'the start area is explored');
});

test('the squad and weapon auto-fire at hostiles', () => {
  const g = boot({ seed: 7 });
  deploy(g);
  g.api.applyUpgrade('squad');
  g.api.spawnEnemy('grunt', 150, 0);
  g.steps(240);
  const s = g.api.snapshot();
  assert.ok(s.shots.rifle > 0);
  assert.ok(s.shots.soldier > 0);
  assert.ok(s.kills >= 1);
  assert.strictEqual(s.hp, 100);
});

test('squad upgrades add soldiers that keep formation', () => {
  const g = boot({ seed: 11 });
  deploy(g);
  assert.ok(g.api.applyUpgrade('squad'));
  assert.ok(g.api.applyUpgrade('squad'));
  g.steps(60);
  const s = g.api.snapshot();
  assert.strictEqual(s.squad, 2);
  for (const soldier of s.soldiers) {
    assert.ok(Math.hypot(soldier.x - s.player.x, soldier.y - s.player.y) < 120);
  }
  g.api.spawnEnemy('tank', 150, 0);
  g.steps(60);
  assert.ok(g.api.snapshot().shots.soldier >= 2);
});

test('every mob type exists with distinct stats', () => {
  const g = boot({ seed: 13 });
  deploy(g);
  const types = ['grunt', 'runner', 'tank', 'marksman', 'spitter', 'bomber', 'swarm', 'warden', 'weaver', 'splitter', 'leech', 'shielder', 'tunneler', 'screamer', 'phantom'];
  types.forEach((type, i) => g.api.spawnEnemy(type, 240 + i * 10, -140 + i * 30));
  g.steps(1);
  const s = g.api.snapshot();
  for (const type of types) assert.ok(s.enemyTypes.includes(type), type + ' should be on the field');
  const byType = {};
  for (const enemy of s.enemies) byType[enemy.type] = enemy;
  assert.ok(byType.tank.r > byType.swarm.r, 'tanks are bigger than swarmlings');
  assert.ok(byType.tank.maxHp > byType.grunt.maxHp, 'tanks are tougher than crawlers');
  assert.ok(byType.runner.maxHp < byType.grunt.maxHp, 'stalkers are fragile');
});

test('enemy projectiles are red', () => {
  const g = boot({ seed: 17 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('marksman', 260, 0);
  let colors = [];
  for (let i = 0; i < 240; i++) {
    g.step();
    const s = g.api.snapshot();
    if (s.bullets.includes('e')) colors = colors.concat(s.bulletColors);
  }
  assert.ok(colors.length > 0, 'the hexer must fire');
  assert.ok(colors.includes('#ff3b30'), 'enemy bullets are red: ' + colors.join(','));
});

test('leveling offers three distinct upgrades and enforces the cap', () => {
  const g = boot({ seed: 19 });
  deploy(g);
  g.api.giveXp(60);
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'levelup');
  assert.strictEqual(s.level, 2);
  assert.strictEqual(s.offers.length, 3);
  assert.strictEqual(new Set(s.offers).size, 3);
  const chosen = s.offers[0];
  const before = s.skills[chosen];
  assert.ok(g.api.clickButton('upgrade-0'));
  g.steps(1);
  s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play');
  assert.strictEqual(s.skills[chosen], before + 1);

  for (let i = 0; i < 12; i++) g.api.applyUpgrade('rifle');
  assert.strictEqual(g.api.snapshot().skills.rifle, 10, 'skills cap at level 10');
  assert.strictEqual(g.api.applyUpgrade('rifle'), false);
});

test('blades, grenades and dash damage the horde', () => {
  const g = boot({ seed: 23 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.ok(g.api.applyUpgrade('blades'));
  assert.ok(g.api.applyUpgrade('grenade'));
  g.api.spawnEnemy('tank', 55, 0);
  g.api.spawnEnemy('tank', -55, 0);
  g.steps(320);
  let s = g.api.snapshot();
  assert.ok(s.stats.bladeHits > 0, 'orbiting blades must connect');
  assert.ok(s.stats.grenadeHits > 0, 'grenades must connect');

  const d = boot({ seed: 24 });
  deploy(d);
  d.api.setInvulnerable(true);
  assert.ok(d.api.applyUpgrade('dashPower'));
  d.api.spawnEnemy('tank', 46, 0);
  d.steps(1);
  const before = d.api.snapshot().enemies
    .filter((e) => e.type === 'tank')
    .reduce((sum, e) => sum + e.hp, 0);
  assert.ok(before > 0, 'the tank is alive');
  d.key('d');
  d.key('shift');
  d.steps(6);
  d.key('shift', false);
  d.key('d', false);
  const after = d.api.snapshot().enemies
    .filter((e) => e.type === 'tank')
    .reduce((sum, e) => sum + e.hp, 0);
  assert.ok(after < before, 'dash with Shock Boots damages enemies');
});

test('throwing a bomb hits the thickest part of the horde', () => {
  const g = boot({ seed: 29 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('grunt', 70, 0);
  g.api.spawnEnemy('grunt', 60, 20);
  g.api.spawnEnemy('grunt', 80, -10);
  assert.ok(g.api.throwBomb(), 'bomb thrown');
  assert.strictEqual(g.api.snapshot().bomb.ready, false);
  g.steps(70);
  const s = g.api.snapshot();
  assert.strictEqual(s.stats.bombs, 1);
  assert.ok(s.kills >= 2, 'the bomb clears the cluster');

  const g2 = boot({ seed: 31 });
  deploy(g2);
  g2.api.spawnEnemy('grunt', 90, 0);
  g2.key('e');
  g2.steps(1);
  assert.ok(g2.api.snapshot().bombs > 0, 'E also throws a bomb');
});

test('lifesteal heals on damage dealt', () => {
  const g = boot({ seed: 37 });
  deploy(g);
  g.api.hurt(45);
  const low = g.api.snapshot().hp;
  assert.ok(low < 100);
  g.api.setInvulnerable(true);
  assert.ok(g.api.applyUpgrade('lifesteal'));
  assert.ok(g.api.applyUpgrade('lifesteal'));
  g.api.applyUpgrade('damage');
  g.api.applyUpgrade('damage');
  g.api.spawnEnemy('tank', 90, 0);
  g.steps(600);
  const s = g.api.snapshot();
  assert.ok(s.kills >= 1, 'the tank dies');
  assert.ok(s.stats.healing > 0, 'healing was recorded');
  assert.ok(s.hp > low, 'lifesteal restores health');
});

test('skill pairs unlock combos once both reach level 2', () => {
  const g = boot({ seed: 41 });
  deploy(g);
  g.api.applyUpgrade('bulletSpeed');
  g.api.applyUpgrade('bulletSpeed');
  assert.ok(!g.api.snapshot().combos.includes('overclocked'), 'rifle is still level 1');
  g.api.applyUpgrade('rifle');
  assert.ok(g.api.snapshot().combos.includes('overclocked'));
  g.api.applyUpgrade('blades');
  g.api.applyUpgrade('blades');
  g.api.applyUpgrade('dashPower');
  g.api.applyUpgrade('dashPower');
  const combos = g.api.snapshot().combos;
  assert.ok(combos.includes('riposte'));
  assert.ok(combos.includes('overclocked'));
});

test('every fifth wave brings a different boss, and bosses attack', () => {
  const g = boot({ seed: 43 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(160);
  g.steps(4);
  let s = g.api.snapshot();
  assert.strictEqual(s.wave, 5);
  assert.ok(s.boss);
  assert.strictEqual(s.boss.type, 'warlord');
  assert.ok(s.boss.maxHp > 1500, 'bosses are much tougher than mobs');

  g.api.killEnemies();
  g.steps(4);
  g.api.setTime(360);
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.wave, 10);
  assert.strictEqual(s.boss.type, 'overseer');

  g.api.killEnemies();
  g.steps(4);
  g.api.setTime(560);
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.wave, 15);
  assert.strictEqual(s.boss.type, 'bombardier');

  const h = boot({ seed: 47 });
  deploy(h);
  h.api.setInvulnerable(true);
  h.api.spawnBoss('overseer');
  let sawBullet = false;
  let sawBomb = false;
  h.api.spawnBoss('bombardier');
  for (let i = 0; i < 420; i++) {
    h.step();
    const snap = h.api.snapshot();
    if (snap.bullets.includes('e')) sawBullet = true;
    if (snap.bombs > 0) sawBomb = true;
  }
  assert.ok(sawBullet, 'the overseer shoots');
  assert.ok(sawBomb, 'the bombardier throws bombs');
});

test('bosses drop loot and are recorded', () => {
  const g = boot({ seed: 53 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('warlord');
  g.steps(1);
  const gems = g.api.snapshot().gems;
  g.api.killEnemies();
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.boss, null);
  assert.strictEqual(s.bossKills, 1);
  assert.ok(s.medkits >= 1, 'boss drops a medkit');
  assert.ok(s.gems > gems, 'boss showers gems');
});

test('the magnet also pulls medkits', () => {
  const g = boot({ seed: 59 });
  deploy(g);
  g.api.hurt(40);
  const low = g.api.snapshot().hp;
  g.api.applyUpgrade('magnet');
  g.api.applyUpgrade('magnet');
  g.api.spawnMedkit(150, 0);
  g.steps(40);
  const s = g.api.snapshot();
  assert.strictEqual(s.medkits, 0, 'the medkit was pulled in and collected');
  assert.ok(s.hp > low, 'the medkit healed');
});

test('buildings, rocks and trees populate the map and block bodies', () => {
  const g = boot({ seed: 61 });
  deploy(g);
  g.api.setInvulnerable(true);
  let building = null;
  for (let radius = 400; radius <= 3000 && !building; radius += 300) {
    building = g.api.props(0, 0, radius).find((p) => p.kind === 'building');
  }
  assert.ok(building, 'the map has at least one building');
  const all = g.api.props(0, 0, 2400);
  assert.ok(all.some((p) => p.kind === 'rock'), 'rocks exist');
  assert.ok(all.some((p) => p.kind === 'tree'), 'trees exist');
  assert.ok(all.every((p) => Math.hypot(p.x, p.y) >= 300), 'props avoid the spawn area');

  g.api.setPlayer(building.x, building.y);
  g.steps(1);
  const s = g.api.snapshot();
  const dx = Math.max(0, Math.abs(s.player.x - building.x) - building.w / 2);
  const dy = Math.max(0, Math.abs(s.player.y - building.y) - building.h / 2);
  assert.ok(Math.hypot(dx, dy) >= 14, 'the player is pushed out of the building');
});

test('the map viewer opens from play and pause', () => {
  const g = boot({ seed: 67 });
  deploy(g);
  g.steps(30);
  g.key('m');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'mapview');
  assert.ok(g.api.snapshot().buttons.some((b) => b.id === 'map-close'));
  assert.ok(g.api.clickButton('map-close'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'play');

  g.key('escape');
  g.steps(1);
  assert.ok(g.api.clickButton('mapview-pause'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'mapview');
  assert.ok(g.api.clickButton('map-close'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'paused');
});

test('the armory spends shards on permanent upgrades', () => {
  const g = boot({ seed: 71, storage: makeStore() });
  g.api.grantShards(500);
  assert.ok(g.api.clickButton('armory'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'armory');
  const before = g.api.snapshot().save.shards;
  assert.ok(g.api.buyMeta('armor'));
  assert.ok(g.api.buyMeta('power'));
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.save.meta.armor, 1);
  assert.strictEqual(s.save.meta.power, 1);
  assert.ok(s.save.shards < before);
  assert.ok(g.api.clickButton('back-armory'));
  g.steps(1);
  deploy(g);
  const run = g.api.snapshot();
  assert.strictEqual(run.maxHp, 110, 'armor raises max health');
  assert.strictEqual(run.hp, 110);
});

test('statistics are reachable from the menu and the run-over screen', () => {
  const g = boot({ seed: 73 });
  assert.ok(g.api.clickButton('statistics'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'statistics');
  assert.ok(g.api.clickButton('back-stats'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'menu');

  deploy(g);
  g.api.hurt(999);
  g.steps(2);
  assert.strictEqual(g.api.snapshot().screen, 'over');
  assert.ok(g.api.clickButton('stats-over'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'statistics');
  assert.ok(g.api.clickButton('back-stats'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'over');
});

test('settings persist and apply from both menu and pause', () => {
  const store = makeStore();
  const g = boot({ seed: 79, storage: store });
  assert.ok(g.api.clickButton('settings'));
  g.steps(1);
  assert.ok(g.api.clickButton('volume-up'));
  assert.ok(g.api.clickButton('volume-up'));
  assert.ok(g.api.clickButton('shake'));
  assert.ok(g.api.clickButton('damage-numbers'));
  assert.ok(g.api.clickButton('outlines'));
  assert.ok(g.api.clickButton('flashes'));
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.settings.volume, 90);
  assert.strictEqual(s.settings.shake, false);
  assert.strictEqual(s.settings.damageNumbers, false);
  assert.strictEqual(s.settings.outlines, true);
  assert.strictEqual(s.settings.flashes, false);
  assert.ok(g.api.clickButton('back-settings'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'menu');

  const g2 = boot({ seed: 79, storage: store });
  assert.strictEqual(JSON.stringify(g2.api.snapshot().settings), JSON.stringify(s.settings));

  deploy(g2);
  g2.key('escape');
  g2.steps(1);
  assert.ok(g2.api.clickButton('settings-pause'));
  g2.steps(1);
  assert.strictEqual(g2.api.snapshot().screen, 'settings');
  assert.ok(g2.api.clickButton('back-settings'));
  g2.steps(1);
  assert.strictEqual(g2.api.snapshot().screen, 'paused');
});

test('hostile outlines add a readable ring around enemies', () => {
  const plain = boot({ seed: 81, record: true });
  deploy(plain);
  plain.api.spawnEnemy('grunt', 220, 0);
  plain.steps(1);
  const ring = (g) => g.strokes.filter((s) => s.strokeStyle === 'rgba(255,250,235,0.6)' && s.lineWidth === 1.25);
  assert.strictEqual(ring(plain).length, 0, 'outlines are off by default');

  const marked = boot({ seed: 81, record: true });
  assert.ok(marked.api.clickButton('settings'));
  marked.steps(1);
  assert.ok(marked.api.clickButton('outlines'));
  marked.steps(1);
  assert.ok(marked.api.clickButton('back-settings'));
  marked.steps(1);
  deploy(marked);
  marked.api.spawnEnemy('grunt', 220, 0);
  marked.steps(1);
  assert.ok(ring(marked).length >= 1, 'the hostile ring draws when enabled');
});

test('reduced flash suppresses milestone screen pulses', () => {
  const bright = boot({ seed: 85 });
  deploy(bright);
  bright.api.setKills(10);
  bright.steps(1);
  assert.ok(bright.api.snapshot().flashT > 0, 'the milestone pulses by default');

  const calm = boot({ seed: 85 });
  assert.ok(calm.api.clickButton('settings'));
  calm.steps(1);
  assert.ok(calm.api.clickButton('flashes'));
  calm.steps(1);
  assert.ok(calm.api.clickButton('back-settings'));
  calm.steps(1);
  deploy(calm);
  calm.api.setKills(10);
  calm.steps(1);
  assert.strictEqual(calm.api.snapshot().settings.flashes, false);
  assert.strictEqual(calm.api.snapshot().flashT, 0, 'the pulse is suppressed');
});

test('pause freezes the run and restart resets it', () => {
  const g = boot({ seed: 83 });
  deploy(g, { weapon: 'spas', map: 'frost', limit: '5' });
  g.steps(60);
  const before = g.api.snapshot();
  g.key('escape');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'paused');
  g.steps(60);
  assert.strictEqual(g.api.snapshot().time, before.time);
  assert.ok(g.api.clickButton('resume'));
  g.steps(10);
  g.key('escape');
  g.steps(1);
  assert.ok(g.api.clickButton('restart'));
  g.steps(1);
  const fresh = g.api.snapshot();
  assert.strictEqual(fresh.screen, 'play');
  assert.ok(fresh.time < 0.1);
  assert.strictEqual(fresh.kills, 0);
  assert.strictEqual(fresh.weapon, 'spas', 'restart keeps the loadout');
  assert.strictEqual(fresh.map, 'frost');
});

test('death records progress and retry starts over', () => {
  const store = makeStore();
  const g = boot({ seed: 89, storage: store });
  deploy(g);
  g.steps(30);
  g.api.spawnEnemy('grunt', 120, 0);
  g.steps(90);
  const survived = g.api.snapshot().time;
  g.api.hurt(999);
  g.steps(2);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.strictEqual(s.hp, 0);
  assert.ok(s.save.bestTime >= survived);
  assert.ok(s.save.runs >= 1);
  assert.ok(s.save.shards > 0);
  assert.ok(store.data['dustline.save'], 'progress is stored');
  assert.ok(g.api.clickButton('retry'));
  g.steps(1);
  s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play');
  assert.ok(s.time < 0.1);
  assert.strictEqual(s.level, 1);
  assert.ok(s.save.bestTime >= survived);
});

test('hitting the time limit wins the run', () => {
  const g = boot({ seed: 97 });
  deploy(g, { limit: '5' });
  g.api.setInvulnerable(true);
  g.api.setTime(299.5);
  g.steps(60);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.strictEqual(s.victory, true);
  assert.strictEqual(s.save.wins, 1);
  assert.ok(s.shardsEarned > 0);
});

test('progress persists across sessions', () => {
  const store = makeStore();
  const g = boot({ seed: 101, storage: store });
  deploy(g, { limit: '5' });
  g.api.setInvulnerable(true);
  g.api.setTime(299.5);
  g.steps(60);
  const earned = g.api.snapshot().save;

  const g2 = boot({ seed: 103, storage: store });
  const loaded = g2.api.snapshot().save;
  assert.strictEqual(loaded.runs, earned.runs);
  assert.strictEqual(loaded.shards, earned.shards);
  assert.strictEqual(loaded.wins, earned.wins);
  assert.strictEqual(loaded.bestTime, earned.bestTime);
});

test('the map is infinite, explored territory grows and the camera follows', () => {
  const g = boot({ seed: 107 });
  deploy(g);
  g.api.setInvulnerable(true);
  const startExplored = g.api.snapshot().explored;
  g.key('d');
  g.steps(420);
  g.key('d', false);
  const s = g.api.snapshot();
  assert.ok(s.player.x > 1200, 'the player can leave the original screen');
  assert.ok(Math.abs(s.cam.x - (s.player.x - 480)) < 60, 'camera tracks the player');
  assert.ok(s.explored > startExplored, 'the map viewer remembers where you have been');
  g.key('w');
  g.steps(120);
  g.key('w', false);
  assert.ok(g.api.snapshot().player.y < 0, 'the map has no upper edge');
});

test('waves escalate and late mob types appear', () => {
  const g = boot({ seed: 109 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(60);
  const seen = new Set();
  for (let i = 0; i < 800; i++) {
    if (g.api.snapshot().screen === 'levelup') g.api.clickButton('upgrade-0');
    g.step();
    for (const type of g.api.snapshot().enemyTypes) seen.add(type);
  }
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play');
  assert.ok(s.wave >= 2);
  assert.ok(seen.has('runner'), 'stalkers join after 15 seconds');
  assert.ok(seen.has('spitter'), 'spitters join after 45 seconds');
  assert.ok(seen.has('marksman'), 'hexers join after 50 seconds');
  assert.ok(s.kills >= 5);
});

test('the character evolves through visual tiers as it levels', () => {
  const g = boot({ seed: 131 });
  deploy(g);
  assert.strictEqual(g.api.snapshot().tier, 0);
  g.api.giveXp(1800);
  for (let i = 0; i < 80 && g.api.snapshot().screen === 'levelup'; i++) {
    g.api.clickButton('upgrade-0');
  }
  const s = g.api.snapshot();
  assert.ok(s.level >= 10, 'the run leveled enough to evolve');
  assert.strictEqual(s.tier, evolutionTierFor(s.level));
});

function evolutionTierFor(level) {
  if (level >= 18) return 3;
  if (level >= 10) return 2;
  if (level >= 5) return 1;
  return 0;
}

test('upgrades and help screens are reachable from the menu', () => {
  const g = boot({ seed: 113, record: true });
  assert.ok(g.api.clickButton('upgrades'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'upgrades');
  assert.ok(g.api.clickButton('back-upgrades'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'menu');
  assert.ok(g.api.clickButton('help'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'help');
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.some((t) => t.indexOf('quicksand') >= 0 && t.indexOf('glass') >= 0), 'the hazard line lists every hazard');
  assert.ok(labels.some((t) => t.indexOf('prop-free') >= 0), 'the help explains arenas');
  assert.ok(labels.some((t) => t.indexOf('Pick E or Q') >= 0), 'the help mentions the key choice');
  assert.ok(labels.some((t) => t.indexOf('surge ring') >= 0), 'the help mentions surge waves');
  assert.ok(labels.includes('RANKS'), 'the help documents ranks');
  assert.ok(labels.includes('OPS'), 'the help documents ops mode');
  assert.ok(!labels.some((t) => t.endsWith('..')), 'no help line is cut off mid-word');
  assert.ok(g.api.clickButton('back-help'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'menu');
});

test('losing window focus pauses the run', () => {
  const g = boot({ seed: 127 });
  deploy(g);
  g.steps(30);
  g.winHandlers.blur();
  g.steps(1);
  const paused = g.api.snapshot();
  assert.strictEqual(paused.screen, 'paused');
  g.steps(60);
  assert.strictEqual(g.api.snapshot().time, paused.time);
});

test('debug helpers stay hidden outside the test harness', () => {
  const g = boot({ testSeam: false });
  const api = g.api;
  assert.strictEqual(typeof api.snapshot, 'function');
  for (const name of [
    'clickButton', 'giveXp', 'spawnEnemy', 'hurt', 'applyUpgrade', 'setInvulnerable',
    'spawnBoss', 'setTime', 'killEnemies', 'startRun', 'throwBomb', 'spawnMedkit',
    'grantShards', 'buyMeta', 'props', 'setPlayer', 'setAlert', 'setUnbanked',
    'bankNow', 'triggerEvent', 'setEventCd', 'setRng', 'setEnemyHp', 'setOverdrive',
    'spawnChip', 'hitEnemy', 'setHunterCd', 'forceContracts', 'spawnChest', 'hazardAtPoint', 'setMutators',
    'reroll', 'banish', 'forceChampion', 'setGhost', 'setBurrowed', 'forceBossAffix',
    'grantRelic', 'spawnSalvage', 'spawnWarChest', 'setKills', 'setStreak'
  ]) {
    assert.strictEqual(api[name], undefined, name + ' must be test-only');
  }
});


test('variable-ratio rewards produce standard, jackpot and chip drops', () => {
  const g = boot({ seed: 211 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setRng(12345);
  for (let i = 0; i < 220; i++) g.api.spawnEnemy('grunt', 900 + i * 4, 900);
  g.api.killEnemies();
  const s = g.api.snapshot();
  assert.ok(s.stats.jackpots > 20, 'roughly a fifth of kills are jackpots');
  assert.ok(s.chips.length > 8, 'roughly a tenth drop hardware chips');
  assert.ok(s.unbanked > 0, 'kills earn risky shards');
  assert.ok(s.alert > 50, 'mass killing raises the sector alert');
});

test('a near miss grants a one-shot crit surge', () => {
  const g = boot({ seed: 213 });
  deploy(g);
  g.api.spawnEnemy('tank', 120, 0);
  g.api.setEnemyHp(0, 5);
  g.api.hitEnemy(0, 1);
  const s = g.api.snapshot();
  assert.strictEqual(s.stats.nearMisses, 1);
  assert.ok(s.surge > 0, 'surge window opened');
  assert.ok(s.damageMult >= 1);
});

test('wardens absorb damage while other mobs take it whole', () => {
  const g = boot({ seed: 217 });
  deploy(g);
  g.api.spawnEnemy('warden', 120, 0);
  g.api.spawnEnemy('tank', 200, 0);
  g.api.setEnemyHp(0, 5000);
  g.api.setEnemyHp(1, 5000);
  g.api.hitEnemy(0, 100);
  g.api.hitEnemy(1, 100);
  const s = g.api.snapshot();
  const warden = s.enemies.find((e) => e.type === 'warden');
  const tank = s.enemies.find((e) => e.type === 'tank');
  assert.ok(5000 - warden.hp < 60, 'warden plating absorbs most of the hit');
  assert.strictEqual(5000 - tank.hp, 100, 'the tank takes full damage');
});

test('splitters break into swarmlings when killed', () => {
  const g = boot({ seed: 219 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('splitter', 140, 0);
  g.api.killEnemies();
  g.steps(1);
  const swarms = g.api.snapshot().enemies.filter((e) => e.type === 'swarm');
  assert.strictEqual(swarms.length, 2);
});

test('beacons bank risky shards and death halves what is left', () => {
  const g = boot({ seed: 223 });
  deploy(g);
  g.api.spawnBoss('warlord');
  g.api.killEnemies();
  g.steps(1);
  let s = g.api.snapshot();
  assert.ok(s.beacon, 'the boss arms an extraction beacon');
  assert.ok(s.unbanked > 0);
  g.api.setPlayer(s.beacon.x, s.beacon.y);
  g.steps(4);
  for (let i = 0; i < 20 && g.api.snapshot().screen === 'levelup'; i++) g.api.clickButton('upgrade-0');
  if (g.api.snapshot().screen === 'relic') g.api.clickButton('relic-0');
  s = g.api.snapshot();
  assert.strictEqual(s.beacon, null);
  const secured = s.banked;
  assert.ok(secured > 0, 'touching the beacon secures shards');
  g.api.setUnbanked(100);
  g.api.hurt(999);
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.lost, 50, 'death burns half of the unbanked shards');
  assert.ok(s.banked >= secured + 50, 'the other half is banked');
});

test('mega bosses arrive after three regular bosses and use phases', () => {
  const g = boot({ seed: 227 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(760);
  g.steps(2);
  let s = g.api.snapshot();
  assert.strictEqual(s.wave, 20);
  assert.strictEqual(s.boss.type, 'colossus');
  assert.strictEqual(s.boss.mega, true);
  const idx = s.enemies.findIndex((e) => e.boss);
  g.api.setEnemyHp(idx, Math.round(s.boss.maxHp * 0.6));
  g.api.hitEnemy(idx, 1);
  g.steps(2);
  s = g.api.snapshot();
  assert.ok(s.boss && s.boss.phase >= 1, 'the mega boss enters phase two');
  g.api.killEnemies();
  g.steps(4);
  g.api.setTime(1560);
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.wave, 40);
  assert.strictEqual(s.boss.type, 'leviathan');
  assert.strictEqual(s.boss.mega, true);
});

test('wave 30 brings the warlord again with a 140-kill war chest', () => {
  const g = boot({ seed: 99 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(1160);
  g.steps(4);
  const s = g.api.snapshot();
  assert.strictEqual(s.wave, 30);
  assert.ok(s.boss, 'wave 30 spawns a boss');
  assert.strictEqual(s.boss.type, 'warlord');
  assert.strictEqual(s.boss.mega, false);
  assert.ok(s.warChest, 'wave 30 spawns a war chest');
  assert.strictEqual(s.warChest.need, 140);
});

test('high alert deploys NetWatch hunters', () => {
  const g = boot({ seed: 229 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setAlert(70);
  g.api.setHunterCd(0);
  g.steps(2);
  const s = g.api.snapshot();
  assert.ok(s.enemyTypes.includes('hunter'), 'a hunter joins the sector');
  assert.ok(s.alert > 70);
});

test('sector events change the run', () => {
  const g = boot({ seed: 233 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.ok(g.api.triggerEvent('supply'));
  g.steps(1);
  let s = g.api.snapshot();
  assert.ok(s.medkits >= 3, 'supply drop scatters medkits');
  assert.ok(s.chips.length >= 2, 'and tech chips');
  assert.ok(g.api.triggerEvent('sandstorm'));
  g.steps(1);
  s = g.api.snapshot();
  assert.strictEqual(s.event.id, 'sandstorm');
  assert.ok(g.api.triggerEvent('bounty'));
  g.steps(1);
  s = g.api.snapshot();
  assert.ok(s.enemyTypes.includes('hunter'), 'bounty deploys a hunter');
});

test('overdrive trades safety for damage', () => {
  const g = boot({ seed: 239 });
  deploy(g);
  g.api.setOverdrive(true);
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.overdrive.active, true);
  assert.ok(s.damageMult > 1.3, 'overdrive raises outgoing damage');
  g.api.setOverdrive(false);
  s = g.api.snapshot();
  assert.strictEqual(s.overdrive.active, false);
  assert.ok(s.damageMult < 1.3);
});

test('contracts complete and pay out', () => {
  const g = boot({ seed: 241 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.ok(g.api.forceContracts(['cull', 'survive']));
  const before = g.api.snapshot().unbanked;
  for (let i = 0; i < 50; i++) g.api.spawnEnemy('grunt', 900 + i * 4, 900);
  g.api.killEnemies();
  g.steps(4);
  const s = g.api.snapshot();
  assert.strictEqual(s.contracts[0].done, true);
  assert.strictEqual(s.stats.contracts >= 1, true);
  assert.ok(s.unbanked > before, 'the contract paid risky shards');
});

test('trophy and cache contracts complete and pay out', () => {
  const g = boot({ seed: 242 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.ok(g.api.forceContracts(['trophy', 'cache']));
  const before = g.api.snapshot().unbanked;
  g.api.spawnEnemy('tank', 120, 0);
  g.api.spawnEnemy('tank', 160, 0);
  assert.ok(g.api.forceChampion(0, 'shielded'));
  assert.ok(g.api.forceChampion(1, 'swift'));
  g.api.killEnemies();
  g.steps(4);
  let s = g.api.snapshot();
  assert.strictEqual(s.stats.champions, 2, 'two champions were slain');
  g.api.spawnChest(18, 0);
  g.steps(6);
  g.api.spawnChest(-18, 0);
  g.steps(6);
  s = g.api.snapshot();
  assert.strictEqual(s.stats.chests >= 2, true, 'two supply caches were opened');
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.contracts[0].done, true, 'trophy hunter completes');
  assert.strictEqual(s.contracts[1].done, true, 'cache raider completes');
  assert.ok(s.stats.contracts >= 2, 'both contracts counted');
  assert.ok(s.unbanked > before, 'both contracts paid risky shards');
});

test('hunter and close-call contracts complete and pay out', () => {
  const g = boot({ seed: 243 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.ok(g.api.forceContracts(['hunter', 'closecall']));
  const before = g.api.snapshot().unbanked;
  g.api.spawnEnemy('hunter', 140, 0);
  g.api.spawnEnemy('hunter', 160, 0);
  g.api.killEnemies();
  g.steps(4);
  let s = g.api.snapshot();
  assert.strictEqual(s.stats.hunters, 2, 'two hunters were slain');
  for (let k = 0; k < 12; k++) {
    g.api.spawnEnemy('tank', 300 + k * 4, 0);
    g.api.setEnemyHp(k, 5);
    g.api.hitEnemy(k, 1);
  }
  g.api.killEnemies();
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.stats.nearMisses, 12, 'twelve near misses were baited');
  assert.strictEqual(s.contracts[0].done, true, 'hunter down completes');
  assert.strictEqual(s.contracts[1].done, true, 'close calls completes');
  assert.ok(s.stats.contracts >= 2, 'both contracts counted');
  assert.ok(s.unbanked > before, 'both contracts paid risky shards');
});

test('hardware chips apply their effects', () => {
  const g = boot({ seed: 251 });
  deploy(g);
  g.api.setInvulnerable(true);
  const before = g.api.snapshot().unbanked;
  g.api.spawnChip('shards', 10, 0);
  g.steps(2);
  assert.ok(g.api.snapshot().unbanked > before, 'data chip adds unbanked shards');
  g.api.spawnChip('frenzy', 10, 0);
  g.steps(2);
  assert.ok(g.api.snapshot().frenzy > 0, 'frenzy chip arms rapid fire');
  g.api.setOverdrive(false);
  g.api.spawnChip('aegis', 10, 0);
  g.steps(1);
  assert.ok(g.api.snapshot().stats.chips >= 3);
});

test('victory pays a survival bonus', () => {
  const g = boot({ seed: 257 });
  deploy(g, { limit: '5' });
  g.api.setInvulnerable(true);
  g.api.setTime(299.7);
  g.steps(30);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.strictEqual(s.victory, true);
  assert.ok(s.rushBonus > 0, 'a healthy victory converts into bonus shards');
  assert.ok(s.shardsEarned > 0);
});

test('restarting or quitting ends the run and advances the seed', () => {
  const store = makeStore();
  const g = boot({ seed: 263, storage: store });
  deploy(g);
  g.steps(20);
  g.api.setUnbanked(40);
  const seed = g.api.snapshot().seed;
  g.key('escape');
  g.steps(1);
  assert.ok(g.api.clickButton('menu-pause'));
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'menu');
  assert.strictEqual(s.save.runs, 1);
  assert.ok(s.save.lostTotal > 0, 'quitting burns half the unbanked shards');

  enterSetup(g);
  g.api.clickButton('setup-start');
  g.steps(1);
  s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play');
  assert.notStrictEqual(s.seed, seed, 'the deterministic run seed advances');
});

test('an empty extraction beacon is not consumed', () => {
  const g = boot({ seed: 269 });
  deploy(g);
  g.api.spawnBoss('warlord');
  g.api.killEnemies();
  g.steps(1);
  const beacon = g.api.snapshot().beacon;
  assert.ok(beacon);
  g.api.setUnbanked(0);
  g.api.setPlayer(beacon.x, beacon.y);
  g.steps(2);
  const s = g.api.snapshot();
  assert.ok(s.beacon, 'the beacon stays while there is nothing to bank');
  assert.strictEqual(Math.floor(s.unbanked), 0);
});

test('mega bosses barrage and summon on phase change', () => {
  const g = boot({ seed: 271 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('colossus', 340, 0);
  g.steps(1);
  let maxBullets = 0;
  let maxEnemies = g.api.snapshot().enemies.length;
  for (let i = 0; i < 360; i++) {
    g.step();
    const snap = g.api.snapshot();
    maxBullets = Math.max(maxBullets, snap.bullets.filter((o) => o === 'e').length);
    maxEnemies = Math.max(maxEnemies, snap.enemies.length);
  }
  assert.ok(maxBullets >= 10, 'the mega boss fires radial barrages');
  const s = g.api.snapshot();
  const idx = s.enemies.findIndex((e) => e.type === 'colossus');
  g.api.setEnemyHp(idx, Math.round(s.boss.maxHp * 0.6));
  g.api.hitEnemy(idx, 1);
  g.steps(2);
  const after = g.api.snapshot();
  assert.ok(after.boss.phase >= 1, 'the mega boss enters a new phase');
  assert.ok(after.enemies.length > maxEnemies - 1, 'the phase change adds minions');
});


test('maxing a weapon and its partner evolves it', () => {
  const g = boot({ seed: 401 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 9; i++) assert.ok(g.api.applyUpgrade('rifle'));
  assert.ok(!g.api.snapshot().evolved.rifle, 'a maxed weapon alone does not evolve');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('bulletSpeed');
  let s = g.api.snapshot();
  assert.ok(!s.evolved.rifle, 'evolution waits for the player to pick it');
  assert.ok(s.bannerT > 0, 'readiness is announced');
  g.api.giveXp(s.xpNext);
  assert.strictEqual(g.api.snapshot().screen, 'levelup');
  assert.strictEqual(g.api.snapshot().offers[0], 'evo:rifle', 'the evolve card leads the choice');
  assert.ok(g.api.chooseUpgrade(0), 'player picks the evolution');
  s = g.api.snapshot();
  assert.strictEqual(s.evolved.rifle, 'ripper');
  assert.ok(s.bannerT > 0, 'the evolution is announced');
  g.api.spawnEnemy('tank', 200, 0);
  const before = s.shots.rifle;
  g.steps(40);
  s = g.api.snapshot();
  assert.ok(s.shots.rifle - before >= 3, 'the Ripper fires a triple shot');
});

test('champions carry affixes and drop supply caches', () => {
  const g = boot({ seed: 403 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('tank', 120, 0);
  assert.ok(g.api.forceChampion(0, 'shielded'));
  let s = g.api.snapshot();
  assert.strictEqual(s.enemies[0].champion, true);
  assert.strictEqual(s.enemies[0].affix, 'shielded');
  const before = s.skills;
  g.api.setEnemyHp(0, 10);
  g.api.hitEnemy(0, 999);
  s = g.api.snapshot();
  assert.strictEqual(s.stats.champions, 1);
  assert.strictEqual(s.chests, 1, 'a champion always drops a cache');
  g.api.setPlayer(120, 0);
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.chests, 0);
  assert.strictEqual(s.stats.chests, 1);
  const gained = Object.keys(s.skills).filter((id) => s.skills[id] > before[id]);
  assert.ok(gained.length >= 1, 'the cache grants at least one field upgrade');
});

test('difficulty scales enemies, damage and loot', () => {
  const normal = boot({ seed: 407 });
  const brutal = boot({ seed: 407 });
  deploy(normal);
  deploy(brutal, { difficulty: 'brutal' });
  normal.api.spawnEnemy('grunt', 300, 0);
  brutal.api.spawnEnemy('grunt', 300, 0);
  const n = normal.api.snapshot();
  const b = brutal.api.snapshot();
  assert.strictEqual(b.difficulty, 'brutal');
  assert.ok(b.enemies[0].maxHp > n.enemies[0].maxHp * 1.3, 'brutal mobs are tougher');
  normal.api.hurt(20);
  brutal.api.hurt(20);
  assert.ok(brutal.api.snapshot().hp < normal.api.snapshot().hp, 'brutal hits harder');
  normal.api.setEnemyHp(0, 1);
  brutal.api.setEnemyHp(0, 1);
  normal.api.hitEnemy(0, 50);
  brutal.api.hitEnemy(0, 50);
  assert.ok(brutal.api.snapshot().unbanked > normal.api.snapshot().unbanked, 'brutal pays more');
});

test('rerolls and banishes reshape the level-up offers', () => {
  const g = boot({ seed: 409 });
  deploy(g);
  g.api.giveXp(60);
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'levelup');
  assert.strictEqual(s.rerolls, 2);
  assert.ok(g.api.reroll());
  s = g.api.snapshot();
  assert.strictEqual(s.rerolls, 1);
  const target = s.offers[0];
  assert.ok(g.api.banish(0));
  s = g.api.snapshot();
  assert.strictEqual(s.banishes, 0);
  assert.ok(s.banned.includes(target));
  assert.ok(!s.offers.includes(target), 'a banished skill is gone for this run');
});

test('the luck meta grants an extra reroll', () => {
  const g = boot({ seed: 411 });
  g.api.grantShards(1000);
  assert.ok(g.api.buyMeta('luck'));
  deploy(g);
  assert.strictEqual(g.api.snapshot().rerolls, 3);
});

test('shielder auras reduce incoming damage', () => {
  const g = boot({ seed: 413 });
  deploy(g);
  g.api.spawnEnemy('tank', 0, 0);
  g.api.spawnEnemy('shielder', 60, 0);
  g.api.setEnemyHp(0, 5000);
  g.steps(1);
  g.api.hitEnemy(0, 100);
  const s = g.api.snapshot();
  const tank = s.enemies.find((e) => e.type === 'tank');
  assert.ok(5000 - tank.hp <= 80, 'the aura cuts damage');
  assert.ok(tank.shielding, 'the tank is marked as shielded');
});

test('phantoms and tunnelers are untouchable in their special states', () => {
  const g = boot({ seed: 419 });
  deploy(g);
  g.api.spawnEnemy('phantom', 120, 0);
  g.api.spawnEnemy('tunneler', 200, 0);
  g.api.setEnemyHp(0, 800);
  g.api.setEnemyHp(1, 800);
  assert.ok(g.api.setGhost(0, true));
  assert.ok(g.api.setBurrowed(1, true));
  g.api.hitEnemy(0, 200);
  g.api.hitEnemy(1, 200);
  let s = g.api.snapshot();
  assert.strictEqual(s.enemies[0].hp, 800, 'ghosted phantoms take no damage');
  assert.strictEqual(s.enemies[1].hp, 800, 'burrowed tunnelers take no damage');
  g.api.setGhost(0, false);
  g.api.setBurrowed(1, false);
  g.api.hitEnemy(0, 200);
  g.api.hitEnemy(1, 200);
  s = g.api.snapshot();
  assert.ok(s.enemies[0].hp < 800);
  assert.ok(s.enemies[1].hp < 800);
});

test('screamers enrage nearby enemies', () => {
  const g = boot({ seed: 421 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('screamer', 40, 0);
  g.api.spawnEnemy('tank', 90, 0);
  g.api.setEnemyHp(0, 100000);
  g.api.setEnemyHp(1, 100000);
  let raged = false;
  for (let i = 0; i < 300 && !raged; i++) {
    g.step();
    raged = g.api.snapshot().enemies.some((e) => e.type === 'tank' && e.rage > 0);
  }
  assert.ok(raged, 'the screech buffs nearby mobs');
});

test('champions and caches persist in the career record', () => {
  const store = makeStore();
  const g = boot({ seed: 423, storage: store });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('tank', 60, 0);
  g.api.forceChampion(0, 'swift');
  g.api.setEnemyHp(0, 5);
  g.api.hitEnemy(0, 999);
  g.steps(1);
  g.api.setPlayer(60, 0);
  g.steps(4);
  for (let i = 0; i < 20 && g.api.snapshot().screen === 'levelup'; i++) g.api.clickButton('upgrade-0');
  g.api.setInvulnerable(false);
  g.api.hurt(9999);
  g.steps(4);
  const saved = g.api.snapshot().save;
  assert.ok(saved.champions >= 1);
  assert.ok(saved.chests >= 1);
  const g2 = boot({ seed: 425, storage: store });
  const reloaded = g2.api.snapshot().save;
  assert.strictEqual(reloaded.champions, saved.champions);
  assert.strictEqual(reloaded.chests, saved.chests);
});


test('mutators toggle up to two and apply their modifiers', () => {
  const g = boot({ seed: 431 });
  enterSetup(g);
  g.api.clickButton('setup-tab-2');
  g.steps(1);
  g.api.clickButton('mutator-glass');
  g.api.clickButton('mutator-swarm');
  g.api.clickButton('mutator-fog');
  g.steps(1);
  let s = g.api.snapshot();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.setup.mutators)), ['glass', 'swarm'], 'only two fit');
  g.api.clickButton('setup-start');
  g.steps(1);
  s = g.api.snapshot();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.mutators)), ['glass', 'swarm']);
  assert.ok(s.mutatorLoot > 1.4, 'mutators multiply loot');
  assert.ok(s.damageMult > 1.3, 'glass raises outgoing damage');
  g.api.spawnEnemy('grunt', 300, 0);
  s = g.api.snapshot();
  assert.ok(s.enemies[0].maxHp < 26, 'swarm reduces mob health');
  const before = s.hp;
  g.api.hurt(20);
  assert.ok(before - g.api.snapshot().hp > 20, 'glass raises damage taken');
});

test('each map has a terrain hazard and embers burn', () => {
  const expectations = { desert: 'quicksand', frost: 'ice', ash: 'embers', jungle: 'vines' };
  for (const map of Object.keys(expectations)) {
    const g = boot({ seed: 433 });
    enterSetup(g);
    g.api.grantShards(5000);
    g.api.clickButton('setup-tab-1');
    g.steps(1);
    g.api.clickButton('map-' + map);
    g.api.clickButton('setup-start');
    g.steps(1);
    let found = null;
    for (let r = 60; r <= 1600 && !found; r += 40) {
      for (let a = 0; a < 32; a++) {
        const x = Math.cos((a / 32) * Math.PI * 2) * r;
        const y = Math.sin((a / 32) * Math.PI * 2) * r;
        const hz = g.api.hazardAtPoint(x, y);
        if (hz) { found = { hz, x, y }; break; }
      }
    }
    assert.ok(found, map + ' exposes a hazard');
    assert.strictEqual(found.hz, expectations[map]);
    if (map === 'ash') {
      g.api.setPlayer(found.x, found.y);
      const before = g.api.snapshot().hp;
      g.steps(80);
      assert.ok(g.api.snapshot().hp < before, 'embers burn the player');
    }
  }
});

test('sentry turrets deploy and fire on their own', () => {
  const g = boot({ seed: 439 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.applyUpgrade('turret');
  g.api.applyUpgrade('turret');
  g.steps(240);
  let s = g.api.snapshot();
  assert.ok(s.turrets >= 1, 'a turret is deployed');
  g.api.spawnEnemy('tank', 120, 0);
  g.api.setEnemyHp(0, 100000);
  g.steps(180);
  s = g.api.snapshot();
  assert.ok(s.stats.shots.turret > 0, 'the turret fires without the player aiming');
  assert.ok(s.stats.turrets >= 1);
});

test('ember aura burns enemies close to the player', () => {
  const g = boot({ seed: 443 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.applyUpgrade('aura');
  g.api.applyUpgrade('aura');
  g.api.spawnEnemy('tank', 40, 0);
  g.api.setEnemyHp(0, 100000);
  g.steps(120);
  const s = g.api.snapshot();
  assert.strictEqual(s.auraRadius, 72 + 9 * g.api.snapshot().skills.aura);
  assert.ok(s.stats.auraHits > 0, 'the aura applies damage ticks');
  assert.ok(s.enemies[0].hp < 100000);
});

test('achievements unlock live, pay shards and persist', () => {
  const store = makeStore();
  const g = boot({ seed: 449, storage: store });
  deploy(g);
  g.api.spawnEnemy('grunt', 100, 0);
  g.api.setEnemyHp(0, 1);
  g.api.hitEnemy(0, 50);
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.save.achievements.first_blood, true, 'first kill unlocks immediately');
  assert.ok(s.save.shards >= 10, 'the achievement paid out');
  const g2 = boot({ seed: 451, storage: store });
  assert.strictEqual(g2.api.snapshot().save.achievements.first_blood, true);
});

test('achievements evaluate against a pre-loaded career record', () => {
  const store = makeStore();
  store.data['dustline.save'] = JSON.stringify({ v: 2, totalKills: 300, bossKills: 6, bestTime: 700 });
  const g = boot({ seed: 457, storage: store });
  const s = g.api.snapshot();
  assert.strictEqual(s.save.achievements.first_blood, true);
  assert.strictEqual(s.save.achievements.culler, true);
  assert.strictEqual(s.save.achievements.boss_slayer, true);
  assert.strictEqual(s.save.achievements.marathon, true);
  assert.ok(s.save.achievementCount >= 4);
});

test('the loadout offers the railgun as a fifth weapon', () => {
  const g = boot({ seed: 463 });
  enterSetup(g);
  const ids = g.api.snapshot().buttons.map((b) => b.id);
  assert.ok(ids.includes('weapon-rail'), 'the railgun is selectable');
  const card = g.api.snapshot().buttons.find((b) => b.id === 'weapon-rail');
  assert.ok(card.x + card.w <= 960, 'the fifth weapon card fits on screen');
  deploy(g, { weapon: 'rail' });
  const s = g.api.snapshot();
  assert.strictEqual(s.weapon, 'rail');
  assert.strictEqual(s.skills.rail, 1);
});

test('the railgun fires piercing shots through a line', () => {
  const g = boot({ seed: 467 });
  deploy(g, { weapon: 'rail' });
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('runner', 300, 0);
  g.api.spawnEnemy('runner', 345, 0);
  g.api.spawnEnemy('runner', 390, 0);
  g.api.setEnemyHp(0, 40);
  g.api.setEnemyHp(1, 40);
  g.api.setEnemyHp(2, 40);
  let fired = false;
  let sawRailColor = false;
  for (let i = 0; i < 80 && !fired; i++) {
    g.step();
    if (g.api.snapshot().shots.rail > 0) fired = true;
  }
  assert.ok(fired, 'the railgun auto-fires at nearby enemies');
  for (let i = 0; i < 40; i++) {
    g.step();
    if (g.api.snapshot().bulletColors.includes('#9fe8ff')) sawRailColor = true;
  }
  const s = g.api.snapshot();
  assert.ok(sawRailColor, 'railgun bullets use their own tracer color');
  assert.ok(s.kills >= 3, 'one volley pierces the whole line, kills: ' + s.kills);
});

test('the railgun evolves into the lancer', () => {
  const g = boot({ seed: 469 });
  deploy(g, { weapon: 'rail' });
  for (let i = 0; i < 9; i++) g.api.applyUpgrade('rail');
  assert.strictEqual(g.api.snapshot().evolved.rail, undefined);
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('bulletSpeed');
  assert.strictEqual(g.api.snapshot().evolved.rail, undefined, 'evolution waits for the pick');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.strictEqual(g.api.snapshot().offers[0], 'evo:rail');
  assert.ok(g.api.chooseUpgrade(0));
  assert.strictEqual(g.api.snapshot().evolved.rail, 'lancer');
});

test('HIVE bosses fire bullet rings and spawn broods', () => {
  const g = boot({ seed: 471 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('hive');
  let maxRing = 0;
  let brood = false;
  let prevShots = 0;
  let prevCount = 1;
  for (let i = 0; i < 260; i++) {
    g.step();
    const s = g.api.snapshot();
    const delta = (s.stats.shots.enemy || 0) - prevShots;
    if (delta > maxRing) maxRing = delta;
    prevShots = s.stats.shots.enemy || 0;
    if (s.enemies.length - prevCount >= 3) brood = true;
    prevCount = s.enemies.length;
  }
  assert.ok(maxRing >= 10, 'the hive fires a ten-bullet ring at once, saw ' + maxRing);
  assert.ok(brood, 'the hive spawns brood mobs in trios');
});

test('SENTINEL bosses telegraph and fire a damaging beam', () => {
  const g = boot({ seed: 479 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('sentinel');
  let charged = false;
  let fired = false;
  let hpBefore = 100;
  let postFire = 0;
  for (let i = 0; i < 600 && postFire < 4; i++) {
    g.step();
    const s = g.api.snapshot();
    if (!s.boss) break;
    if (!charged && s.boss.beamState === 'charge') {
      charged = true;
      g.api.setInvulnerable(false);
      hpBefore = s.hp;
    }
    if (s.boss.beamState === 'fire') {
      fired = true;
      postFire++;
    }
  }
  assert.ok(charged, 'the sentinel telegraphs its beam');
  assert.ok(fired, 'the sentinel fires its beam');
  const s = g.api.snapshot();
  assert.ok(s.hp <= hpBefore - 30, 'the beam deals heavy damage: ' + s.hp + ' vs ' + hpBefore);
  assert.ok(s.hp > 0, 'the player survives the single test beam');
});

test('boss affixes change speed, armor and death', () => {
  const g = boot({ seed: 483 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('warlord');
  const baseSpeed = g.api.snapshot().enemies[0].speed;
  assert.ok(g.api.forceBossAffix(0, 'frenzied'));
  assert.ok(g.api.snapshot().enemies[0].speed > baseSpeed * 1.29, 'frenzied bosses move faster');

  const h = boot({ seed: 487 });
  deploy(h);
  h.api.setInvulnerable(true);
  h.api.spawnBoss('warlord');
  assert.ok(h.api.forceBossAffix(0, 'shielded'));
  const hpBefore = h.api.snapshot().enemies[0].hp;
  h.api.hitEnemy(0, 100);
  assert.strictEqual(Math.round(hpBefore - h.api.snapshot().enemies[0].hp), 70, 'shielded bosses take 30% less damage');

  const k = boot({ seed: 491 });
  deploy(k);
  k.api.spawnBoss('warlord');
  k.api.setInvulnerable(true);
  k.steps(30);
  k.api.setInvulnerable(false);
  const boss = k.api.snapshot().enemies[0];
  k.api.setPlayer(boss.x + 40, boss.y);
  assert.ok(k.api.forceBossAffix(0, 'volatile'));
  const hpK = k.api.snapshot().hp;
  k.api.killEnemies();
  k.steps(1);
  assert.ok(k.api.snapshot().hp <= hpK - 25, 'volatile bosses explode on death');
});

test('the boss cycle extends past the mega to sentinel and hive', () => {
  const g = boot({ seed: 493 });
  deploy(g);
  g.api.setInvulnerable(true);
  const stages = [
    [160, 'warlord'],
    [360, 'overseer'],
    [560, 'bombardier'],
    [760, 'colossus'],
    [960, 'sentinel'],
    [1760, 'hive']
  ];
  for (const [time, type] of stages) {
    g.api.killEnemies();
    g.steps(4);
    g.api.setTime(time);
    g.steps(4);
    const s = g.api.snapshot();
    assert.ok(s.boss, 'a boss spawned at t=' + time);
    assert.strictEqual(s.boss.type, type, 't=' + time + ' should spawn ' + type);
  }
});

test('the aegis shield absorbs hits and recharges', () => {
  const g = boot({ seed: 501 });
  deploy(g);
  g.api.applyUpgrade('aegis');
  g.api.applyUpgrade('aegis');
  let s = g.api.snapshot();
  assert.strictEqual(s.shield.max, 2);
  assert.strictEqual(s.shield.charges, 2, 'each level grants a charge');
  g.api.hurt(40);
  s = g.api.snapshot();
  assert.strictEqual(s.hp, s.maxHp, 'the shield absorbed the hit instead of health');
  assert.strictEqual(s.shield.charges, 1);
  const t0 = s.shield.t;
  g.api.setInvulnerable(true);
  for (let i = 0; i < 40; i++) {
    g.step();
    if (g.api.snapshot().screen === 'levelup') g.api.clickButton('upgrade-0');
  }
  s = g.api.snapshot();
  assert.ok(s.shield.t < t0, 'the recharge timer counts down');
  for (let i = 0; i < 560; i++) {
    g.step();
    if (g.api.snapshot().screen === 'levelup') g.api.clickButton('upgrade-0');
  }
  s = g.api.snapshot();
  assert.strictEqual(s.shield.charges, 2, 'the spent charge comes back');
});

test('active skills evolve into tempest, cluster, overwatch and solar crown', () => {
  const g = boot({ seed: 503 });
  deploy(g);
  const plans = [
    ['blades', 'dashPower', 'tempest'],
    ['grenade', 'damage', 'cluster'],
    ['turret', 'crit', 'overwatch'],
    ['aura', 'vitality', 'crown']
  ];
  for (const [skill, partner, evo] of plans) {
    for (let i = 0; i < 10; i++) g.api.applyUpgrade(skill);
    for (let i = 0; i < 3; i++) g.api.applyUpgrade(partner);
    assert.strictEqual(g.api.snapshot().evolved[skill], undefined, skill + ' waits for the pick');
    g.api.giveXp(g.api.snapshot().xpNext);
    const offers = g.api.snapshot().offers;
    assert.strictEqual(offers[0], 'evo:' + skill, skill + ' leads the choice');
    assert.ok(g.api.chooseUpgrade(0), skill + ' evolves on pick');
    assert.strictEqual(g.api.snapshot().evolved[skill], evo, skill + ' should evolve');
  }
  const s = g.api.snapshot();
  assert.ok(s.auraRadius > 72 + 9 * 5, 'solar crown widens the ember aura');
  assert.strictEqual(s.shield.max, 0);
});

test('the bastion combo speeds up shield recharge', () => {
  const g = boot({ seed: 505 });
  deploy(g);
  g.api.applyUpgrade('aegis');
  g.api.applyUpgrade('aegis');
  g.api.applyUpgrade('vitality');
  g.api.applyUpgrade('vitality');
  g.api.hurt(10);
  const fast = g.api.snapshot().shield.t;
  const h = boot({ seed: 505 });
  deploy(h);
  h.api.applyUpgrade('aegis');
  h.api.applyUpgrade('aegis');
  h.api.hurt(10);
  const slow = h.api.snapshot().shield.t;
  assert.ok(fast < slow * 0.7, 'bastion recharges 40% faster');
});

test('mortars lob telegraphed shells from range', () => {
  const g = boot({ seed: 507 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('mortar', 520, 0);
  let sawBomb = false;
  for (let i = 0; i < 260; i++) {
    g.step();
    if (g.api.snapshot().bombs > 0) { sawBomb = true; break; }
  }
  assert.ok(sawBomb, 'the mortar lobs an arcing shell');
});

test('widower webs slow the player', () => {
  const g = boot({ seed: 509 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('widower', 300, 0);
  let webbed = false;
  for (let i = 0; i < 320; i++) {
    g.step();
    const s = g.api.snapshot();
    if (s.screen === 'levelup') { g.api.clickButton('upgrade-0'); continue; }
    if (s.slow > 0) { webbed = true; break; }
  }
  assert.ok(webbed, 'a web bolt applies slow');
});

test('husks leave acid pools that burn the horde', () => {
  const g = boot({ seed: 511 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setPlayer(-800, 0);
  g.api.spawnEnemy('husk', 120, 0);
  g.api.setEnemyHp(0, 1);
  g.api.hitEnemy(0, 50);
  assert.strictEqual(g.api.snapshot().pools, 1, 'the husk leaves acid behind');
  g.api.spawnEnemy('tank', 120, 0);
  const tank = g.api.snapshot().enemies.find((e) => e.type === 'tank');
  const hp0 = tank.hp;
  g.steps(40);
  const after = g.api.snapshot().enemies.find((e) => e.type === 'tank');
  assert.ok(after && after.hp < hp0, 'acid damages enemies standing in it');
});

test('the third mega boss WYRM burrows and erupts', () => {
  const g = boot({ seed: 513 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(2360);
  g.steps(2);
  let s = g.api.snapshot();
  assert.ok(s.boss, 'a mega boss spawned at wave 60');
  assert.strictEqual(s.boss.type, 'wyrm');
  let submerged = false;
  let erupted = false;
  let husks = false;
  for (let i = 0; i < 700; i++) {
    g.step();
    s = g.api.snapshot();
    if (s.screen === 'levelup') { g.api.clickButton('upgrade-0'); continue; }
    const wyrm = s.enemies.find((e) => e.type === 'wyrm');
    if (wyrm && wyrm.burrowed) submerged = true;
    if (submerged && wyrm && !wyrm.burrowed) erupted = true;
    if (s.enemyTypes.includes('husk')) husks = true;
    if (submerged && erupted && husks) break;
  }
  assert.ok(submerged, 'the wyrm burrows underground');
  assert.ok(erupted, 'the wyrm surfaces again');
  assert.ok(husks, 'the eruption spawns husks');
});

test('mortar, widower and husk join the spawn table', () => {
  const g = boot({ seed: 517 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(140);
  const seen = new Set();
  for (let i = 0; i < 1800; i++) {
    g.step();
    const s = g.api.snapshot();
    if (s.screen === 'levelup') { g.api.clickButton('upgrade-0'); continue; }
    for (const t of s.enemyTypes) seen.add(t);
    if (seen.has('mortar') && seen.has('widower') && seen.has('husk')) break;
  }
  assert.ok(seen.has('mortar'), 'mortars spawn');
  assert.ok(seen.has('widower'), 'widowers spawn');
  assert.ok(seen.has('husk'), 'husks spawn');
});

test('skill slots cap new picks at six per group', () => {
  const g = boot({ seed: 601 });
  deploy(g);
  for (const id of ['smg', 'shotgun', 'dmr', 'rail', 'blades']) assert.ok(g.api.applyUpgrade(id), id);
  let s = g.api.snapshot();
  assert.strictEqual(s.slots.offense.used, 6);
  assert.strictEqual(s.slots.offense.cap, 6);
  assert.strictEqual(g.api.applyUpgrade('grenade'), false, 'a seventh offense skill is refused');
  assert.strictEqual(g.api.applyUpgrade('blades'), true, 'owned skills still upgrade at the cap');
  g.api.setInvulnerable(true);
  const offenseIds = ['rifle', 'smg', 'shotgun', 'dmr', 'rail', 'blades', 'grenade', 'turret', 'aura', 'squad'];
  for (let i = 0; i < 10; i++) {
    g.api.giveXp(900);
    s = g.api.snapshot();
    let guard = 0;
    while (s.screen === 'levelup' && guard++ < 40) {
      for (const id of s.offers) {
        if (offenseIds.includes(id)) assert.ok(s.skills[id] > 0, 'offered an unowned offense skill: ' + id);
      }
      g.api.clickButton('upgrade-0');
      s = g.api.snapshot();
    }
  }
  s = g.api.snapshot();
  assert.strictEqual(s.slots.offense.used, 6, 'level-ups cannot push past the cap');
  for (const id of ['grenade', 'turret', 'aura', 'squad']) assert.strictEqual(s.skills[id], 0, id + ' was never offered');
});

test('passive slots cap separately from offense', () => {
  const g = boot({ seed: 603 });
  deploy(g);
  const passives = ['speed', 'vitality', 'aegis', 'magnet', 'damage', 'bulletSpeed'];
  for (const id of passives) assert.ok(g.api.applyUpgrade(id), id);
  const s = g.api.snapshot();
  assert.strictEqual(s.slots.passive.used, 6);
  assert.strictEqual(g.api.applyUpgrade('crit'), false, 'a seventh passive is refused');
  assert.strictEqual(g.api.applyUpgrade('smg'), true, 'offense slots are independent');
});

test('the loadout rig armory meta widens both slot caps', () => {
  const g = boot({ seed: 607 });
  g.api.grantShards(5000);
  assert.ok(g.api.buyMeta('rig'));
  assert.ok(g.api.buyMeta('rig'));
  deploy(g);
  const s = g.api.snapshot();
  assert.strictEqual(s.slots.offense.cap, 8);
  assert.strictEqual(s.slots.passive.cap, 8);
  for (const id of ['smg', 'shotgun', 'dmr', 'rail', 'blades', 'grenade', 'turret']) assert.ok(g.api.applyUpgrade(id), id);
  assert.strictEqual(g.api.snapshot().slots.offense.used, 8);
  assert.strictEqual(g.api.applyUpgrade('aura'), false);
});

test('supply caches never exceed the slot caps', () => {
  const g = boot({ seed: 611 });
  deploy(g);
  for (const id of ['smg', 'shotgun', 'dmr', 'rail', 'blades']) g.api.applyUpgrade(id);
  for (const id of ['speed', 'vitality', 'aegis', 'magnet', 'damage', 'bulletSpeed']) g.api.applyUpgrade(id);
  const before = g.api.snapshot();
  const ownedBefore = Object.values(before.skills).filter((v) => v > 0).length;
  const sumBefore = Object.values(before.skills).reduce((a, b) => a + b, 0);
  g.api.spawnChest(18, 0);
  g.steps(6);
  const after = g.api.snapshot();
  assert.strictEqual(Object.values(after.skills).filter((v) => v > 0).length, ownedBefore, 'no new skill was granted');
  assert.strictEqual(after.slots.offense.used, 6);
  assert.strictEqual(after.slots.passive.used, 6);
  assert.ok(Object.values(after.skills).reduce((a, b) => a + b, 0) > sumBefore, 'an owned skill was upgraded');
});

test('bosses drop a salvage crate that offers three relics', () => {
  const g = boot({ seed: 701 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('warlord');
  g.api.killEnemies();
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.salvage, 1, 'the boss leaves salvage');
  assert.strictEqual(s.boss, null, 'no live boss remains after killEnemies');
  g.api.setPlayer(s.player.x + 500, s.player.y);
  for (let i = 0; i < 60; i++) {
    g.step();
    const now = g.api.snapshot();
    if (now.screen === 'levelup') { g.api.clickButton('upgrade-0'); continue; }
    if (now.screen === 'relic') break;
  }
  s = g.api.snapshot();
  assert.strictEqual(s.screen, 'relic');
  assert.strictEqual(s.relicOffers.length, 3);
  const ids = s.buttons.map((b) => b.id);
  for (const i of [0, 1, 2]) assert.ok(ids.includes('relic-' + i), 'relic card ' + i);
  g.api.clickButton('relic-1');
  s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play');
  assert.strictEqual(s.relics.length, 1);
  assert.ok(s.relicOffers.length === 0);
});

test('relics stack their effects on the stat hooks', () => {
  const g = boot({ seed: 703 });
  deploy(g);
  const base = g.api.snapshot().mods;
  assert.ok(g.api.grantRelic('chrono'));
  assert.ok(g.api.grantRelic('voidlens'));
  assert.ok(g.api.grantRelic('overclock'));
  assert.ok(g.api.grantRelic('volatile'));
  assert.ok(g.api.grantRelic('lodestone'));
  assert.ok(g.api.grantRelic('greedengine'));
  assert.ok(g.api.grantRelic('bloodstone'));
  const s = g.api.snapshot();
  assert.ok(Math.abs(s.mods.fireRate - base.fireRate * 1.15) < 1e-6);
  assert.ok(Math.abs(s.mods.crit - (base.crit + 0.1)) < 1e-6);
  assert.ok(Math.abs(s.mods.bulletSpeed - (base.bulletSpeed + 0.25)) < 1e-6);
  assert.ok(Math.abs(s.mods.blast - base.blast * 1.3) < 1e-6);
  assert.ok(Math.abs(s.mods.magnet - (base.magnet + 60)) < 1e-6);
  assert.strictEqual(s.mods.shard, 1.2);
  assert.strictEqual(s.mods.lifestealBonus, 0.03);
  assert.strictEqual(s.relics.length, 7);
  assert.strictEqual(g.api.grantRelic('chrono'), false, 'relics are unique');
});

test('aegis core grants a shield charge without the aegis skill', () => {
  const g = boot({ seed: 707 });
  deploy(g);
  assert.strictEqual(g.api.snapshot().shield.max, 0);
  assert.ok(g.api.grantRelic('aegiscore'));
  const s = g.api.snapshot();
  assert.strictEqual(s.shield.max, 1);
  assert.strictEqual(s.shield.charges, 1, 'the new charge is granted immediately');
  g.api.applyUpgrade('aegis');
  assert.strictEqual(g.api.snapshot().shield.max, 2);
  g.api.hurt(30);
  const after = g.api.snapshot();
  assert.strictEqual(after.hp, after.maxHp, 'the relic shield absorbed it');
});

test('thornhide reflects contact damage', () => {
  const g = boot({ seed: 709 });
  deploy(g);
  assert.ok(g.api.grantRelic('thornhide'));
  g.api.spawnEnemy('grunt', 6, 0);
  const hp0 = g.api.snapshot().enemies[0].hp;
  g.steps(3);
  const e = g.api.snapshot().enemies.find((x) => x.type === 'grunt');
  assert.ok(!e || e.hp < hp0, 'touching the player hurts the enemy');
});

test('salvage crates expire and grant shards once all relics are owned', () => {
  const g = boot({ seed: 711 });
  deploy(g);
  for (const r of ['chrono', 'voidlens', 'overclock', 'volatile', 'warhead', 'bloodstone', 'aegiscore', 'lodestone', 'thornhide', 'greedengine']) {
    assert.ok(g.api.grantRelic(r), r);
  }
  g.api.spawnSalvage(0, 0);
  const unbanked = g.api.snapshot().unbanked;
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play', 'no relic screen when everything is owned');
  assert.ok(s.unbanked > unbanked, 'the crate pays shards instead');
  assert.strictEqual(s.salvage, 0);

  g.api.setInvulnerable(true);
  g.api.spawnSalvage(400, 400);
  g.steps(1);
  assert.strictEqual(g.api.snapshot().salvage, 1);
  for (let i = 0; i < 2700; i++) {
    g.step();
    const now = g.api.snapshot();
    if (now.screen === 'levelup') g.api.clickButton('upgrade-0');
    if (now.salvage === 0) break;
  }
  assert.strictEqual(g.api.snapshot().salvage, 0, 'uncollected salvage expires');
});

test('the setup screen offers survivors, boss rush and ops modes', () => {
  const g = boot({ seed: 801 });
  enterSetup(g);
  const ids = g.api.snapshot().buttons.map((b) => b.id);
  assert.ok(ids.includes('mode-survivors'));
  assert.ok(ids.includes('mode-bossrush'));
  assert.ok(ids.includes('mode-ops'));
  assert.strictEqual(g.api.snapshot().setup.mode, 'survivors');
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  g.api.clickButton('mode-bossrush');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.mode, 'bossrush');
  g.api.clickButton('setup-start');
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.mode, 'bossrush');
  assert.deepStrictEqual({ index: s.rush.index, target: s.rush.target, alive: s.rush.alive }, { index: 0, target: 8, alive: false });
});

test('boss rush spawns bosses instead of waves and wins after eight', () => {
  const g = boot({ seed: 803 });
  enterSetup(g);
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  g.api.clickButton('mode-bossrush');
  g.steps(1);
  g.api.clickButton('setup-start');
  g.steps(1);
  g.api.setInvulnerable(true);
  const order = ['warlord', 'overseer', 'bombardier', 'hive', 'sentinel', 'colossus', 'leviathan', 'wyrm'];
  for (let i = 0; i < order.length; i++) {
    let s = g.api.snapshot();
    let guard = 0;
    while (!s.rush.alive && guard++ < 400) {
      g.step();
      s = g.api.snapshot();
      if (s.screen === 'levelup') { g.api.clickButton('upgrade-0'); s = g.api.snapshot(); }
    }
    assert.ok(s.rush.alive, 'boss ' + (i + 1) + ' spawned');
    assert.strictEqual(s.boss.type, order[i], 'boss ' + (i + 1) + ' type');
    const mobs = s.enemies.filter((e) => !e.boss).length;
    if (i === 0) assert.strictEqual(mobs, 0, 'the first boss arrives with no wave mobs');
    g.api.killEnemies();
    s = g.api.snapshot();
    if (i < order.length - 1) {
      assert.strictEqual(s.rush.index, i + 1);
      assert.strictEqual(s.rush.alive, false);
      assert.strictEqual(s.screen, 'play');
    }
  }
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.strictEqual(s.victory, true, 'clearing all eight bosses wins the run');
  assert.strictEqual(s.rush.index, 8);
});

test('shield absorbs are counted and unlock the shield wall achievement', () => {
  const store = makeStore();
  const g = boot({ seed: 901, storage: store });
  deploy(g);
  for (let i = 0; i < 2; i++) g.api.applyUpgrade('aegis');
  for (let i = 0; i < 2; i++) {
    g.api.setInvulnerable(false);
    g.api.hurt(10);
    g.steps(40);
  }
  const s = g.api.snapshot();
  assert.strictEqual(s.stats.shieldSaves, 2);
  assert.strictEqual(s.save.achievements.shield_wall, undefined, 'needs ten absorbs');
});

test('relic hoarder and full loadout unlock from live run state', () => {
  const store = makeStore();
  const g = boot({ seed: 903, storage: store });
  deploy(g);
  for (const id of ['chrono', 'voidlens', 'overclock', 'volatile', 'warhead']) assert.ok(g.api.grantRelic(id));
  g.api.hitEnemy(0, 1);
  for (const id of ['smg', 'shotgun', 'dmr', 'rail', 'blades']) g.api.applyUpgrade(id);
  for (const id of ['speed', 'vitality', 'aegis', 'magnet', 'damage', 'bulletSpeed']) g.api.applyUpgrade(id);
  const s = g.api.snapshot();
  assert.strictEqual(s.save.achievements.relic_hoarder, true, 'five relics unlock the hoarder');
  assert.strictEqual(s.save.achievements.full_loadout, true, 'a filled loadout unlocks');
});

test('killing a wyrm unlocks wyrm slayer', () => {
  const store = makeStore();
  const g = boot({ seed: 905, storage: store });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('wyrm');
  g.api.killEnemies();
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.save.achievements.wyrm_slayer, true);
});

test('boss rush records clears and best time, and unlocks first clear', () => {
  const store = makeStore();
  const g = boot({ seed: 907, storage: store });
  enterSetup(g);
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  g.api.clickButton('mode-bossrush');
  g.steps(1);
  g.api.clickButton('setup-start');
  g.steps(1);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 8; i++) {
    let s = g.api.snapshot();
    let guard = 0;
    while (!s.rush.alive && guard++ < 500) {
      g.step();
      s = g.api.snapshot();
      if (s.screen === 'levelup') { g.api.clickButton('upgrade-0'); s = g.api.snapshot(); }
    }
    g.api.killEnemies();
    let after = g.api.snapshot();
    let spin = 0;
    while (after.screen === 'relic' && spin++ < 4) { g.api.clickButton('relic-0'); after = g.api.snapshot(); }
    if (i === 7) break;
    for (let f = 0; f < 400 && !g.api.snapshot().rush.alive; f++) {
      g.step();
      const t = g.api.snapshot();
      if (t.screen === 'levelup') g.api.clickButton('upgrade-0');
      if (t.screen === 'relic') g.api.clickButton('relic-0');
    }
  }
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.strictEqual(s.victory, true);
  assert.strictEqual(s.save.rushClears, 1);
  assert.ok(s.save.rushBest > 0 && s.save.rushBest < 90, 'best rush time recorded: ' + s.save.rushBest);
  assert.strictEqual(s.save.achievements.rush_first, true);
  assert.strictEqual(s.save.achievements.rush_speed, true);
});

test('best wave persists for survivors runs and legacy saves default cleanly', () => {
  const store = makeStore();
  store.data['dustline.save'] = JSON.stringify({ v: 2, totalKills: 5, shards: 10 });
  const g = boot({ seed: 909, storage: store });
  const loaded = g.api.snapshot().save;
  assert.strictEqual(loaded.rushClears, 0);
  assert.strictEqual(loaded.rushBest, 0);
  assert.strictEqual(loaded.bestWave, 1);
  assert.strictEqual(loaded.shieldSaves, 0);
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(200);
  g.steps(4);
  const wave = g.api.snapshot().wave;
  assert.ok(wave >= 6, 'reached wave ' + wave);
  let fin = g.api.snapshot();
  let guard = 0;
  while (fin.screen === 'levelup' && guard++ < 20) { g.api.clickButton('upgrade-0'); fin = g.api.snapshot(); }
  g.api.setInvulnerable(false);
  g.api.hurt(999);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.strictEqual(s.save.bestWave, wave);
  assert.strictEqual(s.save.rushClears, 0, 'survivors runs do not count as rush clears');
});

test('the setup screen offers six operators and applies the chosen one', () => {
  const g = boot({ seed: 1001 });
  enterSetup(g);
  const buttons = g.api.snapshot().buttons;
  const ids = buttons.map((b) => b.id);
  for (const op of ['ranger', 'vanguard', 'marksman', 'engineer', 'scavenger', 'arcanist']) assert.ok(ids.includes('operator-' + op), op);
  const lastOperator = buttons.find((b) => b.id === 'operator-arcanist');
  assert.ok(lastOperator.x + lastOperator.w <= 960, 'the sixth operator stays on screen');
  assert.strictEqual(g.api.snapshot().setup.operator, 'ranger');
  g.api.clickButton('operator-vanguard');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.operator, 'vanguard');
  g.api.clickButton('setup-start');
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.operator, 'vanguard');
  assert.strictEqual(s.maxHp, 130, 'vanguard starts with +30 health');
  assert.strictEqual(s.hp, 130);
});

test('vanguard takes ten percent less damage', () => {
  const g = boot({ seed: 1003 });
  enterSetup(g);
  g.api.clickButton('operator-vanguard');
  g.steps(1);
  g.api.clickButton('setup-start');
  g.steps(1);
  g.api.setInvulnerable(false);
  g.api.hurt(100);
  assert.strictEqual(g.api.snapshot().hp, 40, '130 - 90');
  const h = boot({ seed: 1003 });
  deploy(h);
  h.api.hurt(100);
  assert.strictEqual(h.api.snapshot().hp, 0, 'ranger takes the full hit');
});

test('marksman boosts velocity and crit', () => {
  const g = boot({ seed: 1005 });
  enterSetup(g);
  g.api.clickButton('operator-marksman');
  g.steps(1);
  g.api.clickButton('setup-start');
  g.steps(1);
  const m = g.api.snapshot().mods;
  const h = boot({ seed: 1005 });
  deploy(h);
  const r = h.api.snapshot().mods;
  assert.ok(Math.abs(m.bulletSpeed - (r.bulletSpeed + 0.15)) < 1e-6);
  assert.ok(Math.abs(m.crit - (r.crit + 0.08)) < 1e-6);
  assert.strictEqual(g.api.snapshot().maxHp, 100, 'marksman keeps base health');
});

test('engineer widens the aura and scavenger boosts shards and relic picks', () => {
  const g = boot({ seed: 1007 });
  enterSetup(g);
  g.api.clickButton('operator-engineer');
  g.steps(1);
  g.api.clickButton('setup-start');
  g.steps(1);
  g.api.applyUpgrade('aura');
  g.api.applyUpgrade('aura');
  g.api.applyUpgrade('aura');
  const engAura = g.api.snapshot().auraRadius;
  const h = boot({ seed: 1007 });
  deploy(h);
  h.api.applyUpgrade('aura');
  h.api.applyUpgrade('aura');
  h.api.applyUpgrade('aura');
  assert.ok(engAura > h.api.snapshot().auraRadius * 1.14, 'engineer aura is wider');

  const k = boot({ seed: 1011 });
  enterSetup(k);
  k.api.clickButton('operator-scavenger');
  k.steps(1);
  k.api.clickButton('setup-start');
  k.steps(1);
  k.api.spawnSalvage(16, 0);
  k.steps(2);
  let s = k.api.snapshot();
  assert.strictEqual(s.screen, 'relic');
  assert.strictEqual(s.relicOffers.length, 4, 'scavengers see four relic picks');
  k.api.clickButton('relic-0');
  s = k.api.snapshot();
  assert.strictEqual(s.relics.length, 1);
});

test('scavenger earns twenty percent more unbanked shards', () => {
  function unbankedFor(operator) {
    const g = boot({ seed: 1013 });
    enterSetup(g);
    g.api.clickButton('operator-' + operator);
    g.steps(1);
    g.api.clickButton('setup-start');
    g.steps(1);
    g.api.spawnEnemy('tank', 40, 0);
    g.api.setEnemyHp(0, 1);
    g.api.hitEnemy(0, 50);
    return g.api.snapshot().unbanked;
  }
  const ranger = unbankedFor('ranger');
  const scav = unbankedFor('scavenger');
  assert.ok(ranger > 0);
  assert.ok(Math.abs(scav / ranger - 1.2) < 0.02, 'ratio was ' + (scav / ranger).toFixed(3));
});

test('the field manual documents every mob, boss, relic and field note', () => {
  const g = boot({ seed: 1101, record: true });
  assert.ok(g.api.snapshot().buttons.some((b) => b.id === 'manual'));
  g.api.clickButton('manual');
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'manual');
  assert.strictEqual(s.manual.tab, 'enemies');
  const ids = s.buttons.map((b) => b.id);
  for (const id of ['manual-enemies', 'manual-bosses', 'manual-relics', 'manual-lore', 'manual-systems', 'back-manual']) assert.ok(ids.includes(id), id);
  const allTabs = s.buttons.filter((b) => ['manual-enemies', 'manual-bosses', 'manual-relics', 'manual-lore', 'manual-systems'].includes(b.id));
  assert.strictEqual(allTabs.length, 5);
  for (let i = 0; i < allTabs.length - 1; i++) {
    assert.ok(allTabs[i].x + allTabs[i].w <= allTabs[i + 1].x, 'manual tabs do not overlap');
  }
  assert.ok(allTabs[allTabs.length - 1].x + allTabs[allTabs.length - 1].w <= 960, 'the last tab stays on screen');
  assert.strictEqual(s.manual.enemies, 19, 'every enemy type including the hunter');
  assert.strictEqual(s.manual.bosses, 8);
  assert.strictEqual(s.manual.relics, 10);
  assert.strictEqual(s.manual.lore, 9, 'nine field notes');
  assert.strictEqual(s.manual.enemyTips, s.manual.enemies, 'every enemy has a tip');
  assert.strictEqual(s.manual.bossTips, s.manual.bosses, 'every boss has a tip');
  g.api.clickButton('manual-bosses');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().manual.tab, 'bosses');
  g.api.clickButton('manual-relics');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().manual.tab, 'relics');
  g.api.clickButton('manual-lore');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().manual.tab, 'lore');
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('THE DUSTLINE'), 'the setting note renders');
  assert.ok(labels.includes('THE SIGNAL'), 'the NetWatch note renders');
  assert.ok(labels.includes('DEAD ZONE'), 'every map note renders');
  assert.ok(labels.includes('GLASS WASTES'), 'the new map note renders');
  g.api.clickButton('manual-systems');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().manual.tab, 'systems');
  assert.strictEqual(g.api.snapshot().manual.systems, 5, 'five system rows');
  const sysLabels = g.texts.map((t) => t.text);
  for (const title of ['1 · RANKS', '2 · OPS', '3 · RIVALS', '4 · SURGES + STORMS', '5 · SHOP + PICKUPS']) assert.ok(sysLabels.includes(title), title + ' documents a shipped system');
  g.steps(2);
  g.api.clickButton('back-manual');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'menu');
});

test('the pause screen shows the current map field note', () => {
  const g = boot({ seed: 1102, record: true });
  deploy(g, { map: 'desert' });
  g.key('escape');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'paused');
  const notes = g.texts.filter((t) => t.text.indexOf('FIELD NOTE · ') === 0);
  assert.strictEqual(notes.length, 1, 'one map note');
  assert.ok(notes[0].text.indexOf('first quarantine line') > 0, 'the desert note is shown');
});

test('the manual shows a behavior tip for every documented enemy', () => {
  const g = boot({ seed: 1103 });
  g.api.clickButton('manual');
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.manual.enemyTips, 19);
  assert.strictEqual(s.manual.bossTips, 8);
  for (const tab of ['enemies', 'bosses', 'relics']) {
    g.api.clickButton('manual-' + tab);
    g.steps(2);
    assert.strictEqual(g.api.snapshot().manual.tab, tab);
  }
});

test('the daily screen shows a deterministic ruleset per day', () => {
  const g = boot({ seed: 1201 });
  g.api.setDay(20000);
  g.steps(1);
  assert.ok(g.api.snapshot().buttons.some((b) => b.id === 'daily'));
  g.api.clickButton('daily');
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'daily');
  const rules = s.daily.rules;
  assert.strictEqual(rules.day, 20000);
  assert.ok(rules.seed > 0);
  assert.ok(['normal', 'brutal', 'nightmare'].includes(rules.difficulty));
  assert.ok(['survivors', 'bossrush'].includes(rules.mode));
  assert.ok(rules.mutators.length <= 1);
  assert.strictEqual(s.daily.best, null);

  const h = boot({ seed: 1203 });
  h.api.setDay(20000);
  h.steps(1);
  assert.strictEqual(JSON.stringify(h.api.snapshot().daily.rules), JSON.stringify(rules), 'same day, same rules');
  h.api.setDay(20001);
  h.steps(1);
  const next = h.api.snapshot().daily.rules;
  assert.notStrictEqual(next.seed, rules.seed, 'a new day gets a new seed');
  assert.strictEqual(next.day, 20001);
});

test('starting the daily forces the ruleset and a fixed seed', () => {
  const g = boot({ seed: 1205 });
  g.api.setDay(20000);
  g.steps(1);
  const rules = g.api.snapshot().daily.rules;
  g.api.clickButton('daily');
  g.steps(1);
  g.api.clickButton('start-daily');
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play');
  assert.strictEqual(s.daily.active, true);
  assert.strictEqual(s.operator, rules.operator);
  assert.strictEqual(s.weapon, rules.weapon);
  assert.strictEqual(s.map, rules.map);
  assert.strictEqual(s.mode, rules.mode);
  assert.strictEqual(s.difficulty, rules.difficulty);
  assert.strictEqual(s.seed, rules.seed, 'the daily seed is fixed');
  const h = boot({ seed: 1207 });
  h.api.setDay(20000);
  h.steps(1);
  h.api.clickButton('daily');
  h.steps(1);
  h.api.clickButton('start-daily');
  h.steps(1);
  assert.strictEqual(h.api.snapshot().seed, rules.seed, 'every attempt uses the same seed');
});

test('daily runs record their best and keep only the better result', () => {
  const g = boot({ seed: 1209 });
  g.api.setDay(20002);
  g.steps(1);
  const rules = g.api.snapshot().daily.rules;
  g.api.clickButton('daily');
  g.steps(1);
  g.api.clickButton('start-daily');
  g.steps(1);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 3; i++) {
    g.api.spawnEnemy('tank', 300 + i * 60, 0);
    g.api.setEnemyHp(i, 1);
    g.api.hitEnemy(i, 50);
  }
  assert.strictEqual(g.api.snapshot().kills, 3);
  g.api.setInvulnerable(false);
  g.api.hurt(999);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.strictEqual(s.save.dailyBest[rules.day].kills, 3);
  assert.strictEqual(s.save.dailyBest[rules.day].win, false);

  g.api.clickButton('menu-over');
  g.steps(1);
  g.api.clickButton('daily');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().daily.best.kills, 3, 'the screen shows today best');
  g.api.clickButton('start-daily');
  g.steps(1);
  g.api.setInvulnerable(false);
  g.api.hurt(999);
  s = g.api.snapshot();
  assert.strictEqual(s.save.dailyBest[rules.day].kills, 3, 'a worse run does not overwrite');
  assert.ok(s.save.achievements.daily_done === true, 'finishing a daily unlocks the achievement');
});

test('winning a boss rush daily unlocks the daily ace', () => {
  const g = boot({ seed: 1211 });
  g.api.setDay(20216);
  g.steps(1);
  const rules = g.api.snapshot().daily.rules;
  assert.strictEqual(rules.mode, 'bossrush', 'day 20216 is a boss rush daily');
  g.api.clickButton('daily');
  g.steps(1);
  g.api.clickButton('start-daily');
  g.steps(1);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 8; i++) {
    let s = g.api.snapshot();
    let guard = 0;
    while (!s.rush.alive && guard++ < 600) {
      g.step();
      s = g.api.snapshot();
      if (s.screen === 'levelup') { g.api.clickButton('upgrade-0'); s = g.api.snapshot(); }
    }
    assert.ok(s.rush.alive, 'boss ' + (i + 1) + ' spawned');
    g.api.killEnemies();
    let after = g.api.snapshot();
    let spin = 0;
    while (after.screen === 'relic' && spin++ < 4) { g.api.clickButton('relic-0'); after = g.api.snapshot(); }
    if (i < 7) {
      for (let f = 0; f < 500 && !g.api.snapshot().rush.alive; f++) {
        g.step();
        const t = g.api.snapshot();
        if (t.screen === 'levelup') g.api.clickButton('upgrade-0');
        if (t.screen === 'relic') g.api.clickButton('relic-0');
      }
    }
  }
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.strictEqual(s.victory, true);
  assert.strictEqual(s.save.dailyBest[rules.day].win, true);
  assert.strictEqual(s.save.achievements.daily_done, true);
  assert.strictEqual(s.save.achievements.daily_win, true);
});

test('legacy saves default dailyBest to an empty map', () => {
  const store = makeStore();
  store.data['dustline.save'] = JSON.stringify({ v: 2, totalKills: 9, shards: 5 });
  const g = boot({ seed: 1213, storage: store });
  assert.deepStrictEqual(g.api.snapshot().save.dailyBest, {});
  assert.strictEqual(g.api.snapshot().daily.best, null);
});

test('the ground is blitted from cached tiles instead of being redrawn', () => {
  const g = boot({ seed: 1301 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  g.steps(3);
  const ops = g.ops;
  assert.ok((ops.drawImage || 0) >= 40, 'tiles and vignette are blitted, saw ' + (ops.drawImage || 0));
  assert.ok((ops.ellipse || 0) < 40, 'the ground no longer emits hundreds of ellipses, saw ' + (ops.ellipse || 0));
});

test('priority mobs no longer share the base grunt silhouette', () => {
  const keys = ['arc', 'stroke', 'fill', 'moveTo', 'lineTo', 'quadraticCurveTo', 'ellipse', 'fillRect'];
  function signature(type) {
    const g = boot({ seed: 1400 + type.charCodeAt(0) });
    deploy(g);
    g.api.setInvulnerable(true);
    g.api.killEnemies();
    g.api.spawnEnemy(type, 140, 0);
    g.step();
    return keys.map((k) => g.ops[k] || 0).join(',');
  }
  const base = signature('grunt');
  const types = ['shielder', 'leech', 'screamer', 'widower', 'mortar', 'husk', 'phantom', 'bomber', 'hunter', 'tunneler'];
  const unique = new Set([base]);
  for (const type of types) {
    const sig = signature(type);
    assert.notStrictEqual(sig, base, type + ' should not render exactly like a grunt');
    unique.add(sig);
  }
  assert.ok(unique.size >= 7, 'silhouettes are varied, saw ' + unique.size + ' distinct shapes');
});

test('boss affixes are shape-coded, not only colour-coded', () => {
  function bossOps(affix) {
    const g = boot({ seed: 1500 + (affix ? affix.length : 0) });
    deploy(g);
    g.api.setInvulnerable(true);
    g.api.killEnemies();
    g.api.spawnBoss('warlord');
    if (affix) g.api.forceBossAffix(0, affix);
    g.step();
    return g.ops;
  }
  const plain = bossOps(null);
  for (const affix of ['frenzied', 'shielded', 'volatile']) {
    const o = bossOps(affix);
    assert.ok((o.arc || 0) + (o.stroke || 0) > (plain.arc || 0) + (plain.stroke || 0) + 2,
      affix + ' should add glyphs: ' + JSON.stringify({ arc: o.arc, stroke: o.stroke }));
  }
});

test('a burrowed WYRM renders a mega-sized mound with ridge rings', () => {
  function burrowedOps(type) {
    const g = boot({ seed: 1600 + type.length });
    deploy(g);
    g.api.setInvulnerable(true);
    g.api.killEnemies();
    g.api.spawnEnemy(type, 140, 0);
    g.api.setBurrowed(0, true);
    g.step();
    return { ops: g.ops, r: g.api.snapshot().enemies[0].r, burrowed: g.api.snapshot().enemies[0].burrowed };
  }
  const wyrm = burrowedOps('wyrm');
  const tunneler = burrowedOps('tunneler');
  assert.strictEqual(wyrm.burrowed, true);
  assert.ok(wyrm.r > tunneler.r, 'the wyrm is a much larger body');
  assert.ok((wyrm.ops.arc || 0) >= (tunneler.ops.arc || 0) + 2, 'the wyrm draws ridge rings: ' +
    JSON.stringify({ wyrm: wyrm.ops.arc, tunneler: tunneler.ops.arc }));
});

test('a full 150-mob frame stays inside the draw budget', () => {
  const g = boot({ seed: 1701 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * Math.PI * 2;
    g.api.spawnEnemy('grunt', Math.cos(a) * 320, Math.sin(a) * 320);
  }
  g.step();
  const total = Object.keys(g.ops).reduce((sum, k) => sum + g.ops[k], 0);
  assert.ok(total < 7000, '150 mobs used ' + total + ' canvas ops');
  assert.ok((g.ops.ellipse || 0) < 400, 'ground ellipses stay cached, saw ' + (g.ops.ellipse || 0));
});

test('cached ground tiles share one base colour so seams do not show', () => {
  const g = boot({ seed: 1801, record: true });
  deploy(g, { map: 'desert' });
  const bases = g.rects.filter((r) => r.w === 140 && r.h === 140);
  assert.ok(bases.length >= 8, 'eight cached tile variants are painted, saw ' + bases.length);
  const colors = new Set(bases.map((r) => r.fillStyle));
  assert.strictEqual(colors.size, 1, 'tile base colours: ' + [...colors].join(', '));
});

test('terrain hazards blit a soft cached sprite instead of a hard ellipse', () => {
  const g = boot({ seed: 1802, record: true });
  deploy(g, { map: 'desert' });
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  let spot = null;
  for (let y = -1500; y <= 1500 && !spot; y += 70) {
    for (let x = -1500; x <= 1500 && !spot; x += 70) {
      if (g.api.hazardAtPoint(x, y)) spot = { x, y };
    }
  }
  assert.ok(spot, 'the seeded desert has a hazard to inspect');
  g.api.setPlayer(spot.x, spot.y);
  g.step();
  const hard = g.fills.filter((f) => f.fillStyle === 'rgba(150,120,70,0.20)');
  assert.strictEqual(hard.length, 0, 'hazard pools are not hard flat fills');
  const soft = g.images.filter((i) => i.w >= 100 && i.w <= 220 && i.h <= i.w * 0.8);
  assert.ok(soft.length >= 1, 'hazard pools are blitted from a soft sprite');
});

test('statistics keeps the kills-by-type block below the stat rows', () => {
  const g = boot({ seed: 1803, record: true });
  assert.ok(g.api.clickButton('statistics'));
  g.steps(1);
  const best = g.texts.find((t) => t.text === 'BEST WAVE');
  const kills = g.texts.find((t) => t.text === 'KILLS BY TYPE');
  assert.ok(best && kills, 'both statistics headings render');
  assert.ok(kills.y > best.y + 16, 'kills-by-type baseline ' + kills.y + ' clears BEST WAVE at ' + best.y);
});

test('armory keeps insufficient-shard feedback inside its own row', () => {
  const g = boot({ seed: 1804, record: true });
  assert.ok(g.api.clickButton('armory'));
  g.steps(1);
  const need = g.texts.find((t) => /^NEED \d+$/.test(t.text));
  const next = g.texts.find((t) => t.text === 'PLATE CARRIER');
  assert.ok(need && next, 'a locked row and the next row both render');
  assert.ok(need.y + 6 <= next.y - 17, 'NEED text at ' + need.y + ' must clear the next row label at ' + next.y);
});

test('the selected map card stays brighter than the unselected cards', () => {
  const g = boot({ seed: 1805, record: true });
  enterSetup(g);
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  const overlays = g.fills.filter((f) => f.fillStyle === '#06080a' && f.alpha < 1);
  assert.ok(overlays.length >= 4, 'four map cards are painted, saw ' + overlays.length);
  assert.ok(overlays[0].alpha < overlays[1].alpha, 'selected overlay ' + overlays[0].alpha + ' is lighter than ' + overlays[1].alpha);
});

test('the alert readout sits clear of the run line', () => {
  const g = boot({ seed: 1806, record: true });
  deploy(g);
  const alert = g.texts.find((t) => /^ALERT \d+%/.test(t.text));
  const run = g.texts.find((t) => /^W\d+ · L\d+ · /.test(t.text));
  assert.ok(alert && run, 'alert and run line both render');
  assert.ok(alert.y > run.y + 10, 'alert baseline ' + alert.y + ' must clear the run line at ' + run.y);
});

test('pause hides the combat bars and the achievement banner', () => {
  const g = boot({ seed: 1807, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('warlord');
  g.steps(1);
  g.key('escape');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'paused');
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('PAUSED'));
  assert.ok(!labels.some((t) => /^ALERT /.test(t)), 'alert bar stays hidden while paused');
  assert.ok(!labels.some((t) => t.includes('WARLORD')), 'boss bar stays hidden while paused');
});

test('particle kinds render distinct canvas shapes', () => {
  function counts(kind) {
    const g = boot({ seed: 1900 + kind.length * 7 });
    deploy(g);
    g.api.setInvulnerable(true);
    g.api.killEnemies();
    g.step();
    assert.ok(g.api.spawnBurst(kind), kind + ' burst seam');
    g.step();
    return {
      arc: g.ops.arc || 0,
      lineTo: g.ops.lineTo || 0,
      stroke: g.ops.stroke || 0,
      fillRect: g.ops.fillRect || 0,
      rotate: g.ops.rotate || 0,
      kinds: g.api.snapshot().particleKinds
    };
  }
  const dot = counts('dot');
  const spark = counts('spark');
  const shard = counts('shard');
  const ring = counts('ring');
  const glow = counts('glow');
  assert.ok(spark.kinds.spark >= 8, 'spark particles are tagged');
  assert.ok(spark.lineTo > dot.lineTo, 'sparks draw streaks');
  assert.ok(shard.fillRect > dot.fillRect && shard.rotate > dot.rotate, 'shards draw rotated fragments');
  assert.ok(ring.stroke > dot.stroke, 'rings draw an outline');
  assert.ok(glow.arc > dot.arc, 'glow particles add a halo');
});

test('each map declares its own ambient particle mode', () => {
  const expected = { desert: 'dust', frost: 'snow', ash: 'ember', jungle: 'firefly' };
  for (const map of Object.keys(expected)) {
    const g = boot({ seed: 2000 + map.length });
    if (map === 'jungle') assert.ok(g.api.unlockMap('jungle'), 'test owns jungle');
    g.api.startRun({ map });
    g.step();
    const amb = g.api.ambience();
    assert.strictEqual(amb.mode, expected[map], map + ' ambience');
    assert.ok(amb.count > 0, map + ' ambient particle count');
  }
});

test('dashing leaves a fading afterimage trail', () => {
  const g = boot({ seed: 2101 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.key('d', true);
  g.key('shift', true);
  g.steps(3);
  const n = g.api.snapshot().afterimages;
  assert.ok(n > 0, 'dash trail is visible, saw ' + n);
  assert.ok(n <= 9, 'dash trail stays capped, saw ' + n);
  g.steps(40);
  assert.strictEqual(g.api.snapshot().afterimages, 0, 'afterimages fade out');
});

test('particle bursts stay capped under spam', () => {
  const g = boot({ seed: 2201 });
  deploy(g);
  for (let i = 0; i < 100; i++) assert.ok(g.api.spawnBurst('dot'));
  assert.ok(g.api.snapshot().particles <= 420, 'particle pool cap holds');
  g.step();
  const total = Object.keys(g.ops).reduce((sum, k) => sum + g.ops[k], 0);
  assert.ok(total < 7000, 'a full particle pool used ' + total + ' canvas ops');
});

test('each map has ground decorations from its own palette', () => {
  const expected = {
    desert: ['grass', 'bones', 'pebbles'],
    frost: ['snowgrass', 'ice', 'pebbles'],
    ash: ['charred', 'bones', 'crack'],
    jungle: ['fern', 'flower', 'mushroom']
  };
  for (const map of Object.keys(expected)) {
    const g = boot({ seed: 2300 + map.length });
    if (map === 'jungle') assert.ok(g.api.unlockMap('jungle'), 'test owns jungle');
    g.api.startRun({ map });
    const decor = g.api.decor(0, 0, 800);
    assert.ok(decor.length > 0, map + ' has ground decor');
    for (const d of decor) assert.ok(expected[map].includes(d.kind), map + ' decor kind ' + d.kind);
  }
});

test('explosions leave fading scorch decals within a cap', () => {
  const g = boot({ seed: 2401 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  for (let i = 0; i < 20; i++) assert.ok(g.api.explode(0, 0, 80));
  assert.ok(g.api.snapshot().decals > 0, 'a blast leaves a decal');
  assert.ok(g.api.snapshot().decals <= 12, 'decals stay capped');
  g.steps(700);
  assert.strictEqual(g.api.snapshot().decals, 0, 'decals fade out');
});





test('crater, dead-zone and glass maps expose tar, gas and shard hazards', () => {
  const expectations = { crater: 'tar', toxic: 'gas', glass: 'shards' };
  for (const map of Object.keys(expectations)) {
    const g = boot({ seed: 3000 + map.length });
    assert.ok(g.api.unlockMap(map), 'test owns ' + map);
    g.api.startRun({ map });
    g.steps(1);
    assert.strictEqual(g.api.snapshot().map, map);
    let found = null;
    for (let r = 60; r <= 1600 && !found; r += 40) {
      for (let a = 0; a < 32; a++) {
        const x = Math.cos((a / 32) * Math.PI * 2) * r;
        const y = Math.sin((a / 32) * Math.PI * 2) * r;
        const hz = g.api.hazardAtPoint(x, y);
        if (hz) { found = { hz, x, y }; break; }
      }
    }
    assert.ok(found, map + ' exposes a hazard');
    assert.strictEqual(found.hz, expectations[map]);
    assert.strictEqual(g.api.snapshot().hazard, expectations[map]);
    if (map === 'toxic' || map === 'glass') {
      g.api.setInvulnerable(false);
      g.api.setPlayer(found.x, found.y);
      const before = g.api.snapshot().hp;
      g.steps(80);
      assert.ok(g.api.snapshot().hp < before, map + ' hazard damages the player');
    }
  }
});

test('hidden stashes pay risky shards and crates are consumed on touch', () => {
  const g = boot({ seed: 3101 });
  deploy(g);
  g.api.setInvulnerable(true);
  const before = g.api.snapshot().unbanked;
  const stash = g.api.spawnInteract('stash', 40, 0);
  assert.ok(stash, 'the stash spawns');
  assert.strictEqual(stash.kind, 'stash');
  g.api.setPlayer(40, 0);
  g.steps(4);
  let s = g.api.snapshot();
  assert.ok(s.unbanked > before + 30, 'the stash pays a large shard bonus');
  assert.strictEqual(s.interactables.filter((o) => o.kind === 'stash').length, 0, 'the stash is opened');

  const crate = g.api.spawnInteract('crate', 60, 0);
  assert.ok(crate);
  g.api.setPlayer(60, 0);
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.interactables.filter((o) => o.kind === 'crate').length, 0, 'the crate is opened');
});

test('a nuclear bunker detonates, clears the horde and pays shards', () => {
  const g = boot({ seed: 3201 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 14; i++) g.api.spawnEnemy('grunt', 200 + i * 8, 160);
  const bunker = g.api.spawnBunker(40, 0);
  assert.ok(bunker, 'the bunker spawns');
  g.api.setPlayer(40, 0);
  g.steps(2);
  let s = g.api.snapshot();
  assert.strictEqual(s.bunker.used, true, 'touching the bunker arms the nuke');
  assert.ok(s.nuke, 'the strike is in progress');
  const before = s.unbanked;
  for (let i = 0; i < 600 && g.api.snapshot().nuke; i++) g.steps(3);
  s = g.api.snapshot();
  assert.strictEqual(s.nuke, null, 'the strike finishes');
  assert.ok(s.kills >= 14, 'the strike clears the horde, kills: ' + s.kills);
  assert.ok(s.unbanked > before, 'clearing the map pays a bonus');
});

test('ricochet rounds bounce bullets into a second target', () => {
  const g = boot({ seed: 3301 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 4; i++) assert.ok(g.api.applyUpgrade('ricochet'));
  g.api.spawnEnemy('tank', 170, 0);
  g.api.spawnEnemy('tank', 260, 12);
  g.api.setEnemyHp(0, 50000);
  g.api.setEnemyHp(1, 50000);
  let bounced = false;
  for (let i = 0; i < 260 && !bounced; i++) {
    g.step();
    bounced = g.api.snapshot().stats.ricochets > 0;
  }
  assert.ok(bounced, 'bullets redirect after a hit');
});

test('maxing ricochet and crit evolves it into carom', () => {
  const g = boot({ seed: 3303 });
  deploy(g);
  for (let i = 0; i < 10; i++) assert.ok(g.api.applyUpgrade('ricochet'));
  assert.strictEqual(g.api.snapshot().evolved.ricochet, undefined);
  for (let i = 0; i < 3; i++) assert.ok(g.api.applyUpgrade('crit'));
  assert.strictEqual(g.api.snapshot().evolved.ricochet, undefined, 'evolution waits for the pick');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.strictEqual(g.api.snapshot().offers[0], 'evo:ricochet');
  assert.ok(g.api.chooseUpgrade(0));
  assert.strictEqual(g.api.snapshot().evolved.ricochet, 'carom');
});

test('hyper velocity, salvage rig and combat stim meta ranks apply', () => {
  const base = boot({ seed: 3403 });
  deploy(base);
  const baseMods = base.api.snapshot().mods;
  const baseHp = base.api.snapshot().hp;
  base.api.hurt(100);
  const baseLost = baseHp - base.api.snapshot().hp;

  const g = boot({ seed: 3403 });
  g.api.grantShards(5000);
  assert.ok(g.api.buyMeta('velocity'));
  assert.ok(g.api.buyMeta('harvest'));
  assert.ok(g.api.buyMeta('resolve'));
  deploy(g);
  const mods = g.api.snapshot().mods;
  assert.ok(mods.bulletSpeed > baseMods.bulletSpeed, 'hyper velocity raises bullet speed');
  g.api.hurt(100);
  const lost = g.api.snapshot().maxHp - g.api.snapshot().hp;
  assert.ok(lost < baseLost, 'combat stim reduces damage taken');

  const plain = boot({ seed: 3405 });
  deploy(plain);
  plain.api.setInvulnerable(true);
  plain.api.setRng(7777);
  plain.api.spawnEnemy('tank', 60, 0);
  plain.api.setEnemyHp(0, 1);
  plain.api.hitEnemy(0, 50);
  const plainShards = plain.api.snapshot().unbanked;

  const rich = boot({ seed: 3405 });
  rich.api.grantShards(5000);
  assert.ok(rich.api.buyMeta('harvest'));
  deploy(rich);
  rich.api.setInvulnerable(true);
  rich.api.setRng(7777);
  rich.api.spawnEnemy('tank', 60, 0);
  rich.api.setEnemyHp(0, 1);
  rich.api.hitEnemy(0, 50);
  const richShards = rich.api.snapshot().unbanked;
  assert.ok(plainShards > 0);
  assert.ok(richShards > plainShards, 'salvage rig raises shard gain');
});

test('touch input switches on the on-screen controls', () => {
  const g = boot({ seed: 3501, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.handlers.touchstart({ preventDefault() {}, changedTouches: [{ identifier: 1, clientX: 60, clientY: 400 }] });
  g.step();
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('DASH'), 'dash button renders');
  assert.ok(labels.includes('BOMB'), 'bomb button renders');
  assert.ok(labels.includes('OD'), 'overdrive button renders');
});


test('total kill milestones fire escalating callouts and score', () => {
  const g = boot({ seed: 3601 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setKills(10);
  let s = g.api.snapshot();
  assert.ok(s.milestones.includes('KILLING SPREE'), 'the first tier is live');
  assert.strictEqual(s.callout.text, 'KILLING SPREE');
  const firstScore = s.score;
  assert.ok(firstScore >= 50, 'the milestone pays score');

  g.api.setKills(500);
  s = g.api.snapshot();
  for (const name of ['KILLING SPREE', 'RAMPAGE', 'WAR MACHINE', 'UNSTOPPABLE', 'ONE MAN ARMY', 'LEGENDARY']) {
    assert.ok(s.milestones.includes(name), name + ' milestone');
  }
  assert.strictEqual(s.callout.text, 'LEGENDARY');
  assert.ok(s.score > firstScore, 'later tiers add score');
});

test('kills and bosses build a score that saves a personal best', () => {
  const store = makeStore();
  const g = boot({ seed: 3603, storage: store });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('grunt', 40, 0);
  g.api.setEnemyHp(0, 1);
  g.api.hitEnemy(0, 99);
  let s = g.api.snapshot();
  assert.ok(s.score > 0, 'kills award score');
  const afterKill = s.score;
  g.api.spawnBoss('warlord');
  g.api.killEnemies();
  g.steps(1);
  s = g.api.snapshot();
  assert.ok(s.score >= afterKill + 1000, 'a boss adds a large bonus');
  g.api.setInvulnerable(false);
  g.api.hurt(9999);
  g.steps(3);
  s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.ok(s.save.bestScore >= 1000, 'best score persists: ' + s.save.bestScore);
});

test('last stand unlocks under 10 percent health', () => {
  const base = boot({ seed: 3605 });
  deploy(base);
  const baseDmg = base.api.snapshot().damageMult;
  const g = boot({ seed: 3605 });
  deploy(g);
  g.api.hurt(95);
  const s = g.api.snapshot();
  assert.ok(s.hp <= 10, 'health is critical');
  assert.strictEqual(s.lastStand, true);
  assert.ok(s.damageMult >= baseDmg * 1.8, 'last stand raises damage, saw ' + s.damageMult);
  assert.strictEqual(s.callout.text, 'LAST STAND');
});

test('kill streak rewards unlock supply drops, airstrikes, a helicopter and missiles', () => {
  const g = boot({ seed: 3607 });
  deploy(g);
  g.api.setInvulnerable(true);
  const before = g.api.snapshot().medkits;
  g.api.setStreak(15);
  let s = g.api.snapshot();
  assert.ok(s.streakRewards.includes('supply'));
  assert.ok(s.medkits >= before + 3, 'supply drop scatters medkits');

  g.api.setStreak(30);
  assert.strictEqual(g.api.snapshot().callout.text, 'AIRSTRIKE');
  assert.strictEqual(g.api.snapshot().airstrike, true);
  g.api.setStreak(60);
  assert.strictEqual(g.api.snapshot().callout.text, 'ATTACK HELICOPTER');
  assert.strictEqual(g.api.snapshot().heli, true);
  g.api.setStreak(120);
  s = g.api.snapshot();
  assert.strictEqual(s.callout.text, 'MISSILE BARRAGE');
  assert.strictEqual(s.missiles, true);
  assert.strictEqual(s.streakRewards.length, 4);
});

test('war chests stay locked until enough kills are earned', () => {
  const g = boot({ seed: 3609 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.ok(g.api.spawnWarChest(40, 0, 10));
  g.api.setPlayer(40, 0);
  g.steps(4);
  let s = g.api.snapshot();
  assert.ok(s.warChest, 'the chest remains');
  assert.strictEqual(s.warChest.open, false);
  assert.strictEqual(s.warChest.remaining, 10, 'locked until ten kills');
  const before = s.unbanked;
  const chestsBefore = s.stats.chests;
  g.api.setKills(10);
  g.steps(4);
  s = g.api.snapshot();
  assert.strictEqual(s.warChest, null, 'the chest opens');
  assert.ok(s.unbanked > before + 30, 'the cache pays shards');
  assert.ok(s.stats.chests > chestsBefore, 'the cache drops a supply chest');
});

test('mutations apply their run-long modifiers', () => {
  const g = boot({ seed: 3611 });
  g.api.clickButton('play');
  g.steps(1);
  let ids = g.api.snapshot().buttons.map((b) => b.id);
  for (const id of ['mutation-none', 'mutation-explosive', 'mutation-berserker', 'mutation-overclock', 'mutation-veteran']) {
    assert.ok(ids.includes(id), id);
  }
  g.api.clickButton('setup-tab-2');
  g.steps(1);
  g.api.clickButton('mutation-berserker');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.mutation, 'berserker');
  g.api.clickButton('setup-start');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().mutation, 'berserker');
  g.api.hurt(70);
  assert.ok(g.api.snapshot().damageMult > 1.4, 'berserker boosts damage at low health');

  const h = boot({ seed: 3613 });
  h.api.clickButton('play');
  h.steps(1);
  h.api.clickButton('setup-tab-2');
  h.steps(1);
  h.api.clickButton('mutation-overclock');
  h.api.clickButton('setup-start');
  h.steps(1);
  assert.ok(h.api.snapshot().mods.fireRate > 1.15, 'overclock raises fire rate');

  const k = boot({ seed: 3615 });
  k.api.clickButton('play');
  k.steps(1);
  k.api.clickButton('setup-tab-2');
  k.steps(1);
  k.api.clickButton('mutation-veteran');
  k.api.clickButton('setup-start');
  k.steps(1);
  k.api.setInvulnerable(true);
  k.api.spawnBoss('warlord');
  k.api.killEnemies();
  k.steps(1);
  assert.ok(k.api.snapshot().damageMult > 1.05, 'war veteran rewards boss kills');
});

test('secret combos are discovered, announced and saved', () => {
  const store = makeStore();
  const g = boot({ seed: 3617, storage: store });
  deploy(g);
  assert.strictEqual(g.api.snapshot().save.secrets.length, 0);
  for (let i = 0; i < 2; i++) g.api.applyUpgrade('dmr');
  for (let i = 0; i < 2; i++) g.api.applyUpgrade('crit');
  let s = g.api.snapshot();
  assert.ok(s.combos.includes('executioner'), 'the hidden combo activates');
  assert.ok(s.save.secrets.includes('executioner'), 'the discovery is recorded');
  assert.strictEqual(s.callout.text, 'SECRET COMBO');
  g.api.setInvulnerable(false);
  g.api.hurt(9999);
  g.steps(3);
  const reloaded = boot({ seed: 3619, storage: store }).api.snapshot().save;
  assert.ok(reloaded.secrets.includes('executioner'), 'the discovery survives a reload');
});

test('player camouflage follows the map palette', () => {
  const desert = boot({ seed: 3621 });
  desert.api.startRun({ map: 'desert' });
  desert.steps(1);
  const frost = boot({ seed: 3621 });
  frost.api.startRun({ map: 'frost' });
  frost.steps(1);
  const toxic = boot({ seed: 3621 });
  toxic.api.startRun({ map: 'ash' });
  toxic.steps(1);
  const a = desert.api.snapshot().camo;
  const b = frost.api.snapshot().camo;
  const c = toxic.api.snapshot().camo;
  assert.match(a, /^#[0-9a-f]{6}$/i);
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(b, c);
});

test('the slower xp curve keeps early level ups meaningful', () => {
  const g = boot({ seed: 3623 });
  deploy(g);
  g.api.giveXp(44);
  g.steps(1);
  assert.strictEqual(g.api.snapshot().level, 1, '44 xp is not enough');
  assert.strictEqual(g.api.snapshot().screen, 'play');
  g.api.giveXp(1);
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.level, 2, '45 xp levels the player');
  assert.strictEqual(s.screen, 'levelup');
});


test('the hud shows score and milestone callouts', () => {
  const g = boot({ seed: 3625, record: true });
  deploy(g);
  g.api.setKills(10);
  g.step();
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('KILLING SPREE'), 'the milestone callout draws');
  assert.ok(labels.some((t) => /^SCORE 50$/.test(t)), 'the score readout draws');
  const callout = g.texts.find((t) => t.text === 'KILLING SPREE');
  assert.ok(callout.y > 200, 'the callout clears the wave banner');
});

test('the skills codex fits every combo above the back button', () => {
  const g = boot({ seed: 3627, record: true });
  assert.ok(g.api.clickButton('upgrades'));
  g.steps(1);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.some((t) => t.indexOf('???') >= 0), 'secret combos stay hidden');
  const last = g.texts.find((t) => t.text === 'Shield recharges 40% faster');
  assert.ok(last, 'the last public combo renders');
  assert.ok(last.y < 500, 'combo text clears the back button, saw ' + last.y);
});

test('the setup mutation row fits on screen', () => {
  const g = boot({ seed: 3629 });
  enterSetup(g);
  const buttons = g.api.snapshot().buttons.filter((b) => b.id.indexOf('mutation-') === 0);
  assert.strictEqual(buttons.length, 5);
  for (const b of buttons) assert.ok(b.y + b.h <= 600, b.id + ' must fit');
});


test('the setup rows keep clear separation between labels and cards', () => {
  const g = boot({ seed: 9003, record: true });
  g.api.clickButton('play');
  g.steps(1);
  g.api.clickButton('setup-tab-2');
  g.steps(1);
  const text = (prefix) => g.texts.find((t) => t.text.indexOf(prefix) === 0);
  const label = text('MUTATORS');
  const mutator = g.texts.find((t) => t.text === 'GLASS CANNON');
  const mutationLabel = text('MUTATION');
  const mutation = g.texts.find((t) => t.text === 'STANDARD');
  assert.ok(label && mutator && mutationLabel && mutation, 'all setup labels render');
  assert.ok(label.y < mutator.y - 2, 'the mutator header clears its cards');
  assert.ok(mutator.y < mutationLabel.y - 2, 'the mutation header clears the mutator cards');
  assert.ok(mutationLabel.y < mutation.y - 2, 'the mutation header clears its cards');
});

test('an active callout suppresses the banner so they never collide', () => {
  const g = boot({ seed: 9005, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setKills(10);
  g.api.spawnInteract('stash', 30, 0);
  g.api.setPlayer(30, 0);
  g.steps(4);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('KILLING SPREE'), 'the callout draws');
  assert.ok(!labels.some((t) => t.indexOf('HIDDEN STASH') === 0), 'the banner yields to the callout');
});

test('the player body is tinted with the map camouflage', () => {
  const g = boot({ seed: 9007, record: true });
  g.api.clickButton('play');
  g.steps(1);
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  g.api.clickButton('map-desert');
  g.api.clickButton('setup-start');
  g.steps(1);
  const camo = g.api.snapshot().camo;
  assert.ok(
    g.fills.some((f) => String(f.fillStyle).toLowerCase() === camo.toLowerCase()),
    'the player fill uses ' + camo
  );
});


test('world interactables render with a single camera offset', () => {
  const g = boot({ seed: 9009, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setPlayer(2000, 3000);
  g.steps(30);
  g.api.spawnInteract('stash', 2040, 3000);
  g.steps(1);
  const s = g.api.snapshot();
  const box = g.rects.find((r) => r.w === 24 && r.h === 24 && String(r.fillStyle).toLowerCase() === '#3a6a6a');
  assert.ok(box, 'the stash body draws');
  assert.ok(Math.abs(box.sx - (2040 - 12 - s.cam.x)) < 1, 'x uses one camera offset, got ' + box.sx);
  assert.ok(Math.abs(box.sy - (3000 - 12 - s.cam.y)) < 1, 'y uses one camera offset, got ' + box.sy);
});

test('open arenas stay clear of solid props and hazards', () => {
  const g = boot({ seed: 9101, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  const home = g.api.arenaAt(0, 0);
  assert.ok(home, 'the deploy zone is an arena');
  assert.ok(home.r >= 400, 'the deploy arena is large enough to kite in');
  const props = g.api.props(0, 0, 2500);
  assert.ok(props.length > 0, 'the world still has cover');
  assert.ok(props.every((p) => !g.api.arenaAt(p.x, p.y)), 'no solid prop sits inside an arena');
  assert.strictEqual(g.api.hazardAtPoint(0, 0), null, 'the deploy arena is hazard-free');
  assert.ok(
    g.fills.some((f) => String(f.fillStyle) === 'rgba(255,244,214,0.045)'),
    'the arena floor is drawn'
  );
});

test('procedural rooms are deterministic and map-aware', () => {
  const a = boot({ seed: 9111 });
  const b = boot({ seed: 9111 });
  deploy(a);
  deploy(b);
  const roomsA = a.api.rooms(0, 0, 6000);
  const roomsB = b.api.rooms(0, 0, 6000);
  assert.ok(roomsA.length > 0, 'the seeded world contains room structures');
  assert.strictEqual(JSON.stringify(roomsA), JSON.stringify(roomsB), 'room placement is seed-stable');
  assert.ok(roomsA.every((room) => room.w >= 420 && room.h >= 320), 'rooms have readable scale');
  assert.ok(roomsA.every((room) => room.entrance >= 0 && room.entrance <= 3), 'rooms expose one entrance');
  const walls = a.api.props(roomsA[0].x, roomsA[0].y, 900).filter((prop) => prop.kind === 'room-wall');
  assert.ok(walls.length >= 4, 'rooms contribute solid wall segments');
  assert.strictEqual(a.api.hazardAtPoint(roomsA[0].x, roomsA[0].y), null, 'room interiors stay hazard-free');
});

test('entering a room starts a readable local encounter', () => {
  const g = boot({ seed: 9113, record: true });
  deploy(g);
  const room = g.api.rooms(0, 0, 6000)[0];
  assert.ok(room, 'room exists for encounter test');
  g.api.setPlayer(room.x, room.y);
  g.steps(2);
  const s = g.api.snapshot();
  assert.strictEqual(s.roomFocus, room.id, 'player is inside the room');
  assert.strictEqual(s.roomsVisited, 1, 'room visit is recorded once');
  assert.ok(s.enemies.length >= 2, 'room encounter spawns a local group');
  assert.strictEqual(s.rooms[0].state, 'active', 'room enters its active state');
  assert.strictEqual(s.rooms[0].stage, 0, 'room starts at the first stage');
  assert.ok(g.texts.some((t) => t.text === room.kind.toUpperCase() + ' ROOM'), 'room banner is readable');
});

test('room stages advance and rewards are paid once on clearance', () => {
  const g = boot({ seed: 9115 });
  deploy(g);
  const room = g.api.rooms(0, 0, 6000)[0];
  g.api.setPlayer(room.x, room.y);
  g.steps(2);
  for (let attempt = 0; attempt < 20; attempt++) {
    const enemies = g.api.snapshot().enemies;
    for (let i = enemies.length - 1; i >= 0; i--) {
      g.api.setGhost(i, false);
      g.api.setBurrowed(i, false);
      g.api.setEnemyHp(i, 1);
      g.api.hitEnemy(i, 1000000);
    }
    g.steps(2);
  }
  const cleared = g.api.snapshot();
  assert.strictEqual(cleared.rooms[0].state, 'cleared', 'room becomes cleared');
  assert.ok(cleared.rooms[0].reward > 0, 'room pays a deterministic reward');
  const earned = cleared.unbanked;
  g.steps(12);
  assert.strictEqual(g.api.snapshot().unbanked, earned, 'cleared rooms do not pay twice');
});

test('the arcanist fires arcane rounds and every fourth kill arcs', () => {
  const g = boot({ seed: 9103 });
  enterSetup(g);
  g.api.clickButton('operator-arcanist');
  g.steps(1);
  g.api.clickButton('setup-start');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().operator, 'arcanist');

  g.api.spawnEnemy('grunt', 300, 0);
  let shot = null;
  for (let i = 0; i < 80 && !shot; i++) {
    g.steps(1);
    const s = g.api.snapshot();
    if (s.bullets.indexOf('p') >= 0) shot = s;
  }
  assert.ok(shot, 'the arcanist fires');
  assert.ok(shot.bulletColors.indexOf('#c39bff') >= 0, 'arcanist rounds are violet');
  assert.ok(shot.bulletPierce.some((p) => p >= 1), 'arcanist rounds pierce');

  const k = boot({ seed: 9103 });
  enterSetup(k);
  k.api.clickButton('operator-arcanist');
  k.steps(1);
  k.api.clickButton('setup-start');
  k.steps(1);
  k.api.setInvulnerable(true);
  k.api.spawnEnemy('grunt', 120, 0);
  k.api.spawnEnemy('tank', 150, 0);
  k.api.spawnEnemy('grunt', 220, 0);
  k.api.setKills(3);
  k.api.setEnemyHp(0, 1);
  k.api.hitEnemy(0, 50);
  const after = k.api.snapshot();
  assert.strictEqual(after.stats.arcs, 1, 'the fourth kill arcs');
  assert.strictEqual(after.zaps, 1, 'the bolt is visible');
  const tank = after.enemies.find((e) => e.type === 'tank');
  assert.ok(tank && tank.hp < tank.maxHp, 'the arc damages a nearby hostile');
  k.steps(25);
  assert.strictEqual(k.api.snapshot().zaps, 0, 'the bolt fades');

  k.api.setKills(7);
  k.api.setEnemyHp(1, 1);
  k.api.hitEnemy(1, 50);
  assert.strictEqual(k.api.snapshot().stats.arcs, 2, 'a hostile struck by an arc can arc again later');
});

test('contact damage scales slower and caps at 3.2x', () => {
  const g = boot({ seed: 9105 });
  deploy(g);
  g.api.spawnEnemy('tank', 240, 0);
  assert.ok(Math.abs(g.api.snapshot().enemies[0].touch - 18) < 0.01, 'the base touch value is unchanged');
  g.api.setTime(260);
  g.api.spawnEnemy('tank', 320, 0);
  assert.ok(Math.abs(g.api.snapshot().enemies[1].touch - 36) < 0.001, 'doubles at 260 seconds');
  g.api.setTime(5000);
  g.api.spawnEnemy('tank', 400, 0);
  assert.ok(Math.abs(g.api.snapshot().enemies[2].touch - 57.6) < 0.001, 'caps at 3.2x');
});

test('the leaderboard opens with three tabs and a stable device code', () => {
  const g = boot({ seed: 9201 });
  assert.ok(g.api.clickButton('leaderboard'), 'leaderboard button exists');
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'leaderboard');
  assert.strictEqual(s.boardTab, 'global');
  assert.ok(/^[0-9a-f]{8}$/i.test(s.save.deviceCode), 'device code is 8 hex chars, saw ' + s.save.deviceCode);
  const ids = s.buttons.map((b) => b.id);
  for (const id of ['board-global', 'board-friends', 'board-turkiye', 'back-board']) assert.ok(ids.includes(id), id);
  assert.ok(g.api.clickButton('board-friends'), 'friends tab opens');
  g.steps(1);
  s = g.api.snapshot();
  assert.strictEqual(s.boardTab, 'friends');
  assert.ok(g.api.clickButton('board-turkiye'), 'turkiye tab opens');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().boardTab, 'turkiye');
  g.key('escape');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'menu', 'escape leaves the board');
});

test('finished runs seed the device leaderboard', () => {
  const g = boot({ seed: 9203, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(95);
  g.steps(2);
  g.key('escape');
  g.steps(1);
  assert.ok(g.api.clickButton('menu-pause'), 'abandon from pause');
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'menu');
  assert.strictEqual(s.save.boardBests.length, 1, 'the abandoned run is logged');
  const entry = s.save.boardBests[0];
  assert.strictEqual(entry.m, 'desert');
  assert.strictEqual(entry.win, false);
  assert.ok(entry.t >= 95, 'run time is recorded');
  assert.ok(g.api.clickButton('leaderboard'), 'leaderboard button exists');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().boardTab, 'global');
  assert.ok(g.texts.some((t) => t.text === 'YOU · ' + s.save.deviceCode.slice(0, 4).toUpperCase()), 'the device entry renders');
});

test('allies join the friends board by squad code', () => {
  const g = boot({ seed: 9205, record: true });
  g.api.clickButton('leaderboard');
  g.steps(1);
  g.api.clickButton('board-friends');
  g.steps(1);
  g.api.clickButton('friend-add');
  g.steps(1);
  for (const ch of 'ab1299cc') g.key(ch);
  assert.ok(g.api.clickButton('friend-save'), 'save button exists');
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.save.friends.length, 1, 'the ally is stored');
  assert.strictEqual(s.save.friends[0].code, 'ab1299cc');
  assert.strictEqual(s.save.friends[0].name, 'ALLY-AB12');
  assert.strictEqual(s.save.friends[0].best, null, 'no score until sync');
  assert.ok(g.texts.some((t) => t.text.indexOf('ALLY-AB12') >= 0), 'the ally row renders');
  g.api.clickButton('friend-add');
  g.steps(1);
  for (const ch of 'ab12') g.key(ch);
  g.api.clickButton('friend-save');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().save.friends.length, 1, 'short codes are rejected');
  const own = g.api.snapshot().save.deviceCode;
  g.api.clickButton('friend-cancel');
  g.steps(1);
  g.api.clickButton('friend-add');
  g.steps(1);
  for (const ch of own.toLowerCase()) g.key(ch);
  g.api.clickButton('friend-save');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().save.friends.length, 1, 'your own code is rejected');
});

test('the run-over screen calls out the device board rank', () => {
  const g = boot({ seed: 9210, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('grunt', 60, 0);
  g.api.killEnemies();
  g.steps(4);
  assert.ok(g.api.snapshot().kills >= 1, 'the run scored');
  g.api.setInvulnerable(false);
  g.api.hurt(99999);
  g.steps(2);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over');
  assert.ok(s.boardRank >= 1, 'the finished run is ranked');
  assert.ok(
    g.texts.some((t) => t.text.indexOf('BOARD #' + s.boardRank) >= 0),
    'the rank renders on the report'
  );
});

test('touch taps activate menu buttons (V2)', () => {
  const g = boot({ seed: 1337, record: true });
  const play = g.api.snapshot().buttons.find((b) => b.id === 'play');
  assert.ok(play, 'play button exists');
  const cx = play.x + play.w / 2;
  const cy = play.y + play.h / 2;
  g.handlers.touchstart({ preventDefault() {}, changedTouches: [{ identifier: 7, clientX: cx, clientY: cy }] });
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'setup', 'touch tap on PLAY reaches setup, got ' + g.api.snapshot().screen);
});

test('setup MODE and TIME LIMIT groups keep separation (V3)', () => {
  const g = boot({ seed: 9003, record: true });
  g.api.clickButton('play');
  g.steps(1);
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  const s = g.api.snapshot();
  const mode = s.buttons.filter((b) => b.id.indexOf('mode-') === 0).sort((a, b) => a.x - b.x);
  const limits = s.buttons.filter((b) => b.id.indexOf('limit-') === 0).sort((a, b) => a.x - b.x);
  assert.strictEqual(mode.length, 3, 'three mode cards');
  assert.strictEqual(limits.length, 4, 'four limit cards');
  const modeRight = Math.max(...mode.map((b) => b.x + b.w));
  const limitLeft = Math.min(...limits.map((b) => b.x));
  assert.ok(modeRight + 8 <= limitLeft, 'mode cards clear time-limit cards: ' + modeRight + ' vs ' + limitLeft);
  const modeHeader = g.texts.find((t) => t.text === 'MODE');
  const limitHeader = g.texts.find((t) => t.text === 'TIME LIMIT');
  assert.ok(modeHeader && limitHeader, 'both headers render');
  assert.ok(Math.abs(modeHeader.y - limitHeader.y) < 3, 'headers share the row band');
  assert.ok(modeHeader.x + 60 <= limitHeader.x, 'headers do not collide: ' + modeHeader.x + ' vs ' + limitHeader.x);
});

test('HUD mutator tags stay inside the kills panel (V4)', () => {
  const g = boot({ seed: 1337, record: true });
  g.api.clickButton('play');
  g.steps(1);
  g.api.clickButton('setup-tab-2');
  g.steps(1);
  g.api.clickButton('mutator-glass');
  g.api.clickButton('mutator-swarm');
  g.api.clickButton('mutation-overclock');
  g.api.clickButton('setup-start');
  g.steps(1);
  const tags = g.texts.find((t) => t.text.indexOf('MUTATORS') === 0 || t.text.indexOf('MUTATION') === 0);
  assert.ok(tags, 'tags line renders, saw: ' + JSON.stringify(g.texts.map((t) => t.text).slice(0, 20)));
  assert.ok(tags.text.length <= 44, 'tags line fits the 250px panel, got ' + tags.text.length + ': ' + tags.text);
  assert.ok(tags.x >= 14 && tags.x + tags.text.length * 5.5 <= 14 + 250 + 8, 'tags stay in panel horizontally');
});

test('early progression banks the first level-up inside 80 seconds (M1)', () => {
  const g = boot({ seed: 1337 });
  g.api.clickButton('play');
  g.steps(1);
  g.api.clickButton('setup-start');
  g.steps(1);
  g.api.setInvulnerable(true);
  g.steps(5400);
  const s = g.api.snapshot();
  assert.ok(s.level >= 2, 'stationary play levels by 80s, got level ' + s.level + ' xp ' + Math.round(s.xp) + '/' + s.xpNext + ' kills ' + s.kills);
  assert.ok(s.kills >= 60, 'enough kills to feed gems, got ' + s.kills);
});

test('the loadout opens on the arsenal tab and pages through field and rules', () => {
  const g = boot({ seed: 9003, record: true });
  g.api.clickButton('play');
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.screen, 'setup', 'setup opens');
  assert.strictEqual(s.setupTab, 0, 'arsenal first');
  const tabIds = s.buttons.map((b) => b.id).filter((id) => id.indexOf('setup-tab-') === 0);
  assert.strictEqual(tabIds.length, 3, 'three tabs registered');
  for (const id of ['setup-tab-0', 'setup-tab-1', 'setup-tab-2']) assert.ok(tabIds.indexOf(id) >= 0, id + ' registered');
  let labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('WEAPON'), 'arsenal shows weapons');
  assert.ok(!labels.includes('MUTATORS · CHOOSE UP TO 2 FOR EXTRA LOOT'), 'rules hidden on arsenal');
  assert.ok(g.api.clickButton('setup-next'), 'next exists');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setupTab, 1, 'field second');
  labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('MAP'), 'field shows maps');
  assert.ok(labels.includes('MODE'), 'field shows modes');
  assert.ok(!labels.includes('WEAPON'), 'arsenal hidden on field');
  g.api.clickButton('setup-tab-2');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setupTab, 2, 'rules third');
  labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('MUTATORS · CHOOSE UP TO 2 FOR EXTRA LOOT'), 'rules show mutators');
  g.api.clickButton('setup-prev');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setupTab, 1, 'prev returns to field');
});

test('hidden loadout pages do not answer mouse clicks', () => {
  const g = boot({ seed: 9003 });
  g.api.clickButton('play');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.map, 'desert', 'default map');
  g.down(220, 166);
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.map, 'desert', 'map click ignored on arsenal tab');
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  g.down(220, 166);
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.map, 'frost', 'map click lands on field tab, got ' + g.api.snapshot().setup.map);
});

test('the loadout tabs summarize the current picks', () => {
  const g = boot({ seed: 9003, record: true });
  g.api.clickButton('play');
  g.steps(1);
  g.api.clickButton('weapon-smg');
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  g.api.clickButton('map-frost');
  g.api.clickButton('mode-bossrush');
  g.api.clickButton('setup-tab-0');
  g.steps(1);
  const labels = g.texts.map((t) => t.text).join(' / ');
  assert.ok(labels.indexOf('SMG-45') >= 0, 'arsenal tab shows the picked weapon');
  assert.ok(labels.indexOf('BOSS RUSH') >= 0 || labels.indexOf('BOSSRUSH') >= 0 || labels.indexOf('bossrush') >= 0, 'field tab shows the picked mode');
});

test('a 150-mob pile-up steps inside the logic budget (PERF)', () => {
  const g = boot({ seed: 7 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 150; i++) g.api.spawnEnemy('grunt', (i % 15) * 24 - 170, Math.floor(i / 15) * 24 - 120);
  g.steps(1);
  assert.strictEqual(g.api.enemyLimit(), 150, 'the horde is at cap');
  const t0 = Date.now();
  g.steps(120);
  const ms = Date.now() - t0;
  assert.ok(ms < 2000, '120 steps with 150 clustered mobs took ' + ms + 'ms, budget 2000ms');
  assert.ok(g.api.enemyLimit() >= 100, 'the horde survives the steps, saw ' + g.api.enemyLimit());
});

test('contact damage respects the spawn-time cap in long runs (M3)', () => {
  const g = boot({ seed: 9105 });
  deploy(g);
  g.api.setTime(600);
  g.api.spawnEnemy('tank', 240, 0);
  const at600 = g.api.snapshot().enemies[g.api.snapshot().enemies.length - 1].touch;
  assert.ok(Math.abs(at600 - 57.6) < 0.01, 'caps at 3.2x by 600s, got ' + at600);
  g.api.setTime(1200);
  g.api.spawnEnemy('tank', 320, 0);
  const at1200 = g.api.snapshot().enemies[g.api.snapshot().enemies.length - 1].touch;
  assert.ok(Math.abs(at1200 - 57.6) < 0.01, 'stays capped at 1200s, got ' + at1200);
  g.api.setPlayer(0, 0);
  g.api.setTime(600);
  g.api.setInvulnerable(false);
  const hp0 = g.api.snapshot().hp;
  g.api.hurt(at600);
  g.steps(1);
  assert.ok(g.api.snapshot().hp < hp0, 'capped hits still hurt');
  assert.ok(g.api.snapshot().hp > 0, 'a single capped tank touch does not one-shot at full health');
});

test('bombs target the densest cluster (M4)', () => {
  let hits = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = boot({ seed });
    deploy(g);
    g.api.setInvulnerable(true);
    g.api.setPlayer(0, 0);
    for (let i = 0; i < 5; i++) g.api.spawnEnemy('grunt', 400 + (i % 5) * 10, (i % 5) * 10);
    for (let i = 0; i < 15; i++) g.api.spawnEnemy('grunt', -400 + (i % 5) * 10, (i % 5) * 10);
    g.steps(1);
    assert.ok(g.api.throwBomb(), 'bomb throws on seed ' + seed);
    assert.strictEqual(g.api.snapshot().bombs, 1, 'one bomb in flight');
    g.steps(60);
    const s = g.api.snapshot();
    const leftAlive = s.enemies.filter((e) => !e.dead && e.x < 0).length;
    const rightAlive = s.enemies.filter((e) => !e.dead && e.x > 0).length;
    if (leftAlive < rightAlive) hits++;
  }
  assert.ok(hits >= 12, 'bomb favors the 15-cluster, got ' + hits + '/20');
});

test('rail respects its spawn cooldown on the first shot (S06-B1)', () => {
  const g = boot({ seed: 42 });
  deploy(g, { weapon: 'rail' });
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('grunt', 200, 0);
  g.steps(1);
  assert.strictEqual(g.api.snapshot().bullets.length, 0, 'rail waits out its 0.9s cooldown on frame 1');
});

test('boardBests rejects non-finite distance (S01-B6)', () => {
  const store = makeStore({
    'dustline.save': JSON.stringify({ v: 2, shards: 10, boardBests: [{ s: 10, k: 1, t: 5, m: 'desert', win: true, d: 'Infinity' }] })
  });
  const g = createGame({ seed: 1, storage: store });
  g.steps(2);
  const rows = g.api.snapshot().save.boardBests;
  assert.ok(rows.length === 0 || Number.isFinite(rows[0].d), 'Infinity distance is dropped or clamped, got ' + JSON.stringify(rows));
});

test('hidden setup tabs do not answer clickButton (S12-B1)', () => {
  const g = boot({ seed: 9003 });
  g.api.clickButton('play');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.map, 'desert', 'default map');
  assert.strictEqual(g.api.clickButton('map-frost'), false, 'hidden map tab rejected via clickButton');
  assert.strictEqual(g.api.snapshot().setup.map, 'desert', 'map unchanged while tab hidden');
});

test('finisher zero-damage blast adds no grenadeHits (S09-B1)', () => {
  const g = boot({ seed: 901 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setKills(24);
  g.api.spawnEnemy('grunt', 30, 0);
  g.api.setEnemyHp(0, 1);
  g.api.spawnEnemy('grunt', 40, 0);
  g.api.setEnemyHp(1, 1000);
  g.steps(1);
  const h0 = g.api.snapshot().stats.grenadeHits;
  g.api.hitEnemy(0, 99);
  g.steps(2);
  assert.strictEqual(g.api.snapshot().stats.grenadeHits, h0, '0-damage finisher adds no grenadeHits');
});

test('help column two truncates long rows (S12-B1)', () => {
  const g = boot({ seed: 113, record: true });
  assert.ok(g.api.clickButton('upgrades'));
  g.steps(1);
  assert.ok(g.api.clickButton('back-upgrades'));
  g.steps(1);
  assert.ok(g.api.clickButton('help'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'help');
  const col2 = g.texts.filter((t) => t.x === 596);
  assert.ok(col2.length >= 10, 'help draws column two, got ' + col2.length);
  for (const t of col2) assert.ok(t.text.length <= 46, 'truncated: ' + t.text);
});

test('tied-best time keeps the better kill count (S04-B5)', () => {
  const g = boot({ seed: 41 });
  deploy(g);
  g.api.setTime(300);
  g.api.setKills(5);
  g.api.hurt(99999);
  g.steps(2);
  assert.strictEqual(g.api.snapshot().save.bestKills, 5);
  g.api.clickButton('retry');
  g.steps(1);
  g.api.setTime(300);
  g.api.setKills(50);
  g.api.hurt(99999);
  g.steps(2);
  assert.strictEqual(g.api.snapshot().save.bestKills, 50, 'tie at 300s keeps 50 kills');
});

test('railgun obeys the ready gate on the first volley (S06-B1)', () => {
  const g = boot({ seed: 7 });
  deploy(g, { weapon: 'rail' });
  g.api.spawnEnemy('runner', 300, 0);
  g.steps(1);
  assert.strictEqual(g.api.snapshot().shots.rail, 0, 'rail waits for its cooldown on step 1');
});

test('shield rings stay visible at max charges (S09-B10)', () => {
  const g = boot({ seed: 9, record: true });
  deploy(g);
  for (let i = 0; i < 10; i++) g.api.applyUpgrade('aegis');
  g.api.grantRelic('aegiscore');
  g.api.setInvulnerable(true);
  g.steps(3);
  const rings = g.strokes.filter((s) => String(s.strokeStyle).indexOf('159,216,255') >= 0);
  assert.ok(rings.length >= 11, 'eleven shield rings drawn, got ' + rings.length);
  for (const r of rings) {
    const m = /([\d.]+)\)\s*$/.exec(String(r.strokeStyle));
    assert.ok(m && Number(m[1]) > 0, 'positive ring alpha: ' + r.strokeStyle);
  }
});

test('rifle max-level display respects the 0.16s cooldown floor (swarm K1-B1)', () => {
  const g = boot({ seed: 11 });
  deploy(g);
  const line = g.api.skillStatLine('rifle', 10);
  assert.ok(!line.includes('0.00'), 'no zero cooldown, got ' + line);
  assert.ok(line.includes('0.16'), 'clamped to gameplay floor, got ' + line);
});

test('crit chance stays capped at 100% (swarm K1-B10)', () => {
  const g = boot({ seed: 21 });
  deploy(g, { operator: 'marksman' });
  for (let i = 0; i < 10; i++) g.api.applyUpgrade('crit');
  g.api.grantRelic('voidlens');
  g.api.spawnEnemy('tank', 120, 0);
  g.api.setEnemyHp(0, 5);
  g.api.hitEnemy(0, 1);
  const s = g.api.snapshot();
  assert.ok(s.surge > 0, 'surge window opened');
  assert.ok(s.mods.crit <= 1, 'capped at 100%, got ' + s.mods.crit);
});

test('explosive barrels chain damage to nearby enemies (swarm K3-B2)', () => {
  const g = boot({ seed: 31 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('grunt', 200, 0);
  g.api.spawnInteract('barrel', 150, 0);
  g.api.spawnEnemy('tank', 210, 60);
  g.api.setEnemyHp(0, 50000);
  g.api.setEnemyHp(1, 50000);
  g.steps(60);
  const s = g.api.snapshot();
  const tank = s.enemies.find((e) => e.type === 'tank');
  assert.ok(tank, 'tank still on field');
  assert.ok(tank.hp < 50000, 'barrel blast damaged off-axis tank, hp=' + tank.hp);
});

test('explode helper deals damage (swarm K6-B4)', () => {
  const g = boot({ seed: 41 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('tank', 10, 0);
  g.api.setEnemyHp(0, 5000);
  g.api.explode(0, 0, 200);
  const s = g.api.snapshot();
  const tank = s.enemies.find((e) => e.type === 'tank');
  assert.ok(tank, 'tank still on field');
  assert.ok(tank.hp < 5000, 'explode damaged the tank, hp=' + tank.hp);
});

test('setGhost(false) resumes the phantom cycle (swarm K6-B5)', () => {
  const g = boot({ seed: 51 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('phantom', 170, 0);
  g.api.setEnemyHp(0, 5000);
  g.api.setGhost(0, true);
  g.api.setGhost(0, false);
  g.steps(120);
  const s = g.api.snapshot();
  const phantom = s.enemies.find((e) => e.type === 'phantom');
  assert.ok(phantom, 'phantom still on field');
  assert.strictEqual(phantom.ghost, true, 'cycle resumed after manual clear');
});

test('frame clamps non-finite and negative dt so time never poisons (deferred K6-B2/B3)', () => {
  const g = boot({ seed: 63 });
  deploy(g);
  const before = g.api.snapshot().time;
  g.steps(1, NaN);
  let s = g.api.snapshot();
  assert.ok(Number.isFinite(s.time), 'time stays finite after NaN step, got ' + s.time);
  g.steps(1, -1000);
  s = g.api.snapshot();
  assert.ok(s.time >= before, 'time never rewinds, before=' + before + ' after=' + s.time);
});

test('over-screen star tracks the score record, not time (deferred K6-B1)', () => {
  const store = makeStore();
  let g = boot({ seed: 61, storage: store, record: true });
  deploy(g);
  g.api.setTime(300);
  g.api.hurt(99999);
  g.steps(2);
  let texts = g.texts.map((t) => t.text).join('\n');
  assert.ok(!texts.includes('NEW PERSONAL BEST'), 'scoreless long run earns no star');
  g = boot({ seed: 62, storage: store, record: true });
  deploy(g);
  for (let i = 0; i < 5; i++) g.api.spawnEnemy('grunt', 200, 0);
  g.api.killEnemies();
  g.steps(2);
  g.api.setTime(10);
  g.api.hurt(99999);
  g.steps(2);
  texts = g.texts.map((t) => t.text).join('\n');
  assert.ok(texts.includes('NEW PERSONAL BEST'), 'new best score earns the star');
});

test('max crit always crits through a single chance evaluation (deferred K2-B3)', () => {
  const g = boot({ seed: 71 });
  deploy(g, { operator: 'marksman' });
  for (let i = 0; i < 10; i++) g.api.applyUpgrade('crit');
  g.api.grantRelic('voidlens');
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('tank', 300, 0);
  g.api.setEnemyHp(0, 50000);
  g.api.spawnEnemy('tank', 120, 0);
  g.api.setEnemyHp(1, 5);
  g.api.hitEnemy(1, 1);
  g.steps(120);
  const s = g.api.snapshot();
  assert.ok(s.shots.rifle > 0, 'rifle fired, shots=' + s.shots.rifle);
  assert.strictEqual(s.stats.crits, s.shots.rifle, 'every max-crit bullet crits');
});

test('streak and lifesteal guards hold sane defaults (deferred K1-B12/B6)', () => {
  const g = boot({ seed: 72 });
  deploy(g);
  assert.strictEqual(g.api.snapshot().streakMult, 1, 'fresh streak mult is 1');
  g.api.hurt(45);
  const low = g.api.snapshot().hp;
  assert.ok(low < 100, 'hurt lowers hp, got ' + low);
  g.api.setInvulnerable(true);
  g.api.applyUpgrade('lifesteal');
  g.api.applyUpgrade('lifesteal');
  g.api.spawnEnemy('tank', 90, 0);
  g.api.setEnemyHp(0, 5000);
  g.api.hitEnemy(0, 4000);
  const s = g.api.snapshot();
  assert.ok(Number.isFinite(s.hp), 'hp stays finite, got ' + s.hp);
  assert.ok(s.hp > low, 'lifesteal heals on damage dealt, ' + low + ' -> ' + s.hp);
  assert.ok(Number.isFinite(s.streakMult) && s.streakMult >= 1, 'streak mult sane, got ' + s.streakMult);
});

test('bankNow banks floored unbanked and no-ops when empty (K8 gap)', () => {
  const g = boot({ seed: 77 });
  deploy(g);
  assert.strictEqual(g.api.bankNow(), 0);
  g.api.setUnbanked(100.9);
  assert.strictEqual(g.api.bankNow(), 100);
  assert.ok(Math.abs(g.api.snapshot().unbanked - 0.9) < 1e-9, 'fraction survives, got ' + g.api.snapshot().unbanked);
});

test('setMutators filters unknown ids and caps at two (K8 gap)', () => {
  const g = boot({ seed: 76 });
  deploy(g);
  assert.strictEqual(g.api.setMutators(['glass', 'bogus', 'swarm', 'fog']), true);
  assert.deepStrictEqual(g.api.snapshot().mutators, ['glass', 'swarm']);
  assert.strictEqual(g.api.setMutators('glass'), false);
});

test('roomAt resolves the room under its own center (K8 gap)', () => {
  const g = boot({ seed: 78 });
  deploy(g);
  const rooms = g.api.rooms(0, 0, 20000);
  assert.ok(rooms.length > 0, 'world has rooms');
  const r = rooms[0];
  assert.strictEqual(g.api.roomAt(r.x, r.y).id, r.id);
});

test('triggerNuke refuses without a bunker and fires with one (K8 gap)', () => {
  const g = boot({ seed: 79 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.strictEqual(g.api.triggerNuke(), false);
  g.api.spawnBunker(40, 0);
  assert.strictEqual(g.api.triggerNuke(), true);
  assert.ok(g.api.snapshot().nuke !== null, 'nuke running');
});

test('remaining sector events trigger and unknown ids refuse (K8 gap)', () => {
  const g = boot({ seed: 74 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (const id of ['sandstorm', 'blizzard', 'downpour', 'dustchoke']) {
    assert.strictEqual(g.api.triggerEvent(id), true, id);
    assert.strictEqual(g.api.snapshot().event.id, id, id);
  }
  assert.strictEqual(g.api.triggerEvent('nope'), false);
  assert.strictEqual(g.api.triggerEvent('blackout'), false, 'blackout is retired');
});

test('P2-12 every map rolls its own disaster, never blackout (playtest)', () => {
  const table = { desert: 'sandstorm', frost: 'blizzard', ash: 'sandstorm', jungle: 'downpour', crater: 'dustchoke', toxic: 'downpour', glass: 'sandstorm' };
  for (const map of Object.keys(table)) {
    const g = boot({ seed: 131 });
    if (!g.api.unlockMap(map)) assert.ok(['desert', 'frost', 'ash'].includes(map), map + ' open by default');
    g.api.startRun({ map });
    g.steps(1);
    assert.strictEqual(g.api.snapshot().map, map, map + ' runs');
    assert.ok(g.api.triggerEvent(table[map]), map + ' rolls ' + table[map]);
    assert.strictEqual(g.api.snapshot().event.id, table[map]);
  }
  const pool = { desert: 'sandstorm', frost: 'blizzard', jungle: 'downpour', crater: 'dustchoke', toxic: 'downpour', glass: 'sandstorm', ash: 'sandstorm' };
  for (const map of Object.keys(pool)) {
    const g = boot({ seed: 143 });
    if (!g.api.unlockMap(map)) assert.ok(['desert', 'frost', 'ash'].includes(map), map + ' open by default');
    g.api.startRun({ map });
    g.steps(1);
    const ids = g.api.eventPool();
    assert.deepStrictEqual(JSON.stringify(ids.slice().sort()), JSON.stringify(['bounty', 'supply', 'surge', pool[map]].sort()), map + ' pool carries its own disaster');
    assert.ok(!ids.includes('blackout'), map + ' never rolls blackout');
  }
});

test('P2-12b each disaster paints its own storm (playtest visual)', () => {
  const strokes = { sandstorm: 'rgba(230,210,170,0.18)', blizzard: 'rgba(240,248,255,0.22)', downpour: 'rgba(150,210,240,0.20)', dustchoke: 'rgba(200,162,216,0.16)' };
  for (const id of Object.keys(strokes)) {
    const g = boot({ seed: 145, record: true });
    deploy(g);
    g.api.setInvulnerable(true);
    assert.ok(g.api.triggerEvent(id), id + ' triggers');
    g.steps(2);
    assert.ok(g.strokes.some((s) => s.strokeStyle === strokes[id]), id + ' paints its palette');
  }
});

test('all chip kinds spawn and pay out (K8 gap)', () => {
  const g = boot({ seed: 75 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (const kind of ['shards', 'aegis', 'frenzy', 'bomb', 'repair']) g.api.spawnChip(kind, 10, 0);
  g.steps(30);
  assert.strictEqual(g.api.snapshot().stats.chips, 5);
});

test('snapshot publishes the full observable surface (K8 gap)', () => {
  const g = boot({ seed: 80 });
  deploy(g);
  const s = g.api.snapshot();
  assert.ok(Number.isFinite(s.market), 'market');
  assert.strictEqual(s.streak, 0, 'streak');
  assert.strictEqual(s.bestStreak, 0, 'bestStreak');
  assert.strictEqual(typeof s.news, 'string', 'news');
  assert.strictEqual(s.event, null, 'no event fresh');
  assert.ok(Number.isFinite(s.hunterCd), 'hunterCd');
  assert.strictEqual(s.floaters, 0, 'floaters');
  assert.strictEqual(s.grenades, 0, 'grenades');
  assert.strictEqual(s.dash.ready, true, 'dash ready');
  assert.strictEqual(typeof s.ambience, 'string', 'ambience');
  assert.ok(Number.isInteger(s.dailyDay), 'dailyDay');
  assert.ok(s.diffMods && Number.isFinite(s.diffMods.spawn), 'diffMods');
  assert.ok(Number.isFinite(s.save.damageDealt), 'save.damageDealt');
  assert.ok(Number.isFinite(s.save.jackpots), 'save.jackpots');
  assert.ok(Number.isFinite(s.save.bankedTotal), 'save.bankedTotal');
  assert.ok(Number.isFinite(s.save.megaKills), 'save.megaKills');
  assert.strictEqual(typeof s.save.killsByType, 'object', 'save.killsByType');
  assert.ok(Number.isFinite(s.best.time), 'best.time');
});

test('mouse handlers dispatch without throwing (K8 gap)', () => {
  const g = boot({ seed: 81 });
  deploy(g);
  assert.doesNotThrow(() => {
    g.move(100, 100);
    g.down(100, 100);
    g.up();
    g.key('escape');
    g.key('escape', false);
  });
  assert.strictEqual(g.api.snapshot().screen, 'paused', 'escape pauses from play');
});

test('P0-1 room walls block enemy bullets symmetrically (playtest)', () => {
  const g = boot({ seed: 9111 });
  deploy(g);
  g.api.setInvulnerable(false);
  const room = g.api.rooms(0, 0, 6000)[0];
  assert.ok(room, 'room exists for wall test');
  const walls = g.api.props(room.x, room.y, 900).filter((p) => p.kind === 'room-wall');
  assert.ok(walls.length >= 4, 'room walls exist');
  const wall = walls.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const horizontal = wall.w >= wall.h;
  const px = wall.x;
  const py = horizontal ? wall.y + wall.h / 2 + 70 : wall.y;
  const sx = horizontal ? wall.x : wall.x + wall.w / 2 + 70;
  const sy = horizontal ? wall.y - wall.h / 2 - 70 : wall.y;
  const ang = Math.atan2(py - sy, px - sx);
  g.api.killEnemies();
  g.api.setPlayer(px, py);
  const hp0 = g.api.snapshot().hp;
  assert.ok(g.api.spawnBulletAt(sx, sy, ang, 300, 20, 'e'), 'enemy bullet spawned');
  g.steps(60);
  const s = g.api.snapshot();
  assert.strictEqual(s.hp, hp0, 'wall stops the enemy bullet, hp unchanged');
  assert.strictEqual(s.bullets.length, 0, 'blocked bullet is dead');

  const open = boot({ seed: 9111 });
  deploy(open);
  open.api.setInvulnerable(false);
  open.api.killEnemies();
  open.api.setPlayer(0, 0);
  const hpOpen0 = open.api.snapshot().hp;
  assert.ok(open.api.spawnBulletAt(0, -140, Math.PI / 2, 300, 20, 'e'), 'open bullet spawned');
  open.steps(60);
  assert.ok(open.api.snapshot().hp < hpOpen0, 'no wall means the bullet hits');
});

test('P0-2 bomb targets the densest cluster near the player (playtest)', () => {
  const g = boot({ seed: 7 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 15; i++) g.api.spawnEnemy('grunt', -400 + (i % 5) * 10, (i % 5) * 10);
  for (let i = 0; i < 5; i++) g.api.spawnEnemy('grunt', 400 + (i % 5) * 10, (i % 5) * 10);
  g.api.setPlayer(2000, 0);
  for (let i = 0; i < 3; i++) g.api.spawnEnemy('grunt', 50 + (i % 3) * 12, (i % 3) * 12);
  g.steps(1);
  assert.ok(g.api.throwBomb(), 'bomb throws after repositioning');
  g.steps(60);
  const s = g.api.snapshot();
  const nearAlive = s.enemies.filter((e) => !e.dead && Math.hypot(e.x - 2000, e.y) < 200).length;
  assert.strictEqual(nearAlive, 0, 'bomb explodes on the nearby cluster, got ' + nearAlive + ' survivors');
});

test('P0-3 explosions stay inside the particle budget (playtest perf)', () => {
  const g = boot({ seed: 11 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  g.steps(2);
  const before = g.api.snapshot().particles;
  assert.ok(g.api.explode(0, 0, 80, 0), 'explosion fires');
  const after = g.api.snapshot().particles;
  assert.ok(after - before <= 24, 'one explosion emits at most 24 particles, got ' + (after - before));
  assert.ok(after <= 420, 'particle cap holds, got ' + after);
});

test('P0-4 pickup lists stay capped on long runs (playtest min-10)', () => {
  const g = boot({ seed: 13 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.ok(g.api.spawnGems(500), 'gems spawned');
  g.steps(2);
  const s = g.api.snapshot();
  assert.ok(s.gems <= 400, 'gems capped at 400, got ' + s.gems);
});

test('P0-5 early levels arrive faster after the curve ease (playtest L2-4)', () => {
  const g = boot({ seed: 3623 });
  deploy(g);
  g.api.giveXp(45 + 69 + 97);
  g.steps(1);
  const s = g.api.snapshot();
  assert.ok(s.level >= 4, '211 xp reaches level 4 after the ease (was 257), got level ' + s.level);
});

test('P0-6 no phantom airstrike at deploy, streak 30 fires exactly once (playtest)', () => {
  const g = boot({ seed: 21 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.strictEqual(g.api.snapshot().airstrike, false, 'fresh run has no airstrike');
  g.api.setStreak(29);
  assert.strictEqual(g.api.snapshot().airstrike, false, 'streak 29 fires nothing');
  g.api.setStreak(30);
  const s = g.api.snapshot();
  assert.strictEqual(s.airstrike, true, 'streak 30 fires the one-shot airstrike');
  assert.strictEqual(JSON.stringify(s.streakRewards), JSON.stringify(['supply', 'airstrike']), 'supply then airstrike, exactly once each');
});

test('P1-1 lifesteal heals 1.5% per level, no more idle-in-mobs (playtest)', () => {
  const g = boot({ seed: 37 });
  deploy(g);
  g.api.killEnemies();
  g.api.hurt(60);
  for (let i = 0; i < 10; i++) assert.ok(g.api.applyUpgrade('lifesteal'), 'lifesteal rank ' + (i + 1));
  const low = g.api.snapshot().hp;
  const heal0 = g.api.snapshot().stats.healing;
  g.api.spawnEnemy('tank', 90, 0);
  assert.ok(g.api.hitEnemy(0, 100), 'hit lands');
  const s = g.api.snapshot();
  assert.strictEqual(s.stats.healing - heal0, 15, 'L10 leeches 15 per 100 dealt, got ' + (s.stats.healing - heal0));
  assert.strictEqual(Math.round(s.hp - low), 15, 'heal reaches hp');
});

test('P1-1b bloodstone relic leeches alone (playtest relic fix)', () => {
  const g = boot({ seed: 39 });
  deploy(g);
  g.api.killEnemies();
  assert.ok(g.api.grantRelic('bloodstone'), 'bloodstone granted');
  g.api.hurt(60);
  const low = g.api.snapshot().hp;
  const heal0 = g.api.snapshot().stats.healing;
  g.api.spawnEnemy('tank', 90, 0);
  assert.ok(g.api.hitEnemy(0, 100), 'hit lands');
  const s = g.api.snapshot();
  assert.strictEqual(s.stats.healing - heal0, 3, 'relic alone leeches 3 per 100, got ' + (s.stats.healing - heal0));
  assert.strictEqual(Math.round(s.hp - low), 3, 'relic heal reaches hp');
});

test('P1-2 ten soldiers hold ten distinct formation slots (playtest)', () => {
  const g = boot({ seed: 43 });
  deploy(g);
  for (let i = 0; i < 10; i++) assert.ok(g.api.applyUpgrade('squad'), 'soldier ' + (i + 1));
  const s = g.api.snapshot();
  assert.strictEqual(s.squad, 10, 'ten soldiers recruited');
  const keys = s.soldiers.map((o) => Math.round(o.x) + ',' + Math.round(o.y));
  assert.strictEqual(new Set(keys).size, 10, 'no two soldiers share a slot, got ' + JSON.stringify(keys));
});

test('P1-3 squad evolves into legion at 10 with vitality 3 (playtest)', () => {
  const g = boot({ seed: 45 });
  deploy(g);
  for (let i = 0; i < 10; i++) g.api.applyUpgrade('squad');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('vitality');
  assert.strictEqual(g.api.snapshot().evolved.squad, undefined, 'squad waits for the pick');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.strictEqual(g.api.snapshot().offers[0], 'evo:squad');
  assert.ok(g.api.chooseUpgrade(0));
  const s = g.api.snapshot();
  assert.strictEqual(s.evolved.squad, 'legion', 'squad evolves like every other skill');
  assert.ok(s.bannerT > 0, 'the evolution is announced');
});

test('P1-5 evolutions are picked, never forced (playtest 3-way choice)', () => {
  const g = boot({ seed: 47 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 9; i++) g.api.applyUpgrade('rifle');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('bulletSpeed');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.strictEqual(g.api.snapshot().screen, 'levelup');
  const offers = g.api.snapshot().offers;
  assert.strictEqual(offers[0], 'evo:rifle', 'evolve card leads');
  assert.ok(offers.length === 3, 'three cards to choose from, got ' + offers.length);
  assert.ok(g.api.chooseUpgrade(1), 'player defers by picking a normal card');
  assert.strictEqual(g.api.snapshot().evolved.rifle, undefined, 'rifle stays unevolved');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.strictEqual(g.api.snapshot().offers[0], 'evo:rifle', 'evolution waits for the next level');
  assert.ok(g.api.chooseUpgrade(0), 'player evolves when ready');
  assert.strictEqual(g.api.snapshot().evolved.rifle, 'ripper');
});

test('P1-5b three ready evolutions fill all three cards (playtest)', () => {
  const g = boot({ seed: 49 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 9; i++) g.api.applyUpgrade('rifle');
  for (let i = 0; i < 10; i++) g.api.applyUpgrade('rail');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('bulletSpeed');
  g.api.giveXp(g.api.snapshot().xpNext);
  const offers = g.api.snapshot().offers;
  assert.strictEqual(offers[0], 'evo:rifle', 'first ready evolution leads, got ' + offers[0]);
  assert.strictEqual(offers[1], 'evo:rail', 'second ready evolution follows, got ' + offers[1]);
  assert.strictEqual(offers.length, 3, 'still three cards');
});

test('P1-5c evolve cards cannot be banished (playtest)', () => {
  const g = boot({ seed: 51 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 9; i++) g.api.applyUpgrade('rifle');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('bulletSpeed');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.strictEqual(g.api.snapshot().offers[0], 'evo:rifle');
  assert.strictEqual(g.api.banish(0), false, 'evolve cards refuse banish');
  assert.strictEqual(g.api.snapshot().banishes, 1, 'no banish spent');
});

test('P1-5d evolve cards render with name and desc (playtest visual)', () => {
  const g = boot({ seed: 53, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 9; i++) g.api.applyUpgrade('rifle');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('bulletSpeed');
  g.api.giveXp(g.api.snapshot().xpNext);
  g.steps(2);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('⚡ EVOLVE'), 'evolve header draws, got ' + JSON.stringify(labels.slice(0, 8)));
  assert.ok(labels.includes('RIPPER'), 'evolution name draws');
  const btn = g.api.snapshot().buttons.find((b) => b.id === 'upgrade-0');
  assert.ok(btn && btn.label === 'EVOLVE RIPPER', 'evolve card owns upgrade-0');
});

test('P1-6 off-archetype weapons stay rare for railgunners (playtest)', () => {
  let offCount = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = boot({ seed });
    deploy(g, { weapon: 'rail' });
    g.api.giveXp(g.api.snapshot().xpNext);
    const offers = g.api.snapshot().offers;
    if (offers.includes('smg') || offers.includes('shotgun')) offCount++;
  }
  assert.ok(offCount <= 4, 'off-archetype offers halved (6/20 -> 3/20), got ' + offCount + '/20');
});

test('P1-7 first teammate is offered by level 3 (playtest)', () => {
  const g = boot({ seed: 61 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let round = 0; round < 2; round++) {
    g.api.giveXp(g.api.snapshot().xpNext);
    assert.strictEqual(g.api.snapshot().screen, 'levelup');
    const offers = g.api.snapshot().offers;
    const idx = offers.findIndex((id) => id !== 'squad');
    assert.ok(idx >= 0, 'a non-squad card exists');
    assert.ok(g.api.chooseUpgrade(idx), 'player skips the teammate');
  }
  assert.strictEqual(g.api.snapshot().squad, 0, 'no soldier taken yet');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.ok(g.api.snapshot().offers.includes('squad'), 'pity offers the first teammate');
});

test('P1-8 cluster evolution doubles manual bombs (playtest)', () => {
  const g = boot({ seed: 63 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 10; i++) g.api.applyUpgrade('grenade');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('damage');
  assert.strictEqual(g.api.snapshot().evolved.grenade, undefined, 'cluster waits for the pick');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.strictEqual(g.api.snapshot().offers[0], 'evo:grenade');
  assert.ok(g.api.chooseUpgrade(0));
  assert.strictEqual(g.api.snapshot().evolved.grenade, 'cluster');
  for (let i = 0; i < 5; i++) g.api.spawnEnemy('grunt', 100 + (i % 5) * 10, (i % 5) * 10);
  g.steps(1);
  assert.ok(g.api.throwBomb(), 'bomb throws');
  assert.strictEqual(g.api.snapshot().bombs, 2, 'cluster doubles the manual throw');
});

test('P1-9 horde pressure eases while a boss lives (playtest focus)', () => {
  const g = boot({ seed: 65 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.strictEqual(g.api.snapshot().hordePressure, 1, 'full pressure with no boss');
  g.api.spawnBoss('warlord');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().hordePressure, 0.55, 'pressure eases during the boss');
});

test('P2-1 kills promote through ranks with unlocks (playtest)', () => {
  const g = boot({ seed: 71 });
  deploy(g);
  g.api.setInvulnerable(true);
  let s = g.api.snapshot();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.rank)), { index: 0, id: 'private', name: 'PRIVATE', short: 'PVT' }, 'every run starts a Private');
  g.api.setKills(25);
  s = g.api.snapshot();
  assert.strictEqual(s.rank.id, 'corporal', '25 kills make Corporal');
  assert.strictEqual(s.rerolls, 3, 'corporal unlocks +1 reroll');
  g.api.setKills(150);
  s = g.api.snapshot();
  assert.strictEqual(s.rank.id, 'lieutenant', '150 kills make Lieutenant');
  assert.ok(s.medkits >= 2, 'sergeant dropped medkits');
  const ltBanked = s.unbanked;
  assert.ok(ltBanked > 0, 'lieutenant pays shards');
  g.api.setKills(1000);
  s = g.api.snapshot();
  assert.strictEqual(s.rank.id, 'general', '1000 kills make General');
  assert.strictEqual(s.rerolls, 6, 'captain and colonel rerolls stack');
  assert.strictEqual(s.banishes, 2, 'captain unlocks +1 banish');
  assert.ok(Math.abs(s.unbanked / ltBanked - 7) < 1e-9, 'shard rewards stack 50+100+200 = 7x lieutenant');
  assert.ok(s.news.indexOf('GENERAL') >= 0, 'promotion is recorded, got ' + s.news);
});

test('P2-1 promotion callout fires on the exact kill (playtest)', () => {
  const g = boot({ seed: 72 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setKills(999);
  assert.strictEqual(g.api.snapshot().rank.id, 'colonel', '999 kills hold Colonel');
  g.api.spawnEnemy('grunt', 90, 0);
  g.api.setEnemyHp(0, 1);
  assert.ok(g.api.hitEnemy(0, 50), 'kill 1000 lands');
  const s = g.api.snapshot();
  assert.strictEqual(s.rank.id, 'general', 'kill 1000 promotes');
  assert.strictEqual(s.callout.text, 'PROMOTED · GENERAL', 'promotion is announced');
});

test('P2-2 akimbo joins the unified arsenal and starts its own line (playtest)', () => {
  const g = boot({ seed: 75 });
  enterSetup(g);
  const ids = g.api.snapshot().buttons.map((b) => b.id);
  for (const weapon of ['ak', 'smg', 'spas', 'dmr', 'rail', 'beretta']) assert.ok(ids.includes('weapon-' + weapon), weapon);
  const cards = g.api.snapshot().buttons.filter((b) => b.id.indexOf('weapon-') === 0);
  assert.strictEqual(cards.length, 6, 'six weapons on one roof');
  for (let i = 0; i < cards.length - 1; i++) {
    assert.ok(cards[i].x + cards[i].w <= cards[i + 1].x, 'weapon cards do not overlap');
  }
  assert.ok(cards[cards.length - 1].x + cards[cards.length - 1].w <= 960, 'akimbo stays on screen');
  g.api.clickButton('weapon-beretta');
  g.api.clickButton('setup-start');
  g.steps(1);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'play');
  assert.strictEqual(s.weapon, 'beretta');
  assert.strictEqual(s.skills.akimbo, 1);
  assert.strictEqual(s.skills.rifle, 0);
});

test('P2-2c akimbo card draws on the unified arsenal tab (playtest visual)', () => {
  const g = boot({ seed: 79, record: true });
  enterSetup(g);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('AKIMBO'), 'akimbo shows next to the other weapons');
  assert.ok(labels.includes('OPERATOR'), 'class and weapon share one roof');
});

test('P2-3 round minimap sits bottom-right clear of the HUD (playtest)', () => {
  const g = boot({ seed: 81 });
  deploy(g);
  const m = g.api.snapshot().minimap;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m)), { x: 876, y: 516, r: 64 }, 'minimap geometry pinned');
  assert.ok(m.x - m.r > 700, 'right side, clear of the center panels');
  assert.ok(m.y + m.r <= 600 - 16, 'clear of the XP bar');
  assert.ok(m.x + m.r <= 960 && m.y - m.r >= 0, 'fully on screen');
});

test('P2-3b the minimap lifts clear of touch buttons (playtest)', () => {
  const g = boot({ seed: 82 });
  deploy(g);
  g.handlers.touchstart({ preventDefault() {}, changedTouches: [] });
  g.steps(1);
  const m = JSON.parse(JSON.stringify(g.api.snapshot().minimap));
  assert.deepStrictEqual(m, { x: 876, y: 400, r: 64 }, 'touch layout lifts the minimap');
  assert.ok(m.y + m.r <= 504 - 34, 'clear of the DASH/BOMB/OD buttons, bottom edge at ' + (m.y + m.r));
});

test('P2-4 brutal pays +10% and nightmare +15% shards (playtest)', () => {
  const rates = {};
  for (const diff of ['normal', 'brutal', 'nightmare']) {
    const g = boot({ seed: 83 });
    deploy(g, diff === 'normal' ? {} : { difficulty: diff });
    g.api.setKills(150);
    rates[diff] = g.api.snapshot().unbanked;
  }
  assert.ok(rates.normal > 0, 'baseline pays');
  assert.ok(Math.abs(rates.brutal / rates.normal - 1.1) < 1e-9, 'brutal +10%, got ' + rates.brutal / rates.normal);
  assert.ok(Math.abs(rates.nightmare / rates.normal - 1.15) < 1e-9, 'nightmare +15%, got ' + rates.nightmare / rates.normal);
});

test('P2-5 locked maps refuse clicks until bought with shards (playtest)', () => {
  const g = boot({ seed: 89 });
  enterSetup(g);
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  g.api.clickButton('map-glass');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.map, 'desert', 'glass stays locked without shards');
  const before = g.api.snapshot().save.shards;
  g.api.grantShards(5000);
  g.api.clickButton('map-glass');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().setup.map, 'glass', 'glass unlocks and selects');
  assert.strictEqual(g.api.snapshot().save.shards, before + 5000 - 5000, 'price deducted');
  assert.ok(g.api.snapshot().save.unlocked.maps.includes('glass'), 'unlock persists in the save');
});

test('P2-5b unlockable maps pay their income bonus (playtest)', () => {
  const g = boot({ seed: 91 });
  g.api.grantShards(500);
  deploy(g, { map: 'jungle' });
  g.api.setKills(150);
  const jungle = g.api.snapshot().unbanked;
  const h = boot({ seed: 91 });
  deploy(h);
  h.api.setKills(150);
  const desert = h.api.snapshot().unbanked;
  assert.ok(desert > 0, 'baseline pays');
  assert.ok(Math.abs(jungle / desert - 1.05) < 1e-9, 'jungle +5%, got ' + jungle / desert);
});

test('P2-5c old saves keep the three open maps (playtest migration)', () => {
  const store = makeStore();
  store.data['dustline.save'] = JSON.stringify({ v: 2, unlocked: { weapons: ['ak'], maps: ['desert'] } });
  const g = boot({ seed: 93, storage: store });
  const maps = g.api.snapshot().save.unlocked.maps;
  for (const id of ['desert', 'frost', 'ash']) assert.ok(maps.includes(id), id + ' stays open, got ' + JSON.stringify(maps));
});

test('P2-6 champions drop a lucky die that waits on the map (playtest)', () => {
  const g = boot({ seed: 95 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('tank', 60, 0);
  g.api.setPlayer(2000, 0);
  g.api.forceChampion(0, 'swift');
  g.api.setEnemyHp(0, 5);
  g.api.hitEnemy(0, 999);
  g.steps(2);
  const s = g.api.snapshot();
  assert.strictEqual(s.dice, 1, 'the champion leaves a die behind');
});

test('P2-6b collecting a die grants a reroll or a banish (playtest)', () => {
  const g = boot({ seed: 97 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  const r0 = g.api.snapshot().rerolls;
  const b0 = g.api.snapshot().banishes;
  assert.ok(g.api.spawnDie(10, 0), 'die spawned');
  g.steps(5);
  const s = g.api.snapshot();
  assert.strictEqual(s.dice, 0, 'the die is picked up');
  assert.strictEqual(s.rerolls + s.banishes - r0 - b0, 1, 'one roll of fortune, got +' + (s.rerolls - r0) + ' reroll / +' + (s.banishes - b0) + ' banish');
  assert.strictEqual(s.stats.dice, 1, 'die counted');
});

test('P2-6c dice draw on the map with pips and label (playtest visual)', () => {
  const g = boot({ seed: 99, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  assert.ok(g.api.spawnDie(150, 0), 'die spawned in view');
  g.steps(2);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('DICE'), 'die label draws, got ' + JSON.stringify(labels.slice(0, 10)));
});

test('P2-9 champions can drop a field radio (playtest)', () => {
  const g = boot({ seed: 2 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('tank', 60, 0);
  g.api.setPlayer(2000, 0);
  g.api.forceChampion(0, 'swift');
  g.api.setEnemyHp(0, 1);
  g.api.hitEnemy(0, 999);
  g.steps(2);
  assert.strictEqual(g.api.snapshot().radios, 1, 'the champion leaves a radio');
});

test('P2-9b collecting a radio arms a T-called plane strike (playtest)', () => {
  const g = boot({ seed: 111 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  assert.ok(g.api.spawnRadio(10, 0), 'radio spawned');
  g.steps(5);
  let s = g.api.snapshot();
  assert.strictEqual(s.radios, 0, 'the radio is picked up');
  assert.strictEqual(s.radioArmed, 1, 'one strike armed');
  assert.strictEqual(s.stats.radio, 1, 'radio counted');
  assert.ok(!s.airstrike, 'nothing fires without T');
  g.key('t');
  g.steps(2);
  g.key('t', false);
  s = g.api.snapshot();
  assert.strictEqual(s.radioArmed, 0, 'calling spends the radio');
  assert.ok(s.airstrike, 'the plane is inbound');
});

test('P2-9c radios draw on the map with a label (playtest visual)', () => {
  const g = boot({ seed: 113, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  assert.ok(g.api.spawnRadio(150, 0), 'radio spawned in view');
  g.steps(2);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('RADIO'), 'radio label draws, got ' + JSON.stringify(labels.slice(0, 10)));
});

test('P2-11 a surge ring assaults every 200 seconds (playtest)', () => {
  const g = boot({ seed: 123 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(201);
  g.steps(2);
  const s = g.api.snapshot();
  assert.strictEqual(s.assault.idx, 1, 'first surge fired');
  assert.strictEqual(s.assault.pending, false, 'no boss blocks it');
  assert.ok(s.enemies.length >= 10, 'a full ring assaults, got ' + s.enemies.length);
  assert.ok(s.bannerT > 0, 'the surge is announced');
});

test('P2-11b surges wait while a boss lives (playtest)', () => {
  const g = boot({ seed: 125 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('warlord');
  g.api.setTime(201);
  g.steps(2);
  let s = g.api.snapshot();
  assert.strictEqual(s.assault.idx, 1, 'surge counted');
  assert.strictEqual(s.assault.pending, true, 'but held for the boss');
  g.api.killEnemies();
  g.steps(5);
  s = g.api.snapshot();
  assert.strictEqual(s.assault.pending, false, 'released after the kill');
  assert.ok(s.enemies.length >= 10, 'the held ring assaults, got ' + s.enemies.length);
});

test('P2-11c the ticker counts down to the next surge (playtest visual)', () => {
  const g = boot({ seed: 127, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(100);
  g.steps(2);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.some((t) => t.indexOf('SURGE') === 0), 'surge ticker draws, got ' + JSON.stringify(labels.slice(0, 12)));
});

test('P2-15 a full combat frame stays inside the draw budget (playtest perf)', () => {
  const g = boot({ seed: 777 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setTime(600);
  for (let i = 0; i < 140; i++) g.api.spawnEnemy(i % 2 ? 'grunt' : 'runner', (i % 20) * 30 - 300, Math.floor(i / 20) * 30 - 100);
  for (let i = 0; i < 5; i++) g.api.spawnEnemy('tank', 150 + i * 12, 60);
  g.api.spawnGems(400, 0);
  g.steps(30);
  g.step();
  const total = Object.keys(g.ops).reduce((sum, k) => sum + g.ops[k], 0);
  assert.ok(total < 10000, 'loaded frame uses ' + total + ' canvas ops');
});

test('P2-15b off-screen pickups skip drawing (playtest perf)', () => {
  const g = boot({ seed: 131 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnGems(100, 0);
  g.steps(2);
  g.step();
  const near = Object.keys(g.ops).reduce((sum, k) => sum + g.ops[k], 0);
  g.api.setPlayer(5000, 0);
  g.steps(2);
  g.step();
  const far = Object.keys(g.ops).reduce((sum, k) => sum + g.ops[k], 0);
  assert.ok(far < near, 'culled frame draws less: ' + far + ' vs ' + near);
});

test('P2-15c fast-path diamonds still paint teal (playtest visual)', () => {
  const g = boot({ seed: 133, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  g.api.spawnGems(10, 0);
  g.steps(2);
  assert.ok(g.fills.some((f) => f.fillStyle === '#2fe8b0'), 'tier-0 diamonds draw');
});

test('P2-16 player tracers skip the glow pass (playtest perf)', () => {
  const g = boot({ seed: 777 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.steps(1);
  g.step();
  const base = Object.keys(g.ops).reduce((sum, k) => sum + g.ops[k], 0);
  for (let i = 0; i < 50; i++) g.api.spawnBulletAt((i % 10) * 40 - 200, Math.floor(i / 10) * 40 - 100, 0.5, 1, 10, 'p');
  g.steps(1);
  g.step();
  const loaded = Object.keys(g.ops).reduce((sum, k) => sum + g.ops[k], 0);
  assert.ok((loaded - base) / 50 < 9, 'single-pass tracers, got ' + ((loaded - base) / 50).toFixed(1) + ' ops/bullet');
});

test('P2-17 soldiers field the player weapon family (playtest)', () => {
  const g = boot({ seed: 167 });
  deploy(g, { weapon: 'beretta' });
  g.api.setInvulnerable(true);
  assert.strictEqual(g.api.soldierBulletColor(), '#ffd9a0', 'akimbo squad fires akimbo gold');
  const h = boot({ seed: 169 });
  deploy(h);
  h.api.setInvulnerable(true);
  assert.strictEqual(h.api.soldierBulletColor(), '#ffd27a', 'rifle squad fires rifle gold');
  h.api.applyUpgrade('squad');
  h.api.spawnEnemy('grunt', 280, 0);
  let seen = false;
  for (let i = 0; i < 24 && !seen; i++) {
    h.steps(5);
    seen = h.api.snapshot().bulletColors.includes('#ffd27a');
  }
  assert.ok(seen, 'volleys carry the family color');
});

test('P2-14 the boards seed house rivals to chase (playtest)', () => {
  const g = boot({ seed: 155, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.key('escape');
  g.steps(1);
  assert.ok(g.api.clickButton('menu-pause'), 'abandon from pause');
  g.steps(1);
  assert.ok(g.api.clickButton('leaderboard'), 'leaderboard opens');
  g.steps(1);
  let labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('DUSTKING'), 'global legends stand above you');
  assert.ok(g.api.clickButton('board-turkiye'), 'turkiye tab opens');
  g.steps(1);
  labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('ANADOLU'), 'turkiye has its own runners');
});

test('P2-14b beating rivals pays once and persists (playtest)', () => {
  const store = makeStore();
  const g = boot({ seed: 157, storage: store });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  g.api.setKills(1000);
  g.key('escape');
  g.steps(1);
  assert.ok(g.api.clickButton('menu-pause'), 'abandon the big run');
  g.steps(1);
  let s = g.api.snapshot();
  const beaten = s.save.rivalsBeaten;
  assert.ok(beaten.includes('g:RAPTOR'), 'raptor falls, got ' + JSON.stringify(beaten));
  assert.ok(beaten.includes('t:LODOS'), 'lodos falls');
  assert.ok(!beaten.includes('g:COBALT'), 'cobalt still stands');
  assert.strictEqual(beaten.length, 6, 'six rivals beaten, got ' + beaten.length);
  const afterFirst = s.save.shards;
  assert.ok(afterFirst >= 150, 'first beatings pay 25 each, got ' + afterFirst);
  const g2 = boot({ seed: 157, storage: store });
  deploy(g2);
  g2.api.setInvulnerable(true);
  g2.api.killEnemies();
  g2.api.setKills(1000);
  g2.key('escape');
  g2.steps(1);
  assert.ok(g2.api.clickButton('menu-pause'), 'abandon an identical run');
  g2.steps(1);
  s = g2.api.snapshot();
  assert.strictEqual(s.save.rivalsBeaten.length, 6, 'no second payout without new beatings');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.save.rivalsBeaten.slice().sort())), JSON.parse(JSON.stringify(beaten.slice().sort())), 'beaten list stable');
});

test('P2-14c the over screen names the rivals you just beat (playtest visual)', () => {
  const g = boot({ seed: 171, record: true });
  deploy(g);
  g.api.killEnemies();
  g.api.setKills(1000);
  for (let i = 0; i < 6; i++) g.api.spawnEnemy('tank', 25 + (i % 3) * 8, (i % 3) * 8);
  let over = false;
  for (let i = 0; i < 30 && !over; i++) {
    g.steps(30);
    over = g.api.snapshot().screen === 'over';
  }
  assert.ok(over, 'the run ends on the over screen');
  g.steps(2);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.some((t) => t.indexOf('RIVALS BEATEN') === 0), 'beaten rivals get their moment, got ' + JSON.stringify(labels.slice(0, 12)));
  assert.ok(labels.some((t) => t.indexOf('RANK ') >= 0), 'the report names the earned rank');
});

test('P2-14e rivals line and combos share the over screen (playtest)', () => {
  const g = boot({ seed: 177, record: true });
  deploy(g);
  g.api.killEnemies();
  g.api.setKills(1000);
  assert.ok(g.api.applyUpgrade('rifle'), 'rifle 2');
  assert.ok(g.api.applyUpgrade('bulletSpeed'), 'overclocked online');
  assert.ok(g.api.applyUpgrade('bulletSpeed'), 'overclocked online');
  for (let i = 0; i < 6; i++) g.api.spawnEnemy('tank', 25 + (i % 3) * 8, (i % 3) * 8);
  let over = false;
  for (let i = 0; i < 30 && !over; i++) {
    g.steps(30);
    over = g.api.snapshot().screen === 'over';
  }
  assert.ok(over, 'the run ends on the over screen');
  g.steps(2);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.some((t) => t.indexOf('RIVALS BEATEN') === 0), 'rivals line draws');
  assert.ok(labels.some((t) => t.indexOf('COMBOS:') === 0), 'combos shift down beside it');
});

test('P2-14f rival names can never enter the friend-code system (backend contract)', () => {
  const g = boot({ seed: 181, record: true });
  assert.ok(g.api.clickButton('leaderboard'));
  g.steps(1);
  assert.ok(g.api.clickButton('board-friends'));
  g.steps(1);
  assert.ok(g.api.clickButton('friend-add'));
  g.steps(1);
  for (const ch of 'dustking') g.key(ch);
  assert.ok(g.api.clickButton('friend-save'), 'save button exists');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().save.friends.length, 0, 'rival names are not valid sync codes');
  assert.ok(g.texts.some((t) => t.text.indexOf('8 HEX') >= 0), 'the hex rule is announced');
});

test('P2-14d career stats track the rivalry (playtest)', () => {
  const store = makeStore();
  const g = boot({ seed: 173, storage: store, record: true });
  assert.ok(g.api.clickButton('statistics'));
  g.steps(1);
  assert.ok(g.texts.some((t) => t.text === 'RIVALS BEATEN'), 'rivalry has a career row');
  assert.ok(g.api.clickButton('back-stats'));
  g.steps(1);
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  g.api.setKills(1000);
  g.key('escape');
  g.steps(1);
  assert.ok(g.api.clickButton('menu-pause'));
  g.steps(1);
  assert.ok(g.api.clickButton('statistics'));
  g.steps(1);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('6 / 14'), 'six beaten rivals on record, got ' + JSON.stringify(labels.slice(0, 20)));
});

test('P2-13 the shop sells looks, never power (playtest)', () => {
  const store = makeStore();
  const g = boot({ seed: 151, storage: store });
  assert.ok(g.api.clickButton('shop'), 'shop opens from the menu');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'shop');
  g.api.grantShards(3000);
  assert.ok(g.api.clickButton('skin-crimson'), 'crimson buys for shards');
  let s = g.api.snapshot();
  assert.strictEqual(s.save.shards, 2500, 'price deducted, got ' + s.save.shards);
  assert.ok(s.save.cosmetics.skins.includes('crimson'), 'skin owned');
  assert.strictEqual(s.save.cosmetics.skin, 'crimson', 'bought skin equips');
  assert.ok(g.api.clickButton('skin-gold'), 'gold buys too');
  assert.ok(g.api.clickButton('skin-crimson'), 'switching to an owned skin is free');
  s = g.api.snapshot();
  assert.strictEqual(s.save.shards, 1000, 'no charge for owned skins');
  assert.strictEqual(s.save.cosmetics.skin, 'crimson', 'owned skin equips');
  assert.ok(g.api.clickButton('skin-void'), 'void button exists');
  assert.strictEqual(g.api.snapshot().save.shards, 1000, 'but refuses without funds');
  const g2 = boot({ seed: 152, storage: store });
  const kept = g2.api.snapshot().save.cosmetics;
  assert.ok(kept.skins.includes('crimson') && kept.skins.includes('gold'), 'skins persist');
  assert.strictEqual(kept.skin, 'crimson', 'equipped skin persists');
});

test('P2-13b VIP packs show prices but sell nothing (playtest)', () => {
  const g = boot({ seed: 153, record: true });
  assert.ok(g.api.clickButton('shop'));
  g.steps(1);
  assert.ok(g.api.clickButton('shop-tab-1'), 'VIP tab opens');
  g.steps(1);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('VIP BADGE'), 'VIP packs listed');
  assert.ok(labels.some((t) => t.indexOf('$') >= 0), 'real-money prices shown, got ' + JSON.stringify(labels.slice(0, 12)));
  assert.ok(labels.some((t) => t.indexOf('COMING SOON') >= 0), 'no billing in this build');
  assert.strictEqual(g.api.clickButton('vip-vip-badge'), false, 'VIP packs have no purchase path');
  assert.strictEqual(g.api.clickButton('vip-vip-neon'), false, 'neon has no purchase path');
  const vip = g.api.snapshot().save.cosmetics.vip;
  assert.strictEqual(vip.premium, false, 'no premium flag without checkout');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vip.items)), [], 'no VIP entitlements');
});

test('P2-15 ops is a 10-minute operation with a paid extraction (playtest)', () => {
  const g = boot({ seed: 161 });
  enterSetup(g);
  g.api.clickButton('setup-tab-1');
  g.steps(1);
  assert.ok(g.api.clickButton('mode-ops'), 'ops mode selects');
  g.api.clickButton('setup-start');
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.mode, 'ops');
  assert.strictEqual(s.limitSec, 600, 'ops fixes the clock at ten minutes');
  assert.strictEqual(s.beacon, null, 'no window before 9:30');
  g.api.setInvulnerable(true);
  g.api.setKills(150);
  g.api.setTime(570);
  g.steps(2);
  s = g.api.snapshot();
  assert.ok(s.beacon, 'extraction window opens at 9:30');
  g.api.setPlayer(Math.round(s.beacon.x), Math.round(s.beacon.y));
  g.steps(2);
  s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over', 'reaching the beacon extracts');
  assert.strictEqual(s.victory, true, 'extraction wins the op');
  assert.ok(s.save.shards >= 200, 'clean extract pays the bonus, got ' + s.save.shards);
});

test('P2-15b ops without extraction still wins at the horn (playtest)', () => {
  const g = boot({ seed: 163, record: true });
  deploy(g, { mode: 'ops' });
  g.api.setInvulnerable(true);
  g.api.setTime(600);
  g.steps(2);
  const s = g.api.snapshot();
  assert.strictEqual(s.screen, 'over', 'the horn ends the op');
  assert.strictEqual(s.victory, true, 'surviving wins');
  assert.ok(g.texts.some((t) => t.text === 'OPERATION COMPLETE'), 'the win names the operation');
  assert.strictEqual(s.save.achievements.operator, true, 'the op earns OPERATOR');
});

test('P2-16 achievements cover rivals, maps and ops (playtest)', () => {
  const store = makeStore();
  store.data['dustline.save'] = JSON.stringify({
    v: 2,
    rivalsBeaten: ['g:FLINT', 'g:PEBBLE', 't:CAKIL'],
    unlocked: { weapons: ['ak'], maps: ['desert', 'frost', 'ash', 'jungle'] },
    opsWins: 1
  });
  const g = boot({ seed: 165, storage: store });
  const s = g.api.snapshot();
  assert.strictEqual(s.save.achievements.rival_slayer, true, 'three beaten rivals unlock RIVAL SLAYER');
  assert.strictEqual(s.save.achievements.treasure_hunter, true, 'four maps unlock TREASURE HUNTER');
  assert.strictEqual(s.save.achievements.operator, true, 'an ops win unlocks OPERATOR');
});

test('P2-10 damage numbers climb white-yellow-orange-red (playtest)', () => {
  const style = (tier) => ({ 0: 'diamond', 1: 'star', 2: 'hex' })[tier];
  const g = boot({ seed: 115 });
  deploy(g);
  g.api.setInvulnerable(true);
  assert.strictEqual(g.api.gemStyle(0).shape, style(0), 'tier 0 is a diamond');
  assert.strictEqual(g.api.gemStyle(1).shape, style(1), 'jackpot is a star');
  assert.strictEqual(g.api.gemStyle(2).shape, style(2), 'tier 2 is a hex');
  const colors = [g.api.gemStyle(0).color, g.api.gemStyle(1).color, g.api.gemStyle(2).color];
  assert.strictEqual(new Set(colors).size, 3, 'every tier has its own vivid color');
});

test('P2-10b chip hits show white, heavy hits show red (playtest visual)', () => {
  const g = boot({ seed: 117, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.killEnemies();
  g.api.spawnEnemy('tank', 90, 0);
  assert.ok(g.api.hitEnemy(0, 10), 'chip hits');
  assert.ok(g.api.hitEnemy(0, 60), 'heavy hits');
  g.steps(2);
  const small = g.texts.find((t) => t.text === '-10');
  const big = g.texts.find((t) => t.text === '-60');
  assert.ok(small, 'chip number draws');
  assert.ok(big, 'heavy number draws');
  assert.strictEqual(small.fillStyle, '#f4efe2', 'chips stay white');
  assert.strictEqual(big.fillStyle, '#ff4d3d', 'heavies burn red');
});

test('P2-7 shock boots bank dash charges up to 4 (playtest)', () => {
  const g = boot({ seed: 101 });
  deploy(g);
  g.api.setInvulnerable(true);
  let s = g.api.snapshot();
  assert.strictEqual(s.dash.max, 1, 'one charge without boots');
  assert.strictEqual(s.dash.charges, 1, 'starts charged');
  for (let i = 0; i < 6; i++) g.api.applyUpgrade('dashPower');
  assert.strictEqual(g.api.snapshot().dash.max, 3, 'six levels bank three charges');
  for (let i = 0; i < 4; i++) g.api.applyUpgrade('dashPower');
  assert.strictEqual(g.api.snapshot().dash.max, 4, 'ten levels cap at four charges');
  g.steps(300);
  assert.strictEqual(g.api.snapshot().dash.charges, 4, 'refills to the cap, got ' + g.api.snapshot().dash.charges);
});

test('P2-7b dashes spend charges and refill one at a time (playtest)', () => {
  const g = boot({ seed: 103 });
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 6; i++) g.api.applyUpgrade('dashPower');
  g.steps(200);
  assert.strictEqual(g.api.snapshot().dash.charges, 3, 'banked three charges');
  g.key('d');
  g.key('shift');
  g.steps(3);
  g.key('shift', false);
  assert.strictEqual(g.api.snapshot().dash.charges, 2, 'one dash spends one charge');
  g.steps(100);
  assert.strictEqual(g.api.snapshot().dash.charges, 3, 'refills over time');
  g.key('d', false);
});

test('P2-8 bomb mode toggles and persists (playtest)', () => {
  const store = makeStore();
  const g = boot({ seed: 105, storage: store });
  assert.strictEqual(g.api.snapshot().settings.bombMode, 'manual', 'manual by default');
  assert.ok(g.api.clickButton('settings'));
  g.steps(1);
  assert.ok(g.api.clickButton('bomb-mode'), 'mode toggles');
  assert.strictEqual(g.api.snapshot().settings.bombMode, 'auto', 'now automatic');
  const g2 = boot({ seed: 106, storage: store });
  assert.strictEqual(g2.api.snapshot().settings.bombMode, 'auto', 'auto persists across sessions');
});

test('P2-8b auto mode throws at crowds, manual waits for E (playtest)', () => {
  const store = makeStore();
  const g = boot({ seed: 107, storage: store });
  assert.ok(g.api.clickButton('settings'));
  g.steps(1);
  assert.ok(g.api.clickButton('bomb-mode'));
  assert.ok(g.api.clickButton('back-settings'));
  g.steps(1);
  deploy(g);
  g.api.setInvulnerable(true);
  for (let i = 0; i < 5; i++) g.api.spawnEnemy('grunt', 100 + (i % 5) * 10, (i % 5) * 10);
  g.steps(1);
  assert.strictEqual(g.api.snapshot().bomb.mode, 'auto', 'run follows the setting');
  g.steps(5);
  assert.ok(g.api.snapshot().bombs > 0, 'auto throws without E');
  const h = boot({ seed: 109 });
  deploy(h);
  h.api.setInvulnerable(true);
  for (let i = 0; i < 5; i++) h.api.spawnEnemy('grunt', 100 + (i % 5) * 10, (i % 5) * 10);
  h.steps(30);
  assert.strictEqual(h.api.snapshot().bombs, 0, 'manual never self-throws');
});

test('P2-2b twin berettas fire twin volleys and evolve into the duelist (playtest)', () => {
  const g = boot({ seed: 77 });
  deploy(g, { weapon: 'beretta' });
  g.api.setInvulnerable(true);
  g.api.spawnEnemy('grunt', 150, 0);
  g.steps(30);
  let s = g.api.snapshot();
  assert.ok(s.shots.akimbo >= 2, 'akimbo fires, got ' + s.shots.akimbo);
  for (let i = 0; i < 9; i++) g.api.applyUpgrade('akimbo');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('crit');
  assert.strictEqual(g.api.snapshot().evolved.akimbo, undefined, 'duelist waits for the pick');
  g.api.giveXp(g.api.snapshot().xpNext);
  assert.strictEqual(g.api.snapshot().offers[0], 'evo:akimbo');
  assert.ok(g.api.chooseUpgrade(0));
  assert.strictEqual(g.api.snapshot().evolved.akimbo, 'duelist');
});

test('P2-1b HUD shows the current rank short (playtest visual)', () => {
  const g = boot({ seed: 73, record: true });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.setKills(150);
  g.steps(2);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('KILLS · LT'), 'rank shows in the HUD, got ' + JSON.stringify(labels.slice(0, 10)));
});

test('P1-4 boss waves never stack a second boss on a living one (playtest)', () => {
  const g = boot({ seed: 53 });
  deploy(g);
  g.api.setInvulnerable(true);
  g.api.spawnBoss('warlord');
  g.api.setTime(360);
  g.steps(4);
  const s = g.api.snapshot();
  assert.strictEqual(s.wave, 10, 'boss wave reached');
  const alive = s.enemies.filter((e) => e.boss);
  assert.strictEqual(alive.length, 1, 'no second boss while one lives, got ' + alive.length);
});

test('P2-8c the throw key is choosable and persists (playtest)', () => {
  const store = makeStore();
  const g = boot({ seed: 111, storage: store });
  assert.strictEqual(g.api.snapshot().settings.bombKey, 'e', 'E by default');
  assert.ok(g.api.clickButton('settings'));
  g.steps(1);
  assert.ok(g.api.clickButton('bomb-key'), 'key toggles to Q');
  assert.strictEqual(g.api.snapshot().settings.bombKey, 'q', 'Q selected');
  assert.ok(g.api.clickButton('back-settings'));
  const g2 = boot({ seed: 113, storage: store });
  assert.strictEqual(g2.api.snapshot().settings.bombKey, 'q', 'key choice persists');
  deploy(g2);
  g2.api.setInvulnerable(true);
  for (let i = 0; i < 5; i++) g2.api.spawnEnemy('grunt', 100 + (i % 5) * 10, (i % 5) * 10);
  g2.steps(1);
  g2.key('e');
  g2.steps(5);
  g2.key('e', false);
  assert.strictEqual(g2.api.snapshot().bombs, 0, 'E no longer throws');
  g2.key('q');
  g2.steps(5);
  g2.key('q', false);
  assert.ok(g2.api.snapshot().bombs > 0, 'Q throws');
});

test('P2-15d ops defeat names the failed mission (playtest)', () => {
  const g = boot({ seed: 191, record: true });
  deploy(g, { mode: 'ops' });
  for (let i = 0; i < 6; i++) g.api.spawnEnemy('tank', 25 + (i % 3) * 8, (i % 3) * 8);
  let over = false;
  for (let i = 0; i < 30 && !over; i++) {
    g.steps(30);
    over = g.api.snapshot().screen === 'over';
  }
  assert.ok(over, 'the op can fail');
  g.steps(2);
  const labels = g.texts.map((t) => t.text);
  assert.ok(labels.includes('MISSION FAILED'), 'defeat names the operation');
});
