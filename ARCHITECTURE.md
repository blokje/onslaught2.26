# OnSlaught2.26: architecture contract

Read `SPEC.md` for the rules. This file fixes the interfaces between the three layers so they can be
built independently. **Do not change these interfaces without the coordinator's OK.** Adding optional fields is fine.

Stack: Vite + TypeScript (`strict`, ES modules, no framework) + three.js (`three@0.160.0`, types from `@types/three`).
The shapes in this contract are also declared as TypeScript types in `src/types.ts`; keep both in sync.
Data lives in `src/data/` (read-only for all layers): `maps.ts`, `turrets.ts`, `combos.ts`, `rules.ts`.
`MapDef` (`src/types.ts`) is `{ id, name, base, path, extra? }`; the optional `extra` flag marks the [NEW] extra maps (menu grouping only, no simulation effect).

```
src/
  main.ts            bootstrap (coordinator owns)
  types.ts           shared contract types (coordinator owns; mirrors this file)
  data/              shared data (coordinator owns)
  game/              simulation: pure logic, NO DOM, NO three.js   (Simulation agent)
  render/            three.js view: reads game state, draws it     (Renderer agent)
  ui/                DOM overlay, input, menus, saving, audio       (UI agent)
```

## Coordinates

World units = original pixels. Field is 720 × 450, **x right, y down** (as in the map data).
The renderer converts to three.js space. Angles are radians, 0 = +x, increasing clockwise on screen (y down).

## 1. Simulation: `src/game/Game.ts`

```js
import { Game } from './game/Game.ts';
const game = new Game({ mapId: 'map1', difficulty: 'medium', mode: 'normal', unlockAll: false });
game.update(realDtMs);      // call every animation frame; applies speed/pause; internally fixed 1/60 s steps (max 8 per call per speed unit)
game.on(event, fn);  game.off(event, fn);
const save = game.serialize();          // plain JSON-able object
const g2 = Game.deserialize(save);      // restore a running game
```

The constructor's default `seed` is a fixed constant, so callers that want a different game each time pass `opts.seed`
(`src/main.ts` does). `Game.deserialize(d)` validates its input and throws `Error('Invalid save: ...')` on a malformed save
(version, arrays, entity caps, unknown turret kind); it ignores `__proto__`, `constructor` and `prototype` keys.

### 1.1 `game.state` (read-only for render/ui; plain objects and arrays)

```js
{
  time,                 // game ms elapsed (scaled by speed, stops when paused)
  speed,                // 1 | 2 | 4 | 8
  paused, over,         // booleans
  difficulty, mode, mapId,
  cash, lives, kills, spent, wave,
  nextWaveIn,           // ms until the next wave auto-starts
  score,                // kills * spent (kept up to date)
  unlocked: { [kind]: true },     // turret kinds available to build
  map: { id, name, path: [[x,y],...], base: { x, y, w, h }, roadWidth, length },

  attackers: [ { id, type /*0..8*/, x, y, angle, hp, maxHp, speed, baseSpeed,
                 poisoned /*bool*/, blackholed /*bool*/, progress /*distance along path*/,
                 weave /*optional [ph1, ph2, k1, k2]: sideways weave, see laneOffset() in Attacker.ts*/ } ],

  turrets: [ { id, kind /*key of TURRETS*/, x, y, angle /*weapon aim*/,
               levels: { damage, range, rate }, maxLevels: { damage, range, rate },
               stats:  { damage, range, rate },      // effective, after modifiers and freak-out
               cashValue,                             // total spent on it (build + upgrades)
               comboCapable /*damage maxed*/, comboReady /*can lead/assist now*/,
               freak: 'off' | 'available' | 'warn' | 'on',
               holding /*rockets circling, Red only*/,
               links: [turretId],                     // Green: linked Greens
               targetMode /*rules.TARGET_MODES*/, locked /*bool*/, targetId /*or null*/,
               directional: { mode: 'normal'|'wide'|'medium'|'tight'|'small'|'pinpoint', angle }, // 360/180/90/60/45/30 degrees
               joinedTo /*Targeter: turret id or null*/, comboColor /*'red'|'green'|'blue'|'yellow' or null: weapons have their own colour, Combo-only the chosen one, else null*/,
               modRange /*modifiers: current influence radius*/,
               combosFired, combosAssisted,           // combos led / joined as partner (weapons and Combo-only)
               comboLog: [ { id /*recipe id*/, time /*game ms*/, role: 'lead'|'partner' } ] /*newest first, max COMBO_LOG_MAX*/ } ],

  focusId,              // optional: attacker id under focus fire, or null (renderer draws a reticle on it)
  projectiles: [ { id, kind, x, y, angle, armed? } ],   // armed (mines only): false while travelling, true once placed
    // kind: 'shell' | 'rocket' | 'nuke' | 'poisonRocket' | 'laserRocket' | 'napalmRocket' | 'tazerRocket'
    //       | 'bfg' | 'clusterBomb' | 'cluster' | 'mine'
    // other fields (speed, mode, blast, ttl, orbit, goto, ...): comment header of src/game/projectiles.ts

  beams: [ { kind, x1, y1, x2, y2, age, ttl } ],
    // short-lived lines; kind: 'laser' | 'chain' (laser link between Greens) | 'spark' | 'fusion' | 'rail' | 'sniper'

  effects: [ { id, kind, x, y, radius, age, duration, data } ],
    // kind: 'blast' (data.size), 'poisonCloud', 'blackHole', 'napalm' (data.points: [[x,y],...]),
    //       'shockwave', 'cash' (data.amount), 'comboName' (data.name), 'freakWarn' (data.turretId)
    // age/duration in game ms; renderer fades by age/duration; sim removes when age >= duration
}
```

Other fields (not part of the render contract): turret internals (`cd`, `ramp`, `kills`, ...) are listed in the comment header
of `src/game/Turret.ts`, attacker internals (`swallowed`, `dead`, ...) in `src/game/Attacker.ts`, projectile fields in `src/game/projectiles.ts`.

Entity `id`s are unique integers that never repeat within a game. Renderer syncs meshes by id.

### 1.2 Commands (return `{ ok: true, ... }` or `{ ok: false, reason: 'text' }`)

```js
game.canBuild(kind, x, y)            // checks cash, unlock, field bounds, road, base, overlap
game.build(kind, x, y)               // -> { ok, id }
game.upgrade(id, stat, toMax=false)  // stat: 'damage'|'range'|'rate'; modifiers: 'range' only; -> { ok, levels } (levels bought)
game.upgradeCost(id, stat)           // -> number | null (null = maxed / not upgradable)
game.sell(id)                        // refund 70% of cashValue
game.move(id, x, y)                  // costs $500, same placement checks
game.setTargetMode(id, mode)         // or game.cycleTargetMode(id)
game.toggleLock(id)
game.focusFire(attackerId)           // all weapons that can reach it target it; null clears
game.setDirectional(id, mode, angle) // or game.cycleDirectional(id): normal, wide, medium, tight, small, pinpoint, normal
game.join(targeterId, turretId)      // toggles; turretId null unjoins
game.setComboColor(id, color)        // Combo-only
game.comboPartners(id)               // -> [turretId] within COMBO_RANGE (for the C overlay)
game.comboPreview(id)                // read-only, no rng: { leads, partners: [{ id, kind, color, wait }],
                                     //   recipes: [{ id, name, isNew, needs, missing, exactBlocked, wait }], next: { id, name, wait } | null }
                                     //   wait = earliest ms until it could fire (Infinity = not possible), for the panel's Combos tab
game.sendWave()                      // early wave, adds early bonus; refused while paused ('Game is paused')
game.setSpeed(s); game.togglePause(); game.setPaused(bool)
game.setWaveInterval(ms)             // fails unless ms is a finite number >= 1000; clamps nextWaveIn
game.advance(steps)                  // exactly `steps` 1/60 s steps, ignores speed and pause (tests and tools)
game.addAttacker(a)                  // push a ready-made attacker (tests); game.spawnAttacker(wave, hpOverride?) creates one from the wave formula
game.turretAt(x, y)                  // -> id | null (within TURRET_SIZE/2)
```

### 1.3 Events (`game.on(name, fn)`; payload object)

`shot {kind, turretId}`, `hit {attackerId}`, `kill {attackerId, x, y, bounty}`, `leak {lives}`,
`wave {wave}`, `blast {size, x, y}`, `combo {id, name, turretId, partnerIds}`, `build {id, kind}`, `sell {id, refund}`,
`upgrade {id, stat, levels}`, `move {id, x, y}`, `unlock {kind}`, `freakout {id, stage}`, `message {text}`, `gameover {score, kills, wave}`,
`error {reason}` (failed command, for UI feedback).

### 1.4 Rules the simulation must follow
Everything in `SPEC.md` sections 2 to 6 and 9, using the data files. Target modes: near, far (furthest along the path),
weak, strong, slow, fast, oldest (lowest attacker id), newest (highest attacker id). Directional cones restrict acquisition to ±half-angle around `directional.angle`.
Focus fire overrides target choice for every weapon that has the focus target in range.

## 2. Renderer: `src/render/Renderer.ts`

```js
const r = new Renderer(containerElement);   // creates canvas filling the container, handles resize + devicePixelRatio
r.setGame(game);                            // (re)binds; clears all meshes
r.render(realDtMs);                         // call every frame after game.update
r.screenToWorld(clientX, clientY)           // -> { x, y } in world units
r.worldToScreen(x, y)                       // -> { x, y } client pixels
r.setOverlay({                              // UI-driven overlays, call whenever they change
  ghost: { kind, x, y, valid } | null,      // build/move preview with its range ring
  selectedId: id | null,                    // range ring; a weapon with a cone (directional) shows the cone instead
  hoverId: id | null,
  showRanges: 'selected' | 'all',           // R key toggles to 'all'
  showCombo: bool,                          // C key: lines from selected turret to comboPartners
  joinFromId: id | null,                    // Targeter join mode: line to cursor
});
r.resetView();                              // fit field to screen
r.setViewInsets({ top, right, bottom, left }) // optional: CSS px covered by HUD panels, the fitted field avoids them
r.getZoom()                                 // -> current zoom factor
r.dispose();                                // remove listeners and the canvas, release WebGL
r.canvas                                    // the canvas element
```
`setGame(null)` clears the view (no game, nothing drawn).

Camera: orthographic top-down. Fits the field on load with a small margin; mouse wheel zooms toward the cursor
(0.5× to 4×), right- or middle-button drag pans, two-finger pinch/drag on touch. Left button is reserved for the UI.
Panning is clamped so the field cannot leave the screen entirely.

Art direction: original procedural art, no copied sprites. Sandy desert ground with subtle noise and faint
circuit-board line patterns; brown road with soft edges; a fenced compound as the base; turrets as round metal
bases with a coloured weapon on top (blue cannon, green laser emitter, red rocket pod, yellow tazer coil, modifiers as
dish/antenna shapes), clearly readable at 44 units. Attackers: 9 distinct original small vehicle/drone silhouettes with
an HP bar. Effects: additive glow blasts, beams, smoke trails, black hole swirl, napalm flames, shockwave ring,
floating "+$n" text, combo name text. Must hold 60 fps with 300 attackers and 150 turrets (use InstancedMesh or
pooled meshes for attackers/projectiles).

## 3. UI: `src/ui/`

`src/ui/App.ts` exports `class App { constructor(rootEl, { createGame, restoreGame, renderer }) }` where
`createGame(opts) -> Game`, `restoreGame(save) -> Game` (`Game.deserialize`) and `renderer` is the Renderer instance. The App owns screens and input:

- **Main menu**: map picker (18 maps in a 6 x 3 grid, each with a mini path preview drawn on a 2D canvas; maps with `extra: true` are labelled E1 to E8), difficulty, mode (Normal/Sandbox),
  Continue (if a mid-game save exists), high scores, settings, how-to-play.
- **In-game HUD** (DOM overlay over the canvas): cash, lives, wave, kills, score, next-wave countdown,
  speed buttons 1/2/4/8, pause, send-wave; build rack with the 16 turrets (locked ones greyed with unlock hint);
  selected-turret panel (stats, 3 upgrade buttons with costs, Max buttons, sell, move, target mode, lock,
  directional, join/colour where relevant); message log; combo-in-range toggle; game-over dialog.
- **Input**: left click on field = build (when a rack item is armed), select turret, focus-fire attacker when F mode;
  all keyboard shortcuts from `SPEC.md` section 8; Esc cancels. Uses `renderer.screenToWorld`, `game.turretAt`,
  updates `renderer.setOverlay`.
- **Persistence** (`src/ui/storage.ts`, localStorage key prefix `os226.`, all access in try/catch):
  settings, unlocks (Extreme after reaching wave 100 on Medium, Sandbox after wave 50 on anything),
  high scores per map+difficulty (top 10), autosave of the running game every 10 s and on page hide.
- **Settings**: master volume / mute, wave interval override, snap-to-grid toggle (grid 22 units), unlock-all switch,
  show FPS, `autoPause` (pause while the tab is hidden), `panelPos` (moved turret panel). `getSettings()` drops stored values
  whose type does not match the default.
- **Audio** (`src/ui/audio.ts`): Web Audio synthesized SFX driven by game events (cannon pop, laser zap, rocket whoosh,
  spark crackle, blasts by size, nuke boom, kill tick, leak alarm, wave horn, combo chord, UI clicks). Rate-limit
  per sound so 8× speed stays pleasant. Starts after the first user gesture.
- Layout must work from 1024 × 640 up to 4K, and on iPad landscape (touch: tap = left click; a "pan mode" is not
  needed because two-finger gestures pan/zoom). Show a "rotate to landscape" notice in portrait.

## 4. `src/main.ts` (coordinator)

Creates the Renderer on `#game`, the App on `#ui`, and runs the frame loop:
`game.update(dt); renderer.render(dt); app.frame(dt);`. The App calls `renderer.setGame(game)` when it starts or loads a game.
