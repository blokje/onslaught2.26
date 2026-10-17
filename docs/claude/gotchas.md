# Gotchas

- **`blackholed` vs `swallowed`:** `blackholed` means the engine stops moving the attacker along the road and it pays $0. `swallowed` (set by the black hole combo) also makes it untargetable. Tests pin attackers with `blackholed`, so targeting checks `swallowed`, not `blackholed`.
- **`comboReady` can be stale within a step.** `combos.js` recomputes readiness (`comboCapable && cd <= 0 && time >= comboNext`) to avoid one partner serving two leads in the same step.
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
