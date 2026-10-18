# Contributing

Thanks for helping. This project treats documentation as part of the code: **docs first, docs after.**
A change without documentation updates is not finished and will not be merged.

## The workflow

Setup: `npm install` needs Node.js 22.18 or newer (type stripping for the `.ts` tests; Vite 8 needs 22.12+).

1. **Read** [CLAUDE.md](CLAUDE.md) (hard rules, short) and the guide for your area in [docs/claude/](docs/claude/).
2. **Write the intent first.** Update the doc that describes what you are changing:
   game rules and numbers in [SPEC.md](SPEC.md), interfaces in [ARCHITECTURE.md](ARCHITECTURE.md), how a module works in the area guide.
   [docs/claude/documentation.md](docs/claude/documentation.md) has the full "what changed, which doc" table.
3. **Build it** against that doc. If you have to deviate, change the doc too.
4. **Test it.**
   ```bash
   node scripts/sim-test.ts
   node scripts/combo-test.ts
   npm run typecheck
   npm run build
   ```
   For anything visual, play it in the browser (`npm run dev`) and check the console for errors.
   New mechanics need new checks in one of the test scripts.
5. **Document the result.** Correct the docs to what you actually built, add a line under `## Unreleased` in
   [CHANGELOG.md](CHANGELOG.md), and add any surprise you hit to [docs/claude/gotchas.md](docs/claude/gotchas.md).
6. **Commit docs and code together**, and list the docs you touched in the commit message or PR.

## Ground rules

- **Original numbers stay original.** Values marked [ORIG] in `SPEC.md` come from the original game and are frozen.
  New content ([NEW]) can be tuned; see [docs/claude/data-and-balance.md](docs/claude/data-and-balance.md).
- **Everything is original.** No copied or imitated sprites, logos, sounds or code from the original game. Art is drawn
  in code, sound is synthesized. Ask before adding any asset file.
- **Layers stay separate:** `src/data` → `src/game` (pure logic, runs in Node) → `src/render` (three.js, read-only)
  and `src/ui` (DOM, input, storage, audio).
- **TypeScript** (`strict`), ES modules, no framework, no new dependencies without discussing first. Run `npm run typecheck`.
- **No em dash characters** in code, comments, UI text or docs.

## Common tasks

Step-by-step runbooks live in [.claude/skills/](.claude/skills/) and work for humans too:
add a turret, add a combo, add a map, balance pass, verify in the browser, release build.
