# Decisions

Why this project is built the way it is, oldest first. One entry per decision that changes a
contract, a dependency, a data format or the architecture; IDs are consecutive and never reused.

<!-- Entry format:
### ADR-NNN: <decision in one line>
- **Date**: YYYY-MM-DD
- **Status**: Accepted
- **Context**: <what forced the decision>
- **Decision**: <what was decided>
- **Consequences**: <what follows, including what it costs>
-->

### ADR-001: Rebuild the arena demo as a survivor-style horde game
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: The arena wave shooter reached its design ceiling; the user asked for a Vampire Survivors loop with an endless map, squad AI, upgrades and menus.
- **Decision**: Replace the round-based arena with an endless horde loop: auto-firing weapons, XP gems, level-up cards, endless tiles and a pause/settings/upgrade screen set.
- **Consequences**: The old ammo, reload, wall and score contracts are gone; the snapshot and test seam were rewritten. The single-file game keeps the browser build zero-dependency.

### ADR-002: Opt out of the DOM UI-contract task workflow for a single-canvas game
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: AIKit auto-detection added a required UI contract for `index.html`, but the project has no DOM surface to snapshot: all UI is drawn on one canvas and booted headlessly by the mechanics suite.
- **Decision**: Keep `ui_required: false` with `ui_source: manual` and no `.aikit/ui.json`; rely on the seeded VM suite for UI and mechanics coverage.
- **Consequences**: `aikit fix` may re-add a detected contract; this ADR records the deliberate choice so it is reverted rather than silently accepted. There is no external DOM-box inventory.

### ADR-003: Versioned save format with migration and refusal
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: Progress (shards, lifetime kills, best run, armory) must survive reloads without corrupting an older or newer client.
- **Decision**: Store progress in `dustline.save` with `v: 2`, migrate v1, refuse unknown versions without writing or quarantining, and clamp every numeric field on load.
- **Consequences**: The old `dustline.best` score key is no longer read; pre-0.3 bests are not migrated (acceptable before 1.0). New fields need a schema bump.

### ADR-004: Deterministic solid cover with sliding collision
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: Buildings, rocks and trees add tactical cover, but axis-locked blocking made a single wall a death trap.
- **Decision**: Generate cover per 300px tile from `hash2`, keep a 300px safe spawn ring, block bullets with buildings only, and resolve bodies per axis so movement slides along cover.
- **Consequences**: World layout is reproducible from the seed, cover is non-destructible, and corpse-free tiles cost a hash per nearby tile per frame.

### ADR-005: Three rotating boss styles instead of one escalator
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: A single melee boss was easy to kite and gave every fifth wave the same answer.
- **Decision**: Rotate Warlord (charge plus fan fire), Overseer (spray, enraged below half health) and Bombardier (lobs bombs) every fifth wave, all with scaled health, health bars and guaranteed loot.
- **Consequences**: Each boss forces a different movement pattern; boss health scales with both run time and boss count. Balance lives in the tuning constants.

### ADR-006: Port CyberPulse's behavioral-psychology mechanics into Dustline
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: The user asked to look at CyberPulse's literature review (its ADR-002: Self-Determination Theory/PENS, variable-ratio reinforcement, near-miss striatal feedback, prospect-theory loss aversion, and the flow channel) and integrate those functions. Dustline v0.5 had fixed rewards, no in-run risk decision and no reactive world.
- **Decision**: Add six literature-derived systems: (1) variable-ratio kill rewards (70% standard, 20% 2.5x jackpot, 10% hardware chip with a buff), (2) near-miss detection at <=6% enemy health that opens a one-shot crit surge, (3) push-your-luck extraction beacons that bank unbanked shards while death burns half, (4) a kill-streak multiplier up to +50% that breaks on taking damage, (5) voluntary Overdrive (R): +40% damage dealt and +50% damage taken with a draining heat meter, and (6) a living sector: alert, NetWatch hunters, seeded ambient events, news, contracts and a drifting market index. It also adds four mobs (Warden, Weaver, Splitter, Leech), two three-phase mega bosses (Colossus, Leviathan) after every three regular bosses, and persists the deterministic run seed.
- **Consequences**: Rewards are now earned and risky rather than fixed; the run has explicit opt-in stakes (banking, overdrive) and a reactive world. The save schema keeps adding fields additively and the seed advances per run. All reward rolls use an in-run LCG so seeded tests and replays are deterministic.

### ADR-007: Evolution, champion, difficulty and agency systems
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The v0.6 loop had flat build payoffs, one fixed challenge level, no mid-run build agency beyond level-up picks, and four mob types that existed only behind test seams. Playtesting showed the build peaked early and the spawn table never used every designed mob.
- **Decision**: Add (1) weapon evolutions when a weapon reaches level 5 and its designated partner reaches level 3 (Ripper, Storm, Breaker, Reaper); (2) champion mobs at 3% with Volatile/Shielded/Swift affixes, triple XP and a guaranteed supply cache; (3) supply caches that grant at most ten free field upgrades per run, then pay shards; (4) three difficulty tiers that scale spawn rate, enemy health, incoming damage and loot; (5) level-up rerolls (2 plus Loaded Dice) and one banish per run; and (6) Shielder, Tunneler, Screamer and Phantom in the real spawn table. Tuning: steeper XP curve (6+6 per level), champions cut from 12% to 3%, cache upgrades capped at ten.
- **Consequences**: Builds now have a visible late-game payoff, elites are scarce and valuable instead of a flood, difficulty is a player choice with a matching reward, and every designed mob actually spawns. The save schema gains champion/cache counters; the run seed still governs champion rolls.

### ADR-008: Terrain hazards, run mutators, deployable skills and achievements
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: v0.7 gave builds a late-game payoff and a difficulty choice, but every map played the same, every run had identical rules, the active-skill roster ended at blades/grenades, and lifetime progress had no goals beyond counters.
- **Decision**: Add (1) a deterministic terrain hazard per map (quicksand slow, ice speed, ember burn, vine slow) drawn from a hashed 280px field; (2) six opt-in run mutators, at most two per run, with a shard-loot multiplier; (3) two active skills, Sentry Turret (deploys up to two timed auto-firing guns) and Ember Aura (pulses damage in a radius); and (4) twelve lifetime achievements evaluated live against save plus current-run stats, each paying shards once and persisting in save.achievements.
- **Consequences**: Maps now demand different movement, runs can be self-handicapped for better loot, late builds have more active tools, and long-term play has explicit goals. The save schema gains megaKills and achievements; the run seed still governs champion rolls.

### ADR-009: Fifth weapon and expanded boss roster with affixes
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The v0.8 loadout capped at four weapons and the boss cycle repeated three styles; an interrupted v0.9 increment added the railgun and two bosses but shipped an overflowing loadout row, combat logic pasted into the render pass and no distinct boss art.
- **Decision**: Ship the RAILGUN as a fifth loadout weapon (slow, line-piercing, evolves into the Lancer with infinite pierce once rail is maxed and bulletSpeed reaches 3), extend the boss rotation with the Hive (brood spawns and ten-bullet rings) and the Sentinel (a telegraphed charge/fire lance beam that holds still while firing), and give about 35% of bosses a Frenzied, Shielded or Volatile affix reusing the champion damage hooks. Loadout cards resize to fit five on the 960px canvas; boss affixes render as dashed rings and appear in the boss health bar.
- **Consequences**: The snapshot gains boss affix/beamState and enemy speed fields plus a forceBossAffix test seam; the boss cycle now spans five styles before each mega and every boss fight can carry an affix wrinkle. The loadout row uses tighter 158px cards; balance lives in the tuning constants.

### ADR-010: Aegis shield skill, active-skill evolutions, new mob archetypes and the WYRM
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The build had no defensive skill (only raw health), the evolution system covered weapons but not the four active skills, the mob roster lacked artillery, control and area-denial archetypes, and the mega rotation repeated after two megas.
- **Decision**: Add (1) the Aegis Field passive: one regenerating shield charge per level (refill 9-0.8/level seconds, floored at 4s), each charge absorbs a whole hit without breaking the kill streak, shown as pips and a ring; (2) evolutions for blades (Tempest: +2 blades, +50% spin and damage), grenades (Cluster: twin throws, +30% blast), turret (Overwatch: third turret, +30% rate and life) and aura (Solar Crown: +35% radius, 60% faster pulses), gated by the same level-5-plus-partner-3 rule; (3) three mobs: Mortar (keeps range, lobs telegraphed shells through the existing bomb system), Widower (web bolts that slow the player 45% for 1.8s) and Husk (leaves a 4s acid pool that damages the player and also the horde); and (4) the WYRM mega boss (third mega rotation entry, wave 60+) that burrows untargetably, moves fast underground, erupts for area damage and spawns three husks.
- **Consequences**: The Bastion combo (aegis + vitality) speeds recharge 40%; the upgrades codex grows to 19 cards and 7 combos and was re-laid out to fit. Snapshot gains shield, slow and pool fields; no save-schema change. New mobs join the spawn table from 95-125 seconds in.

### ADR-011: Skill slot caps with an armory expansion
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: A run could acquire all 19 skills, so every late run converged on the same full roster and level-up cards stopped being a real decision; the user asked for limits on the number of skills.
- **Decision**: Split skills into two slot groups: offense (weapons, blades, grenade, turret, aura, squad) and defense/passive (speed, vitality, aegis, magnet, damage, bullet speed, lifesteal, dash power, crit). Each group allows 6 distinct skills by default. Level-up offers, supply-cache field upgrades and applyUpgrade all enforce the cap: a full group still allows upgrading owned skills but never offers a new one. The new Loadout Rig armory meta (2 ranks, 150/250 shards) raises both caps by one per rank. Offers are weighted 2:1 toward owned skills so builds deepen. The HUD and level-up cards show slot usage.
- **Consequences**: Runs now have build identity and real pick tradeoffs; level-up offers shrink to owned upgrades once a group fills. The snapshot gains a slots field with used/cap counts and save.meta gains an additive rig key (missing keys read as rank 0). The armory screen was re-laid out for seven cards.

### ADR-012: Boss salvage relics as a third progression axis
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: After ADR-011 capped skill slots, boss kills still only paid loot and banking shards, so the hardest fights gave no build-defining choice and runs of the same loadout stayed identical.
- **Decision**: Each boss death leaves a salvage crate that despawns after 40 seconds; stepping on it shows three relic cards and freezes the run until one is picked. Ten relics exist, each unique per run and outside the skill-slot system, applied through the existing stat hooks: Chrono Coil (+15% fire rate), Void Lens (+10% crit), Overclock Core (+25% bullet speed), Volatile Rounds (+30% blast), Warhead Casing (x1.25 blast, x1.2 bomb damage), Bloodstone (+3% lifesteal), Aegis Core (+1 shield charge, works without the skill), Lodestone (+60 pickup radius), Thornhide (reflects 12+ contact damage) and Greed Engine (+20% shard gain). When all ten are owned, crates pay 30 shards instead.
- **Consequences**: Boss fights now end in a build decision, and relic picks combine with slot-capped skills without breaking the cap. Relics are per-run only (no save-schema change). The snapshot gains relics, relicOffers, salvage and a mods block; grantRelic and spawnSalvage test seams were added. The new relic picker reuses the level-up card pattern.

### ADR-013: Boss Rush as a second game mode
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: Every run used the same wave-survival loop, so the eight boss fights - the most mechanically distinct content - arrived once every five waves and there was no short-session or mastery mode.
- **Decision**: Add a run mode chosen at setup: Survivors (unchanged, the default) or Boss Rush. In Boss Rush the wave spawner is disabled; bosses spawn two seconds after deploy and four seconds after each kill, in a fixed order of Warlord, Overseer, Bombardier, Hive, Sentinel, Colossus, Leviathan, WYRM, with health scaled by a 14% per-slot multiplier and a 40% affix chance. Each kill heals 30% of max health and still drops loot, a beacon and a salvage crate. Clearing the eighth boss calls winRun. Minion and summoned adds still appear; horde spawns do not. The HUD shows BOSS n / 8 instead of the wave counter.
- **Consequences**: The mode reuses every existing boss, affix, loot and relic system, so it adds no new content pipeline. The setup screen gained a MODE row (mutators, deploy and back shrank slightly), setup and snapshot gained a mode field, and the run snapshot gained a rush object. The mode is not persisted in the save file; Survivors remains the default so nothing in the existing flow changes.

### ADR-014: Mode records and achievements for the v0.10-v0.13 systems
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: Boss Rush, salvage relics, the Aegis shield, slot caps and the WYRM were all added without achievements, records or any in-run readout, so the only lifetime goals predated them and the save tracked best time/kills for survivors only.
- **Decision**: Add four additive save fields - rushClears, rushBest (fastest clear in seconds, 0 = never), bestWave and shieldSaves - all clamped with zero defaults so legacy saves load unchanged; recordRun updates them by mode (rush clears/best on victory, bestWave only in survivors). Add six achievements: First Clear (1 rush clear, 60), Speedrunner (rush under 90s, 90), Relic Hoarder (5 relics at once, 50), Wyrm Slayer (1 WYRM kill, 70), Shield Wall (10 Aegis absorbs, 45) and Full Loadout (every slot filled, 55). Achievement evaluation now also runs from applyUpgrade, chooseRelic and the grantRelic seam so live conditions register without waiting for a kill. The HUD loadout panel shows RELICS n/10, the statistics screen adds three record rows, and the run summary names the mode and lists owned relics.
- **Consequences**: Every recent system now has a visible goal and a record, and achievements can no longer be missed because no kill happened after the condition. Snapshot.save grows by four fields. Rush bests are only set by victories, so the Speedrunner achievement requires an actual clear.

### ADR-015: Playable operators with perk hooks
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: Every run began from an identical baseline, so although slots, relics and Boss Rush varied the mid-run, the character never did and there was no starting identity to replay around.
- **Decision**: Add five operators chosen on the loadout screen. Ranger is the unchanged baseline (no modifiers, and the default) so existing balance is untouched. Vanguard gets +30 max health and 10% damage reduction. Marksman gets +15% bullet speed and +8% crit. Engineer gets 60% longer turret life and a 15% wider ember aura. Scavenger gets +20% shard gain and four relic picks instead of three. Perks are read through one isOperator() lookup and plugged into the existing hooks (baseMaxHp, damagePlayer, bulletSpeedMult, critChance, auraRadius, turret life, addUnbanked, openSalvage). The operator is stored on the run, shown in the HUD loadout panel and the run summary, and is per-run only.
- **Consequences**: Runs now start with a build identity. Because the baseline is a no-op, no prior tuning or test changes; the setup screen gained an OPERATOR row and the mutator/deploy/back rows were compacted to fit. The setup snapshot gains an operator field.

### ADR-016: Field Manual as the in-game content reference
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The roster grew to 19 hostiles, 8 bosses and 10 relics, but nothing in-game explained enemy behaviour: the upgrades codex covers only skills, and relic effects were visible only at the moment of picking. New players had no way to learn counters or see what content existed.
- **Decision**: Add a Field Manual reachable from the main menu (the menu now runs three rows of two buttons so HOW TO PLAY and SETTINGS sit side by side). It has three tabs: Hostiles (all 19 types with base HP/speed/touch/XP, a one-line behaviour tip and the lifetime kill count from save.killsByType), Bosses (all 8 with base stats, a fight description and the best wave) and Relics (all 10 with effects, marking ones held in the current run). Tips live in separate ENEMY_TIPS/BOSS_TIPS tables so the balance tables stay untouched.
- **Consequences**: The manual is read-only over existing data, so it cannot drift from balance except in the tip text; the snapshot exposes a manual block with tab and per-table counts, which the tests assert against the real tables. No save-schema change.

### ADR-017: Daily Challenge with date-seeded runs
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: Modes, operators and records made runs varied, but nothing tied runs to a shared moment, so there was no comparable challenge and no date-driven reason to return.
- **Decision**: Add a Daily Challenge entry to the main menu (which now runs a 2-column grid plus a full-width help row). The UTC day number deterministically picks the operator (order index), weapon, map, difficulty, mode (every third day is Boss Rush) and, in survivors, one forced mutator; the seed is derived from the day so every attempt is identical. A daily screen shows the full ruleset, the seed and the best attempt. Daily runs are flagged on the HUD and in the run summary. Best results are stored per day in save.dailyBest (pruned to the newest 30 days, entries clamped on load): a win beats a loss, and wins compare by faster clear while losses compare by kills. Two achievements were added - DAILY DRIVER (finish one) and DAILY ACE (win one). A setDay test seam overrides the day so the ruleset is testable without clock control.
- **Consequences**: Daily runs use a fixed seed and do not advance save.lastSeed, so replays are comparable. The menu and snapshot gained daily fields; save gains one additive map. Because the ruleset is derived from data that already exists, adding an operator or mutator changes future dailies but never breaks stored ones.

### ADR-018: Visual layer pass - cached ground, silhouettes, shape-coded affixes
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: A drawing audit measured 1,857 canvas operations (442 paths, 281 ellipses) per frame with zero enemies, because the ground regenerated every tile every frame; 19 mobs shared one circular silhouette, so priority threats read alike; boss affixes differed only by ring colour; and the WYRM rendered its underground mound at a 10px radius because burrowT is never set for it.
- **Decision**: (1) Quantise ground tiles into eight deterministic variants per map, paint each once into an offscreen canvas at device resolution, and blit them; keep the original per-tile painter as a fallback when createElement is unavailable. (2) Cache the vignette gradient into a canvas. (3) Render at up to 2x devicePixelRatio with the canvas backing store scaled, so text and 1.5-2px strokes stay crisp. (4) Give priority mobs distinct silhouettes while keeping the round body language for trash. (5) Shape-code affixes: frenzied rotating chevrons, shielded plate arcs, volatile sparks. (6) Draw the WYRM mound from e.r with concentric ridge rings instead of burrowT. (7) Make particle drag framerate independent with pow(0.45, dt*6). The test harness now counts canvas operations per frame so these properties are regression-tested.
- **Consequences**: Idle frames fell from 1,857 to 348 ops (-81%) and script cost from 0.82 to 0.19 ms; 150-mob frames fell from 4,584 to 3,075 ops and 3.73 to 1.92 ms script; gradients are no longer created per frame. Ground variety is now eight patterns rather than per-tile noise. Tests cover cached blitting, silhouette distinctness (op signatures), affix glyphs, the WYRM mound and a 7,000-op budget at the mob cap.

### ADR-019: Screenshot-driven layout pass - seamless ground, soft hazards, text guards
- **Date**: 2026-10-31
- **Status**: Accepted
- **Context**: A fresh screenshot set of the menu, setup, armory, statistics, manual, HUD, pause, level-up, relic and boss states found that the v0.18 cached ground painted three different base colours per tile set, so the 140px blits read as a visible patchwork; hazard pools were flat ellipses with hard edges and merged into the terrain; the statistics kills-by-type block was drawn over the last stat row; armory NEED feedback and rank pips collided with their rows; the selected setup map card was darkened more than unselected cards; the alert label straddled the timer panel; and PAUSED drew through the boss bar and a live achievement banner.
- **Decision**: (1) Paint all cached ground variants from one base colour and keep variation in low-alpha patches, cracks and specks, so tile edges disappear. (2) Replace each flat hazard ellipse with a cached 256px soft radial sprite plus a faint same-hue rim; fall back to the old ellipse when offscreen canvases are unavailable. (3) Move the statistics kills-by-type block below the stat grid. (4) Move armory rank pips and NEED feedback into the right side of each row. (5) Keep the selected map card at a lighter overlay than unselected cards. (6) Give the timer panel a footer that contains the alert label and bar, move the boss bar below it, and hide those combat readouts and the achievement banner while paused; the paused title sits at y=128. (7) Add an opt-in fillText/fill/fillRect/drawImage recorder to the test harness and seven layout regression tests. The runtime snapshot, save schema and mechanics are unchanged.
- **Consequences**: Ground seams and hard hazard edges are gone without adding per-frame gradients (the hazard sprite is built once per map), and the HUD/pause/screens no longer overlap. Draw-op budgets still pass; the harness recorder only allocates when a test asks for it, so the rest of the suite keeps its previous speed. Layout regressions are now pinned by coordinates rather than screenshots.

### ADR-020: Visual juice pass - biome ambience, shaped particles, card glyphs
- **Date**: 2026-10-31
- **Status**: Accepted
- **Context**: The v0.19 screenshots and code audit showed flat biome atmosphere, every combat particle drawn as the same circle, a sparse level-up/relic card interior, no dash trail or persistent low-health warning, and stacked floating damage text after mass kills. Particle cosmetics also shared the seeded gameplay RNG stream, so changing their call counts would silently change deterministic run outcomes.
- **Decision**: (1) Add deterministic screen-space biome ambience: desert dust motes, frost snow with a faint shadow, ash embers and jungle fireflies. (2) Add particle kinds (dot, spark, smoke, shard, ring, flash, glow) with additive highlights, rotated shards, expanding rings and short muzzle flashes; upgrade hit, death, explosion, dash and pickup effects to use them. (3) Keep the gameplay RNG stream untouched by preserving the old random-call count for existing emitters and routing new cosmetic bursts through a separate run-seeded fx RNG. (4) Store up to nine dash afterimages and draw them as fading silhouettes. (5) Add a cached red low-health vignette with a pulsing edge border. (6) Draw procedural skill glyphs on level-up cards, the upgrades codex and relic cards, and add a hover pulse/glow to buttons. (7) Spread floaters across five columns and add a text shadow. (8) Extend the snapshot with particles/particleKinds/afterimages/ambience, add a spawnBurst test seam, and cover particle shapes, ambience modes, afterimages and the 420-particle budget with tests.
- **Consequences**: Maps now have distinct atmosphere and combat reads through shape as well as colour, dashes and low health are legible at a glance, and choice cards have visual identity. The particle cap and the 7,000-op budget still hold; the seeded gameplay stream is unchanged because cosmetic randomness is isolated. No save-schema change; the snapshot gains four read-only fields.

### ADR-021: World graphics pass - map decor, prop shading, scorch decals
- **Date**: 2026-10-31
- **Status**: Accepted
- **Context**: After ADR-020 the atmosphere and particles read well, but the ground between props was still mostly empty, trees and rocks were flat blobs, buildings had unlit window holes, explosions vanished without leaving a mark, and the player and bosses had little visual presence against the terrain.
- **Decision**: (1) Add deterministic, non-solid map decor on a 210px hash field: desert grass/bones/pebbles, frost snowgrass/ice/pebbles, ash charred stumps/bones/ember cracks, and jungle ferns/flowers/mushrooms, with a small wind sway. (2) Layer three canopy lobes on trees, shade rocks with a dark base and crack, and give buildings a roof overhang, warm lit windows and a door step. (3) Add a capped (12) nine-second scorch decal pool filled by explosions and drawn under props. (4) Add a warm rim light to the player, a pulsing overdrive ring, and a pulsing ground aura under bosses. (5) Expose a read-only decor query and an explode test seam, add snapshot.decals, and test per-map decor kinds plus decal creation, capping and expiry.
- **Consequences**: Each map now reads as a place rather than a tinted floor, props have depth and inhabited details, and explosions leave a persistent spatial record. Decor is purely visual and never collides; it uses hash placement, so the seeded gameplay stream is unchanged. Scorch decals are capped and fade, keeping the world infinite and the frame budget intact; the suite grows to 123 tests.

### ADR-022: Playtest feedback pass - milestones, score, LAST STAND, mutations
- **Date**: 2026-10-31
- **Status**: Accepted
- **Context**: Playtesters asked for stronger visual and audio reward feedback, a visible score, a high-risk low-health state, hidden unlocks, kill-gated loot, more replayability and slower leveling; the build announced only every tenth streak kill, had no score, no total-kill milestones, no mutations and no map-specific player identity.
- **Decision**: (1) Add total-kill milestones at 10/25/50/100/250/500 (KILLING SPREE, RAMPAGE, WAR MACHINE, UNSTOPPABLE, ONE MAN ARMY, LEGENDARY) with a large callout, colour flash, dedicated sound and score payout. (2) Add a run score from kills, bosses, war chests and streak rewards, persisted as save.bestScore and shown in the HUD, run summary and statistics. (3) Add LAST STAND below 10% health: +50% damage, +15% fire rate, +10% move speed and a pulsing red readout, but no extra invulnerability; it clears above 12%. (4) Add one-shot streak rewards at 15/30/60/120 kills: supply drop, airstrike, attack helicopter and missile barrage, all seeded and capped. (5) Add five per-run mutations selectable in setup and forced by the daily ruleset: Explosive Blood (death blast), Berserker (+45% damage under 35% health), Overclock (+20% fire rate), War Veteran (+10% damage per boss kill). (6) Spawn a kill-gated war chest every third wave from wave 3; touching it reports the remaining kills, and opening it pays shards, repairs, chips, a supply chest and score. (7) Add three secret skill combos (Executioner, Singularity, Gunner) that render as ??? in the codex until discovered and persist in save.secrets. (8) Slow leveling to levelNeed = 32 + 24L + 1.2L^2. (9) Tint the player body by map camouflage palette. (10) Deepen the snapshot with score, mutation, camo, lastStand, milestones, streak rewards, callout, heli/airstrike/missiles and war chest state, plus spawnWarChest/setKills/setStreak test seams.
- **Consequences**: Runs now have escalating feedback and a score chase, low health becomes a deliberate risk/reward state, and setup gains replayable run twists and hidden discovery. Every new visual family is capped and seeded; the save change is additive and clamped on load (secrets default to an empty list, bestScore to 0), so old saves migrate cleanly. The suite grows from 130 to 142 tests, including layout guards for the setup mutation row, the codex combos and the HUD callout.

### ADR-023: Visual QA pass - single camera offset, callout priority, setup spacing, map camo
- **Date**: 2026-10-31
- **Status**: Accepted
- **Context**: A browser capture pass after ADR-022 found interactables, war chests, bunkers and the attack helicopter drawing hundreds of pixels away from their simulation positions, because their draw helpers subtracted G.cam.x/y even though render already translated by the camera; the milestone callout could draw over the banner and action prompts; the new setup mutator rows were cramped against the operator row; and the player only took the map camouflage colour from tier 1, so the requested map identity was invisible for the first levels.
- **Decision**: (1) Remove the extra camera subtraction from helpers drawn inside the world transform: drawInteracts, war chest, both bunker states, and drawHeli; HUD and weather helpers that run after ctx.restore keep their screen-space camera math. (2) Suppress the message banner while a reward callout is active so the two large text layers never stack. (3) Give the setup mutator and mutation headers explicit separation from their cards (operator row 408-432, mutator header 446 with cards 450-470, mutation header 482 with cards 486-506). (4) Apply the map camo fill at every evolution tier while keeping the weapon-colour rim. (5) Teach the canvas stub to track translate/save/restore/setTransform and record sx/sy in addition to local x/y, so layout tests can assert final screen position without changing existing assertions. (6) Add a camera-offset regression test, setup spacing guards, a callout-over-banner test and a camo fill test.
- **Consequences**: World objects and their prompts now render exactly where the simulation places them at any camera position, and the transform-aware recorder makes similar mistakes testable. The suite grows to 146 tests. Rendering only; no mechanic, save or snapshot contract changed.

### ADR-024: Battlefield pass - open arenas, the Arcanist, capped contact damage
- **Date**: 2026-11-01
- **Status**: Accepted
- **Context**: The post-0.23 playtest notes asked for open space to kite in, a ranged wizard-style character and a less punishing early fight. The world placed cover uniformly across the 300px prop grid, so the horde could pin the player against a wall of buildings; all five operators were gun-stat variants; and contact damage grew by 1/200s without a ceiling, reaching 7x on a 20-minute run.
- **Decision**: (1) Add deterministic open arenas on an 1100px hash grid: each cell has a 72% chance of a 300-450px clearing whose centre is jittered inside the cell, plus a guaranteed 430px arena at the origin. Solid props and hazard pools are suppressed inside arenas (with a 36px and 70px pad), while non-solid decor remains. (2) Draw each visible arena as a low-alpha worn ellipse, a dashed accent ring, an inner ellipse and four cardinal ticks using the map accent, so the open ground reads as a combat zone. (3) Add a sixth operator, the Arcanist: violet rounds, +1 pierce on the primary weapon, a violet gun tip and rim, and an arc every fourth kill that draws a jagged violet bolt and deals 12 + 40% of the dead hostile's max health (capped at 160) to the nearest hostile within 190px. Arc kills cannot chain again. (4) Cap contact damage growth at 3.2x and slow it to 1 + t/260. (5) Expose snapshot.arena, per-enemy touch and player bullet pierce, plus an arenaAt test seam; widen the six-operator setup row to 138px cards over 146px spacing. (6) Add tests for arena clearance and rendering, arcane rounds and the fourth-kill arc, and the capped damage curve.
- **Consequences**: Every map now has large, readable kiting pockets without losing cover elsewhere, the Arcanist adds a caster identity without a new skill slot or save field, and late-run contact damage is bounded. Arena placement is hash-based, so the seeded gameplay stream is unchanged; the added decor is the existing non-solid layer. The suite grows from 146 to 149 tests. The only snapshot additions are read-only, and adding the sixth operator changes future daily rotations without invalidating stored daily results.

### ADR-025: Field Notes - a story codex and pause-screen map notes
- **Date**: 2026-11-01
- **Status**: Accepted
- **Context**: The playtest backlog's last open item was expanded story. The build named Dust Basin, Whiteout Ridge, NetWatch and the extraction signal but gave the player no readable narrative surface, and the Field Manual only documented mechanics.
- **Decision**: (1) Add a static LORE table of eight entries: the Dustline setting, one field note per map, and the NetWatch signal. (2) Add a fourth Field Manual tab, NOTES, rendering the entries as a 2x4 card grid with title, tag and wrapped 9px body text; widen the tab layout to four 166px tabs with 8px gaps and make the manual handler accept any `manual-*` id. (3) Show the current map's short note at the bottom of the pause screen. (4) Expose snapshot.manual.lore and add tests for the tab, card count, rendered titles, tab spacing and the pause note. (5) Document the setting in the README and bump the package to 0.25.0.
- **Consequences**: The quarantine premise is readable in the manual and during a run without cutscenes, adding a fourth tab does not disturb the existing reference pages, and all story text is static data that cannot affect seeded gameplay. The suite grows from 149 to 150 tests. No save, snapshot gameplay state or balance value changed.

### ADR-026: GLASS WASTES - a seventh map with a shard hazard
- **Date**: 2026-11-01
- **Status**: Accepted
- **Context**: The roster had six maps and the help screen still listed only four hazards (quicksand, ice, embers, vines), missing tar and gas. Playtest notes asked for more biome variety, and the new field-notes codex made an unlisted biome conspicuous.
- **Decision**: (1) Add GLASS WASTES with a pale vitrified palette, glass decor, its own camouflage, dust ambience, field note and map card. (2) Add the GLASS FALLOUT hazard: 0.72 player speed, 3 burn damage every 0.6s, with a CUT floater; generalize burn floaters so gas and embers keep their own labels/colors. (3) Append the map to MAP_ORDER, which also extends the daily map rotation. (4) Re-layout the setup map row for seven 124px cards over 6px gaps and move the prop swatches to card-relative positions. (5) Refresh the help screen to list all hazards and explain arenas. (6) Add tests for the seven-card row, the shard hazard and its damage, the help text and the ninth field note; bump the package to 0.26.0.
- **Consequences**: Runs and dailies gain a distinct vitrified biome with a forced-movement hazard, and the documentation now matches the actual hazard roster. The new entry shifts future daily map rotations without invalidating stored results. All combat values stay inside the gas/ember band, the suite stays at 150 tests, and no save schema changed.

### ADR-027: Accessibility settings - hostile outlines and reduced flash
- **Date**: 2026-11-01
- **Status**: Accepted
- **Context**: The settings screen only controlled volume, shake and damage numbers. Players who need stronger target separation or are sensitive to full-screen pulses had no option, and every milestone, last-stand, reward and secret-combo event flashed the whole canvas.
- **Decision**: (1) Add `outlines` (default off) and `flashes` (default on) to DEFAULT_SETTINGS with boolean load guards, so existing saves migrate cleanly. (2) Draw a 1.25px pale ring at `e.r + 3` around every visible hostile, or a 2.5px gold ring around bosses, when outlines are on. (3) Route every screen flash through `flashScreen(color, time)`, which does nothing when flashes are off; also suppress the hurt overlay and steady the low-health vignette/border pulses. (4) Compact the settings screen to five 60px rows with BACK at 470 and the footer at 534. (5) Record stroke styles in the test harness and add tests for outline rings, suppressed milestone flashes and persisted toggles. (6) Document the options and bump the package to 0.27.0.
- **Consequences**: Target readability and flash comfort are now player-controlled without affecting simulation or balance, and the settings save schema only gains optional booleans. The suite grows from 150 to 152 tests. No gameplay snapshot field or seeded stream changed; `flashT` is exposed read-only for tests.

### ADR-028: UI decluttering and layout overhaul pass
- **Date**: 2026-11-01
- **Status**: Accepted
- **Context**: A comprehensive visual audit via headless browser screenshot captures revealed widespread UI crowding, unaesthetic density, and critical text collision bugs:
  1. The Loadout screen squeezed 8 vertical rows into 600px, clipping "WHITEOUT RIDGE" under prop swatches and rendering mutator/mutation cards with unreadable 7px text.
  2. The in-game HUD featured heavy opaque corner slabs obstructing combat, ability cooldown trays collided directly with keybind text, and a raw permanent 'RECRUIT' text string hovered over the player sprite.
  3. The pause screen kept bottom ability trays and health bars visible, colliding with the map field note.
  4. The Help screen jammed 22 raw unstyled lines touching the Back button.
  5. The Level Up screen suffered from an unreadable text collision on cards with longer descriptions (e.g. DMR-308) where the description detail collided directly with `EVOLVES · ...` ("EVOLVES ReapBlood Leech"), while banish buttons were unstyled text.
  6. The Daily Challenge screen rendered "NO ATTEMPT YET TODAY" / "TODAY BEST" directly inside the 8th row card ("SEED"), creating an awkward overlapping text collision.
  7. The Settings screen had misaligned volume control buttons floating without container cards.
  8. The Field Manual Notes (Lore) tab used a 2-column layout for 9 notes where the 9th note ("THE SIGNAL") overflowed below the 600px canvas and was sliced in half by the BACK button.
  9. The Game Over / Victory screen lacked background backing, allowing fatal hit damage floaters (e.g., `-999`, `-14`) to bleed directly through floating unpaneled stat text.
  10. Non-boss enemy health bars were raw unbordered flat rectangles.
- **Decision**:
  1. Overhaul Loadout screen: pair Mode and Time Limit onto a single balanced row, position map prop swatches on the bottom right of each map card to eliminate text collision, increase mutator/mutation card heights to 26px with legible fonts, and expand bottom breathing room.
  2. Streamline HUD: replace solid black boxes with glassmorphic panels, integrate the alert bar cleanly into the timer header capsule, give ability trays dedicated vertical separation between keybind text and cooldown progress bars with ready border glow, hide combat trays during pause, and replace floating overhead recruit text with tactical rank chevrons for evolved tiers.
  3. Polish Pause screen: render the map field note in a dedicated tactical lore plaque free of combat HUD overlap.
  4. Redesign Help screen: replace the 22-line list with two balanced categorical panels and key pill badges.
  5. Fix Level Up cards: space vertical contents with card height 302px, introduce a tinted stat progression pill badge, eliminate detail/evolution collisions, provide a sleek hoverable banish mini-badge, and enlarge slot numbers.
  6. Fix Daily screen: re-layout the 8 parameter rows into compact 27px cards and provide a dedicated styled status plaque for the daily result, eliminating all collisions.
  7. Polish Settings screen: wrap each option in a sleek card panel and align volume controls flush with toggle buttons.
  8. Fix Field Manual Lore tab: convert 2x5 overflowing layout to a balanced 3x3 card grid (all 9 notes fit comfortably on screen with 40px clearance above the Back button).
  9. Overhaul Game Over / Victory screen: introduce a central After-Action Report (AAR) Dossier card with 0.86 overlay dimming, 4 metric badges (Kills, Level, Squad, Bosses), gold score display, and structured run footer, eliminating underlying damage number bleeding.
  10. In-Game Map view & graphics: wrap contracts and field telemetry in a unified tactical sidebar console, and give damaged non-boss enemies dark-bordered rounded health bars.
- **Consequences**: Every screen and HUD element across the game is now spacious, readable, and visually cohesive with zero text clipping or overlapping elements. All button IDs and layout test invariants are preserved, 152/152 tests pass, and all Phase 4 AIKit gates pass.

### ADR-029: Menu, Armory, Statistics, and Combat visual elevation pass
- **Date**: 2026-11-01
- **Status**: Accepted
- **Context**: Visual audit with image inspection following ADR-028 identified remaining unaesthetic visual and layout weaknesses:
  1. Main Menu: Left and right button columns were separated by a hollow 140px void while outer margins were narrow, causing a disjointed gap between `DEPLOY` (260px wide) and the 2-column buttons (`W/2 - 134` and `W/2 + 134`), while career stats were raw unpaneled text lines.
  2. Armory Screen: Upgrade cards were 500px wide and off-center (`x = 220`), with rank pips and buy buttons closely crowded (`486..560` and `576..658`), and the shards header was plain text.
  3. Statistics Screen: The `KILLS BY TYPE` section at the bottom floated on raw ground without a container, looking unfinished compared to the 21 stat metrics above it.
  4. Field Manual (Relics tab): Relic cards were plain text descriptions with no visual iconography or emblem art, making them bland compared to the rest of the codex.
  5. Boss HUD Health Bar: In combat, active bosses had a raw rectangular health bar (`fillRect`) with a flat dark box, lacking segmentation, phase accents, and polish.
  6. Pickups: Standard XP gems lacked ambient luminescence, blending into the floor terrain compared to high-tier chips and crates.
- **Decision**:
  1. Main Menu: Unified button rows into an aligned 280px-wide tactical column (spanning `340px..620px`), aligning the outer borders of the two-column buttons with `DEPLOY` and `HOW TO PLAY`, and wrapped career telemetry in a rounded dark tactical plaque.
  2. Armory: Centered card column horizontally (`cardX = 240, cardW = 480`), right-aligned buy button with 12px margin, expanded pip-to-button separation by 27px, styled shards balance into an emerald badge pill (`◆ N SHARDS AVAILABLE`), and preserved all layout invariants (`need.y + 6 <= next.y - 17`).
  3. Statistics: Enclosed `KILLS BY TYPE` in a dedicated tactical console panel (`panel(142, 386, 676, 92, 6)`) with amber border, dual headers, and colored enemy type dots, strictly preserving `kills.y > best.y + 16`.
  4. Field Manual Relics: Centered two columns horizontally (`x = 114 + col * 376`), added procedural `drawRelicGlyph` emblems with halos to each card, added live run inventory status badges (`OWNED · ACTIVE`), and offset text cleanly.
  5. Boss Combat HUD: Upgraded boss health bar to an 8px rounded glassmorphic frame with purple/crimson glow, trough background, top gloss highlight, 4-segment quarter division ticks, and distinct mega vs normal accents.
  6. Pickups: Added soft ambient halos to all regular and tier-2 XP gems (`globalAlpha` 0.12 to 0.22).
- **Consequences**: Screens throughout the entire game flow now have visual balance, cohesive tactical styling, and no awkward gaps or colliding elements. All 152 tests continue to pass with 0 regressions, and all visual changes were verified and inspected through CDP browser captures.

### ADR-030: Menu button label-size unification
- **Date**: 2026-11-02
- **Status**: Accepted
- **Context**: The menu ARMORY button carries a `SHARDS n` sub-label while DAILY does not; `drawButton` used 16px for sub-labelled and 18px for plain h=40 buttons, leaving a 1px-class asymmetry between the two side-by-side cards.
- **Decision**: Unify all h>36 button labels to 17px regardless of `sub`, keeping the existing `y+h/2-7` sub offset and `y+h/2+12` sub line.
- **Consequences**: ARMORY/DAILY read as one row with no box, hit-test or snapshot change; 160/160 tests and 5/5 gates pass; before/after captures in `shots/s1-menu-before.png` vs `shots/s1-menu-after.png` (workspace-level, not committed).

### ADR-031: Surfaced tunneler silhouette and dead-branch removal
- **Date**: 2026-11-02
- **Status**: Accepted
- **Context**: The surfaced tunneler fell through to the generic grunt `else` body (identical op signature `117,133,112,125,62,55,28,118`), so the only burrowing mob read as a grunt above ground; two later `else if` branches (a second `phantom` with tail, a second `hunter` with visor strips) were unreachable because earlier branches already matched those types.
- **Decision**: Give the surfaced tunneler its own branch: flattened `ellipse` hull, drill quad snout, three dorsal plate ticks and a gold core (hitbox `e.r` unchanged, pure draw). Delete the two unreachable duplicate branches. Pin `tunneler` in the `priority mobs` silhouette test's type list.
- **Consequences**: Tunneler signature is now `115,136,112,129,68,55,29,117` (adds `ellipse`, extra `moveTo`/`lineTo`, one fewer `fillRect`) vs grunt; 160/160 tests and 5/5 gates pass. No balance, save or snapshot change. Gameplay captures at 0:02 are intentionally identical (tunnelers enter at 95s+); distinctness is proven by the harness signature run plus the extended suite guard.

### ADR-032: Mutator card blurb overflow fix (DATA-only)
- **Date**: 2026-11-02
- **Status**: Accepted
- **Context**: Fresh setup captures showed three of six mutator card second lines bleeding past the 142px card border: BOUNTY (`Hunters every 45 seconds`, 35 chars), FOG (`Permanent reduced vision`) and VAMPIRIC (`Enemies heal when they hit`). The card renderer prints `LOOT xN · blurb.split(',')[0]` at 7.5px into ~29 first-segment chars of room. Ground-cache seams, hazard sprites, gem halos and the boss-bar gloss were re-verified on the same captures and needed no change.
- **Decision**: Shorten the three first segments in the `MUTATORS` DATA table only: `Hunter every 45s`, `Thick fog always`, `Enemies steal life`. No renderer, balance, seed or snapshot change; the full-blurb path is only this card line.
- **Consequences**: All six cards read inside their borders (before/after `shots/s3-setup-before.png` vs `shots/s3-setup-after.png`); 160/160 tests and 5/5 gates pass. Gameplay `shots/s3-game-mid.png`/`shots/s3-game-late.png` confirm the world layer needs no rework in this slice.

### ADR-033: Animation timing audit (verify-only, no code change)
- **Date**: 2026-11-02
- **Status**: Accepted
- **Context**: S4 covered spawn pop (0.28s scale+fade), hit squash (flash-proportional), walk bob, dash afterimages (life 0.2s, cap 9) and boss telegraph rings (charge/enrage/beam states). Fresh captures: `shots/s4-dash.png` (dash fired, cooldown ticking, achievement banner clear of HUD), `shots/s4-wave.png` (wave-2 fight: spawned mobs, damage bars, muzzle, bullets, pickups, off-screen chevrons), `shots/s4-boss-early.png`/`shots/s4-boss-mid.png` (Boss Rush warlord: segmented gloss bar `WARLORD 630/798`, `BOSS 1/8` readout, off-screen boss arrow, `WARLORD engaged` news).
- **Decision**: No timing change. Every behavior is suite-pinned (`dashing leaves a fading afterimage trail`: trail appears, stays capped, fades to 0) and reads correctly in the stills; the dash trail itself is sub-CDP-latency in a still (0.2s life vs capture latency) so its proof stays headless by design.
- **Consequences**: No `game.js` diff in this slice. 160/160 tests and 5/5 gates pass on the final tree. Flake note: `the setup rows keep clear separation` failed twice in a row mid-slice (`all setup labels render`, one text missing) then passed unmodified on the next three runs; the S2/S3 diffs cannot remove those four strings, so it is recorded as a pre-existing recorder first-frame flake, not a regression — Stage 4 to confirm.

### ADR-034: Loadout row capacity + hot-loop constants (renderer + math, no balance change)
- **Date**: 2026-11-02
- **Status**: Accepted
- **Context**: Stage 2 verification against `drawSetupScreen` (7897-8150) confirmed the loadout breakage is layout math, not assets or cross-screen state (`uiButtons` rebuilt per `render`, setup reads only `setup`/`save` tables), and measured the lag as cost-per-frame over a stable capped set (god-mode harness: min1 ops 3319 @53 enemies wall 11.7s/sim-min -> min2 ops 6875 @150 cap wall 72.7s; lists flat: gems 14->23, particles 0-4): capping more lists cannot help. Stage 1's pickup-accumulation suspect was disproved for active play (magnet keeps up).
- **Decision**: (1) Map row: hazard second line prints the first word only (`QUICKSAND/BLACK/EMBER/CHOKE/TAR/TOXIC/GLASS`), ending the swatch collision; full names stay in help/manual. (2) Mutator cards `h26->h30`, subline `LOOT xN · ...` -> `xN · first-clause` at 8px (name line keeps exact `GLASS CANNON` text the separation test pins; all six sublines now <=26 chars inside 142px). Honors landed ADR-032 short blurbs, no data change. (3) Mutation cards `h26->h30`, subline 7.5->8px, fix hover width 170->172 to match the 172px card. (4) DEPLOY sub guarded with 64-char ellipsis. Button IDs, `sx/sy` recorder semantics and `drawButton/panel/rr` shared helpers untouched. (5) Hot-loop constants only: `updateEnemies` caches player pos + sandstorm flag and uses `sqrt(dx*dx+dy*dy)` over `hypot`; `updateBullets` hoists the ricochet radius per frame and uses inline `dx*dx+dy*dy` + `sqrt` for speed; five `updatePickups` loops use `sqrt` over `hypot`. No new fields, lists, caps or balance values.
- **Consequences**: Setup rows clear at 960x600 (before `shots/s3-setup.png` vs after `shots/s4-setup-default.png`, plus `s4-setup-weapon/operator/map/mutators`, `s4-setup-small`, `s4-setup-touch`, `s4-game-touch`); 160/160 tests and 5/5 `aikit.py check dustline` gates pass; post-fix god-mode sample min2 ops 6838 (vs 6875) wall 61.0s/sim-min (vs 72.7s, machine-noisy). Fixed-canvas scaling remains: at 390px the layout fits without overlap but 8px type scales to ~3px effective; full responsive reflow is out of scope. Touch uses the same `uiButtons` hit-test (`setMouse` scales); `touchMode` stick/buttons render only in play/pause and are unchanged.

### ADR-035: Trophy Hunter and Cache Raider contracts (DATA-only depth)
- **Date**: 2026-11-02
- **Status**: Accepted
- **Context**: The contract engine (`progressContracts`/`pickContracts`/`forceContracts`) is fully DATA-driven, but two tracked play patterns had no contract driving them: champion kills (`stats.champions`, only recorded) and supply-cache openings (`stats.chests`). Alert/hunter curve and EVENTS were reviewed and left untouched — no defect found, and balance tuning without a photographed/scripted defect is out of scope.
- **Decision**: Append two `CONTRACTS` rows, no engine change: `trophy`/`TROPHY HUNTER` (2 champions, 18 shards — champions are rare mid-run feats) and `cache`/`CACHE RAIDER` (2 caches, 14 shards — exploration-gated, 10/run cap). Both stats already flow into `save`/snapshot/statistics, so no migration. Reachable through the existing 3-pick rotation, daily seeds and `forceContracts`.
- **Consequences**: Deterministic proof in `tests/game.test.js` (`trophy and cache contracts complete and pay out`, seed 242: 2 champion tanks via `forceChampion`, 2 chests via `spawnChest`, both `done`, `stats.contracts` +2, unbanked rises by rewards). Test written first (failed on unknown ids), then rows added. 161/161 tests pass. No seeded-stream change for existing picks beyond pool growth (no test pins the random composition).

### ADR-036: Hunter Down and Close Calls contracts; roster growth blocked on grid budgets
- **Date**: 2026-11-02
- **Status**: Accepted
- **Context**: The S6 brief (new boss/map as pure DATA) did not survive measurement. Roster growth is blocked on two fronts. (1) Layout budgets, all measured from draw code at 960px: `BOSS_ORDER`(5)+`MEGA_ORDER`(3)=`RUSH_TARGET` 8, test-pinned — a 9th boss breaks rush; `MAP_ORDER` 7 fixed 124px cards end at 904, an 8th needs 1034; operators 6 end at 918; mutations 5 end at 920; lore manual is a full 3x3 grid (4th row 498+116=614>600). (2) Bespoke per-id code: relic effects are `hasRelic('<id>')` use-sites plus a `drawRelicGlyph` if/else chain; champion/boss affix effects and event effects are switch-on-id. A new boss/map/relic/affix/event/operator/weapon therefore needs a layout-reflow slice and/or engine code — new gates, explicitly not this slice.
- **Decision**: Two more `CONTRACTS` rows on the proven S5 vehicle, no engine change: `hunter`/`HUNTER DOWN` (2 NetWatch hunter kills, 20 shards — alert/bounty-gated endgame play) and `closecall`/`CLOSE CALLS` (12 baited near misses, 12 shards — risk-reward play the surge system already rewards). Contract HUD/pick/daily/offer paths are id-generic (3 picks always), so pool 10->12 changes nothing structural.
- **Consequences**: Deterministic proof (`hunter and close-call contracts complete and pay out`, seed 243: 2 hunters via `spawnEnemy`+`killEnemies`, 12 near misses via `setEnemyHp`/`hitEnemy` per the 6%-hp rule, both `done`, `stats.contracts` +2, unbanked rises). Test written first (failed on unknown ids), then rows added. 162/162 tests pass.

### ADR-037: Promote five tracked shots to keepers after a live-build verification
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Twenty-eight captures sat in `shots/` with `media.json screenshots: []` and no README block; the menu, setup, combat and boss views were all present but unwired.
- **Decision**: Copy five byte-identical keepers to `assets/screenshots/` (menu, Railgun loadout, AK-47 setup, wave-1 combat, Warlord boss), verify currency with a fresh `npm start` menu capture at HEAD `39036c1` (identical layout), and register all five in `.aikit/media.json` and the README `aegean:screenshots` block. The remaining `shots/` files stay as regeneration evidence per the README tree.
- **Consequences**: README proves menu, loadouts, combat and boss. Reproduce with: `npm start`, open `http://127.0.0.1:5173/`, screenshot.

### ADR-038: Wave 0/10/20/30 audit pins the wave-30 rotation repeat
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Waves 5/10/15 were pinned by `every fifth wave` and waves 20/40 by the mega test, but wave 30 (slot 6, `BOSS_ORDER[0]` warlord repeat, `20+30*4=140`-kill war chest, only reachable on Endless past 1160s) had no regression pin despite closing the first-30-waves scope.
- **Decision**: Verify-only audit of waves 0/10/20/30 via the seeded harness (t=0 wave 1 no boss, t=360 wave 10 overseer, t=760 wave 20 colossus mega, t=1160 wave 30 warlord, all deterministic across duplicate seeds) plus one test-only pin: `wave 30 brings the warlord again with a 140-kill war chest` (seed 99). No engine, balance, seed or snapshot change.
- **Consequences**: Wave-30 rotation and chest need are now suite-pinned; the wrong-boss mutation (`overseer`) fails as expected. 163/163 tests pass.

### ADR-039: Touch UI clicks, HUD tags truncation, setup spacing, small-screen CSS
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Fresh captures showed touch taps dying on the menu (`touchstart` never called `clickAt`), the HUD mutator-tags line overflowing its 250px panel at 56 chars with two mutators plus a mutation, MODE/TIME-LIMIT sharing one crowded row band, and the 390px hint bar rendering as one clipped line. Seeded probes showed the first level-up landing at ~77s/73 kills stationary (ADR-022 curve kept deliberately).
- **Decision**: Route `touchstart` through `clickAt` on every non-play screen (in-play stick/dash/bomb/OD untouched); truncate HUD tags to 44 chars with ellipsis; shift TIME LIMIT group 8px right; add a 600px media query plus `touch-action: manipulation` in `index.html`. No curve, damage, spawn or snapshot change; first-level timing pinned by measurement (`early progression banks the first level-up inside 80 seconds`, seed 1337).
- **Consequences**: Touch now reaches setup and live combat (captures `s4-setup-touch`/`s4-game-touch` prove it); tags fit the panel (`s5-tags-game`); six new tests, 166/166 passing (incl. `touch taps activate menu buttons`, `HUD mutator tags stay inside the kills panel`). The 390px setup grid itself stays dense — addressed next by ADR-040.

### ADR-040: Tabbed loadout — Arsenal / Field / Rules pages
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: The user called the single-screen loadout too crowded: 8 rows (weapons, 7 maps, operators, modes, time limits, difficulties, mutators, mutations) plus DEPLOY/BACK shared 600px, leaving card text at 8-9px and headers 4px apart.
- **Decision**: Three tabs under the LOADOUT title with live pick summaries (`1 · ARSENAL` weapon+operator, `2 · FIELD` map+mode, `3 · RULES` mutator count+mutation), roomier cards per page (weapons h72/15px, operators 2x3 grid h60, maps h72, modes h48, difficulties h64, mutators 3x2 grid h60 with full blurbs, mutations h56), PREV/NEXT plus page dots, DEPLOY/BACK persistent footer. `clickAt` ignores off-page buttons; the headless `clickButton` seam bypasses pages so all gameplay tests run unchanged; `snapshot.setupTab` records the page. No setup, save, balance or snapshot shape change.
- **Consequences**: Captures `s6-page-arsenal`, `s6-page-field-picked`, `s6-page-rules` plus regenerated `s4-*` prove every page; three new paging tests (`opens on the arsenal tab and pages`, `hidden pages do not answer mouse clicks`, `tabs summarize the current picks`) and one tab-nav fix to the map-brightness test. 169/169 passing. `shot_s4_loadout.py` updated to the tabbed coords (incl. DEPLOY at y490). Note: `python aikit.py check dustline` produced zero output across three attempts (incl. one on the clean pre-change tree), so that gate could not be observed in this environment; the canonical `node --test tests` gate is green.

### ADR-041: Spatial grid for separation and bullets plus tile caches end the late-horde lag
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: With the horde at the 150 cap the game lagged. Section timing in the seeded harness showed `updateEnemies` burning 26ms/frame clustered and 79ms/frame spread in logic alone (before any canvas paint). Two compounding causes: (1) `separateEnemies` was O(n^2) with `Math.hypot` per pair; (2) every enemy paid 2x `resolveSolid` + `hazardAt` per frame, each fanning out into uncached `propTile`/`roomTile`/`arenaAtPoint`/`roomWalls` builds (hundreds of `hash2` calls and fresh objects per enemy per frame), and `markExplored` ran `Object.keys` over the whole explored set every frame.
- **Decision**: One 80px uniform grid per frame shared by separation (cell-pair walk with each unordered pair visited once, same push math) and bullet collision (segment-bbox cell query, exact `segHitsCircle` kept); per-run memo caches for `propTile`/`roomTile`/`arenaAtPoint` (4096-entry cap)/`roomWalls` cleared in `startRun`; explored-set size tracked with a counter instead of `Object.keys`. No spawn, damage, movement, collision or snapshot change.
- **Consequences**: Seeded stress (150 grunts, 120 steps) falls from 3254-4116ms to ~1080ms clustered and from 19058ms to 785ms spread; new pin `a 150-mob pile-up steps inside the logic budget` (budget 2000ms, fails on the old code at 3254ms+). Full suite 170/170 passing with total wall time down from ~173-247s to ~59s. `clusterPoint` stays O(n^2) — it runs only on grenade volleys and bomb throws, out of the per-frame path.

### ADR-042: Swarm-verified defect fixes — display floor, crit cap, barrel chain, explode seam, ghost resume
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Eight parallel analysis swarms (K1-K8, one exclusive module each, game.js tiled 1-1900/1901-3453/3454-5070/5071-7414/7415-9842/9843-EOF plus shell and tests) returned ~100 candidate findings. Main-session triage reproduced a sample before touching code; unverified/opinion-only items were dropped to the filed list, not implemented. Five fixes survived failing-first reproduction: (1) rifle L10 card printed `CD 0.00s` while `rifleStats` already floors gameplay at 0.16s; (2) `critChance` summed to 1.03+ (measured 1.03 with crit10+surge+voidlens+marksman) with no cap; (3) barrels exploded with `dmg 0`, which `explodeAt` now early-returns on, so the 88-radius visual never damaged anyone; (4) the `__DUSTLINE_TEST__` helper `explode(x,y,r)` hardcoded `dmg 0`, firing blanks; (5) `setGhost(i,false)` wrote `ghostT 99`, freezing the phantom visible for 99s instead of resuming its 1.6s cycle.
- **Decision**: Minimal diffs only, each with a failing-first test: (1) clamp the rifle display to `Math.max(0.16, ...)` and expose `skillStatLine` on the test seam; (2) wrap `critChance` in `Math.min(1, ...)`; (3) barrels explode for `100 * damageMult()`; (4) `explode(x,y,r,dmg?)` defaults to 150 and honors an explicit fourth arg (old 3-arg calls keep working, scorch-cap test unaffected — it kills enemies first and runs invulnerable); (5) `setGhost(false)` restores `ghostT 1.6`. Test-only: replace the tautological `s.enemies.length >= 0` salvage assertion with `s.boss === null`. Filed but deferred with reasons: rollCrit double `critChance()` evaluation (perf-only, unobservable via seam), frame negative/NaN `dt` guard (needs harness exposure of `frame`), over-screen record star using time for a score headline (needs over-screen run matrix), streakMult/lifesteal guards (unreachable via helpers — `setStreak` clamps, `hitEnemy` coerces to >=1), serve.js `/.well-known` 404 and PORT/HOST gaps (K7 infra, separate slice).
- **Consequences**: Six new/strengthened tests (`rifle max-level display`, `crit chance stays capped`, `explosive barrels chain damage`, `explode helper deals damage`, `setGhost(false) resumes`, strengthened salvage `s.boss === null`); 188/188 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. No balance, save-schema, seed, or snapshot-shape change; snapshot gains one additive test-only accessor (`skillStatLine`).

### ADR-043: Deferred swarm items closed — frame clock, score star, single crit eval, numeric guards, serve port/host
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: ADR-042 filed five items as deferred for lack of a reproduction path or test vehicle. Direct user instruction to implement reopened them, and a second triage pass found a vehicle for each: (1) `frame(t)` accepted negative/NaN `dt`, poisoning `uiT`/`G.time` — reachable via `steps(1, NaN)`; (2) the over-screen `★ NEW PERSONAL BEST ★` on the SCORE headline keyed on best *time*; (3) `rollCrit` evaluated `critChance()` twice per bullet; (4) `streakMult`/`lifestealHeal` lacked input guards; (5) `serve.js` `start()` threw `ERR_SOCKET_BAD_PORT` on invalid PORT with a misleading message and had no HOST override.
- **Decision**: (1) `frame` repairs non-finite `t` to `last + 16` and clamps `dt` to `[0, 0.033]`; failing-first test (`steps(1, NaN)` → time NaN pre-fix, finite post-fix; negative-ms step never rewinds). (2) Star condition becomes score-based: `G.score > 0 && round(G.score) >= (save.bestScore || 0)` (save already includes the current run, so this marks the tied-or-better best); two-run test on one store (scoreless 300s run gets no star, short high-score run gets it — both inverted pre-fix). (3) `rollCrit` evaluates once into `const chance` (semantics identical — pure within the tick; deterministic max-crit live-fire test pins equivalence, passes pre and post by design). (4) `streakMult` clamps `(G.streak || 0)` at `>= 0`; `lifestealHeal` returns 0 for `!(dmg > 0)` (both cover states unreachable via current helpers — `setStreak` clamps, `hitEnemy` coerces to `>= 1` — so the test pins observable behavior instead). (5) Pure `resolvePort`/`resolveHost` (range-checked, loopback default) wired into `start(port, host)` plus `HOST` env and a bind-aware log line; unit-tested without binding ports; ANDROID.md documents PORT/HOST and keeps the `/.well-known` block with the rationale (no fake `assetlinks.json` shipped; verify against the host).
- **Consequences**: Five new tests (`frame clamps`, `over-screen star`, `single chance evaluation`, `streak and lifesteal guards`, `port and host resolve safely`); 193/193 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. No balance, save-schema, seed, or snapshot-shape change.

### ADR-044: K8 coverage gaps closed — helpers, snapshot surface, server codes
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: The K8 test-suite audit left a helper × test matrix with zero-coverage rows (`bankNow`, `setMutators`, `roomAt`, `triggerNuke` direct path, all five chip kinds, `sandstorm`/`blackout` events), never-asserted snapshot leaves (market, streak/bestStreak, news, event, hunterCd, floaters, grenades, dash, ambience, dailyDay, diffMods, save career fields, best), and server gaps (400 status never asserted, 403 branch unreached). The goal requires every gap filed or closed; this slice closes them.
- **Decision**: Seven `game.test.js` pins on existing behavior (no game-code change): floored `bankNow` with fraction surviving; `setMutators` unknown-id filtering plus 2-cap plus non-array refusal; `roomAt` agreeing with `rooms()` on the same center; `triggerNuke` false-without/true-with bunker; `sandstorm`/`blackout` setting `snapshot().event.id` with unknown ids refusing; all five chip kinds paying out; one snapshot-surface test pinning the never-read leaves. Two `server.test.js` pins: exact HEAD statuses (`/nope.js` 404, `/.git/config` 404, `/%E0%A4%A` 400) and traversal mapping to 404. Corrections to the K8 report found while verifying: `setEventCd` does not gate direct `triggerEvent` calls (no cd check in the seam path — the proposed suppress-test would have failed, so it was not written); the outside-ROOT 403 branch is unreachable over plain HTTP because any `..` trips the hidden-segment guard first (403 needs a real symlink escape — noted, not tested); single-encoded `%2e` is normalized to `/game.js` by the client itself (removed from the traversal list after measuring a 200).
- **Consequences**: Nine new/strengthened tests; 201/201 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. No game-code, balance, save-schema, seed, or snapshot-shape change — test-only slice. Remaining filed gaps: `g.move`/`g.up` harness paths (no observable snapshot surface — weak-test territory) and the symlink-escape 403 (needs a real symlink, skipped deliberately).

### ADR-045: Real symlink escape closed — realpath containment gate in serve.js
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Closing the last two ADR-044 filed gaps turned one of them into a live defect: a runtime probe (temp dir outside ROOT + junction/symlink inside ROOT, self-cleaning) showed the symlink escape serves 200, not 403 — `path.resolve` is lexical and never sees through symlinks, so the containment check passed and `fs.readFile` followed the link. The `g.click(x,y)` half of the K8 mouse-dispatch claim was also fabricated on verification: no such harness method exists (`move`/`down`/`up`/`key` only) — dropped, per the unverified-findings rule.
- **Decision**: `serve.js` resolves every candidate path with `fs.realpath` (against a startup `realpathSync(ROOT)`) before the containment check and serves the resolved path; missing targets still 404, escapes now 403. Minimal diff (one gate block + one constant), no MIME/cache/HEAD behavior change. Tests: `symlink escape maps to 403` (fails pre-fix with a measured 200, passes post-fix; skips cleanly where symlinks are unavailable, pre-cleans stale links, removes its probe in `t.after`) and a mouse/key dispatch smoke test that also pins `escape` pausing from play.
- **Consequences**: 203/203 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. No game-code, balance, save, or snapshot change; one fixed server behavior (outside-ROOT symlink content now forbidden instead of served). The K8 matrix is now fully closed except deliberately-skipped items already recorded.

### ADR-046: P0 wall symmetry + bomb range clamp (playtest fixes 1-2)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest (verbatim Turkish) reported room walls as one-way (`içeriden dışarıdakileri öldüremiyorum ama onlar ateş ederken mermi geçiyor`) and bombs flying absurdly far after repositioning (`uzaklaşıp… E'ye bastığımda anasının amına atıyor`, asks 100-radius densest rule). Code verified both: `updateBullets` enemy branch never called `bulletBlocked` while the player branch did; `throwBomb` used global `clusterPoint(140)` with no player-range limit.
- **Decision**: (1) Enemy bullets now pass the same `bulletBlocked` segment-vs-`building`/`room-wall` check as player bullets before the hit test, with the same wall-puff. (2) `throwBomb` scores only enemies within 550px of the player (neighbor radius stays 140, fallback stays 220px forward); `clusterPoint` untouched so grenade auto-targeting is unchanged. Test-only `spawnBulletAt` seam added behind `__DUSTLINE_TEST__`. Two regression tests: wall symmetry (blocked cross-wall enemy bullet leaves hp unchanged + open control hits) and bomb range (teleport away from a far 15-cluster, 3-grunt near cluster dies).
- **Consequences**: 205/205 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. No save, balance-number, seed, or snapshot-shape change. Remaining P0: effect budget, min-10 entity cost, early L2-4, phantom-airstrike repro, map-bug photo (blocked, needs attachment).

### ADR-047: P0 effect budget + pickup caps (playtest perf 3-4)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest reported effects lagging even the dev PC (`efektler özellikle bomba pc yi bile kastırıyor`) and minute-10+ slowdown killing phones (`dakika 10dan sonra pc bile zorlanıyor`). `explodeAt` emitted 40 particles per call (1 ring + 2 glow + 26 spark + 11 smoke) with the 420 cap as the only bound; pickup lists relied solely on the 2200px distance cull with no count bound, so worst-case `updatePickups` loops were unbounded.
- **Decision**: (1) `explodeAt` now emits 22 particles (1 ring + 1 glow + 14 spark + 6 smoke, -45%), muzzle spark 3→2; damage radius, caps (420 particles, 7000 ops) and the gameplay/fx RNG split unchanged. (2) Hard count caps after the distance cull: gems 400, chips 120, medkits 40, chests 20 — far above measured normal play (god-mode 14-23 gems), binding only pathological accumulation. Test-only `spawnGems` seam behind `__DUSTLINE_TEST__`. Two regression tests: one explosion ≤24 particles with the cap holding; 500 spawned gems capped at 400 after steps.
- **Consequences**: 207/207 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Visual-only change (same radii/colors/timing, fewer sprites); no save, balance, seed, or snapshot-shape change. Remaining P0: early L2-4, phantom-airstrike repro, map-bug photo (blocked).

### ADR-048: P0 early curve ease + phantom-airstrike verdict (playtest 5-6)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest ground out on levels 2-4 (`level 2 3 4 olana kadar anam ağlıyo`). `levelNeed` was 32+24L+1.2L² → L1 57, L2 85, L3 115, L4 147 (404 cumulative to L4, ~4-5 min at starter DPS). Separately the report saw a random unprompted opening airstrike that never repeated in 20 minutes.
- **Decision**: (1) Ease the curve to 24+20L+1.2L² → L1 45, L2 69, L3 97, L4 123 (334 cumulative, -17%); late curve barely moves (L10 344 vs 392). The 57-xp pin becomes a 45-xp pin; the M1 80-second first-level test still passes. (2) No-code verdict on the phantom: `startRun` resets kills/streak/rewardIdx/airstrike and the sole trigger is the streak-30 one-shot (`checkStreakRewards`), so no timer path exists — the sighting matches the FINISHER 25-kill shockwave plus the one-shot streak-30 airstrike landing back-to-back early, then never repeating by design. Pinned with a regression test (fresh run clean, 29 silent, 30 fires supply+airstrike exactly once); the radio/plane pickup redesign stays queued in the P2 airstrike item.
- **Consequences**: 209/209 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One balance-number change (XP curve) with before/after numbers above; no save, seed, or snapshot-shape change. Remaining P0: map-bug photo (blocked, needs attachment). P0 code work is done; next is P1 tuning in order.

### ADR-049: P1 lifesteal tune, squad legion, boss no-stack gate (playtest P1 1-4)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest measured three balance breaks: lifesteal idling inside mobs (`haritanın ortasında duruyorum… ölmüyorum`), soldiers stuck at 5 with no evolution (`dakika 20… vasıfsız`), bosses stacking before kills (`bi bossu öldüremeden diğeri spawn oluyor`). Numbers confirmed all three: leech hit 100%+ (L10 25% x2 Vampire x2 Reaper +3% Bloodstone, floored at 1/hit, and the Bloodstone relic did nothing alone because the trigger gated on the skill); FORMATION had exactly 5 slots so ranks 6-10 overlapped invisibly with no EVOLUTIONS entry; the wave spawner never checked for a living boss.
- **Decision**: (1) Leech 2.5%→1.5%/level (L5 13→8, L10 25→15, full stack 103%→63% per 100 dealt) and the trigger now also fires on Bloodstone alone (relic-alone leeches 3/100). (2) FORMATION gains an outer 1.6x ring (10 distinct slots, ranks 6-10 visible) and squad evolves into LEGION at 10 + vitality 3 (same gate as every skill, table-driven through `checkEvolutions`): +60% damage, 0.7x interval. Offers at 5 soldiers stay — they are now visibly the road to 10 + LEGION, which is exactly the player's own "10.kez evrim" proposal. (3) Boss waves skip the spawn while any boss lives; the wave-5/10/15 rotation test (which kills between waves) still passes.
- **Consequences**: 214/214 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One balance curve (leech rate), one table row (LEGION), one gate line (boss). No save, seed, or snapshot-shape change. Remaining P1: evolution choice, class-coherent offers, teammate timing/class, bomb progression, boss focus.

### ADR-050: P1 evolution choice, coherent offers, pity, twin bombs, focus (playtest P1 5-9)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest agency complaints: evolutions fire without asking (`ben istediğim gibi evrimleştirmeliyim`, wants 3 options), railgunners get smg/shotgun offers (`sınıf seçmenin manası kalmıyor`), first teammate at 15:00, manual bombs never growing (`sayısı değişmiyor`), and bosses unfocusable in the horde flood (`bossa odaklanamıyorum`).
- **Decision**: (1) Evolutions are now READY + pick: `checkEvolutions` marks `G.evoReady` with a banner instead of auto-applying; ready evolutions lead the next level-up as gold EVOLVE cards (3 ready = 3 evolve cards, the literal ask); picking defers or evolves; banish refuses evo cards without spending. New `drawEvoCard`, `applyEvolution`, `chooseUpgrade` seam. (2) Off-archetype NEW weapon offers (spread vs precision) weigh 0.5 instead of 1; owned lines stay at 2. Measured over 20 seeded first level-ups with rail: 6/20 -> 3/20 off-class offers. (3) Squad pity: with zero soldiers at level 3+, `squad` takes the third card (offer, never grant; evolutions keep priority). (4) CLUSTER doubles manual `throwBomb` (twin bombs, +0.15s stagger) — the bomb now grows in count, matching the auto-grenade twin. (5) `hordePressure()` 0.55 while any boss lives: spawner interval /0.55 (x1.8 slower) and batch -1 (min 1), exposed as read-only `snapshot().hordePressure`; boss no-stack gate reuses `bossActive()`. Squad weapon-class choice stays queued in the P2 unified select (no squad weapon variants exist yet).
- **Consequences**: 222/222 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Flow change (evolution by choice, 4 old auto-evolve tests re-pinned to pick cards); one weight, one pity line, one twin loop, one pressure scalar; one read-only snapshot field. No save, seed, or damage-number change. P1 code done;
 next is P2 in priority order.

### ADR-051: P2 kill ranks Private to General (playtest P2-1)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest asked for military ranks by kill count with an unlock per rank (`Private dan başlar General a kadar`, `her rütbede yeni bir özellik açılır`), like the reference game's progression pull.
- **Decision**: Per-run 8-rank track on total kills — PVT 0, CPL 25, SGT 75, LT 150, CPT 300, MAJ 500, COL 750, GEN 1000 — reusing the milestone pattern (`RANKS` table, `checkRank`/`grantRankReward`, `rankIdx` in run state, no save change). Unlocks reuse existing levers only: +1 reroll (CPL), supply medkits (SGT), +50 shards (LT), +1 reroll/+1 banish (CPT), +100 shards (MAJ), +2 rerolls (COL), +200 shards (GEN), each plus 100x index score. HUD shows `KILLS · <short>`; promotion callout `PROMOTED · <RANK>` plus news. Precedence rule: milestones win callout ties on the same kill jump (rank keeps news/score/rewards); the pure promotion callout fires on exact-threshold kills.
- **Consequences**: 225/225 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One table, one checker, one read-only snapshot field, one HUD label. No save, seed, or damage-number change.
Next P2: unified class+weapon select with akimbo.

### ADR-052: P2 akimbo dual Berettas on the unified arsenal tab (playtest P2-2)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted classes and weapons under one roof instead of two categories, plus an akimbo class with dual Berettas. The arsenal tab already shows WEAPON and OPERATOR rows together, so the missing half was the akimbo content itself.
- **Decision**: New primary weapon AKIMBO (setup id `beretta`) bound to a new full `akimbo` skill line: L1 5x2 dmg at 0.29s (35 DPS, rifle/smg tier), L10 19.4x2 at 0.16s, range 480, spread archetype. Evolution DUELIST at 10 + crit (table-driven through the choice flow): 4-round burst, +30% damage. Extension points all generic: `akimboStats`, `weaponStats` dispatch, fire loop, cds, stats, `RANKS`-style `EVOLUTIONS` row, archetype, stat line, details, crossed-pistols glyph. Weapon cards shrink 170->140px step (6 fit in 916px). Measured: L1 35 DPS vs rifle 28 / smg 34; L10 243 vs smg 368.
- **Consequences**: 228/228 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One skill, one weapon, one evolution; layout-only setup change; no save, seed, or damage-number change to existing lines. Next P2: round minimap bottom-right.

### ADR-053: P2 round minimap bottom-right (playtest P2-3)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted the map as a small round bottom-right widget instead of the M pause menu. Fullscreen `drawMapView` stays for detail; the minimap is an ambient viewport.
- **Decision**: `drawMinimap` at (876, 516, r64) on the 960x600 canvas, drawn at the end of `drawHUD` (play + paused): dark clipped circle, explored cells in a bounded cell window (range 8, no full-map iteration), props/rooms via existing `propsNear`/`roomsNear`, nearby enemies as red dots (cap 80, boss = orange 4px), gold player arrow by facing. Player-centered ±900 world units, scale r/900. Geometry pinned in `snapshot().minimap`; fullscreen mapview untouched (existing M tests still green).
- **Consequences**: 229/229 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One draw function + HUD hook + read-only snapshot field; no save, balance, or seed change. Evidence: `shots/s5-minimap-before.png` (empty corner, pre-change build, cache-busted reload) vs `shots/s5-minimap-after.png` (~20s live run, circle + dots + arrow). Next P2: difficulty income brutal +10% / nightmare +15%.

### ADR-054: P2 difficulty income brutal +10% / nightmare +15% (playtest P2-4)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest priced harder modes at +10% (brutal) / +15% (nightmare) extra income; the table paid +35% / +80% shard multipliers on top of already-heavier spawn/HP/damage scaling.
- **Decision**: `DIFFICULTIES` shard 1.35→1.10 (brutal) and 1.8→1.15 (nightmare); blurbs now state the premium explicitly. Spawn/HP/damage untouched. Measured per-100-base income: brutal 135→110 (-18.5%), nightmare 180→115 (-36%).
- **Consequences**: 230/230 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Two numbers + two blurbs; existing brutal-tougher/pays-more tests still pass. Next P2: 7 maps with 3 open + 4 unlockable with income bonuses.

### ADR-055: P2 map unlocks with income bonuses (playtest P2-5)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted 7 maps with 3 open, the rest bought with earned money and each granting extra income (+5%/+10%).
- **Decision**: Desert/frost/ash open; jungle 500/+5%, crater 1500/+10%, toxic 3000/+10%, glass 5000/+15% (shard income via `mapIncome` in `addUnbanked`). Clicking a locked card buys it from `save.shards` when affordable (persisted), selects it, and announces; otherwise denied with the price. `startRun` falls back to desert for locked maps except dailies (daily rotation spans all 7 by design). Setup cards show `LOCK {price} +{pct}%` or the owned `+{pct}% SHARDS` badge with a dimmer overlay while locked. Old saves union the 3 open maps; `snapshot().save.unlocked` exposed read-only; test-only `unlockMap` seam for content tests.
- **Consequences**: 233/233 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Four prices, one multiplier hook, one guard, one badge; 4 map-content tests re-pinned to owned maps, camo test moved toxic->ash. Evidence: `shots/s4-setup-map.png` (before, all open) vs `shots/s5-maps-after.png` (LOCK badges + owned bonus). Next P2: reroll dice pickups.

### ADR-056: P2 reroll dice pickups (playtest P2-6)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted wandering dice on the map that grant level-up rerolls/banishes by luck (`haritada zarlar olsun... zar atarak şansına`).
- **Decision**: New `G.dice` pickup list (cap 20, magnet collection like chests): champions always drop one, normal kills 0.4%. Collecting rolls 65% +1 reroll / 35% +1 banish with floater + news (`applyDie`). White die with red pips (spin from `fxRnd` cosmetic stream, seeded) + DICE label. Drop rate measured: champions 1/run-ish, normals ~1 per 250 kills.
- **Consequences**: 236/236 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One list, one loop, one draw block, test-only `spawnDie` seam; `stats.dice` + read-only `snapshot().dice`. Next P2: dash upgrades to 3-5.

### ADR-057: P2 dash charges to 4 plus longer dashes (playtest P2-7)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted the dash count upgraded to 3-5 and longer dash distance. The single 1.5s-cooldown dash was the only mobility lever.
- **Decision**: Shock Boots now banks charges: `dashMax() = 1 + floor(dashPower/3)` (L3:2, L6:3, L9-10:4), one charge per 1.5s refill, burst-spendable. Dash duration `0.18 + 0.008/lvl` (L10: 0.26s, +44% distance at the same boost). HUD shows `SHIFT DASH xN` / refilling `DASH xN s.s`; `snapshot().dash` gains charges/max.
- **Consequences**: 238/238 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One scalar pair, one pool, label + stat-line + details text. Next P2: manual/auto bomb key choice.

### ADR-058: P2 manual/auto bomb mode (playtest P2-8)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted the choice between throwing the E bomb manually and letting it fire automatically. The manual E throw and auto grenades already existed side by side; the manual bomb itself had no auto path.
- **Decision**: `settings.bombMode` manual (default) / auto, toggled on the settings screen with persistence and old-save default. Auto calls the same range-clamped `throwBomb` whenever off cooldown with a hostile inside 550px. HUD panel reads `SHIFT DASH` style: `E BOMB` vs `AUTO BOMB`; `snapshot().bomb.mode` pinned.
- **Consequences**: 240/240 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One setting, one auto block, label + snapshot field. Next P2: airstrike as a radio/plane pickup.

### ADR-059: P2 airstrike as a radio pickup (playtest P2-9)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted the plane called from a found field radio instead of a random-feeling streak trigger (`yerde telsiz... bulunca kullansın, uçak geçsin`). The streak-30 auto strike stays as the progression path; the radio adds the scavenged path.
- **Decision**: New `G.radios` pickup list (cap 10, magnet collection): champions 25%, normal kills 0.3%, pips cosmetic-streamed. Collecting arms one strike (`T` key, footer hint added); `fireRadioStrike` reuses the streak-30 strike body with its own callout/score. HUD bomb panel shows the armed count; `snapshot().radioArmed` + `radios` pinned; test-only `spawnRadio` seam.
- **Consequences**: 243/243 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One list, one key, one refactor-free reuse; `stats.radio` + read-only snapshot fields. Next P2: damage/XP visuals.

### ADR-060: P2 damage ramp + XP gem rework (playtest P2-10)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted damage numbers ramping white→yellow→orange→red as hits grow, and sharper, more vivid XP gem shapes (the old palette read as muddy).
- **Decision**: `dmgColorFor(dealt, maxHp)`: <8% white, <20% yellow, <40% orange, above red, size 11→16; crits keep `!` and floor size 16. Pink/gold two-state retired (hit sparks match). Floaters already carry a dark shadow, so white stays legible on sand. Gems via `gemStyleFor(tier)`: T0 vivid-teal diamond, T1 jackpot gold star, T2 violet hex, stronger tier glows.
- **Consequences**: 245/245 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Two helpers, no balance or seed change (colors only). Evidence: `shots/s5-visuals-before.png` vs `s5-visuals-after.png` (~25s live runs, red -14 + gold star vs gold-only numbers). Next P2: 3-4 minute wave structure.

### ADR-061: P2 surge assaults every 200 seconds (playtest P2-11)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted waves every 3-4 minutes instead of the instant 40s trickle (`3-4 dakikada bir dalga gelsin`). The 40s `wave` counter is load-bearing (boss cadence, wave-20/30/40 tests), so it stays as the tactical clock.
- **Decision**: Strategic SURGE assaults on top: every 200s a ring of 10+2*idx time-appropriate hostiles spawns with banner, callout-free news, and the HUD ticker retargeted from `NEXT WAVE 40s` to `SURGE Ns` (`SURGE DELAYED` while a boss lives; surges queue behind living bosses via the P1 no-stack rule). An 8s opening grace was tried and reverted: M1's 60-kill/80s gate was already marginal at 62 after the XP ease, and grace pushed it under — weakening the test was refused, so the surge structure alone answers the pacing ask.
- **Consequences**: 248/248 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One scheduler, one ring spawner, one ticker, read-only `snapshot().assault`. Next P2: sandstorm/blizzard disasters instead of blackout.

### ADR-062: P2 per-map disasters retire blackout (playtest P2-12)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest called blackout illogical and wanted a fitting disaster per map (desert sandstorm, snow blizzard, and siblings). The event deck rolled one global table including blackout.
- **Decision**: Blackout def, render branch, and banner special-case deleted. Three siblings join sandstorm under one storm family (identical +20% hostile speed aura, own streak palettes): BLIZZARD, ACID DOWNPOUR, DUST CHOKE. `MAP_DISASTER` pairs each map (desert/ash/glass sandstorm, frost blizzard, jungle/toxic downpour, crater dustchoke); the 30-46s scheduler rolls surge/supply/bounty plus the current map's disaster via `eventPool()` (test seam). Pixel proof deferred: blind-kiting capture runs died before rolls; each palette is pinned headlessly through the recorder stroke log instead.
- **Consequences**: 250/250 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One table, one pool helper, three render branches; K8 blackout pin replaced with the four storms. Next P2: cosmetic + VIP shops (no real money).

### ADR-063: P2 cosmetic + VIP shops, no real money (playtest P2-13)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted a small in-game shop for kids plus a VIP shop feeding the money drive, with an explicit no-pay-to-win constraint (cosmetics only).
- **Decision**: New SHOP screen (menu row + dossier shift): SKINS tab with 4 player colors (ranger free, crimson 500, gold 1500, void 3000 shards) — buy/equip/persist via `save.cosmetics`, worn as the player accent (`skinAccent`, default pixels untouched). VIP tab lists 3 packs with USD prices and COMING SOON badges as inert text: clicking is impossible (no buttons pushed), `save.cosmetics.vip` stays `{premium:false,items:[]}`. Shop states the gate on-screen: no billing code in this build; real-money checkout is a separately approved step.
- **Consequences**: 252/252 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One screen, one save block, one accent hook. Evidence: `shots/s5-shop-skins.png` + `s5-shop-vip.png` (live captures). Next P2: leaderboards for score rivalry.

### ADR-064: P2 house rivals make boards worth chasing (playtest P2-14)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Playtest wanted score rivalry (agar.io-style boards, global/TR/friends). Boards existed but showed only the player's own runs — nothing to chase. No backend exists in this pass, so rivalry is seeded locally with online sync explicitly deferred (the board footer already says so).
- **Decision**: `RIVALS` tables (global 8, TR 6, megabonk-style beatable scores 1k-45k) merge above the player's bests on those tabs; friends tab unchanged. Beating a rival first-time pays +25 shards (`save.rivalsBeaten`, persisted, shown on the board). Score needed to clear the ladder (~33k for a 1k-kill run) stays below DUSTKING 45k, so the top stays aspirational.
- **Consequences**: 254/254 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One table, one merge, one grant; snapshot gains `rivalsBeaten`. Evidence: `shots/s5-board-before.png` (empty) vs `s5-board-after.png` (8 rivals) + `s5-board-rivals.png` (with own runs). P2 done except the skipped ops mode; next is Stage 4 check.

### ADR-065: P2 OPS extraction-operation mode (playtest P2-ops)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: The P2 list named an ops mode with no further spec; the setup already had endless/time-limit runs plus boss rush, and extraction beacons already existed without a win path. OPS fills the gap as a timed extraction operation.
- **Decision**: Third `MODES` entry (table-driven setup cards, shrunk to 3x160px to clear the limit row): 10:00 fixed clock overriding the limit row, extraction beacon at 9:30 (`G.opBeacon`), early extract banks + pays +200 and wins immediately, surviving to the horn wins normally. Over screen shows the OPS countdown line.
- **Consequences**: 256/256 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One table row, one flag, one beacon hook, one win branch; two mode-count tests re-pinned to three cards. Evidence: `shots/s5-ops-modes.png` (three mode cards). P2 list fully shipped; next is Stage 4 check.

### ADR-066: Perf follow-up cuts full-combat draw 24% (Stage-4 watch item)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: The 20-min check run showed live-combat frames at ~19.5k canvas ops vs the 7k static-mob pin (2.7x). Op profiling on a fixed 150-enemy + 420-gem + 30-bullet scene: gems alone cost ~4.6k ops (11 each: transform, glow arc, 4-10 segment path, fill, stroke).
- **Decision**: Tier-0 diamonds drop the glow arc and outline (same silhouette as a rotated rect, which replaces the 4-segment path) and every pickup list culls off-screen draws at a 30-40px margin. Measured on the same scene: 11486 -> 8702 ops (-24%). Bullets keep both trail strokes (own-fire readability first).
- **Consequences**: 259/259 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Pinned by a full-combat budget test (<10000 ops) and a cull test (far < near) plus a teal-fill render pin. Evidence: `shots/s5-visuals-after.png` (haloed diamonds) vs `shots/s5-perf-gems.png` (clean diamonds, gold star intact).

### ADR-067: Perf layer 2 trims player tracer glow (watch item)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: After the gem cull, player-bullet double strokes (glow + core, 11 ops each) were the next measured draw cost; enemy tracers stay double-pass so incoming fire keeps its halo.
- **Decision**: Own bullets draw one core stroke widened 1.8 to 2.5; enemy bullets unchanged. Measured: 11.0 to 7.0 ops per player bullet (-36%, ~200 ops at 50 in flight) plus the fill-rate win of dropping the wide `lighter` pass.
- **Consequences**: 260/260 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Pinned by a per-bullet op test (<9). Evidence: `shots/s5-perf-storm.png` doubles as the missing live sandstorm capture (streak lines, banner, ticker) for ADR-062.

### ADR-068: Perf layer 3 finds no cheap enemy cuts; squads field the family color (playtest)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Enemy bodies (~24 ops each at the 150 cap) are the largest remaining draw block, but every part is load-bearing (body, shadow, HP bar already conditional, boss/champion rings rare). Cutting further would visibly degrade the horde, so no enemy-draw change ships. The same pass closed the deferred teammate-class promise from P1-7/P2-2: soldiers fired generic blue regardless of the player's class.
- **Decision**: `soldierBulletColor()` maps the volley tracer to the equipped primary's skill color (akimbo gold, rifle gold, rail violet...), one-line hook in the existing volley spawn plus a skill-line note; default pixels unchanged when no squad exists. Pinned by seam unit tests per weapon plus a live-volley color assertion.
- **Consequences**: 261/261 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One helper, one hook, one line of text, one test seam.

### ADR-069: Field manual documents the shipped systems (player gap)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Fifteen shipped systems (ranks, ops, rivals, surges, storms, shop, dice, radio, minimap, bomb mode, dash charges, akimbo, maps, difficulties, evolutions choice) had no in-game documentation; the manual only knew hostiles, bosses, relics, and lore. New players met mechanics with no explanation.
- **Decision**: Fifth manual tab SYSTEMS with five compact rows (ranks, ops, rivals, surges+storms, shop+pickups), table-driven like the other tabs. Akimbo/choice-evolutions/difficulties are already covered by the skill codex and setup cards, so they stay out of this tab.
- **Consequences**: 261/261 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One table, one branch, tab-count test re-pinned 4→5. Evidence: `shots/s5-manual-systems.png` (live capture, all rows visible).

### ADR-070: Rival-beaten fanfare on the over screen (playtest P2-14)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Beating a house rival paid +25 shards with no on-screen moment; the board showed it later, but the run's climax stayed silent about the rivalry the report asked for.
- **Decision**: Submit records per-run `G.rivalsBeatenRun` names; the after-action report prints `RIVALS BEATEN · ... (+N)` between the rewards line and the footer, pushing combos one row down (panel still fits). No live capture: the line needs a 5k+ run no scripted browser drive can reach, so the recorder fillText pin is the visual proof.
- **Consequences**: 262/262 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One run-scoped list, one report line.

### ADR-071: Career stats track the rivalry (player visibility)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Rivals lived only on the leaderboard and the over screen; the career page predated them, so long-term rivalry progress was invisible between runs.
- **Decision**: One row `RIVALS BEATEN n / 14` on the statistics screen from the already-persisted `save.rivalsBeaten` (no migration, read-only display). 24 rows still fit the 3-column grid.
- **Consequences**: 263/263 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One row. Evidence: `shots/s5-career-rivals.png` (live capture, `2 / 14` on a used profile).

### ADR-072: Touch layout lifts the minimap off the buttons (phone UX)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: The P2-3 minimap landed exactly where the touch DASH/BOMB/OD buttons draw (bottom-right circle over the same pixels) — the player's phone/tablet worry made real. Desktop layout is untouched.
- **Decision**: `minimapGeom()` lifts the circle 116px on touch devices (bottom edge 464 vs button top 470); `snapshot().minimap` reads the same helper instead of its old literal (which had drifted). Pinned both ways: default geometry unchanged, touch geometry clear.
- **Consequences**: 264/264 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One branch + one snapshot fix. Evidence: `shots/s5-touch-minimap.png` (live touch capture, buttons clear of the circle).

### ADR-073: Over-screen fanfare + combos share, tested together
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: The ADR-070 rivals line and the combos line share the same after-action panel rows; the overlap branch (both present) had no coverage, and combos need each skill at 2+.
- **Decision**: No layout change (the shift already fits panel bounds 338 < 346). Added a death-run test that earns both and asserts both lines render.
- **Consequences**: 265/265 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates (re-run below). One test.

### ADR-074: Backend contract names rivals as un-syncable (integration safety)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: ANDROID.md's backend contract predates house rivals; a future implementer could mistake DUSTKING's 45000 for a syncable player run and upload it.
- **Decision**: Contract note — any board row whose code is not 8 hex chars is a local-only rival and must never be submitted or merged. Behavioral pin: typing DUSTKING into friend-add is rejected by the existing hex rule, so rival names cannot enter the code system from either side.
- **Consequences**: 266/266 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Docs + one test, no game-code change.

### ADR-075: Help screen documents the shipped controls (stale-help fix)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: HOW TO PLAY still described the pre-ship game: manual E bombs, instant 40s waves, no minimap, no auto mode. Five shipped controls (auto bomb, evo cards, surges, per-map storms, minimap, ops, ranks) had no entry, and seven long-standing rows were silently cut mid-word by the 46-char col2 cap.
- **Decision**: Two new rows (RANKS, OPS), five refreshed rows (BOMB, LEVEL UP, WAVES, EVENTS, MAP), 34→31px row step for the 12-row fit, and shortened col-2 copy so no line truncates (also repairs the five pre-existing cutoffs).
- **Consequences**: 266/266 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Pinned incl. an explicit no-`..` assertion. Evidence: `shots/s5-help-refresh.png` (live capture, all 24 rows legible).

### ADR-076: Rival payouts get the reward sting (audio gap)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Beating a house rival paid shards and (as of ADR-070) showed a line, but stayed silent while every sibling milestone plays a sting. No new synth: the existing reward arpeggio is the right voice and already plays safely headless.
- **Decision**: One `sfx.reward()` call in the first-beat grant branch. Covered by the existing rival submit-run tests (the path already executes there).
- **Consequences**: 266/266 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One line, no new audio surface.

### ADR-077: Achievements cover rivals, maps and ops (engagement gap)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: The achievement list predated every shipped system, so none of the new progression (rivals, unlocks, ops) fed back into the career chase.
- **Decision**: Three table-driven rows — RIVAL SLAYER (3 beaten), TREASURE HUNTER (4 maps), OPERATOR (1 ops win) — reusing the goal/merge/evaluate pipeline; `save.opsWins` counted in recordRun like rushClears, with default + clamp + a pre-loaded-career test plus a live ops-win unlock.
- **Consequences**: 267/267 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. Three rows, one counter, zero render changes.

### ADR-078: OPS victory names the operation (header gap)
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: OPS wins showed the generic SURVIVORS victory line; boss rush already had its own header, ops did not.
- **Decision**: `OPERATION COMPLETE` header on ops wins (both timeout and early extract share `winRun`). Pinned by recorder text in the existing timeout-win test.
- **Consequences**: 267/267 `node --test tests` green plus 5/5 `python aikit.py check dustline` gates. One ternary branch.
