# Changelog

Every task adds a line under **Unreleased** (what changed and why). Releases move them under a version heading.
See [docs/claude/documentation.md](docs/claude/documentation.md).

## Unreleased

### Changed
- Balance pass on new content only (originals untouched), measured with the new `scripts/balance.mjs`:
  Sniper, Fusion and Railgun ladders rebuilt so they are reachable with real income (about $72K by wave 120) and land at
  0.7x to 1.3x of the best original in their niche; Targeter cheaper; Combo-only $3,000; new weapons unlock at
  1,200 to 1,600 kills; Napalm, Tazer Rockets and Shockwave buffed, Tazer BFG nerfed; Hard HP growth 1.165, Extreme 1.25
  (waves reached about 1.45 : 1 : 0.71 : 0.39 for Easy : Medium : Hard : Extreme). Details in `docs/claude/data-and-balance.md`.

### Added
- Selected-turret panel always shows a freak-out chip for Cannon and Tazer, with upgrade progress toward the
  requirement ("Freak-out at 4 dmg + 4 rate (2/4, 1/4)") before they become eligible, so it is visible that they support it.
- `scripts/balance.mjs` (`dps`, `combos`, `difficulty`, `unlock`, `all`).
- Docs-first policy: `docs/claude/documentation.md` (which doc to update per change, writing style), rule 0 in `CLAUDE.md`,
  docs-first and docs-after steps in every skill, doc requirements in agent briefs.
- `README.md`, `CONTRIBUTING.md` and this changelog for human contributors.
- Target modes "oldest" (spawned first) and "newest" (spawned last).
- Setting "Pause when tab is hidden" (default on). An auto-paused game resumes when the tab is visible again; a manual pause does not.
- Full-screen pause overlay so the paused state is clearly visible.
- Layered agent docs: `CLAUDE.md` (hard rules and pointers), `docs/claude/` area guides, 7 runbook skills in `.claude/skills/`.

### Fixed
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

## 0.1.0 (2026-10-17)

### Added
- First playable version: three.js renderer with procedural art, full simulation (waves, 16 turrets, modifiers,
  targeting, laser chains, holding pattern, freak-out, poison), all 20 combos, menus, HUD, keyboard and touch input,
  autosave, high scores, settings, synthesized sound, Sandbox mode, 4 difficulties, single-file build.
