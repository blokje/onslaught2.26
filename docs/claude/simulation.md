# Simulation (`src/game/`)

Pure logic, runs in Node and the browser. Contract: `ARCHITECTURE.md` section 1. Rules: `SPEC.md` sections 2 to 6 and 9.

## Modules

| File | Role |
|---|---|
| `Game.js` | Core: state, commands, events, unlocks, placement, economy, modifier/link recompute, freak-out scheduler, serialize/deserialize. The comment block at the top documents the helper API used by combos. |
| `Path.js` | Polyline road: length, `at(d)`, `place(obj, d)` (O(1) cursor per attacker), `distanceTo(x, y)`, `samples(4)` road points. |
| `Waves.js` | Wave start and the spawner (10 per wave, 700 ms apart). Waves may overlap. |
| `Attacker.js` | Creation, `waveHp(n, growth) = 10 * growth^n`, movement, poison and recovery, leak detection. |
| `Turret.js` | Plain data class (JSON-able, no back references). |
| `modifiers.js` | Ladders, `maxLevels`, upgrade costs, effective-stat formula. |
| `targeting.js` | 8 target modes, directional cones, `acquire` / `targetValid`. |
| `weapons.js` | Per-turret step: cooldown, target upkeep, combo hook, all weapon kinds, laser chain, Red holding pattern. |
| `projectiles.js` | Movement modes `straight`, `homing`, `orbit`, `goto`; impact, blast, off-field removal. |
| `combos.js` | Recipe matching and all 20 combo effects. |
| `grid.js` | Spatial grid (cell 64) rebuilt each step for attacker queries. |
| `rng.js` | mulberry32; whole state is one int, so it serialises trivially. |
| `events.js` | Emitter; listener errors never break the simulation. |

## Step loop

- `update(realDtMs)` runs fixed 1/60 s steps scaled by `speed`, at most 8 x speed steps per call; any backlog beyond that is dropped.
- `advance(steps)` runs exact steps: use it in tests.
- Order inside `step(dt)`: wave timer, spawners, move attackers (stop if game over), grid rebuild, `combos.update`, freak-out tick, every turret (`stepTurret`, includes the combo hook), projectiles, age beams and effects, remove dead attackers. Score is refreshed on each kill.

## Key formulas

- Effective stat = (ladder value + flat adds) x max(0.2, 1 + sum of multiplier bonuses). Freak-out adds +3 to the damage multiplier sum and +4 to the rate sum (so x4 and x5).
- Fire interval ms = 60000 / rate. Turrets rescale their remaining cooldown when the rate changes.
- Laser chain: contribution = (own effective damage + contributions) x 1.25, recursive with a visited set; contributors must be ready and reset their timer.
- Score = kills x spent. `spent` only grows (sell refunds do not lower it; the $500 move cost is added).

## Combos

`game.combos` (`combos.js`) gets `tryFire(lead)` before every normal shot of a combo-capable turret. It is also called through `update(dt)`, `projectileUpdate(p, dt)`, `projectileImpact(p, x, y, target)` and `serialize()` / `deserialize()`.
Every fired combo adds 1 to the lead's `combosFired` and each chosen partner's `combosAssisted`, and prepends `{ id, time, role }` to their `comboLog` (max `COMBO_LOG_MAX`). `game.comboPreview(id)` (`Combos.preview`) is a read-only, rng-free view for the UI: partners in range, the lead colour's recipes with missing partners, and the earliest wait per recipe (max of the lead's wait and the need-th soonest partner of each colour). It is "earliest possible": normal shots reset `cd`.
Helper API on `Game` (documented at the top of `Game.js`): `comboPartners`, `spawnProjectile`, `addEffect`, `addBeam`, `damageAttacker`, `blast`, `attackersInRadius`, `roadPoints`, `chainLaserDamage`, `killAttacker`, `startRecharge`, `emit`, `rng`.

## Adding things

See the skills `add-turret`, `add-combo` and `add-map`. Every new mechanic needs a check in `scripts/sim-test.mjs` or `scripts/combo-test.mjs`.
