# Rendering (`src/render/`)

three.js 0.160.0, orthographic top-down. Contract: `ARCHITECTURE.md` section 2. The renderer only reads `game.state` (and calls `game.comboPartners` inside a try/catch).

## Modules

| File | Role |
|---|---|
| `Renderer.ts` | Public class: WebGL setup, batches, frame, overlay state, resize. Extras: `setViewInsets`, `getZoom`, `dispose`, `.canvas`. |
| `camera3d.ts` | [OS3] `View3D`: perspective camera, fit, ray picking, zoom, pan, rotate (see 3D view). |
| `meshes.ts` | [OS3] `MeshBatch` (instanced 3D shapes) and the lights of the 3D view. |
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

## Enemy kinds [OS3]

`drawAttackers` scales by `ENEMIES[kind].size`; cues that also work without colour: Armored a dashed grey ring, Boss a
solid red ring, red glow and a double-length HP bar, Shielded a cyan bubble ring and a cyan bar above the HP bar that
shrinks with the shield, Regenerator a green pulse while healing, Splitter a short-dashed amber ring. All in existing
batches (`groundRing`, `ringAdd`, `attGlow`, `attTop`).

## Tilted view (game feel, optional)

`setOptions({ tilted })` calls `CameraController.setTilt`. An orthographic camera tilted over a flat field shows it
squashed vertically by cos(angle), so the tilt is implemented exactly as a vertical scale: `camera.scaleY = scale * ys`
with `ys = TILT_Y` (0.78, about 39 degrees). Every y conversion uses `scaleY` (`screenToWorld`, `worldToScreen`, fit,
clamp, zoom at the cursor, pan, pinch) and `render()` sets the frustum half-height to `H / 2 / scaleY`. No raycasting,
so clicks stay exact; the Playwright check builds at a point, zooms at it and pans, and the turret stays under the
click. Turrets get a soft drop shadow in the new `tShadow` batch (order 3.4, under the turret bases). Turrets and rings
show as ellipses, which is what a tilted flat field looks like. OnSlaught 3 also has a real perspective view, see 3D view below.

## 3D view [OS3] (default)

Setting `viewMode` ('top' | 'tilted' | '3d', default '3d') becomes the renderer options `tilted` and `view3d`
(`App.applyLook`). `Renderer._applyView` switches between the views at run time; the 2D path is unchanged.

- **Camera** (`camera3d.ts`, `View3D`): a `PerspectiveCamera` (fov 38) orbiting a ground target `(tx, ty)` with `yaw`,
  `pitch` (default 0.96 rad, about 55 degrees, range 0.6 to 1.35) and `dist = fitDist / zoom`. Three.js space is
  `(x, -y, z)` with z up, like the batches. `setViewOffset` puts the target at the centre of the free area (HUD insets).
  `fit()` binary-searches the distance at which the four field corners fit the free area, using `defaultYaw()`: a
  quarter turn when the free area is portrait (phones), else 0. `screenToWorld` casts a ray onto z = 0 (exact; sim-test
  checks the round trip at several yaw/pitch/zoom values), `worldToScreen` projects. No DOM: the canvas rectangle comes
  from a callback, so it runs in Node.
- **Input** (`CameraController` in `camera.ts` delegates to `v3` while it is set): wheel zooms toward the cursor
  (`zoomAt` keeps the ground point under it), right/middle drag pans the ground, Shift or Alt + right drag rotates (x)
  and tilts (y), two fingers pinch, pan and twist. Keys `[` and `]` call `renderer.rotateView` (15 degrees). Screen shake
  moves the target (`shakeX/Y`), picking ignores it.
- **Shapes** (`meshes.ts`): 8 `MeshBatch`es (wrapping `THREE.InstancedMesh`) of unit geometries: cylinder, octagonal
  drum, box, sphere, tetrahedron, dodecahedron, torus and a transparent shield sphere, so the 3D view adds 8 draw calls.
  Lambert materials lit by an ambient and a directional light (from the upper left); they are `transparent` so three.js
  sorts them by `renderOrder` (6.5) between the ground layers and the projectiles. `entities.ts` draws into them when
  `R.opts.view3d`: turrets as a plinth (height `PLINTH_H` 5) with a body, a head and a barrel per kind (`BARREL`), modifier
  dishes with a spinning ring and the icon on top, Combo-only as an orb with a ring; attackers by kind (Runner sphere,
  Armored drum with a plate, Swarmer tetrahedron, Splitter two spheres, Regenerator with a halo, Boss dodecahedron,
  shield shell) in the wave colour, with a small hop (none under reduce motion). Blob shadows use `tShadow` and `attSh`.
- **Batches in 3D**: sprite instances got a height `z` and a local offset (`addAt`), plus per-batch `set3d(lift, bill,
  depth)`: projectiles, smoke and beams at height 11, text billboarded at 24, HP bars billboarded above each unit
  (`attTop`), modifier icons and colour badges depth-tested on top of the shapes, the upgrade ring (`tRing`) lifted onto
  the plinth. Rings got `set3d(lift, depth)`. Line widths use `View3D.wpp()` (world units per pixel at the target).
- Not done: shadow maps, a 3D ghost (the build preview stays a flat image on the ground) and 3D projectiles.

## Screen shake and kill impact (game feel)

`R.shake` (0..1) is raised on the first frame of a big blast (radius > 70: +0.45, nuke and BFG size +0.75) and of a
black hole (+0.5), and decays by 1 per 600 ms of real time. `render()` offsets the camera by `shake^2 * 7` CSS px with
two fast sines, so small hits barely move it. Off when `opts.screenShake` is false or `opts.reduceMotion` is on (the
energy still decays). `screenToWorld` ignores the offset (at most 7 px, only for a moment).
Every kill with a bounty gets a short expanding ring (first quarter of its `cash` effect).

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
