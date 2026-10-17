# Data and balance (`src/data/`)

| File | Contents |
|---|---|
| `maps.js` | 10 maps (9 original layouts plus the tutorial): waypoints and base top-left corner in the 720 x 450 field. |
| `turrets.js` | 16 turret kinds: cost, base stats, upgrade ladders `[{cost, value}]`, specials, unlock kills, hotkeys; constants (sell 70%, move $500, footprint 44, combo range 70, freak-out, poison). |
| `combos.js` | 20 recipes per lead colour, checked top to bottom: `needs`, optional `exact`, optional `takes` (partners used, defaults to `needs`), `recharge`, `fx`. Blast radii. Mine settings (`MINE`: sample step, travel speed, trigger radius, jitter, check interval). |
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

## Latest balance pass

Rerun everything with `node scripts/balance.mjs [dps|combos|difficulty|unlock|all]` (about 1 minute, headless, fixed seeds). Informational only; `sim-test` and `combo-test` stay the pass/fail gates.

- **Weapons** (single turret at equal spend, versus the best original, no freak-out): Sniper 0.72 to 0.75 on a near target and 1.0 to 1.2 when range 320+ is required; Fusion 1.05 to 1.09 on a sustained single target (about 0.3 on a moving stream); Railgun 1.09 on a head-on straight stretch (about 0.2 beside the road). Blue and Yellow average about 3.4x higher with freak-out (about 12% uptime), which is an original mechanic and not counted.
- **Ladders** were cut from about 115k to 64k (Sniper), 95k to 64k (Fusion) and 126k to 79k (Railgun) for a maxed turret. Lifetime cash is only about 10 x wave x (wave + 1) / 2 (72k by wave 120), so old ladders were out of reach.
- **Combos** (damage of one combo per recharge-second, marching stream): Napalm 15 M/s (Nuke 42 M, Big Landmine 7.9 M), Tazer Rockets 3.3 M (Laser Rocket 3.4 M, Cluster Bomb 5.3 M), Shockwave 5.2 M and Tazer BFG 6.0 M (BFG 5.3 M).
- **Difficulty** (greedy bot, maps 1, 4, 9): Easy 108, Medium 74, Hard 53, Extreme 29 (ratios 1.45 : 1 : 0.71 : 0.39).
- **Unlocks**: a bot that builds Nuke or BFG clusters dies around wave 105 to 129, so 1,200 to 1,600 kills (waves 121 to 161) is the reachable late game; the old 2,000 was not.
- **Traps for balance work**: a combo only repeats when all partners are idle at the moment the lead is ready (partners with a target fire a normal shot first), so measure one combo per run as the script does. Nuke is about 5x any other combo per second (original, frozen).
