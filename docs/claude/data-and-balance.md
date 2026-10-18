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
- **Piercing laser ([NEW], approved deviation):** the Green's own shot carries its leftover energy through attackers on a straight line (`SPEC.md` 4.1). The Green numbers and the chain x1.25 stay original; tune the beam half-width (`LASER_WIDTH` in `src/game/weapons.js`) if it is too strong.
- **Late-game curve ([NEW], approved deviation):** after `WAVES.lateWave` (100) HP growth and bounty follow `WAVES.lateGrowthFactor` and `WAVES.lateBountyGrowth` (`src/data/rules.js`, used by `waveHp` / `waveBounty` in `src/game/Attacker.js`). Waves 1 to 100 stay original; tune these two numbers, not the original growth.

## Balance targets

- New weapons: within about 0.7x to 1.3x of the best original at equal spend, in their niche (Sniper long-range single target, Fusion sustained single target, Railgun groups on straight road). Support turrets must be useful, not mandatory.
- New combos: damage per recharge-second near original combos with a similar turret count.
- Difficulty: wave reached Easy > Medium > Hard > Extreme; Extreme around 30 to 50% of Medium.
- New weapons unlock roughly between waves 120 and 200 on Medium.

Use the `balance-pass` skill. Always record before/after numbers and update `SPEC.md` section 9.

## Latest balance pass

Rerun everything with `node scripts/balance.mjs [dps|combos|difficulty|unlock|late|all]` (about 1 minute, headless, fixed seeds). Informational only; `sim-test` and `combo-test` stay the pass/fail gates.

- **Weapons** (single turret at equal spend, versus the best original, no freak-out): Sniper 0.72 to 0.75 on a near target and 1.0 to 1.2 when range 320+ is required; Fusion 1.05 to 1.09 on a sustained single target (about 0.3 on a moving stream); Railgun 1.09 on a head-on straight stretch (about 0.2 beside the road). Blue and Yellow average about 3.4x higher with freak-out (about 12% uptime), which is an original mechanic and not counted.
- **Ladders** were cut from about 115k to 64k (Sniper), 95k to 64k (Fusion) and 126k to 79k (Railgun) for a maxed turret. Lifetime cash is only about 10 x wave x (wave + 1) / 2 (72k by wave 120), so old ladders were out of reach.
- **Combos** (damage of one combo per recharge-second, marching stream): Napalm 15 M/s (Nuke 42 M, Big Landmine 7.9 M), Tazer Rockets 3.3 M (Laser Rocket 3.4 M, Cluster Bomb 5.3 M), Shockwave 5.2 M and Tazer BFG 6.0 M (BFG 5.3 M).
- **Difficulty** (greedy bot, maps 1, 4, 9): Easy 108, Medium 74, Hard 53, Extreme 29 (ratios 1.45 : 1 : 0.71 : 0.39).
- **Unlocks**: a bot that builds Nuke or BFG clusters dies around wave 105 to 129, so 1,200 to 1,600 kills (waves 121 to 161) is the reachable late game; the old 2,000 was not.
- **Late-game curve** (Medium, combo bot `late` report: Green+Red+Blue clusters, damage first, seeds 11 to 13; this bot
  matches a strong human who hit the wall at wave 122). Before: wall at about 127 (129 / 129 / 122 on maps 1, 4, 9), the bot
  is cash-limited (at wave 120 it owns 120 of 370 upgrade levels). With the original HP curve even 100x bounty plus damage
  modifiers stops at about 143 (ladders and field space cap damage), so money alone cannot fix it. Variants tried after
  wave 100 (mean of maps 1, 4, 9, seed 11): growth 1.10: 133; 1.06: 156; 1.05: 169; 1.04: 193; 1.03: 226; bounty x1.08 only: 134;
  **growth 1.05 + bounty x1.03: 181** (chosen). After: Easy 260, Medium 180, Hard 86, Extreme 39 (Hard and Extreme mostly
  die before wave 100, so they barely change); Easy : Medium stays 1.45. Greedy bot (`difficulty`) unchanged: 109 / 74 / 53 / 29.
  Damage modifiers add about 10 waves on top of the combo bot (189 to 195 on maps 1 and 4).
- **Traps for balance work**: a combo only repeats when all partners are idle at the moment the lead is ready (partners with a target fire a normal shot first), so measure one combo per run as the script does. Nuke is about 5x any other combo per second (original, frozen).
