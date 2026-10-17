---
name: release-build
description: Produce and check the distributable builds of OnSlaught2.26 (dist/ and the single-file HTML). Use when asked to build, ship, export or package the game.
---

# Release build

1. `node scripts/sim-test.mjs` and `node scripts/combo-test.mjs` must pass.
2. `npm run build` writes `dist/` (static site, relative paths, can be hosted anywhere).
3. `npm run build:single` writes `dist-single/index.html`: one self-contained file (about 640 KB) that runs by double-clicking.
4. Check the single file: open it directly from disk (file://) in a browser, start a game, confirm no console errors and that saving works (Continue appears after reloading).
5. Build output is git-ignored. Hand over the file path; do not commit `dist*/`.
