# OnSlaught 3

The free successor of OnSlaught2.26, in `onslaught3/` of the same repository. It started as a copy of 2.26 (with all its
2026 improvements) and may change any rule: new enemies, mutators, new numbers. OnSlaught2.26 in the repository root stays
the faithful remake; never change files outside `onslaught3/` for OnSlaught 3 work (except the `*:os3` npm scripts).
Vite + TypeScript (strict, ES modules, no framework) + three.js 0.160.0. Node 22.18+ runs the `.ts` tests directly (type stripping).

## Hard rules

0. **Docs first, docs after.** Before coding, update the doc that describes the change (intent). After coding, correct it to match what was built and add a `CHANGELOG.md` entry. **A task without doc changes is not done.** Which doc to touch: `docs/claude/documentation.md`.
1. **Layers:** `src/data` (numbers) <- `src/game` (pure simulation) <- `src/render` (three.js, read-only view) and `src/ui` (DOM, input, storage, audio).
   `src/game` never touches DOM, `window` or three.js and must run in Node. `src/render` never mutates game state.
2. **Contract:** `ARCHITECTURE.md` defines the state, commands, events and renderer API. Adding optional fields is fine (document them there in the same change). Renaming or removing anything needs the user's OK.
3. **No frozen numbers:** unlike 2.26, every rule and number may change, including the ones marked [ORIG] in `SPEC.md` (that mark now only says where a rule came from). Every rule change updates `SPEC.md` in the same change and is measured with the balance scripts.
4. **Originality:** all code, art and sound are original. Never add the original SWF, decompiled code, or copied or imitated sprites, logos or sounds. Art is procedural, sound is synthesized. No asset files without asking (approved: the app icons in `public/icons/`, an original SVG and PNGs generated from it by `scripts/make-icons.ts`).
5. **Determinism:** simulation randomness only through `game.rng`; `serialize()` then `Game.deserialize()` must continue identically.
6. **No em dash characters** anywhere: code, comments, UI text, docs.
7. **Storage** only through `src/ui/storage.ts` (prefix `os3.`, try/catch), so OnSlaught 3 never touches 2.26 saves.
8. **No new dependencies** without asking.
9. **Typed:** all source is `.ts` with `strict` on. `npm run typecheck` must pass. Only erasable syntax (no `enum`, `namespace` or parameter properties) so Node can strip types; import with the `.ts` extension. Shared shapes live in `src/types.ts`; avoid `any`.

## Done means

- Docs updated (intent before, result after), `CHANGELOG.md` entry under Unreleased, docs listed in the report or commit message.
- `node scripts/sim-test.ts` and `node scripts/combo-test.ts` pass, with new checks for new mechanics.
- `npm run typecheck` passes (strict, no new `any` without a comment).
- `npm run build` succeeds.
- Visual or UI changes have been looked at in a browser with no console errors; otherwise say so explicitly.
- Budget: simulation under 4 ms per frame at 8x with 300 attackers and 150 turrets; rendering uses instanced batches only.

## Commands

Run from the repository root (OnSlaught 3 shares `node_modules`):

```bash
npm install
npm run dev:os3              # http://localhost:5326 (demos: /render-demo.html, /ui-demo.html)
node onslaught3/scripts/sim-test.ts
node onslaught3/scripts/combo-test.ts
npm run typecheck:os3        # tsc -p onslaught3, strict, no emit
npm run build:os3            # typecheck, then onslaught3/dist/
npm run build:os3:single     # onslaught3/dist-single/index.html (one file)
```

Port 5326 busy? Use `npx vite --config onslaught3/vite.config.ts --port 5327` and stop it afterwards.

## Read on demand (docs/claude/)

| When you work on | Read |
|---|---|
| Simulation, waves, turrets, targeting, combos | `docs/claude/simulation.md` |
| three.js view, art, camera, effects | `docs/claude/rendering.md` |
| HUD, menus, input, touch, saving, audio | `docs/claude/ui.md` |
| Numbers, balance, what is original vs new | `docs/claude/data-and-balance.md` |
| Tests, browser checks, builds | `docs/claude/testing.md` |
| Splitting work over several agents | `docs/claude/multi-agent.md` |
| Known quirks and traps | `docs/claude/gotchas.md` |
| Which doc to update, doc style | `docs/claude/documentation.md` |

Rules and numbers: `SPEC.md`. Interfaces: `ARCHITECTURE.md`. Humans: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.

## Skills (runbooks in .claude/skills/)

`add-turret`, `add-combo`, `add-map`, `balance-pass`, `verify-in-browser`, `release-build`, `delegate-work`.

## Git

OnSlaught 3 lives in `onslaught3/` on the same branch as 2.26. Commit docs together with the code they describe. The coordinator commits; worker agents do not commit or branch unless their brief says so.
Never commit `node_modules/`, `dist*/` or `*.swf`.
