---
name: add-turret
description: Add a new turret kind (weapon, modifier or support) to OnSlaught2.26 end to end - data, simulation, art, UI and tests. Use when asked to add or redesign a turret.
---

# Add a turret

**Docs first:** Write the turret's rules in `SPEC.md` (section 4 or 9, marked [NEW]) before any code.

1. **Design:** write the rule in `SPEC.md` (section 4 or 9), marked [NEW]. Decide its category (`weapon`, `modifier`, `support`), its combo colour, unlock kills and hotkey.
2. **Data:** add the entry to `TURRETS` in `src/data/turrets.js` (cost, `base`, `ladders` as `[cost, value]` pairs, `weapon`, `target`, `blurb`) and append the key to `BUILD_ORDER`. If it needs a new target mode or rule, add it to `src/data/rules.js`.
3. **Simulation:** if it has a new weapon behaviour, add a case in `src/game/weapons.js` (projectiles through `game.spawnProjectile`, instant hits through `game.damageAttacker`, beams through `game.addBeam`). Modifiers need no code: they use the `mod` fields.
4. **Contract:** a new projectile, beam or effect kind gets one line in `ARCHITECTURE.md` section 1.1.
5. **Art:** draw the base and weapon procedurally in `src/render/atlas.js` (original design, readable at 44 units). Add the kind to `src/render/demo.js`.
6. **UI:** add an icon in `src/ui/icons.js`. The rack and panel read `TURRETS`, so they usually need nothing else. Keyboard: check the hotkey in `App.js`. Add a line to the how-to-play text in `dialogs.js`.
7. **Sound:** map its `shot` kind to a sound in `src/ui/audio.js`.
8. **Tests:** add checks to `scripts/sim-test.mjs` (builds, fires, damage as specified, upgrades, save/restore).
9. Run the `verify-in-browser` skill and, for new content, the `balance-pass` skill.

**Docs after:** correct `SPEC.md` to the final numbers, add new state kinds to `ARCHITECTURE.md`, update `README.md` (turret list, hotkey) and the area guides if a module changed, add a `CHANGELOG.md` entry.
A task is not done until the docs are touched (see `docs/claude/documentation.md`).
