---
name: add-combo
description: Add or change a combo recipe in OnSlaught2.26 (recipe data, effect implementation, visuals, tests). Use when asked for a new combo or to change combo behaviour.
---

# Add a combo

**Docs first:** Write the combo's rule in `SPEC.md` (section 9, or 6 for originals on explicit request) before any code.

1. **Rule:** describe it in `SPEC.md` section 9 (new) or 6 (original, only on explicit request), with lead colour, partners, recharge and effect.
2. **Recipe:** add it to the lead colour's list in `src/data/combos.js`. Order matters: lists are checked top to bottom, so put recipes needing more turrets first. Use `exact` when a count must match exactly. Mark new ones `isNew: true`.
3. **Effect:** reuse existing `fx` building blocks if possible (`projectile`, `hit`, `blast`, `cluster`, `sparks`, `laser`, `chain`, `napalm`, `blackHole`, `shockwave`). New behaviour goes in `src/game/combos.js` through the hooks (`tryFire`, `update`, `projectileUpdate`, `projectileImpact`) and the helper API at the top of `src/game/Game.js`. Scale damage by `lead.damageMult`. Persist any active state in `serialize()` / `deserialize()`.
4. **Contract:** a new projectile or effect kind gets one line in `ARCHITECTURE.md` section 1.1.
5. **Visuals:** add the projectile or effect drawing in `src/render/entities.js` or `fxlayer.js` (art in `atlas.js`), and show it in `demo.js`.
6. **Tests:** extend `scripts/combo-test.mjs`: the right id fires for the right lead and partners, priority against neighbouring recipes, recharge on lead and partners, the specific effect, save/restore.
7. Run `node scripts/combo-test.mjs`, `node scripts/sim-test.mjs`, then `verify-in-browser`, then `balance-pass` for new content.

**Docs after:** correct `SPEC.md` to the final behaviour and numbers, add new kinds to `ARCHITECTURE.md`, note traps in `docs/claude/gotchas.md`, add a `CHANGELOG.md` entry.
A task is not done until the docs are touched (see `docs/claude/documentation.md`).
