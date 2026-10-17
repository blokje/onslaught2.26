---
name: verify-in-browser
description: Check OnSlaught2.26 in a real browser after a change (game flow, console errors, demos, tablet emulation). Use before reporting any visual, UI or gameplay change as done.
---

# Verify in the browser

**Docs first:** Read `docs/claude/testing.md` and the guide for the area you changed, so you know what the docs promise.

1. Start the dev server: `npm run dev` (port 5226). If it is taken, `npx vite --port 5227`. Stop your own server afterwards.
2. Open `/`. Check the main menu renders and the console has no errors.
3. Start a game on Classic (Medium). Build a turret (key 1, click next to the road), press Space to send a wave, watch kills and cash change, try 8x speed.
4. For content you changed: open Settings, tick "Unlock all", go back to the menu, start a Sandbox game and build the thing you changed (all 16 turrets are available; Shift+Q maxes damage for combos).
5. Renderer or UI work: also open `/render-demo.html` and `/ui-demo.html`.
6. Touch and iPad: emulate a tablet in landscape (for example 1180 x 820, touch enabled), reload, and check taps build and select, two-finger pan and zoom work, and portrait shows the rotate notice.
7. Read the console for errors at the end. Report what you checked and what you could not check (real devices, audio).

**Docs after:** if the docs promised something the game does not do (or the reverse), fix the doc or report it. New traps go in `docs/claude/gotchas.md`.
A task is not done until the docs are touched (see `docs/claude/documentation.md`).
