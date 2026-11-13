# Rendering (`src/render/`)

three.js 0.160.0, orthographic top-down. Contract: `ARCHITECTURE.md` section 2. The renderer only reads `game.state` (and calls `game.comboPartners` inside a try/catch).

## Modules

| File | Role |
|---|---|
| `Renderer.ts` | Public class: WebGL setup, batches, frame, overlay state, resize. Extras: `setViewInsets`, `getZoom`, `dispose`, `.canvas`. |
| `camera.ts` | View state and input: wheel zoom toward the cursor (0.5x to 4x), right/middle drag pan, two-finger pinch/pan, clamping. `screenToWorld` / `worldToScreen`. |
| `terrain.ts` | Ground shader (sand noise, circuit lines, vignette), road as a signed-distance texture, dashes, base compound. |
| `atlas.ts` | `newCanvas()` / `ctx2d()` (shared with `terrain.ts`; `ctx2d` throws if there is no 2D context). All sprites drawn procedurally with the 2D canvas into atlases (effects, 9 attackers, 16 turret bases and weapons) plus a text atlas for "+$n" and combo names. |
| `batches.ts` | `SpriteBatch` and `RingBatch`: instanced quads. A full frame is about 25 draw calls. |
| `entities.ts` | Turrets, attackers, projectiles, rocket smoke. |
| `fxlayer.ts` | Beams, effects, overlays (ghost, selection, hover, ranges, firing cones, combo lines, join line). |
| `particles.ts` | Renderer-owned particle pool (capped), not part of game state. |
| `util.ts` | Colour helpers and the compact number format. |
| `demo.ts` | Fake game (`DemoGame`) whose objects satisfy the real `TurretState`, `Attacker` and `Projectile` types, used by `/render-demo.html` via `render-demo.ts`. |
| `context.ts` | Types only: `RenderGame` (what `setGame` accepts: a `state` and an optional `comboPartners`), `Res`, `Frame`, `Batches`, `Cells`. Add every new batch to `Batches`. |

## Rules

- Coordinates: world x right, y down (720 x 450). Only `camera.ts` converts to three.js space.
- No per-entity three.js objects. Everything dynamic goes through the instanced batches; instance buffers are rewritten each frame.
- New visuals: draw them in `atlas.ts` (procedural, original) and add a case in `entities.ts` or `fxlayer.ts`. Keep the demo in `demo.ts` showing every kind.
- Never consume left-button or single-touch events: those belong to the UI.
- DPR is capped at 2. Antialiasing is off because edges are shader or texture antialiased.

## Reduce motion (accessibility)

`renderer.setOptions({ reduceMotion })` stores the flag in `R.opts`. When on: the combo halo stays at a steady alpha,
the freak-out warning tints instead of blinking, a freaking-out turret gets a steady glow instead of jitter and shimmer
copies (`drawTurrets`), and blasts keep a dimmer white core (35%), skip the star flash and spawn half the debris
(`drawEffects`). There is no full-screen flash anywhere, keep it that way. Any new blinking, pulsing or shaking effect
must check `R.opts.reduceMotion`.

## Colour symbols (accessibility)

Combo colours are also shapes: red triangle, green circle, blue square, yellow diamond (`COLOR_SHAPES` in `atlas.ts`, the
same table as `COLOR_SYMBOL` in `src/ui/colors.ts`; sim-test (acc) keeps them equal). The shapes are white cells 8 to 11
of the icon atlas (now 4 x 3, `symbolUV(color)`), tinted with `COMBO_COLOR` at draw time. `drawTurrets` puts one badge on
every turret with a `comboColor` (weapons and Combo-only), `SYMBOL_SIZE` 15 units, `SYMBOL_DY` 14 below the centre, so it
stays inside the upgrade ring. It uses the existing `tIcon` batch (no extra draw call). Off when `overlay.colorSymbols`
is false. The render demo's fake turrets now carry their weapon colour as `comboColor`, like real ones.

## Range preview ring

`overlay.previewRange` (`{ id, range }`, set by the UI while a stat row in the Upgrades tab is hovered) draws a dashed
lime ring (48 dashes, `ringUnder`) around the selected turret at the range it would have after one more range level.
Only drawn when `id` is the selected turret (`drawOverlay` in `fxlayer.ts`).

## Upgrade ring

Every upgradable turret has a ring around it (`drawTurrets` in `entities.ts`, `RingBatch` `tRing` at order 5.4, capacity 1600), replacing the old 3 bars and their `tTop` sprite batch:

- One segment per stat with `maxLevels > 0`, clockwise from the top in Q/W/E order (damage, range, rate). One stat (modifiers, Targeter) = a full circle; three stats = three equal thirds with a small gap.
- Each segment has one tick per level. Bought ticks are yellow, all ticks of a stat turn green once that stat is maxed, unbought ticks are dark grey. Level 0 shows an empty grey ring; turrets without upgrades (Combo-only) have no ring.
- A thin inner arc in the stat colour (orange damage, cyan range, lime rate) says which segment is which.
- The outer edge stays inside `TURRET_SIZE / 2`, so the rings of two turrets at the minimum spacing never overlap.
- Zoomed far out (a tick narrower than about 2.5 screen pixels) the ticks merge into a continuous arc.
- Drawn with `RingBatch.arc()` (start, sweep, ticks, clip; `add()` still draws full rings), at most 9 instances per turret: a grey track, the filled ticks (`clip = level / max`) and the stat-colour arc per stat. Sizes are the `RING_*` constants at the top of `entities.ts`.

## Demo

`npm run dev`, then open `/render-demo.html` (`?map=0` to `?map=9`). Keys: R ranges, C combo, G ghost (Tab cycles kind), J join line, P pause, 1 to 4 set the speed to 1x/2x/4x/8x (5 to 8 repeat the same cycle), X stress test, M next map, 0 reset view, F hide the HUD.
