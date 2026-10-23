# Gotchas

- **`blackholed` vs `swallowed`:** `blackholed` means the engine stops moving the attacker along the road and it pays $0. `swallowed` (set by the black hole combo) also makes it untargetable. Tests pin attackers with `blackholed`, so targeting checks `swallowed`, not `blackholed`. Only targeting and the piercing laser skip swallowed attackers; line and area hits (the Railgun beam, `blast()`) still hit them on purpose.
- **`comboReady` can be stale within a step.** `combos.ts` recomputes readiness (`comboCapable && cd <= 0 && time >= comboNext`) to avoid one partner serving two leads in the same step.
- **Holding Esc does not toggle the menu repeatedly:** `App.onKey` ignores auto-repeat for Esc (and for most other keys).
- **The frame loop in `main.ts` survives an exception:** it logs the first occurrence of each message and pauses the game instead of dying, so a broken frame does not freeze the page silently.
- **Combo-only** never leads and never fires; it counts as its `comboColor` and is always combo-capable. Default colour is red.
- **Colours for new weapons:** Sniper counts as blue, Fusion green, Railgun red in combos.
- **`comboPartners`** excludes modifiers and Targeters.
- **`spent` never decreases.** Sell refunds do not lower the score; the move cost is added to `spent` but not to the turret's `cashValue`.
- **Beams age at `dt / speed`** so they stay visible at 8x; effects age in game ms. Beams are capped at 400, effects at 300.
- **First wave** starts after one full `waveInterval`.
- **`update()` drops backlog** beyond 8 x speed steps per call (tab switches do not fast-forward the game).
- **Map base** is the top-left corner of the 126 x 82 footprint, not its centre.
- **Placement:** the only 5-turret combo spot on Classic is about 80 units from the road; the maps fit about 145 legal turrets, so the benchmark places the last few directly.
- **`state.turrets`** holds `Turret` instances (own fields only), not plain literals; they still serialise as JSON.
- **The original game** is version `v.1045` and has no difficulty levels, only 3 target modes and 11 turret kinds; everything beyond that is [NEW].
- **Mines never expire and have no limit (faithful to the original).** In a long game the road fills with mines. Do not re-add a cap or lifetime without the user's OK. They share the `proj` sprite batch (capacity 1500, `src/render/Renderer.ts`); if mines plus bullets ever exceed it, sprites are silently dropped, so raise the capacity.
- **Combo cadence is range-driven (faithful to the original).** Partners that see a target fire normal shots and reset their own timer, so a lead rarely finds every partner ready. Players fix this by giving partners less range than the lead (or none touching the road), so the lead always sees the attacker first. Measured: Napalm, BFG and cluster bombs fired 0 to 2 times in 200 s in a marching wave, Nuke and mines 10 or more. Do not "fix" this in the engine without the user's OK.
- **`comboColor: null` on the Sniper entry in `src/data/turrets.ts` is ignored.** Combos read the turret's `color` (Sniper blue, Fusion green, Railgun red). Maxing their damage costs $42K to $55K, so they are rarely combo partners in practice.
- **Nuke dominates:** about 5x the damage per second of any other combo (original numbers, frozen). New combos are balanced against the rest, not against the Nuke.
- **Freak-out is not in the DPS baselines:** Blue and Yellow freak-out averages about 3.4x their raw DPS; `scripts/balance.ts` compares against raw numbers.
- **`show(el, on, display)` in `src/ui/dom.ts`** sets `style.display = display` when shown. With the default `''` the element falls back to its CSS, so elements whose CSS says `display: none` (pause overlay, focus badge, mode hint) need an explicit `'block'` or `'flex'`.
- **The Combos tab countdown is the earliest possible time.** `comboPreview` waits on `cd` and `comboNext` only; a lead also needs a target, and partners that shoot normal shots reset their `cd`, so a combo can come later than shown.
- **Turret panel panes are hidden with the `off` class, not `show()`.** An inline `style.display` would override `.os-side.collapsed .os-side-body { display: none }`.
- **Paused games refuse `sendWave()`.** Spawners only run inside `step()`, so a wave started while paused would pay the bonus and spawn nothing.
- **The upgrade ring radius is tied to `TURRET_SIZE / 2`.** Turrets may stand `TURRET_SIZE` apart, so a larger ring would overlap its neighbour. Draw other always-on turret decorations inside that radius too.
- **The `fx.beam` atlas cell is mostly transparent.** It is a soft gradient meant for additive batches. Thin lines in a normal-blend batch (`groundFx`, the firing cone) need `fx.whiteSolid`, and additive lines wash out on the light terrain.
- **TypeScript runs unbuilt in Node.** The tests import `src/` directly and Node strips the types, so only erasable syntax works:
  no `enum`, `namespace` or constructor parameter properties (`erasableSyntaxOnly` enforces it), relative imports carry the
  `.ts` extension, and type-only imports use `import type` (`verbatimModuleSyntax`). Vite strips types too and never type-checks:
  only `npm run typecheck` (also run by `npm run build`) catches type errors.
- **Unused code fails the type check.** `noUnusedLocals` and `noUnusedParameters` are on: delete what is unused; a parameter that must stay for a callback signature gets a leading underscore (`_dt`).
- **Shared shapes live in `src/types.ts`.** It is the typed copy of `ARCHITECTURE.md`; change both together.
- **New event = new `GameEvents` entry.** `game.on/off/emit` are generic over `GameEvents` in `src/types.ts`; emitting an unlisted event or a payload of the wrong shape fails the type check.
