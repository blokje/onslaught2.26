# OnSlaught2.26

A browser tower-defense game. Protect your base from endless waves by building turrets along the road,
upgrading them, boosting them with modifiers and arranging them into combos (nukes, black holes, cluster bombs and more).
It remakes the mechanics of a classic 2007 Flash game, with all-new code, art and sound.

Runs full-window in any modern browser, with zoom and pan. Built for desktop (mouse and keyboard); iPad works in landscape.

## Play

```bash
npm install
npm run dev          # open http://localhost:5226
```

Or build one self-contained file you can double-click:

```bash
npm run build:single # writes dist-single/index.html
```

## What's in it

- **10 maps:** Classic, Incoming, Ells, Looping, Sinus, Puzzle, Squarely, Inspired, Lyne, and a How to Play map.
- **16 turrets:**
  - 4 basic weapons: Cannon, Laser, Rocket, Tazer.
  - 7 modifiers that boost nearby turrets: Ranger, Boom, SpeedEx, RangerEx, Speed, BigBang, BigBangEx.
  - 5 extra weapons: Targeter, Sniper, Fusion, Railgun, Combo-only.
  - Modifiers and extra weapons unlock as your kill count grows.
- **20 combos:** fully upgraded turrets standing close together fire a combined special attack. Which one depends on the colour of the turret that fires first.
- **Specials:** laser chains, a rocket holding pattern, cannon and tazer freak-outs, poison slow.
- **4 difficulties** (Easy, Medium, Hard, Extreme), plus a **Sandbox** mode with unlimited cash.
- **Score** = total kills × total cash spent.
- Saving: the game autosaves and you can continue later. High scores per map and difficulty.

## Controls

| Key | Action |
|---|---|
| 1 to 8, Shift+1 to 8 | Pick a turret to build (click to place, Shift+click keeps building) |
| Q / W / E | Upgrade damage / range / rate (Shift: as far as you can afford) |
| S / M | Sell (70% back) / move ($500) |
| T | Cycle target: nearest, furthest, weakest, strongest, slowest, fastest, oldest, newest |
| L / F / D | Lock target / focus fire on an attacker / directional cone (Shift+D aims at the cursor) |
| J / X | Join a Targeter to a turret / pick a Combo-only colour |
| R / C | Show all ranges / show combo partners |
| Space | Send the next wave now (bonus cash) |
| P, G, I, Esc | Pause, settings, info panel, cancel |
| Mouse wheel, right-drag | Zoom, pan (two fingers on touch) |

## Project docs

| Doc | For |
|---|---|
| [SPEC.md](SPEC.md) | Every game rule and number |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the layers talk to each other |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute (docs first!) |
| [CHANGELOG.md](CHANGELOG.md) | What changed |
| [CLAUDE.md](CLAUDE.md), [docs/claude/](docs/claude/) | Rules and guides for AI agents (useful for humans too) |

## Originality

All code, art (procedural) and sound (synthesized) in this repository are original. Only the game's mechanics and rule
numbers follow the original. The original game files are not part of this project.
