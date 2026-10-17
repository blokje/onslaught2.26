# OnSlaught2.26: game specification (v1)

Source of truth: mechanics and numbers recovered by static analysis of the original `onslaught2.swf`
(internal version string `v.1045-thwack`), checked against the official help pages.
Only rules and numbers are carried over. All code, art and sound in OnSlaught2.26 is new.

Status per item: **[ORIG]** taken from the original, **[SITE]** from the help pages,
**[NEW]** designed for this remake (needs your OK), **[CHOICE]** a decision you made in the Q&A.

---

## 1. Playfield and time

| Item | Value |
|---|---|
| Logical field | 720 × 450 units (the original stage) [ORIG] |
| Road width | 28 units, drawn as a polyline through waypoints [ORIG] |
| Unit speeds | expressed in units per second |
| Rate stat | shots per minute: fire interval (ms) = 1000 / (rate / 60) [ORIG] |
| Rendering | three.js, orthographic top-down, fills the window, zoom + pan [CHOICE] |

## 2. Economy, lives, score

| Item | Value |
|---|---|
| Starting cash | $30 [ORIG] |
| Lives | 10; each attacker reaching the base costs 1 life [ORIG] |
| Kill reward | the attacker's bounty (see waves) [ORIG] |
| Sell refund | 70% of everything spent on the turret (build + upgrades) [ORIG] [SITE] |
| Move turret | $500 [SITE] |
| Score | **total kills × total cash spent**, shown live [ORIG] |
| Black-holed attackers | count as kills but give **$0** bounty [ORIG] |

## 3. Waves and attackers [ORIG]

- A new wave starts every **20 s** (setting; Space sends the next one early).
- Each wave sends **10 attackers**, **700 ms** apart.
- On every new wave: HP × **1.125**, bounty + **$1**. Wave *n*: HP = 10 × 1.125ⁿ, bounty = $n.
  - Wave 50 ≈ 3,600 HP, wave 100 ≈ 1.3 M, wave 150 ≈ 470 M, wave 200 ≈ 170 B.
  - Note: the growth is exponential from wave 1 (the "linear until wave 120" in the pasted text is not what this build does).
- Base speed **60 units/s**, for all attackers.
- **9 attacker types** cycle by wave: type = (wave − 1) mod 9. In this build they differ only in look
  (types 0, 2 and 6 don't rotate along the path). [NEW] proposal: keep identical stats, give each type an original look.
- Slow (poison): speed is divided by the poison value (floor 5 units/s); it recovers +2 units/s every second.

## 4. Turrets

### 4.1 Basic turrets [ORIG]

Build cost, base stats and the upgrade ladders (cost → new value per level).

| | **Blue: Cannon** | **Green: Laser** | **Red: Rocket** | **Yellow: Tazer** |
|---|---|---|---|---|
| Build cost | $10 | $15 | $20 | $50 |
| Damage / Range / Rate | 15 / 130 / 100 | 25 / 100 / 60 | 50 / 200 / 50 | 50 / 70 / 60 |
| Projectile | fast shell (900/s) | instant beam | homing rocket (250/s) | instant spark + poison |
| Default targeting | nearest | nearest | nearest | fastest |
| Damage levels | 9 | 8 | 9 | 7 |
| Range levels | 5 | 10 | 8 | 5 |
| Rate levels | 7 | 9 | 9 | 7 |
| Special | Freak-out | Laser chain | Holding pattern | Poison + Freak-out |

**Upgrade ladders** (cost : value)

- **Blue damage**: 20:30, 50:60, 100:150, 250:400, 600:1200, 1000:3100, 1100:8500, 1200:18400, 1500:46000
- **Blue range**: 30:140, 100:150, 200:165, 500:180, 950:220
- **Blue rate**: 50:110, 150:125, 300:140, 450:160, 950:180, 1000:200, 1450:240
- **Green damage**: 20:50, 50:120, 125:400, 300:1500, 700:3900, 850:9300, 950:19500, 1000:35000
- **Green range**: 15:110, 25:125, 40:140, 65:160, 105:180, 170:205, 275:230, 445:255, 720:285, 1100:320
- **Green rate**: 30:65, 75:70, 180:80, 300:90, 450:105, 600:120, 800:135, 900:160, 1000:190
- **Red damage**: 50:120, 100:350, 200:800, 350:1950, 650:6050, 1200:11500, 1300:27000, 1500:48900, 1500:65000
- **Red range**: 35:210, 80:220, 160:230, 400:250, 900:275, 1100:300, 1300:325, 1500:350
- **Red rate**: 30:60, 60:70, 115:85, 200:100, 340:115, 600:135, 900:155, 1050:180, 1150:210
- **Yellow damage**: 40:75, 80:125, 190:200, 300:800, 600:3500, 1000:11000, 1100:30000
- **Yellow range**: 50:75, 100:85, 300:105, 600:130, 1000:155
- **Yellow rate**: 50:70, 100:80, 225:90, 390:100, 650:120, 1100:150, 1450:180

**Specials**
- **Laser chain (Green)**: a Green links to every other Green inside its *effective* range. When it fires,
  every linked Green that is ready to fire hands its beam over; each link adds its own (recursive) beam damage × **1.25**.
  No chain length cap. The original needs no line of sight.
- **Holding pattern (Red)**: after **3 range + 3 rate** upgrades, the Red keeps up to **4** rockets circling
  in the air that dive at the next target. Selling the turret sends the circling rockets at the weakest attacker within 720.
- **Freak-out (Blue, Yellow)**: after **4 damage + 4 rate** upgrades. About every 40 to 80 s (sooner with more rate
  upgrades) a 3 s warning appears, then for **5 s** the turret gets damage ×3 and rate ×4 (added as multiplier bonuses).
- **Poison (Yellow)**: poison strength = 1 + 9 × (damage-upgrade progress); see the slow rule in §3.

> **Decided:** use the original ladders above (5 to 10 levels per stat).

### 4.2 Modifier turrets [ORIG]

A modifier affects every non-modifier turret whose centre lies within its range (**80**, one upgrade to **130** for $1500).
Effects stack: effective stat = (base + sum of flat bonuses) × max(0.2, 1 + sum of multiplier bonuses).

| Name (original) | Cost | Damage | Range | Rate | Unlocks at |
|---|---|---|---|---|---|
| Ranger (Range Up) | $2,000 | | +100 flat | | 300 kills |
| Boom (Damage Up) | $5,000 | +40% | | | 450 kills |
| SpeedEx (Rate Exchange) | $1,200 | −40% | −10% | +60 flat | 550 kills |
| RangerEx (Range Exchange) | $1,000 | | +100 flat | −25% | 700 kills |
| Speed (Rate Up) | $3,000 | | | +120 flat | 850 kills |
| BigBang (Big Damage Up) | $8,500 | +100% | | | 1,000 kills |
| BigBangEx (Big Damage Exchange) | $3,500 | +100% | −30% | −30% | 1,100 kills |

The 4 basic turrets are available from the start. An "unlock all" switch in settings opens everything [CHOICE].

### 4.3 Turrets that are not in this build

The website lists Targeter, Sniper, Fusion, Railgun and Combo-only (the "Ranger" on the site is the Range modifier above).
The SWF has none of them. You chose "all 16", so these 5 need original designs [NEW]; proposal in §9.

## 5. Targeting

- Original: **nearest**, **weakest** (lowest HP), **fastest**. A turret keeps its target while it is alive and in range [ORIG].
- Your choice adds strongest, furthest (along the path), slowest, oldest (spawned first), newest (spawned last),
  target lock (L), focus fire (F) and
  directional cones (D / Shift+D) [CHOICE].

## 6. Combos [ORIG]

**Requirements**
- Every participating turret must have **damage fully upgraded**.
- Partners must be within **70 units** (centre to centre) of the lead turret.
- The **lead** is whichever eligible turret fires first; its colour picks the combo family.
  Partners must be off cooldown, and they inherit the lead's recharge time as their cooldown.
- If no recipe matches, the lead fires a normal shot.

**Recipes, checked top to bottom** (partners = turrets besides the lead). Damage values are base values,
then scaled by the lead's damage modifiers. Laser terms add the partner Green's chain damage.

| Lead | Combo | Partners | Recharge | Effect |
|---|---|---|---|---|
| Red | **Nuke** | 2 Blue | 7.4 s | rocket, 9 M hit + 60 M huge blast |
| Red | Poison Gas Rocket | 1 Green + 1 Blue | 5 s | rocket, poison cloud (slow ÷2) |
| Red | Laser Rocket | 1 Green | 3 s | rocket that lasers nearby attackers (2 M + chain), 6 × 1 M laser burst on impact |
| Green | Rocket BFG | 2 Red + 1 Blue | 9 s | slow plasma ball: 6.5 M hit, 7.5 M blast, lasers (4.5 M) and rockets (2 M) on the way |
| Green | BFG | 1 Red + 1 Blue | 9 s | slow plasma ball: 5.8 M hit, 7.5 M blast, laser arcs 4.2 M (range 250) |
| Blue | Big Laser Cluster Landmine | 2 Red + 1 Green + 1 Blue | 10.8 s | mine on the road: 10 laser clusters |
| Blue | Big Cluster Landmine | 2 Red + 1 Blue | 8 s | mine: 15 M large blast + 10 × 4.5 M clusters |
| Blue | Big Laser Cluster Bomb | 2 Red + 1 Green | 11.4 s | bomb: 8 laser clusters, 6 M large blast |
| Blue | Big Cluster Bomb | 2 Red | 6.2 s | bomb: 10 × 4.5 M clusters, 8 M large blast |
| Blue | Sparky Landmine | 1 Red + 1 Blue + 1 Yellow | 7 s | mine: 15 M blast + 8 spark clusters (poison) |
| Blue | Sparky Cluster Bomb | 1 Red + 1 Yellow | 5 s | bomb: 8 spark clusters, 7 M blast |
| Blue | Laser Cluster Bomb | 1 Red + 1 Green | 10 s | bomb: 5 laser clusters, 4 M blast |
| Blue | Big Landmine | 1 Red + 1 Blue | 7 s | mine: 15 M large blast |
| Blue | Cluster Bomb | 1 Red | 5 s | bomb: 6 × 3.3 M clusters, 7 M small blast |
| Blue | Landmine | 1 Blue | 7 s | mine on the road within max range: 10 M + 9 M blast |
| Yellow | **Black Hole** | 2 Yellow + exactly 1 Green | 18 s | opens on the road within 90 units; for 3 s it swallows every attacker within 120 (pulled in at 800 units/s, no bounty) |

Mines are placed on points sampled every 4 units along the road, within the lead's maximum range.
Blast radii, measured from the original blast shapes: small 40, medium 60, large 80, huge (nuke) 87.5, BFG 87.5,
poison cloud 110 units [ORIG]. Sizes for placement: turret footprint ≈ 44 × 44, attackers ≈ 17 to 24, base 126 × 82 [ORIG].

**Combos on the website that are not in this build:** Tazer Rockets (Red + Yellow), Napalm Rocket (Red + Red + Blue + Yellow),
Tazer BFG (Yellow + Red + Blue), Shockwave (Yellow + Yellow + Blue + Green). Proposal in §9.

## 7. Maps [ORIG]

Nine maps plus a tutorial layout. Coordinates are waypoint polylines in the 720 × 450 field; the base sits at the given point.

| # | Name | Shape |
|---|---|---|
| 1 | Classic | left entry, the X crossing and top loop (your screenshot) |
| 2 | Incoming | inward square spiral |
| 3 | Ells | interlocking L-shapes |
| 4 | Looping | long curvy figure with a loop |
| 5 | Sinus | flat line with one big spike |
| 6 | Puzzle | path that crosses itself several times |
| 7 | Squarely | nested rectangles |
| 8 | Inspired | symmetric double loop around the centre |
| 9 | Lyne | a single diagonal line (the famous "Lyne" map) |
| T | How to Play | simple U-shape |

The exact waypoint lists have been recovered and will go into the map data file during the build (they are plain coordinates).

## 8. Controls [ORIG + SITE]

| Key | Action |
|---|---|
| 1–8, Shift+1–8 | pick turret to build |
| Q / W / E | upgrade damage / range / rate (Shift = as far as affordable) |
| S | sell (70%) |
| M | move ($500) |
| R | toggle range rings |
| C | toggle combo-in-range display |
| T, L, F, D | targeting mode, lock, focus fire, directional cone [CHOICE] |
| Space | send the next wave now |
| P | pause |
| I | info panel |
| G | settings |
| Esc | cancel build/move |
| Mouse wheel / drag | zoom / pan [CHOICE] |

## 9. Things the original does not have (proposals) [NEW]

**Difficulty** (the original has a single mode):

| | Easy | Medium (= original) | Hard | Extreme (unlockable) |
|---|---|---|---|---|
| HP growth per wave | ×1.10 | ×1.125 | ×1.14 | ×1.16 |
| Start cash | $60 | $30 | $30 | $20 |
| Lives | 20 | 10 | 5 | 1 |
| Wave interval | 25 s | 20 s | 17 s | 15 s |

**Sandbox** (unlockable): $10,000,000 start cash, everything unlocked (the original's own debug mode does exactly this).

**5 extra weapons** (unlock at 1,200 to 2,000 kills):
- **Targeter**: cheap support. "Join" it to a turret (J) and that turret uses the Targeter's position and range for target acquisition.
- **Sniper**: very long range (400+), very slow, huge single hit, prefers the strongest target.
- **Fusion**: short-range beam whose damage ramps up while it stays on the same target.
- **Railgun**: piercing line shot that damages every attacker along the line.
- **Combo-only**: never fires on its own; it only takes part in combos as a wildcard colour you pick.

**4 missing combos**: Tazer Rockets (rocket with chain-stun), Napalm Rocket (burning ground strip on the road),
Tazer BFG (BFG that also poisons), Shockwave (expanding ring that knocks attackers back along the path).
They get recharge and damage values in the same range as the original combos.

**Unlocks** (Extreme, Sandbox, extra weapons) are stored locally. A settings switch unlocks everything [CHOICE].

## 10. Decisions (settled)

1. Upgrade levels: original per-turret ladders.
2. The 5 extra weapons in §9: added as proposed.
3. The 4 missing combos in §9: added as proposed (20 combos in total).
4. Difficulty table in §9: as proposed; Medium is the original game.
5. Laser chain: like the original (no cap, no line of sight).
6. Blast radii: measured from the SWF (see §6).
