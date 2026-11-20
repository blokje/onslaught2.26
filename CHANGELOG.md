# Changelog

Every task adds a line under **Unreleased** (what changed and why). Releases move them under a version heading.
See [docs/claude/documentation.md](docs/claude/documentation.md).

## Unreleased

### Added (2026 roadmap, phase 7: platform)
- Dutch and German: all UI text (HUD, menu, dialogs, How to play, tutorial, tips, Codex, achievements, controls, error
  bubbles, turret blurbs; 534 texts) through `t()` in the new `src/ui/i18n.ts`, with packs in `src/ui/lang/`. Setting
  "Language" (automatic from the browser by default; the page reloads to switch). Proper names stay English. The undo
  tooltip now builds its label from parts (`UndoInfo` in `src/game/Game.ts` gained kind, turret, stat, levels) so it can
  be translated. New sim-test checks (i18n) that fail on any missing or inconsistent translation. Translations written
  with the help of three parallel agents and reviewed for conflicting terms (four harmonised). Checked in Chromium in
  Dutch and German (menu, HUD, panel, Codex, Controls, no text overflowing its button, no console errors) and the
  earlier English checks again. The Dutch and German wording has not been reviewed by a native speaker.
  Docs: `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/gotchas.md`, `docs/claude/testing.md`.
- Save slots and save files: Menu > Saves (also in the in-game menu) shows the autosave and three slots with Load, Save
  here, Delete and Export (a JSON file), and imports a save file (shape-checked, then validated by `Game.deserialize`).
  New storage `os226.slot1..3`, `cleanSaveWrapper`, `App.saveWrapper/loadWrapper`. New sim-test checks (plat). Checked in
  Chromium (save to slot 1, load, export, import the file into a fresh profile, no console errors).
  Docs: `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Gamepad support (standard mapping): the left stick moves a cursor with a crosshair, A clicks, B goes back, X builds
  the highlighted turret, Y/LT/RT upgrade, LB/RB and the D-pad walk the rack or change speed, View sends a wave, Menu
  pauses; listed in the Controls overlay. New `src/ui/gamepad.ts`. New sim-test checks (plat). Checked in Chromium with
  a fake pad (crosshair moves, X builds, A selects, Y upgrades, Start pauses, no console errors); not with a real pad.
  Docs: `SPEC.md` §8, `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Phones: a compact layout below 760 px wide (one-column menu, scrolling build rack, the turret panel as a bottom sheet,
  or a narrow right column on short landscape screens), larger touch targets, portrait support instead of the "rotate"
  notice, and a long press on a rack slot to see a turret's info. Checked in Chromium with iPhone 13 emulation in
  portrait and landscape (no overflow, tap to build, panel placement, long press; the first landscape try showed the
  panel covering the field, fixed) and the desktop scale check. Not checked on a real phone.
  Docs: `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Installable app and offline play (PWA): web manifest, a service worker (pages network-first, other files cache-first)
  registered only in the production build over http(s), and original app icons (`public/icons/icon.svg` plus PNGs from
  the new `scripts/make-icons.ts`; adding these files was approved). Checked with `vite preview` in Chromium: the worker
  activates, the manifest is valid, the menu and a game load offline, no console errors.
  Docs: `CLAUDE.md` rule 4, `README.md`, `docs/claude/testing.md`, `docs/claude/gotchas.md`.

### Added (2026 roadmap, phase 5: motivation)
- Replays: the game logs every player command with its step (`commandLog`, saved with the game, plus `startOpts`), and a
  replay plays the same commands at the same steps, so it ends in exactly the same state. Save replay (file) and Copy
  replay code (gzip + base64url) at game over; Menu > Replays to watch one, with speed and pause only. New
  `src/game/replay.ts`, `src/ui/replayCode.ts`, `game.stepHook`, `game.stepLimit`, optional `AppOptions.replays`.
  The replay test found that `cycleTargetMode` was logged twice (it calls `setTargetMode`); only the outermost command is
  logged now. New sim-test checks (rep). Checked in Chromium: a played game, its code copied, watched from the menu,
  building refused while watching, "exactly as recorded" at the end, no console errors.
  Docs: `ARCHITECTURE.md`, `README.md`, `docs/claude/simulation.md`, `docs/claude/ui.md`, `docs/claude/gotchas.md`,
  `docs/claude/testing.md`.
- Daily challenge: one map, difficulty and seed per UTC day (from a hash of the date), started from a card in the menu,
  with its own top 10 per day (`os226.daily`, last 30 days) and the rank shown at game over. Continue keeps it a daily.
  New `src/ui/daily.ts`, optional `meta.daily` in the autosave. New sim-test checks (mot). Checked in Chromium (card,
  start on the right map, score and rank stored, card shows the best score, Daily Habit earned; that last one failed at
  first because achievements were checked before the score was stored, fixed). Docs: `SPEC.md` §9, `ARCHITECTURE.md`,
  `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Map stars: 1 to 3 stars per map for the selected difficulty (best Normal-mode wave reaching 25, 50, 100), shown in the
  map grid and updated with the difficulty buttons. New sim-test check (mot). Checked in Chromium with stored scores
  (2 stars on Medium, 3 on Hard where expected, no console errors). Docs: `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Achievements: 22 local goals (first kill and combo, Nuke, Black Hole, 10 and 20 combos discovered, freak-out, a fully
  upgraded weapon, all modifiers, 50 turrets, $100K, waves 25/50/100, Hard and Extreme goals, a clean run to wave 30, an
  extra map, every map, a billion points, a daily challenge). Toast and log on earning, an overview in the menu. Sandbox
  never counts for wave, score or cash goals. New `src/ui/achievements.ts`, storage `os226.achievements` and
  `os226.stats`; Reset progress clears them. New sim-test checks (mot). Checked in Chromium (First Blood toast on the
  first kill, stored, listed 1 of 22 in the menu, no console errors).
  Docs: `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.

### Added (2026 roadmap, phase 4: game feel)
- Soft screen transitions: the menu and the HUD fade in, dialogs fade and pop in. None with reduce motion. CSS only.
  Checked in Chromium (dialog focus and reduce-motion checks still pass, no console errors). Docs: `docs/claude/ui.md`.
- Adaptive synthesized music (no audio files): a calm pad in the menu, and in a game layers and tempo follow the pressure
  (attackers on the field, lives lost); silent while paused or after game over. New `src/ui/music.ts`, a third audio bus
  and the setting "Music volume" (default 60%, 0 turns it off). New sim-test checks (feel). Checked in Chromium by
  counting scheduled oscillators (menu, wave, none while paused, no console errors); the music itself was not listened to.
  Docs: `ARCHITECTURE.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Screen shake on big blasts and black holes (setting "Screen shake", default on, never with reduce motion) and a quick
  impact ring on every kill. Presentation only (`R.shake` in the renderer, new `RenderOptions.screenShake`). Checked in
  Chromium that a real Nuke and normal waves run without console errors; the shake itself was checked by code review,
  not on screen. Docs: `ARCHITECTURE.md`, `docs/claude/rendering.md`, `docs/claude/ui.md`.

### Added (2026 roadmap, phase 2: onboarding)
- One-time tips in the coach card: the first leak, few lives left, the first modifier and late-weapon unlocks,
  freak-out, a turret ready for combos, the first combo, and wave 10 without upgrades. Each shows once (stored in
  `os226.hints`), never during the tutorial, closes with Got it or after 12 s. Settings: Tips on/off (`hints`) and Reset
  tips. New `src/ui/hints.ts`. New sim-test checks (onb). Checked in Chromium (tip on the first leak, not repeated,
  stored; no tips during the tutorial; steady highlight with reduce motion; no console errors).
  Docs: `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Interactive tutorial on the How to Play map: 8 steps you play (build, send a wave, upgrade, targeting, a second turret,
  combos) in a coach card with Back, Next and Skip, the target element outlined, texts with your own keys and read out
  for screen readers. First-start banner "New here? Play the tutorial", a Tutorial button in the menu and Replay in
  Settings (setting `tutorialDone`). Wave 1 waits for the player; the first Send restores the normal interval so the
  early bonus stays normal (a first try paid $592, found in the browser check). New `src/ui/tutorial.ts`, coach card in
  the HUD, optional `AppGame.setWaveInterval`. New sim-test checks (onb). Checked in Chromium: banner, full walk-through
  with keys and mouse, no wave before Send, $25 bonus, finish restores waves and hides the banner, no console errors.
  Docs: `SPEC.md` §9, `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/gotchas.md`, `docs/claude/testing.md`.
- Combo Codex (K, the main menu, the in-game menu, or "All combos" in the Combos tab): all 20 recipes per lead colour
  with partners as shape dots, recharge, a "new" badge for [NEW] recipes and the effect, generated from the recipe data
  by `describeCombo` so text and numbers cannot drift apart. Combos you fire are counted over all games (`os226.codex`,
  cleared by Reset progress) and marked as discovered. The shaped colour dot moved to `src/ui/colors.ts` (`colorDot`).
  New sim-test checks (onb). Checked in Chromium (20 recipes from the menu; a real Nuke in Sandbox is counted and shown
  as discovered; K and the Combos-tab link open it; no console errors).
  Docs: `SPEC.md` §8, `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.

### Added (2026 roadmap, phase 3: accessibility)
- Colour shapes, so combos never depend on colour vision alone: red triangle, green circle, blue square, yellow diamond.
  Every weapon and Combo-only shows its shape as a small badge on the map (setting "Colour shapes on the map", default
  on, new optional overlay field `colorSymbols`), and the colour dots in the Combos tab, the Combo-only button and How to
  play use the same shapes. New `src/ui/colors.ts`, icon atlas grown to 4 x 3 for the shapes, badge in the existing icon
  batch. Fixed the render demo's fake turrets, which had no weapon `comboColor`. New sim-test checks (acc). Checked in
  Chromium (render demo, a real game, setting off, no console errors).
  Docs: `ARCHITECTURE.md`, `README.md`, `docs/claude/rendering.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Interface size (80% to 160%) and High contrast in Settings > Accessibility (settings `uiScale`, `highContrast`).
  The docked turret panel now starts below the measured top bar, which wraps at large sizes; before it covered the speed
  and pause buttons there. Checked in Chromium at 1024x640 and 1920x1080 with both ends of the scale (nothing off
  screen, no console errors). Docs: `ARCHITECTURE.md`, `docs/claude/ui.md`, `docs/claude/gotchas.md`.
- Reduce motion and flashes (setting `reduceMotion`, starts on when the system asks for less motion): no pulsing,
  blinking or spinning in the UI, a calm leak cue, and on the map no freak-out jitter or blinking, a steady combo halo
  and dimmer blasts with less debris. New optional `renderer.setOptions({ reduceMotion })` and type `RenderOptions`.
  New sim-test checks (acc). Checked in Chromium with emulated `prefers-reduced-motion` (class set, no infinite
  animations, calm leak cue, no console errors); the calmer blasts were checked by code review and type check only.
  Docs: `ARCHITECTURE.md`, `docs/claude/rendering.md`, `docs/claude/ui.md`, `docs/claude/gotchas.md`, `docs/claude/testing.md`.
- Separate volumes for game effects and interface sounds (settings `sfxVolume`, `uiVolume`), on top of the master volume.
  The audio engine now has two buses before the compressor. New sim-test checks (acc). Checked in Chromium (sliders store
  their values, no console errors); the sound itself could not be listened to here.
  Docs: `ARCHITECTURE.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Keyboard and screen-reader support in menus and dialogs: dialogs are real `role="dialog"` elements that take focus,
  keep Tab inside and return focus on close; arrow keys move through the map grid; a visible focus ring; labelled icon
  buttons and tab panels; a polite live region announces log lines, toasts, wave starts and leaks (at most once per
  second). Checked in Chromium (keyboard-only map choice, focus trap and return, ARIA snapshot, live region, earlier
  checks for the Controls dialog and undo still pass, no console errors). Not checked with a real screen reader.
  Docs: `SPEC.md` §8, `docs/claude/ui.md`, `docs/claude/gotchas.md`, `docs/claude/testing.md`.

### Added (2026 roadmap, phase 1: player information)
- Incoming-wave preview in the top bar: "Wave N" with the HP and bounty of each attacker in the next wave, and a
  tooltip for the next 5 waves. Backed by the new read-only command `game.wavePreview(n?)` (no rng, same formulas as
  spawning; type `WavePreview`). No gameplay change. New sim-test checks (q).
  Docs: `ARCHITECTURE.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Upgrade preview: hovering a stat row in the Upgrades tab shows "now → after one more level" (modifiers and freak-out
  included), and for range a dashed lime ring at the new range on the map. New read-only `game.upgradePreview(id, stat)`
  (type `UpgradePreview`) and optional overlay field `previewRange`; the modifier sum moved into `Game._modSumFor`, shared
  with `_recompute`. No gameplay change. New sim-test checks (q).
  Docs: `ARCHITECTURE.md`, `docs/claude/ui.md`, `docs/claude/rendering.md`, `docs/claude/testing.md`.
- Damage and DPS per turret: the General tab shows "Damage: 4.5M, DPS: 120K" for weapons. New optional turret field
  `damageDealt` (effective damage, overkill not counted, combo damage for the lead; saved, old saves load 0) and the UI
  helper `DpsTracker` (`src/ui/dps.ts`, last 10 s of game time). No gameplay change. New checks in combo-test (damage,
  save) and sim-test (q). Docs: `ARCHITECTURE.md`, `docs/claude/simulation.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- End-of-run report in the game-over dialog: damage dealt, combos fired, game time, sparklines for cash, lives and damage
  per wave, and the top 5 turrets by damage (MVP first). New optional state fields `history` (one record per started
  wave) and `damageTotal`, both saved; old or broken saves load `[]` and 0. The dialog is now normal width.
  No gameplay change. New sim-test checks (q). Checked in Chromium: report, upgrade preview, damage chip, no console errors.
  Docs: `ARCHITECTURE.md`, `docs/claude/simulation.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Auto-send waves (key A, Auto button, setting `autoSend`, default off): after the player starts wave 1, the next wave is
  sent like Space (early bonus included) as soon as the field is clear. New read-only `game.waveActive()`. No rule change.
  New sim-test check (q). Checked in Chromium (waves keep coming at 8x, A toggles, no console errors).
  Docs: `SPEC.md` §8 and §9, `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- Controls overlay and rebindable keys: `?` (or `/`, or Settings > Keys...) lists every control; click a key and press the
  new one (Esc cancels, reserved keys are refused, a used key swaps). Saved in the new setting `keys` (overrides only).
  All key handling now comes from one table, `src/ui/keymap.ts`, which also generates the How to play key list, so help
  and handler can no longer drift apart. Key hints in the HUD follow the bindings. Behaviour change: keys are now matched
  by physical position (`KeyboardEvent.code`), so on AZERTY and similar layouts the defaults sit on the QWERTY positions.
  New sim-test checks (q). Checked in Chromium (rebind, swap, reserved key, persistence, reset, no console errors).
  Docs: `SPEC.md` §8, `ARCHITECTURE.md`, `README.md`, `docs/claude/ui.md`, `docs/claude/gotchas.md`, `docs/claude/testing.md`.
- Optional undo ([NEW] relaxed rule, setting "Relaxed: undo", off by default): U or the Undo button takes back the last
  build or upgrade with a full refund until that turret fires. New `game.undo()`, `game.undoInfo()`, event `undo`,
  `game.markFired(id)` and the saved flag `state.undoUsed`; high scores of such games carry a U mark (`ScoreEntry.undo`).
  The original rules stay the default. New sim-test checks (u). Checked in Chromium (toast with the setting off, build
  undone with full refund, refused after firing, U mark in the high scores, no console errors).
  Docs: `SPEC.md` §8 and §9, `ARCHITECTURE.md`, `README.md`, `docs/claude/simulation.md`, `docs/claude/ui.md`,
  `docs/claude/gotchas.md`, `docs/claude/testing.md`.

### Fixed
- A rate change (rate upgrade, or a rate modifier built or sold nearby) during a combo recharge no longer shortens or
  lengthens it: the lead and partners now always stay quiet for exactly the recipe's recharge (Nuke 7.4 s). Normal shot
  intervals still rescale. New checks in `scripts/sim-test.ts` (d). Docs: `SPEC.md` §6, `docs/claude/simulation.md`.

### Removed
- Dead code: unused imports, variables, parameters, exports and unreachable branches across `src/` and `scripts/`,
  among them the `rail`/`sniper` projectile cases in the renderer (both are beams), the never-set ghost angle, the unused
  `KEYS`, `FX_UNITS`, `lerp` and `TURRET_COLORS` exports, the `.is-off` button style and the unread `dbg` flag in `balance.ts`.
  `tsconfig.json` now sets `noUnusedLocals` and `noUnusedParameters`, so new dead code fails `npm run typecheck`.
  No gameplay change. Docs: `docs/claude/testing.md`, `docs/claude/gotchas.md`.

### Changed
- Upgrade progress on the map is now a ring around each turret instead of 3 bars below it: one segment per upgradable
  stat (clockwise from the top: damage, range, rate; a single stat fills the whole circle), one tick per level, yellow
  while the stat is below max and green at max, with a thin inner arc in the stat colour. The ring stays inside
  `TURRET_SIZE / 2`, so neighbouring turrets never overlap; zoomed far out the ticks merge into a solid arc.
  `RingBatch` gained `arc()` (partial, ticked rings); the `tTop` batch was replaced by `tRing`. No gameplay change.
  Docs: `docs/claude/rendering.md`, `docs/claude/gotchas.md`.
- The codebase is now TypeScript with `strict` on (was plain JavaScript): every `src/` file, the test scripts and the
  Vite configs are `.ts`. Shared contract types live in the new `src/types.ts`; `npm run typecheck` runs `tsc`, and
  `npm run build` / `build:single` type-check first. The tests still run without a build step (`node scripts/sim-test.ts`,
  Node 22.18+ type stripping), so only erasable syntax is allowed. New dev dependencies: `typescript`, `@types/three`,
  `@types/node`. The inline demo scripts moved to `src/render/render-demo.ts` and `src/ui/ui-demo.ts`. No gameplay change.
  Docs: `CLAUDE.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `README.md`, all `docs/claude/*.md`, the skills in `.claude/skills/`.

### Added
- 8 extra maps (`map10` to `map17`, [NEW]): Switchback, Comb, Junction, Perimeter, Staircase, Lightning, Maelstrom and Doorstep,
  each built around one placement idea. They follow the tutorial in `src/data/maps.ts` (optional `extra` flag on `MapDef`)
  and appear in the menu as E1 to E8; the map picker is now a 6 x 3 grid. `scripts/sim-test.ts` checks each one: path from a field edge to the
  base edge, road clear of the base, a 5-turret combo cluster within reach of the road, and a greedy player holding 10 waves on Medium.
  Docs: `SPEC.md` (7a), `ARCHITECTURE.md`, `README.md`, `docs/claude/data-and-balance.md`, `docs/claude/ui.md`, `docs/claude/testing.md`, `.claude/skills/add-map/SKILL.md`.
- GitHub Pages deploy: `.github/workflows/pages.yml` runs `npm test` and `npm run build` (typecheck included) on every push to
  `main` and publishes `dist/` to <https://blokje.github.io/ontslaught2.26/>, so the game is playable from a URL.
  Docs: `README.md`, `docs/claude/testing.md`, `.claude/skills/release-build/SKILL.md`.
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
