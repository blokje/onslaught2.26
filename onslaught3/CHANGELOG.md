# Changelog (OnSlaught 3)

Every task adds a line under **Unreleased**. OnSlaught2.26 keeps its own changelog in the repository root.

## Unreleased

### Added
- Mutators (SPEC.md 11.4): Fast, Tough, No selling and Poor, stackable toggles in the menu, each multiplying the score
  (x1.1 to x1.3). Saved with the game, kept by Continue and Restart, and half of the daily challenges add one. New
  `src/data/mutators.ts`, `src/ui/mutators.ts`, `GameOptions.mutators`, `game.mut`, setting `lastMutators`,
  `balance.ts mutators` (numbers tuned with it: bounty bonuses removed). New sim-test checks (os3) and NL/DE texts.
  Checked in Chromium (toggles, choice kept after reload, Poor starts with $15 on Medium, no console errors).
  Docs: `SPEC.md` §11.4, `ARCHITECTURE.md`, `docs/claude/ui.md`, `docs/claude/testing.md`, `docs/claude/data-and-balance.md`.
- Enemy kinds with strengths and weaknesses (SPEC.md 11.1): Armored (weak to big hits), Shielded (weak to Tazer and
  lasers), Swarmer (pairs), Splitter (splits into Swarmers), Regenerator (stopped by poison) and a Boss every 10 waves;
  mixed waves from wave 5 (11.2). Each kind has a visual cue that also works without colour, and the top bar names the
  kinds of the next wave with a translated explanation. Measured with the greedy bot (11.3): Medium and Hard as in 2.26,
  Easy easier, Extreme harder (a balance pass is still to do). New `src/data/enemies.ts`, `src/ui/enemies.ts`,
  `waveKinds`, `Game._defend`; saves keep kinds and shields, unknown kinds load as normal. New sim-test checks (os3); the
  late-curve test moved from wave 130 to 131 (130 now starts with a Boss). Checked in Chromium (preview names, mixed
  waves and a boss drawn, no console errors). Docs: `SPEC.md` §11, `ARCHITECTURE.md`, `CLAUDE.md`,
  `docs/claude/simulation.md`, `docs/claude/rendering.md`, `docs/claude/ui.md`, `docs/claude/testing.md`.
- OnSlaught 3 created in `onslaught3/` as a copy of OnSlaught2.26 (after its 2026 roadmap phases 1 to 5 and 7): own
  `CLAUDE.md` (no frozen numbers), `SPEC.md` (section 11 for OnSlaught 3 rules), README, storage prefix `os3.`, service
  worker cache `os3-v1`, daily seeds `os3-daily-`, name "OnSlaught 3", dev port 5326 and the root npm scripts `dev:os3`,
  `typecheck:os3`, `build:os3`, `build:os3:single`, `test:os3`. No rule changes yet.

### Fixed
- An active toggle button (`.os-btn.is-on`) under the mouse pointer no longer turns dark with dark text.
