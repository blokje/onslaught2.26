# UI (`src/ui/`)

DOM overlay over the canvas, input, persistence and audio. Contract: `ARCHITECTURE.md` section 3. The UI talks to the game only through the commands and events in section 1.

## Modules

| File | Role |
|---|---|
| `App.ts` | Orchestrator: screens, input modes (build, move, join, focus), game events, autosave, unlock checks. `main.ts` reads `app.game` every frame. |
| `menu.ts` | Main menu with a 2D path preview per map, difficulty, mode, Continue. |
| `hud.ts` | Top bar, build rack, selected-turret panel, message log, toasts, leak flash, error bubble. Values update through cached setters at about 10 Hz. The selected-turret panel is tabbed (see below). |
| `dialogs.ts` | Settings, how to play, high scores, game over, in-game menu. |
| `storage.ts` | All persistence, prefix `os226.`, try/catch with an in-memory fallback. `getSettings()` sanitises: stored values whose type does not match `DEFAULT_SETTINGS` are dropped. Autosave format `{ v, at, meta, data: game.serialize() }` under `os226.save`. |
| `audio.ts` | Web Audio synthesized SFX, created on the first user gesture, rate limited, master gain plus compressor. |
| `format.ts` | Big numbers: 1,234 then 12.3K, 4.56M, 7.89B, 1.23T, then 1.23e15. |
| `icons.ts`, `dom.ts`, `ui.css` | SVG icons, tiny DOM helpers, styles. |
| `mock.ts` | Fake Game and 2D MockRenderer for `/ui-demo.html`. |

## Selected-turret panel tabs

A horizontal tab strip under the header; only the active pane is shown, so the panel stays short. Tabs a kind does not need are left out.

| Tab | Shown for | Contents |
|---|---|---|
| General | all | Blurb, Damage/Range/Rate values, status chips (holding, combo, links, kills, lock), Sell, Move, targeting, lock, cone, join, colour, range hint |
| Upgrades | kinds with stat rows | Stat rows with pips, `+ cost` and Max buttons (modifiers: Influence) |
| Combos | weapons and Combo-only | Fired / Assisted counts; partners in range ("Combo with", dimmed while recharging); "Next combo" with `in 2.4s`, `ready` or `n/a` plus the recipe name; the recipes of its colour with colour dots for the partners they need and `needs 1 blue` / a countdown (next one highlighted; a Combo-only lists the recipes of leads in range that need its colour); the last 5 combos (fired/assisted, time ago) |
| Freakout | kinds with `freakout` in their data | Status chip: upgrade progress toward the requirement ("Freak-out at 4 dmg + 4 rate (2/4, 1/4)") until eligible, then ready, incoming and active, plus a one-line explanation |

- The tab strip only appears when a kind has two or more tabs. The active tab is kept on the `Hud` (`tabPref`) across selections and falls back to General when the selected kind lacks it. Not saved.
- Panes are hidden with the `off` class (`.os-pane.off`), so collapsing the panel still hides everything.
- Only the active pane is refreshed. The Combos pane reads `game.comboPreview(id)` and rebuilds its lists only when they change.
- Hotkeys (upgrades, sell, move, ...) are app-level and work whatever tab is open.

## Moving the turret panel

The panel is docked top right by CSS, which can cover the road on some maps, so the player can move it.

- Drag the header (icon and title, not its buttons) with mouse or touch (`Hud.initPanelDrag`). Pointer capture keeps the drag going outside the panel; `touch-action: none` on the header stops the browser from scrolling or zooming.
- `Hud.placePanel` clamps the position: the whole width stays on screen and the header stays between the top bar and the build rack (the rack is drawn above the panel, so a header under it could not be grabbed again). A moved panel gets an inline `max-height` down to the rack so its body scrolls instead of running off screen. `applyPanelPos` clamps again when the panel opens and on window resize.
- Saved in settings as `panelPos` (`{ x, y }` in CSS px from the HUD's top-left, `null` = the default dock), written once when the drag ends.
- A second press on the header within 350 ms (double-click or double-tap) puts the panel back in the default dock. This is detected in `pointerdown`, because pointer capture retargets a `dblclick` event to the panel itself.

## Input

- Left button and single touch: handled by `App` on the canvas (build, select, move, join, focus fire). Right/middle/two-finger: renderer (pan, zoom). Right click also cancels the current mode.
- Keyboard shortcuts: `SPEC.md` section 8. Use `event.code` (`Digit1`) so Shift+digit works. Ignore keys while an input has focus.
- `#ui` has `pointer-events: none`; interactive panels opt back in.

## Unlocks and saves

- Extreme: reach wave 100 on Medium. Sandbox: reach wave 50 on any difficulty. Both only from Normal mode. "Unlock all" in settings opens everything.
- Autosave every 10 s and on page hide; cleared on game over. When the pause comes from the Esc menu the save stores `paused: false` (the menu pause is temporary), so Continue never starts paused for no reason.
- Quitting to the menu clears the renderer (`renderer.setGame(null)`).
- Audio resumes from any non-running context state (not only `suspended`), which fixes silence after an iOS interruption.

## Pause

- Manual pause: P, the Pause/Resume button, or the in-game menu (Esc). A manual pause never resumes by itself.
- Auto-pause: setting "Pause when tab is hidden" (`settings.autoPause`, default on). When the tab is hidden a running game is paused and flagged `App._autoPaused`; when the tab is visible again it resumes, but only if it is still paused and the flag is still set. Any manual pause action (P, button, menu, leaving the game) clears the flag, so the game then stays paused.
- With auto-pause off the game is not marked paused, but browsers stop `requestAnimationFrame` in hidden tabs, so it still does not advance while hidden (one frame is capped at 100 ms in `main.ts`).
- No wave can start while paused: `game.sendWave()` refuses (`'Game is paused'`, no bonus) and the Send wave button is disabled.
- Pause overlay (`.os-paused`): full-screen dark tint with "PAUSED" and a hint, `pointer-events: none` and placed below the top bar, side panel and rack so Resume stays clickable. Hidden while a modal is open (the modal layer has its own tint).

## Demo

`/ui-demo.html` boots the App with mocks. In the console, `app.game.cheat(1e6, 2000)` adds cash and kills.
