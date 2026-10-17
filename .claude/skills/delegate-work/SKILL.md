---
name: delegate-work
description: Split a larger OnSlaught2.26 task over parallel worker agents on cheaper models and validate their results as coordinator. Use for features touching several layers or more than a few files.
---

# Delegate work

**Docs first:** Write or update the interface and intent docs (`ARCHITECTURE.md`, `SPEC.md`, the area guide) before starting any worker.

Read `docs/claude/multi-agent.md` for roles and brief contents.

1. Plan the split by file ownership (data, game, render, ui, a single module). No two workers edit the same files.
2. If the pieces share an interface, write it first yourself (`ARCHITECTURE.md` or a data file).
3. Start the workers in parallel, on a cheaper model, in the background. Each brief names: docs to read, files it may and may not edit, the items, the verification to run, and what to report. Give each worker that needs a browser its own port (5227, 5228, ...).
4. While they run, do coordinator work that touches none of their files.
5. On each report: re-run `sim-test`, `combo-test` and `npm run build`; read `git diff --stat` and the risky files; check the result in the browser (`verify-in-browser`). A report is a claim, not proof.
6. Integrate, fix small issues yourself, update `SPEC.md` / `ARCHITECTURE.md` / docs, then commit.

**Docs after:** reject any worker report that lists no doc changes. After integrating, correct the docs to what was built and add the `CHANGELOG.md` entry yourself.
A task is not done until the docs are touched (see `docs/claude/documentation.md`).
