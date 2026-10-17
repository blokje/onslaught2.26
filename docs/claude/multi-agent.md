# Multi-agent workflow

The project was built by one coordinator agent and several worker agents running in parallel. Keep using that pattern for anything bigger than a few files.

## Roles

- **Coordinator** (the strongest model): owns `ARCHITECTURE.md`, `SPEC.md`, `src/main.js`, docs and commits. Splits work, writes briefs, validates every report by re-running the tests and checking the browser, integrates, commits.
- **Workers** (cheaper models for the heavy lifting): implement one area inside the files named in their brief. No commits, no branches, no edits outside their scope; they report out-of-scope needs instead.

## Splitting work

- Split by ownership so no two workers edit the same files: data, game, render, ui, or a single module.
- If two pieces must share an interface, the coordinator writes the interface first (in `ARCHITECTURE.md` or a data file), then starts the workers.
- Workers that only change `src/data/` numbers can run next to code workers.
- Give each worker its own dev-server port (5227, 5228, ...) when it needs a browser.

## A good brief contains

1. The project path and which docs to read (`CLAUDE.md`, the relevant `docs/claude/*.md`, `ARCHITECTURE.md`, `SPEC.md`).
2. Exactly which files it may edit, and which it must not touch.
3. The concrete items to do, with the rules or numbers that apply.
4. The docs it must update before and after (per `docs/claude/documentation.md`), and permission to edit them.
5. The verification it must run (tests, build, browser check).
6. What to report: files changed, **docs touched**, contract additions, test output, what was not verified, judgement calls.

## Validating a report

A report is a claim, not proof. A report without doc changes is rejected: send the worker back. Re-run `sim-test`, `combo-test` and the build yourself, read the diff (`git diff --stat`, then the risky files), and check the change in the browser before committing.
