# Dustline on Android — export groundwork

Dustline ships as a zero-dependency installable PWA. The Play Store path is
a Trusted Web Activity (TWA) wrapper, which needs no engine port: the same
`game.js` runs inside the activity.

## Already in place

- `manifest.webmanifest`: name, icons, `display: fullscreen`,
  `orientation: landscape`, theme colors.
- Procedural launcher icons in `assets/` (`icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`), generated offline by
  `scripts/make_icons.ps1` — no designer assets, no downloads.
- `sw.js`: versioned offline cache (`dustline-v1`; bump on release).
  Navigations are network-first with cache fallback, art is cache-first.
- `index.html`: manifest link, theme color, mobile-web-app-capable,
  apple-touch-icon, fullscreen layout.
- Touch controls, 960×600 landscape canvas, offline-first localStorage saves.

## Verify locally

1. `npm start` (serves with the correct manifest MIME).
   `PORT=8080 npm start` overrides the port (default 5173, invalid values
   fall back to it); `HOST=0.0.0.0 npm start` exposes the LAN for device
   testing (default loopback only).
2. Chrome DevTools → Application → Manifest: no errors, icons load.
3. DevTools → Lighthouse → PWA category (needs HTTPS or localhost): target
   green installability before wrapping.

## Wrap with Bubblewrap (TWA)

1. `npm i -g @bubblewrap/cli` (build machine only, not a game dependency).
2. `bubblewrap init --manifest https://YOUR-HOST/manifest.webmanifest`.
3. `bubblewrap build` → signed `.aab`. Keystore: keep `android.keystore`
   OUT of the repo; back it up offline.
4. Upload the `.aab` in Play Console, link the domain via
   `assetlinks.json` (Digital Asset Links), complete content rating,
   then staged rollout. The `assetlinks.json` file must be deployed at
   `/.well-known/assetlinks.json` on the production host; the dev server
   intentionally keeps blocking dot-directories locally, so verify the
   link against the host, not `npm start`.

## Leaderboard backend contract (next step)

The in-game LEADERBOARD screen (GLOBAL / FRIENDS / TÜRKIYE) currently runs on
a local-first provider: run history (`save.boardBests`, top 25 by score),
device identity (`save.deviceId`, 8 hex chars, player-facing as SQUAD CODE)
and friend entries (`save.friends`, max 12, `best: null` = awaiting sync).

The online provider must implement:

- `POST /v1/scores` `{ code, entry: { s, k, t, m, win, d }, nonce }` →
  `{ rank }`. Server validates caps (score ≤ 10⁷, time ≥ 0), rate-limits per
  code (e.g. 1/min), and rejects future `d` (daily) values.
- `GET /v1/boards/global?limit=10` → ranked `{ name, code, score, kills, time }`.
- `GET /v1/boards/turkiye?limit=10` → same shape, region-filtered. Region is
  self-declared at first sync and immutable afterwards.
- `GET /v1/friends?codes=a1b2c3d4,...` → `{ code, best }` for pending syncs.
- Identity = squad code only. No accounts, no PII. Friend codes are
  unguessable enough for a game board (8 hex chars); abuse handling is
  per-code throttling plus entry caps.
- Client keeps the exact local provider as offline fallback and marks synced
  rows; conflicts resolve server-wins on score, client-wins on friend list.

## Checklist before store submission

- [ ] Bump `CACHE` in `sw.js` and `version` in `package.json` together.
- [ ] Play Console: app name, short description, feature graphic
      (reuse `assets/social-preview.svg`).
- [ ] Privacy policy URL (state: squad codes only, no accounts, no ads SDK).
- [ ] Target API level per current Play requirements; test on a 720p device
      (canvas scales, HUD text stays ≥ 8px).
