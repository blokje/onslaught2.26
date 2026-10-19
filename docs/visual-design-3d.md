# Visual design: OnSlaught2.26 in 3D (proposal)

Status: **proposal**, nothing built yet. This describes how the game could look as a 3D scene while keeping the
simulation, the 720 x 450 playfield and the renderer contract (`ARCHITECTURE.md` section 2) unchanged.
It is a design target for a future `src/render3d/` (or a 3D mode inside `src/render/`), not a rule change.

## 1. Concept in one line

**"Circuit board diorama":** the playfield is a slab of dark sandstone with a glowing circuit etched into it, seen as a
tabletop model from a tilted camera. Turrets are small machined towers, attackers are crawling drones, and every shot is
light. Readability first: from the default camera the game must read exactly as the top-down 2D version does.

Why this direction: it continues the current 2D art (sand noise, circuit lines, vignette in `terrain.ts`), it is fully
procedural (rule 4: no asset files, no imitation of the original), and a diorama scale suits a fixed 720 x 450 field.

## 2. Camera

| Item | Design |
|---|---|
| Projection | Perspective, narrow FOV (28 degrees) so it still feels close to orthographic and range rings stay readable |
| Default view | Pitch 55 degrees from horizontal, yaw 0 (north up), whole field framed with a small margin |
| Zoom | Same 0.5x to 4x range as now; zooming in also lowers the pitch smoothly from 55 to 40 degrees ("lean in") |
| Pan | Unchanged inputs (right/middle drag, two-finger pan), clamped to the field |
| Rotation | Optional: Q/E or two-finger twist rotates yaw in 90 degree steps, eased over 250 ms. Off by default |
| Top-down toggle | Key T (and a settings switch) snaps to pitch 90 degrees: the classic view for players who want it |
| Picking | `screenToWorld` raycasts onto the ground plane (y = 0), so the UI and placement code keep using world x/y |

World mapping: game x maps to three.js x, game y maps to three.js z, height is three.js y. One game unit is one world
unit. Only `camera.ts` knows about this, as today.

## 3. Ground and road

- **Slab:** the 720 x 450 field is a box 12 units thick with bevelled, slightly chipped edges, standing on a dark void
  with a soft contact shadow. Beyond the slab: a faint grid that fades out, so zooming out never shows empty black.
- **Surface:** the existing sand-noise shader, now lit (normal from the same noise), plus the circuit traces as
  slightly raised copper lines (height from the trace mask, no extra geometry).
- **Road:** sunk 2 units into the slab as a channel, width 28 as in the spec. Built from the existing signed-distance
  texture: depth and a rounded lip come from the SDF in the ground shader, so it is still one mesh. Road floor is
  darker, with the moving dashes as faint emissive arrows pointing toward the base.
- **Base:** a raised hexagonal bunker at the road end, with a dome that loses one glowing segment per life lost
  (10 segments for 10 lives). Pulses red on a hit.
- **Spawn:** a recessed gate where the road starts; a light strip above it counts down to the next wave.

## 4. Lighting and mood

| Element | Design |
|---|---|
| Key light | One directional "late afternoon" light from the top left, warm (#ffe2b8), casts shadows |
| Fill | Hemisphere light, cool sky (#5a7aa8) and warm ground bounce (#3a2a1a) |
| Shadows | One 2048 shadow map covering the slab, PCF soft. Turrets and attackers cast; projectiles do not |
| Emissive | All weapon effects, turret team lights and the road arrows are emissive and feed a light bloom pass |
| Post | Bloom (threshold high, so only effects glow), subtle vignette, optional FXAA. No depth of field by default |
| Low setting | No shadows, no bloom, baked ambient occlusion in the ground texture; must hold 60 fps on a tablet |

## 5. Colour language

Turret families keep their colour identity; everything else is muted so the colours carry the game information.

| Family | Main | Glow | Shape keyword |
|---|---|---|---|
| Blue Cannon | #3c7bd9 | #8fc4ff | heavy, squat, twin barrel |
| Green Laser | #2fae5a | #8dffb0 | slim, crystal lens on a mast |
| Red Rocket | #c8423a | #ffa07a | box launcher with a 2 x 2 pod |
| Yellow Tazer | #e0b52a | #fff27a | coil tower with spark tips |
| Modifiers | #9a8cff (violet) | #d6ceff | floating rings around a short pillar, no weapon |
| Attackers | desaturated greys and rust | per-type accent light | organic-mechanical crawlers |
| Ground | sand #b8a07a to dark #3a3024 | copper traces #c07a3a | |

Colour is never the only signal: each family also has a distinct silhouette (see 6), which matters for colour-blind
players.

## 6. Turrets

All turrets share one structure: a **plinth** (square, 24 units, matches the build footprint), a **body** that never
rotates, and a **head** that yaws toward the target. Built procedurally from a few primitives per kind and merged
into one geometry per part, then drawn with `InstancedMesh` (one instanced mesh per kind and part).

| Kind | Body | Head | Firing look |
|---|---|---|---|
| Blue Cannon | Thick octagonal drum | Two short barrels with recoil | Barrel kick 3 units, muzzle flash disc, tracer shell |
| Green Laser | Thin tripod mast | Faceted lens that spins slowly | Straight beam cylinder with a bright core, lens flashes |
| Red Rocket | Armoured box | 2 x 2 tube pod that also pitches up | Rocket meshes with a smoke trail (instanced puffs) |
| Yellow Tazer | Stacked copper coils | Three prongs | Jagged arc (regenerated polyline each shot), coil glows |
| Modifiers | Short pillar | 1 to 2 rings orbiting, colour by effect | Soft pulse on the ground showing their 80 or 130 range |

**Upgrades are visible:** each of damage, range and rate adds a small detail per level:
- damage: the barrel or lens grows and gets brighter trim,
- range: an antenna or sensor dish on the body grows taller,
- rate: small cooling fins appear around the body and spin faster.
Max damage (combo-ready) shows a thin gold ring around the plinth, so combo partners can be read at a glance.

**Specials:**
- Freak-out: during the 3 s warning the turret shakes and its glow flickers; during the 5 s it glows white hot with
  heat shimmer and the head spins faster.
- Holding pattern: up to 4 rocket meshes visibly circling above the Red.
- Laser chain: thin dotted light threads between linked Greens, brightening when a chain fires.

## 7. Attackers

Nine types, identical stats (spec section 3), each with an original procedural look. Low poly (under 200 triangles),
one instanced mesh per type, animation done in the vertex shader from a per-instance phase (no skeletons).

| Type | Look | Motion |
|---|---|---|
| 0 | Round shell beetle | Rolls, no rotation along the path (as in the spec) |
| 1 | Six-legged crawler | Leg wave |
| 2 | Hover disc | Bobs, no path rotation |
| 3 | Segmented worm (3 segments) | Segments trail along the path |
| 4 | Spiky urchin | Spines pulse |
| 5 | Wedge tank | Treads scroll |
| 6 | Floating eye with fins | Bobs, no path rotation, eye tracks nearest turret |
| 7 | Mantis walker | Two-step gait |
| 8 | Armoured slug | Squash and stretch |

- **HP bar:** a flat billboard above each attacker (instanced quad), only shown when damaged, same as now.
- **Poison/slow:** a green drip particle and a tint on the shader; speed already shows the effect.
- **Hit:** a 60 ms white flash on the instance colour.
- **Death:** splits into 4 to 6 debris chunks (shared instanced debris mesh) that bounce on the slab and fade, plus a
  "+$n" text billboard rising as now. Black-holed attackers are stretched toward the hole instead.
- **Scale with waves:** attackers grow up to 20% larger over the waves so late waves feel heavier. Purely visual.

## 8. Combos

Combos are the spectacle of the game and deserve a short camera-free moment of their own (no camera shake by
default; shake is a setting, off for accessibility).

- **Linking:** when a combo fires, beams of the lead colour shoot from each partner into the lead before the effect.
- **Nuke:** a fat rocket arcs high, then a white flash, a ground-hugging shockwave ring and a mushroom made of
  instanced smoke puffs. Brief bloom spike.
- **BFG / Rocket BFG:** a slow plasma ball (emissive sphere with a noise shader) that throws laser arcs on its way.
- **Landmines and cluster bombs:** a mine disc sinks into the road and blinks; clusters fly out as small sparks.
- **Poison gas rocket:** a low green cloud (instanced soft sprites) that drifts along the road.
- The combo name appears as a floating 3D text billboard above the lead, as in the current text atlas.

## 9. Overlays and UI in 3D

| Overlay | 3D design |
|---|---|
| Range ring | Decal on the ground (shader ring, follows the road dip), not a floating circle |
| Placement ghost | Translucent turret with a green or red plinth; blocked cells show a red hatch decal |
| Selection | Animated corner brackets around the plinth plus the range decal |
| Combo lines | Thin glowing arcs between eligible partners, lifted 6 units above the ground |
| Firing cones | Ground decal wedge |
| Join line (Targeter) | Light thread from turret to target turret |

The DOM HUD (`src/ui`) stays as is. `setViewInsets` keeps working: the camera frames the field inside the insets.

## 10. Performance budget

Same budget as now (300 attackers, 150 turrets at 8x) on top of the sim budget.

- Draw calls: target under 60 per frame (about 9 attacker types + 8 turret kinds x 3 parts + effects + ground + post).
- Everything dynamic stays instanced; instance matrices and colours rewritten each frame, as `batches.ts` does now.
- No per-entity `Object3D`, no per-frame allocation, particle pool stays capped (`particles.ts`).
- Shadows only from turrets and attackers; projectiles and effects never cast.
- Quality presets: Low (no shadows, no bloom), Medium (default), High (shadows 4096, extra particles).

## 11. How it fits the code

- The simulation, `src/types.ts` and the renderer API do not change. A 3D renderer implements the same public methods
  as `Renderer.ts`, so `main.ts` can pick 2D or 3D from a setting (stored via `src/ui/storage.ts`).
- Suggested modules: `camera3d.ts`, `terrain3d.ts`, `meshes.ts` (procedural geometry per kind), `instancing.ts`,
  `effects3d.ts`, `post.ts`. `particles.ts` and `util.ts` can be shared.
- `EffectComposer`, `RenderPass` and `UnrealBloomPass` ship inside `three/examples/jsm`, so bloom needs no new dependency.
- The demo page gets a 3D variant (`/render3d-demo.html`) driven by the existing `DemoGame`.

## 12. Suggested order of work

1. Camera, slab, lit ground and road channel, picking (game playable with the 2D sprites laid flat).
2. Turret meshes with yawing heads and the colour language; overlays as ground decals.
3. Attacker meshes and vertex animation, hit and death effects.
4. Projectiles and beams, then bloom and shadows with quality presets.
5. Combos and specials.
6. Top-down toggle, settings, performance pass against the budget, browser check on desktop and tablet.

## Open questions for the owner

- Should 3D replace the 2D renderer or live next to it as a setting? (This proposal assumes a setting.)
- Is optional camera rotation wanted, or should the view always face north like the original?
- Is the "circuit board diorama" mood right, or is a different setting preferred (for example sci-fi metal or desert)?
