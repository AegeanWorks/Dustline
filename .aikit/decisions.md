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
