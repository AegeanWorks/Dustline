# Asset Manifest

Assets listed here are offered under the Aegean Game License 1.1 (AGL-1.1) as part of the game.
Assets not listed remain proprietary: they may be used only to play the game and may not be
extracted, redistributed or included in a mod without a grant.

Dustline bundles no image, audio or level files except the PWA launcher icons.
Every visual is drawn with the Canvas 2D API (the icons are generated from
that same mark by `scripts/make_icons.ps1`) and every sound is synthesized at
runtime with WebAudio, so the shipped source is the complete asset set.

| Path or pattern | Type | Rights holder | License | Notes |
|---|---|---|---|---|
| `game.js`, `index.html` | source, procedural art and audio | AegeanWorks | AGL-1.1 | No third-party assets or fonts |
| `assets/icon-*.png` | generated launcher icons | AegeanWorks | AGL-1.1 | Procedural output of `scripts/make_icons.ps1`; regenerate, do not hand-edit |
| `assets/logo.svg`, `assets/social-preview.svg` | brand art | AegeanWorks | AGL-1.1 | Logo and store feature graphic |
| `manifest.webmanifest`, `sw.js`, `scripts/make_icons.ps1` | PWA shell config | AegeanWorks | AGL-1.1 | No third-party code |
