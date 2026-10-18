# Simulation (`src/game/`)

Pure logic, runs in Node and the browser. Contract: `ARCHITECTURE.md` section 1. Rules: `SPEC.md` sections 2 to 6 and 9.

Types: entity and state shapes come from `src/types.ts`. Commands return `Result<...>` (`{ ok: true, ... } | { ok: false, reason }`),
so callers narrow on `r.ok`. Command parameters are the literal unions (`Stat`, `TargetMode`, `DirectionalMode`, `KeyColor`).
`serialize()` returns `SaveData`; `Game.deserialize(save: unknown)` validates before it trusts anything. Combo projectile
payloads are typed locally in `combos.ts` (`ComboProjData`).

## Modules

| File | Role |
|---|---|
| `Game.ts` | Core: state, commands, events, unlocks, placement, economy, modifier/link recompute, freak-out scheduler, serialize/deserialize. The comment block at the top documents the helper API used by combos. |
| `Path.ts` | Polyline road: length, `at(d)`, `place(obj, d, lateral = 0)` (O(1) cursor per attacker; `lateral` shifts left of the travel direction, normal blended over up to 20 units either side of a waypoint (at most half of each neighbouring segment, precomputed in `blend[]`) so corners stay smooth), `distanceTo(x, y)`, `samples(4)` road points. |
| `Waves.ts` | Wave start and the spawner (10 per wave, 700 ms apart). Waves may overlap. |
| `Attacker.ts` | Creation, `waveHp(n, growth) = 10 * growth^n` up to `WAVES.lateWave`, then the slower late growth (see `data-and-balance.md`), movement, sideways weave (`laneOffset(a)`, a pure function of `progress` and the spawn-time `weave` params, so knockback and saves stay consistent; anything that calls `path.place` on an attacker must pass it), poison and recovery, leak detection. |
| `Turret.ts` | Plain data class (JSON-able, no back references). |
| `modifiers.ts` | Ladders, `maxLevels`, upgrade costs, effective-stat formula. |
| `targeting.ts` | 8 target modes, directional cones, `acquire` / `targetValid`. |
| `weapons.ts` | Per-turret step: cooldown, target upkeep, combo hook, all weapon kinds, laser chain, Red holding pattern. |
| `projectiles.ts` | Movement modes `straight`, `homing`, `orbit`, `goto`; impact, blast, off-field removal. |
| `combos.ts` | Recipe matching and all 20 combo effects. |
| `grid.ts` | Spatial grid (cell 64) rebuilt each step for attacker queries. |
| `rng.ts` | mulberry32; whole state is one int, so it serialises trivially. |
| `events.ts` | Emitter; listener errors never break the simulation. |

## Step loop

- `update(realDtMs)` runs fixed 1/60 s steps scaled by `speed`, at most 8 x speed steps per call; any backlog beyond that is dropped.
- `advance(steps)` runs exact steps: use it in tests.
- `Game.deserialize(save)` validates its input and throws `Error('Invalid save: ...')` on a malformed save (callers must catch it, `App` does). The constructor's default `seed` is a fixed constant; pass `opts.seed` for a random game.
- Order inside `step(dt)`: wave timer, spawners, move attackers (stop if game over), grid rebuild, `combos.update`, freak-out tick, every turret (`stepTurret`, includes the combo hook), projectiles, age beams and effects, remove dead attackers. Score is refreshed on each kill.

## Key formulas

- Effective stat = (ladder value + flat adds) x max(0.2, 1 + sum of multiplier bonuses). Freak-out adds +3 to the damage multiplier sum and +4 to the rate sum (so x4 and x5).
- Fire interval ms = 60000 / rate. Turrets rescale their remaining cooldown when the rate changes, except during a combo recharge (`time < comboNext`): that pause is a fixed time and is never rescaled.
- Laser chain: contribution = (own effective damage + contributions) x 1.25, recursive with a visited set; contributors must be ready and reset their timer.
- Piercing laser (`pierceLaser` in `weapons.ts`): the chain total is energy spent along a line from the Green through its target (half-width `LASER_WIDTH` 4, Railgun is 8), nearest first: each attacker with HP <= energy dies and costs its HP, the first stronger one takes the rest and stops the beam. Combos that use `chainLaserDamage` are not affected.
- Score = kills x spent. `spent` only grows (sell refunds do not lower it; the $500 move cost is added).

## Combos

`game.combos` (`combos.ts`) gets `tryFire(lead)` before every normal shot of a combo-capable turret. It is also called through `update(dt)`, `projectileUpdate(p, dt)`, `projectileImpact(p, x, y, target)` and `serialize()` / `deserialize()`.
Every fired combo adds 1 to the lead's `combosFired` and each chosen partner's `combosAssisted`, and prepends `{ id, time, role }` to their `comboLog` (max `COMBO_LOG_MAX`). `game.comboPreview(id)` (`Combos.preview`) is a read-only, rng-free view for the UI: partners in range, the lead colour's recipes with missing partners, and the earliest wait per recipe (max of the lead's wait and the need-th soonest partner of each colour). It is "earliest possible": normal shots reset `cd`.
A recipe matches when the ready partners meet `needs` (and `exact`). The partners actually used and put on recharge come from `takes` when a recipe has it (up to that many per colour, only as many as are ready), else from `needs`. This reproduces two original quirks: Sparky Landmine needs Blue + Yellow but also takes a ready Red, Rocket BFG needs 2 Red but takes 1.
Mines (faithful to the original): no limit, no lifetime. A mine lands on a random road point within the lead's max range plus a -5..+4 offset (`MINE.jitter`), arms on arrival and checks for an attacker within `MINE.triggerRadius` every `MINE.checkInterval` ms (countdown in `p.data.check`, so it is saved).
Helper API on `Game` (documented at the top of `Game.ts`): `comboPartners`, `spawnProjectile`, `addEffect`, `addBeam`, `damageAttacker`, `blast`, `attackersInRadius`, `roadPoints`, `chainLaserDamage`, `killAttacker`, `startRecharge`, `emit`, `rng`.

## Adding things

See the skills `add-turret`, `add-combo` and `add-map`. Every new mechanic needs a check in `scripts/sim-test.ts` or `scripts/combo-test.ts`.
