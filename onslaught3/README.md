# OnSlaught 3

The free successor of [OnSlaught2.26](../README.md): the same engine and all its 2026 improvements (tutorial, Codex,
replays, daily challenge, achievements, accessibility, languages, phones, gamepad, PWA), but without the rule that
the original game's numbers are frozen. Here the game can grow: new enemies, mutators, new balance.

It lives in `onslaught3/` next to OnSlaught2.26 and shares the repository's `node_modules`. From the repository root:

```bash
npm install
npm run dev:os3          # http://localhost:5326
npm run build:os3        # onslaught3/dist/
npm run test:os3         # simulation and combo tests
```

Saves, settings and scores use their own storage prefix (`os3.`), so the two games never mix. All code, art and sound
are original, as in OnSlaught2.26. Rules: [SPEC.md](SPEC.md) (section 11 for what is new). Changes: [CHANGELOG.md](CHANGELOG.md).
