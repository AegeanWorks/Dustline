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

function roomEncounterType(room) {
  if (room.kind === 'relay') return ['marksman', 'weaver', 'spitter', 'runner'];
  if (room.kind === 'market') return ['grunt', 'grunt', 'bomber', 'swarm'];
  if (room.kind === 'chapel') return ['leech', 'screamer', 'phantom', 'swarm'];
  return ['tank', 'runner', 'mortar', 'husk'];
}

function roomObjective(room) {
  if (room.kind === 'relay') return 'DISABLE THE RELAY';
  if (room.kind === 'market') return 'SECURE THE CACHE';
  if (room.kind === 'chapel') return 'BREAK THE RITUAL';
  return 'RECLAIM THE WORKSHOP';
}

function roomStageTypes(room, stage) {
  const types = roomEncounterType(room);
  if (stage === 0) return types.slice(0, 2);
  if (stage === 1) return types.slice(1);
  return [types[0], types[types.length - 1]];
}

function spawnRoomStage(room, state) {
  const types = roomStageTypes(room, state.stage);
  const radius = Math.min(room.w, room.h) * (state.stage === 0 ? 0.22 : 0.28);
  for (let i = 0; i < types.length; i++) {
    const a = (i / types.length) * TAU + room.seed * 3 + state.stage * 0.7;
    const e = spawnEnemyAt(types[i], room.x + Math.cos(a) * radius, room.y + Math.sin(a) * radius);
    if (e) {
      e.roomId = room.id;
      e.roomStage = state.stage;
    }
  }
  state.state = 'active';
  state.objective = roomObjective(room);
  state.stageStarted = G.time;
}

function updateRooms() {
  if (!G) return;
  const room = roomAtPoint(G.player.x, G.player.y, 10);
  G.roomFocus = room ? room.id : null;
  if (!room) return;
  let state = G.rooms[room.id];
  if (!state) {
    state = G.rooms[room.id] = {
      entered: G.time,
      state: 'breached',
      stage: 0,
      stages: 3,
      cleared: false,
      reward: 0,
      objective: roomObjective(room),
      stageStarted: G.time
    };
    spawnRoomStage(room, state);
    G.banner = room.kind.toUpperCase() + ' ROOM';
    G.bannerSub = state.objective;
    G.bannerT = 2.4;
    G.news = 'Room breach: clear the first security ring.';
    sfx.wave();
    return;
  }
  if (state.cleared) return;
  const remaining = G.enemies.some((e) => !e.dead && e.roomId === room.id);
  if (remaining) return;
  if (state.stage + 1 < state.stages) {
    state.stage++;
    spawnRoomStage(room, state);
    G.banner = 'ROOM WAVE ' + (state.stage + 1) + '/' + state.stages;
    G.bannerSub = state.objective;
    G.bannerT = 1.8;
    G.news = 'The structure shifts. Hostiles incoming.';
    return;
  }
  state.state = 'cleared';
  state.cleared = true;
  state.reward = 24 + state.stage * 8;
  addUnbanked(state.reward);
  spawnFloater(room.x, room.y - room.h * 0.25, '+' + state.reward + ' SHARDS', '#63dcc0', 14);
  G.banner = 'ROOM SECURED';
  G.bannerSub = room.kind.toUpperCase() + ' · +' + state.reward + ' SHARDS';
  G.bannerT = 2.4;
  G.news = 'Structure secured. Salvage route unlocked.';
  sfx.upgrade();
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

const DEFAULT_SETTINGS = { volume: 70, shake: true, damageNumbers: true, outlines: false, flashes: true, bombMode: 'manual' };
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
  embers: { name: 'EMBER VENTS', color: 'rgba(255,110,60,0.20)', burn: 5, burnLabel: 'BURN', burnColor: '#ff8a5c' },
  gas: { name: 'TOXIC GAS', color: 'rgba(130,220,100,0.22)', burn: 4, burnLabel: 'POISON', burnColor: '#9be59b' },
  tar: { name: 'TAR PITS', color: 'rgba(48,56,50,0.30)', playerSpeed: 0.55, enemySpeed: 0.85 },
  vines: { name: 'CHOKE VINES', color: 'rgba(80,140,70,0.22)', enemySpeed: 0.72 },
  shards: { name: 'GLASS FALLOUT', color: 'rgba(190,230,220,0.24)', playerSpeed: 0.72, burn: 3, burnLabel: 'CUT', burnColor: '#bfe6e0' }
};

const AMBIENCE = {
  desert: { mode: 'dust', color: 'rgba(110,88,56,0.5)', count: 26, speed: 12 },
  frost: { mode: 'snow', color: 'rgba(250,255,255,0.9)', count: 34, speed: 20 },
  ash: { mode: 'ember', color: 'rgba(255,150,80,0.62)', count: 24, speed: 14 },
  jungle: { mode: 'firefly', color: 'rgba(210,255,140,0.6)', count: 22, speed: 6 },
  crater: { mode: 'dust', color: 'rgba(160,120,180,0.45)', count: 26, speed: 10 },
  toxic: { mode: 'firefly', color: 'rgba(150,255,170,0.55)', count: 26, speed: 5 },
  glass: { mode: 'dust', color: 'rgba(200,240,230,0.42)', count: 28, speed: 9 }
};

const MUTATORS = [
  { id: 'glass', name: 'GLASS CANNON', blurb: '+40% damage dealt, +60% taken', shard: 1.2, color: '#ff8a8a' },
  { id: 'swarm', name: 'SWARM', blurb: '+50% spawns, -15% mob health', shard: 1.25, color: '#c9a8ff' },
  { id: 'elite', name: 'ELITE HUNT', blurb: 'Triple champion rate', shard: 1.3, color: '#ffd27a' },
  { id: 'fog', name: 'FOG', blurb: 'Thick fog always', shard: 1.25, color: '#9fd8ff' },
  { id: 'vampiric', name: 'VAMPIRIC HORDE', blurb: 'Enemies steal life', shard: 1.3, color: '#ff7f8f' },
  { id: 'bounty', name: 'BOUNTY', blurb: 'Hunter every 45s', shard: 1.35, color: '#e2563f' }
];

const MUTATOR_ORDER = ['glass', 'swarm', 'elite', 'fog', 'vampiric', 'bounty'];

const STREAK_TIERS = [
  { kills: 10, name: 'KILLING SPREE', color: '#ffd27a' },
  { kills: 25, name: 'RAMPAGE', color: '#ffcf5c' },
  { kills: 50, name: 'WAR MACHINE', color: '#ff8a5c' },
  { kills: 100, name: 'UNSTOPPABLE', color: '#ff6a4a' },
  { kills: 250, name: 'ONE MAN ARMY', color: '#ff4ad2' },
  { kills: 500, name: 'LEGENDARY', color: '#ffe08a' }
];

const STREAK_REWARDS = [
  { at: 15, id: 'supply', name: 'SUPPLY DROP', color: '#63dcc0' },
  { at: 30, id: 'airstrike', name: 'AIRSTRIKE', color: '#ffcf5c' },
  { at: 60, id: 'heli', name: 'ATTACK HELICOPTER', color: '#9fd8ff' },
  { at: 120, id: 'missile', name: 'MISSILE BARRAGE', color: '#ff8a5c' }
];

const RANKS = [
  { id: 'private', name: 'PRIVATE', short: 'PVT', kills: 0, blurb: 'Fresh boots. Earn 25 kills for Corporal.' },
  { id: 'corporal', name: 'CORPORAL', short: 'CPL', kills: 25, blurb: '+1 REROLL' },
  { id: 'sergeant', name: 'SERGEANT', short: 'SGT', kills: 75, blurb: 'SUPPLY DROP · +2 MEDKITS' },
  { id: 'lieutenant', name: 'LIEUTENANT', short: 'LT', kills: 150, blurb: '+50 SHARDS' },
  { id: 'captain', name: 'CAPTAIN', short: 'CPT', kills: 300, blurb: '+1 REROLL · +1 BANISH' },
  { id: 'major', name: 'MAJOR', short: 'MAJ', kills: 500, blurb: '+100 SHARDS' },
  { id: 'colonel', name: 'COLONEL', short: 'COL', kills: 750, blurb: '+2 REROLLS' },
  { id: 'general', name: 'GENERAL', short: 'GEN', kills: 1000, blurb: '+200 SHARDS · LIVING LEGEND' }
];

const MUTATIONS = [
  { id: 'none', name: 'STANDARD', blurb: 'No mutation', color: '#8f9ba4' },
  { id: 'explosive', name: 'EXPLOSIVE BLOOD', blurb: 'Death blast', color: '#ff8a5c' },
  { id: 'berserker', name: 'BERSERKER', blurb: '+45% dmg low HP', color: '#ff6a4a' },
  { id: 'overclock', name: 'OVERCLOCK', blurb: '+20% fire rate', color: '#ffe08a' },
  { id: 'veteran', name: 'WAR VETERAN', blurb: '+10% dmg per boss', color: '#63dcc0' }
];

const MUTATION_ORDER = ['none', 'explosive', 'berserker', 'overclock', 'veteran'];

const CAMO = {
  desert: '#8f7a4a',
  frost: '#6a7f8c',
  ash: '#6a4a3a',
  jungle: '#4a6a3a',
  crater: '#6a5a6a',
  toxic: '#5a7a3a',
  glass: '#5f7a72'
};

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
  { id: 'daily_win', name: 'DAILY ACE', desc: 'Win a daily challenge', goal: (s) => s.dailyWins || 0, target: 1, reward: 80 },
  { id: 'legend', name: 'LEGEND', desc: 'Kill 500 enemies in one run', goal: (s) => s.bestKills || 0, target: 500, reward: 100 },
  { id: 'high_score', name: 'HIGH SCORE', desc: 'Score 10,000 in one run', goal: (s) => s.bestScore || 0, target: 10000, reward: 80 },
  { id: 'secret_seeker', name: 'SECRET SEEKER', desc: 'Discover 3 secret combos', goal: (s) => s.secrets || 0, target: 3, reward: 70 }
];

function achievementUnlocked() {
  return ACHIEVEMENTS.filter((a) => save.achievements && save.achievements[a.id]).length;
}

function achievementStats() {
  const live = G && screen === 'play';
  return {
    totalKills: save.totalKills + (live ? G.kills : 0),
    bestTime: Math.max(save.bestTime, live ? G.time : 0),
    bestKills: Math.max(save.bestKills || 0, live ? G.kills : 0),
    bestScore: Math.max(save.bestScore || 0, live ? G.score || 0 : 0),
    secrets: (save.secrets || []).length,
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

const META_ORDER = ['power', 'armor', 'speed', 'greed', 'magnet', 'luck', 'rig', 'velocity', 'harvest', 'resolve'];
const META = {
  power: { name: 'BALLISTICS', desc: '+6% damage per rank', max: 5, cost: (n) => 60 + 45 * n },
  armor: { name: 'PLATE CARRIER', desc: '+10 max health per rank', max: 5, cost: (n) => 60 + 45 * n },
  speed: { name: 'RUNNING SHOES', desc: '+4% move speed per rank', max: 5, cost: (n) => 55 + 40 * n },
  greed: { name: 'SCAVENGER KIT', desc: '+10% XP per rank', max: 5, cost: (n) => 70 + 50 * n },
  magnet: { name: 'POWER MAGNET', desc: '+12 pickup radius per rank', max: 5, cost: (n) => 50 + 35 * n },
  luck: { name: 'LOADED DICE', desc: '+1 reroll and better drops', max: 3, cost: (n) => 110 + 70 * n },
  rig: { name: 'LOADOUT RIG', desc: '+1 offense and defense slot per rank', max: 2, cost: (n) => 150 + 100 * n },
  velocity: { name: 'HYPER VELOCITY', desc: '+5% bullet speed per rank', max: 3, cost: (n) => 90 + 70 * n },
  harvest: { name: 'SALVAGE RIG', desc: '+8% shard gain per rank', max: 3, cost: (n) => 100 + 80 * n },
  resolve: { name: 'COMBAT STIM', desc: '-3% damage taken per rank', max: 3, cost: (n) => 120 + 90 * n }
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
    bestScore: 0,
    secrets: [],
    shieldSaves: 0,
    dailyBest: {},
    achievements: {},
    boardBests: [],
    friends: [],
    rivalsBeaten: [],
    deviceId: newDeviceId(),
    lastSeed: 20261029,
    killsByType: {},
    meta: { power: 0, armor: 0, speed: 0, greed: 0, magnet: 0, luck: 0, rig: 0, velocity: 0, harvest: 0, resolve: 0 },
    unlocked: { weapons: ['ak'], maps: ['desert', 'frost', 'ash'] },
    cosmetics: { skins: ['ranger'], skin: 'ranger', vip: { premium: false, items: [] } }
  };
}

let deviceSeq = 0;
function newDeviceId() {
  deviceSeq = (deviceSeq + 1) % 4294967295;
  const raw = (Date.now() % 4294967295) ^ (deviceSeq * 2654435769);
  return ('00000000' + (raw >>> 0).toString(16)).slice(-8);
}

function cleanBoardBests(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const s = Math.round(Number(e.s));
    const k = Math.max(0, Math.round(Number(e.k)));
    const t = Math.max(0, Number(e.t));
    if (!Number.isFinite(s) || s < 0 || !Number.isFinite(k) || !Number.isFinite(t)) continue;
    const d = Math.max(0, Math.round(Number(e.d) || 0));
    if (!Number.isFinite(d)) continue;
    out.push({
      s,
      k,
      t,
      m: typeof e.m === 'string' && e.m ? e.m.slice(0, 24) : 'desert',
      win: !!e.win,
      d
    });
  }
  out.sort((a, b) => b.s - a.s);
  return out.slice(0, 25);
}

function cleanFriends(raw, ownCode) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = Object.create(null);
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue;
    const code = String(f.code || '').toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(code) || code === ownCode || seen[code]) continue;
    seen[code] = true;
    out.push({
      name: String(f.name || ('ALLY-' + code.slice(0, 4).toUpperCase())).slice(0, 16),
      code,
      best: Number.isFinite(Number(f.best)) && Number(f.best) >= 0 ? Math.round(Number(f.best)) : null,
      ts: Math.max(0, Math.round(Number(f.ts) || 0))
    });
  }
  return out.slice(0, 12);
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
  merged.unlocked = Object.assign({ weapons: ['ak'], maps: ['desert', 'frost', 'ash'] }, raw.unlocked || {});
  if (!Array.isArray(merged.unlocked.maps)) merged.unlocked.maps = [];
  for (const id of ['desert', 'frost', 'ash']) if (merged.unlocked.maps.indexOf(id) < 0) merged.unlocked.maps.push(id);
  merged.cosmetics = Object.assign({ skins: ['ranger'], skin: 'ranger', vip: { premium: false, items: [] } }, raw.cosmetics || {});
  if (!Array.isArray(merged.cosmetics.skins) || !merged.cosmetics.skins.length) merged.cosmetics.skins = ['ranger'];
  if (typeof merged.cosmetics.skin !== 'string' || !merged.cosmetics.skin) merged.cosmetics.skin = 'ranger';
  if (!merged.cosmetics.skins.includes(merged.cosmetics.skin)) merged.cosmetics.skin = merged.cosmetics.skins[0];
  merged.cosmetics.vip = Object.assign({ premium: false, items: [] }, merged.cosmetics.vip || {});
  if (!Array.isArray(merged.cosmetics.vip.items)) merged.cosmetics.vip.items = [];
  for (const key of ['shards', 'totalKills', 'runs', 'wins', 'bossKills', 'damageDealt', 'jackpots', 'nearMisses', 'hunters', 'contracts', 'bankedTotal', 'lostTotal', 'champions', 'chests', 'megaKills', 'rushClears', 'shieldSaves']) {
    merged[key] = Math.max(0, Math.round(Number(merged[key]) || 0));
  }
  for (const key of ['bestTime', 'bestKills', 'rushBest', 'bestScore']) merged[key] = Math.max(0, Number(merged[key]) || 0);
  merged.bestWave = Math.max(1, Math.round(Number(merged.bestWave) || 1));
  merged.secrets = Array.isArray(raw.secrets)
    ? raw.secrets.filter((id) => typeof id === 'string').slice(0, 24)
    : [];
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
  merged.deviceId = typeof raw.deviceId === 'string' && /^[0-9a-f]{8}$/i.test(raw.deviceId)
    ? raw.deviceId.toLowerCase()
    : newDeviceId();
  merged.boardBests = cleanBoardBests(raw.boardBests);
  if (!Array.isArray(merged.rivalsBeaten)) merged.rivalsBeaten = [];
  merged.friends = cleanFriends(raw.friends, merged.deviceId);
  return merged;
}

function loadSettings() {
  const raw = readStore(SETTINGS_KEY);
  const merged = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    if (Number.isFinite(raw.volume)) merged.volume = clamp(Math.round(raw.volume), 0, 100);
    if (typeof raw.shake === 'boolean') merged.shake = raw.shake;
    if (typeof raw.damageNumbers === 'boolean') merged.damageNumbers = raw.damageNumbers;
    if (typeof raw.outlines === 'boolean') merged.outlines = raw.outlines;
    if (typeof raw.flashes === 'boolean') merged.flashes = raw.flashes;
    if (raw.bombMode === 'auto' || raw.bombMode === 'manual') merged.bombMode = raw.bombMode;
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
let skillPage = 'grid';
let boardTab = 'global';
let shopTab = 0;
let boardAddMode = false;
let boardCode = '';
let boardMsg = '';
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
  arc() { tone('sine', 1600, 2800, 0.05, 0.08); noiseSweep(0.05, 0.1, 2600, 900, 'bandpass'); },
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
  level() {
    pad([523, 659, 784, 1046, 1318], 0.1, 0.34, 0.06);
    tone('sine', 1046, 1568, 0.05, 0.24);
    noiseShot(0.05, 0.18, 2600, 1.1);
  },
  upgrade() { pad([392, 587, 784], 0.08, 0.24, 0.06); },
  wave() { pad([330, 440, 587], 0.07, 0.3, 0.1); },
  milestone(step) {
    const base = 392 + Math.min(6, step || 1) * 44;
    pad([base, base * 1.25, base * 1.5, base * 2], 0.11, 0.42, 0.08);
    noiseShot(0.08, 0.25, 1500, 0.6);
  },
  reward() {
    pad([523, 784, 1046, 1318], 0.1, 0.4, 0.07);
    tone('sawtooth', 220, 880, 0.06, 0.3);
  },
  lastStand() {
    tone('sawtooth', 90, 48, 0.16, 1.0);
    tone('square', 400, 180, 0.07, 0.6);
    noiseSweep(0.2, 0.8, 900, 90, 'lowpass');
  },
  click() { tone('square', 660, 520, 0.03, 0.03); },
  swap() { tone('square', 500, 340, 0.03, 0.03); },
  denied() { tone('square', 200, 140, 0.04, 0.09); },
  victory() { pad([523, 659, 784, 1046, 1318], 0.1, 0.5, 0.11); },
  over() { tone('sawtooth', 220, 55, 0.12, 0.9); noiseSweep(0.18, 0.6, 420, 60, 'lowpass'); }
};

const SKILL_MAX = 10;

const SKILL_ORDER = [
  'rifle', 'smg', 'shotgun', 'dmr', 'rail', 'akimbo', 'blades', 'grenade', 'turret', 'aura',
  'squad', 'speed', 'vitality', 'aegis', 'magnet', 'damage',
  'bulletSpeed', 'lifesteal', 'dashPower', 'crit', 'ricochet'
];

const SKILLS = {
  rifle: {
    name: 'AK-47',
    short: 'AK',
    max: SKILL_MAX,
    kind: 'weapon',
    desc: 'Workhorse auto rifle with steady damage.',
    color: '#ffd27a'
  },
  smg: {
    name: 'SMG-45',
    short: 'SMG',
    max: SKILL_MAX,
    kind: 'weapon',
    desc: 'Very fast, low-damage spray.',
    color: '#ffcf5c'
  },
  shotgun: {
    name: 'SPAS-12',
    short: 'SG',
    max: SKILL_MAX,
    kind: 'weapon',
    desc: 'Point-blank pellet spread.',
    color: '#ffb066'
  },
  dmr: {
    name: 'DMR-308',
    short: 'DMR',
    max: SKILL_MAX,
    kind: 'weapon',
    desc: 'Slow, heavy, shots pierce the line.',
    color: '#ffeab0'
  },
  rail: {
    name: 'RAILGUN',
    short: 'RG',
    max: SKILL_MAX,
    kind: 'weapon',
    desc: 'Slow charge, punches through whole lines.',
    color: '#9fe8ff'
  },
  akimbo: {
    name: 'DUAL BERETTAS',
    short: 'AK',
    max: SKILL_MAX,
    kind: 'weapon',
    desc: 'Twin sidearms, alternating volleys.',
    color: '#ffd9a0'
  },
  blades: {
    name: 'Bayonet Blades',
    short: 'BL',
    max: SKILL_MAX,
    kind: 'active',
    desc: 'Orbiting knives shred nearby enemies.',
    color: '#c9d8ff'
  },
  grenade: {
    name: 'Frag Grenade',
    short: 'FR',
    max: SKILL_MAX,
    kind: 'active',
    desc: 'Lobs explosives into the horde.',
    color: '#ff8a5c'
  },
  turret: {
    name: 'Sentry Turret',
    short: 'TR',
    max: SKILL_MAX,
    kind: 'active',
    desc: 'Deploys a gun that fires on its own.',
    color: '#b8c6d0'
  },
  aura: {
    name: 'Ember Aura',
    short: 'AU',
    max: SKILL_MAX,
    kind: 'active',
    desc: 'Burns every enemy close to you.',
    color: '#ff9f6a'
  },
  squad: {
    name: 'Recruit Soldier',
    short: 'SQ',
    max: SKILL_MAX,
    kind: 'active',
    desc: 'A squadmate joins and fires your weapon family for you.',
    color: '#7fd0ff'
  },
  speed: {
    name: 'Combat Boots',
    short: 'SP',
    max: SKILL_MAX,
    kind: 'passive',
    desc: '+8% movement speed per level.',
    color: '#9be59b'
  },
  vitality: {
    name: 'Body Armor',
    short: 'HP',
    max: SKILL_MAX,
    kind: 'passive',
    desc: '+25 max health and heals 25.',
    color: '#7fe0a0'
  },
  aegis: {
    name: 'Aegis Field',
    short: 'AEG',
    max: SKILL_MAX,
    kind: 'passive',
    desc: 'Regenerating shield blocks one hit per charge.',
    color: '#9fd8ff'
  },
  magnet: {
    name: 'Field Magnet',
    short: 'MG',
    max: SKILL_MAX,
    kind: 'passive',
    desc: '+45 pickup radius per level.',
    color: '#9fe8e0'
  },
  damage: {
    name: 'Hollow Points',
    short: 'DMG',
    max: SKILL_MAX,
    kind: 'passive',
    desc: '+12% damage from every source.',
    color: '#ff9f9f'
  },
  bulletSpeed: {
    name: 'Match Ammo',
    short: 'VEL',
    max: SKILL_MAX,
    kind: 'passive',
    desc: '+10% bullet speed and range.',
    color: '#ffe08a'
  },
  lifesteal: {
    name: 'Blood Leech',
    short: 'LS',
    max: SKILL_MAX,
    kind: 'passive',
    desc: 'Heal on kill for a share of damage.',
    color: '#ff7f8f'
  },
  dashPower: {
    name: 'Shock Boots',
    short: 'DSH',
    max: SKILL_MAX,
    kind: 'passive',
    desc: 'Dash crushes enemies it passes through.',
    color: '#9fd8ff'
  },
  crit: {
    name: 'Killer Instinct',
    short: 'CRT',
    max: SKILL_MAX,
    kind: 'passive',
    desc: '+7% critical chance for double damage.',
    color: '#ff8ad8'
  },
  ricochet: {
    name: 'Ricochet Rounds',
    short: 'RIC',
    max: SKILL_MAX,
    kind: 'passive',
    desc: 'Bullets reflect into a nearby hostile after a hit.',
    color: '#7fe8ff'
  }
};

const SKILL_DETAILS = {
  rifle: 'A steady mid-range rifle. Every level adds damage and shortens the trigger interval. Match Ammo at level 3 unlocks the Ripper.',
  smg: 'A close-range spray weapon with the fastest trigger in the game. Pair it with Killer Instinct to unlock Storm.',
  shotgun: 'A point-blank shredder. Extra levels add pellets and damage; Hollow Points unlocks the Breaker.',
  dmr: 'A slow precision rifle that punches through a line. Blood Leech at level 3 unlocks the Reaper.',
  rail: 'A charge rifle that skewers whole columns. Match Ammo at level 3 unlocks the infinite-pierce Lancer.',
  akimbo: 'Twin Berettas that alternate volleys. Killer Instinct at level 3 unlocks the 4-round Duelist.',
  blades: 'Two bayonet blades orbit you and shred anything they touch. Shock Boots at level 3 unlocks Tempest.',
  grenade: 'Lobs a frag at the thickest cluster. Hollow Points at level 3 unlocks Cluster, which throws two.',
  turret: 'Deploys a temporary sentry that fires on its own. Killer Instinct at level 3 unlocks Overwatch.',
  aura: 'A burning ring around you that damages every hostile inside. Body Armor at level 3 unlocks Solar Crown.',
  squad: 'Adds a rifleman who follows your formation and fires independently. More levels add damage and rate.',
  speed: 'Raises your base movement speed, making hazard crossings and kiting safer.',
  vitality: 'Raises maximum health and immediately heals the same amount, so it is never a wasted pick.',
  aegis: 'Adds a regenerating shield charge. Each charge absorbs one whole hit and protects your kill streak.',
  magnet: 'Pulls XP gems, medkits, chips and caches from farther away so you can keep moving.',
  damage: 'Multiplies every damage source: weapons, blades, grenades, turrets and the ember aura.',
  bulletSpeed: 'Makes bullets faster and extends their reach, which helps against fast and distant targets.',
  lifesteal: 'Heals a share of every hit you deal. The Vampire combo doubles the rate.',
  dashPower: 'Turns your dash into a damaging pass that can crush a whole line of mobs. Every 3 levels adds a dash charge (up to 4).',
  crit: 'Adds critical chance; crits deal double damage and feed the crit surge feedback.',
  ricochet: 'After a bullet hits, it reflects toward the nearest hostile it has not hit yet. Extra levels add bounces and range.'
};

function skillRankTotal() {
  return SKILL_ORDER.reduce((sum, id) => sum + (G ? G.skills[id] : 0), 0);
}

function ricochetBounces(level) {
  const base = level <= 0 ? 0 : 1 + Math.floor(level / 4);
  return base + (hasEvolution('ricochet') ? 2 : 0);
}

function skillStatLine(id, lvl) {
  const cur = Math.max(1, lvl);
  const next = Math.min(SKILL_MAX, lvl + 1);
  const atMax = lvl >= SKILL_MAX;
  const range = (a, b) => (atMax ? String(a) : a + ' → ' + b);
  if (id === 'rifle') return 'DMG ' + range(14 + 5 * (cur - 1), 14 + 5 * (next - 1)) + ' · CD ' + range(Math.max(0.16, 0.55 - 0.055 * cur).toFixed(2), Math.max(0.16, 0.55 - 0.055 * next).toFixed(2)) + 's';
  if (id === 'smg') return 'DMG ' + range(6 + 2.2 * (cur - 1), 6 + 2.2 * (next - 1)) + ' · CD ' + range((0.19 - 0.012 * cur).toFixed(2), (0.19 - 0.012 * next).toFixed(2)) + 's';
  if (id === 'shotgun') return 'DMG ' + range(7 + 2 * cur, 7 + 2 * next) + ' · PELLETS ' + range(2 + cur, 2 + next);
  if (id === 'dmr') return 'DMG ' + range(34 + 14 * (cur - 1), 34 + 14 * (next - 1)) + ' · PIERCE ' + range(2 + Math.floor(cur / 2), 2 + Math.floor(next / 2));
  if (id === 'rail') return 'DMG ' + range(46 + 20 * (cur - 1), 46 + 20 * (next - 1)) + ' · PIERCE ' + range(4 + Math.floor(cur / 2), 4 + Math.floor(next / 2));
  if (id === 'akimbo') return 'DMG ' + range(5 + 1.6 * (cur - 1), 5 + 1.6 * (next - 1)) + ' · CD ' + range(Math.max(0.14, 0.3 - 0.014 * cur).toFixed(2), Math.max(0.14, 0.3 - 0.014 * next).toFixed(2)) + 's · TWIN';
  if (id === 'blades') return 'BLADES ' + range(cur + 1, next + 1) + ' · DMG ' + range(8 + 6 * cur, 8 + 6 * next);
  if (id === 'grenade') return 'DMG ' + range(30 + 18 * cur, 30 + 18 * next) + ' · RADIUS ' + range(78 + 6 * cur, 78 + 6 * next);
  if (id === 'turret') return 'DMG ' + range(9 + 4 * cur, 9 + 4 * next) + ' · LIFE ' + range((10 + 1.5 * cur).toFixed(1), (10 + 1.5 * next).toFixed(1)) + 's';
  if (id === 'aura') return 'DMG ' + range(4 + 3 * cur, 4 + 3 * next) + ' · RADIUS ' + range(72 + 9 * cur, 72 + 9 * next);
  if (id === 'squad') return 'DMG ' + range(8 + 3 * cur, 8 + 3 * next) + ' · RATE ' + range((0.9 - 0.05 * cur).toFixed(2), (0.9 - 0.05 * next).toFixed(2)) + 's';
  if (id === 'speed') return 'MOVE +' + range(8 * cur, 8 * next) + '%';
  if (id === 'vitality') return 'MAX HP +' + range(25 * cur, 25 * next);
  if (id === 'aegis') return 'CHARGES ' + range(cur, next) + ' · RECHARGE ' + range(Math.max(4, 9 - 0.8 * cur).toFixed(1), Math.max(4, 9 - 0.8 * next).toFixed(1)) + 's';
  if (id === 'magnet') return 'PICKUP +' + range(45 * cur, 45 * next);
  if (id === 'damage') return 'DAMAGE +' + range(12 * cur, 12 * next) + '%';
  if (id === 'bulletSpeed') return 'BULLET SPEED +' + range(10 * cur, 10 * next) + '%';
  if (id === 'lifesteal') return 'LEECH ' + range((1.5 * cur).toFixed(1), (1.5 * next).toFixed(1)) + '%';
  if (id === 'dashPower') return 'DASH DMG ' + range(10 + 8 * cur, 10 + 8 * next) + ' · CHARGES ' + range(1 + Math.floor(cur / 3), 1 + Math.floor(next / 3));
  if (id === 'crit') return 'CRIT +' + range(7 * cur, 7 * next) + '%';
  if (id === 'ricochet') return 'BOUNCES ' + range(ricochetBounces(cur), ricochetBounces(next)) + ' · RANGE ' + range(220 + 12 * cur, 220 + 12 * next);
  return 'LEVEL ' + cur + ' / ' + SKILL_MAX;
}

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
  },
  {
    id: 'executioner',
    name: 'EXECUTIONER',
    needs: ['dmr', 'crit'],
    desc: '+5% crit chance',
    color: '#ff8ad8',
    secret: true
  },
  {
    id: 'singularity',
    name: 'SINGULARITY',
    needs: ['aura', 'magnet'],
    desc: '+20% aura radius',
    color: '#c9a8ff',
    secret: true
  },
  {
    id: 'gunner',
    name: 'GUNNER',
    needs: ['squad', 'bulletSpeed'],
    desc: 'Squad fires 25% faster',
    color: '#7fd0ff',
    secret: true
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

const LORE = [
  {
    id: 'dustline',
    title: 'THE DUSTLINE',
    tag: 'SETTING',
    text: 'A century after the sky burned, the dust never settled. NetWatch calls it a quarantine; the people still here call it home. Every run is a salvage shift: stay mobile, recover what the dead left, and extract before the horde closes.'
  },
  {
    id: 'desert',
    title: 'DUST BASIN',
    tag: 'FIELD NOTE',
    map: 'desert',
    note: 'The first quarantine line. The convoys are still out there under the sand.',
    text: 'Dry riverbeds swallowed the evacuation convoys whole; their cargo still glints under the sand. Crawlers nest in the wrecks, and the wind carries voices that are only static.'
  },
  {
    id: 'frost',
    title: 'WHITEOUT RIDGE',
    tag: 'FIELD NOTE',
    map: 'frost',
    note: 'Cold keeps the dead fresh. Keep the squad between you and the ridge.',
    text: 'The ridge was a weather station before the sky broke. Now the cold preserves everything: old patrols, old orders, old mistakes. Move fast on the ice and keep the squad between you and the frozen dead.'
  },
  {
    id: 'ash',
    title: 'ASHFALL',
    tag: 'FIELD NOTE',
    map: 'ash',
    note: 'The city never stopped burning. Ember vents open without warning.',
    text: 'The burning city never stopped burning. Ember vents open without warning and the ash hides tripwires and graves alike. NetWatch marks it a dead sector; the salvage is anything but.'
  },
  {
    id: 'jungle',
    title: 'GREENFALL',
    tag: 'FIELD NOTE',
    map: 'jungle',
    note: 'The jungle ate the labs first. What grew here learned to hunt in packs.',
    text: 'The jungle ate the labs first. Vines that used to be specimens now pull the horde along the old service roads. Whatever grew here learned to hunt in packs.'
  },
  {
    id: 'crater',
    title: 'CRATER FIELD',
    tag: 'FIELD NOTE',
    map: 'crater',
    note: 'Glass, tar and crater rims. Nothing here is level, and everything is listening.',
    text: 'The impact that ended the first wave left a field of glass and tar. Nothing here is level, and everything here is listening. The crater rims make good ground, if you can reach them.'
  },
  {
    id: 'toxic',
    title: 'DEAD ZONE',
    tag: 'FIELD NOTE',
    map: 'toxic',
    note: 'The last exclusion ring. NetWatch sends nobody in. You are how they check.',
    text: 'The last exclusion ring. The air is corrosive and the locals stopped counting the dead long ago. NetWatch sends nobody in. You are how they check.'
  },
  {
    id: 'glass',
    title: 'GLASS WASTES',
    tag: 'FIELD NOTE',
    map: 'glass',
    note: 'The impact glass still sings underfoot. Every step is a cut waiting to happen.',
    text: 'The first warhead turned the basin to glass. Now the dunes ring like broken bottles and the shard fields open under your boots. The horde does not mind the cuts. You will.'
  },
  {
    id: 'signal',
    title: 'THE SIGNAL',
    tag: 'NETWATCH',
    text: 'Every extraction beacon carries the same burst: a NetWatch authentication code, a coordinate, and a countdown that never reaches zero. Someone is still transmitting. No one has found the transmitter.'
  }
];

const SYSTEMS_ROWS = [
  { title: 'RANKS', text: 'Kills promote PVT to GEN. Every rank pays: rerolls, medkits, shards.' },
  { title: 'OPS', text: '10:00 operation. Beacon at 9:30. Extract early for +200 or survive.' },
  { title: 'RIVALS', text: 'Global and TR boards are seeded with house rivals. Beat one: +25 shards.' },
  { title: 'SURGES + STORMS', text: 'A surge ring assaults every 200s. Each map rolls its own storm.' },
  { title: 'SHOP + PICKUPS', text: 'Dice roll rerolls or banishes. Radios call the plane (T). Skins are looks only.' }
];

const WEAPONS = {
  ak: { name: 'AK-47', skill: 'rifle', blurb: 'Balanced auto rifle', color: '#ffd27a' },
  smg: { name: 'SMG-45', skill: 'smg', blurb: 'Fast and frantic', color: '#ffcf5c' },
  spas: { name: 'SPAS-12', skill: 'shotgun', blurb: 'Close-range shredder', color: '#ffb066' },
  dmr: { name: 'DMR-308', skill: 'dmr', blurb: 'Piercing precision', color: '#ffeab0' },
  rail: { name: 'RAILGUN', skill: 'rail', blurb: 'Punches through lines', color: '#9fe8ff' },
  beretta: { name: 'AKIMBO', skill: 'akimbo', blurb: 'Dual Berettas, twin volleys', color: '#ffd9a0' }
};

const WEAPON_ORDER = ['ak', 'smg', 'spas', 'dmr', 'rail', 'beretta'];

const SKINS = [
  { id: 'ranger', name: 'RANGER TEAL', color: '#7fe0a0', price: 0, blurb: 'Standard-issue fatigues' },
  { id: 'crimson', name: 'CRIMSON VETERAN', color: '#ff6a5c', price: 500, blurb: 'Blooded in the basin' },
  { id: 'gold', name: 'GOLDEN STANDARD', color: '#ffd27a', price: 1500, blurb: 'Shines for the horde' },
  { id: 'void', name: 'VOID WALKER', color: '#b78cff', price: 3000, blurb: 'Wears the dark between waves' }
];

const VIP_PACKS = [
  { id: 'vip-badge', name: 'VIP BADGE', usd: '$4.99', blurb: 'Golden nameplate and VIP lounge' },
  { id: 'vip-neon', name: 'NEON OVERDRIVE', usd: '$9.99', blurb: 'Neon trail plus two exclusive skins' },
  { id: 'vip-general', name: 'GENERAL BUNDLE', usd: '$19.99', blurb: 'Everything plus the General rank frame' }
];

const MAPS = {
  desert: {
    name: 'DUST BASIN',
    blurb: 'Open sand and stone',
    sky: ['#c7a878', '#ab8f66', '#847050'],
    accent: '#d8b877',
    hazard: 'quicksand',
    props: { building: '#93744f', rock: '#9a8d7a', tree: '#5f7038' }
  },
  frost: {
    name: 'WHITEOUT RIDGE',
    blurb: 'Frozen huts, pines',
    sky: ['#d8e2ea', '#b3bfcb', '#8e9ca9'],
    accent: '#9fd8ff',
    hazard: 'ice',
    props: { building: '#6e7885', rock: '#a7b4c0', tree: '#37503f' }
  },
  ash: {
    name: 'ASHFALL',
    blurb: 'Burnt ruins, basalt',
    sky: ['#6b564b', '#4e4039', '#33291f'],
    accent: '#ff8a5c',
    hazard: 'embers',
    props: { building: '#45342b', rock: '#57504a', tree: '#2f2a26' }
  },
  jungle: {
    name: 'GREENFALL',
    blurb: 'Temples and palms',
    sky: ['#93a567', '#77894f', '#55663c'],
    accent: '#9be59b',
    hazard: 'vines',
    price: 500,
    income: 1.05,
    props: { building: '#8a8158', rock: '#7a7862', tree: '#377033' }
  },
  crater: {
    name: 'CRATER FIELD',
    blurb: 'Impact craters, tar pits',
    sky: ['#9c8b9b', '#7f7080', '#5e5365'],
    accent: '#c8a2d8',
    hazard: 'tar',
    price: 1500,
    income: 1.1,
    props: { building: '#75616f', rock: '#877c86', tree: '#66745a' }
  },
  toxic: {
    name: 'DEAD ZONE',
    blurb: 'Chemical ponds, ruins',
    sky: ['#8b9a6a', '#6f7f57', '#4e5c3e'],
    accent: '#a8ff8f',
    hazard: 'gas',
    price: 3000,
    income: 1.1,
    props: { building: '#707f66', rock: '#7f8166', tree: '#3f7d2e' }
  },
  glass: {
    name: 'GLASS WASTES',
    blurb: 'Vitrified dunes, shard fields',
    sky: ['#b3c2b4', '#8fa094', '#6b7a70'],
    accent: '#bfe6e0',
    hazard: 'shards',
    price: 5000,
    income: 1.15,
    props: { building: '#87948c', rock: '#a8b8ae', tree: '#54806b' }
  }
};

const MAP_ORDER = ['desert', 'frost', 'ash', 'jungle', 'crater', 'toxic', 'glass'];

function isMapUnlocked(id) {
  return !!(MAPS[id] && save.unlocked && Array.isArray(save.unlocked.maps) && save.unlocked.maps.indexOf(id) >= 0);
}

function mapIncome(id) {
  return (MAPS[id] && MAPS[id].income) || 1;
}

const TIME_LIMITS = [
  { id: 'endless', label: 'ENDLESS', sec: 0 },
  { id: '5', label: '5 MIN', sec: 300 },
  { id: '10', label: '10 MIN', sec: 600 },
  { id: '15', label: '15 MIN', sec: 900 }
];

const DIFFICULTIES = [
  { id: 'normal', name: 'NORMAL', blurb: 'The intended fight', spawn: 1, hp: 1, dmg: 1, shard: 1, color: '#7fe0a0' },
  { id: 'brutal', name: 'BRUTAL', blurb: 'More, tougher, hits harder · +10% shards', spawn: 1.25, hp: 1.4, dmg: 1.25, shard: 1.1, color: '#ffcf5c' },
  { id: 'nightmare', name: 'NIGHTMARE', blurb: 'For the reckless · +15% shards', spawn: 1.5, hp: 1.9, dmg: 1.5, shard: 1.15, color: '#e2563f' }
];

const DIFFICULTY_ORDER = ['normal', 'brutal', 'nightmare'];

const EVOLUTIONS = {
  rifle: { id: 'ripper', name: 'RIPPER', needs: 'bulletSpeed', desc: 'Triple-shot spread, +60% damage' },
  smg: { id: 'storm', name: 'STORM', needs: 'crit', desc: 'Twin-linked shots, +10% crit' },
  shotgun: { id: 'breaker', name: 'BREAKER', needs: 'damage', desc: '+4 pellets, piercing shells' },
  dmr: { id: 'reaper', name: 'REAPER', needs: 'lifesteal', desc: '+3 pierce, +30% damage, double leech' },
  rail: { id: 'lancer', name: 'LANCER', needs: 'bulletSpeed', desc: 'Infinite pierce, +40% damage, faster' },
  akimbo: { id: 'duelist', name: 'DUELIST', needs: 'crit', desc: '4-round burst, +30% damage' },
  blades: { id: 'tempest', name: 'TEMPEST', needs: 'dashPower', desc: '+2 blades, +50% spin and damage' },
  grenade: { id: 'cluster', name: 'CLUSTER', needs: 'damage', desc: 'Twin grenades, +30% blast' },
  turret: { id: 'overwatch', name: 'OVERWATCH', needs: 'crit', desc: 'Third turret, +30% fire rate and life' },
  aura: { id: 'crown', name: 'SOLAR CROWN', needs: 'vitality', desc: '+35% radius, pulses 60% faster' },
  ricochet: { id: 'carom', name: 'CAROM', needs: 'crit', desc: '+2 ricochets and 25% more bounce damage' },
  squad: { id: 'legion', name: 'LEGION', needs: 'vitality', desc: 'Elite guard: +60% damage, faster volleys' }
};

const WEAPON_ARCHETYPE = {
  rifle: 'precision',
  dmr: 'precision',
  rail: 'precision',
  akimbo: 'spread',
  smg: 'spread',
  shotgun: 'spread'
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
  { id: 'bossrush', name: 'BOSS RUSH', blurb: 'Eight bosses, no waves' },
  { id: 'ops', name: 'OPS', blurb: '10:00 op · extract for +200' }
];

const OPERATORS = [
  { id: 'ranger', name: 'RANGER', blurb: 'Balanced baseline', color: '#9be59b' },
  { id: 'vanguard', name: 'VANGUARD', blurb: '+30 HP · -10% damage taken', color: '#7fe0a0' },
  { id: 'marksman', name: 'MARKSMAN', blurb: '+15% velocity · +8% crit', color: '#ffe08a' },
  { id: 'engineer', name: 'ENGINEER', blurb: 'Turrets +60% life · aura+15%', color: '#b8c6d0' },
  { id: 'scavenger', name: 'SCAVENGER', blurb: '+20% shards · 4 relic picks', color: '#63dcc0' },
  { id: 'arcanist', name: 'ARCANIST', blurb: 'Arcane rounds · pierce', color: '#c39bff' }
];

const OPERATOR_ORDER = ['ranger', 'vanguard', 'marksman', 'engineer', 'scavenger', 'arcanist'];
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
  { id: 'blizzard', name: 'BLIZZARD', news: 'Whiteout descending, hostiles closing' },
  { id: 'downpour', name: 'ACID DOWNPOUR', news: 'Chemical rain sheeting down, hostiles closing' },
  { id: 'dustchoke', name: 'DUST CHOKE', news: 'Crater dust choking the field, hostiles closing' },
  { id: 'bounty', name: 'BOUNTY', news: 'NetWatch hunter deployed to your sector' }
];

const WEATHER_IDS = ['sandstorm', 'blizzard', 'downpour', 'dustchoke'];

const MAP_DISASTER = {
  desert: 'sandstorm',
  frost: 'blizzard',
  ash: 'sandstorm',
  jungle: 'downpour',
  crater: 'dustchoke',
  toxic: 'downpour',
  glass: 'sandstorm'
};

const CONTRACTS = [
  { id: 'cull', name: 'CULL THE HORDE', target: 45, reward: 12, goal: (g) => g.kills },
  { id: 'boss', name: 'BOSS HUNTER', target: 1, reward: 22, goal: (g) => g.bossKills || 0 },
  { id: 'survive', name: 'HOLD THE LINE', target: 120, reward: 14, goal: (g) => Math.floor(g.time) },
  { id: 'gems', name: 'DATA RECOVERY', target: 35, reward: 10, goal: (g) => g.stats.gems },
  { id: 'bomb', name: 'DEMOLITION', target: 4, reward: 12, goal: (g) => g.stats.bombs },
  { id: 'chip', name: 'TECH SALVAGE', target: 3, reward: 14, goal: (g) => g.stats.chips },
  { id: 'dash', name: 'EVASION', target: 12, reward: 10, goal: (g) => g.stats.dashes },
  { id: 'streak', name: 'CHAIN KILLER', target: 35, reward: 16, goal: (g) => g.bestStreak },
  { id: 'trophy', name: 'TROPHY HUNTER', target: 2, reward: 18, goal: (g) => g.stats.champions || 0 },
  { id: 'cache', name: 'CACHE RAIDER', target: 2, reward: 14, goal: (g) => g.stats.chests || 0 },
  { id: 'hunter', name: 'HUNTER DOWN', target: 2, reward: 20, goal: (g) => g.stats.hunters || 0 },
  { id: 'closecall', name: 'CLOSE CALLS', target: 12, reward: 12, goal: (g) => g.stats.nearMisses || 0 }
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
  [0, 56],
  [-54, 48],
  [54, 48],
  [-93, 3],
  [93, 3],
  [0, 90]
];

function levelNeed(level) {
  return Math.round(24 + 20 * level + 1.2 * level * level);
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
    mutation: MUTATION_ORDER[(d + 1) % MUTATION_ORDER.length],
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
  return 210 * (1 + 0.08 * G.skills.speed) * (1 + 0.04 * metaRank('speed')) * (1 + 0.08 * (G.momentum || 0)) * (G.hp < G.maxHp * 0.3 ? 1.15 : 1) * (G.lastStand ? 1.1 : 1);
}

function auraRadius() {
  return G.skills.aura > 0
    ? (72 + 9 * G.skills.aura) * (hasEvolution('aura') ? 1.35 : 1) * (isOperator('engineer') ? 1.15 : 1) * (hasCombo('singularity') ? 1.2 : 1)
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
  return (
    (odActive() ? 1.25 : 1) *
    (G.frenzyT > 0 ? 1.5 : 1) *
    (hasRelic('chrono') ? 1.15 : 1) *
    (G.overchargeT > 0 ? 1.6 : 1) *
    (G.mutation === 'overclock' ? 1.2 : 1) *
    (G.lastStand ? 1.15 : 1)
  );
}

function damageMult() {
  const od = odActive() ? 1.4 : 1;
  const glass = hasMutator('glass') ? 1.4 : 1;
  const berserk = G.mutation === 'berserker' && G.hp < G.maxHp * 0.35 ? 1.45 : 1;
  const veteran = G.mutation === 'veteran' ? 1 + 0.1 * (G.bossKills || 0) : 1;
  const lastStand = G.lastStand ? 1.5 : 1;
  return (
    (1 + 0.12 * G.skills.damage) *
    (1 + 0.06 * metaRank('power')) *
    od * glass * berserk * veteran * lastStand *
    (1 + 0.15 * (G.momentum || 0)) *
    (G.enemies.length >= 50 ? 1.2 : 1) *
    (G.hp < G.maxHp * 0.3 ? 1.3 : 1)
  );
}

function magnetRadius() {
  return 120 + 45 * G.skills.magnet + 12 * metaRank('magnet') + (hasRelic('lodestone') ? 60 : 0);
}

function bulletSpeedMult() {
  return 1 + 0.10 * G.skills.bulletSpeed + 0.05 * metaRank('velocity') + (hasRelic('overclock') ? 0.25 : 0) + (isOperator('marksman') ? 0.15 : 0) + (G.overchargeT > 0 ? 0.3 : 0);
}

function critChance() {
  return Math.min(
    1,
    0.07 * G.skills.crit +
      (hasEvolution('smg') ? 0.1 : 0) +
      (G.surgeT > 0 ? 0.15 : 0) +
      (hasRelic('voidlens') ? 0.1 : 0) +
      (isOperator('marksman') ? 0.08 : 0) +
      (hasCombo('executioner') ? 0.05 : 0)
  );
}

function lifestealHeal(dmg) {
  const relicRate = hasRelic('bloodstone') ? 0.03 : 0;
  if (G.skills.lifesteal <= 0 && relicRate <= 0) return 0;
  if (!(dmg > 0)) return 0;
  const rate =
    0.015 * G.skills.lifesteal * (hasCombo('vampire') ? 2 : 1) * (hasEvolution('dmr') ? 2 : 1) + relicRate;
  return Math.max(1, Math.round(dmg * rate));
}

function xpMult() {
  return 1 + 0.10 * metaRank('greed');
}

function streakMult() {
  return 1 + Math.min(0.5, Math.max(0, (G.streak || 0) * 0.015));
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
    mapIncome(G.map) *
    mutatorShardMult() *
    (1 + 0.08 * (save.meta.harvest || 0)) *
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

function spawnInteract(kind, x, y) {
  if (!G) return;
  const k = kind || pick(['crate', 'barrel', 'stash']);
  const obj = {
    kind: k,
    x: x != null ? x : G.player.x + Math.cos(rnd(0, TAU)) * rnd(260, 420),
    y: y != null ? y : G.player.y + Math.sin(rnd(0, TAU)) * rnd(260, 420),
    spin: 0,
    hp: k === 'barrel' ? 14 : 0,
    dead: false
  };
  G.interact.push(obj);
  return obj;
}

function openCrate(obj) {
  if (!G || !obj) return;
  obj.dead = true;
  G.stats.interact = (G.stats.interact || 0) + 1;
  const roll = srnd();
  fxBurst(obj.x, obj.y, 7, '#ffd27a', 190, 2.6, 0.38, 'spark');
  if (roll < 0.32) {
    G.hp = Math.min(G.maxHp, G.hp + 25);
    G.stats.healing += 25;
    spawnFloater(obj.x, obj.y - 14, '+25 HP', '#7fe0a0', 13);
    sfx.heal();
    G.news = 'Supply crate: medkit.';
  } else if (roll < 0.58) {
    const kinds = Object.keys(CHIPS);
    for (let i = 0; i < 2; i++) {
      const a = rnd(0, TAU);
      const r = rnd(20, 60);
      G.chips.push({ x: obj.x + Math.cos(a) * r, y: obj.y + Math.sin(a) * r, kind: kinds[Math.floor(srnd() * kinds.length)], spin: 0 });
    }
    spawnFloater(obj.x, obj.y - 14, 'CHIPS DROPPED', '#9fd8ff', 12);
    G.news = 'Supply crate: chip cache.';
  } else if (roll < 0.76) {
    addUnbanked(18);
    spawnFloater(obj.x, obj.y - 14, '+18 SHARDS', '#63dcc0', 13);
    G.news = 'Supply crate: salvage.';
  } else if (roll < 0.88) {
    G.banner = 'TRAP';
    G.bannerSub = 'THE CRATE BIT BACK';
    G.bannerT = 1.8;
    G.hurtT = 0.3;
    G.hp = Math.max(1, G.hp - 12);
    spawnFloater(obj.x, obj.y - 14, '-12 HP', '#ff7a6a', 13);
    sfx.hurt();
    G.news = 'Booby-trapped crate.';
  } else {
    const ang = rnd(0, TAU);
    for (let i = 0; i < 4; i++) {
      const a = ang + i * (TAU / 4);
      spawnEnemyAt('grunt', obj.x + Math.cos(a) * 90, obj.y + Math.sin(a) * 90);
    }
    G.banner = 'AMBUSH';
    G.bannerSub = 'THE HORDE POURS OUT';
    G.bannerT = 2.0;
    G.news = 'Ambush crate.';
  }
}

function spawnBunker(x, y) {
  if (!G) return;
  G.bunker = { x: x != null ? x : G.player.x + Math.cos(rnd(0, TAU)) * rnd(900, 1400), y: y != null ? y : G.player.y + Math.sin(rnd(0, TAU)) * rnd(900, 1400), used: false, spin: 0 };
  return G.bunker;
}

function triggerNuke(bunker) {
  if (!G || !bunker || bunker.used) return false;
  bunker.used = true;
  G.stats.bunkers = (G.stats.bunkers || 0) + 1;
  G.banner = 'NUCLEAR STRIKE';
  G.bannerSub = 'BUNKER CACHE DETONATED';
  G.bannerT = 3.0;
  G.news = 'Nuclear bunker triggered.';
  sfx.victory();
  G.nuke = { t: 0, i: 0, kills: 0, total: G.enemies.filter((e) => !e.dead).length };
  return true;
}

function updateInteracts(dt) {
  if (!G) return;
  G.interactCd -= dt;
  if (G.interactCd <= 0) {
    G.interactCd = 20 + rnd(0, 12);
    if (G.interact.length < 6) spawnInteract();
  }
  if (G.bunker && !G.bunker.used) {
    G.bunker.spin += dt * 0.6;
    const d = Math.hypot(G.player.x - G.bunker.x, G.player.y - G.bunker.y);
    if (d < 46) {
      triggerNuke(G.bunker);
    }
  }
  if (G.warChest && !G.warChest.open) {
    const c = G.warChest;
    c.spin += dt * 0.8;
    c.deniedCd = Math.max(0, c.deniedCd - dt);
    const d = Math.hypot(G.player.x - c.x, G.player.y - c.y);
    if (d < 46) {
      const remaining = Math.max(0, c.need - (G.kills - c.startKills));
      if (remaining <= 0) {
        openWarChest();
      } else if (c.deniedCd <= 0) {
        c.deniedCd = 1.4;
        spawnFloater(c.x, c.y - 30, 'KILL ' + remaining + ' MORE', '#ffcf5c', 12);
        sfx.denied();
      }
    }
  }
  for (const obj of G.interact) {
    if (obj.dead) continue;
    obj.spin += dt * 2;
    const d = Math.hypot(G.player.x - obj.x, G.player.y - obj.y);
    if (obj.kind === 'crate' || obj.kind === 'stash') {
      if (d < 32) {
        if (obj.kind === 'stash') {
          obj.dead = true;
          G.stats.interact = (G.stats.interact || 0) + 1;
          addUnbanked(40);
          fxBurst(obj.x, obj.y, 8, '#63dcc0', 200, 2.8, 0.4, 'spark');
          spawnFloater(obj.x, obj.y - 14, '+40 SHARDS', '#63dcc0', 14);
          G.banner = 'HIDDEN STASH';
          G.bannerSub = 'RARE LOOT UNLOCKED';
          G.bannerT = 2.0;
          G.news = 'Hidden stash cracked.';
        } else {
          openCrate(obj);
        }
      }
    }
  }
  G.interact = G.interact.filter((o) => !o.dead && dist2(o.x, o.y, G.player.x, G.player.y) < 2600 * 2600);
  if (G.nuke) {
    G.nuke.t -= dt;
    if (G.nuke.t <= 0) {
      G.nuke.t = 0.12;
      const alive = G.enemies.filter((e) => !e.dead);
      const batch = alive.slice(0, 5);
      for (const e of batch) {
        explodeAt(e.x, e.y, e.r * 3, e.dmg || 0, '#ffd27a', 'p');
        damageEnemy(e, 1e6, e.x, e.y, false);
        G.nuke.kills++;
      }
      if (alive.length <= 5) {
        G.nuke = null;
        addUnbanked(120 + 10 * G.wave);
        spawnFloater(G.player.x, G.player.y - 40, 'MAP CLEARED', '#ffd27a', 16);
      }
    }
  }
  // bunker spawn (rare, once per run)
  if (!G.bunker && !G.bunkerTried) {
    G.bunkerTried = true;
    if (srnd() < 0.3) spawnBunker();
  }
}

function pick(arr) { return arr[Math.floor(srnd() * arr.length)]; }

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
    G.bannerSub = WEATHER_IDS.indexOf(id) >= 0 ? 'ENEMIES CLOSE IN FAST' : 'OPTICS DEGRADED';
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

function soldierBulletColor() {
  const sk = SKILLS[primarySkill()];
  return (sk && sk.color) || '#7fd0ff';
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

let setup = { weapon: 'ak', map: 'desert', limit: 'endless', difficulty: 'normal', mutators: [], mode: 'survivors', operator: 'ranger', mutation: 'none' };
let setupTab = 0;

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
  clearTileCache();
  for (const key in keys) delete keys[key];
  touchStick.active = false;
  const opts = options || {};
  if (opts.weapon && WEAPONS[opts.weapon]) setup.weapon = opts.weapon;
  if (opts.map && MAPS[opts.map]) setup.map = opts.map;
  if (opts.daily == null && !isMapUnlocked(setup.map)) setup.map = 'desert';
  if (opts.limit) {
    const found = TIME_LIMITS.some((l) => l.id === opts.limit);
    if (found) setup.limit = opts.limit;
  }
  if (opts.difficulty && DIFFICULTIES.some((d) => d.id === opts.difficulty)) {
    setup.difficulty = opts.difficulty;
  }
  if (opts.mode && MODES.some((m) => m.id === opts.mode)) setup.mode = opts.mode;
  if (opts.operator && OPERATOR_ORDER.indexOf(opts.operator) >= 0) setup.operator = opts.operator;
  if (opts.mutation && MUTATION_ORDER.indexOf(opts.mutation) >= 0) setup.mutation = opts.mutation;
  if (Array.isArray(opts.mutators)) setup.mutators = opts.mutators.slice(0, 2);
  const limit = findLimit(setup.limit);
  const diff = findDifficulty(setup.difficulty);
  const maxHp = 100 + 10 * metaRank('armor') + (setup.operator === 'vanguard' ? 30 : 0);
  const fixedSeed = opts.seed != null ? Number(opts.seed) >>> 0 : null;
  const seed = fixedSeed !== null && fixedSeed > 0 ? fixedSeed : (save.lastSeed >>> 0) || 20261029;
  if (fixedSeed === null) save.lastSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  fxSeed = (seed ^ 0x9e3779b9) >>> 0;
  writeStore(SAVE_KEY, save);
  G = {
    weapon: setup.weapon,
    mode: setup.mode,
    operator: OPERATOR_ORDER.indexOf(setup.operator) >= 0 ? setup.operator : 'ranger',
    mutation: MUTATION_ORDER.indexOf(setup.mutation) >= 0 ? setup.mutation : 'none',
    daily: opts.daily != null ? Number(opts.daily) : null,
    rush: setup.mode === 'bossrush' ? { index: 0, target: RUSH_TARGET, next: 2, alive: false } : null,
    map: setup.map,
    difficulty: diff.id,
    diff,
    limitSec: setup.mode === 'ops' ? 600 : limit.sec,
    limitLabel: setup.mode === 'ops' ? '10 MIN OP' : limit.label,
    opBeacon: false,
    rivalsBeatenRun: [],
    victory: false,
    seed,
    rng: seed,
    market: 0.9 + ((seed % 1000) / 1000) * 0.3,
    time: 0,
    wave: 1,
    surgeIdx: 0,
    surgePending: false,
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
    dice: [],
    interact: [],
    overcharges: [],
    bunker: null,
    bunkerTried: false,
    interactCd: 22,
    nuke: null,
    grenades: [],
    particles: [],
    floaters: [],
    afterimages: [],
    decals: [],
    bombs: [],
    skills: freshSkills(),
    cds: { rifle: 0.25, smg: 0.2, shotgun: 0.6, dmr: 0.9, rail: 0.9, akimbo: 0.3, grenade: 1.6, bladeAngle: 0, spawn: 1.2, turret: 3, aura: 0 },
    dash: { t: 0, cd: 0, dx: 0, dy: 0, held: false, charges: 1 },
    bomb: { cd: 0, max: 6, held: false },
    radioArmed: 0,
    radioHeld: false,
    radios: [],
    shield: { charges: 0, t: 0 },
    slowT: 0,
    pools: [],
    arcs: [],
    recentKills: [],
    momentum: 0,
    hitStop: 0,
    score: 0,
    milestoneIdx: 0,
    rewardIdx: 0,
    rankIdx: 0,
    streakRewards: [],
    callout: null,
    flashT: 0,
    flashColor: '#ffffff',
    lastStand: false,
    warChest: null,
    airstrike: null,
    heli: null,
    missiles: null,
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
    overchargeT: 0,
    evolved: {},
    evoReady: {},
    rerolls: 2 + metaRank('luck'),
    banishes: 1,
    banned: [],
    damageDealt: 0,
    killsByType: {},
    bossKills: 0,
    megaKills: 0,
    explored: Object.create(null),
    exploredCount: 0,
    rooms: Object.create(null),
    roomFocus: null,
    offers: [],
    combosSeen: [],
    banner: '',
    bannerSub: '',
    bannerT: 0,
    stats: {
      shots: { rifle: 0, smg: 0, shotgun: 0, dmr: 0, rail: 0, akimbo: 0, turret: 0, soldier: 0, enemy: 0 },
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
      dice: 0,
      radio: 0,
      interact: 0,
      bunkers: 0,
      shieldSaves: 0,
      banked: 0,
      lost: 0,
      ricochets: 0
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
  if (G.score > (save.bestScore || 0)) save.bestScore = Math.round(G.score);
  if (!Array.isArray(save.boardBests)) save.boardBests = [];
  G.boardRank = 1 + save.boardBests.filter((e) => e && e.s > Math.round(G.score || 0)).length;
  save.boardBests.unshift({
    s: Math.round(G.score || 0),
    k: G.kills,
    t: Math.round(G.time * 10) / 10,
    m: G.map,
    win: outcome === 'win',
    d: G.daily == null ? 0 : G.daily
  });
  save.boardBests = save.boardBests.slice(0, 25);
  save.boardBests = cleanBoardBests(save.boardBests);
  if (!Array.isArray(save.rivalsBeaten)) save.rivalsBeaten = [];
  G.rivalsBeatenRun = [];
  for (const tab of ['global', 'turkiye']) {
    for (const r of RIVALS[tab]) {
      const id = (tab === 'global' ? 'g:' : 't:') + r.name;
      if (save.rivalsBeaten.indexOf(id) < 0 && Math.round(G.score || 0) >= r.score) {
        save.rivalsBeaten.push(id);
        G.rivalsBeatenRun.push(r.name);
        save.shards += 25;
      }
    }
  }
  if (G.time >= save.bestTime) {
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
const ARENA_TILE = 1100;
const ROOM_TILE = 2400;
const ROOM_WALL = 18;

function mapDef() {
  return MAPS[(G && G.map) || setup.map] || MAPS.desert;
}

const tileCache = { prop: new Map(), room: new Map(), arena: new Map(), walls: new Map() };
function clearTileCache() {
  tileCache.prop.clear();
  tileCache.room.clear();
  tileCache.arena.clear();
  tileCache.walls.clear();
}

function arenaAtPoint(x, y, pad) {
  const extra = pad || 0;
  const key = x + '|' + y + '|' + extra;
  const hit = tileCache.arena.get(key);
  if (hit !== undefined) return hit;
  if (tileCache.arena.size > 4096) tileCache.arena.clear();
  const found = arenaAtPointRaw(x, y, extra);
  tileCache.arena.set(key, found);
  return found;
}

function arenaAtPointRaw(x, y, pad) {
  const extra = pad || 0;
  if (Math.hypot(x, y) < 430 + extra) return { x: 0, y: 0, r: 430, home: true };
  const gx = Math.floor(x / ARENA_TILE);
  const gy = Math.floor(y / ARENA_TILE);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ax = gx + i;
      const ay = gy + j;
      const h = hash2(ax * 13 + 3, ay * 17 + 7);
      if (h > 0.72) continue;
      const cx = ax * ARENA_TILE + ARENA_TILE / 2 + (hash2(ax * 5 + 1, ay * 11 + 2) - 0.5) * 200;
      const cy = ay * ARENA_TILE + ARENA_TILE / 2 + (hash2(ax * 23 + 4, ay * 31 + 6) - 0.5) * 200;
      const radius = 300 + hash2(ax * 41 + 9, ay * 43 + 5) * 150;
      const reach = radius + extra;
      if (dist2(x, y, cx, cy) < reach * reach) return { x: cx, y: cy, r: radius };
    }
  }
  return null;
}

function roomTile(tx, ty) {
  const key = tx + ',' + ty;
  const hit = tileCache.room.get(key);
  if (hit !== undefined) return hit;
  const found = roomTileRaw(tx, ty);
  tileCache.room.set(key, found);
  return found;
}

function roomTileRaw(tx, ty) {
  const h = hash2(tx * 67 + 17, ty * 89 + 29);
  if (h > 0.82) return null;
  const seed = hash2(tx * 101 + 7, ty * 131 + 11);
  const x = tx * ROOM_TILE + ROOM_TILE / 2 + (hash2(tx * 17 + 3, ty * 19 + 5) - 0.5) * 360;
  const y = ty * ROOM_TILE + ROOM_TILE / 2 + (hash2(tx * 23 + 7, ty * 29 + 9) - 0.5) * 360;
  const w = 420 + Math.round(hash2(tx * 31 + 13, ty * 37 + 17) * 260);
  const hgt = 320 + Math.round(hash2(tx * 41 + 19, ty * 43 + 23) * 220);
  if (Math.hypot(x, y) < 720 || arenaAtPoint(x, y, Math.max(w, hgt) * 0.7)) return null;
  const kinds = ['relay', 'market', 'chapel', 'workshop'];
  return {
    id: tx + ',' + ty,
    tx,
    ty,
    x,
    y,
    w,
    h: hgt,
    kind: kinds[Math.floor(seed * kinds.length)],
    entrance: Math.floor(hash2(tx * 47 + 31, ty * 53 + 37) * 4),
    seed
  };
}

function roomsNear(x, y, radius) {
  const out = [];
  const tx0 = Math.floor((x - radius) / ROOM_TILE);
  const ty0 = Math.floor((y - radius) / ROOM_TILE);
  const tx1 = Math.floor((x + radius) / ROOM_TILE);
  const ty1 = Math.floor((y + radius) / ROOM_TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const room = roomTile(tx, ty);
      if (!room) continue;
      if (Math.abs(room.x - x) <= radius + room.w && Math.abs(room.y - y) <= radius + room.h) out.push(room);
    }
  }
  return out;
}

function roomAtPoint(x, y, pad) {
  const extra = pad || 0;
  for (const room of roomsNear(x, y, Math.max(ROOM_TILE, 900))) {
    if (Math.abs(x - room.x) <= room.w / 2 + extra && Math.abs(y - room.y) <= room.h / 2 + extra) return room;
  }
  return null;
}

function roomWalls(room) {
  const hit = tileCache.walls.get(room.id);
  if (hit !== undefined) return hit;
  const found = roomWallsRaw(room);
  tileCache.walls.set(room.id, found);
  return found;
}

function roomWallsRaw(room) {
  const left = room.x - room.w / 2;
  const right = room.x + room.w / 2;
  const top = room.y - room.h / 2;
  const bottom = room.y + room.h / 2;
  const gap = 86;
  const wall = (x, y, w, h, side) => ({ kind: 'room-wall', x, y, w, h, side, room: room.id });
  const walls = [];
  if (room.entrance !== 0) walls.push(wall(room.x, top, room.w, ROOM_WALL, 0));
  else {
    walls.push(wall(left + (room.w - gap) / 2, top, (room.w - gap) / 2, ROOM_WALL, 0));
    walls.push(wall(right - (room.w - gap) / 2, top, (room.w - gap) / 2, ROOM_WALL, 0));
  }
  if (room.entrance !== 1) walls.push(wall(room.x, bottom, room.w, ROOM_WALL, 1));
  else {
    walls.push(wall(left + (room.w - gap) / 2, bottom, (room.w - gap) / 2, ROOM_WALL, 1));
    walls.push(wall(right - (room.w - gap) / 2, bottom, (room.w - gap) / 2, ROOM_WALL, 1));
  }
  if (room.entrance !== 2) walls.push(wall(left, room.y, ROOM_WALL, room.h, 2));
  else {
    walls.push(wall(left, top + (room.h - gap) / 2, ROOM_WALL, (room.h - gap) / 2, 2));
    walls.push(wall(left, bottom - (room.h - gap) / 2, ROOM_WALL, (room.h - gap) / 2, 2));
  }
  if (room.entrance !== 3) walls.push(wall(right, room.y, ROOM_WALL, room.h, 3));
  else {
    walls.push(wall(right, top + (room.h - gap) / 2, ROOM_WALL, (room.h - gap) / 2, 3));
    walls.push(wall(right, bottom - (room.h - gap) / 2, ROOM_WALL, (room.h - gap) / 2, 3));
  }
  return walls;
}

function roomPropsNear(x, y, radius) {
  const out = [];
  for (const room of roomsNear(x, y, radius + 180)) {
    out.push(...roomWalls(room));
  }
  return out;
}

function ambienceDef() {
  return AMBIENCE[(G && G.map) || setup.map] || AMBIENCE.desert;
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
      if (arenaAtPoint(cx, cy, 70)) continue;
      if (roomAtPoint(cx, cy, 70)) continue;
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
      if (arenaAtPoint(cx, cy, 70)) continue;
      if (roomAtPoint(cx, cy, 70)) continue;
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
      drawHazardMark(cx, cy, r, def.hazard, h);
      if (def.hazard === 'embers') {
        ctx.fillStyle = 'rgba(255,140,80,' + (0.25 + 0.2 * Math.sin(uiT * 2 + tx)) + ')';
        ctx.beginPath();
        ctx.arc(cx + Math.sin(uiT + ty) * 12, cy + Math.cos(uiT * 1.3 + tx) * 8, 4, 0, TAU);
        ctx.fill();
      }
    }
  }
}

function drawHazardMark(cx, cy, radius, hazard, seed) {
  const pulse = 0.5 + 0.5 * Math.sin(uiT * 2.4 + seed * 12);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.24 + pulse * 0.1;
  ctx.strokeStyle = HAZARDS[hazard].burnColor || '#d7c39a';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5;
  if (hazard === 'ice' || hazard === 'shards') {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5 + seed * TAU;
      const length = radius * (0.34 + 0.08 * (i % 2));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
      ctx.lineTo(Math.cos(a + 0.18) * length, Math.sin(a + 0.18) * length * 0.72);
      ctx.lineTo(Math.cos(a - 0.16) * length, Math.sin(a - 0.16) * length * 0.72);
      ctx.closePath();
      ctx.stroke();
    }
  } else if (hazard === 'quicksand' || hazard === 'tar') {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.scale(1, 0.62);
      ctx.beginPath();
      ctx.arc(0, 0, radius * (0.25 + i * 0.18), seed * TAU, seed * TAU + Math.PI);
      ctx.stroke();
      ctx.restore();
    }
  } else if (hazard === 'vines') {
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + seed * 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        Math.cos(a + 0.7) * radius * 0.42,
        Math.sin(a + 0.7) * radius * 0.32,
        Math.cos(a) * radius * 0.74,
        Math.sin(a) * radius * 0.55
      );
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + uiT * 0.12;
      const x = Math.cos(a) * radius * 0.42;
      const y = Math.sin(a) * radius * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 2.5 + pulse, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawArenas(cam) {
  const def = mapDef();
  const seen = [];
  const drawOne = (arena) => {
    if (!arena) return;
    for (const other of seen) {
      if (other.x === arena.x && other.y === arena.y) return;
    }
    seen.push(arena);
    if (arena.x + arena.r < cam.x || arena.x - arena.r > cam.x + W) return;
    if (arena.y + arena.r * 0.74 < cam.y || arena.y - arena.r * 0.74 > cam.y + H) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,244,214,0.045)';
    ctx.beginPath();
    ctx.ellipse(arena.x, arena.y, arena.r, arena.r * 0.74, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = def.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 16]);
    ctx.beginPath();
    ctx.ellipse(arena.x, arena.y, arena.r, arena.r * 0.74, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.07;
    ctx.beginPath();
    ctx.ellipse(arena.x, arena.y, arena.r * 0.6, arena.r * 0.44, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = def.accent;
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU;
      const px = arena.x + Math.cos(ang) * arena.r * 0.9;
      const py = arena.y + Math.sin(ang) * arena.r * 0.666;
      ctx.fillRect(px - 3, py - 3, 6, 6);
    }
    ctx.restore();
  };
  drawOne(arenaAtPoint(0, 0));
  const tx0 = Math.floor(cam.x / ARENA_TILE) - 1;
  const ty0 = Math.floor(cam.y / ARENA_TILE) - 1;
  const tx1 = Math.floor((cam.x + W) / ARENA_TILE) + 1;
  const ty1 = Math.floor((cam.y + H) / ARENA_TILE) + 1;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const h = hash2(tx * 13 + 3, ty * 17 + 7);
      if (h > 0.72) continue;
      const cx = tx * ARENA_TILE + ARENA_TILE / 2 + (hash2(tx * 5 + 1, ty * 11 + 2) - 0.5) * 200;
      const cy = ty * ARENA_TILE + ARENA_TILE / 2 + (hash2(tx * 23 + 4, ty * 31 + 6) - 0.5) * 200;
      const radius = 300 + hash2(tx * 41 + 9, ty * 43 + 5) * 150;
      drawOne({ x: cx, y: cy, r: radius });
    }
  }
}

function drawRooms(cam) {
    const palette = mapDef().props;
    const rooms = roomsNear(cam.x + W / 2, cam.y + H / 2, Math.hypot(W, H) / 2 + 220);
    for (const room of rooms) {
      if (room.x + room.w / 2 < cam.x || room.x - room.w / 2 > cam.x + W) continue;
      if (room.y + room.h / 2 < cam.y || room.y - room.h / 2 > cam.y + H) continue;
      const left = room.x - room.w / 2;
      const top = room.y - room.h / 2;
      const state = G.rooms[room.id];
      const pulse = 0.5 + 0.5 * Math.sin(uiT * 2 + room.seed * 8);
      ctx.save();
      ctx.fillStyle = 'rgba(12,16,18,0.22)';
      ctx.fillRect(left + 10, top + 12, room.w, room.h);
      ctx.fillStyle = 'rgba(255,244,214,0.07)';
      ctx.fillRect(left, top, room.w, room.h);
      ctx.strokeStyle = withAlpha(state && state.cleared ? '#63dcc0' : mapDef().accent, 0.26);
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, room.w, room.h);
      ctx.fillStyle = palette.building;
      for (const wall of roomWalls(room)) {
        ctx.fillRect(wall.x - wall.w / 2, wall.y - wall.h / 2, wall.w, wall.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.36)';
        ctx.strokeRect(wall.x - wall.w / 2 + 0.5, wall.y - wall.h / 2 + 0.5, wall.w - 1, wall.h - 1);
      }
      ctx.globalAlpha = 0.35 + pulse * 0.2;
      ctx.strokeStyle = mapDef().accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 10]);
      ctx.strokeRect(left + 24, top + 24, room.w - 48, room.h - 48);
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = state && state.cleared ? '#63dcc0' : mapDef().accent;
      ctx.fillRect(room.x - 18, room.y - 2, 36, 4);
      ctx.globalAlpha = 0.45;
      ctx.font = '700 9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(room.kind.toUpperCase(), room.x, top - 8);
      if (state && !state.cleared) {
        ctx.globalAlpha = 0.52 + pulse * 0.18;
        ctx.fillStyle = '#ffcf5c';
        ctx.font = '700 8px Consolas, monospace';
        ctx.fillText('WAVE ' + Math.min(state.stage + 1, state.stages) + '/' + state.stages, room.x, top + 16);
      } else if (state && state.cleared) {
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = '#63dcc0';
        ctx.font = '700 8px Consolas, monospace';
        ctx.fillText('SECURED', room.x, top + 16);
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = state && state.cleared ? '#63dcc0' : palette.rock;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (room.kind === 'relay') {
        ctx.moveTo(room.x - 26, room.y + 14);
        ctx.lineTo(room.x, room.y - 26);
        ctx.lineTo(room.x + 26, room.y + 14);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(room.x, room.y - 4, 9 + pulse * 3, 0, TAU);
        ctx.stroke();
      } else if (room.kind === 'market') {
        ctx.strokeRect(room.x - 34, room.y - 18, 68, 36);
        ctx.moveTo(room.x - 18, room.y - 18);
        ctx.lineTo(room.x - 18, room.y + 18);
        ctx.moveTo(room.x, room.y - 18);
        ctx.lineTo(room.x, room.y + 18);
        ctx.moveTo(room.x + 18, room.y - 18);
        ctx.lineTo(room.x + 18, room.y + 18);
        ctx.stroke();
      } else if (room.kind === 'chapel') {
        ctx.moveTo(room.x, room.y - 28);
        ctx.lineTo(room.x, room.y + 28);
        ctx.moveTo(room.x - 18, room.y - 10);
        ctx.lineTo(room.x + 18, room.y - 10);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(room.x, room.y, 26 + pulse * 4, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(room.x, room.y, 10, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.3 + pulse * 0.12;
      ctx.strokeStyle = state && state.cleared ? '#63dcc0' : '#ffcf5c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(room.x, room.y + room.h * 0.22, 18 + pulse * 4, 0, TAU);
      ctx.stroke();
      ctx.restore();
  }
}

function propTile(tx, ty) {
  const key = tx + ',' + ty;
  const hit = tileCache.prop.get(key);
  if (hit !== undefined) return hit;
  const found = propTileRaw(tx, ty);
  tileCache.prop.set(key, found);
  return found;
}

function propTileRaw(tx, ty) {
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
    if (arenaAtPoint(px, py, 36)) continue;
    if (roomAtPoint(px, py, 36)) continue;
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
  out.push(...roomPropsNear(x, y, radius));
  return out;
}

const DECOR_TILE = 210;

function decorTile(tx, ty) {
  const h = hash2(tx * 19 + 5, ty * 23 + 7);
  if (h > 0.55) return [];
  const map = (G && G.map) || setup.map;
  const roll = hash2(tx * 29 + 3, ty * 31 + 11);
  let kind;
  if (map === 'frost') kind = roll < 0.46 ? 'snowgrass' : roll < 0.76 ? 'ice' : 'pebbles';
  else if (map === 'ash') kind = roll < 0.5 ? 'charred' : roll < 0.76 ? 'bones' : 'crack';
  else if (map === 'jungle') kind = roll < 0.46 ? 'fern' : roll < 0.72 ? 'flower' : 'mushroom';
  else if (map === 'crater') kind = roll < 0.48 ? 'crack' : roll < 0.74 ? 'pebbles' : 'bones';
  else if (map === 'toxic') kind = roll < 0.44 ? 'fern' : roll < 0.72 ? 'charred' : 'pebbles';
  else if (map === 'glass') kind = roll < 0.5 ? 'crack' : roll < 0.76 ? 'pebbles' : 'bones';
  else kind = roll < 0.55 ? 'grass' : roll < 0.78 ? 'bones' : 'pebbles';
  return [{
    kind,
    x: tx * DECOR_TILE + 24 + hash2(tx * 7 + 1, ty * 11 + 9) * (DECOR_TILE - 48),
    y: ty * DECOR_TILE + 24 + hash2(tx * 13 + 2, ty * 17 + 6) * (DECOR_TILE - 48),
    seed: h,
    rot: hash2(tx * 37 + 4, ty * 41 + 8) * TAU
  }];
}

function decorNear(x, y, radius) {
  const out = [];
  const tx0 = Math.floor((x - radius) / DECOR_TILE);
  const ty0 = Math.floor((y - radius) / DECOR_TILE);
  const tx1 = Math.floor((x + radius) / DECOR_TILE);
  const ty1 = Math.floor((y + radius) / DECOR_TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      for (const d of decorTile(tx, ty)) {
        if (Math.abs(d.x - x) <= radius + 80 && Math.abs(d.y - y) <= radius + 80) out.push(d);
      }
    }
  }
  return out;
}

function resolveSolid(x, y, r) {
  const props = propsNear(x, y, r + 90);
  for (const prop of props) {
    if (prop.kind === 'building' || prop.kind === 'room-wall') {
      const halfW = prop.w / 2;
      const halfH = prop.h / 2;
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
          const left = x - (prop.x - halfW);
          const right = (prop.x + halfW) - x;
          const top = y - (prop.y - halfH);
          const bottom = (prop.y + halfH) - y;
          const min = Math.min(left, right, top, bottom);
          if (min === left) x = prop.x - halfW - r;
          else if (min === right) x = prop.x + halfW + r;
          else if (min === top) y = prop.y - halfH - r;
          else y = prop.y + halfH + r;
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
    if (prop.kind !== 'building' && prop.kind !== 'room-wall') continue;
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
      const key = (cx + i) + ',' + (cy + j);
      if (!G.explored[key]) {
        G.explored[key] = 1;
        G.exploredCount++;
      }
    }
  }
  if (G.exploredCount > 4000) {
    const oldest = Object.keys(G.explored)[0]; // aikit:allow-secret
    delete G.explored[oldest];
    G.exploredCount--;
  }
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
  const slot = G.floaters.length % 5;
  G.floaters.push({
    x: x + (slot - 2) * 24,
    y: y - ((G.floaters.length % 3) * 8),
    text,
    color,
    size: size || 13,
    life: 0.8,
    max: 0.8
  });
  if (G.floaters.length > 40) G.floaters.shift();
}

let fxSeed = 0;
function fxRnd() {
  fxSeed = (Math.imul(fxSeed, 1664525) + 1013904223) >>> 0;
  return fxSeed / 4294967296;
}

function burstWith(random, x, y, count, color, spd, size, life, kind, ang) {
  const shape = kind || 'dot';
  for (let i = 0; i < count; i++) {
    const a = ang === undefined ? random() * TAU : ang + (random() - 0.5) * 0.8;
    const v = spd * 0.25 + random() * spd * 0.75;
    const l = life * 0.5 + random() * life * 0.5;
    G.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: l,
      max: l,
      color,
      size: size * 0.5 + random() * size * 0.5,
      kind: shape,
      ang: a,
      rot: (a + i * 2.4) % TAU,
      spin: (i % 2 === 0 ? 1 : -1) * (2 + (i % 4))
    });
  }
  if (G.particles.length > 420) G.particles.splice(0, G.particles.length - 420);
}

function burst(x, y, count, color, spd, size, life, kind, ang) {
  burstWith(() => rnd(0, 1), x, y, count, color, spd, size, life, kind, ang);
}

function fxBurst(x, y, count, color, spd, size, life, kind, ang) {
  burstWith(fxRnd, x, y, count, color, spd, size, life, kind, ang);
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
    bounces: owner === 'p' ? ricochetBounces((G && G.skills.ricochet) || 0) : 0,
    life: o.life || 1.4,
    dead: false
  });
}

function rollCrit(base) {
  const chance = critChance();
  if (chance > 0 && Math.random() < chance) {
    G.stats.crits++;
    return { dmg: base * 2, crit: true };
  }
  return { dmg: base, crit: false };
}

function muzzle(x, y, ang, color) {
  const fx = x + Math.cos(ang) * 22;
  const fy = y + Math.sin(ang) * 22;
  G.particles.push({
    x: fx,
    y: fy,
    vx: 0,
    vy: 0,
    life: 0.07,
    max: 0.07,
    color: color || '#ffe28a',
    size: 12,
    kind: 'flash',
    ang,
    rot: 0,
    spin: 0
  });
  burst(fx, fy, 2, color || '#ffe28a', 220, 2.6, 0.14, 'spark', ang);
  if (G.particles.length > 420) G.particles.splice(0, G.particles.length - 420);
}

function hasEvolution(skill) {
  return !!(G && G.evolved && G.evolved[skill]);
}

function checkEvolutions() {
  if (!G) return;
  for (const skill of Object.keys(EVOLUTIONS)) {
    if (G.evolved[skill] || G.evoReady[skill]) continue;
    const evo = EVOLUTIONS[skill];
    if (G.skills[skill] >= SKILLS[skill].max && G.skills[evo.needs] >= 3) {
      G.evoReady[skill] = evo.id;
      G.banner = 'EVOLUTION READY · ' + evo.name;
      G.bannerSub = SKILLS[skill].name + ' · pick it on your next level-up';
      G.bannerT = 2.8;
      G.news = SKILLS[skill].name + ' can evolve into ' + evo.name + '.';
      sfx.victory();
    }
  }
}

function applyEvolution(skill) {
  if (!G || G.evolved[skill] || !G.evoReady[skill]) return false;
  const evo = EVOLUTIONS[skill];
  if (!evo) return false;
  G.evolved[skill] = evo.id;
  delete G.evoReady[skill];
  G.banner = 'EVOLVED · ' + evo.name;
  G.bannerSub = SKILLS[skill].name + ' + ' + SKILLS[evo.needs].name;
  G.bannerT = 2.8;
  G.news = SKILLS[skill].name + ' evolved into ' + evo.name + '.';
  shake = Math.max(shake, settings.shake ? 6 : 0);
  sfx.victory();
  checkAchievements();
  return true;
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

function akimboStats() {
  const lvl = G.skills.akimbo;
  const st = {
    dmg: (5 + 1.6 * (lvl - 1)) * damageMult(),
    cd: Math.max(0.14, 0.3 - 0.014 * lvl),
    range: 480,
    speed: 900,
    color: '#ffd9a0',
    sfx: 'smg',
    shots: 2,
    spread: 0.09
  };
  if (hasEvolution('akimbo')) {
    st.dmg *= 1.3;
    st.shots = 4;
    st.spread = 0.12;
    st.label = 'DUELIST';
  }
  return st;
}

function weaponStats(id) {
  if (id === 'rifle') return rifleStats();
  if (id === 'smg') return smgStats();
  if (id === 'shotgun') return shotgunStats();
  if (id === 'dmr') return dmrStats();
  if (id === 'rail') return railStats();
  if (id === 'akimbo') return akimboStats();
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
  const arcane = isOperator('arcanist');
  const shotColor = arcane ? '#c39bff' : st.color;
  const pierce = (st.pierce || 0) + (arcane ? 1 : 0);
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
        shotColor,
        { crit: hit.crit, pierce, life }
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
        shotColor,
        { crit: hit.crit, pierce, life }
      );
    }
    G.stats.shots[id] = (G.stats.shots[id] || 0) + shots;
  }
  G.cds[id] = st.cd / fireRateMult();
  shake = Math.max(shake, id === 'shotgun' ? 2.2 : id === 'dmr' ? 2 : 1.1);
  muzzle(G.player.x, G.player.y, ang, shotColor);
  sfx[st.sfx]();
}

function updateSkills(dt) {
  const target = nearestEnemy(G.player.x, G.player.y, 620);
  if (target) G.player.angle = Math.atan2(target.y - G.player.y, target.x - G.player.x);

  for (const id of ['rifle', 'smg', 'shotgun', 'dmr', 'rail', 'akimbo']) fireWeapon(id, dt);

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
      const legion = hasEvolution('squad');
      const dmg = (8 + 3 * G.skills.squad) * damageMult() * (legion ? 1.6 : 1);
      spawnBullet(s.x + Math.cos(s.angle) * 13, s.y + Math.sin(s.angle) * 13, s.angle + rnd(-0.05, 0.05), 780, dmg, 's', soldierBulletColor());
      s.fireCd = Math.max(0.5, 0.9 - 0.05 * G.skills.squad) * (hasCombo('gunner') ? 0.75 : 1) * (legion ? 0.7 : 1);
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
    touch: base.touch * Math.min(3.2, 1 + G.time / 260),
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
    born: G ? G.time : 0,
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
  burst(boss.x, boss.y, 2, boss.mega ? '#c042e6' : '#ff5a4a', 0, boss.r * 1.6, 0.6, 'ring');
  burst(boss.x, boss.y, 1, '#ffd27a', 0, boss.r * 1.1, 0.5, 'glow');
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
    burst(x, y, 2, mega ? '#c042e6' : '#ff5a4a', 0, boss.r * 1.6, 0.6, 'ring');
    burst(x, y, 1, '#ffd27a', 0, boss.r * 1.1, 0.5, 'glow');
    burst(x, y, 18, mega ? '#c9a8ff' : '#ff8a5c', 260, 3.0, 0.5, 'spark');
    shake = Math.max(shake, settings.shake ? (mega ? 14 : 9) : 0);
    sfx.bossRoar();
  }
  return boss;
}

function bossActive() {
  return !!(G && G.enemies.some((e) => e.boss && !e.dead));
}

function hordePressure() {
  return bossActive() ? 0.55 : 1;
}

const SURGE_EVERY = 200;

function spawnSurge() {
  const count = Math.min(10 + 2 * G.surgeIdx, 150 - G.enemies.length);
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * TAU + rnd(0, 0.2);
    const r = rnd(460, 560);
    spawnEnemyAt(pickEnemyType(G.time), G.player.x + Math.cos(a) * r, G.player.y + Math.sin(a) * r);
  }
  G.banner = 'SURGE · WAVE ' + G.surgeIdx;
  G.bannerSub = count + ' HOSTILES INBOUND';
  G.bannerT = 2.8;
  G.news = 'Surge wave ' + G.surgeIdx + ': ' + count + ' hostiles inbound.';
  sfx.victory();
}

function eventPool() {
  return ['surge', 'supply', 'bounty', MAP_DISASTER[(G && G.map) || 'desert'] || 'sandstorm'];
}

function updateSurge() {
  if (!G || G.mode === 'bossrush') return;
  const idx = Math.floor(G.time / SURGE_EVERY);
  if (idx > G.surgeIdx) {
    G.surgeIdx = idx;
    if (bossActive()) {
      G.surgePending = true;
      return;
    }
    spawnSurge();
  }
  if (G.surgePending && !bossActive()) {
    G.surgePending = false;
    spawnSurge();
  }
}

function updateSpawner(dt) {
  if (G.mode === 'bossrush') return;
  G.cds.spawn -= dt;
  if (G.cds.spawn > 0) return;
  const ready = Math.max(0.2, 1.05 - G.time * 0.008) / (G.diff ? G.diff.spawn : 1) / (hasMutator('swarm') ? 1.5 : 1) / hordePressure();
  G.cds.spawn = ready;
  const cap = 150;
  if (G.enemies.length >= cap) return;
  const batch = Math.max(1, 1 + Math.min(3, Math.floor(G.time / 60)) - (bossActive() ? 1 : 0));
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

  const storm = !!(G.event && WEATHER_IDS.indexOf(G.event.id) >= 0);
  const px = G.player.x;
  const py = G.player.y;
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
    const dx = px - e.x;
    const dy = py - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    let vx = ux;
    let vy = uy;
    let speed = e.speed * (e.rageT > 0 ? 1.3 : 1);
    const eHz = HAZARDS[hazardAt(e.x, e.y)];
    if (eHz && eHz.enemySpeed) speed *= eHz.enemySpeed;
    if (storm) speed *= 1.2;

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

function enemyGrid(cell) {
  const grid = new Map();
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const k = Math.floor(e.x / cell) + ',' + Math.floor(e.y / cell);
    let arr = grid.get(k);
    if (!arr) {
      arr = [];
      grid.set(k, arr);
    }
    arr.push(e);
  }
  return grid;
}

function pushPair(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.r + b.r - 2;
  const d2 = dx * dx + dy * dy;
  if (d2 > 0.0001 && d2 < min * min) {
    const d = Math.sqrt(d2);
    const push = (min - d) / 2;
    const ux = dx / d;
    const uy = dy / d;
    a.x -= ux * push;
    a.y -= uy * push;
    b.x += ux * push;
    b.y += uy * push;
  }
}

function separateEnemies() {
  const CELL = 80;
  const list = G.enemies;
  const grid = enemyGrid(CELL);
  grid.forEach((arr, key) => {
    const sep = key.indexOf(',');
    const cx = Number(key.slice(0, sep));
    const cy = Number(key.slice(sep + 1));
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) pushPair(arr[i], arr[j]);
    }
    const neighbors = [
      grid.get(cx + 1 + ',' + cy),
      grid.get((cx - 1) + ',' + (cy + 1)),
      grid.get(cx + ',' + (cy + 1)),
      grid.get((cx + 1) + ',' + (cy + 1))
    ];
    for (const other of neighbors) {
      if (!other) continue;
      for (const a of arr) {
        for (const b of other) pushPair(a, b);
      }
    }
  });
  G.egrid = grid;
}

function updateBullets(dt) {
  const ricochetBest = (220 + 12 * ((G && G.skills.ricochet) || 0)) * (220 + 12 * ((G && G.skills.ricochet) || 0));
  const grid = G.egrid || enemyGrid(80);
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
      if (bulletBlocked(x0, y0, b.x, b.y)) {
        b.dead = true;
        burst(b.x, b.y, 4, '#c9b89a', 120, 1.6, 0.2);
        continue;
      }
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
    for (const obj of G.interact) {
      if (obj.dead || obj.kind !== 'barrel') continue;
      if (segHitsCircle(x0, y0, b.x, b.y, obj.x, obj.y, 13)) {
        obj.dead = true;
        explodeAt(obj.x, obj.y, 88, 100 * damageMult(), '#ff8a5c', 'p');
        fxBurst(obj.x, obj.y, 10, '#ff8a5c', 260, 3.2, 0.45, 'spark');
        b.pierce = 0;
        b.dead = true;
        break;
      }
    }
    if (b.dead) continue;
    const minX = Math.min(x0, b.x) - 64;
    const maxX = Math.max(x0, b.x) + 64;
    const minY = Math.min(y0, b.y) - 64;
    const maxY = Math.max(y0, b.y) + 64;
    for (let gx = Math.floor(minX / 80); gx <= Math.floor(maxX / 80); gx++) {
      for (let gy = Math.floor(minY / 80); gy <= Math.floor(maxY / 80); gy++) {
        const arr = grid.get(gx + ',' + gy);
        if (!arr) continue;
        for (const e of arr) {
          if (e.dead || b.hits.indexOf(e) >= 0) continue;
          if (segHitsCircle(x0, y0, b.x, b.y, e.x, e.y, e.r + 4)) {
        b.hits.push(e);
        damageEnemy(e, b.dmg, b.x, b.y, b.crit);
        if (b.pierce > 0) {
          b.pierce--;
        } else if (b.bounces > 0) {
          let next = null;
          let best = ricochetBest;
          for (const o of G.enemies) {
            if (o.dead || o === e || b.hits.indexOf(o) >= 0) continue;
            const dx = b.x - o.x;
            const dy = b.y - o.y;
            const d = dx * dx + dy * dy;
            if (d < best) {
              best = d;
              next = o;
            }
          }
          if (next) {
            b.bounces--;
            b.ang = Math.atan2(next.y - b.y, next.x - b.x);
            const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 800;
            b.vx = Math.cos(b.ang) * speed;
            b.vy = Math.sin(b.ang) * speed;
            b.life = Math.max(b.life, 0.6);
            if (hasEvolution('ricochet')) b.dmg *= 1.25;
            G.stats.ricochets++;
            burst(b.x, b.y, 3, '#7fe8ff', 150, 2, 0.22, 'spark');
            continue;
          }
          b.dead = true;
          break;
        } else {
          b.dead = true;
          break;
        }
      }
        }
      }
    }
  }
  G.bullets = G.bullets.filter((b) => !b.dead);
  G.enemies = G.enemies.filter((e) => !e.dead);
}

function addDecal(x, y, r) {
  G.decals.push({ x, y, r, life: 9, max: 9, seed: hash2(Math.round(x), Math.round(y)) });
  if (G.decals.length > 12) G.decals.shift();
}

function explodeAt(x, y, radius, dmg, color, owner) {
  addDecal(x, y, radius * 0.6);
  burst(x, y, 1, '#ffd27a', 0, radius * 0.85, 0.35, 'ring');
  burst(x, y, 1, '#fff3d0', 60, radius * 0.5, 0.22, 'glow');
  burst(x, y, 14, color || '#ffb066', 320, 3.4, 0.45, 'spark');
  burst(x, y, 6, '#4a4038', 150, 8.5, 0.85, 'smoke');
  shake = Math.max(shake, settings.shake ? 8 : 0);
  sfx.boom();
  if (owner === 'e') {
    if (dist2(x, y, G.player.x, G.player.y) < radius * radius) damagePlayer(dmg);
    return;
  }
  if (!(dmg > 0)) return;
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
    ctx.strokeStyle = 'rgba(159,216,255,' + Math.max(0.06, 0.34 - 0.04 * i) + ')';
    ctx.lineWidth = i === 0 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(G.player.x, G.player.y, 24 + i * 5, 0, TAU);
    ctx.stroke();
  }
}

function throwBomb() {
  if (!G || G.bomb.cd > 0) return false;
  const RANGE = 550;
  let best = null;
  let bestScore = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (dist2(e.x, e.y, G.player.x, G.player.y) > RANGE * RANGE) continue;
    let score = 0;
    for (const o of G.enemies) {
      if (o.dead) continue;
      if (dist2(e.x, e.y, o.x, o.y) < 140 * 140) score += o.boss ? 4 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  const tx = best ? best.x : G.player.x + Math.cos(G.player.angle) * 220;
  const ty = best ? best.y : G.player.y + Math.sin(G.player.angle) * 220;
  const lvl = G.skills.grenade;
  const throws = hasEvolution('grenade') ? 2 : 1;
  for (let i = 0; i < throws; i++) {
    G.bombs.push({
      x: G.player.x,
      y: G.player.y,
      tx,
      ty,
      t: 0.85 + i * 0.15,
      max: 0.85 + i * 0.15,
      radius: (95 + 8 * lvl) * blastMult(),
      dmg: (70 + 12 * lvl) * damageMult() * (hasRelic('warhead') ? 1.2 : 1),
      owner: 'p',
      color: '#ffb066'
    });
    G.stats.bombs++;
  }
  G.bomb.max = Math.max(2.5, 6 - 0.4 * lvl);
  G.bomb.cd = G.bomb.max;
  sfx.throwBomb();
  return true;
}

function dmgColorFor(dealt, maxHp) {
  const frac = maxHp > 0 ? dealt / maxHp : 0;
  if (frac >= 0.4) return { color: '#ff4d3d', size: 16 };
  if (frac >= 0.2) return { color: '#ff9a3c', size: 14 };
  if (frac >= 0.08) return { color: '#ffd27a', size: 12 };
  return { color: '#f4efe2', size: 11 };
}

function gemStyleFor(tier) {
  if (tier === 1) return { shape: 'star', color: '#ffd76a', size: 7.5, glow: 0.3 };
  if (tier === 2) return { shape: 'hex', color: '#b78cff', size: 6, glow: 0.22 };
  return { shape: 'diamond', color: '#2fe8b0', size: 4.5, glow: 0.12 };
}

function damageEnemy(e, dmg, x, y, crit, splash) {
  if (e.dead) return;
  if (e.burrowed) return;
  if (e.ghost) return;
  if (!(dmg > 0)) return;
  if (splash === undefined) splash = true;
  let dealt = dmg;
  if (e.type === 'warden' && !crit) dealt *= 0.55;
  if (e.affix === 'shielded') dealt *= 0.7;
  if (e.auraShield) dealt *= 0.75;
  e.hp -= dealt;
  e.flash = 0.08;
  G.damageDealt += dealt;
  if (settings.damageNumbers) {
    const value = Math.round(dealt);
    const dc = dmgColorFor(dealt, e.maxHp);
    spawnFloater(x, y - e.r, (crit ? '!' : '') + '-' + value, dc.color, crit ? Math.max(16, dc.size) : dc.size);
  }
  burst(x, y, 2, dmgColorFor(dealt, e.maxHp).color, 200, 2.6, 0.22, 'spark');
  if (crit) sfx.crit();
  if (G.skills.lifesteal > 0 || hasRelic('bloodstone')) {
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
  if (e.hp <= 0) {
    const over = Math.max(0, -e.hp);
    killEnemy(e);
    if (splash && over > 0) {
      const targets = G.enemies
        .filter((o) => !o.dead && o !== e)
        .map((o) => ({ o, d: Math.hypot(o.x - e.x, o.y - e.y) }))
        .filter((t) => t.d < 90)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2);
      for (const t of targets) {
        damageEnemy(t.o, over * 0.3, t.o.x, t.o.y, false, false);
      }
    }
  }
}

function announceCallout(text, sub, color, dur) {
  if (!G) return;
  const max = dur || 2.4;
  G.callout = { text, sub: sub || '', color: color || '#ffd27a', t: max, max };
}

function flashScreen(color, time) {
  if (!settings.flashes) return;
  G.flashT = time;
  G.flashColor = color;
}

function evaluateLastStand() {
  if (!G) return;
  if (G.hp > 0 && G.hp <= G.maxHp * 0.1) {
    if (!G.lastStand) {
      G.lastStand = true;
      announceCallout('LAST STAND', '10% HEALTH · +50% DAMAGE · MORE RISK', '#ff4a3a', 3.2);
      flashScreen('#ff2a1a', 0.4);
      sfx.lastStand();
    }
  } else if (G.hp > G.maxHp * 0.12) {
    G.lastStand = false;
  }
}

function checkKillMilestones() {
  while (G.milestoneIdx < STREAK_TIERS.length && G.kills >= STREAK_TIERS[G.milestoneIdx].kills) {
    const tier = STREAK_TIERS[G.milestoneIdx];
    G.milestoneIdx++;
    G.score += tier.kills * 5;
    announceCallout(tier.name, tier.kills + ' TOTAL KILLS · +' + tier.kills * 5 + ' SCORE', tier.color, 3);
    flashScreen(tier.color, 0.35);
    sfx.milestone(G.milestoneIdx);
    save.milestones = save.milestones || {};
    save.milestones[tier.name] = (save.milestones[tier.name] || 0) + 1;
  }
}

function checkStreakRewards() {
  while (G.rewardIdx < STREAK_REWARDS.length && G.streak >= STREAK_REWARDS[G.rewardIdx].at) {
    const reward = STREAK_REWARDS[G.rewardIdx];
    G.rewardIdx++;
    triggerStreakReward(reward);
  }
}

function grantRankReward(rank) {
  if (!G) return;
  switch (rank.id) {
    case 'corporal':
      G.rerolls++;
      break;
    case 'sergeant':
      for (let i = 0; i < 2; i++) G.medkits.push({ x: G.player.x + rnd(-50, 50), y: G.player.y + rnd(-50, 50) });
      break;
    case 'lieutenant':
      addUnbanked(50);
      break;
    case 'captain':
      G.rerolls++;
      G.banishes++;
      break;
    case 'major':
      addUnbanked(100);
      break;
    case 'colonel':
      G.rerolls += 2;
      break;
    case 'general':
      addUnbanked(200);
      break;
    default:
      break;
  }
}

function checkRank() {
  if (!G) return;
  while (G.rankIdx + 1 < RANKS.length && G.kills >= RANKS[G.rankIdx + 1].kills) {
    G.rankIdx++;
    const rank = RANKS[G.rankIdx];
    G.score += 100 * G.rankIdx;
    grantRankReward(rank);
    announceCallout('PROMOTED · ' + rank.name, rank.blurb + ' · +' + 100 * G.rankIdx + ' SCORE', '#ffd27a', 3);
    G.news = 'Promoted to ' + rank.name + ': ' + rank.blurb + '.';
    if (rank.id === 'general') flashScreen('#ffd27a', 0.5);
    sfx.reward();
  }
}

function fireRadioStrike() {
  if (!G || G.radioArmed <= 0) return false;
  G.radioArmed--;
  G.airstrike = { t: 0, n: 10, x: G.player.x, y: G.player.y, ang: G.player.angle };
  G.score += 100;
  announceCallout('RADIO STRIKE', 'FIELD RADIO · +100 SCORE', '#ffcf5c', 2.8);
  flashScreen('#ffcf5c', 0.3);
  G.news = 'Radio strike inbound.';
  sfx.reward();
  return true;
}

function triggerStreakReward(reward) {
  G.score += 150;
  G.streakRewards.push(reward.id);
  announceCallout(reward.name, 'KILL STREAK REWARD · +150 SCORE', reward.color, 2.8);
  flashScreen(reward.color, 0.3);
  sfx.reward();
  if (reward.id === 'supply') {
    for (let i = 0; i < 3; i++) G.medkits.push({ x: G.player.x + rnd(-50, 50), y: G.player.y + rnd(-50, 50) });
    const kinds = Object.keys(CHIPS);
    for (let i = 0; i < 2; i++) {
      G.chips.push({ x: G.player.x + rnd(-60, 60), y: G.player.y + rnd(-60, 60), kind: kinds[Math.floor(srnd() * kinds.length)], spin: 0 });
    }
    G.news = 'Supply drop landed.';
  } else if (reward.id === 'airstrike') {
    G.airstrike = { t: 0, n: 10, x: G.player.x, y: G.player.y, ang: G.player.angle };
    G.news = 'Airstrike inbound.';
  } else if (reward.id === 'heli') {
    G.heli = { t: 14, cd: 0, ang: 0 };
    G.news = 'Attack helicopter on station.';
  } else if (reward.id === 'missile') {
    G.missiles = { t: 0, n: 18 };
    G.news = 'Missile barrage authorized.';
  }
}

function updateRewards(dt) {
  if (G.airstrike) {
    const a = G.airstrike;
    a.t -= dt;
    if (a.t <= 0) {
      a.t = 0.14;
      const ang = a.ang + rnd(-0.7, 0.7);
      const dist = rnd(80, 520);
      explodeAt(a.x + Math.cos(ang) * dist, a.y + Math.sin(ang) * dist, 95, 60 * damageMult(), '#ffcf5c', 'p');
      shake = Math.max(shake, settings.shake ? 5 : 0);
      a.n--;
      if (a.n <= 0) G.airstrike = null;
    }
  }
  if (G.missiles) {
    const m = G.missiles;
    m.t -= dt;
    if (m.t <= 0) {
      m.t = 0.12;
      const a = rnd(0, TAU);
      const d = rnd(60, 560);
      explodeAt(G.player.x + Math.cos(a) * d, G.player.y + Math.sin(a) * d, 120, 85 * damageMult(), '#ff8a5c', 'p');
      shake = Math.max(shake, settings.shake ? 7 : 0);
      m.n--;
      if (m.n <= 0) G.missiles = null;
    }
  }
  if (G.heli) {
    const h = G.heli;
    h.t -= dt;
    h.ang += dt * 1.4;
    h.cd -= dt;
    const hx = G.player.x + Math.cos(h.ang) * 90;
    const hy = G.player.y + Math.sin(h.ang) * 90;
    if (h.cd <= 0) {
      const target = nearestEnemy(hx, hy, 560);
      if (target) {
        spawnBullet(hx, hy, Math.atan2(target.y - hy, target.x - hx), 900, 24 * damageMult(), 'p', '#9fd8ff');
        h.cd = 0.32;
      } else {
        h.cd = 0.2;
      }
    }
    if (h.t <= 0) G.heli = null;
  }
}

function maybeSpawnWarChest(wave) {
  if (!G || G.warChest || wave < 3 || wave % 3 !== 0) return;
  const ang = rnd(0, TAU);
  const d = rnd(420, 760);
  const need = 20 + wave * 4;
  G.warChest = {
    x: G.player.x + Math.cos(ang) * d,
    y: G.player.y + Math.sin(ang) * d,
    need,
    startKills: G.kills,
    spin: 0,
    deniedCd: 0
  };
  G.news = 'WAR CHEST SIGNAL · ' + need + ' kills to crack it.';
  announceCallout('WAR CHEST', 'HIDDEN CACHE · KILL ' + need + ' MORE', '#63dcc0', 2.8);
}

function openWarChest() {
  const c = G.warChest;
  if (!c || c.open) return false;
  c.open = true;
  const payout = 40 + G.wave * 8;
  addUnbanked(payout);
  G.hp = Math.min(G.maxHp, G.hp + 45);
  G.stats.healing += 45;
  G.stats.warChests = (G.stats.warChests || 0) + 1;
  const kinds = Object.keys(CHIPS);
  for (let i = 0; i < 4; i++) {
    G.chips.push({ x: c.x + rnd(-40, 40), y: c.y + rnd(-40, 40), kind: kinds[Math.floor(srnd() * kinds.length)], spin: 0 });
  }
  G.chests.push({ x: c.x, y: c.y, spin: 0 });
  G.score += 750;
  announceCallout('WAR CHEST', 'MILITARY CACHE · +' + payout + ' SHARDS · +750 SCORE', '#63dcc0', 3.2);
  sfx.reward();
  G.warChest = null;
  return true;
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  G.kills++;
  G.killsByType[e.type] = (G.killsByType[e.type] || 0) + 1;
  G.streak += 1;
  G.streakT = 2.6;
  G.score += Math.round((8 + e.xp * 3) * (1 + G.streak * 0.01));
  if (G.streak > G.bestStreak) G.bestStreak = G.streak;
  checkRank();
  checkKillMilestones();
  checkStreakRewards();
  G.recentKills = (G.recentKills || []).filter((t) => G.time - t < 1);
  G.recentKills.push(G.time);
  if (G.recentKills.length >= 3) {
    G.hp = Math.min(G.maxHp, G.hp + 1);
    G.stats.healing += 1;
    G.recentKills = [];
    spawnFloater(G.player.x, G.player.y - 20, 'BLOODLUST +1', '#ff7a6a', 11);
    fxBurst(G.player.x, G.player.y, 6, '#ff7a6a', 160, 2.4, 0.3, 'spark');
  }
  G.momentum = Math.min(1, (G.momentum || 0) + 0.06);
  G.hitStop = Math.max(G.hitStop || 0, 0.035);
  if (G.kills % 25 === 0) {
    explodeAt(G.player.x, G.player.y, 130, 0, '#ffd27a', 'p');
    for (const en of G.enemies) {
      if (en.dead) continue;
      if (Math.hypot(en.x - G.player.x, en.y - G.player.y) < 150) {
        damageEnemy(en, 40 * damageMult(), en.x, en.y, true);
      }
    }
    G.banner = 'FINISHER';
    G.bannerSub = '25 KILLS · SHOCKWAVE';
    G.bannerT = 1.6;
    fxBurst(G.player.x, G.player.y, 1, '#ffd27a', 0, 140, 0.45, 'ring');
  }
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
  if (srnd() < 0.05) {
    G.overcharges.push({ x: e.x, y: e.y, spin: 0 });
    spawnFloater(e.x, e.y - e.r - 10, 'OVERCHARGE', '#9fd8ff', 12);
  }
  checkAchievements();

  if (isOperator('arcanist') && !e.boss && !e.arcSource && G.kills % 4 === 0) {
    const target = nearestEnemy(e.x, e.y, 190);
    if (target) {
      target.arcSource = true;
      G.stats.arcs = (G.stats.arcs || 0) + 1;
      spawnFloater(target.x, target.y - target.r - 10, 'ARC', '#c39bff', 12);
      fxBurst(target.x, target.y, 1, '#c39bff', 0, 30, 0.28, 'ring');
      G.arcs.push({ x1: e.x, y1: e.y, x2: target.x, y2: target.y, t: 0.28, max: 0.28, seed: hash2(Math.round(e.x), Math.round(e.y)) * TAU });
      sfx.arc();
      damageEnemy(target, Math.min(160, 12 + e.maxHp * 0.4) * damageMult(), target.x, target.y, false, false);
      target.arcSource = false;
    }
  }

  if (G.streak % 10 === 0) {
    sfx.combo(G.streak);
    spawnFloater(e.x, e.y - e.r - 20, G.streak + ' STREAK  x' + streakMult().toFixed(2), '#ffd27a', 15);
  }
  if (Math.random() < 0.03) G.medkits.push({ x: e.x, y: e.y });

  if (e.champion) {
    G.stats.champions = (G.stats.champions || 0) + 1;
    G.chests.push({ x: e.x, y: e.y, spin: 0 });
    G.dice.push({ x: e.x + rnd(-24, 24), y: e.y + rnd(-24, 24), spin: 0, pips: 1 + Math.floor(fxRnd() * 6) });
    if (Math.random() < 0.25) G.radios.push({ x: e.x + rnd(-32, 32), y: e.y + rnd(-32, 32), spin: 0 });
    const affix = CHAMPION_AFFIXES.find((a) => a.id === e.affix);
    spawnFloater(e.x, e.y - e.r - 26, (affix ? affix.name + ' CHAMPION DOWN' : 'CHAMPION DOWN'), '#ffd27a', 15);
    if (e.affix === 'volatile') {
      explodeAt(e.x, e.y, 96, 26 * (1 + G.time / 240), '#ff8a5c', 'e');
    }
  } else if (Math.random() < 0.006) {
    G.chests.push({ x: e.x, y: e.y, spin: 0 });
  }
  if (!e.champion && Math.random() < 0.004) {
    G.dice.push({ x: e.x, y: e.y, spin: 0, pips: 1 + Math.floor(fxRnd() * 6) });
  }
  if (!e.champion && Math.random() < 0.003) {
    G.radios.push({ x: e.x, y: e.y, spin: 0 });
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
    G.score += mega ? 2500 : 1000;
    announceCallout(def.name + ' DOWN', (mega ? 'MEGA BOSS' : 'BOSS') + ' BONUS · +' + (mega ? 2500 : 1000) + ' SCORE', '#ffd27a', 2.8);
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
  burst(e.x, e.y, e.boss ? 12 : 13, '#8a1f24', e.boss ? 280 : 210, 3.8, 0.5, 'shard');
  burst(e.x, e.y, 6, '#2a1a12', 140, 7.5, 0.7, 'smoke');
  if (e.boss) burst(e.x, e.y, 1, '#ffd27a', 0, e.r * 2.6, 0.5, 'ring');
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
    (isOperator('vanguard') ? 0.9 : 1) *
    (1 - 0.03 * (save.meta.resolve || 0));
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
    if (G.mutation === 'explosive') {
      explodeAt(G.player.x, G.player.y, 190 * blastMult(), 120 * damageMult(), '#ff8a5c', 'p');
      fxBurst(G.player.x, G.player.y, 1, '#ff8a5c', 0, 190, 0.6, 'ring');
    }
    burst(G.player.x, G.player.y, 30, '#8a1f24', 260, 4, 0.7);
    gameOver();
    return;
  }
  evaluateLastStand();
}

function applyDie(die) {
  G.stats.dice = (G.stats.dice || 0) + 1;
  if (Math.random() < 0.65) {
    G.rerolls++;
    spawnFloater(die.x, die.y - 14, '+1 REROLL', '#ffd27a', 13);
    G.news = 'Lucky die: +1 reroll.';
  } else {
    G.banishes++;
    spawnFloater(die.x, die.y - 14, '+1 BANISH', '#ff8a5c', 13);
    G.news = 'Lucky die: +1 banish.';
  }
  sfx.pick(G.streak);
}

function updatePickups(dt) {
  const pr = magnetRadius();
  for (const gem of G.gems) {
    gem.spin += dt * 4;
    const dx = G.player.x - gem.x;
    const dy = G.player.y - gem.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
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
      fxBurst(gem.x, gem.y, 3, '#7fe8c8', 140, 2.2, 0.28, 'spark');
      addXp((gem.value + bonus) * xpMult());
      sfx.pick(G.streak);
    }
  }
  G.gems = G.gems.filter((g) => !g.dead && dist2(g.x, g.y, G.player.x, G.player.y) < 2200 * 2200);
  if (G.gems.length > 400) G.gems.splice(0, G.gems.length - 400);
  for (const chip of G.chips) {
    chip.spin += dt * 3;
    const dx = G.player.x - chip.x;
    const dy = G.player.y - chip.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < pr) {
      const pull = 200 + (1 - d / pr) * 340;
      chip.x += (dx / d) * pull * dt;
      chip.y += (dy / d) * pull * dt;
    }
    if (d < 26) {
      chip.dead = true;
      fxBurst(chip.x, chip.y, 5, (CHIPS[chip.kind] || CHIPS.shards).color, 170, 2.4, 0.32, 'spark');
      applyChip(chip.kind);
    }
  }
  G.chips = G.chips.filter((c) => !c.dead && dist2(c.x, c.y, G.player.x, G.player.y) < 2200 * 2200);
  if (G.chips.length > 120) G.chips.splice(0, G.chips.length - 120);
  for (const chest of G.chests) {
    chest.spin += dt * 2.4;
    const dx = G.player.x - chest.x;
    const dy = G.player.y - chest.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < pr) {
      const pull = 170 + (1 - d / pr) * 260;
      chest.x += (dx / d) * pull * dt;
      chest.y += (dy / d) * pull * dt;
    }
    if (d < 30) {
      chest.dead = true;
      fxBurst(chest.x, chest.y, 6, '#ffd27a', 180, 2.6, 0.38, 'spark');
      openChest();
    }
  }
  G.chests = G.chests.filter((c) => !c.dead && dist2(c.x, c.y, G.player.x, G.player.y) < 2200 * 2200);
  if (G.chests.length > 20) G.chests.splice(0, G.chests.length - 20);
  for (const die of G.dice) {
    die.spin += dt * 2.6;
    const dx = G.player.x - die.x;
    const dy = G.player.y - die.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < pr) {
      const pull = 170 + (1 - d / pr) * 260;
      die.x += (dx / d) * pull * dt;
      die.y += (dy / d) * pull * dt;
    }
    if (d < 26) {
      die.dead = true;
      fxBurst(die.x, die.y, 5, '#f4efe2', 170, 2.4, 0.32, 'spark');
      applyDie(die);
    }
  }
  G.dice = G.dice.filter((c) => !c.dead && dist2(c.x, c.y, G.player.x, G.player.y) < 2200 * 2200);
  if (G.dice.length > 20) G.dice.splice(0, G.dice.length - 20);
  for (const radio of G.radios) {
    radio.spin += dt * 2.4;
    const dx = G.player.x - radio.x;
    const dy = G.player.y - radio.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < pr) {
      const pull = 170 + (1 - d / pr) * 260;
      radio.x += (dx / d) * pull * dt;
      radio.y += (dy / d) * pull * dt;
    }
    if (d < 26) {
      radio.dead = true;
      G.radioArmed++;
      G.stats.radio = (G.stats.radio || 0) + 1;
      fxBurst(radio.x, radio.y, 5, '#9fd8ff', 170, 2.4, 0.32, 'spark');
      spawnFloater(radio.x, radio.y - 14, 'RADIO +1 · T TO CALL', '#9fd8ff', 13);
      G.news = 'Field radio recovered. Press T to call the plane.';
      sfx.reward();
    }
  }
  G.radios = G.radios.filter((c) => !c.dead && dist2(c.x, c.y, G.player.x, G.player.y) < 2200 * 2200);
  if (G.radios.length > 10) G.radios.splice(0, G.radios.length - 10);
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
      if (G.mode === 'ops' && G.time >= 570) {
        addUnbanked(200);
        G.news = 'Clean extract: +200 shards.';
        winRun();
        return;
      }
    }
  }
  for (const kit of G.medkits) {
    kit.spin = (kit.spin || 0) + dt * 2;
    const dx = G.player.x - kit.x;
    const dy = G.player.y - kit.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < pr) {
      const pull = 200 + (1 - d / pr) * 340;
      kit.x += (dx / d) * pull * dt;
      kit.y += (dy / d) * pull * dt;
    }
    if (d < 24) {
      kit.dead = true;
      G.hp = Math.min(G.maxHp, G.hp + 30);
      G.stats.healing += 30;
      fxBurst(kit.x, kit.y, 5, '#7fe0a0', 140, 2.4, 0.32, 'spark');
      spawnFloater(kit.x, kit.y - 12, '+30 HP', '#7fe0a0', 13);
      sfx.heal();
    }
  }
  G.medkits = G.medkits.filter((k) => !k.dead && dist2(k.x, k.y, G.player.x, G.player.y) < 2200 * 2200);
  if (G.medkits.length > 40) G.medkits.splice(0, G.medkits.length - 40);
  for (const oc of G.overcharges) {
    oc.spin = (oc.spin || 0) + dt * 3;
    const dx = G.player.x - oc.x;
    const dy = G.player.y - oc.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < pr) {
      const pull = 220 + (1 - d / pr) * 360;
      oc.x += (dx / d) * pull * dt;
      oc.y += (dy / d) * pull * dt;
    }
    if (d < 24) {
      oc.dead = true;
      G.overchargeT = 8;
      fxBurst(oc.x, oc.y, 6, '#9fd8ff', 180, 2.6, 0.35, 'spark');
      spawnFloater(oc.x, oc.y - 12, 'OVERCHARGE · 8s', '#9fd8ff', 13);
      sfx.upgrade();
    }
  }
  G.overcharges = G.overcharges.filter((o) => !o.dead && dist2(o.x, o.y, G.player.x, G.player.y) < 2200 * 2200);
}

function updateParticles(dt) {
  const drag = Math.pow(0.45, dt * 6);
  for (const p of G.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.vy *= drag;
    p.rot += (p.spin || 0) * dt;
    p.life -= dt;
  }
  G.particles = G.particles.filter((p) => p.life > 0);
  for (const a of G.arcs) a.t -= dt;
  G.arcs = G.arcs.filter((a) => a.t > 0);
  for (const a of G.afterimages) a.life -= dt;
  G.afterimages = G.afterimages.filter((a) => a.life > 0);
  for (const d of G.decals) d.life -= dt;
  G.decals = G.decals.filter((d) => d.life > 0);
  for (const f of G.floaters) {
    f.y -= 28 * dt;
    f.life -= dt;
  }
  G.floaters = G.floaters.filter((f) => f.life > 0);
}

function levelOffers() {
  const picks = [];
  for (const skill of Object.keys(EVOLUTIONS)) {
    if (G.evoReady[skill] && !G.evolved[skill]) picks.push('evo:' + skill);
    if (picks.length >= 3) return picks;
  }
  const copy = upgradablePool();
  const primary = primarySkill();
  while (picks.length < 3 && copy.length > 0) {
    const weights = copy.map((id) => {
      if (G.skills[id] > 0) return 2;
      if (
        SKILLS[id].kind === 'weapon' &&
        WEAPON_ARCHETYPE[id] &&
        WEAPON_ARCHETYPE[primary] &&
        WEAPON_ARCHETYPE[id] !== WEAPON_ARCHETYPE[primary]
      )
        return 0.5;
      return 1;
    });
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
  if (
    picks.length === 3 &&
    picks.every((p) => p.indexOf('evo:') !== 0) &&
    G.soldiers.length === 0 &&
    G.level >= 3 &&
    upgradablePool().indexOf('squad') >= 0 &&
    picks.indexOf('squad') < 0
  )
    picks[2] = 'squad';
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
  if (typeof id === 'string' && id.indexOf('evo:') === 0) {
    G.news = 'Evolutions cannot be banished — evolve or reroll.';
    sfx.denied();
    return false;
  }
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
      if (combo.secret) {
        save.secrets = save.secrets || [];
        if (save.secrets.indexOf(combo.id) < 0) save.secrets.push(combo.id);
        announceCallout('SECRET COMBO', combo.name + ' · ' + combo.desc, '#ff8ad8', 3);
        flashScreen('#ff8ad8', 0.3);
        sfx.reward();
      } else {
        G.banner = combo.name;
        G.bannerSub = 'SKILL COMBO · ' + combo.desc;
        G.bannerT = 2.2;
        sfx.upgrade();
      }
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
  if (typeof id === 'string' && id.indexOf('evo:') === 0) {
    applyEvolution(id.slice(4));
  } else {
    applyUpgrade(id);
  }
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

function dashMax() {
  return 1 + Math.floor((G ? G.skills.dashPower : 0) / 3);
}

function dashTime() {
  return 0.18 + 0.008 * (G ? G.skills.dashPower : 0);
}

function updateRun(dt) {
  if (G.hitStop > 0) {
    G.hitStop = Math.max(0, G.hitStop - dt);
    return;
  }
  G.time += dt;
  updateRooms();
  if (G.mode === 'ops' && !G.opBeacon && G.time >= 570) {
    G.opBeacon = true;
    const a = rnd(0, TAU);
    spawnBeacon(G.player.x + Math.cos(a) * 250, G.player.y + Math.sin(a) * 250);
    G.news = 'Extraction window open: reach the beacon.';
    G.banner = 'EXTRACT NOW';
    G.bannerSub = 'EARLY EXTRACT +200 SHARDS';
    G.bannerT = 2.8;
  }
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
      if (wave % BOSS_EVERY === 0 && !bossActive()) spawnBoss();
      maybeSpawnWarChest(wave);
    }
  }
  G.bannerT = Math.max(0, G.bannerT - dt);
  G.invulnT = Math.max(0, G.invulnT - dt);
  G.hurtT = Math.max(0, G.hurtT - dt);
  G.slowT = Math.max(0, G.slowT - dt);
  G.overchargeT = Math.max(0, (G.overchargeT || 0) - dt);
  if (shieldMax() > 0 && G.shield.charges < shieldMax()) {
    G.shield.t -= dt;
    if (G.shield.t <= 0) {
      G.shield.charges = Math.min(shieldMax(), G.shield.charges + 1);
      G.shield.t = shieldRefill();
    }
  }
  G.streakT = Math.max(0, G.streakT - dt);
  if (G.streakT <= 0 && G.streak > 0) G.streak = 0;
  G.momentum = Math.max(0, (G.momentum || 0) - 0.4 * dt);
  if (G.callout) G.callout.t = Math.max(0, G.callout.t - dt);
  G.flashT = Math.max(0, G.flashT - dt);
  evaluateLastStand();
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
    const ids = eventPool();
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
  if (touchStick.active) {
    mx += touchStick.vx;
    my += touchStick.vy;
  }
  let len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }

  G.dash.cd = Math.max(0, G.dash.cd - dt);
  if (G.dash.charges > dashMax()) G.dash.charges = dashMax();
  if (G.dash.cd <= 0 && G.dash.charges < dashMax()) {
    G.dash.charges++;
    G.dash.cd = G.dash.charges < dashMax() ? 1.5 : 0;
  }
  const dashHeld = !!(keys['shift'] || keys[' ']);
  if (dashHeld && !G.dash.held && G.dash.charges > 0 && len > 0) {
    G.dash.charges--;
    G.dash.t = dashTime();
    if (G.dash.cd <= 0) G.dash.cd = 1.5;
    G.dash.dx = mx;
    G.dash.dy = my;
    G.invulnT = Math.max(G.invulnT, 0.3);
    G.stats.dashes++;
    burst(G.player.x, G.player.y, 8, '#9fd8ff', 140, 3.0, 0.3, 'spark');
    fxBurst(G.player.x, G.player.y, 1, '#9fd8ff', 0, 30, 0.3, 'ring');
    sfx.swap();
  }
  G.dash.held = dashHeld;

  if (G.dash.t > 0) {
    G.dash.t = Math.max(0, G.dash.t - dt);
    const boost = playerSpeed() * 3.4;
    moveWithSolids(G.player, G.dash.dx * boost * dt, G.dash.dy * boost * dt, 15);
    G.afterimages.push({ x: G.player.x, y: G.player.y, ang: G.player.angle, life: 0.2, max: 0.2 });
    if (G.afterimages.length > 9) G.afterimages.shift();
  } else if (len > 0) {
    const hz = HAZARDS[hazardAt(G.player.x, G.player.y)];
    const hzSpeed = hz && hz.playerSpeed ? hz.playerSpeed : 1;
    const sf = G.slowT > 0 ? 0.55 : 1;
    moveWithSolids(G.player, mx * playerSpeed() * hzSpeed * sf * dt, my * playerSpeed() * hzSpeed * sf * dt, 15);
  }
  G.player.moving = len > 0 || G.dash.t > 0;
  G.player.stepT = (G.player.stepT || 0) + dt * (G.player.moving ? 11 : 2.5);
  const fixed = resolveSolid(G.player.x, G.player.y, 15);
  G.player.x = fixed.x;
  G.player.y = fixed.y;

  const standingHazard = HAZARDS[hazardAt(G.player.x, G.player.y)];
  if (standingHazard && standingHazard.burn) {
    G.burnCd = (G.burnCd || 0) - dt;
    if (G.burnCd <= 0) {
      G.burnCd = 0.6;
      G.hp = Math.max(0, G.hp - standingHazard.burn);
      G.hurtT = 0.2;
      spawnFloater(G.player.x, G.player.y - 20, standingHazard.burnLabel || 'BURN', standingHazard.burnColor || '#ff8a5c', 11);
      if (G.hp <= 0) { gameOver(); return; }
    }
  }
  G.bomb.cd = Math.max(0, G.bomb.cd - dt);
  const bombHeld = !!keys['e'];
  if (bombHeld && !G.bomb.held) throwBomb();
  G.bomb.held = bombHeld;
  const radioHeld = !!keys['t'];
  if (radioHeld && !G.radioHeld && screen === 'play') fireRadioStrike();
  G.radioHeld = radioHeld;
  if (settings.bombMode === 'auto' && G.bomb.cd <= 0 && screen === 'play') {
    for (const e of G.enemies) {
      if (!e.dead && dist2(e.x, e.y, G.player.x, G.player.y) < 550 * 550) {
        throwBomb();
        break;
      }
    }
  }

  updateSkills(dt);
  updateSoldiers(dt);
  updateRewards(dt);
  updateSpawner(dt);
  updateSurge();
  updateEnemies(dt);
  if (screen !== 'play') return;
  updateBullets(dt);
  if (screen !== 'play') return;
  updateGrenades(dt);
  updatePools(dt);
  updatePickups(dt);
  updateInteracts(dt);
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
  ctx.fillStyle = 'rgba(10,13,17,0.86)';
  ctx.strokeStyle = 'rgba(224,178,92,0.28)';
  ctx.lineWidth = 1;
  rr(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,210,0.06)';
  rr(x + 1.5, y + 1.5, w - 3, Math.min(10, h * 0.32), 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + h - 0.5);
  ctx.lineTo(x + w - 8, y + h - 0.5);
  ctx.stroke();
}

function drawButton(id, label, cx, y, w, h, sub) {
  const x = cx - w / 2;
  uiButtons.push({ id, label, x, y, w, h });
  const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  const pulse = hover ? 0.5 + 0.5 * Math.sin(uiT * 8) : 0;
  if (hover) {
    ctx.strokeStyle = 'rgba(255,213,140,' + (0.1 + 0.12 * pulse) + ')';
    ctx.lineWidth = 5;
    rr(x - 2, y - 2, w + 4, h + 4, 8);
    ctx.stroke();
  }
  ctx.fillStyle = hover ? 'rgba(64,48,26,0.94)' : 'rgba(18,22,26,0.9)';
  ctx.strokeStyle = hover ? 'rgba(255,213,140,' + (0.68 + 0.28 * pulse) + ')' : 'rgba(224,178,92,0.45)';
  ctx.lineWidth = hover ? 1.5 : 1;
  rr(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hover ? 'rgba(255,240,210,0.10)' : 'rgba(255,240,210,0.05)';
  rr(x + 1.5, y + 1.5, w - 3, Math.min(9, h * 0.34), 4);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hover ? '#fff3d6' : '#e8dcc0';
  const fontSize = h <= 24 ? 12 : h <= 30 ? 13 : h <= 36 ? 15 : 17;
  ctx.font = '700 ' + fontSize + 'px Consolas, monospace';
  ctx.fillText(label, cx, y + (sub ? h / 2 - 7 : h / 2));
  if (sub) {
    ctx.fillStyle = 'rgba(200,190,165,0.65)';
    ctx.font = '600 11px Consolas, monospace';
    ctx.fillText(sub, cx, y + h / 2 + 12);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 1;
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
  drawDustlineInsignia(170, 154, 42, 'rgba(224,178,92,0.28)');
  drawDustlineInsignia(790, 454, 32, 'rgba(99,220,192,0.18)');
}

function drawDustlineInsignia(cx, cy, radius, color) {
  const spin = uiT * 0.18;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0.2, Math.PI * 1.85);
  ctx.stroke();
  ctx.setLineDash([radius * 0.28, radius * 0.16]);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.78, -0.75, Math.PI * 1.55);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(-spin * 2.4);
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.52);
  ctx.lineTo(radius * 0.22, -radius * 0.08);
  ctx.lineTo(0, radius * 0.48);
  ctx.lineTo(-radius * 0.22, -radius * 0.08);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -radius * 0.08, radius * 0.07, 0, TAU);
  ctx.fill();
  ctx.restore();
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
let dangerCanvas = null;
const hazardCache = Object.create(null);
let hazardCacheMap = null;

function withAlpha(color, alpha) {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(String(color));
  if (hex) {
    const r = parseInt(hex[1].slice(0, 2), 16);
    const g = parseInt(hex[1].slice(2, 4), 16);
    const b = parseInt(hex[1].slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
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
  grad.addColorStop(0, withAlpha(hz.color, 0.78));
  grad.addColorStop(0.42, withAlpha(hz.color, 0.55));
  grad.addColorStop(0.72, withAlpha(hz.color, 0.3));
  grad.addColorStop(0.92, withAlpha(hz.color, 0.1));
  grad.addColorStop(1, withAlpha(hz.color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = withAlpha(hz.color, 0.85);
  g.lineWidth = 5;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = withAlpha(hz.burnColor || '#ffffff', 0.5);
  g.lineWidth = 2;
  g.setLineDash([10, 8]);
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 20, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
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
  draw.globalAlpha = 0.13 + h * 0.09;
  draw.beginPath();
  draw.ellipse(px, py, 30 + h * 18, 20 + h * 12, h * TAU, 0, TAU);
  draw.fill();
  draw.globalAlpha = 0.07 + h * 0.05;
  draw.fillStyle = h < 0.5 ? palette.cool : palette.warm;
  draw.beginPath();
  draw.ellipse(ox + TS - (px - ox), oy + TS - (py - oy), 20 + h * 10, 13 + h * 7, h * TAU + 1.2, 0, TAU);
  draw.fill();
  draw.globalAlpha = 1;
  draw.fillStyle = 'rgba(0,0,0,0.05)';
  draw.beginPath();
  draw.ellipse(ox + 20 + hash2(tx * 83, ty * 89) * (TS - 40), oy + 24 + hash2(tx * 97, ty * 101) * (TS - 48), 9, 5, 0.4, 0, TAU);
  draw.fill();
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

function drawDecor(cam) {
  const def = mapDef();
  const palette = def.props;
  const decor = decorNear(cam.x + W / 2, cam.y + H / 2, Math.hypot(W, H) / 2 + 100);
  decor.sort((a, b) => a.y - b.y);
  for (const d of decor) {
    const sway = Math.sin(uiT * 1.1 + d.seed * 8) * 1.6;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(1.6, 1.6);
    if (d.kind === 'grass' || d.kind === 'snowgrass') {
      const fresh = d.kind === 'snowgrass';
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(-5, 0, 10, 1.5);
      ctx.strokeStyle = fresh ? 'rgba(230,244,235,0.9)' : 'rgba(96,128,62,0.85)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) {
        const ox = (i - 2) * 2.2;
        ctx.beginPath();
        ctx.moveTo(ox, 0);
        ctx.quadraticCurveTo(ox + sway * 0.5, -6, ox + sway + (i - 2) * 1.7, -10 - (i % 2) * 3);
        ctx.stroke();
      }
    } else if (d.kind === 'fern') {
      ctx.strokeStyle = 'rgba(92,143,78,0.9)';
      ctx.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(i * 4 + sway, -7, i * 6 + sway * 1.4, -13 - Math.abs(i) * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(190,230,120,0.4)';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * 7 + sway * 1.4, -13 - Math.abs(i) * 2, 1.4, 0, TAU);
        ctx.fill();
      }
    } else if (d.kind === 'flower') {
      ctx.strokeStyle = 'rgba(130,180,95,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(sway * 0.5, -6, sway, -10);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + d.rot;
        ctx.fillStyle = def.accent;
        ctx.beginPath();
        ctx.arc(sway + Math.cos(a) * 2.2, -11 + Math.sin(a) * 2.2, 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,240,170,0.9)';
      ctx.beginPath();
      ctx.arc(sway, -11, 1, 0, TAU);
      ctx.fill();
    } else if (d.kind === 'mushroom') {
      ctx.fillStyle = 'rgba(225,215,195,0.7)';
      ctx.fillRect(-1, -7, 2, 7);
      ctx.fillStyle = 'rgba(190,110,90,0.8)';
      ctx.beginPath();
      ctx.arc(0, -7, 3.4, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,230,200,0.5)';
      ctx.beginPath();
      ctx.arc(-1, -8, 0.8, 0, TAU);
      ctx.fill();
    } else if (d.kind === 'ice') {
      ctx.strokeStyle = 'rgba(210,240,255,0.8)';
      ctx.fillStyle = 'rgba(190,230,255,0.3)';
      ctx.lineWidth = 1.2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 3.5, 0);
        ctx.lineTo(i * 5 + 1, -9 - (i + 1) * 2);
        ctx.lineTo(i * 5 + 4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (d.kind === 'bones') {
      ctx.strokeStyle = 'rgba(235,225,195,0.7)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(3, 2);
      ctx.moveTo(-4, -3);
      ctx.lineTo(2, -1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(235,225,195,0.8)';
      ctx.beginPath();
      ctx.arc(4.5, 1.5, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,24,18,0.8)';
      ctx.beginPath();
      ctx.arc(3.8, 0.9, 0.6, 0, TAU);
      ctx.arc(5.2, 0.9, 0.6, 0, TAU);
      ctx.fill();
    } else if (d.kind === 'charred') {
      ctx.fillStyle = 'rgba(25,20,17,0.8)';
      ctx.fillRect(-2.5, -7, 5, 7);
      ctx.strokeStyle = 'rgba(255,120,60,0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sway, -8);
      ctx.lineTo(sway + 2, -10);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30,24,20,0.65)';
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-2, -5);
      ctx.moveTo(3, 0);
      ctx.lineTo(1.5, -4);
      ctx.stroke();
    } else if (d.kind === 'crack') {
      ctx.strokeStyle = 'rgba(255,120,60,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(-2, -2);
      ctx.lineTo(1, 1);
      ctx.lineTo(7, -1);
      ctx.moveTo(1, 1);
      ctx.lineTo(3, 4);
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.rock;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc((i - 1.5) * 3, (i % 2) * 2, 1.3 + (i % 2), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawDecals() {
  for (const d of G.decals) {
    const a = clamp(d.life / d.max, 0, 1);
    ctx.fillStyle = 'rgba(22,16,12,' + (0.24 * a) + ')';
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.r, d.r * 0.52, d.seed * TAU, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,110,60,' + (0.06 * a) + ')';
    ctx.beginPath();
    ctx.ellipse(d.x - d.r * 0.18, d.y, d.r * 0.46, d.r * 0.22, d.seed * TAU, 0, TAU);
    ctx.fill();
  }
}

function drawInteracts() {
  if (!G) return;
  for (const obj of G.interact) {
    if (obj.dead) continue;
    const x = obj.x;
    const y = obj.y;
    ctx.save();
    ctx.translate(x, y);
    if (obj.kind === 'crate') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-13, -8, 26, 18);
      ctx.fillStyle = '#b89a5a';
      ctx.fillRect(-13, -10, 26, 16);
      ctx.fillStyle = '#d8b877';
      ctx.fillRect(-13, -10, 26, 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-12.5, -9.5, 25, 15);
      ctx.fillStyle = '#5a4a2a';
      ctx.fillRect(-4, -4, 8, 8);
    } else if (obj.kind === 'barrel') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-10, 2, 20, 6);
      ctx.fillStyle = '#7a4a3a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 14, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,140,80,0.5)';
      ctx.fillRect(-9, -2, 18, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 14, 0, 0, TAU);
      ctx.stroke();
    } else if (obj.kind === 'stash') {
      const pulse = 0.5 + 0.5 * Math.sin(uiT * 3);
      ctx.fillStyle = 'rgba(100,220,200,' + (0.15 + 0.15 * pulse) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, 18 + pulse * 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a6a6a';
      ctx.fillRect(-12, -12, 24, 24);
      ctx.fillStyle = '#63dcc0';
      ctx.fillRect(-12, -12, 24, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-12, -12, 24, 24);
    }
    ctx.restore();
  }
  if (G.warChest && !G.warChest.open) {
    const c = G.warChest;
    const x = c.x;
    const y = c.y;
    const remaining = Math.max(0, c.need - (G.kills - c.startKills));
    const ready = remaining <= 0;
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 4);
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 90);
    glow.addColorStop(0, ready ? 'rgba(99,220,192,0.34)' : 'rgba(255,176,102,0.22)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-90, -90, 180, 180);
    ctx.fillStyle = '#2e3a2c';
    ctx.fillRect(-19, -13, 38, 26);
    ctx.fillStyle = ready ? '#63dcc0' : '#8a7a4a';
    ctx.fillRect(-19, -13, 38, 4);
    ctx.fillStyle = '#1a221a';
    ctx.fillRect(-12, -6, 24, 15);
    ctx.fillStyle = ready ? '#63dcc0' : '#ffb066';
    ctx.fillRect(-4, -1, 8, 6);
    ctx.strokeStyle = ready ? 'rgba(99,220,192,' + (0.5 + 0.4 * pulse) + ')' : 'rgba(255,176,102,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-19, -13, 38, 26);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y - 30);
    ctx.fillStyle = 'rgba(8,10,12,0.82)';
    ctx.fillRect(-58, -14, 116, 22);
    ctx.fillStyle = ready ? '#63dcc0' : '#ffcf5c';
    ctx.font = '700 9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ready ? 'WAR CHEST · OPEN' : 'WAR CHEST · ' + remaining + ' KILLS', 0, 1);
    ctx.restore();
  }
  if (G.bunker && !G.bunker.used) {
    const x = G.bunker.x;
    const y = G.bunker.y;
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 2);
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 150);
    glow.addColorStop(0, 'rgba(255,210,122,' + (0.18 + 0.12 * pulse) + ')');
    glow.addColorStop(1, 'rgba(255,210,122,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-150, -150, 300, 300);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-24, -14, 48, 30);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(-24, -18, 48, 6);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-14, -4, 28, 20);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(-8, -1, 16, 4);
    ctx.fillStyle = '#ff8a5c';
    ctx.beginPath();
    ctx.arc(0, -12, 3 + pulse * 2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,122,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-24, -18, 48, 34);
    ctx.restore();
    const d = Math.hypot(G.player.x - G.bunker.x, G.player.y - G.bunker.y);
    if (d < 60) {
      ctx.save();
      ctx.translate(x, y - 40);
      ctx.fillStyle = 'rgba(10,12,14,0.85)';
      ctx.fillRect(-78, -16, 156, 26);
      ctx.fillStyle = '#ffd27a';
      ctx.font = '700 10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ENTER BUNKER · NUKE', 0, 2);
      ctx.restore();
    }
  }
  if (G.bunker && G.bunker.used) {
    const x = G.bunker.x;
    const y = G.bunker.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-24, -14, 48, 30);
    ctx.fillStyle = '#333';
    ctx.fillRect(-24, -18, 48, 6);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-14, -4, 28, 20);
    ctx.fillStyle = '#63dcc0';
    ctx.fillRect(-8, -1, 16, 4);
    ctx.restore();
  }
}

function drawProps(cam) {
  const def = mapDef();
  const palette = def.props;
  const accent = def.accent || '#ffd27a';
  const props = propsNear(cam.x + W / 2, cam.y + H / 2, Math.hypot(W, H) / 2 + 120);
  props.sort((a, b) => a.y - b.y);
  for (const p of props) {
    if (p.kind === 'room-wall') {
      ctx.fillStyle = palette.building;
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, Math.min(3, p.h));
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - p.w / 2 + 0.5, p.y - p.h / 2 + 0.5, p.w - 1, p.h - 1);
    } else if (p.kind === 'building') {
      const x = p.x - p.w / 2;
      const y = p.y - p.h / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(x + 8, y + 10, p.w, p.h);
      ctx.fillStyle = palette.building;
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(x, y, p.w, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, y + 8, p.w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x - 3, y - 3, p.w + 6, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x - 3, y - 3, p.w + 6, 1.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, p.w - 1, p.h - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      const doorW = Math.min(30, p.w * 0.3);
      ctx.fillRect(p.x - doorW / 2, y + p.h - 22, doorW, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(p.x - doorW / 2, y + p.h - 4, doorW, 2);
      for (let wx = x + 14; wx < x + p.w - 18; wx += 34) {
        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.fillRect(wx, y + 20, 12, 10);
        if (((wx - x) / 34 | 0) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,210,122,0.32)';
          ctx.fillRect(wx + 2, y + 22, 8, 6);
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.28 + 0.1 * Math.sin(uiT * 2 + wx * 0.1);
          ctx.fillRect(wx + 2, y + 22, 8, 2);
          ctx.globalAlpha = 1;
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + p.w * 0.7, y + 8);
      ctx.lineTo(x + p.w * 0.76, y + 17);
      ctx.lineTo(x + p.w * 0.72, y + 23);
      ctx.stroke();
    } else if (p.kind === 'rock') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + 4, p.y + 5, p.r, p.r * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = palette.rock;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath();
      ctx.arc(p.x, p.y + p.r * 0.22, p.r * 0.82, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - p.r * 0.15, p.y - p.r * 0.1);
      ctx.lineTo(p.x + p.r * 0.18, p.y + p.r * 0.05);
      ctx.lineTo(p.x + p.r * 0.06, p.y + p.r * 0.45);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - p.r * 0.42, p.y - p.r * 0.3);
      ctx.lineTo(p.x - p.r * 0.15, p.y - p.r * 0.1);
      ctx.stroke();
    } else {
      const sway = Math.sin(uiT * 1.1 + p.x * 0.01) * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x + 5, p.y + 6, p.r * 1.3, p.r * 0.7, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5a4732';
      ctx.fillRect(p.x - 3, p.y - 4, 6, p.r + 8);
      ctx.strokeStyle = 'rgba(90,71,50,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + p.r * 0.2);
      ctx.lineTo(p.x - p.r * 0.55, p.y - p.r * 0.35);
      ctx.moveTo(p.x, p.y + p.r * 0.3);
      ctx.lineTo(p.x + p.r * 0.5, p.y - p.r * 0.2);
      ctx.stroke();
      ctx.fillStyle = palette.tree;
      ctx.beginPath();
      ctx.arc(p.x + sway, p.y - p.r * 0.8, p.r * 1.25, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.65 + sway * 0.6, p.y - p.r * 0.45, p.r * 0.82, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x + p.r * 0.65 + sway * 0.6, p.y - p.r * 0.42, p.r * 0.78, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath();
      ctx.arc(p.x + sway * 0.4, p.y - p.r * 0.42, p.r * 0.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.45 + sway * 0.5, p.y - p.r * 1.05, p.r * 0.52, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,230,0.20)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x + sway, p.y - p.r * 0.8, p.r * 1.25, Math.PI * 1.15, Math.PI * 1.65);
      ctx.stroke();
    }
  }
}

function drawPickups() {
  for (const s of G.salvage) {
    if (s.x < G.cam.x - 40 || s.x > G.cam.x + W + 40 || s.y < G.cam.y - 40 || s.y > G.cam.y + H + 40) continue;
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
  for (const oc of G.overcharges) {
    if (oc.x < G.cam.x - 30 || oc.x > G.cam.x + W + 30 || oc.y < G.cam.y - 30 || oc.y > G.cam.y + H + 30) continue;
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 5 + oc.spin);
    ctx.save();
    ctx.translate(oc.x, oc.y);
    ctx.globalAlpha = 0.25 + 0.2 * pulse;
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 20 + pulse * 4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a2a3a';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(159,216,255,0.85)';
    ctx.font = '700 9px Consolas, monospace';
    ctx.fillText('OVERCHARGE', oc.x, oc.y - 16);
    ctx.textAlign = 'left';
  }
  for (const gem of G.gems) {
    if (gem.x < G.cam.x - 40 || gem.x > G.cam.x + W + 40 || gem.y < G.cam.y - 40 || gem.y > G.cam.y + H + 40) continue;
    ctx.save();
    ctx.translate(gem.x, gem.y + Math.sin(uiT * 3.2 + gem.spin) * 2.5);
    ctx.rotate(gem.spin);
    const gs = gemStyleFor(gem.tier);
    const color = gs.color;
    ctx.fillStyle = color;
    const s = gs.size;
    if (gem.tier !== 0) {
      ctx.strokeStyle = 'rgba(10,20,18,0.6)';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = gs.glow;
      ctx.beginPath();
      ctx.arc(0, 0, s * 2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    if (gs.shape === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2;
        const r = i % 2 === 0 ? s : s * 0.45;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (gs.shape === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const x = Math.cos(a) * s;
        const y = Math.sin(a) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    }
    ctx.fill();
    if (gem.tier !== 0) ctx.stroke();
    ctx.restore();
  }
  for (const chip of G.chips) {
    if (chip.x < G.cam.x - 30 || chip.x > G.cam.x + W + 30 || chip.y < G.cam.y - 30 || chip.y > G.cam.y + H + 30) continue;
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
    if (chest.x < G.cam.x - 30 || chest.x > G.cam.x + W + 30 || chest.y < G.cam.y - 30 || chest.y > G.cam.y + H + 30) continue;
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
    if (kit.x < G.cam.x - 30 || kit.x > G.cam.x + W + 30 || kit.y < G.cam.y - 30 || kit.y > G.cam.y + H + 30) continue;
    const kitPulse = 0.5 + 0.5 * Math.sin(uiT * 4 + kit.x * 0.1);
    ctx.fillStyle = 'rgba(120,255,170,' + (0.10 + 0.08 * kitPulse) + ')';
    ctx.beginPath();
    ctx.arc(kit.x, kit.y, 13 + kitPulse * 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e8e2d6';
    ctx.fillRect(kit.x - 8, kit.y - 6, 16, 12);
    ctx.fillStyle = '#c23a3a';
    ctx.fillRect(kit.x - 2, kit.y - 4, 4, 8);
    ctx.fillRect(kit.x - 5, kit.y - 1, 10, 3);
  }
  for (const die of G.dice) {
    if (die.x < G.cam.x - 30 || die.x > G.cam.x + W + 30 || die.y < G.cam.y - 30 || die.y > G.cam.y + H + 30) continue;
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 4 + die.spin);
    ctx.save();
    ctx.translate(die.x, die.y);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#f4efe2';
    ctx.beginPath();
    ctx.arc(0, 0, 15 + pulse * 3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(die.spin * 0.5);
    ctx.fillStyle = '#f4efe2';
    rr(-8, -8, 16, 16, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,14,8,0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.fillStyle = '#c23a3a';
    const layout = { 1: [[0, 0]], 2: [[-4, -4], [4, 4]], 3: [[-4, -4], [0, 0], [4, 4]], 4: [[-4, -4], [4, -4], [-4, 4], [4, 4]], 5: [[-4, -4], [4, -4], [0, 0], [-4, 4], [4, 4]], 6: [[-4, -4], [4, -4], [-4, 0], [4, 0], [-4, 4], [4, 4]] }[die.pips] || [[0, 0]];
    for (const [ox, oy] of layout) {
      ctx.beginPath();
      ctx.arc(ox, oy, 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,239,226,0.8)';
    ctx.font = '700 9px Consolas, monospace';
    ctx.fillText('DICE', die.x, die.y - 15);
    ctx.textAlign = 'left';
  }
  for (const radio of G.radios) {
    if (radio.x < G.cam.x - 30 || radio.x > G.cam.x + W + 30 || radio.y < G.cam.y - 30 || radio.y > G.cam.y + H + 30) continue;
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 4 + radio.spin);
    ctx.save();
    ctx.translate(radio.x, radio.y);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 15 + pulse * 3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(radio.spin * 0.3);
    ctx.fillStyle = '#1a2a3a';
    rr(-7, -5, 14, 10, 2);
    ctx.fill();
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-7, -5, 14, 10);
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, -5);
    ctx.lineTo(4, -13);
    ctx.stroke();
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    ctx.arc(4, -13, 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#63dcc0';
    ctx.fillRect(-4, -1, 5, 3);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(159,216,255,0.85)';
    ctx.font = '700 9px Consolas, monospace';
    ctx.fillText('RADIO', radio.x, radio.y - 15);
    ctx.textAlign = 'left';
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

function drawEnemyMotionAccent(e) {
  const facing = Math.atan2(G.player.y - e.y, G.player.x - e.x);
  const pulse = 0.5 + 0.5 * Math.sin(uiT * 8 + e.x * 0.01);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(facing);
  ctx.lineCap = 'round';
  if (e.type === 'runner' || e.type === 'swarm') {
    ctx.strokeStyle = 'rgba(255,230,170,' + (0.18 + pulse * 0.18) + ')';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const back = e.r * (1.25 + i * 0.55);
      ctx.beginPath();
      ctx.moveTo(-back, -e.r * (0.35 + i * 0.18));
      ctx.lineTo(-back - e.r * 0.55, 0);
      ctx.lineTo(-back, e.r * (0.35 + i * 0.18));
      ctx.stroke();
    }
  } else if (e.type === 'bomber' && e.fuse > 0) {
    ctx.strokeStyle = '#ff8a3a';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 13 + pulse * 3, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(-e.r * 0.55, -e.r * 0.75, 2 + pulse * 1.5, 0, TAU);
    ctx.fill();
  } else if (e.type === 'mortar') {
    ctx.strokeStyle = 'rgba(255,207,92,' + (0.25 + pulse * 0.2) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(e.r + 5, 0);
    ctx.lineTo(e.r + 15 + pulse * 6, 0);
    ctx.moveTo(e.r + 10, -5);
    ctx.lineTo(e.r + 15, 0);
    ctx.lineTo(e.r + 10, 5);
    ctx.stroke();
  } else if (e.type === 'widower') {
    ctx.strokeStyle = 'rgba(190,140,255,' + (0.25 + pulse * 0.16) + ')';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.4, i * e.r * 0.5);
      ctx.lineTo(-e.r * 1.5, i * e.r * 0.9 + Math.sin(uiT * 2 + i) * 3);
      ctx.stroke();
    }
  } else if (e.type === 'screamer' && e.rageT > 0) {
    ctx.strokeStyle = 'rgba(255,159,208,' + (0.2 + pulse * 0.2) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 13 + pulse * 4, -0.75, 0.75);
    ctx.stroke();
  }
  ctx.restore();
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
    const spawnAge = G.time - (e.born || 0);
    if (!e.boss && spawnAge < 0.28) {
      const pop = 0.45 + 0.55 * (spawnAge / 0.28);
      ctx.scale(pop, pop);
      ctx.globalAlpha = 0.35 + 0.65 * (spawnAge / 0.28);
    }
    const walkBob = Math.sin(uiT * 7 + e.x * 0.05 + e.y * 0.043) * 1.4;
    ctx.translate(walkBob * 0.4, walkBob * 0.3);
    if (e.flash > 0) {
      const squash = Math.min(1, e.flash / 0.08);
      ctx.scale(1 + squash * 0.14, 1 - squash * 0.1);
    }
    if (settings.outlines) {
      ctx.strokeStyle = e.boss ? '#ffd27a' : 'rgba(255,250,235,0.6)';
      ctx.lineWidth = e.boss ? 2.5 : 1.25;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 3, 0, TAU);
      ctx.stroke();
    }
    if (e.boss) {
      const pulse = 0.5 + 0.5 * Math.sin(uiT * 2.6);
      ctx.strokeStyle = 'rgba(255,90,70,' + (0.1 + 0.12 * pulse) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 15 + pulse * 4, 0, TAU);
      ctx.stroke();
      const hpFrac = e.maxHp ? e.hp / e.maxHp : 1;
      if (hpFrac < 0.35) {
        const rage = 0.5 + 0.5 * Math.sin(uiT * 11);
        ctx.strokeStyle = 'rgba(255,45,30,' + (0.35 + 0.35 * rage) + ')';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([9, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 22 + rage * 4, uiT * 1.4, uiT * 1.4 + TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
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
    } else if (e.type === 'tunneler') {
      ctx.rotate(facing);
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.ellipse(0, 0, e.r, e.r * 0.62, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(e.r * 0.4, -e.r * 0.5);
      ctx.lineTo(e.r * 0.9, -e.r * 0.28);
      ctx.lineTo(e.r * 0.9, e.r * 0.28);
      ctx.lineTo(e.r * 0.4, e.r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * e.r * 0.35 - e.r * 0.55, -e.r * 0.5);
        ctx.lineTo(i * e.r * 0.35 - e.r * 0.55, -e.r * 0.28);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.2, 0, TAU);
      ctx.fill();
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
    drawEnemyMotionAccent(e);
    if (!e.boss && e.hp < e.maxHp) {
      const w = Math.max(16, e.r * 1.8);
      const bx = e.x - w / 2;
      const by = e.y - e.r - 9;
      ctx.fillStyle = 'rgba(6,10,14,0.75)';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      rr(bx - 1, by - 1, w + 2, 5, 2);
      ctx.fill();
      ctx.stroke();
      const fillW = w * clamp(e.hp / e.maxHp, 0, 1);
      if (fillW > 0) {
        ctx.fillStyle = e.type === 'tank' ? '#e0a13c' : '#d3563f';
        rr(bx, by, fillW, 3, 1.5);
        ctx.fill();
      }
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
  if (screen === 'play' && G.cam) {
    const m = 34;
    const x0 = G.cam.x + m;
    const x1 = G.cam.x + W - m;
    const y0 = G.cam.y + m;
    const y1 = G.cam.y + H - m;
    for (const e of G.enemies) {
      if (e.dead || (!e.boss && !e.champion)) continue;
      if (e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1) continue;
      const cx = clamp(e.x, x0, x1);
      const cy = clamp(e.y, y0, y1);
      const ang = Math.atan2(e.y - cy, e.x - cx);
      const pulse = 0.5 + 0.5 * Math.sin(uiT * 6);
      const color = e.boss ? '#ff5a4a' : (CHAMPION_AFFIXES.find((a) => a.id === e.affix) || {}).color || '#ffd27a';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.65 + 0.35 * pulse;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-4, -7);
      ctx.lineTo(-4, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
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
    const fresh = t.life > t.max - 1.2;
    ctx.save();
    ctx.globalAlpha = fresh ? 0.3 : 0.1;
    ctx.strokeStyle = '#b8c6d0';
    ctx.lineWidth = 1.5;
    if (fresh) {
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -uiT * 30;
    }
    ctx.beginPath();
    ctx.arc(t.x, t.y, 430, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
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
    const tx = G.player.x + Math.cos(a - 0.35) * 64;
    const ty = G.player.y + Math.sin(a - 0.35) * 64;
    ctx.strokeStyle = 'rgba(223,232,255,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx, by);
    ctx.stroke();
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

function drawHeli() {
  if (!G.heli) return;
  const h = G.heli;
  const x = G.player.x + Math.cos(h.ang) * 90;
  const y = G.player.y + Math.sin(h.ang) * 90;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 12, 20, 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2b3a44';
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#9fd8ff';
  ctx.beginPath();
  ctx.arc(8, 0, 5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(159,216,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-26, -10);
  ctx.lineTo(26, -10);
  ctx.stroke();
  const blur = Math.sin(uiT * 40) * 2;
  ctx.strokeStyle = 'rgba(220,240,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(-18, -10 + blur);
  ctx.lineTo(18, -10 - blur);
  ctx.stroke();
  ctx.fillStyle = '#ffcf5c';
  ctx.fillRect(-8, 8, 16, 3);
  ctx.restore();
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

function skinAccent() {
  const equipped = SKINS.find((s) => s.id === (save.cosmetics && save.cosmetics.skin));
  if (!equipped || equipped.id === 'ranger') return null;
  return equipped.color;
}

function drawAfterimages() {
  for (const a of G.afterimages) {
    const k = clamp(a.life / a.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.1 + 0.2 * k;
    ctx.translate(a.x, a.y);
    ctx.rotate(a.ang);
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,243,214,0.7)';
    ctx.fillRect(-2, -2, 20, 4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const p = G.player;
  const tier = evolutionTier(G.level);
  const accent = skinAccent() || (isOperator('arcanist') ? '#c39bff' : accentColor());
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
  const dashing = G.dash.t > 0;
  const breathe = 1 + 0.022 * Math.sin(uiT * 3.1) + (p.moving ? 0.012 * Math.sin(p.stepT * 2) : 0);
  if (dashing) ctx.scale(1.22 * scale * breathe, 0.86 * scale * breathe);
  else ctx.scale(scale * breathe, scale * breathe);
  const stride = p.moving ? Math.sin(p.stepT * 2) * 5 : Math.sin(uiT * 1.4) * 0.8;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-13 + stride * 0.6, -11, 9, 5);
  ctx.fillRect(-13 - stride * 0.6, 6, 9, 5);
  ctx.fillStyle = '#232a31';
  ctx.fillRect(-12 + stride * 0.6, -10.5, 8, 4.4);
  ctx.fillRect(-12 - stride * 0.6, 6.1, 8, 4.4);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(-12 + stride * 0.6, -10.5, 2, 4.4);
  ctx.fillRect(-12 - stride * 0.6, 6.1, 2, 4.4);
  ctx.globalAlpha = 1;

  if (tier >= 3) {
    ctx.fillStyle = 'rgba(190,60,50,0.85)';
    ctx.fillRect(-24, -9, 16, 18);
  }
  ctx.fillStyle = tier >= 2 ? '#4a5560' : '#303942';
  ctx.strokeStyle = tier >= 2 ? accent : 'rgba(232,220,192,0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-6, -13, 5.5, 0, TAU);
  ctx.arc(-6, 13, 5.5, 0, TAU);
  ctx.fill();
  ctx.stroke();

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
  if (isOperator('arcanist')) {
    ctx.fillStyle = '#c39bff';
    ctx.beginPath();
    ctx.arc(33, 0, 3.5, 0, TAU);
    ctx.fill();
  }
  const muzzleX = primary === 'rail' ? 47 : primary === 'dmr' ? 46 : primary === 'shotgun' ? 42 : primary === 'smg' ? 33 : 36;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.18 + 0.08 * (0.5 + 0.5 * Math.sin(uiT * 18));
  ctx.beginPath();
  ctx.arc(muzzleX, 0, 5, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  const camo = CAMO[G.map] || '#2f6fb5';
  ctx.fillStyle = camo;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = accent;
  if (tier === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(-5, -4, 5, 0, TAU);
    ctx.arc(5, 5, 4, 0, TAU);
    ctx.fill();
  }
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
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(5, -2.5);
  ctx.lineTo(10, -1.5);
  ctx.stroke();
  if (tier >= 3) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,245,220,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 15 * scale, -2.5, -0.85);
  ctx.stroke();
  if (odActive()) {
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 9);
    ctx.strokeStyle = 'rgba(255,138,92,' + (0.18 + 0.2 * pulse) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 21 + pulse * 3, 0, TAU);
    ctx.stroke();
  }

  if (tier > 0) {
    ctx.strokeStyle = tier >= 3 ? '#ffd27a' : tier === 2 ? '#ff9e66' : '#7fe0a0';
    ctx.lineWidth = 1.5;
    const cy = p.y - 20 * scale - 4;
    for (let c = 0; c < tier; c++) {
      const oy = cy - c * 3.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 5, oy + 2.5);
      ctx.lineTo(p.x, oy);
      ctx.lineTo(p.x + 5, oy + 2.5);
      ctx.stroke();
    }
  }
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
  if (color.indexOf('255,59,48') >= 0) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(tx, ty, 28 + Math.sin(uiT * 12) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(a) * 23, ty + Math.sin(a) * 23);
      ctx.lineTo(tx + Math.cos(a) * 31, ty + Math.sin(a) * 31);
      ctx.stroke();
    }
  }
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
    if (enemy) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = b.color;
    ctx.lineWidth = enemy ? 3 : 2.5;
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
    } else {
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 1.8, 0, TAU);
      ctx.fill();
    }
  }
}

function drawArcs() {
  for (const a of G.arcs) {
    const k = clamp(a.t / a.max, 0, 1);
    const dx = a.x2 - a.x1;
    const dy = a.y2 - a.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#c39bff';
    ctx.beginPath();
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wob = i === 0 || i === steps ? 0 : Math.sin(i * 2.7 + a.seed) * 10 * k;
      const px = a.x1 + dx * t + nx * wob;
      const py = a.y1 + dy * t + ny * wob;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.globalAlpha = 0.85 * k;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.globalAlpha = 0.22 * k;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of G.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    const kind = p.kind || 'dot';
    ctx.globalAlpha = a;
    if (kind === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.8, p.size * 0.55);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 'smoke') {
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    } else if (kind === 'shard') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
      ctx.restore();
    } else if (kind === 'ring') {
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - a) + 2, 0, TAU);
      ctx.stroke();
    } else if (kind === 'flash') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(p.ang) * p.size, p.y - Math.sin(p.ang) * p.size);
      ctx.lineTo(p.x + Math.cos(p.ang) * p.size, p.y + Math.sin(p.ang) * p.size);
      ctx.moveTo(p.x - Math.cos(p.ang + Math.PI / 2) * p.size * 0.35, p.y - Math.sin(p.ang + Math.PI / 2) * p.size * 0.35);
      ctx.lineTo(p.x + Math.cos(p.ang + Math.PI / 2) * p.size * 0.35, p.y + Math.sin(p.ang + Math.PI / 2) * p.size * 0.35);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 'glow') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.22;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.9, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a * 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.55, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawFloaters() {
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  for (const f of G.floaters) {
    ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = '700 ' + f.size + 'px Consolas, monospace';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
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

function drawTouchControls() {
  if (!G || (screen !== 'play' && screen !== 'paused')) return;
  ctx.save();
  ctx.globalAlpha = 0.5;
  if (touchStick.active) {
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(touchStick.ox, touchStick.oy, 42, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(159,216,255,0.25)';
    ctx.beginPath();
    ctx.arc(touchStick.ox + touchStick.vx * 42, touchStick.oy + touchStick.vy * 42, 18, 0, TAU);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(159,216,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(90, H - 96, 46, 0, TAU);
    ctx.stroke();
  }
  const bx = W - 86, by = H - 96;
  const buttons = [
    { x: bx, y: by, label: 'DASH', color: '#9fd8ff' },
    { x: bx - 74, y: by, label: 'BOMB', color: '#ffcf5c' },
    { x: bx - 148, y: by, label: 'OD', color: '#ff8a5c' }
  ];
  for (const b of buttons) {
    ctx.globalAlpha = 0.52;
    ctx.fillStyle = 'rgba(20,24,28,0.85)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 34, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 34, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = b.color;
    ctx.font = '700 9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x, b.y + 4);
  }
  ctx.restore();
}

function minimapGeom() {
  const lift = typeof touchMode !== 'undefined' && touchMode ? 116 : 0;
  return { x: W - 84, y: H - 84 - lift, r: 64 };
}

function drawMinimap() {
  if (!G || (screen !== 'play' && screen !== 'paused')) return;
  const g = minimapGeom();
  const RANGE = 900;
  const scale = g.r / RANGE;
  const px = G.player.x;
  const py = G.player.y;
  const toMap = (x, y) => ({ x: g.x + (x - px) * scale, y: g.y + (y - py) * scale });
  ctx.save();
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r, 0, TAU);
  ctx.clip();
  ctx.fillStyle = 'rgba(6,8,10,0.82)';
  ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
  const CELL = 120;
  const ccx = Math.floor(px / CELL);
  const ccy = Math.floor(py / CELL);
  const reach = Math.ceil(RANGE / CELL);
  ctx.fillStyle = 'rgba(224,178,92,0.14)';
  for (let j = -reach; j <= reach; j++) {
    for (let i = -reach; i <= reach; i++) {
      if (!G.explored[(ccx + i) + ',' + (ccy + j)]) continue;
      const p = toMap((ccx + i) * CELL, (ccy + j) * CELL);
      ctx.fillRect(p.x, p.y, CELL * scale + 1, CELL * scale + 1);
    }
  }
  for (const prop of propsNear(px, py, RANGE)) {
    const p = toMap(prop.x, prop.y);
    if (Math.hypot(p.x - g.x, p.y - g.y) > g.r) continue;
    ctx.fillStyle = prop.kind === 'building' || prop.kind === 'room-wall' ? '#a58a5c' : prop.kind === 'rock' ? '#8d8375' : '#4d7a45';
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, (prop.r || 10) * scale), 0, TAU);
    ctx.fill();
  }
  for (const room of roomsNear(px, py, RANGE)) {
    const p = toMap(room.x, room.y);
    const state = G.rooms[room.id];
    ctx.strokeStyle = state && state.cleared ? '#63dcc0' : state ? '#ffcf5c' : 'rgba(216,184,119,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - room.w * scale / 2, p.y - room.h * scale / 2, Math.max(2, room.w * scale), Math.max(2, room.h * scale));
  }
  let dots = 0;
  for (const e of G.enemies) {
    if (e.dead || dots >= 80) continue;
    const dx = e.x - px;
    const dy = e.y - py;
    if (dx * dx + dy * dy > RANGE * RANGE) continue;
    const p = toMap(e.x, e.y);
    dots++;
    if (e.boss) {
      ctx.fillStyle = '#ff8a5c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = '#ff5a4a';
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
  }
  const pa = G.player.angle || 0;
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath();
  ctx.moveTo(g.x + Math.cos(pa) * 6, g.y + Math.sin(pa) * 6);
  ctx.lineTo(g.x + Math.cos(pa + 2.5) * 4, g.y + Math.sin(pa + 2.5) * 4);
  ctx.lineTo(g.x + Math.cos(pa - 2.5) * 4, g.y + Math.sin(pa - 2.5) * 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,210,122,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r, 0, TAU);
  ctx.stroke();
}

function drawHUD() {
  const xpPct = clamp(G.xp / G.xpNext, 0, 1);

  panel(14, 14, 250, 86, 8);
  ctx.fillStyle = '#ffd27a';
  ctx.fillRect(22, 18, 54, 2);
  drawSkull(38, 38, 12, '#e8dcc0');
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c2cdd2';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText('KILLS · ' + RANKS[G.rankIdx].short, 58, 30);
  ctx.fillStyle = '#f4efe2';
  ctx.font = '700 22px Consolas, monospace';
  ctx.fillText(String(G.kills), 58, 52);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,210,122,0.72)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('BEST ' + save.bestKills + '  ·  ' + fmtTime(best.time), 250, 30);
  ctx.fillStyle = G.streak >= 10 ? '#ffd27a' : 'rgba(180,175,155,0.6)';
  ctx.fillText('STREAK ' + G.streak + '  x' + streakMult().toFixed(2), 250, 46);
  ctx.fillStyle = '#63dcc0';
  ctx.fillText('UNBANKED ' + Math.floor(G.unbanked) + '  ·  SEC ' + Math.floor(G.banked), 250, 60);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(190,185,165,0.55)';
  ctx.font = '600 8.5px Consolas, monospace';
  const news = G.news.length > 44 ? G.news.slice(0, 42) + '...' : G.news;
  ctx.fillText(news, 22, 78);
  const tags = [];
  if (G.mutators && G.mutators.length) tags.push('MUTATORS · ' + G.mutators.map((id) => (mutatorDef(id) || {}).name || id).join(' + '));
  if (G.mutation && G.mutation !== 'none') {
    const mut = MUTATIONS.find((m) => m.id === G.mutation);
    if (mut) tags.push('MUTATION · ' + mut.name);
  }
  if (tags.length) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8a87c';
    ctx.font = '700 9px Consolas, monospace';
    let tagsText = tags.join('  ·  ');
    if (tagsText.length > 44) tagsText = tagsText.slice(0, 41) + '...';
    ctx.fillText(tagsText, 22, 94);
  }

  ctx.textAlign = 'center';
  panel(W / 2 - 106, 12, 212, 78, 8);
  ctx.fillStyle = '#63dcc0';
  ctx.fillRect(W / 2 - 42, 16, 84, 2);
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText(fmtTime(G.time), W / 2, 38);
  ctx.fillStyle = '#b9ac92';
  ctx.font = '600 10.5px Consolas, monospace';
  const limitText = G.limitSec > 0 ? '  ·  LEFT ' + fmtTime(Math.max(0, G.limitSec - G.time)) : '';
  const runText =
    G.mode === 'bossrush'
      ? 'BOSS ' + Math.min(G.rush.index + 1, G.rush.target) + ' / ' + G.rush.target + ' · L' + G.level + limitText
      : 'W' + G.wave + ' · L' + G.level + ' · ' + (G.diff ? G.diff.name : 'NORMAL') + limitText;
  ctx.fillText((G.daily != null ? 'DAILY · ' : '') + runText, W / 2, 56);

  if (screen === 'play') {
    const alertColor = G.alert > 80 ? '#e2563f' : G.alert > 55 ? '#e0b13c' : '#63dcc0';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(W / 2 - 96, 76, 192, 5);
    ctx.fillStyle = alertColor;
    ctx.fillRect(W / 2 - 96, 76, 192 * clamp(G.alert / 100, 0, 1), 5);
    ctx.fillStyle = alertColor;
    ctx.font = '600 9px Consolas, monospace';
    const eventText = G.event ? '  ·  ' + G.event.name + ' ' + Math.ceil(G.eventT) + 's' : '';
    ctx.textAlign = 'left';
    ctx.fillText('ALERT ' + Math.round(G.alert) + '%' + eventText, W / 2 - 96, 72);
    ctx.textAlign = 'center';
    if (G.mode !== 'bossrush' && !bossActive()) {
      if (G.surgePending) {
        ctx.fillStyle = '#ff8a5c';
        ctx.font = '700 9px Consolas, monospace';
        ctx.fillText('SURGE DELAYED · FINISH THE BOSS', W / 2, 92);
      } else {
        const surgeIn = SURGE_EVERY - (G.time % SURGE_EVERY);
        ctx.fillStyle = surgeIn <= 10 ? '#ff8a5c' : 'rgba(200,190,165,0.6)';
        ctx.font = '700 9px Consolas, monospace';
        ctx.fillText('SURGE ' + Math.ceil(surgeIn) + 's', W / 2, 92);
      }
    }
  }

  const owned = SKILL_ORDER.filter((id) => G.skills[id] > 0);
  panel(W - 214, 14, 200, 78, 8);
  ctx.fillStyle = operatorDef().color || '#9fd8ff';
  ctx.fillRect(W - 200, 18, 54, 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c2cdd2';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText('LOADOUT · ' + operatorDef().name, W - 200, 30);
  ctx.fillStyle = '#aeb9be';
  ctx.font = '600 9px Consolas, monospace';
  ctx.fillText(
    'OFF ' + slotsUsed('offense') + '/' + slotCap('offense') + '  ·  DEF ' + slotsUsed('passive') + '/' + slotCap('passive'),
    W - 200,
    44
  );
  ctx.fillStyle = G.relics.length ? '#63dcc0' : '#aeb9be';
  ctx.fillText('RELICS ' + G.relics.length + ' / ' + RELICS.length, W - 200, 58);
  ctx.fillStyle = G.lastStand ? '#ff6a4a' : '#8f9ba4';
  ctx.fillText(G.lastStand ? 'LAST STAND · +50% DMG' : 'SCORE ' + Math.round(G.score).toLocaleString('en-US'), W - 200, 72);

  const combo = activeCombos();
  if (combo.length) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(combo.map((c) => c.name).join(' · '), W - 200, 14 + 78 + 14);
  }

  const boss = G.enemies.find((e) => e.boss && !e.dead);
  if (boss && screen === 'play') {    const bw = 420;
    const bx = W / 2 - bw / 2;
    const by = 96;
    const hpFrac = clamp(boss.hp / boss.maxHp, 0, 1);
    const mega = !!boss.mega;
    const critical = hpFrac < 0.35;

    ctx.fillStyle = 'rgba(8,12,16,0.88)';
    ctx.strokeStyle = mega ? 'rgba(180,140,255,0.65)' : critical ? 'rgba(255,106,74,0.75)' : 'rgba(255,80,60,0.45)';
    ctx.lineWidth = mega ? 1.8 : 1.2;
    rr(bx - 12, by - 2, bw + 24, 38, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(26,15,18,0.9)';
    rr(bx, by + 16, bw, 12, 4);
    ctx.fill();

    if (hpFrac > 0) {
      const fillW = Math.max(6, bw * hpFrac);
      ctx.fillStyle = critical ? '#ff4d3d' : mega ? '#c042e6' : '#d24a3a';
      rr(bx, by + 16, fillW, 12, 4);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(bx + 2, by + 17, fillW - 4, 3);
    }

    ctx.strokeStyle = 'rgba(8,12,16,0.6)';
    ctx.lineWidth = 1;
    for (let s = 1; s <= 3; s++) {
      const sx = bx + (bw * s) / 4;
      ctx.beginPath();
      ctx.moveTo(sx, by + 16);
      ctx.lineTo(sx, by + 28);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = mega ? '#e8d2ff' : critical ? '#ffb4a6' : '#ffd0c0';
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

  if (screen === 'play') {
    const dw = 104;
    const gap = 8;
    const totalW = dw * 3 + gap * 2;
    const left = W / 2 - totalW / 2;
    const dashReady = G.dash.charges > 0;
    const bombReady = G.bomb.cd <= 0;
    const odOn = odActive();
    const by = H - 90;
    const dashLabel = 'DASH x' + G.dash.charges + (dashReady ? '' : ' ' + G.dash.cd.toFixed(1));
    const bh = 30;
    panel(left, by, dw, bh, 6);
    panel(left + dw + gap, by, dw, bh, 6);
    panel(left + (dw + gap) * 2, by, dw, bh, 6);
    ctx.font = '700 10.5px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = dashReady ? '#9fd8ff' : 'rgba(159,216,255,0.38)';
    ctx.fillText(dashReady ? 'SHIFT ' + dashLabel : dashLabel, left + dw / 2, by + 13);
    ctx.fillStyle = bombReady ? '#ffcf5c' : 'rgba(255,207,92,0.38)';
    const bombLabel = settings.bombMode === 'auto' ? 'AUTO' : 'E';
    const radioLabel = G.radioArmed > 0 ? ' T' + G.radioArmed : '';
    ctx.fillText(bombReady ? bombLabel + ' BOMB' + radioLabel : 'BOMB ' + G.bomb.cd.toFixed(1), left + dw + gap + dw / 2, by + 13);
    const odX = left + (dw + gap) * 2;
    ctx.fillStyle = odOn ? '#ff8a5c' : G.od.heat > 15 ? '#e0b13c' : 'rgba(255,138,92,0.35)';
    ctx.fillText(odOn ? 'OVERDRIVE' : 'R OD ' + Math.round(G.od.heat), odX + dw / 2, by + 13);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(left + 6, by + 22, dw - 12, 3);
    if (!dashReady) {
      ctx.fillStyle = '#9fd8ff';
      ctx.fillRect(left + 6, by + 22, (dw - 12) * (1 - G.dash.cd / 1.5), 3);
    } else {
      ctx.fillStyle = 'rgba(159,216,255,0.45)';
      ctx.fillRect(left + 6, by + 22, dw - 12, 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(left + dw + gap + 6, by + 22, dw - 12, 3);
    if (!bombReady) {
      ctx.fillStyle = '#ffcf5c';
      ctx.fillRect(left + dw + gap + 6, by + 22, (dw - 12) * (1 - G.bomb.cd / (G.bomb.max || 6)), 3);
    } else {
      ctx.fillStyle = 'rgba(255,207,92,0.45)';
      ctx.fillRect(left + dw + gap + 6, by + 22, dw - 12, 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(odX + 6, by + 22, dw - 12, 3);
    ctx.fillStyle = odOn ? '#ff8a5c' : '#e0b13c';
    ctx.fillRect(odX + 6, by + 22, (dw - 12) * clamp(G.od.heat / 100, 0, 1), 3);

    // combined skills + health strip, centered just above the xp bar
    const chips = owned.slice(0, 12);
    const chipW = 34;
    const chipsW = chips.length * chipW + 8 + (owned.length > 12 ? 22 : 0);
    const barW = 256;
    const stripW = chipsW + 20 + barW;
    const stripX = W / 2 - stripW / 2;
    const stripY = H - 54;
    panel(stripX, stripY, stripW, 34);
    ctx.textAlign = 'center';
    chips.forEach((id, i) => {
      const cx = stripX + 8 + i * chipW + chipW / 2;
      drawSkillGlyph(id, cx, stripY + 11, 10, SKILLS[id].color);
      ctx.font = '700 8px Consolas, monospace';
      ctx.fillStyle = SKILLS[id].color;
      ctx.fillText(SKILLS[id].short, cx - 6, stripY + 29);
      ctx.fillStyle = '#8f9ba4';
      ctx.fillText(String(G.skills[id]), cx + 9, stripY + 29);
    });
    if (owned.length > 12) {
      ctx.fillStyle = '#8f9ba4';
      ctx.font = '700 8px Consolas, monospace';
      ctx.fillText('+' + (owned.length - 12), stripX + 8 + 12 * chipW + 12, stripY + 26);
    }
    if (chips.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(stripX + chipsW + 10, stripY + 5);
      ctx.lineTo(stripX + chipsW + 10, stripY + 29);
      ctx.stroke();
    }
    const hx = stripX + chipsW + 20;
    const hpCol = G.hp > 50 ? '#58c46a' : G.hp > 25 ? '#e0b13c' : '#d34a4a';
    ctx.fillStyle = '#10141a';
    ctx.fillRect(hx, stripY + 19, barW, 10);
    ctx.fillStyle = hpCol;
    ctx.fillRect(hx, stripY + 19, barW * clamp(G.hp / G.maxHp, 0, 1), 10);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(hx, stripY + 19, barW * clamp(G.hp / G.maxHp, 0, 1), 3);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let seg = 1; seg < 4; seg++) ctx.fillRect(hx + (barW * seg) / 4, stripY + 19, 1, 10);
    ctx.fillStyle = hpCol;
    ctx.font = '700 9px Consolas, monospace';
    ctx.fillText(Math.ceil(G.hp) + ' / ' + G.maxHp, hx + barW / 2, stripY + 12);
    for (let i = 0; i < G.soldiers.length; i++) {
      ctx.fillStyle = '#7fd0ff';
      ctx.beginPath();
      ctx.arc(hx + 8 + i * 12, stripY + 13, 3.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#123a52';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (shieldMax() > 0) {
      for (let i = 0; i < shieldMax(); i++) {
        ctx.fillStyle = i < G.shield.charges ? '#9fd8ff' : 'rgba(159,216,255,0.16)';
        ctx.fillRect(hx + barW - (shieldMax() - i) * 9, stripY + 9, 7, 8);
      }
    }
  }

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

  if (G.bannerT > 0 && screen === 'play' && !(G.callout && G.callout.t > 0)) {
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

  if (G.callout && G.callout.t > 0 && screen === 'play') {
    const c = G.callout;
    const fade = clamp(Math.min(c.t, c.max - c.t) / 0.25, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 9);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 18 + pulse * 10;
    ctx.fillStyle = c.color;
    ctx.font = '700 44px Consolas, monospace';
    ctx.fillText(c.text, W / 2, H * 0.36);
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(245,238,225,0.95)';
    ctx.font = '600 12px Consolas, monospace';
    ctx.fillText(c.sub, W / 2, H * 0.36 + 24);
    ctx.restore();
  }

  if (G.lastStand && screen === 'play') {
    const pulse = 0.5 + 0.5 * Math.sin(uiT * 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,70,50,' + (0.5 + 0.4 * pulse) + ')';
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText('LAST STAND · +50% DAMAGE · NO DEFENSE', W / 2, 142);
  }

  drawMinimap();

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
  } else if (G.event.id === 'blizzard') {
    ctx.fillStyle = 'rgba(210,228,242,0.12)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(240,248,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const x = (i * 149 + uiT * 60) % (W + 40);
      const y = (i * 97 + uiT * 300) % (H + 30);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6, y + 26);
    }
    ctx.stroke();
  } else if (G.event.id === 'downpour') {
    ctx.fillStyle = 'rgba(120,180,220,0.10)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(150,210,240,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 50; i++) {
      const x = (i * 167 + uiT * 40) % (W + 20);
      const y = (i * 71 + uiT * 380) % (H + 30);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y + 22);
    }
    ctx.stroke();
  } else if (G.event.id === 'dustchoke') {
    ctx.fillStyle = 'rgba(160,120,180,0.12)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(200,162,216,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 30; i++) {
      const x = (i * 191 + uiT * 90) % (W + 60);
      const y = (i * 113 + uiT * 45) % (H + 20);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 44, y + 6);
    }
    ctx.stroke();
  }
}

function drawAmbience() {
  if (!G) return;
  const def = ambienceDef();
  const mode = def.mode;
  const wrap = (v, m) => ((v % m) + m) % m;
  ctx.save();
  for (let i = 0; i < def.count; i++) {
    const seed = hash2(i * 7 + 1, i * 13 + 5);
    let x = hash2(i * 3 + 2, i * 5 + 7) * W;
    let y = hash2(i * 11 + 4, i * 17 + 9) * H;
    if (mode === 'snow') {
      x = wrap(x + uiT * (5 + seed * 9) + Math.sin(uiT * 0.7 + i) * 14, W);
      y = wrap(y + uiT * (14 + seed * 22), H);
      const size = 1.8 + seed * 1.4;
      ctx.globalAlpha = 0.35 + seed * 0.45;
      ctx.fillStyle = 'rgba(70,90,110,0.22)';
      ctx.fillRect(x + 1, y + 1, size, size);
      ctx.fillStyle = def.color;
      ctx.fillRect(x, y, size, size);
    } else if (mode === 'dust') {
      x = wrap(x + uiT * (def.speed + seed * 14), W);
      y = wrap(y + Math.sin(uiT * 0.8 + i) * 12, H);
      ctx.globalAlpha = 0.2 + seed * 0.35;
      ctx.fillStyle = def.color;
      ctx.fillRect(x, y, 1.4 + seed * 0.8, 1.4 + seed * 0.8);
    } else if (mode === 'ember') {
      x = wrap(x + Math.sin(uiT * 0.9 + i * 1.7) * 16, W);
      y = wrap(y - uiT * (def.speed + seed * 18), H);
      ctx.globalAlpha = 0.3 + seed * 0.5;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + seed * 1.4, 0, TAU);
      ctx.fill();
      if (seed > 0.82) {
        ctx.globalAlpha *= 0.25;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, TAU);
        ctx.fill();
      }
    } else {
      x = wrap(x + Math.sin(uiT * 0.55 + i * 1.3) * 22, W);
      y = wrap(y + Math.cos(uiT * 0.45 + i * 0.7) * 16, H);
      const blink = 0.25 + 0.75 * Math.max(0, Math.sin(uiT * 1.8 + i * 1.1));
      ctx.globalAlpha = blink * (0.35 + seed * 0.45);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x, y, 1 + seed * 1.3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
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
  if (G && G.hurtT > 0 && settings.flashes) {
    ctx.fillStyle = 'rgba(170,25,25,' + (G.hurtT * 0.55) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawDanger() {
  if (!G || screen !== 'play') return;
  const ratio = G.hp / G.maxHp;
  if (ratio > 0.3) return;
  const pulse = settings.flashes ? 0.5 + 0.5 * Math.sin(uiT * 7) : 0.5;
  const strength = (0.28 + 0.32 * (1 - ratio / 0.3)) * (0.65 + 0.35 * pulse);
  if (!dangerCanvas && canOffscreen()) {
    const c = makeOffscreen(W * DPR, H * DPR);
    const g2 = c.getContext && c.getContext('2d');
    if (g2) {
      if (g2.scale) g2.scale(DPR, DPR);
      const g = g2.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
      g.addColorStop(0, 'rgba(180,20,20,0)');
      g.addColorStop(1, 'rgba(180,20,20,0.72)');
      g2.fillStyle = g;
      g2.fillRect(0, 0, W, H);
      dangerCanvas = c;
    }
  }
  ctx.globalAlpha = strength;
  if (dangerCanvas) {
    ctx.drawImage(dangerCanvas, 0, 0, W, H);
  } else {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
    g.addColorStop(0, 'rgba(180,20,20,0)');
    g.addColorStop(1, 'rgba(180,20,20,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
}

function drawDangerBorder() {
  if (!G || screen !== 'play') return;
  const ratio = G.hp / G.maxHp;
  if (ratio > 0.3) return;
  const pulse = settings.flashes ? 0.5 + 0.5 * Math.sin(uiT * 7) : 0.5;
  ctx.strokeStyle = 'rgba(255,70,55,' + (0.16 + 0.3 * pulse) + ')';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);
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
  ctx.fillText('A I K I T   ·   B U I L T   F O R   T H E   H O R D E', W / 2, 102);
  const titlePulse = 0.5 + 0.5 * Math.sin(uiT * 1.6);
  ctx.shadowColor = 'rgba(224, 178, 92,' + (0.35 + 0.25 * titlePulse) + ')';
  ctx.shadowBlur = 14 + 10 * titlePulse;
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 58px Consolas, monospace';
  ctx.fillText('DUSTLINE', W / 2, 160);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(224,178,92,' + (0.35 + 0.2 * titlePulse) + ')';
  ctx.fillRect(W / 2 - 190, 174, 120, 1);
  ctx.fillRect(W / 2 + 70, 174, 120, 1);
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 20px Consolas, monospace';
  ctx.fillText('S U R V I V O R S', W / 2, 192);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(210,200,175,0.7)';
  ctx.font = '600 12px Consolas, monospace';
  ctx.fillText('You move. The squad shoots. The horde never ends.', W / 2, 222);

  // Unified button column: total width 280 (340 to 620)
  drawButton('play', 'DEPLOY', W / 2, 244, 280, 46);
  drawButton('armory', 'ARMORY', 407, 298, 134, 40, 'SHARDS ' + save.shards);
  drawButton('daily', 'DAILY', 553, 298, 134, 40);
  drawButton('statistics', 'STATS', 407, 346, 134, 40);
  drawButton('upgrades', 'SKILLS', 553, 346, 134, 40);
  drawButton('manual', 'MANUAL', 407, 394, 134, 40);
  drawButton('settings', 'SETTINGS', 553, 394, 134, 40);
  drawButton('leaderboard', 'LEADERBOARD', 407, 442, 134, 40);
  drawButton('help', 'HOW TO PLAY', 553, 442, 134, 40);
  drawButton('shop', 'SHOP · SKINS + VIP', W / 2, 488, 280, 32);

  // Career telemetry dossier badge
  panel(W / 2 - 250, 528, 500, 46, 6);
  ctx.fillStyle = '#63dcc0';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('BEST SURVIVAL ' + fmtTime(best.time) + '   ·   ' + best.kills + ' KILLS   ·   ' + save.runs + ' RUNS', W / 2, 547);
  ctx.fillStyle = 'rgba(200,190,165,0.7)';
  ctx.font = '600 9.5px Consolas, monospace';
  ctx.fillText('TOTAL KILLS ' + save.totalKills + '   ·   BOSSES ' + save.bossKills + '   ·   WINS ' + save.wins + '   ·   ACHIEVEMENTS ' + achievementUnlocked() + '/' + ACHIEVEMENTS.length, W / 2, 563);
}

function drawMapGlyph(id, cx, cy, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.78;
  ctx.lineWidth = 1.5;
  if (id === 'frost') {
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(a) * 9, -Math.sin(a) * 9);
      ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
      ctx.stroke();
    }
  } else if (id === 'jungle') {
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.lineTo(0, -7);
    ctx.moveTo(0, -3);
    ctx.lineTo(-7, -8);
    ctx.moveTo(0, 0);
    ctx.lineTo(7, -5);
    ctx.stroke();
  } else if (id === 'toxic') {
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-3, -2, 2, 0, TAU);
    ctx.arc(4, 3, 2.5, 0, TAU);
    ctx.stroke();
  } else if (id === 'glass') {
    ctx.beginPath();
    ctx.moveTo(-8, 7);
    ctx.lineTo(-1, -8);
    ctx.lineTo(8, 6);
    ctx.lineTo(2, 2);
    ctx.closePath();
    ctx.stroke();
  } else if (id === 'crater') {
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.stroke();
  } else if (id === 'ash') {
    ctx.beginPath();
    ctx.moveTo(-6, 8);
    ctx.lineTo(-2, -3);
    ctx.lineTo(2, 8);
    ctx.moveTo(2, 5);
    ctx.lineTo(7, -8);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.stroke();
    ctx.fillRect(-2, -2, 4, 4);
  }
  ctx.restore();
}

function drawSetupScreen() {
  drawMenuBackdrop();
  overlay(0.35);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 24px Consolas, monospace';
  ctx.fillText('LOADOUT', W / 2, 38);
  ctx.fillStyle = 'rgba(200,190,165,0.65)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText(slotCap('offense') + ' OFF / ' + slotCap('passive') + ' DEF SLOTS · PICK A TAB, THEN DEPLOY', W / 2, 53);

  const tabDefs = [
    { id: 'setup-tab-0', label: '1 · ARSENAL', sub: WEAPONS[setup.weapon].name + ' / ' + operatorDefName() },
    { id: 'setup-tab-1', label: '2 · FIELD', sub: MAPS[setup.map].name + ' / ' + setup.mode.toUpperCase() },
    { id: 'setup-tab-2', label: '3 · RULES', sub: setup.mutators.length + ' MUT / ' + (MUTATIONS.find((m) => m.id === setup.mutation) || {}).name }
  ];
  tabDefs.forEach((tab, i) => {
    const x = 36 + i * 296;
    const y = 62;
    uiButtons.push({ id: tab.id, label: tab.label, x, y, w: 288, h: 40 });
    const chosen = setupTab === i;
    const hover = mouse.x >= x && mouse.x <= x + 288 && mouse.y >= y && mouse.y <= y + 40;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.22)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? '#ffd27a' : 'rgba(224,178,92,0.3)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, y, 288, 40, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = chosen ? '#fff3d6' : '#cfc6ad';
    ctx.font = '700 13px Consolas, monospace';
    ctx.fillText(tab.label, x + 144, y + 17);
    ctx.fillStyle = 'rgba(200,195,180,0.65)';
    ctx.font = '600 8.5px Consolas, monospace';
    ctx.fillText(tab.sub, x + 144, y + 31);
    ctx.textAlign = 'left';
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 12px Consolas, monospace';
  if (setupTab === 0) ctx.fillText('WEAPON', 36, 120);
  WEAPON_ORDER.forEach((id, i) => {
    const w = WEAPONS[id];
    const chosen = setup.weapon === id;
    const x = 36 + i * 148;
    const y = 128;
    uiButtons.push({ id: 'weapon-' + id, label: w.name, x, y, w: 140, h: 72, page: 0 });
    if (setupTab !== 0) return;
    const hover = mouse.x >= x && mouse.x <= x + 140 && mouse.y >= y && mouse.y <= y + 72;
    if (chosen) {
      ctx.strokeStyle = 'rgba(255,210,122,' + (0.25 + 0.15 * Math.sin(uiT * 4)) + ')';
      ctx.lineWidth = 4;
      rr(x - 2, y - 2, 144, 76, 8);
      ctx.stroke();
    }
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.24)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.92)';
    ctx.strokeStyle = chosen ? '#ffd27a' : 'rgba(224,178,92,0.3)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, y, 140, 72, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = chosen ? 'rgba(255,240,210,0.10)' : 'rgba(255,240,210,0.04)';
    rr(x + 1.5, y + 1.5, 137, 14, 4);
    ctx.fill();
    drawSkillGlyph(w.skill, x + 140 - 26, y + 36, 13, w.color);
    ctx.textAlign = 'left';
    ctx.fillStyle = w.color;
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillText(w.name, x + 12, y + 28);
    ctx.fillStyle = 'rgba(210,205,190,0.72)';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText(w.blurb, x + 12, y + 52);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 12px Consolas, monospace';
  if (setupTab === 1) ctx.fillText('MAP', 36, 122);
  const mapW = 124;
  const mapGap = 6;
  const mapStart = (W - (MAP_ORDER.length * mapW + (MAP_ORDER.length - 1) * mapGap)) / 2;
  MAP_ORDER.forEach((id, i) => {
    const m = MAPS[id];
    const chosen = setup.map === id;
    const x = mapStart + i * (mapW + mapGap);
    const y = 130;
    uiButtons.push({ id: 'map-' + id, label: m.name, x, y, w: mapW, h: 72, page: 1 });
    if (setupTab !== 1) return;
    const hover = mouse.x >= x && mouse.x <= x + mapW && mouse.y >= y && mouse.y <= y + 72;
    ctx.fillStyle = m.sky[0];
    rr(x, y, mapW, 72, 6);
    ctx.fill();
    ctx.globalAlpha = chosen ? 0.3 : isMapUnlocked(id) ? 0.55 : 0.72;
    ctx.fillStyle = '#06080a';
    rr(x, y, mapW, 72, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = chosen ? m.accent : hover ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = chosen ? 2.5 : 1.5;
    rr(x, y, mapW, 72, 6);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? '#fff6e2' : '#e8e2d4';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(m.name, x + 8, y + 20);
    ctx.fillStyle = 'rgba(235,230,215,0.75)';
    ctx.font = '600 8px Consolas, monospace';
    ctx.fillText('HAZARD · ' + HAZARDS[m.hazard].name.split(' ')[0], x + 8, y + 38);
    if (!isMapUnlocked(id)) {
      ctx.fillStyle = '#ff8a5c';
      ctx.font = '700 8px Consolas, monospace';
      ctx.fillText('LOCK ' + (m.price || 0) + ' · +' + Math.round(((m.income || 1) - 1) * 100) + '%', x + 8, y + 54);
    } else if ((m.income || 1) > 1) {
      ctx.fillStyle = '#63dcc0';
      ctx.font = '700 8px Consolas, monospace';
      ctx.fillText('+' + Math.round((m.income - 1) * 100) + '% SHARDS', x + 8, y + 54);
    }
    ctx.fillStyle = m.props.building;
    ctx.fillRect(x + mapW - 32, y + 47, 7, 7);
    ctx.fillStyle = m.props.rock;
    ctx.beginPath();
    ctx.arc(x + mapW - 20, y + 50.5, 3.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = m.props.tree;
    ctx.beginPath();
    ctx.arc(x + mapW - 10, y + 50.5, 3.5, 0, TAU);
    ctx.fill();
    drawMapGlyph(id, x + mapW - 20, y + 16, chosen ? m.accent : 'rgba(235,230,215,0.72)');
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 12px Consolas, monospace';
  if (setupTab === 0) ctx.fillText('OPERATOR', 36, 224);
  OPERATOR_ORDER.forEach((id, i) => {
    const op = OPERATORS.find((o) => o.id === id);
    const chosen = setup.operator === id;
    const x = 36 + (i % 3) * 298;
    const y = 232 + Math.floor(i / 3) * 68;
    uiButtons.push({ id: 'operator-' + id, label: op.name, x, y, w: 290, h: 60, page: 0 });
    if (setupTab !== 0) return;
    const hover = mouse.x >= x && mouse.x <= x + 290 && mouse.y >= y && mouse.y <= y + 60;
    ctx.fillStyle = chosen ? 'rgba(99,220,192,0.2)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? op.color : 'rgba(224,178,92,0.22)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, y, 290, 60, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = op.color;
    ctx.fillRect(x + 1.5, y + 8, 3, 44);
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? op.color : '#cfc6ad';
    ctx.font = '700 13px Consolas, monospace';
    ctx.fillText(op.name, x + 12, y + 24);
    ctx.fillStyle = 'rgba(190,185,170,0.7)';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText(op.blurb, x + 12, y + 44);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 12px Consolas, monospace';
  if (setupTab === 1) ctx.fillText('MODE', 36, 224);
  MODES.forEach((mode, i) => {
    const chosen = setup.mode === mode.id;
    const x = 36 + i * 168;
    const y = 232;
    uiButtons.push({ id: 'mode-' + mode.id, label: mode.name, x, y, w: 160, h: 48, page: 1 });
    if (setupTab !== 1) return;
    const hover = mouse.x >= x && mouse.x <= x + 160 && mouse.y >= y && mouse.y <= y + 48;
    ctx.fillStyle = chosen ? 'rgba(99,220,192,0.2)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? '#63dcc0' : 'rgba(224,178,92,0.22)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, y, 160, 48, 5);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? '#63dcc0' : '#cfc6ad';
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText(mode.name, x + 12, y + 20);
    ctx.fillStyle = 'rgba(190,185,170,0.65)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(mode.blurb, x + 12, y + 36);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 12px Consolas, monospace';
  if (setupTab === 1) ctx.fillText('TIME LIMIT', 548, 224);
  TIME_LIMITS.forEach((lim, i) => {
    const chosen = setup.limit === lim.id;
    const x = 548 + i * 96;
    const y = 232;
    uiButtons.push({ id: 'limit-' + lim.id, label: lim.label, x, y, w: 90, h: 48, page: 1 });
    if (setupTab !== 1) return;
    const hover = mouse.x >= x && mouse.x <= x + 90 && mouse.y >= y && mouse.y <= y + 48;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.24)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? '#ffd27a' : 'rgba(224,178,92,0.3)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, y, 90, 48, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = chosen ? '#fff3d6' : '#cfc6ad';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(lim.label, x + 45, y + 29);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 12px Consolas, monospace';
  if (setupTab === 1) ctx.fillText('DIFFICULTY', 36, 302);
  DIFFICULTY_ORDER.forEach((id, i) => {
    const diff = findDifficulty(id);
    const chosen = setup.difficulty === id;
    const x = 36 + i * 296;
    const y = 310;
    uiButtons.push({ id: 'difficulty-' + id, label: diff.name, x, y, w: 288, h: 64, page: 1 });
    if (setupTab !== 1) return;
    const hover = mouse.x >= x && mouse.x <= x + 288 && mouse.y >= y && mouse.y <= y + 64;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.22)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? diff.color : 'rgba(224,178,92,0.25)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, y, 288, 64, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? diff.color : '#d8d0bd';
    ctx.font = '700 13px Consolas, monospace';
    ctx.fillText(diff.name, x + 12, y + 24);
    ctx.fillStyle = 'rgba(200,195,180,0.65)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(diff.blurb + '  ·  LOOT x' + diff.shard, x + 12, y + 44);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 12px Consolas, monospace';
  if (setupTab === 2) ctx.fillText('MUTATORS · CHOOSE UP TO 2 FOR EXTRA LOOT', 36, 122);
  MUTATOR_ORDER.forEach((id, i) => {
    const def = mutatorDef(id);
    const chosen = setup.mutators.indexOf(id) >= 0;
    const x = 36 + (i % 3) * 300;
    const y = 130 + Math.floor(i / 3) * 72;
    uiButtons.push({ id: 'mutator-' + id, label: def.name, x, y, w: 292, h: 64, page: 2 });
    if (setupTab !== 2) return;
    const hover = mouse.x >= x && mouse.x <= x + 292 && mouse.y >= y && mouse.y <= y + 64;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.22)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? def.color : 'rgba(224,178,92,0.22)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, y, 292, 64, 5);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? def.color : '#cfc6ad';
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText(def.name, x + 10, y + 22);
    ctx.fillStyle = 'rgba(190,185,170,0.7)';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText('x' + def.shard + ' · ' + def.blurb, x + 10, y + 44);
  });

  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 12px Consolas, monospace';
  if (setupTab === 2) ctx.fillText('MUTATION · A RUN-LONG TWIST', 36, 296);
  MUTATION_ORDER.forEach((id, i) => {
    const def = MUTATIONS.find((m) => m.id === id);
    if (!def) return;
    const chosen = setup.mutation === id;
    const x = 36 + i * 178;
    const y = 304;
    uiButtons.push({ id: 'mutation-' + id, label: def.name, x, y, w: 172, h: 56, page: 2 });
    if (setupTab !== 2) return;
    const hover = mouse.x >= x && mouse.x <= x + 172 && mouse.y >= y && mouse.y <= y + 56;
    ctx.fillStyle = chosen ? 'rgba(255,138,92,0.18)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? def.color : 'rgba(224,178,92,0.22)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, y, 172, 56, 5);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = chosen ? def.color : '#cfc6ad';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(def.name, x + 10, y + 22);
    ctx.fillStyle = 'rgba(190,185,170,0.7)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(def.blurb, x + 10, y + 40);
  });

  if (setupTab > 0) drawButton('setup-prev', '< PREV', 116, 428, 160, 32);
  if (setupTab < 2) drawButton('setup-next', 'NEXT >', W - 116, 428, 160, 32);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200,190,165,0.6)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText([1, 2, 3].map((n, i) => (i === setupTab ? '[ ' + n + ' ]' : '  ' + n + '  ')).join('   '), W / 2, 452);

  var deploySub = WEAPONS[setup.weapon].name + ' · ' + MAPS[setup.map].name + ' · ' +
    findLimit(setup.limit).label + ' · ' + findDifficulty(setup.difficulty).name + ' · ' +
    operatorDefName() + ' · ' + (setup.mode === 'bossrush' ? RUSH_TARGET + ' BOSSES' : 'SURVIVORS');
  if (deploySub.length > 64) deploySub = deploySub.slice(0, 61) + '…';
  drawButton(
    'setup-start',
    'DEPLOY',
    W / 2,
    470,
    420,
    40,
    deploySub
  );
  drawButton('back-setup', 'BACK', W / 2, 522, 180, 28);
}

function drawArmoryScreen() {
  drawMenuBackdrop();
  overlay(0.35);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText('ARMORY', W / 2, 66);
  ctx.fillStyle = 'rgba(200,190,165,0.7)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('PERMANENT UPGRADES · PAID WITH SHARDS FROM ANY RUN', W / 2, 88);

  const bW = 220;
  panel(W / 2 - bW / 2, 104, bW, 26, 6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#63dcc0';
  ctx.font = '700 12px Consolas, monospace';
  ctx.fillText('◆ ' + save.shards + ' SHARDS AVAILABLE', W / 2, 121);

  const cardW = 480;
  const cardX = W / 2 - cardW / 2;
  META_ORDER.forEach((id, i) => {
    const meta = META[id];
    const rank = metaRank(id);
    const maxed = rank >= meta.max;
    const cost = meta.cost(rank);
    const y = 138 + i * 34;
    const canBuy = !maxed && save.shards >= cost;
    ctx.fillStyle = maxed ? 'rgba(32,34,26,0.94)' : 'rgba(16,20,24,0.92)';
    ctx.strokeStyle = maxed ? 'rgba(255,210,122,0.55)' : canBuy ? 'rgba(99,220,192,0.5)' : 'rgba(224,178,92,0.28)';
    ctx.lineWidth = maxed || canBuy ? 1.5 : 1;
    rr(cardX, y, cardW, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2e6c8';
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText(meta.name, cardX + 16, y + 13);
    ctx.fillStyle = 'rgba(200,195,180,0.7)';
    ctx.font = '600 8.5px Consolas, monospace';
    ctx.fillText(meta.desc, cardX + 16, y + 24);
    for (let r = 0; r < meta.max; r++) {
      ctx.fillStyle = r < rank ? '#63dcc0' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(538 + r * 13, y + 9, 9, 5);
    }
    drawButton('meta-' + id, maxed ? 'MAX' : cost + ' SH', cardX + cardW - 54, y + 1, 82, 28);
    if (!canBuy && !maxed) {
      ctx.fillStyle = 'rgba(255,90,70,0.85)';
      ctx.font = '700 8.5px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('NEED ' + cost, 538, y + 23);
    }
    ctx.textAlign = 'left';
  });

  ctx.textAlign = 'center';
  drawButton('back-armory', 'BACK', W / 2, 492, 180, 34);
}

function drawShopScreen() {
  drawMenuBackdrop();
  overlay(0.35);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText('SHOP', W / 2, 66);
  ctx.fillStyle = 'rgba(200,190,165,0.7)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('COSMETICS ONLY · LOOKS NEVER POWER', W / 2, 88);

  const bW = 220;
  panel(W / 2 - bW / 2, 104, bW, 26, 6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#63dcc0';
  ctx.font = '700 12px Consolas, monospace';
  ctx.fillText('◆ ' + save.shards + ' SHARDS AVAILABLE', W / 2, 121);

  drawButton('shop-tab-0', 'SKINS', W / 2 - 130, 140, 120, 30);
  drawButton('shop-tab-1', 'VIP', W / 2 + 10, 140, 120, 30);
  ctx.fillStyle = shopTab === 0 ? '#ffd27a' : 'rgba(200,190,165,0.5)';
  ctx.fillRect(W / 2 - 130, 172, 120, 2);
  ctx.fillStyle = shopTab === 1 ? '#ffd27a' : 'rgba(200,190,165,0.5)';
  ctx.fillRect(W / 2 + 10, 172, 120, 2);

  const cardW = 480;
  const cardX = W / 2 - cardW / 2;
  if (shopTab === 0) {
    SKINS.forEach((skin, i) => {
      const owned = save.cosmetics.skins.indexOf(skin.id) >= 0;
      const equipped = save.cosmetics.skin === skin.id;
      const canBuy = !owned && save.shards >= skin.price;
      const y = 182 + i * 52;
      ctx.fillStyle = equipped ? 'rgba(32,34,26,0.94)' : 'rgba(16,20,24,0.92)';
      ctx.strokeStyle = equipped ? 'rgba(255,210,122,0.55)' : canBuy || owned ? 'rgba(99,220,192,0.5)' : 'rgba(224,178,92,0.28)';
      ctx.lineWidth = 1.5;
      rr(cardX, y, cardW, 46, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = skin.color;
      ctx.beginPath();
      ctx.arc(cardX + 30, y + 23, 12, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f2e6c8';
      ctx.font = '700 12px Consolas, monospace';
      ctx.fillText(skin.name, cardX + 52, y + 19);
      ctx.fillStyle = 'rgba(200,195,180,0.7)';
      ctx.font = '600 8.5px Consolas, monospace';
      ctx.fillText(skin.blurb, cardX + 52, y + 33);
      if (equipped) {
        ctx.fillStyle = '#ffd27a';
        ctx.font = '700 10px Consolas, monospace';
        ctx.fillText('EQUIPPED', cardX + cardW - 90, y + 28);
      } else if (owned) {
        drawButton('skin-' + skin.id, 'WEAR', cardX + cardW - 96, y + 9, 82, 28);
      } else {
        drawButton('skin-' + skin.id, skin.price + ' SH', cardX + cardW - 96, y + 9, 82, 28);
        if (!canBuy) {
          ctx.fillStyle = 'rgba(255,90,70,0.85)';
          ctx.font = '700 8.5px Consolas, monospace';
          ctx.fillText('NEED ' + skin.price, cardX + cardW - 170, y + 28);
        }
      }
    });
  } else {
    VIP_PACKS.forEach((pack, i) => {
      const y = 182 + i * 62;
      ctx.fillStyle = 'rgba(16,20,24,0.92)';
      ctx.strokeStyle = 'rgba(224,178,92,0.28)';
      ctx.lineWidth = 1;
      rr(cardX, y, cardW, 56, 6);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd27a';
      ctx.font = '700 12px Consolas, monospace';
      ctx.fillText(pack.name, cardX + 16, y + 19);
      ctx.fillStyle = 'rgba(200,195,180,0.7)';
      ctx.font = '600 8.5px Consolas, monospace';
      ctx.fillText(pack.blurb, cardX + 16, y + 33);
      ctx.fillStyle = 'rgba(255,138,92,0.9)';
      ctx.font = '700 10px Consolas, monospace';
      ctx.fillText(pack.usd + ' · COMING SOON', cardX + 16, y + 47);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200,190,165,0.65)';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText('VIP packs unlock with real-money checkout in a separately approved step.', W / 2, 384);
    ctx.fillText('No billing code ships in this build.', W / 2, 398);
  }

  ctx.textAlign = 'center';
  drawButton('back-shop', 'BACK', W / 2, 492, 180, 34);
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
    ['BEST SCORE', String(save.bestScore || 0)],
    ['SECRET COMBOS', (save.secrets || []).length + ' / ' + COMBOS.filter((c) => c.secret).length],
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
    ['RIVALS BEATEN', (save.rivalsBeaten || []).length + ' / ' + (RIVALS.global.length + RIVALS.turkiye.length)],
    ['ACHIEVEMENTS', achievementUnlocked() + ' / ' + ACHIEVEMENTS.length],
    ['ARMORY RANKS', String(META_ORDER.reduce((sum, id) => sum + metaRank(id), 0))]
  ];
  ctx.textAlign = 'left';
  rows.forEach((row, i) => {
    const col = i % 3;
    const line = Math.floor(i / 3);
    const x = 142 + col * 228;
    const y = 114 + line * 34;
    ctx.fillStyle = 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = 'rgba(224,178,92,0.16)';
    ctx.lineWidth = 1;
    rr(x, y, 214, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col === 1 ? 'rgba(99,220,192,0.55)' : col === 2 ? 'rgba(255,210,122,0.55)' : 'rgba(159,216,255,0.5)';
    ctx.fillRect(x + 1.5, y + 5, 2.5, 20);
    ctx.fillStyle = 'rgba(190,185,168,0.75)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(row[0], x + 12, y + 12);
    ctx.fillStyle = '#f2e6c8';
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillText(row[1], x + 12, y + 25);
  });

  const types = Object.keys(save.killsByType);
  panel(142, 386, 676, 92, 6);
  ctx.fillStyle = '#e0b25c';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('KILLS BY TYPE', 160, 404);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(180,175,155,0.6)';
  ctx.font = '600 9px Consolas, monospace';
  ctx.fillText('LIFETIME COMBAT CASUALTIES', 142 + 676 - 18, 404);
  ctx.textAlign = 'left';
  if (!types.length) {
    ctx.fillStyle = 'rgba(160,155,145,0.65)';
    ctx.font = '600 10px Consolas, monospace';
    ctx.fillText('NO KILLS RECORDED YET', 160, 432);
  } else {
    types.sort((a, b) => save.killsByType[b] - save.killsByType[a]);
    types.slice(0, 12).forEach((type, i) => {
      const def = ENEMY_TYPES[type] || BOSS_TYPES[type];
      const x = 160 + (i % 4) * 162;
      const y = 416 + Math.floor(i / 4) * 20;
      ctx.fillStyle = def ? def.color : '#888';
      ctx.beginPath();
      ctx.arc(x + 5, y + 4, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,215,200,0.85)';
      ctx.font = '600 9.5px Consolas, monospace';
      ctx.fillText((def ? def.name : type) + '  ' + save.killsByType[type], x + 14, y + 7);
    });
  }

  ctx.textAlign = 'center';
  drawButton('back-stats', 'BACK', W / 2, 496, 180, 36);
}

function drawSettingsScreen() {
  if (G) {
    overlay(0.82);
  } else {
    drawMenuBackdrop();
    overlay(0.4);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 30px Consolas, monospace';
  ctx.fillText('SETTINGS', W / 2, 86);

  const cardW = 540;
  const cardX = W / 2 - cardW / 2;
  const rowCard = (label, note, y) => {
    panel(cardX, y, cardW, 46, 6);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0e5cb';
    ctx.font = '700 13px Consolas, monospace';
    ctx.fillText(label, cardX + 18, y + 20);
    if (note) {
      ctx.fillStyle = 'rgba(180,175,155,0.65)';
      ctx.font = '600 9.5px Consolas, monospace';
      ctx.fillText(note, cardX + 18, y + 34);
    }
    ctx.textAlign = 'center';
  };

  rowCard('MASTER VOLUME', 'All game audio', 126);
  drawButton('volume-down', '-', 630, 133, 40, 32);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e7eef3';
  ctx.font = '700 16px Consolas, monospace';
  ctx.fillText(settings.volume + '%', 668, 153);
  drawButton('volume-up', '+', 706, 133, 40, 32);
  const volW = cardW - 36;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(cardX + 18, 164, volW, 3);
  ctx.fillStyle = '#63dcc0';
  ctx.fillRect(cardX + 18, 164, volW * (settings.volume / 100), 3);

  const lamp = (on, lx, ly) => {
    ctx.fillStyle = on ? 'rgba(99,220,192,0.2)' : 'rgba(255,90,70,0.12)';
    ctx.beginPath();
    ctx.arc(lx, ly, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = on ? '#63dcc0' : '#ff6b52';
    ctx.beginPath();
    ctx.arc(lx, ly, 4 + (on ? Math.sin(uiT * 3) * 0.8 : 0), 0, TAU);
    ctx.fill();
  };
  rowCard('SCREEN SHAKE', 'Camera kick on hits and blasts', 180);
  drawButton('shake', settings.shake ? 'ON' : 'OFF', 668, 187, 116, 32);
  lamp(settings.shake, 598, 203);

  rowCard('DAMAGE NUMBERS', 'Floating hit values', 234);
  drawButton('damage-numbers', settings.damageNumbers ? 'ON' : 'OFF', 668, 241, 116, 32);
  lamp(settings.damageNumbers, 598, 257);

  rowCard('HOSTILE OUTLINES', 'Bright ring around every hostile', 288);
  drawButton('outlines', settings.outlines ? 'ON' : 'OFF', 668, 295, 116, 32);
  lamp(settings.outlines, 598, 311);

  rowCard('REDUCED FLASH', 'Fewer full-screen pulses', 342);
  drawButton('flashes', settings.flashes ? 'ON' : 'OFF', 668, 349, 116, 32);
  lamp(settings.flashes, 598, 365);

  rowCard('BOMB MODE', 'E throws manually, AUTO throws at crowds', 396);
  drawButton('bomb-mode', settings.bombMode === 'auto' ? 'AUTO' : 'MANUAL', 668, 403, 116, 32);
  lamp(settings.bombMode === 'auto', 598, 419);

  drawButton('back-settings', 'BACK', W / 2, 452, 180, 38);
  ctx.fillStyle = 'rgba(190,180,155,0.55)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SETTINGS ARE SAVED AUTOMATICALLY', W / 2, 512);
}

const BOARD_TABS = [
  { id: 'global', name: 'GLOBAL' },
  { id: 'friends', name: 'FRIENDS' },
  { id: 'turkiye', name: 'TÜRKIYE' }
];

const RIVALS = {
  global: [
    { name: 'DUSTKING', score: 45000, kills: 1800, time: 1500 },
    { name: 'VORTEX', score: 30000, kills: 1250, time: 1150 },
    { name: 'MIRAGE', score: 20000, kills: 850, time: 900 },
    { name: 'SABLE', score: 12000, kills: 520, time: 700 },
    { name: 'COBALT', score: 8000, kills: 360, time: 540 },
    { name: 'RAPTOR', score: 5000, kills: 230, time: 400 },
    { name: 'FLINT', score: 2500, kills: 120, time: 260 },
    { name: 'PEBBLE', score: 1000, kills: 55, time: 150 }
  ],
  turkiye: [
    { name: 'ANADOLU', score: 30000, kills: 1250, time: 1150 },
    { name: 'BOZKIR', score: 18000, kills: 780, time: 840 },
    { name: 'EFE', score: 10000, kills: 440, time: 620 },
    { name: 'LODOS', score: 6000, kills: 270, time: 450 },
    { name: 'KARTAL', score: 3000, kills: 140, time: 300 },
    { name: 'CAKIL', score: 1200, kills: 60, time: 170 }
  ]
};

function rivalRows(tab) {
  return (RIVALS[tab] || []).map((r) => ({
    name: r.name,
    code: r.name,
    score: r.score,
    kills: r.kills,
    time: r.time,
    you: false
  }));
}

function ownBoardCode() {
  return (save.deviceId || '').toUpperCase();
}

function boardEntries() {
  const rows = [];
  if (boardTab === 'friends') {
    const best = save.boardBests[0];
    rows.push({
      name: 'YOU · ' + ownBoardCode().slice(0, 4),
      code: ownBoardCode(),
      score: best ? best.s : 0,
      kills: best ? best.k : 0,
      time: best ? best.t : 0,
      you: true
    });
    for (const f of save.friends) {
      rows.push({ name: f.name, code: f.code.toUpperCase(), score: f.best, kills: null, time: null, you: false });
    }
    rows.sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score));
    return rows;
  }
  const yourBest = save.boardBests.map((e) => ({
    name: 'YOU · ' + ownBoardCode().slice(0, 4),
    code: ownBoardCode(),
    score: e.s,
    kills: e.k,
    time: e.t,
    map: e.m,
    win: e.win,
    you: true
  }));
  if (boardTab === 'global' || boardTab === 'turkiye') {
    return rivalRows(boardTab).concat(yourBest).sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score));
  }
  return yourBest;
}

function tryAddFriend() {
  const code = boardCode.toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(code)) {
    boardMsg = 'CODE NEEDS 8 HEX CHARS (0-9, A-F)';
    return false;
  }
  if (code === save.deviceId) {
    boardMsg = 'THAT IS YOUR OWN CODE';
    return false;
  }
  if (save.friends.some((f) => f.code === code)) {
    boardMsg = 'ALLY ALREADY ON THE BOARD';
    return false;
  }
  if (save.friends.length >= 12) {
    boardMsg = 'SQUAD IS FULL (12 ALLIES)';
    return false;
  }
  save.friends.push({ name: 'ALLY-' + code.slice(0, 4).toUpperCase(), code, best: null, ts: 0 });
  writeStore(SAVE_KEY, save);
  boardAddMode = false;
  boardCode = '';
  boardMsg = 'ALLY ADDED · AWAITING THEIR SYNC';
  return true;
}

function startDaily() {
  const rules = dailyRules(dailyDay());
  startRun({
    weapon: rules.weapon,
    map: rules.map,
    difficulty: rules.difficulty,
    mode: rules.mode,
    operator: rules.operator,
    mutation: rules.mutation,
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
  overlay(0.42);
  const info = dailyInfo();
  const r = info.rules;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#63dcc0';
  ctx.font = '700 30px Consolas, monospace';
  ctx.fillText('DAILY CHALLENGE', W / 2, 66);
  ctx.fillStyle = 'rgba(200,190,165,0.7)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('ONE SEED SHARED BY EVERYONE · BEST RUN OF THE DAY IS KEPT', W / 2, 86);

  const rows = [
    ['OPERATOR', OPERATORS.find((o) => o.id === r.operator).name],
    ['WEAPON', WEAPONS[r.weapon].name],
    ['MAP', MAPS[r.map].name],
    ['DIFFICULTY', findDifficulty(r.difficulty).name],
    ['MODE', r.mode === 'bossrush' ? 'BOSS RUSH · ' + RUSH_TARGET + ' BOSSES' : 'SURVIVORS'],
    ['MUTATION', (MUTATIONS.find((m) => m.id === r.mutation) || MUTATIONS[0]).name],
    ['MUTATORS', r.mutators.length ? r.mutators.map((id) => mutatorDef(id).name).join(' + ') : 'NONE'],
    ['SEED', String(r.seed)]
  ];
  const dW = 500;
  const dX = W / 2 - dW / 2;
  rows.forEach((row, i) => {
    const y = 108 + i * 33;
    ctx.fillStyle = 'rgba(16,20,24,0.9)';
    rr(dX, y, dW, 27, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(99,220,192,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(99,220,192,0.5)';
    ctx.fillRect(dX + 1.5, y + 5, 2.5, 17);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(170,165,150,0.75)';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText(row[0], dX + 14, y + 17);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e6efe9';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(row[1], dX + dW - 14, y + 17);
  });

  const bestY = 380;
  panel(dX, bestY, dW, 30, 6);
  ctx.textAlign = 'center';
  if (info.best) {
    const b = info.best;
    ctx.fillStyle = '#63dcc0';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(
      'TODAY BEST · ' + (b.win ? 'WIN' : 'LOSS') + ' · ' + b.kills + ' KILLS · ' + fmtTime(b.time),
      W / 2,
      bestY + 19
    );
  } else {
    ctx.fillStyle = 'rgba(200,195,180,0.65)';
    ctx.font = '600 10.5px Consolas, monospace';
    ctx.fillText('NO ATTEMPT YET TODAY', W / 2, bestY + 19);
  }

  drawButton('start-daily', 'START DAILY', W / 2, 432, 280, 42);
  drawButton('back-daily', 'BACK', W / 2, 488, 180, 32);
}

function drawLeaderboardScreen() {
  drawMenuBackdrop();
  overlay(0.42);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText('LEADERBOARD', W / 2, 56);
  ctx.fillStyle = 'rgba(200,190,165,0.7)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText(
    boardTab === 'turkiye'
      ? 'TÜRKIYE REGION · DEVICE BOARD · ONLINE SYNC ARRIVES WITH ANDROID'
      : 'COMPETE WITH THE WORLD AND YOUR SQUAD · DEVICE BOARD FOR NOW',
    W / 2,
    76
  );

  const tabW = 200;
  const tabGap = 8;
  const tabStart = (W - (BOARD_TABS.length * tabW + (BOARD_TABS.length - 1) * tabGap)) / 2;
  BOARD_TABS.forEach((tab, i) => {
    const x = tabStart + i * (tabW + tabGap);
    uiButtons.push({ id: 'board-' + tab.id, label: tab.name, x, y: 92, w: tabW, h: 28 });
    const chosen = boardTab === tab.id;
    const hover = mouse.x >= x && mouse.x <= x + tabW && mouse.y >= 92 && mouse.y <= 120;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.24)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? '#ffd27a' : 'rgba(224,178,92,0.26)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, 92, tabW, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = chosen ? '#fff3d6' : '#cfc6ad';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(tab.name, x + tabW / 2, 111);
  });

  const entries = boardEntries();
  const maxRows = boardTab === 'friends' ? 6 : 9;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(170,165,150,0.7)';
  ctx.font = '600 9px Consolas, monospace';
  ctx.fillText('#', 124, 140);
  ctx.fillText(boardTab === 'friends' ? 'ALLY' : 'RUNNER', 160, 140);
  ctx.textAlign = 'right';
  ctx.fillText('SCORE', 560, 140);
  ctx.fillText('KILLS', 660, 140);
  ctx.fillText('TIME', 770, 140);
  if (entries.length > maxRows) {
    ctx.fillStyle = 'rgba(200,195,180,0.5)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText('+' + (entries.length - maxRows) + ' MORE', 850, 140);
  }
  ctx.textAlign = 'left';
  if (!entries.length) {
    ctx.fillStyle = 'rgba(200,195,180,0.6)';
    ctx.font = '600 11px Consolas, monospace';
    ctx.fillText(
      boardTab === 'friends' ? 'NO ALLIES YET — ADD ONE BELOW BY CODE' : 'NO RUNS LOGGED YET — FINISH A RUN TO SEED THE BOARD',
      160,
      180
    );
  }
  entries.slice(0, maxRows).forEach((row, i) => {
    const y = 152 + i * 30;
    ctx.fillStyle = row.you ? 'rgba(32,30,22,0.92)' : 'rgba(14,18,22,0.86)';
    ctx.strokeStyle = row.you ? 'rgba(255,210,122,0.55)' : 'rgba(255,255,255,0.09)';
    ctx.lineWidth = row.you ? 1.5 : 1;
    rr(110, y, 740, 26, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = i === 0 ? '#ffd27a' : 'rgba(200,195,180,0.75)';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(String(i + 1), 124, y + 17);
    ctx.fillStyle = row.you ? '#fff3d6' : '#e6efe9';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(row.name, 160, y + 17);
    ctx.textAlign = 'right';
    if (row.score == null) {
      ctx.fillStyle = 'rgba(160,155,145,0.65)';
      ctx.font = '600 9.5px Consolas, monospace';
      ctx.fillText('AWAITING SYNC', 560, y + 17);
      ctx.fillText('—', 660, y + 17);
      ctx.fillText('—', 770, y + 17);
    } else {
      ctx.fillStyle = '#63dcc0';
      ctx.font = '700 11px Consolas, monospace';
      ctx.fillText(String(row.score), 560, y + 17);
      ctx.fillStyle = '#e6efe9';
      ctx.fillText(String(row.kills), 660, y + 17);
      ctx.fillText(fmtTime(row.time), 770, y + 17);
    }
    ctx.textAlign = 'left';
  });

  if (boardTab === 'friends') {
    panel(230, 344, 500, 34, 6);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#63dcc0';
    ctx.font = '700 11px Consolas, monospace';
    const codeLine = boardAddMode
      ? 'ADD: ' + (boardCode || '') + '_'
      : 'MY CODE · ' + ownBoardCode();
    ctx.fillText(codeLine, W / 2, 360);
    ctx.fillStyle = /NEEDS|OWN CODE|FULL|ALREADY/.test(boardMsg)
      ? '#ff8a7a'
      : /ADDED/.test(boardMsg)
        ? '#7fe0a0'
        : 'rgba(200,195,180,0.65)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(boardMsg || 'SHARE YOUR CODE · ADD ALLIES BY THEIR CODE', W / 2, 374);
    ctx.textAlign = 'center';
    if (!boardAddMode) {
      drawButton('friend-add', 'ADD FRIEND', W / 2, 392, 220, 32);
    } else {
      drawButton('friend-save', 'SAVE CODE', W / 2 - 116, 392, 200, 32);
      drawButton('friend-cancel', 'CANCEL', W / 2 + 116, 392, 200, 32);
    }
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200,195,180,0.6)';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText('DEVICE BOARD · ONLINE SYNC ARRIVES WITH THE ANDROID RELEASE', W / 2, 452);
  }

  drawButton('back-board', 'BACK', W / 2, 508, 180, 34);
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
  ctx.fillText('HOSTILES, BOSSES, RELICS AND FIELD NOTES · KILLS ARE LIFETIME', W / 2, 76);

  const tabs = [
    ['manual-enemies', 'HOSTILES · ' + Object.keys(ENEMY_TYPES).length, 'enemies'],
    ['manual-bosses', 'BOSSES · ' + Object.keys(BOSS_TYPES).length, 'bosses'],
    ['manual-relics', 'RELICS · ' + RELICS.length, 'relics'],
    ['manual-lore', 'NOTES · ' + LORE.length, 'lore'],
    ['manual-systems', 'SYSTEMS · ' + SYSTEMS_ROWS.length, 'systems']
  ];
  const tabW = 166;
  const tabGap = 8;
  const tabStart = (W - (tabs.length * tabW + (tabs.length - 1) * tabGap)) / 2;
  tabs.forEach(([id, label, key], i) => {
    const x = tabStart + i * (tabW + tabGap);
    const chosen = manualTab === key;
    uiButtons.push({ id, label, x, y: 92, w: tabW, h: 28 });
    const hover = mouse.x >= x && mouse.x <= x + tabW && mouse.y >= 92 && mouse.y <= 120;
    ctx.fillStyle = chosen ? 'rgba(224,178,92,0.24)' : hover ? 'rgba(30,34,38,0.95)' : 'rgba(16,20,24,0.9)';
    ctx.strokeStyle = chosen ? '#ffd27a' : 'rgba(224,178,92,0.26)';
    ctx.lineWidth = chosen ? 2 : 1;
    rr(x, 92, tabW, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = chosen ? '#fff3d6' : '#cfc6ad';
    ctx.font = '700 11px Consolas, monospace';
    ctx.fillText(label, x + tabW / 2, 111);
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
  } else if (manualTab === 'relics') {
    RELICS.forEach((relic, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cardW = 356;
      const cardH = 62;
      const x = 114 + col * 376;
      const y = 132 + row * 70;
      const owned = live && G.relics.indexOf(relic.id) >= 0;
      ctx.fillStyle = owned ? 'rgba(18,24,30,0.94)' : 'rgba(12,16,20,0.88)';
      ctx.strokeStyle = owned ? relic.color : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = owned ? 1.8 : 1;
      rr(x, y, cardW, cardH, 6);
      ctx.fill();
      ctx.stroke();

      drawRelicGlyph(relic.id, x + 30, y + 31, 24, relic.color);

      ctx.textAlign = 'left';
      ctx.fillStyle = relic.color;
      ctx.font = '700 12px Consolas, monospace';
      ctx.fillText(relic.name, x + 58, y + 20);
      ctx.fillStyle = 'rgba(215,210,195,0.78)';
      ctx.font = '600 10px Consolas, monospace';
      ctx.fillText(relic.desc, x + 58, y + 37);

      if (owned) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#7fe0a0';
        ctx.font = '700 9px Consolas, monospace';
        ctx.fillText('OWNED · ACTIVE', x + cardW - 12, y + 20);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(127,224,160,0.7)';
        ctx.font = '600 8.5px Consolas, monospace';
        ctx.fillText('IN RUN INVENTORY', x + 58, y + 51);
      } else {
        ctx.fillStyle = 'rgba(150,145,130,0.55)';
        ctx.font = '600 8.5px Consolas, monospace';
        ctx.fillText('FROM BOSS SALVAGE', x + 58, y + 51);
      }
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(190,185,170,0.6)';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText('OWN ALL TEN AND CRATES PAY 30 SHARDS INSTEAD', W / 2, 496);
  } else if (manualTab === 'systems') {
    SYSTEMS_ROWS.forEach((row, i) => {
      const y = 126 + i * 76;
      ctx.fillStyle = 'rgba(14,18,22,0.92)';
      ctx.strokeStyle = 'rgba(99,220,192,0.25)';
      ctx.lineWidth = 1;
      rr(110, y, 740, 68, 6);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#63dcc0';
      ctx.font = '700 12px Consolas, monospace';
      ctx.fillText(String(i + 1) + ' · ' + row.title, 130, y + 24);
      ctx.fillStyle = 'rgba(215,210,195,0.85)';
      ctx.font = '600 10.5px Consolas, monospace';
      ctx.fillText(row.text, 130, y + 46);
    });
  } else {
    LORE.forEach((note, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cardW = 292;
      const cardH = 116;
      const x = 28 + col * 306;
      const y = 126 + row * 124;
      ctx.fillStyle = 'rgba(14,18,22,0.92)';
      ctx.strokeStyle = 'rgba(224,178,92,0.25)';
      ctx.lineWidth = 1;
      rr(x, y, cardW, cardH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd27a';
      ctx.font = '700 11.5px Consolas, monospace';
      ctx.fillText(note.title, x + 10, y + 18);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(150,145,130,0.7)';
      ctx.font = '600 8.5px Consolas, monospace';
      ctx.fillText(note.tag, x + cardW - 10, y + 18);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(215,210,195,0.78)';
      ctx.font = '600 8.5px Consolas, monospace';
      const words = note.text.split(' ');
      let line = '';
      let ly = y + 36;
      for (const word of words) {
        const next = line ? line + ' ' + word : word;
        if (next.length > 40 && line) {
          ctx.fillText(line, x + 10, ly);
          ly += 12;
          line = word;
        } else {
          line = next;
        }
      }
      if (line) ctx.fillText(line, x + 10, ly);
    });
  }

  ctx.textAlign = 'center';
  drawButton('back-manual', 'BACK', W / 2, 532, 180, 34);
}

function drawHelpScreen() {
  drawMenuBackdrop();
  overlay(0.35);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 28px Consolas, monospace';
  ctx.fillText('HOW TO PLAY', W / 2, 54);
  ctx.fillStyle = 'rgba(200,190,165,0.65)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('SURVIVE THE HORDE · MASTER YOUR LOADOUT · EXTRACT YOUR SHARDS', W / 2, 74);

  const col1 = [
    ['MOVE', 'WASD or arrows. Infinite map dotted with cover.'],
    ['DASH', 'Shift or Space bursts forward with invulnerability.'],
    ['BOMB', 'Press E to throw bombs at the thickest horde.'],
    ['OVERDRIVE', 'Press R to burn heat: +40% dmg, +50% dmg taken.'],
    ['FIGHT', 'Weapons auto-fire at the nearest hostile.'],
    ['LEVEL UP', 'Collect gems to pick one of 3 skills each level.'],
    ['COMBOS', 'Some skill pairs unlock a bonus when both reach L2.'],
    ['WAVES', 'Every 40s horde grows; new enemy types appear.'],
    ['BOSS', 'Bosses every 5th wave; every 4th is a MEGA boss.'],
    ['EVOLVE', 'Max a skill at 10 and partner at 3 to evolve it.'],
    ['ARENAS', 'Worn rings mark prop-free clearings: use to kite.']
  ];
  const col2 = [
    ['DIFFICULTY', 'Normal, Brutal or Nightmare: tougher mobs pay more.'],
    ['HAZARDS', 'quicksand/ice/embers/vines/tar/gas/glass'],
    ['MUTATORS', 'Take up to two run modifiers, plus one mutation.'],
    ['SCORE', 'Kills and bosses build score; 10/25/50/100/250/500 callouts.'],
    ['LAST STAND', 'Under 10% health: +50% dmg, no extra safety.'],
    ['WAR CHEST', 'From wave 3, a hidden cache needs kills to open.'],
    ['EXTRACT', 'Bosses drop beacons: bank shards or risk losing half.'],
    ['EVENTS', 'Horde surges, supply drops and hunters hit the sector.'],
    ['MAP', 'Press M to see live contracts, alerts and beacons.'],
    ['DAILY', 'One seeded run per day with a fixed loadout.'],
    ['PAUSE', 'Esc opens the pause menu with settings and map.']
  ];

  panel(36, 92, 436, 396, 8);
  panel(488, 92, 436, 396, 8);

  ctx.textAlign = 'left';
  col1.forEach((item, i) => {
    const y = 118 + i * 34;
    ctx.fillStyle = 'rgba(224,178,92,0.14)';
    ctx.strokeStyle = 'rgba(224,178,92,0.3)';
    rr(48, y - 12, 84, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(item[0], 54, y + 2);
    ctx.fillStyle = 'rgba(235,225,205,0.85)';
    ctx.font = '600 10.5px Consolas, monospace';
    ctx.fillText(item[1], 140, y + 2);
  });

  col2.forEach((item, i) => {
    const y = 118 + i * 34;
    ctx.fillStyle = 'rgba(224,178,92,0.14)';
    ctx.strokeStyle = 'rgba(224,178,92,0.3)';
    rr(500, y - 12, 88, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(item[0], 506, y + 2);
    ctx.fillStyle = 'rgba(235,225,205,0.85)';
    ctx.font = '600 10.5px Consolas, monospace';
    const text = item[1].length > 46 ? item[1].slice(0, 44) + '..' : item[1];
    ctx.fillText(text, 596, y + 2);
  });

  drawButton('back-help', 'BACK', W / 2, 510, 180, 32);
}

function drawSkillGlyph(id, cx, cy, size, color) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 2;
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.28, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, size * 0.06);
  ctx.lineCap = 'round';
  if (id === 'rifle') {
    ctx.fillRect(-s * 0.9, -s * 0.12, s * 1.35, s * 0.24);
    ctx.fillRect(s * 0.15, s * 0.02, s * 0.24, s * 0.55);
    ctx.fillRect(-s * 0.9, -s * 0.32, s * 0.34, s * 0.64);
  } else if (id === 'smg') {
    ctx.fillRect(-s * 0.8, -s * 0.12, s * 1.1, s * 0.24);
    ctx.fillRect(s * 0.05, s * 0.02, s * 0.3, s * 0.68);
    ctx.fillRect(-s * 0.8, -s * 0.3, s * 0.3, s * 0.6);
  } else if (id === 'shotgun') {
    ctx.fillRect(-s * 0.9, -s * 0.1, s * 1.5, s * 0.2);
    ctx.beginPath();
    ctx.moveTo(s * 0.55, 0);
    ctx.lineTo(s * 0.95, -s * 0.42);
    ctx.moveTo(s * 0.55, 0);
    ctx.lineTo(s * 0.95, s * 0.42);
    ctx.stroke();
  } else if (id === 'dmr') {
    ctx.fillRect(-s * 0.9, -s * 0.08, s * 1.65, s * 0.16);
    ctx.fillRect(-s * 0.9, -s * 0.32, s * 0.38, s * 0.2);
    ctx.beginPath();
    ctx.arc(-s * 0.1, -s * 0.34, s * 0.24, 0, TAU);
    ctx.stroke();
  } else if (id === 'rail') {
    ctx.fillRect(-s * 0.95, -s * 0.2, s * 1.7, s * 0.1);
    ctx.fillRect(-s * 0.95, s * 0.1, s * 1.7, s * 0.1);
    ctx.beginPath();
    ctx.arc(s * 0.5, 0, s * 0.14, 0, TAU);
    ctx.fill();
  } else if (id === 'akimbo') {
    ctx.save();
    ctx.rotate(-0.5);
    ctx.fillRect(-s * 0.7, -s * 0.12, s * 1.1, s * 0.24);
    ctx.fillRect(s * 0.1, s * 0.02, s * 0.24, s * 0.5);
    ctx.restore();
    ctx.save();
    ctx.rotate(0.5);
    ctx.fillRect(-s * 0.7, -s * 0.12, s * 1.1, s * 0.24);
    ctx.fillRect(s * 0.1, s * 0.02, s * 0.24, s * 0.5);
    ctx.restore();
  } else if (id === 'blades') {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i / 3) * TAU);
      ctx.beginPath();
      ctx.moveTo(s * 0.12, 0);
      ctx.quadraticCurveTo(s * 0.7, -s * 0.32, s * 0.95, 0);
      ctx.quadraticCurveTo(s * 0.7, s * 0.32, s * 0.12, 0);
      ctx.fill();
      ctx.restore();
    }
  } else if (id === 'grenade') {
    ctx.beginPath();
    ctx.arc(0, s * 0.12, s * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillRect(-s * 0.18, -s * 0.72, s * 0.36, s * 0.24);
    ctx.beginPath();
    ctx.arc(s * 0.28, -s * 0.7, s * 0.28, Math.PI, Math.PI * 1.8);
    ctx.stroke();
  } else if (id === 'turret') {
    ctx.fillRect(-s * 0.58, s * 0.18, s * 1.16, s * 0.25);
    ctx.fillRect(-s * 0.12, -s * 0.18, s * 0.24, s * 0.4);
    ctx.fillRect(-s * 0.05, -s * 0.38, s * 0.78, s * 0.18);
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, s * 0.42);
    ctx.lineTo(-s * 0.62, s * 0.75);
    ctx.moveTo(s * 0.4, s * 0.42);
    ctx.lineTo(s * 0.62, s * 0.75);
    ctx.stroke();
  } else if (id === 'aura') {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, s * (0.35 + i * 0.25), 0, TAU);
      ctx.stroke();
    }
  } else if (id === 'squad') {
    for (const dx of [-s * 0.55, 0, s * 0.55]) {
      ctx.beginPath();
      ctx.arc(dx, -s * 0.12, s * 0.2, 0, TAU);
      ctx.fill();
      ctx.fillRect(dx - s * 0.18, s * 0.08, s * 0.36, s * 0.55);
    }
  } else if (id === 'speed') {
    for (let i = 0; i < 3; i++) {
      const ox = -s * 0.72 + i * s * 0.34;
      ctx.beginPath();
      ctx.moveTo(ox, -s * 0.5);
      ctx.lineTo(ox + s * 0.34, 0);
      ctx.lineTo(ox, s * 0.5);
      ctx.stroke();
    }
  } else if (id === 'vitality') {
    ctx.fillRect(-s * 0.12, -s * 0.6, s * 0.24, s * 1.2);
    ctx.fillRect(-s * 0.6, -s * 0.12, s * 1.2, s * 0.24);
  } else if (id === 'aegis') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.85);
    ctx.lineTo(s * 0.7, -s * 0.55);
    ctx.lineTo(s * 0.55, s * 0.34);
    ctx.quadraticCurveTo(0, s * 0.95, -s * 0.55, s * 0.34);
    ctx.lineTo(-s * 0.7, -s * 0.55);
    ctx.closePath();
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  } else if (id === 'magnet') {
    ctx.lineWidth = Math.max(2, s * 0.24);
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.55);
    ctx.lineTo(-s * 0.55, s * 0.05);
    ctx.arc(0, s * 0.05, s * 0.55, Math.PI, 0, true);
    ctx.lineTo(s * 0.55, -s * 0.55);
    ctx.stroke();
    ctx.fillRect(-s * 0.67, -s * 0.68, s * 0.24, s * 0.28);
    ctx.fillRect(s * 0.43, -s * 0.68, s * 0.24, s * 0.28);
  } else if (id === 'damage') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.55, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      ctx.moveTo(Math.cos(a) * s * 0.75, Math.sin(a) * s * 0.75);
      ctx.lineTo(Math.cos(a) * s * 1.0, Math.sin(a) * s * 1.0);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.16, 0, TAU);
    ctx.fill();
  } else if (id === 'bulletSpeed') {
    for (let i = 0; i < 3; i++) {
      const y = -s * 0.45 + i * s * 0.42;
      ctx.beginPath();
      ctx.moveTo(-s * 0.78, y);
      ctx.lineTo(s * 0.55, y);
      ctx.lineTo(s * 0.25, y - s * 0.2);
      ctx.moveTo(s * 0.55, y);
      ctx.lineTo(s * 0.25, y + s * 0.2);
      ctx.stroke();
    }
  } else if (id === 'lifesteal') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.82);
    ctx.bezierCurveTo(s * 0.68, -s * 0.12, s * 0.52, s * 0.65, 0, s * 0.82);
    ctx.bezierCurveTo(-s * 0.52, s * 0.65, -s * 0.68, -s * 0.12, 0, -s * 0.82);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-s * 0.18, -s * 0.18, s * 0.14, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (id === 'dashPower') {
    for (let i = 0; i < 3; i++) {
      const y = -s * 0.42 + i * s * 0.42;
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, y);
      ctx.lineTo(s * 0.5, y);
      ctx.lineTo(s * 0.2, y - s * 0.18);
      ctx.moveTo(s * 0.5, y);
      ctx.lineTo(s * 0.2, y + s * 0.18);
      ctx.stroke();
    }
  } else if (id === 'crit') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.9);
    ctx.lineTo(s * 0.2, -s * 0.2);
    ctx.lineTo(s * 0.9, 0);
    ctx.lineTo(s * 0.2, s * 0.2);
    ctx.lineTo(0, s * 0.9);
    ctx.lineTo(-s * 0.2, s * 0.2);
    ctx.lineTo(-s * 0.9, 0);
    ctx.lineTo(-s * 0.2, -s * 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (id === 'ricochet') {
    ctx.lineWidth = Math.max(2, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(-s * 0.82, s * 0.32);
    ctx.lineTo(-s * 0.3, -s * 0.25);
    ctx.lineTo(s * 0.18, s * 0.2);
    ctx.lineTo(s * 0.68, -s * 0.38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.68, -s * 0.38);
    ctx.lineTo(s * 0.38, -s * 0.42);
    ctx.moveTo(s * 0.68, -s * 0.38);
    ctx.lineTo(s * 0.56, -s * 0.1);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.55, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEvolutionPage() {
  const ids = Object.keys(EVOLUTIONS);
  ids.forEach((id, i) => {
    const evo = EVOLUTIONS[id];
    const skill = SKILLS[id];
    const partner = SKILLS[evo.needs];
    const lvl = G ? G.skills[id] : 0;
    const partnerLvl = G ? G.skills[evo.needs] : 0;
    const evolved = G ? !!G.evolved[id] : false;
    const ready = G && lvl >= SKILL_MAX && partnerLvl >= 3;
    const x = 60 + (i % 2) * 430;
    const y = 104 + Math.floor(i / 2) * 68;
    ctx.fillStyle = 'rgba(14,18,22,0.88)';
    ctx.strokeStyle = evolved ? '#7fe0a0' : ready ? '#ffd27a' : 'rgba(255,255,255,0.09)';
    ctx.lineWidth = evolved || ready ? 1.5 : 1;
    rr(x, y, 400, 58, 7);
    ctx.fill();
    ctx.stroke();
    drawSkillGlyph(id, x + 24, y + 29, 18, skill.color);
    ctx.textAlign = 'left';
    ctx.fillStyle = skill.color;
    ctx.font = '700 12px Consolas, monospace';
    ctx.fillText(skill.name, x + 48, y + 20);
    ctx.fillStyle = evolved ? '#7fe0a0' : ready ? '#ffd27a' : 'rgba(180,175,155,0.6)';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText(evolved ? 'EVOLVED · ' + evo.name : ready ? 'READY · ' + evo.name : 'EVOLVES → ' + evo.name, x + 48, y + 36);
    ctx.fillStyle = 'rgba(200,195,180,0.62)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(
      'SKILL ' + lvl + '/' + SKILL_MAX + ' · ' + partner.name.toUpperCase() + ' ' + partnerLvl + '/3',
      x + 48,
      y + 49
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = ready ? '#ffd27a' : evolved ? '#7fe0a0' : 'rgba(150,150,150,0.45)';
    ctx.font = '700 9px Consolas, monospace';
    ctx.fillText(ready ? 'READY' : evolved ? 'DONE' : 'LOCKED', x + 388, y + 20);
    ctx.textAlign = 'left';
  });
  drawButton('back-upgrades', 'BACK', W / 2, 500, 180, 34);
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
  ctx.fillText('SKILLS', W / 2, 58);
  ctx.fillStyle = 'rgba(200,190,165,0.65)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText(
    skillPage === 'grid'
      ? 'EVERY SKILL CAPS AT LEVEL 10 · PICK THREE CARDS ON LEVEL UP'
      : 'EVOLUTION SETTINGS · MAX A SKILL AT 10 AND ITS PARTNER AT 3',
    W / 2,
    78
  );
  ctx.fillStyle = 'rgba(190,185,170,0.55)';
  ctx.font = '600 8px Consolas, monospace';
  const ranks = skillRankTotal();
  const evoCount = G ? Object.keys(G.evolved).length : 0;
  ctx.fillText(
    'OWNED ' + (G ? SKILL_ORDER.filter((id) => G.skills[id] > 0).length : 0) + ' · RANKS ' + ranks + ' / ' + (SKILL_ORDER.length * SKILL_MAX) +
      ' · EVOLUTIONS ' + evoCount + ' / ' + Object.keys(EVOLUTIONS).length +
      (G ? ' · SLOTS ' + slotsUsed('offense') + '/' + slotCap('offense') + ' OFF · ' + slotsUsed('passive') + '/' + slotCap('passive') + ' DEF' : ''),
    W / 2,
    92
  );
  drawButton('skills-page', skillPage === 'grid' ? 'EVOLUTIONS' : 'SKILLS', W - 80, 20, 140, 26);
  if (skillPage === 'evolutions') {
    drawEvolutionPage();
    return;
  }

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
    drawSkillGlyph(id, x + 150, y + 13, 13, skill.color);
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
    const x = 42 + (i % 4) * 232;
    const y = 404 + Math.floor(i / 4) * 30;
    const active = G ? combo.needs.every((s) => G.skills[s] >= 2) : false;
    const known = !combo.secret || (save.secrets || []).indexOf(combo.id) >= 0;
    ctx.fillStyle = active ? 'rgba(255,210,122,0.12)' : 'rgba(14,18,22,0.65)';
    ctx.strokeStyle = active ? combo.color : 'rgba(255,255,255,0.06)';
    rr(x - 4, y - 8, 224, 28, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = !known ? 'rgba(120,115,105,0.4)' : active ? combo.color : 'rgba(200,195,180,0.45)';
    ctx.font = '700 9px Consolas, monospace';
    ctx.fillText((active ? '● ' : '○ ') + (known ? combo.name : '???'), x + 4, y + 2);
    ctx.fillStyle = 'rgba(190,185,170,0.55)';
    ctx.font = '600 8px Consolas, monospace';
    ctx.fillText(known ? combo.needs.map((s) => SKILLS[s].short).join(' + ') : 'SECRET · UNDISCOVERED', x + 4, y + 10);
    ctx.fillText(known ? combo.desc : 'Find the hidden pair.', x + 4, y + 19);
  });

  drawButton('back-upgrades', 'BACK', W / 2, 512, 180, 34);
}

function drawPauseScreen() {
  overlay(0.75);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c8';
  ctx.font = '700 36px Consolas, monospace';
  ctx.fillText('PAUSED', W / 2, 128);
  drawButton('resume', 'RESUME', W / 2, 154, 260, 44);
  drawButton('mapview-pause', 'MAP', W / 2, 204, 260, 38);
  drawButton('upgrades-pause', 'SKILLS', W / 2, 248, 260, 38);
  drawButton('settings-pause', 'SETTINGS', W / 2, 292, 260, 38);
  drawButton('restart', 'RESTART RUN', W / 2, 336, 260, 38);
  drawButton('menu-pause', 'MAIN MENU', W / 2, 380, 260, 38);
  ctx.fillStyle = 'rgba(200,190,165,0.55)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('ESC RESUMES', W / 2, 432);
  const buildName = (SKILLS[primarySkill()] || {}).name || 'SURVIVOR';
  const buildCount = SKILL_ORDER.filter((id) => G.skills[id] > 0).length;
  ctx.fillStyle = 'rgba(159,216,255,0.6)';
  ctx.font = '600 9.5px Consolas, monospace';
  ctx.fillText(buildName + ' · LEVEL ' + G.level + ' · ' + buildCount + ' SKILLS · ' + G.kills + ' KILLS', W / 2, 446);
  const fieldNote = G && LORE.find((note) => note.map === G.map);
  if (fieldNote) {
    panel(W / 2 - 270, 456, 540, 32, 6);
    ctx.fillStyle = '#ffd27a';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText('FIELD NOTE · ' + fieldNote.note, W / 2, 476);
  }
}

function drawLevelUpCelebration() {
  const pulse = 0.5 + 0.5 * Math.sin(uiT * 5);
  const glow = ctx.createRadialGradient(W / 2, 96, 20, W / 2, 96, 360);
  glow.addColorStop(0, 'rgba(255,210,122,' + (0.08 + 0.04 * pulse) + ')');
  glow.addColorStop(1, 'rgba(255,210,122,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const colors = ['#ffd27a', '#63dcc0', '#ff8ad8', '#9fd8ff'];
  for (let i = 0; i < 26; i++) {
    const x = (hash2(i, 31) * W + uiT * (10 + hash2(i, 37) * 18)) % W;
    const y = (hash2(i, 41) * H + uiT * (16 + hash2(i, 43) * 26)) % H;
    ctx.globalAlpha = 0.2 + hash2(i, 47) * 0.45;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, 2, 3);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,210,122,' + (0.07 + 0.06 * pulse) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, 96, 82 + pulse * 10, 0, TAU);
  ctx.stroke();
}

function drawEvoCard(base, i, x, y, w, h) {
  const evo = EVOLUTIONS[base];
  const skill = SKILLS[base];
  uiButtons.push({ id: 'upgrade-' + i, label: 'EVOLVE ' + evo.name, x, y, w, h });
  const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  ctx.fillStyle = hover ? 'rgba(40,34,18,0.98)' : 'rgba(24,20,12,0.94)';
  ctx.strokeStyle = hover ? '#ffd27a' : 'rgba(255,210,122,0.55)';
  ctx.lineWidth = hover ? 2.5 : 1.5;
  rr(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 13px Consolas, monospace';
  ctx.fillText('⚡ EVOLVE', x + w / 2, y + 32);
  ctx.fillStyle = skill.color;
  ctx.font = '700 20px Consolas, monospace';
  ctx.fillText(evo.name, x + w / 2, y + 58);
  ctx.fillStyle = 'rgba(190,185,165,0.75)';
  ctx.font = '600 10.5px Consolas, monospace';
  ctx.fillText(skill.name + ' 10 + ' + SKILLS[evo.needs].name + ' 3', x + w / 2, y + 76);
  drawSkillGlyph(base, x + w / 2, y + 102, 22, '#ffd27a');
  ctx.fillStyle = 'rgba(220,215,200,0.88)';
  ctx.font = '600 11.5px Consolas, monospace';
  const words = evo.desc.split(' ');
  let line = '';
  let ly = y + 130;
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (next.length > 26 && line) {
      ctx.fillText(line, x + w / 2, ly);
      ly += 15;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x + w / 2, ly);
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 34px Consolas, monospace';
  ctx.fillText(String(i + 1), x + w / 2, y + h - 14);
}

function drawLevelUpScreen() {
  overlay(0.78);
  drawLevelUpCelebration();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 32px Consolas, monospace';
  ctx.fillText('LEVEL ' + G.level, W / 2, 82);
  ctx.fillStyle = 'rgba(220,210,190,0.72)';
  ctx.font = '600 11px Consolas, monospace';
  ctx.fillText('CHOOSE A SKILL · PRESS 1, 2 OR 3   ·   R REROLLS', W / 2, 104);

  const startX = (W - (240 * 3 + 24 * 2)) / 2;
  const cardY = 126;
  const cardH = 302;
  G.offers.forEach((id, i) => {
    const x = startX + i * 264;
    uiButtons.push({ id: 'banish-' + i, label: 'BANISH', x: x + 240 - 30, y: cardY + 8, w: 22, h: 22 });
  });

  G.offers.forEach((id, i) => {
    const x = startX + i * 264;
    const y = cardY;
    const w = 240;
    const h = cardH;
    if (typeof id === 'string' && id.indexOf('evo:') === 0) {
      drawEvoCard(id.slice(4), i, x, y, w, h);
      return;
    }
    const skill = SKILLS[id];
    const lvl = G.skills[id];
    const evo = EVOLUTIONS[id];
    uiButtons.push({ id: 'upgrade-' + i, label: skill.name, x, y, w, h });
    const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    const cardGroup = skillGroup(id);
    const groupTint = cardGroup === 'passive' ? '99,220,192' : cardGroup === 'active' ? '201,216,255' : '255,210,122';
    const cardBorder = hover ? skill.color : 'rgba(' + groupTint + ',0.42)';
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 5;
      rr(x - 2, y - 2, w + 4, h + 4, 10);
      ctx.stroke();
    }
    ctx.fillStyle = hover ? 'rgba(32,36,42,0.98)' : 'rgba(16,20,24,0.94)';
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = hover ? 2 : 1.5;
    rr(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hover ? 'rgba(255,245,225,0.07)' : 'rgba(255,245,225,0.035)';
    rr(x + 1.5, y + 1.5, w - 3, 16, 5);
    ctx.fill();
    if (G.evolved[id]) {
      ctx.fillStyle = 'rgba(127,224,160,0.5)';
      ctx.fillRect(x + 8, y + h - 6, w - 16, 2);
    }

    const banishHover = mouse.x >= x + w - 28 && mouse.x <= x + w - 6 && mouse.y >= y + 8 && mouse.y <= y + 30;
    ctx.fillStyle = banishHover ? 'rgba(255,107,82,0.25)' : 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = banishHover ? '#ff6b52' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    rr(x + w - 28, y + 8, 22, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = banishHover ? '#ff6b52' : 'rgba(180,175,155,0.6)';
    ctx.font = '700 13px Consolas, monospace';
    ctx.fillText('×', x + w - 17, y + 23);

    ctx.textAlign = 'center';
    ctx.fillStyle = skill.color;
    ctx.font = '700 17px Consolas, monospace';
    ctx.fillText(skill.name, x + w / 2, y + 36);

    ctx.fillStyle = 'rgba(190,185,165,0.65)';
    ctx.font = '600 10.5px Consolas, monospace';
    const group = skillGroup(id);
    const tag = group === 'passive' ? 'DEF' : 'OFF';
    ctx.fillText(
      lvl === 0 ? 'NEW · ' + tag + ' ' + slotsUsed(group) + '/' + slotCap(group) : 'LEVEL ' + lvl + ' → ' + (lvl + 1),
      x + w / 2,
      y + 54
    );

    drawSkillGlyph(id, x + w / 2, y + 80, 22, skill.color);

    ctx.fillStyle = 'rgba(220,215,200,0.88)';
    ctx.font = '600 11.5px Consolas, monospace';
    const words = skill.desc.split(' ');
    let line = '';
    let ly = y + 104;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (next.length > 26 && line) {
        ctx.fillText(line, x + w / 2, ly);
        ly += 15;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x + w / 2, ly);

    const statY = y + 148;
    ctx.fillStyle = 'rgba(255,210,122,0.08)';
    ctx.strokeStyle = 'rgba(255,210,122,0.22)';
    ctx.lineWidth = 1;
    rr(x + 12, statY, w - 24, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 9.5px Consolas, monospace';
    ctx.fillText(skillStatLine(id, lvl), x + w / 2, statY + 14);

    ctx.fillStyle = 'rgba(200,195,180,0.65)';
    ctx.font = '600 9px Consolas, monospace';
    const detailWords = (SKILL_DETAILS[id] || '').split(' ');
    let detail = '';
    let detailY = statY + 30;
    for (const word of detailWords) {
      const next = detail ? detail + ' ' + word : word;
      if (next.length > 34 && detail) {
        ctx.fillText(detail, x + w / 2, detailY);
        detailY += 12;
        detail = word;
      } else {
        detail = next;
      }
    }
    if (detail) ctx.fillText(detail, x + w / 2, detailY);

    if (evo) {
      ctx.fillStyle = G.evolved[id] ? '#7fe0a0' : 'rgba(255,210,122,0.85)';
      ctx.font = '700 10px Consolas, monospace';
      ctx.fillText(
        G.evolved[id] ? '⚡ EVOLVED · ' + evo.name : '⚡ EVOLVES · ' + SKILLS[evo.needs].name,
        x + w / 2,
        y + h - 46
      );
    }

    ctx.fillStyle = skill.color;
    ctx.font = '700 34px Consolas, monospace';
    ctx.fillText(String(i + 1), x + w / 2, y + h - 14);
  });

  drawButton('reroll', 'REROLL (' + G.rerolls + ')', W / 2 - 120, 448, 170, 36);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(190,185,170,0.55)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText('CLICK × TO BANISH (' + G.banishes + ' LEFT)', W / 2 + 120, 470);
}

function drawRelicGlyph(id, cx, cy, size, color) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 2;
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, size * 0.06);
  if (id === 'chrono') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.75, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -s * 0.5);
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.4, s * 0.15);
    ctx.stroke();
  } else if (id === 'voidlens') {
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.85, s * 0.5, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.32, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0b0b0b';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.15, 0, TAU);
    ctx.fill();
  } else if (id === 'overclock') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55);
      ctx.lineTo(Math.cos(a) * s * 0.95, Math.sin(a) * s * 0.95);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.55, 0, TAU);
    ctx.stroke();
  } else if (id === 'volatile') {
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r = i % 2 === 0 ? s * 0.95 : s * 0.4;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (id === 'warhead') {
    ctx.beginPath();
    ctx.arc(0, s * 0.12, s * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillRect(-s * 0.16, -s * 0.68, s * 0.32, s * 0.22);
    ctx.beginPath();
    ctx.arc(s * 0.3, -s * 0.62, s * 0.24, Math.PI, Math.PI * 1.8);
    ctx.stroke();
  } else if (id === 'bloodstone') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.82);
    ctx.bezierCurveTo(s * 0.68, -s * 0.1, s * 0.5, s * 0.65, 0, s * 0.82);
    ctx.bezierCurveTo(-s * 0.5, s * 0.65, -s * 0.68, -s * 0.1, 0, -s * 0.82);
    ctx.fill();
  } else if (id === 'aegiscore') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.85);
    ctx.lineTo(s * 0.7, -s * 0.55);
    ctx.lineTo(s * 0.55, s * 0.34);
    ctx.quadraticCurveTo(0, s * 0.95, -s * 0.55, s * 0.34);
    ctx.lineTo(-s * 0.7, -s * 0.55);
    ctx.closePath();
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  } else if (id === 'lodestone') {
    ctx.lineWidth = Math.max(2, s * 0.24);
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.55);
    ctx.lineTo(-s * 0.55, s * 0.05);
    ctx.arc(0, s * 0.05, s * 0.55, Math.PI, 0, true);
    ctx.lineTo(s * 0.55, -s * 0.55);
    ctx.stroke();
    ctx.fillRect(-s * 0.67, -s * 0.68, s * 0.24, s * 0.28);
    ctx.fillRect(s * 0.43, -s * 0.68, s * 0.24, s * 0.28);
  } else if (id === 'thornhide') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s * 0.35, Math.sin(a) * s * 0.35);
      ctx.lineTo(Math.cos(a) * s * 0.95, Math.sin(a) * s * 0.95);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.35, 0, TAU);
    ctx.fill();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * s * 0.8;
      const py = Math.sin(a) * s * 0.8;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.25, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
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
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 5;
      rr(x - 2, y - 2, w + 4, h + 4, 10);
      ctx.stroke();
    }
    ctx.fillStyle = hover ? 'rgba(36,40,44,0.98)' : 'rgba(18,22,26,0.94)';
    ctx.strokeStyle = hover ? relic.color : 'rgba(99,220,192,0.4)';
    ctx.lineWidth = hover ? 2 : 1;
    rr(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,245,225,0.05)';
    rr(x + 1.5, y + 1.5, w - 3, 14, 5);
    ctx.fill();
    ctx.fillStyle = relic.color;
    ctx.font = '700 17px Consolas, monospace';
    ctx.fillText(relic.name, x + w / 2, y + 58);
    drawRelicGlyph(id, x + w / 2, y + 84, 22, relic.color);
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

  for (const room of roomsNear(px, py, 1200)) {
    const p = toScreen(room.x, room.y);
    if (p.x < left || p.x > left + view || p.y < top || p.y > top + view) continue;
    const state = G.rooms[room.id];
    ctx.strokeStyle = state && state.cleared ? '#63dcc0' : state ? '#ffcf5c' : '#d8b877';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - room.w * scale / 2, p.y - room.h * scale / 2, room.w * scale, room.h * scale);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = '700 7px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(state && state.cleared ? 'SECURED' : room.kind.toUpperCase(), p.x, p.y + room.h * scale / 2 + 11);
  }

  for (const e of G.enemies) {
    const p = toScreen(e.x, e.y);
    if (p.x < left || p.x > left + view || p.y < top || p.y > top + view) continue;
    if (e.boss) {
      const pulse = 0.5 + 0.5 * Math.sin(uiT * 5 + e.x * 0.01);
      ctx.strokeStyle = 'rgba(255,106,74,' + (0.5 + 0.4 * pulse) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 + pulse * 2, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ff6a4a';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x + 5, p.y);
      ctx.lineTo(p.x, p.y + 5);
      ctx.lineTo(p.x - 5, p.y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#c0281f';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, TAU);
      ctx.fill();
    }
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
  const mePulse = 0.5 + 0.5 * Math.sin(uiT * 4);
  ctx.strokeStyle = 'rgba(127,208,255,' + (0.45 + 0.35 * mePulse) + ')';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(me.x, me.y, 8 + mePulse * 3, 0, TAU);
  ctx.stroke();
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
  const sideW = 200;
  const sideX = cx0 - 8;
  panel(sideX, top, sideW, view, 6);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f0d8a8';
  ctx.font = '700 11px Consolas, monospace';
  ctx.fillText('CONTRACTS', cx0 + 6, top + 22);
  G.contracts.forEach((c, i) => {
    const def = CONTRACTS.find((d) => d.id === c.id);
    const progress = def ? Math.min(c.target, def.goal(G)) : 0;
    const cy = top + 42 + i * 36;
    ctx.fillStyle = 'rgba(20,24,30,0.6)';
    rr(cx0 + 2, cy - 10, sideW - 20, 30, 4);
    ctx.fill();
    ctx.fillStyle = c.done ? '#63dcc0' : '#e0dbcd';
    ctx.font = '700 9.5px Consolas, monospace';
    ctx.fillText((c.done ? '✓ ' : '○ ') + c.name, cx0 + 8, cy + 4);
    ctx.fillStyle = c.done ? 'rgba(99,220,192,0.85)' : 'rgba(180,175,155,0.7)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText((c.done ? 'COMPLETE' : progress + ' / ' + c.target) + '  (+' + c.reward + ' SH)', cx0 + 10, cy + 16);
  });

  const telY = top + 172;
  ctx.fillStyle = 'rgba(255,210,122,0.25)';
  ctx.fillRect(cx0 + 4, telY - 14, sideW - 24, 1);
  ctx.fillStyle = '#f0d8a8';
  ctx.font = '700 10.5px Consolas, monospace';
  ctx.fillText('FIELD TELEMETRY', cx0 + 6, telY);

  const telRows = [
    ['UNBANKED', Math.floor(G.unbanked) + ' SH', '#ffd27a'],
    ['SECURED', Math.floor(G.banked) + ' SH', '#63dcc0'],
    ['ALERT LEVEL', Math.round(G.alert) + '%', G.alert > 55 ? '#ff6b52' : '#e0dbcd'],
    ['MARKET RATE', 'x' + G.market.toFixed(2), '#ffd27a']
  ];
  telRows.forEach((r, idx) => {
    const ry = telY + 22 + idx * 24;
    ctx.fillStyle = 'rgba(180,175,155,0.65)';
    ctx.font = '600 9px Consolas, monospace';
    ctx.fillText(r[0], cx0 + 6, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = r[2];
    ctx.font = '700 10.5px Consolas, monospace';
    ctx.fillText(r[1], cx0 + sideW - 18, ry);
    ctx.textAlign = 'left';
  });

  ctx.textAlign = 'center';
  drawButton('map-close', 'CLOSE', W / 2, 532, 180, 38);
}

function drawOverScreen() {
  overlay(0.86);
  ctx.textAlign = 'center';
  const victory = G.victory;
  if (victory) {
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 40px Consolas, monospace';
    ctx.fillText(G.mode === 'bossrush' ? 'BOSS RUSH CLEARED' : 'SURVIVED THE LIMIT', W / 2, 88);
    ctx.fillStyle = '#e7eef3';
    ctx.font = '700 22px Consolas, monospace';
    ctx.fillText(fmtTime(G.time) + ' ON ' + MAPS[G.map].name, W / 2, 120);
  } else {
    ctx.fillStyle = '#ff6b52';
    ctx.font = '700 40px Consolas, monospace';
    ctx.fillText('THE HORDE WINS', W / 2, 88);
    ctx.fillStyle = '#e7eef3';
    ctx.font = '700 22px Consolas, monospace';
    ctx.fillText('SURVIVED ' + fmtTime(G.time), W / 2, 120);
  }

  // After-Action Report (AAR) Card
  const panelW = 580;
  const panelH = 204;
  const panelX = W / 2 - panelW / 2;
  const panelY = 142;
  ctx.fillStyle = 'rgba(14,18,24,0.96)';
  ctx.strokeStyle = victory ? 'rgba(255,210,122,0.45)' : 'rgba(255,107,82,0.45)';
  ctx.lineWidth = 1.5;
  rr(panelX, panelY, panelW, panelH, 8);
  ctx.fill();
  ctx.stroke();

  // Score headline
  ctx.fillStyle = '#ffd27a';
  ctx.font = '700 22px Consolas, monospace';
  ctx.fillText('SCORE ' + Math.round(G.score).toLocaleString('en-US'), W / 2, panelY + 32);
  const record = G.score > 0 && Math.round(G.score) >= (save.bestScore || 0);
  ctx.fillStyle = record ? '#63dcc0' : 'rgba(200,190,165,0.7)';
  ctx.font = '600 10.5px Consolas, monospace';
  ctx.fillText(
    (record ? '★ NEW PERSONAL BEST ★  ·  ' : '') + 'BEST SCORE ' + (save.bestScore || 0).toLocaleString('en-US') + '  ·  BEST TIME ' + fmtTime(best.time) + (G.boardRank > 0 && G.boardRank <= 10 && G.score > 0 ? '  ·  BOARD #' + G.boardRank : ''),
    W / 2,
    panelY + 50
  );

  // 4 metric badges: KILLS, LEVEL, SQUAD, BOSSES
  const stats = [
    ['KILLS', String(G.kills)],
    ['LEVEL', String(G.level)],
    ['SQUAD', String(G.soldiers.length)],
    ['BOSSES', String(G.bossKills || 0)]
  ];
  const bW = 120;
  const bH = 42;
  const bGap = 16;
  const bStartX = panelX + (panelW - (4 * bW + 3 * bGap)) / 2;
  stats.forEach((st, idx) => {
    const bx = bStartX + idx * (bW + bGap);
    const by = panelY + 66;
    ctx.fillStyle = 'rgba(22,28,34,0.85)';
    ctx.strokeStyle = 'rgba(255,210,122,0.2)';
    ctx.lineWidth = 1;
    rr(bx, by, bW, bH, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,175,155,0.65)';
    ctx.font = '600 9.5px Consolas, monospace';
    ctx.fillText(st[0], bx + bW / 2, by + 15);
    ctx.fillStyle = '#e7eef3';
    ctx.font = '700 16px Consolas, monospace';
    ctx.fillText(st[1], bx + bW / 2, by + 34);
  });

  // Rewards line
  ctx.fillStyle = '#63dcc0';
  ctx.font = '700 14px Consolas, monospace';
  ctx.fillText('+' + (G.shardsEarned || 0) + ' SHARDS   ·   ' + save.shards + ' TOTAL BANKED', W / 2, panelY + 134);

  // Run summary footer
  const modeLine =
    G.mode === 'bossrush'
      ? 'BOSS RUSH · ' + G.rush.index + ' / ' + G.rush.target + ' BOSSES'
      : G.mode === 'ops'
        ? 'OPS · ' + fmtTime(Math.max(0, 600 - G.time)) + ' LEFT'
        : 'SURVIVORS · WAVE ' + G.wave;
  const mut = MUTATIONS.find((m) => m.id === G.mutation);
  ctx.fillStyle = 'rgba(190,185,165,0.7)';
  ctx.font = '600 10px Consolas, monospace';
  ctx.fillText(operatorDef().name + ' · ' + modeLine + (mut && mut.id !== 'none' ? ' · ' + mut.name : '') + (G.relics.length ? ' · RELICS ' + G.relics.length + '/' + RELICS.length : ''), W / 2, panelY + 158);

  const combo = activeCombos();
  const comboY = panelY + (G.rivalsBeatenRun && G.rivalsBeatenRun.length ? 196 : 178);
  if (G.rivalsBeatenRun && G.rivalsBeatenRun.length) {
    ctx.fillStyle = '#ffd27a';
    ctx.font = '700 10px Consolas, monospace';
    ctx.fillText('RIVALS BEATEN · ' + G.rivalsBeatenRun.slice(0, 4).join(' · ') + (G.rivalsBeatenRun.length > 4 ? ' +' + (G.rivalsBeatenRun.length - 4) + ' MORE' : '') + '  (+' + G.rivalsBeatenRun.length * 25 + ')', W / 2, panelY + 178);
  }
  if (combo.length) {
    ctx.fillStyle = 'rgba(255,210,122,0.85)';
    ctx.font = '600 10px Consolas, monospace';
    ctx.fillText('COMBOS: ' + combo.map((c) => c.name).join(' · '), W / 2, comboY);
  }

  drawButton('retry', 'REDEPLOY', W / 2 - 130, 368, 240, 44);
  drawButton('menu-over', 'MAIN MENU', W / 2 + 130, 368, 240, 44);
  drawButton('stats-over', 'STATISTICS', W / 2, 426, 240, 36);
}

function drawScreens() {
  if (screen === 'menu') drawMenuScreen();
  else if (screen === 'setup') drawSetupScreen();
  else if (screen === 'armory') drawArmoryScreen();
  else if (screen === 'shop') drawShopScreen();
  else if (screen === 'statistics') drawStatisticsScreen();
  else if (screen === 'settings') drawSettingsScreen();
  else if (screen === 'help') drawHelpScreen();
  else if (screen === 'manual') drawManualScreen();
  else if (screen === 'daily') drawDailyScreen();
  else if (screen === 'leaderboard') drawLeaderboardScreen();
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

function buySkin(id) {
  const skin = SKINS.find((s) => s.id === id);
  if (!skin) return false;
  if (save.cosmetics.skins.indexOf(id) >= 0) {
    save.cosmetics.skin = id;
    writeStore(SAVE_KEY, save);
    sfx.upgrade();
    return true;
  }
  if (save.shards < skin.price) {
    sfx.denied();
    return false;
  }
  save.shards -= skin.price;
  save.cosmetics.skins.push(id);
  save.cosmetics.skin = id;
  writeStore(SAVE_KEY, save);
  sfx.upgrade();
  return true;
}

function pressButton(id) {
  sfx.click();
  if (id === 'play') {
    screen = 'setup';
    setupTab = 0;
    return;
  }
  if (id === 'setup-tab-0' || id === 'setup-tab-1' || id === 'setup-tab-2') {
    setupTab = Number(id.slice(10));
    return;
  }
  if (id === 'setup-next') {
    setupTab = Math.min(2, setupTab + 1);
    return;
  }
  if (id === 'setup-prev') {
    if (setupTab > 0) setupTab--;
    else screen = 'menu';
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
    if (!MAPS[map]) return;
    if (isMapUnlocked(map)) {
      setup.map = map;
      return;
    }
    const price = MAPS[map].price || 0;
    if (save.shards >= price) {
      save.shards -= price;
      save.unlocked.maps.push(map);
      writeStore(SAVE_KEY, save);
      setup.map = map;
      if (G) G.news = MAPS[map].name + ' unlocked for ' + price + ' shards.';
      sfx.upgrade();
      return;
    }
    if (G) G.news = MAPS[map].name + ' needs ' + price + ' shards.';
    sfx.denied();
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
  if (id.indexOf('mutation-') === 0) {
    const mut = id.slice(9);
    if (MUTATIONS.some((m) => m.id === mut)) setup.mutation = mut;
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
  if (id === 'shop') {
    shopTab = 0;
    screen = 'shop';
    return;
  }
  if (id === 'back-shop') {
    screen = 'menu';
    return;
  }
  if (id === 'shop-tab-0' || id === 'shop-tab-1') {
    shopTab = Number(id.slice(9));
    return;
  }
  if (id.indexOf('skin-') === 0) {
    buySkin(id.slice(5));
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
    skillPage = 'grid';
    screen = 'upgrades';
    return;
  }
  if (id === 'skills-page') {
    skillPage = skillPage === 'grid' ? 'evolutions' : 'grid';
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
  if (id === 'leaderboard') {
    boardAddMode = false;
    boardCode = '';
    boardMsg = '';
    screen = 'leaderboard';
    return;
  }
  if (id === 'back-board') {
    boardAddMode = false;
    screen = 'menu';
    return;
  }
  if (id.indexOf('board-') === 0) {
    const tab = id.slice(6);
    if (BOARD_TABS.some((t) => t.id === tab)) {
      boardTab = tab;
      boardMsg = '';
    }
    return;
  }
  if (id === 'friend-add') {
    boardAddMode = true;
    boardCode = '';
    boardMsg = 'TYPE THE 8-CHAR ALLY CODE';
    return;
  }
  if (id === 'friend-save') {
    tryAddFriend();
    return;
  }
  if (id === 'friend-cancel') {
    boardAddMode = false;
    boardCode = '';
    boardMsg = '';
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
  if (id.indexOf('manual-') === 0) {
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
  if (id === 'outlines') {
    settings.outlines = !settings.outlines;
    writeStore(SETTINGS_KEY, settings);
    return;
  }
  if (id === 'flashes') {
    settings.flashes = !settings.flashes;
    writeStore(SETTINGS_KEY, settings);
    return;
  }
  if (id === 'bomb-mode') {
    settings.bombMode = settings.bombMode === 'auto' ? 'manual' : 'auto';
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
    drawArenas(G.cam);
    drawRooms(G.cam);
    drawHazards(G.cam);
    drawDecor(G.cam);
    drawDecals();
    drawProps(G.cam);
    drawInteracts();
    drawPools();
    drawPickups();
    drawGrenades();
    drawAura();
    drawEnemies();
    drawBlades();
    drawSoldiers();
    drawHeli();
    drawTurrets();
    drawAfterimages();
    drawPlayer();
    drawShield();
    drawBullets();
    drawArcs();
    drawParticles();
    drawFloaters();
    ctx.restore();
    drawWeather();
    drawAmbience();
    drawDanger();
    if (screen === 'play' || screen === 'paused') drawHUD();
  if (touchMode) drawTouchControls();
    drawVignette();
    drawDangerBorder();
    if (G.flashT > 0 && settings.flashes) {
      ctx.globalAlpha = clamp(G.flashT / 0.4, 0, 1) * 0.2;
      ctx.fillStyle = G.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
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
    } else if (screen === 'leaderboard') {
      if (boardAddMode) {
        boardAddMode = false;
        boardCode = '';
        boardMsg = '';
      } else {
        screen = 'menu';
      }
    }
  }
  if (screen === 'leaderboard' && boardAddMode) {
    delete keys[k];
    if (/^[0-9a-f]$/.test(k)) {
      if (boardCode.length < 8) boardCode = (boardCode + k).toUpperCase();
      return;
    }
    if (k === 'backspace') {
      boardCode = boardCode.slice(0, -1);
      return;
    }
    if (k === 'enter') {
      tryAddFriend();
      return;
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
    if (b.page !== undefined && b.page !== setupTab) continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      pressButton(b.id);
      return true;
    }
  }
  return false;
}

let touchStick = { active: false, id: null, ox: 0, oy: 0, vx: 0, vy: 0 };
let touchMode = false;

function canvasXY(t) {
  const r = cv.getBoundingClientRect();
  return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
}

cv.addEventListener('touchstart', (e) => {
  touchMode = true;
  initAudio();
  e.preventDefault();
  if (screen !== 'play') {
    for (const t of e.changedTouches) {
      const p = canvasXY(t);
      clickAt(p.x, p.y);
    }
    return;
  }
  for (const t of e.changedTouches) {
    const p = canvasXY(t);
    if (p.x < W * 0.42) {
      touchStick.active = true;
      touchStick.id = t.identifier;
      touchStick.ox = p.x;
      touchStick.oy = p.y;
      touchStick.vx = 0;
      touchStick.vy = 0;
    } else {
      const bx = W - 86;
      const by = H - 96;
      if (Math.hypot(p.x - bx, p.y - by) < 46) keys['shift'] = true;
      else if (Math.hypot(p.x - (bx - 74), p.y - by) < 46) keys['e'] = true;
      else if (Math.hypot(p.x - (bx - 148), p.y - by) < 46) keys['r'] = true;
    }
  }
}, { passive: false });

cv.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touchStick.id) {
      const p = canvasXY(t);
      let dx = p.x - touchStick.ox;
      let dy = p.y - touchStick.oy;
      const d = Math.hypot(dx, dy);
      if (d > 64) { dx = dx / d * 64; dy = dy / d * 64; }
      touchStick.vx = dx / 64;
      touchStick.vy = dy / 64;
    }
  }
}, { passive: false });

cv.addEventListener('touchend', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touchStick.id) {
      touchStick.active = false;
      touchStick.id = null;
      touchStick.vx = 0;
      touchStick.vy = 0;
    }
  }
  keys['shift'] = false;
  keys['e'] = false;
  keys['r'] = false;
}, { passive: false });

cv.addEventListener('touchcancel', (e) => {
  touchStick.active = false;
  touchStick.id = null;
  touchStick.vx = 0;
  touchStick.vy = 0;
  keys['shift'] = false;
  keys['e'] = false;
  keys['r'] = false;
}, { passive: false });

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
      skillPage,
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
        bestScore: save.bestScore || 0,
        secrets: (save.secrets || []).slice(),
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
        unlocked: { weapons: (save.unlocked.weapons || []).slice(), maps: (save.unlocked.maps || []).slice() },
        killsByType: { ...save.killsByType },
        meta: { ...save.meta },
        boardBests: save.boardBests.map((e) => ({ ...e })),
        rivalsBeaten: (save.rivalsBeaten || []).slice(),
        friends: save.friends.map((f) => ({ ...f })),
        cosmetics: { skins: save.cosmetics.skins.slice(), skin: save.cosmetics.skin, vip: { premium: !!save.cosmetics.vip.premium, items: save.cosmetics.vip.items.slice() } },
        deviceCode: ownBoardCode()
      },
      setup: { ...setup, mutators: setup.mutators.slice() },
      setupTab,
      boardTab,
      daily: dailyInfo(),
      manual: {
        tab: manualTab,
        enemies: Object.keys(ENEMY_TYPES).length,
        bosses: Object.keys(BOSS_TYPES).length,
        relics: RELICS.length,
        lore: LORE.length,
        systems: SYSTEMS_ROWS.length,
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
      snap.boardRank = G.boardRank || 0;
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
      snap.hordePressure = hordePressure();
      snap.assault = { idx: G.surgeIdx, pending: G.surgePending, nextIn: Math.ceil(SURGE_EVERY - (G.time % SURGE_EVERY)) };
      snap.minimap = minimapGeom();
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
      snap.arena = arenaAtPoint(G.player.x, G.player.y);
      snap.room = roomAtPoint(G.player.x, G.player.y);
      snap.roomFocus = G.roomFocus;
      snap.roomsVisited = Object.keys(G.rooms).length;
      snap.rooms = Object.keys(G.rooms).map((id) => {
        const state = G.rooms[id];
        return {
          id,
          state: state.state,
          stage: state.stage,
          stages: state.stages,
          cleared: !!state.cleared,
          reward: state.reward,
          objective: state.objective
        };
      });
      snap.flashT = G.flashT;
      snap.soldiers = G.soldiers.map((s) => ({ x: s.x, y: s.y }));
      snap.enemies = G.enemies.map((e) => ({
        type: e.type,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        r: e.r,
        speed: e.speed,
        touch: e.touch,
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
      snap.dice = G.dice.length;
      snap.radios = G.radios.length;
      snap.radioArmed = G.radioArmed;
      snap.turrets = G.turrets.length;
      snap.auraRadius = auraRadius();
      snap.medkits = G.medkits.length;
      snap.floaters = G.floaters.length;
      snap.particles = G.particles.length;
      snap.particleKinds = G.particles.reduce((out, p) => {
        const k = p.kind || 'dot';
        out[k] = (out[k] || 0) + 1;
        return out;
      }, {});
      snap.afterimages = G.afterimages.length;
      snap.zaps = G.arcs.length;
      snap.decals = G.decals.length;
      snap.ambience = ambienceDef().mode;
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
        dice: G.stats.dice || 0,
        radio: G.stats.radio || 0,
        shieldSaves: G.stats.shieldSaves || 0,
        banked: G.stats.banked,
        lost: G.stats.lost,
        ricochets: G.stats.ricochets || 0,
        arcs: G.stats.arcs || 0
      };
      snap.bullets = G.bullets.map((b) => b.owner);
      snap.bulletColors = Array.from(new Set(G.bullets.map((b) => b.color)));
      snap.bulletPierce = G.bullets.filter((b) => b.owner === 'p').map((b) => b.pierce || 0);
      snap.bannerT = G.bannerT;
      snap.dash = { ready: G.dash.charges > 0, cd: G.dash.cd, t: G.dash.t, charges: G.dash.charges, max: dashMax() };
      snap.bomb = { ready: G.bomb.cd <= 0, cd: G.bomb.cd, mode: settings.bombMode };
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
  snap.interactables = G.interact.map((o) => ({ kind: o.kind, x: o.x, y: o.y }));
  snap.bunker = G.bunker ? { x: G.bunker.x, y: G.bunker.y, used: G.bunker.used } : null;
  snap.nuke = G.nuke ? { t: G.nuke.t, i: G.nuke.i, kills: G.nuke.kills, total: G.nuke.total } : null;
  snap.score = Math.round(G.score);
  snap.mutation = G.mutation;
  snap.camo = CAMO[G.map] || '#2f6fb5';
  snap.lastStand = !!G.lastStand;
      snap.milestones = STREAK_TIERS.filter((t) => G.kills >= t.kills).map((t) => t.name);
      snap.rank = { index: G.rankIdx, id: RANKS[G.rankIdx].id, name: RANKS[G.rankIdx].name, short: RANKS[G.rankIdx].short };
  snap.streakRewards = G.streakRewards.slice();
  snap.callout = G.callout && G.callout.t > 0 ? { text: G.callout.text, sub: G.callout.sub, color: G.callout.color } : null;
  snap.heli = !!G.heli;
  snap.airstrike = !!G.airstrike;
  snap.missiles = !!G.missiles;
  snap.warChest = G.warChest
    ? { x: G.warChest.x, y: G.warChest.y, need: G.warChest.need, remaining: Math.max(0, G.warChest.need - (G.kills - G.warChest.startKills)), open: !!G.warChest.open }
    : null;
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
    const found = uiButtons.find((b) => b.id === id && (b.page === undefined || b.page === setupTab));
    if (!found) return false;
    pressButton(found.id);
    return true;
  };
  window.Dustline.giveXp = (value) => {
    if (G) addXp(value);
  };
  window.Dustline.skillStatLine = skillStatLine;
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
  window.Dustline.spawnBulletAt = (x, y, ang, speed, dmg, owner) => {
    if (!G) return false;
    spawnBullet(Number(x) || 0, Number(y) || 0, Number(ang) || 0, Number(speed) || 300, Number(dmg) || 10, owner || 'e', '#ff3b30', { life: 2 });
    return true;
  };
  window.Dustline.spawnGems = (n, tier) => {
    if (!G) return false;
    const count = Math.max(0, Math.min(600, Math.floor(Number(n) || 0)));
    for (let i = 0; i < count; i++) G.gems.push({ x: G.player.x + (i % 20) * 8, y: G.player.y + Math.floor(i / 20) * 8, value: 1, tier: Math.max(0, Math.min(2, Math.floor(Number(tier) || 0))), spin: 0, vx: 0, vy: 0 });
    return true;
  };
  window.Dustline.gemStyle = (tier) => gemStyleFor(Math.max(0, Math.min(2, Math.floor(Number(tier) || 0))));
  window.Dustline.chooseUpgrade = (index) => {
    if (!G || screen !== 'levelup') return false;
    if (!G.offers[Number(index) || 0]) return false;
    chooseUpgrade(Number(index) || 0);
    return true;
  };
  window.Dustline.unlockMap = (id) => {
    if (!MAPS[id] || isMapUnlocked(id)) return false;
    save.unlocked.maps.push(id);
    writeStore(SAVE_KEY, save);
    return true;
  };
  window.Dustline.soldierBulletColor = () => (G ? soldierBulletColor() : null);
  window.Dustline.spawnDie = (x, y) => {
    if (!G) return false;
    G.dice.push({ x: G.player.x + (Number(x) || 0), y: G.player.y + (Number(y) || 0), spin: 0, pips: 1 + Math.floor(fxRnd() * 6) });
    return true;
  };
  window.Dustline.spawnRadio = (x, y) => {
    if (!G) return false;
    G.radios.push({ x: G.player.x + (Number(x) || 0), y: G.player.y + (Number(y) || 0), spin: 0 });
    return true;
  };
  window.Dustline.eventPool = () => eventPool().slice();
  window.Dustline.spawnMedkit = (x, y) => {
    if (G) G.medkits.push({ x: G.player.x + x, y: G.player.y + y });
  };
  window.Dustline.spawnBurst = (kind, x, y) => {
    if (!G) return false;
    burst(G.player.x + (x || 0), G.player.y + (y || 0), 12, '#ffcf7a', 160, 3, 0.5, kind || 'dot');
    return true;
  };
  window.Dustline.explode = (x, y, r, dmg) => {
    if (!G) return false;
    explodeAt(Number(x) || 0, Number(y) || 0, Number(r) || 80, Number(dmg) > 0 ? Number(dmg) : 150, '#ffb066', 'p');
    return true;
  };
  window.Dustline.ambience = () => ({ mode: ambienceDef().mode, count: ambienceDef().count });
  window.Dustline.decor = (x, y, r) => decorNear(Number(x) || 0, Number(y) || 0, Number(r) || 400).map((d) => ({ kind: d.kind, x: d.x, y: d.y }));
  window.Dustline.grantShards = (value) => {
    save.shards = Math.max(0, save.shards + Math.round(Number(value) || 0));
    writeStore(SAVE_KEY, save);
  };
  window.Dustline.buyMeta = (id) => buyMeta(id);
  window.Dustline.props = (x, y, r) => propsNear(x, y, r).map((p) => ({ kind: p.kind, x: p.x, y: p.y, w: p.w || 0, h: p.h || 0, r: p.r || 0 }));
  window.Dustline.arenaAt = (x, y) => arenaAtPoint(Number(x) || 0, Number(y) || 0);
  window.Dustline.roomAt = (x, y) => roomAtPoint(Number(x) || 0, Number(y) || 0);
  window.Dustline.rooms = (x, y, r) =>
    roomsNear(Number(x) || 0, Number(y) || 0, Number(r) || 0).map((room) => ({
      id: room.id,
      kind: room.kind,
      x: room.x,
      y: room.y,
      w: room.w,
      h: room.h,
      entrance: room.entrance
    }));
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
    G.enemies[index].ghostT = value ? 99 : 1.6;
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
  window.Dustline.spawnInteract = (kind, x, y) => {
    if (!G) return false;
    return spawnInteract(kind, Number(x), Number(y));
  };
  window.Dustline.spawnBunker = (x, y) => {
    if (!G) return false;
    return spawnBunker(Number(x), Number(y));
  };
  window.Dustline.spawnWarChest = (x, y, need) => {
    if (!G) return false;
    G.warChest = {
      x: x == null ? G.player.x : Number(x) || 0,
      y: y == null ? G.player.y : Number(y) || 0,
      need: Math.max(0, Number(need) || 10),
      startKills: G.kills,
      spin: 0,
      deniedCd: 0
    };
    return G.warChest;
  };
  window.Dustline.setKills = (value) => {
    if (!G) return 0;
    G.kills = Math.max(0, Math.floor(Number(value) || 0));
    checkRank();
    checkKillMilestones();
    return G.kills;
  };
  window.Dustline.setStreak = (value) => {
    if (!G) return 0;
    G.streak = Math.max(0, Math.floor(Number(value) || 0));
    G.streakT = 2.6;
    checkStreakRewards();
    return G.streak;
  };
  window.Dustline.triggerNuke = () => {
    if (!G || !G.bunker) return false;
    return triggerNuke(G.bunker);
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
  if (!Number.isFinite(t)) t = (Number.isFinite(last) ? last : 0) + 16;
  const dt = last === 0 ? 0.016 : Math.max(0, Math.min(0.033, (t - last) / 1000));
  last = t;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
