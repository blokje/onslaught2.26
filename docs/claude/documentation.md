# Documentation: docs first, docs after

Documentation is a first-class part of every change. It serves three readers:
the maintainer debugging at 2am, the next AI agent, and outside contributors.
**A task is not done until the documentation has been touched.**

## The loop

1. **Before you code: write the intent.** Update the doc that describes the thing you are about to change
   (rule, interface, behaviour) so it says what *will* be true. For a new mechanic that is `SPEC.md`;
   for a new field or command it is `ARCHITECTURE.md`; for a new workflow it is the relevant guide or skill.
   If the change is too small for that (a typo fix), the changelog entry in step 3 still applies.
2. **Code against the doc.** If the implementation has to deviate, fix the doc, don't leave it stale.
3. **After you code: record the result.**
   - Correct the docs to match what was actually built (numbers, names, edge cases).
   - Add an entry under `## Unreleased` in `CHANGELOG.md` (what changed, and why, in one or two lines).
   - Add new traps to `docs/claude/gotchas.md`, and remove the ones you fixed.
4. **Report the doc changes.** Every report, PR or commit message lists the docs it touched.
   Commit docs in the same commit as the code they describe.

## Which doc to touch

| You changed | Update |
|---|---|
| A game rule, number or new content | `SPEC.md` (mark [ORIG] or [NEW]), plus `docs/claude/data-and-balance.md` if the tuning rules change |
| State fields, commands, events, renderer API | `ARCHITECTURE.md` (one line per addition) |
| A module's role, a new module, the step order | the area guide: `docs/claude/simulation.md`, `rendering.md` or `ui.md` |
| Tests or verification steps | `docs/claude/testing.md` |
| Something surprising that bit you | `docs/claude/gotchas.md` |
| A repeatable procedure | the matching skill in `.claude/skills/`, or a new skill |
| A hard rule, a new command, a new doc | `CLAUDE.md` (stay under 80 lines: pointers, not explanations) |
| Anything a player or contributor notices | `README.md` (features, controls, how to run) |
| Every task | `CHANGELOG.md` |

## Writing style

- Lead with the answer: what it is, where it lives, what to run. Background comes after.
- Concrete over abstract: file paths, function names, exact numbers, exact commands.
- Short sections, tables for lookups, numbered steps for procedures.
- Keep docs true: a wrong doc is worse than a missing one. Delete outdated text instead of adding "update:" notes.
- No em dash characters.

## Where docs live

| Layer | Loaded | Purpose |
|---|---|---|
| `CLAUDE.md` | always | Hard rules and pointers only, capped at 80 lines |
| `docs/claude/*.md` | on demand | Area guides: how things work, conventions, traps |
| `.claude/skills/*/SKILL.md` | when relevant | Runbooks for repeatable tasks |
| `SPEC.md`, `ARCHITECTURE.md` | on demand | The rules and the interfaces (binding) |
| `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md` | for humans | Overview, how to contribute, history |
