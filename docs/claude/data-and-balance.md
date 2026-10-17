# Data and balance (`src/data/`)

| File | Contents |
|---|---|
| `maps.js` | 10 maps (9 original layouts plus the tutorial): waypoints and base top-left corner in the 720 x 450 field. |
| `turrets.js` | 16 turret kinds: cost, base stats, upgrade ladders `[{cost, value}]`, specials, unlock kills, hotkeys; constants (sell 70%, move $500, footprint 44, combo range 70, freak-out, poison). |
| `combos.js` | 20 recipes per lead colour, checked top to bottom: `needs`, optional `exact`, `recharge`, `fx`. Blast radii. Mine settings. |
| `rules.js` | Field, waves, difficulties, modes, speeds, target modes, directional cones, score. |

## What may change

- **Frozen ([ORIG] in `SPEC.md`):** Blue, Green, Red and Yellow, the 7 modifiers, the 16 original combos, wave and economy rules, Medium, the 9 original maps. They come from analysis of the original game. Change them only when the user explicitly asks to deviate.
- **Tunable ([NEW]):** Targeter, Sniper, Fusion, Railgun, Combo-only; Napalm Rocket, Tazer Rockets, Shockwave, Tazer BFG; Easy, Hard, Extreme; the early-wave bonus.

## Balance targets

- New weapons: within about 0.7x to 1.3x of the best original at equal spend, in their niche (Sniper long-range single target, Fusion sustained single target, Railgun groups on straight road). Support turrets must be useful, not mandatory.
- New combos: damage per recharge-second near original combos with a similar turret count.
- Difficulty: wave reached Easy > Medium > Hard > Extreme; Extreme around 30 to 50% of Medium.
- New weapons unlock roughly between waves 120 and 200 on Medium.

Use the `balance-pass` skill. Always record before/after numbers and update `SPEC.md` section 9.
