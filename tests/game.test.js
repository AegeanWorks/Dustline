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
  g.steps(2);
  return g;
}

function enterSetup(g) {
  assert.ok(g.api.clickButton('play'), 'play button exists');
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'setup');
}

function deploy(g, opts) {
  if (g.api.snapshot().screen === 'menu') enterSetup(g);
  if (opts && opts.weapon) g.api.clickButton('weapon-' + opts.weapon);
  if (opts && opts.map) g.api.clickButton('map-' + opts.map);
  if (opts && opts.limit) g.api.clickButton('limit-' + opts.limit);
  if (opts && opts.difficulty) g.api.clickButton('difficulty-' + opts.difficulty);
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
    JSON.stringify(['play', 'armory', 'statistics', 'upgrades', 'settings', 'help'])
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
  for (const map of ['desert', 'frost', 'ash', 'jungle']) assert.ok(ids.includes('map-' + map), map);
  for (const limit of ['endless', '5', '10', '15']) assert.ok(ids.includes('limit-' + limit), limit);

  g.api.clickButton('weapon-dmr');
  g.api.clickButton('map-jungle');
  g.api.clickButton('limit-10');
  g.steps(1);
  assert.strictEqual(JSON.stringify(g.api.snapshot().setup), JSON.stringify({ weapon: 'dmr', map: 'jungle', limit: '10', difficulty: 'normal', mutators: [] }));
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
  g.api.giveXp(12);
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

  for (let i = 0; i < 8; i++) g.api.applyUpgrade('rifle');
  assert.strictEqual(g.api.snapshot().skills.rifle, 5, 'skills cap at level 5');
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
  g.steps(2);
  let s = g.api.snapshot();
  assert.strictEqual(s.wave, 5);
  assert.ok(s.boss);
  assert.strictEqual(s.boss.type, 'warlord');
  assert.ok(s.boss.maxHp > 1500, 'bosses are much tougher than mobs');

  g.api.killEnemies();
  g.steps(1);
  g.api.setTime(360);
  g.steps(2);
  s = g.api.snapshot();
  assert.strictEqual(s.wave, 10);
  assert.strictEqual(s.boss.type, 'overseer');

  g.api.killEnemies();
  g.steps(1);
  g.api.setTime(560);
  g.steps(2);
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
  g.steps(1);
  let s = g.api.snapshot();
  assert.strictEqual(s.settings.volume, 90);
  assert.strictEqual(s.settings.shake, false);
  assert.strictEqual(s.settings.damageNumbers, false);
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
  g.api.giveXp(700);
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
  const g = boot({ seed: 113 });
  assert.ok(g.api.clickButton('upgrades'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'upgrades');
  assert.ok(g.api.clickButton('back-upgrades'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'menu');
  assert.ok(g.api.clickButton('help'));
  g.steps(1);
  assert.strictEqual(g.api.snapshot().screen, 'help');
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
    'reroll', 'banish', 'forceChampion', 'setGhost', 'setBurrowed', 'forceBossAffix'
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
  g.steps(1);
  for (let i = 0; i < 20 && g.api.snapshot().screen === 'levelup'; i++) g.api.clickButton('upgrade-0');
  s = g.api.snapshot();
  assert.strictEqual(s.beacon, null);
  const secured = s.banked;
  assert.ok(secured > 0, 'touching the beacon secures shards');
  g.api.setUnbanked(100);
  g.api.hurt(999);
  g.steps(2);
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
  g.steps(1);
  g.api.setTime(1560);
  g.steps(2);
  s = g.api.snapshot();
  assert.strictEqual(s.wave, 40);
  assert.strictEqual(s.boss.type, 'leviathan');
  assert.strictEqual(s.boss.mega, true);
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
  g.steps(2);
  const s = g.api.snapshot();
  assert.strictEqual(s.contracts[0].done, true);
  assert.strictEqual(s.stats.contracts >= 1, true);
  assert.ok(s.unbanked > before, 'the contract paid risky shards');
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
  for (let i = 0; i < 4; i++) assert.ok(g.api.applyUpgrade('rifle'));
  assert.ok(!g.api.snapshot().evolved.rifle, 'a maxed weapon alone does not evolve');
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('bulletSpeed');
  let s = g.api.snapshot();
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
  g.steps(2);
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
  g.api.giveXp(12);
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
  g.steps(2);
  for (let i = 0; i < 20 && g.api.snapshot().screen === 'levelup'; i++) g.api.clickButton('upgrade-0');
  g.api.setInvulnerable(false);
  g.api.hurt(9999);
  g.steps(2);
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
  for (let i = 0; i < 10 && !fired; i++) {
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
  for (let i = 0; i < 4; i++) g.api.applyUpgrade('rail');
  assert.strictEqual(g.api.snapshot().evolved.rail, undefined);
  for (let i = 0; i < 3; i++) g.api.applyUpgrade('bulletSpeed');
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
    g.steps(1);
    g.api.setTime(time);
    g.steps(2);
    const s = g.api.snapshot();
    assert.ok(s.boss, 'a boss spawned at t=' + time);
    assert.strictEqual(s.boss.type, type, 't=' + time + ' should spawn ' + type);
  }
});
