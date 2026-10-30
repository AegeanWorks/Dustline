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
