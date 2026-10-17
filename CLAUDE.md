# OnSlaught2.26

Browser tower-defense game remaking the *mechanics* of a classic 2007 Flash TD game.
Vite + plain ES modules (JavaScript, no TypeScript, no framework) + three.js 0.160.0.

## Hard rules

0. **Docs first, docs after.** Before coding, update the doc that describes the change (intent). After coding, correct it to match what was built and add a `CHANGELOG.md` entry. **A task without doc changes is not done.** Which doc to touch: `docs/claude/documentation.md`.
1. **Layers:** `src/data` (numbers) <- `src/game` (pure simulation) <- `src/render` (three.js, read-only view) and `src/ui` (DOM, input, storage, audio).
   `src/game` never touches DOM, `window` or three.js and must run in Node. `src/render` never mutates game state.
2. **Contract:** `ARCHITECTURE.md` defines the state, commands, events and renderer API. Adding optional fields is fine (document them there in the same change). Renaming or removing anything needs the user's OK.
3. **Original numbers are frozen:** everything marked [ORIG] in `SPEC.md` (basic turrets, modifiers, 16 original combos, waves, economy, Medium, maps). Only [NEW] content may be rebalanced. Rule changes update `SPEC.md` in the same change.
4. **Originality:** all code, art and sound are original. Never add the original SWF, decompiled code, or copied or imitated sprites, logos or sounds. Art is procedural, sound is synthesized. No asset files without asking.
5. **Determinism:** simulation randomness only through `game.rng`; `serialize()` then `Game.deserialize()` must continue identically.
6. **No em dash characters** anywhere: code, comments, UI text, docs.
7. **Storage** only through `src/ui/storage.js` (prefix `os226.`, try/catch).
8. **No new dependencies** without asking.

## Done means

- Docs updated (intent before, result after), `CHANGELOG.md` entry under Unreleased, docs listed in the report or commit message.
- `node scripts/sim-test.mjs` and `node scripts/combo-test.mjs` pass, with new checks for new mechanics.
- `npm run build` succeeds.
- Visual or UI changes have been looked at in a browser with no console errors; otherwise say so explicitly.
- Budget: simulation under 4 ms per frame at 8x with 300 attackers and 150 turrets; rendering uses instanced batches only.

## Commands

```bash
npm install
npm run dev                  # http://localhost:5226 (demos: /render-demo.html, /ui-demo.html)
node scripts/sim-test.mjs
node scripts/combo-test.mjs
npm run build                # dist/
npm run build:single         # dist-single/index.html (one file)
```

Port 5226 busy? Use `npx vite --port 5227` and stop it afterwards.

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

Single branch `main`. Commit docs together with the code they describe. The coordinator commits; worker agents do not commit or branch unless their brief says so.
Never commit `node_modules/`, `dist*/` or `*.swf`.
