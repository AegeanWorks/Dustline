# Dustline

[![Built with AIKit](https://img.shields.io/badge/built%20with-AIKit-6f42c1)](https://github.com/AegeanWorks/AIKit)

Dustline is a fast top-down 2D Counter-Strike style arena shooter demo: wave-based bot combat, recoil-driven gunplay and a Dust-inspired map in plain HTML5 canvas.

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

Eliminate every hostile in the wave; the next wave brings more of them. Survive as long as you can.

| Input | Action |
|---|---|
| `WASD` / arrows | Move |
| Mouse | Aim |
| Left click or `Space` | Fire |
| `1` / `2` / `Q` | AK-47 / USP-S / swap |
| `R` | Reload |
| `Shift` | Sprint |
| `Esc` | Pause |
| `Enter` / click | Redeploy after death |

The AK-47 is automatic with a 30-round magazine; the USP-S is a 12-round semi-auto that hits harder per shot, so tapping is rewarded. Each slot keeps its own ammo, and switching cancels a reload. Wave clears restore health and reserve ammo. Each kill is 100 points and the best score is saved in the browser's local storage. Close-in bots push you, so keep crates between you and them; bullets stop on cover and line of sight drives their fire.

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
├── index.html                <- canvas shell, HUD hint and page styling
├── game.js                   <- the whole game: loop, bots, bullets, HUD, audio
├── scripts/
│   └── serve.js              <- zero-dependency static server for `npm start`
├── tests/
│   ├── harness.js            <- seeded, headless canvas stub that boots game.js in a VM
│   ├── game.test.js          <- node:test suite for combat, waves and controls
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

`tests/harness.js` stubs the canvas context, window events and `requestAnimationFrame`, seeds `Math.random` for reproducible bot behaviour, then boots the real `game.js` inside `node:vm` and drives frames deterministically. The suite covers boot state, hostile spawning and approach, wall collision, kills and score, wave advance and healing, ammo consumption and reload, weapon switching and semi-auto fire, best-score persistence, death and redeploy, pause behaviour, a 900-frame no-overlap invariant for cover, and the static server (MIME types, hidden-path and method rejection).

`game.js` publishes a read-only `window.Dustline.snapshot()` plus `reset()`. The state-changing helpers used by tests (`damage`, `wipeEnemies`) exist only when the harness sets `window.__DUSTLINE_TEST__`.


## 📜 License

Free for personal play under the Aegean Game License 1.1 (AGL-1.1); see [LICENSE](LICENSE). It is DRM-free: Licensor ships no DRM and a distributor may not add it. Streaming, modding and free mods are allowed. Commercial use, paid mods and AI training need the Aegean Commercial License 1.0 (ACL-1.0); see [COMMERCIAL.md](COMMERCIAL.md).
