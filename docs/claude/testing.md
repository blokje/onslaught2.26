# Testing

## Headless (must pass before you report done)

| Script | Covers |
|---|---|
| `node scripts/sim-test.mjs` | Leaks and game over, a scripted 15+ wave game at 8x, laser chain math, modifier numbers, placement, unlocks, all target modes, directional cones, focus fire, holding pattern, freak-out timing, new weapons, save/restore determinism, performance benchmark. |
| `node scripts/combo-test.mjs` | All 20 recipes (right combo, recharge, effects), priority order, `exact` rule, Combo-only as partner, combo counters and `comboLog` (cap, save/restore, `partnerIds`), `comboPreview` (missing partners, waits, `exactBlocked`, Combo-only, no rng), black hole $0 bounty, mines, napalm, shockwave knockback, chain sparks, cluster bomblets, save/restore, performance. |
| `node scripts/balance.mjs [dps|combos|difficulty|unlock|all]` | Informational balance report: DPS per investment ($5K to $300K) of every weapon, damage per recharge-second of all 20 combos, greedy-bot wave reached per difficulty on maps 1, 4, 9, and the wave at which unlock thresholds are reached. Not a pass/fail test. |

Tests drive the real `Game` in Node: `new Game({ mapId, difficulty, mode, seed })`, `build`, `upgrade(id, stat, true)`, `spawnAttacker(wave, hpOverride)`, `advance(steps)`, events. Use a fixed `seed`.

## In the browser

Use the `verify-in-browser` skill. Minimum: the game loads, a game starts, building, a wave, no console errors. For renderer or UI work also check the demo pages.

## Builds

`npm run build` (dist/) and `npm run build:single` (dist-single/index.html, about 640 KB). Both must succeed.

## Not covered by automation

Real touch devices (iPad), audio quality, GPU frame time on weak hardware. Say explicitly when you could not check these.
