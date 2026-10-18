# Changelog

Every task adds a line under **Unreleased** (what changed and why). Releases move them under a version heading.
See [docs/claude/documentation.md](docs/claude/documentation.md).

## Unreleased

### Removed
- Dead code: unused imports, variables, parameters, exports and unreachable branches across `src/` and `scripts/`,
  among them the `rail`/`sniper` projectile cases in the renderer (both are beams), the never-set ghost angle, the unused
  `KEYS`, `FX_UNITS`, `lerp` and `TURRET_COLORS` exports, the `.is-off` button style and the unread `dbg` flag in `balance.ts`.
  `tsconfig.json` now sets `noUnusedLocals` and `noUnusedParameters`, so new dead code fails `npm run typecheck`.
  No gameplay change. Docs: `docs/claude/testing.md`, `docs/claude/gotchas.md`.

### Changed
- The codebase is now TypeScript with `strict` on (was plain JavaScript): every `src/` file, the test scripts and the
  Vite configs are `.ts`. Shared contract types live in the new `src/types.ts`; `npm run typecheck` runs `tsc`, and
  `npm run build` / `build:single` type-check first. The tests still run without a build step (`node scripts/sim-test.ts`,
  Node 22.18+ type stripping), so only erasable syntax is allowed. New dev dependencies: `typescript`, `@types/three`,
  `@types/node`. The inline demo scripts moved to `src/render/render-demo.ts` and `src/ui/ui-demo.ts`. No gameplay change.
  Docs: `CLAUDE.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `README.md`, all `docs/claude/*.md`, the skills in `.claude/skills/`.

### Added
- Two extra firing cone widths: Tight 60 and Pinpoint 30 degrees. D now cycles All around, Wide 180, Medium 90, Tight 60,
  Narrow 45, Pinpoint 30 (new `directional.mode` values `tight` and `pinpoint`; the old values and saves are unchanged).
  Docs: `SPEC.md` section 5, `ARCHITECTURE.md`, `docs/claude/testing.md`.
- The selected-turret panel can be moved: drag its header (mouse or touch) so it no longer covers the road, double-click
  or double-tap the header to dock it top right again. The position is kept on screen between the top bar and the build
  rack and saved in the new setting `panelPos`. Docs: `docs/claude/ui.md`, `SPEC.md` §8, How to play.
- Tabbed selected-turret panel (General, Upgrades, Combos, Freakout), modelled on the original game's panel so it stays
  short. New Combos tab: combos fired and assisted, partners in range, time until the next combo, the recipes with the
  partners still missing, and the last 5 combos. Backed by new turret fields `combosFired`, `combosAssisted` and `comboLog`
  (saved), the read-only `game.comboPreview(id)`, and `partnerIds` on the `combo` event.
- README section "About this project": a from-scratch, AI-assisted reimplementation of Onslaught 2, why it was made,
  and the reference material used (screenshots and the game on the Internet Archive).
- Selected-turret panel always shows freak-out status for Cannon and Tazer (now in the Freakout tab), with upgrade progress toward the
  requirement ("Freak-out at 4 dmg + 4 rate (2/4, 1/4)") before they become eligible, so it is visible that they support it.
- `scripts/balance.mjs` (`dps`, `combos`, `difficulty`, `unlock`, `late`, `all`).
- Docs-first policy: `docs/claude/documentation.md` (which doc to update per change, writing style), rule 0 in `CLAUDE.md`,
  docs-first and docs-after steps in every skill, doc requirements in agent briefs.
- `README.md`, `CONTRIBUTING.md` and this changelog for human contributors.
- Target modes "oldest" (spawned first) and "newest" (spawned last).
- Setting "Pause when tab is hidden" (default on). An auto-paused game resumes when the tab is visible again; a manual pause does not.
- Full-screen pause overlay so the paused state is clearly visible.
- Layered agent docs: `CLAUDE.md` (hard rules and pointers), `docs/claude/` area guides, 7 runbook skills in `.claude/skills/`.

### Changed
- Linked lasers pierce (approved deviation from the original): the Green's shot total (own damage plus chain bonus) is
  energy spent along a straight line through its target, half-width 4 (Railgun 8). Each attacker with HP at most the
  remaining energy dies and costs its HP; the first stronger one takes the rest and stops the beam. Before, overkill was
  wasted. Combos that use the laser chain are unchanged. Balance bots (greedy and combo late report) moved only within
  noise, because late walls are attackers far stronger than one shot. New `pierceLaser` in `src/game/weapons.js`,
  sim-test checks (c) pierce. Docs: `SPEC.md` 4.1, `docs/claude/simulation.md`, `docs/claude/data-and-balance.md`,
  `docs/claude/testing.md`, `README.md`, How to play, Laser blurb.
- Late-game wall softened (approved deviation from the original after wave 100; waves 1 to 100 unchanged): HP growth per
  wave after wave 100 is 1 + (growth - 1) x 0.4 (Medium x1.05 instead of x1.125) and bounty is round(wave x 1.03^(wave - 100)).
  Before, even unlimited money stopped at about wave 143 and a strong combo player at about 125; now the strongest bot
  reaches about 180 on Medium. New `waveBounty()` in `Attacker.js`, `WAVES.lateWave` / `lateGrowthFactor` / `lateBountyGrowth`,
  `node scripts/balance.mjs late`, sim-test checks (late). Docs: `SPEC.md` sections 3 and 9, `docs/claude/data-and-balance.md`.
- Attackers no longer walk single file on the road centreline: each one weaves gently from side to side, up to 8 units
  off centre (`WEAVE` in `src/data/rules.js`), like in the original where they were spread over the road. The offset is
  a pure function of progress with per-attacker phases from `game.rng` (new optional attacker field `weave`), so saves and
  Shockwave knockback stay consistent; `Path.place` takes an optional sideways offset and turns it smoothly through
  corners. Turrets aim at the offset position. Docs: `SPEC.md` section 3, `ARCHITECTURE.md`, `docs/claude/simulation.md`,
  `docs/claude/testing.md`.
- Mines and two combo recipes now match the original game (checked against its bytecode): mines have no limit and no
  lifetime (removed our 12 per turret cap and 60 s expiry), land with a -5..+4 offset and check for attackers every 150 ms,
  so the road fills with mines over a long game. Sparky Landmine needs only Blue + Yellow (a ready Red is also used);
  Rocket BFG needs 2 Red but uses and recharges only 1. New optional recipe field `takes`. Docs: `SPEC.md` §6,
  `docs/claude/simulation.md`, `docs/claude/data-and-balance.md`, `docs/claude/gotchas.md`, `docs/claude/testing.md`.
- Balance pass on new content only (originals untouched), measured with the new `scripts/balance.mjs`:
  Sniper, Fusion and Railgun ladders rebuilt so they are reachable with real income (about $72K by wave 120) and land at
  0.7x to 1.3x of the best original in their niche; Targeter cheaper; Combo-only $3,000; new weapons unlock at
  1,200 to 1,600 kills; Napalm, Tazer Rockets and Shockwave buffed, Tazer BFG nerfed; Hard HP growth 1.165, Extreme 1.25
  (waves reached about 1.45 : 1 : 0.71 : 0.39 for Easy : Medium : Hard : Extreme). Details in `docs/claude/data-and-balance.md`.

### Fixed
- The firing cone (D / Shift+D) is now drawn. It already restricted targeting, but the renderer never showed it, so
  changing it looked like it did nothing. Selected and hovered weapons (and all weapons with R) show the cone as a wedge
  from their acquisition origin (a joined Targeter's position and range), with the rest of the range ring dimmed;
  every weapon with a cone also gets a small aim tick on its base. The render demo has a coned Rocket turret.
  Docs: `ARCHITECTURE.md`, `docs/claude/rendering.md`, `docs/claude/gotchas.md`.
- Freak-out text matched neither the code nor the tests: the panel said "x3 dmg x4 rate", but the bonuses are added to the
  multiplier sum (x4 damage, x5 rate without modifiers). The panel now shows "+300% dmg +400% rate", and the Freakout tab hint
  and the How to Play text use the real numbers from `FREAKOUT`. How to Play also no longer says it needs full upgrades
  (it needs 4 damage + 4 rate). The SPEC wording is clarified; the numbers are unchanged.
- After switching tabs the game stayed paused, so the countdown stopped, and Send wave still paid the early bonus without spawning anything (repeatable for free cash). Send wave is now refused and disabled while paused.
- HUD indicators (PAUSED, focus fire badge, mode hint) never appeared: `show()` cleared the inline display, which fell back to the CSS `display: none`. They now pass an explicit display.
- Focus fire shows a reticle on the target (`state.focusId`).
- Mines blink only when armed (`armed` flag on mine projectiles).
- Modifier icons are drawn on top of the dish so all 7 are readable.
- The game auto-pauses when the tab is hidden (after autosaving).
- Homing projectiles no longer chase attackers that a black hole is swallowing.
- Tazer BFG fires `sparks.qty` sparks per tick instead of one.
- Sharper turret sprites (atlas at 8 px per world unit).
- Settings checkboxes toggle when their label is clicked; turrets count their own kills.
- Frame loop in `main.js` survives an exception: it logs each new message once and pauses the game instead of stopping.
- Missing WebGL no longer leaves a blank page: a message is shown instead.
- Holding Esc no longer toggles the game menu repeatedly (key auto-repeat is ignored).
- Quitting to the menu clears the renderer (`setGame(null)`), so the old field is not left behind.
- Autosave no longer stores `paused: true` when the pause came from the open Esc menu.
- Audio resumes from any non-running state, which fixes silence after an iOS interruption.
- Turret icon and beam batches have caps, so a huge game cannot overflow them.
- Input validation for build and move coordinates and for `setWaveInterval` (fails unless a finite number >= 1000).
- The default game seed is a fixed constant instead of `Math.random()`; `src/main.js` passes a random seed for real games.

### Security
- `Game.deserialize` validates the save (version, arrays, caps, unknown turret kind), throws `Error('Invalid save: ...')`
  and ignores `__proto__`, `constructor` and `prototype` keys.
- `getSettings()` drops stored values whose type does not match the defaults.
- Upgraded vite 5.4.10 to 8.3.4 and vite-plugin-singlefile to 2.3.4, which fixes the dev-server advisories (esbuild
  GHSA-67mh-4wv8-2f99 and the vite advisories `npm audit` reported); `npm audit` now reports 0 vulnerabilities. New
  requirement: Node ^20.19.0 or >=22.12.0 (`engines` in `package.json`, noted in `README.md` and `CONTRIBUTING.md`).

### Docs
- Review corrections so docs match the code: `ARCHITECTURE.md` (App constructor, projectile kinds, `move` event, upgrade payload,
  `comboColor`, new commands, deserialize errors, renderer extras, settings), `SPEC.md` (Fusion ramp is linear, early-wave bonus,
  controls table, maps location), `docs/claude/simulation.md`, `rendering.md`, `gotchas.md`, `ui.md`, `testing.md`,
  `.claude/skills/balance-pass/SKILL.md`, demo config headers, `.gitignore` (`dist-render-demo/`).

## 0.1.0 (2026-10-17)

### Added
- First playable version: three.js renderer with procedural art, full simulation (waves, 16 turrets, modifiers,
  targeting, laser chains, holding pattern, freak-out, poison), all 20 combos, menus, HUD, keyboard and touch input,
  autosave, high scores, settings, synthesized sound, Sandbox mode, 4 difficulties, single-file build.
