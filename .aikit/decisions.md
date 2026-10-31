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
