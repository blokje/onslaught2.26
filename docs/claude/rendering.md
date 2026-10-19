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

## 3D proposal

`docs/visual-design-3d.md` describes a proposed 3D look (camera, lighting, meshes, effects, budget). Not built yet.

## Rules

- Coordinates: world x right, y down (720 x 450). Only `camera.ts` converts to three.js space.
- No per-entity three.js objects. Everything dynamic goes through the instanced batches; instance buffers are rewritten each frame.
- New visuals: draw them in `atlas.ts` (procedural, original) and add a case in `entities.ts` or `fxlayer.ts`. Keep the demo in `demo.ts` showing every kind.
- Never consume left-button or single-touch events: those belong to the UI.
- DPR is capped at 2. Antialiasing is off because edges are shader or texture antialiased.

## Demo

`npm run dev`, then open `/render-demo.html` (`?map=0` to `?map=9`). Keys: R ranges, C combo, G ghost (Tab cycles kind), J join line, P pause, 1 to 4 set the speed to 1x/2x/4x/8x (5 to 8 repeat the same cycle), X stress test, M next map, 0 reset view, F hide the HUD.
