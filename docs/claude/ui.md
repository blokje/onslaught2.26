# UI (`src/ui/`)

DOM overlay over the canvas, input, persistence and audio. Contract: `ARCHITECTURE.md` section 3. The UI talks to the game only through the commands and events in section 1.

## Modules

| File | Role |
|---|---|
| `App.js` | Orchestrator: screens, input modes (build, move, join, focus), game events, autosave, unlock checks. `main.js` reads `app.game` every frame. |
| `menu.js` | Main menu with a 2D path preview per map, difficulty, mode, Continue. |
| `hud.js` | Top bar, build rack, selected-turret panel, message log, toasts, leak flash, error bubble. Values update through cached setters at about 10 Hz. The panel's status chips include a freak-out chip that is always shown for turrets with `freakout` in their data: upgrade progress toward the requirement ("Freak-out at 4 dmg + 4 rate (2/4, 1/4)") until eligible, then ready, incoming and active. |
| `dialogs.js` | Settings, how to play, high scores, game over, in-game menu. |
| `storage.js` | All persistence, prefix `os226.`, try/catch with an in-memory fallback. Autosave format `{ v, at, meta, data: game.serialize() }` under `os226.save`. |
| `audio.js` | Web Audio synthesized SFX, created on the first user gesture, rate limited, master gain plus compressor. |
| `format.js` | Big numbers: 1,234 then 12.3K, 4.56M, 7.89B, 1.23T, then 1.23e15. |
| `icons.js`, `dom.js`, `ui.css` | SVG icons, tiny DOM helpers, styles. |
| `mock.js` | Fake Game and 2D MockRenderer for `/ui-demo.html`. |

## Input

- Left button and single touch: handled by `App` on the canvas (build, select, move, join, focus fire). Right/middle/two-finger: renderer (pan, zoom). Right click also cancels the current mode.
- Keyboard shortcuts: `SPEC.md` section 8. Use `event.code` (`Digit1`) so Shift+digit works. Ignore keys while an input has focus.
- `#ui` has `pointer-events: none`; interactive panels opt back in.

## Unlocks and saves

- Extreme: reach wave 100 on Medium. Sandbox: reach wave 50 on any difficulty. Both only from Normal mode. "Unlock all" in settings opens everything.
- Autosave every 10 s and on page hide; cleared on game over.

## Demo

`/ui-demo.html` boots the App with mocks. In the console, `app.game.cheat(1e6, 2000)` adds cash and kills.
