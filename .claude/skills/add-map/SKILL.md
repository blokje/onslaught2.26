---
name: add-map
description: Add a new map to OnSlaught2.26 (waypoints, base position, menu preview, checks). Use when asked to create, import or change a map.
---

# Add a map

**Docs first:** Add the map's line to `SPEC.md` section 7 (name, shape, [NEW]) before editing data.

1. Add an entry to `MAPS` in `src/data/maps.ts`: `{ id, name, base: [x, y], path: [[x, y], ...] }` in the 720 x 450 field (x right, y down). `base` is the top-left corner of the 126 x 82 base. The path should start on or outside a field edge and end at the base.
2. Keep at least one road-free area where 4 to 5 turrets fit within 70 units of each other and within reach of the road, otherwise the big combos cannot be built. Placement rule: turret centre at least 30 units from the road centreline, 44 from other turrets, 16 from the base.
3. The original 9 maps are frozen; new maps are [NEW] and need a line in `SPEC.md` section 7.
4. Check: the menu preview (`src/ui/menu.ts` draws it from data), a headless run (`new Game({ mapId })` and `advance` until the first leak) and the map in the browser (`verify-in-browser`).

**Docs after:** update the map table in `README.md` and `SPEC.md` section 7, add a `CHANGELOG.md` entry.
A task is not done until the docs are touched (see `docs/claude/documentation.md`).
