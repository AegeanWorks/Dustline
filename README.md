# Dustline

[![Built with AIKit](https://img.shields.io/badge/built%20with-AIKit-6f42c1)](https://github.com/AegeanWorks/AIKit)

Dustline is a fast top-down 2D Counter-Strike style arena shooter demo: wave-based bot combat, recoil-driven gunplay and a Dust-inspired map in plain HTML5 canvas.

## ⚡ 30-Second Cold-Start Quick Reference

- **Runtime Prerequisites**: <FILL: each runtime this project needs and its minimum version>
- **Canonical Regression Shield Gate**:
  ```bash
  node --test tests
  ```

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
├── .gitignore                <- transient AIKit state excluded
├── LICENSE                   <- Aegean Game License 1.1 (AGL-1.1): DRM-free personal play
├── COMMERCIAL.md             <- Commercial licensing terms
├── ASSETS.md                 <- Asset/data manifest: what the license covers
├── LICENSES/                 <- REUSE license texts
├── REUSE.toml                <- Machine-readable SPDX metadata
├── README.md
└── .aikit/                   <- this project's memory: record, ledger, decisions
```

## 📜 License

Free for personal play under the Aegean Game License 1.1 (AGL-1.1); see [LICENSE](LICENSE). It is DRM-free: Licensor ships no DRM and a distributor may not add it. Streaming, modding and free mods are allowed. Commercial use, paid mods and AI training need the Aegean Commercial License 1.0 (ACL-1.0); see [COMMERCIAL.md](COMMERCIAL.md).
