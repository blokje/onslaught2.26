---
name: balance-pass
description: Measure and tune the numbers of OnSlaught2.26's new (non-original) content with headless simulations. Use when asked to balance, tune or check difficulty, weapons or combos.
---

# Balance pass

**Docs first:** Note in `docs/claude/data-and-balance.md` what you are about to measure and why, before changing numbers.

Read `docs/claude/data-and-balance.md` first: original [ORIG] numbers are frozen, only [NEW] content is tuned.

1. Measure before changing anything. Use `scripts/balance.ts` (modes in `docs/claude/testing.md`); to measure something it does not cover, drive `Game` in Node with a fixed `seed`, `mode: 'sandbox'` for cash, `spawnAttacker(wave, hpOverride)` for high-HP targets, `advance(steps)`.
2. Compare at equal spend ($5K, $20K, $80K, $300K) against the best original option in the same niche. Targets are in `data-and-balance.md`.
3. Combos: damage per recharge-second against originals with a similar turret count, measured with the real combo code.
4. Difficulty: greedy bot games on maps 1, 4 and 9 per difficulty; report the wave reached.
5. Change only `src/data/` numbers for [NEW] content. Update `SPEC.md` section 9.
6. Report a before/after table with reasons, plus the measurement tables. `sim-test` and `combo-test` must still pass.

**Docs after:** update `SPEC.md` section 9 with the new numbers, replace the "Latest balance pass" section in `docs/claude/data-and-balance.md` with the new measurements, add a `CHANGELOG.md` entry with the before/after summary.
A task is not done until the docs are touched (see `docs/claude/documentation.md`).
