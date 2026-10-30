# Dustline

[![Built with AIKit](https://img.shields.io/badge/built%20with-AIKit-6f42c1)](https://github.com/AegeanWorks/AIKit)

Dustline: Survivors is a top-down horde-survival shooter in the spirit of Vampire Survivors: an endless procedural world, auto-firing weapons, four maps, eighteen mob types plus NetWatch hunters, five rotating bosses with random affixes plus three mega bosses, a dedicated eight-boss Boss Rush mode, weapon and active-skill evolutions, champion affixes, supply caches, three difficulty tiers, run mutators, map hazards, 19 skills across 6 offense and 6 defense slots, boss salvage relics, achievements, risky extraction banking, sector events and a permanent out-of-run armory.

## ⚡ 30-Second Cold-Start Quick Reference

- **Runtime Prerequisites**: Node.js 20 or newer (verified on Node 26) for the tests and the local server only. The game itself runs in any modern browser with canvas and WebAudio.
- **Play it**:
  ```bash
  npm start
  ```
  Then open `http://127.0.0.1:5173/`. Opening `index.html` directly also works.
- **Canonical Regression Shield Gate**:
  ```bash
  node --test tests
  ```

## 🎮 How to Play

You only move; your weapon, your blades, your bombs and any recruited squadmates do the fighting. You start alone. Choose a loadout before deploying, survive the horde, collect gems and build a combo.

| Input | Action |
|---|---|
| `WASD` / arrows | Move |
| `Shift` / `Space` | Dash (brief invulnerability, 1.5s cooldown) |
| `E` | Throw a bomb at the thickest part of the horde |
| `R` | Overdrive: burn heat for +40% damage but +50% damage taken |
| `M` | Open/close the map viewer |
| Mouse | Menus and upgrade cards |
| `1` / `2` / `3` | Pick an upgrade card |
| `Esc` | Pause menu (also pauses when the window loses focus) |
| `Enter` | Deploy from menus / retry after a run |

### Run setup

Before every run you pick:

- **Weapon**: AK-47 (balanced), SMG-45 (fast spray), SPAS-12 (pellet spread), DMR-308 (slow, piercing) or RAILGUN (slow, punches through whole lines).
- **Mode**: Survivors (endless waves) or Boss Rush (eight bosses back to back, cleared in order with a 4-second intermission and a 30% heal between fights).
- **Map**: Dust Basin, Whiteout Ridge, Ashfall or Greenfall. Each has its own palette and cover.
- **Time limit**: Endless, 5, 10 or 15 minutes. Reaching the limit wins the run.
- **Difficulty**: Normal, Brutal (tougher mobs, faster spawns, +35% loot) or Nightmare (+90% health, +50% spawns, +80% loot).
- **Mutators**: pick up to two run modifiers — Glass Cannon, Swarm, Elite Hunt, Fog, Vampiric Horde or Bounty — each raising shard loot.
- **Map hazard**: every map has terrain that changes the fight: quicksand slows you, ice speeds everyone up, ember vents burn, and vines slow the horde.

### Modes and screens

- **Main menu**: Deploy, Armory, Stats, Upgrades codex, Settings, How to play, plus lifetime progress.
- **Armory**: spend shards earned in runs on permanent Ballistics, Plate Carrier, Running Shoes, Scavenger Kit, Power Magnet, Loaded Dice and Loadout Rig (extra offense and defense slots) ranks.
- **Statistics**: runs, total kills, bosses slain, victories, best survival, most kills in a run, damage dealt, rush clears, best rush time, best wave and kills by mob type.
- **Upgrades codex**: all 19 skills, their slot group, evolutions, and what activates the seven skill combos.
- **Settings**: master volume (0-100%), screen shake and damage numbers, saved immediately.
- **Pause menu**: Resume, Map, Upgrades, Settings, Restart run, Main menu. Restarting or quitting ends the run like death: half of the unbanked shards are burned.
- **Map viewer**: explored territory, buildings, rocks, trees, hostiles and your facing.
- **Level up**: three distinct cards from skills below their level cap.

### The run

- **Infinite world**: deterministic tiles with buildings, rocks and trees; solid cover blocks bodies and bullets, and the camera follows with no bounds.
- **Enemies**: Crawler (chase), Stalker (fast weave), Bulwark (armored), Hexer (ranged), Spitter (acid), Bomber (suicide blast), Swarmling (fast swarm), Warden (plated), Weaver (blinks), Splitter (splits into swarmlings), Leech (drains health and shards), Shielder (damage aura), Tunneler (burrows and ambushes), Screamer (enrages packs), Phantom (phases out of damage), Mortar (lobs telegraphed shells), Widower (webs slow you) and Husk (dies into an acid pool that also burns the horde). Health, touch damage and spawn rates scale with time and difficulty.
- **Champions**: ~3% of mobs spawn as champions with a Volatile, Shielded or Swift affix, triple XP and a guaranteed supply cache.
- **Supply caches**: elite drops and rare finds. The first ten grant a free field upgrade; after that they pay shards.
- **Evolutions**: max a skill at level 5 and raise its partner to level 3 to evolve it. Weapons: Ripper (rifle), Storm (SMG), Breaker (SPAS), Reaper (DMR), Lancer (railgun). Actives: Tempest (blades), Cluster (grenades), Overwatch (turret), Solar Crown (aura).
- **Rerolls and banishes**: each run starts with 2 rerolls (more with Loaded Dice) and 1 banish, usable on the level-up screen.
- **Waves**: every 40 seconds the horde grows and new mob types unlock.
- **Bosses**: every fifth wave rotates between the Warlord (charge + fan fire), the Overseer (bullet spray, enraged below half health), the Bombardier (lobs bombs), the Hive (spawns broods, fires bullet rings) and the Sentinel (telegraphed lance beam). About a third of bosses arrive with a Frenzied, Shielded or Volatile affix. All have health bars, guaranteed loot and a salvage crate.
- **Boss Rush**: skip the horde and fight all eight bosses in order — Warlord, Overseer, Bombardier, Hive, Sentinel, then the Colossus, Leviathan and WYRM megas. Bosses get tougher each slot, the next signature arrives four seconds after each kill, and clearing the eighth wins the run. Boss minions and summoned adds still appear; wave spawns do not.
- **Salvage relics**: each boss leaves a crate for 40 seconds. Step on it to choose one of three relics, permanent for the run and outside the skill slots: Chrono Coil (+15% fire rate), Void Lens (+10% crit), Overclock Core (+25% bullet speed), Volatile Rounds (+30% blast), Warhead Casing (bigger, stronger bombs), Bloodstone (+3% lifesteal), Aegis Core (+1 shield charge), Lodestone (+60 pickup radius), Thornhide (reflect contact damage) or Greed Engine (+20% shards). Own all ten and crates pay shards instead.
- **Mega bosses**: every fourth boss slot (waves 20, 40, 60, ...) summons the Colossus, the Leviathan or the WYRM, a burrowing three-phase fight that erupts under you and spawns husks. All megas use radial barrages and minion calls. They drop a beacon, three medkits, twenty-two gems and chips.
- **Extraction banking**: bosses arm an extraction beacon. Touch it to secure your unbanked shards; dying before that burns half of them and extracting early is the push-your-luck decision.
- **Variable rewards**: each kill rolls standard data (70%), a 2.5x critical data jackpot (20%) or a hardware chip (10%) that grants shards, an Aegis shield, Frenzy, ordnance or repairs.
- **Near-miss surge**: an enemy left alive under 6% health triggers a near-miss and, once per window, a crit surge.
- **Sector alert and hunters**: kills raise alert; at 60% NetWatch hunters deploy and chase you across the map. Alert decays over time.
- **Sector events**: horde surges, supply drops, sandstorms, blackouts and bounty hunters fire on a seeded schedule and change visibility, speed and loot. A seeded market multiplier scales loot, and a news line reports the sector.
- **Contracts**: three rotating run objectives (cull, survive, salvage, demolition, evasion, chain kills) pay risky shards when completed.
- **Combo stake**: your kill streak multiplies XP and shard gain up to +50%, but taking a hit breaks it.
- **Weapons and skills**: five auto-firing weapons plus orbiting blades, frag grenades, sentry turrets, an ember aura, squad recruiting, and passives for speed, health, a regenerating Aegis shield, magnets, damage, bullet speed, lifesteal, dash damage and crits. Everything caps at level 5.
- **Loadout slots**: 6 offense slots (weapons and actives) and 6 defense slots (passives). Filling a group stops new picks of that kind, so level-ups become upgrades of what you own; the Loadout Rig armory upgrade adds a slot to both groups per rank. Slot usage is shown in the HUD and on level-up cards.
- **Level-up offers**: three cards, weighted toward skills you already own so builds deepen instead of scattering.
- **Combos**: raise both halves of a pair to level 2 to unlock Overclocked, Riposte, Vampire, Shrapnel, Demolition, Scavenger or Bastion.
- **Bombs**: `E` lobs a bomb at the densest cluster, with its own cooldown meter.
- **Pickups**: XP gems and medkits are both pulled in by the magnet radius.
- **Character growth**: your sprite gains veteran shoulder plates, an elite glow and a legend aura as you level, and its colors and gun follow your build.

### Progression saving

Progress is stored in `localStorage` under `dustline.save` with an explicit schema version. The loader refuses unknown versions without touching the file, migrates version 1, and clamps every field. Shards, lifetime kills, boss kills, best run, kills by mob type, armory ranks and the deterministic run seed persist across sessions.

### 🛠️ AIKit Commands (run from the AIKit folder)
| Role | Command |
|---|---|
| Status, task and gates | `python aikit.py status dustline` |
| Phase 4: every gate | `python aikit.py check dustline` |
| Repair memory and map, then check | `python aikit.py fix dustline` |
| Resume an interrupted task | `python aikit.py resume dustline` |

## 📦 What's Inside

```text
dustline/
├── index.html                <- canvas shell, page styling and control hint
├── game.js                   <- world, combat, skills, bosses, HUD, screens, audio
├── scripts/
│   └── serve.js              <- zero-dependency static server for `npm start`
├── tests/
│   ├── harness.js            <- seeded, headless canvas stub that boots game.js in a VM
│   ├── game.test.js          <- node:test suite for runs, combat, meta and screens
│   └── server.test.js        <- node:test suite for the static server's safety rules
├── package.json              <- scripts and Node engine floor
├── .gitignore                <- transient AIKit state excluded
├── LICENSE                   <- Aegean Game License 1.1 (AGL-1.1): DRM-free personal play
├── COMMERCIAL.md             <- Commercial licensing terms
├── ASSETS.md                 <- Asset/data manifest: what the license covers
├── LICENSES/                 <- REUSE license texts
├── REUSE.toml                <- Machine-readable SPDX metadata
├── README.md
└── .aikit/                   <- this project's memory: record, ledger, decisions
```

## 🧪 Tests

`tests/harness.js` stubs the canvas context, window events and `requestAnimationFrame`, seeds `Math.random` for reproducible runs, then boots the real `game.js` inside `node:vm` and drives frames deterministically. The suite covers menu and setup navigation, weapon/map/limit selection, deployment, auto-fire, squad recruitment and formation, all eighteen regular mob types, champions and cache drops, weapon and active-skill evolutions, aegis shield absorption and recharge, offense/defense slot caps and the loadout rig, boss salvage crates and all ten relic effects, boss rush spawning, intermissions and the eight-boss victory, rush records and best wave, shield-save and relic achievements, difficulty scaling, rerolls and banishes, mutators and hazards, sentry turrets and ember aura, achievements, red enemy projectiles, upgrade cards and caps, blades/grenades/dash damage, bomb throwing and cluster targeting, lifesteal, combos, boss rotation and boss attacks, hive broods and rings, sentinel beam telegraph and damage, boss affixes, railgun piercing and its lancer evolution, mortar shells, widower webs, husk acid pools, the WYRM burrow/erupt cycle, mega bosses and phases, boss loot, extraction banking and death loss, variable-ratio rewards and chips, near-miss surge, warden armor, splitter swarms, alert and hunters, sector events, overdrive, contracts, survival bonus, medkit magnetism, procedural cover, map viewer, armory purchases, statistics, settings persistence, pause/restart, death and saving, time-limit victory, cross-session persistence, the endless map and camera, wave escalation, focus-loss auto-pause and the static server.

`game.js` publishes read-only `window.Dustline.snapshot()` in every build. State-changing helpers (`giveXp`, `spawnEnemy`, `spawnBoss`, `setTime`, `killEnemies`, `hurt`, `applyUpgrade`, `setInvulnerable`, `clickButton`, `startRun`, `throwBomb`, `spawnMedkit`, `grantShards`, `buyMeta`, `props`, `setPlayer`, `setAlert`, `setUnbanked`, `bankNow`, `triggerEvent`, `setEventCd`, `setRng`, `setEnemyHp`, `setOverdrive`, `spawnChip`, `hitEnemy`, `setHunterCd`, `forceContracts`, `spawnChest`, `reroll`, `banish`, `forceChampion`, `forceBossAffix`, `grantRelic`, `spawnSalvage`, `setGhost`, `setBurrowed`, `hazardAtPoint`, `setMutators`) exist only when the harness sets `window.__DUSTLINE_TEST__`.

### UI contract note

This is a single-canvas game: the entire user-visible surface is one `<canvas>`, driven by the same `game.js` that the mechanics tests boot headlessly. The project therefore opts out of the separate DOM UI-contract task workflow (`ui_required: false`, `ui_source: manual`); the canvas is exercised by the seeded VM suite instead. See `.aikit/decisions.md` ADR-002.

## 🧠 Behavioral Design Notes

These systems are ported from CyberPulse's behavioral-psychology design review (ADR-002 there) and grounded in the same literature: variable-ratio reinforcement (Skinner), near-miss reward-pathway activation (Clark et al.), loss aversion and push-your-luck (Kahneman & Tversky), flow-channel risk (Csikszentmihalyi) and autonomy/competence (Ryan & Deci). They are implemented without paywalls or dark patterns; all rewards are earned in-run and all risk is opt-in.

## 📜 License

Free for personal play under the Aegean Game License 1.1 (AGL-1.1); see [LICENSE](LICENSE). It is DRM-free: Licensor ships no DRM and a distributor may not add it. Streaming, modding and free mods are allowed. Commercial use, paid mods and AI training need the Aegean Commercial License 1.0 (ACL-1.0); see [COMMERCIAL.md](COMMERCIAL.md).
