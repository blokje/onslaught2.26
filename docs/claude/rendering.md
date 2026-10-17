# Rendering (`src/render/`)

three.js 0.160.0, orthographic top-down. Contract: `ARCHITECTURE.md` section 2. The renderer only reads `game.state` (and calls `game.comboPartners` inside a try/catch).

## Modules

| File | Role |
|---|---|
| `Renderer.js` | Public class: WebGL setup, batches, frame, overlay state, resize. Extras: `setViewInsets`, `getZoom`, `dispose`, `.canvas`. |
| `camera.js` | View state and input: wheel zoom toward the cursor (0.5x to 4x), right/middle drag pan, two-finger pinch/pan, clamping. `screenToWorld` / `worldToScreen`. |
| `terrain.js` | Ground shader (sand noise, circuit lines, vignette), road as a signed-distance texture, dashes, base compound. |
| `atlas.js` | All sprites drawn procedurally with the 2D canvas into atlases (effects, 9 attackers, 16 turret bases and weapons) plus a text atlas for "+$n" and combo names. |
| `batches.js` | `SpriteBatch` and `RingBatch`: instanced quads. A full frame is about 25 draw calls. |
| `entities.js` | Turrets, attackers, projectiles, rocket smoke. |
| `fxlayer.js` | Beams, effects, overlays (ghost, selection, hover, ranges, combo lines, join line). |
| `particles.js` | Renderer-owned particle pool (capped), not part of game state. |
| `util.js` | Colour helpers and the compact number format. |
| `demo.js` | Fake game with the 1.1 state shape, used by `/render-demo.html`. |

## Rules

- Coordinates: world x right, y down (720 x 450). Only `camera.js` converts to three.js space.
- No per-entity three.js objects. Everything dynamic goes through the instanced batches; instance buffers are rewritten each frame.
- New visuals: draw them in `atlas.js` (procedural, original) and add a case in `entities.js` or `fxlayer.js`. Keep the demo in `demo.js` showing every kind.
- Never consume left-button or single-touch events: those belong to the UI.
- DPR is capped at 2. Antialiasing is off because edges are shader or texture antialiased.

## Demo

`npm run dev`, then open `/render-demo.html` (`?map=0` to `?map=9`). Keys: R ranges, C combo, G ghost (Tab cycles kind), J join line, P pause, 1 to 4 speed, X stress test, M next map, 0 reset view, F hide the HUD.
