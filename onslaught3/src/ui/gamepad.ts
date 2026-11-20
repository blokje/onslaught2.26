// Gamepad support (standard mapping). GamepadReader is pure (tested in Node): it turns a pad snapshot into cursor
// movement and the actions whose button went down this frame. The App polls navigator.getGamepads() every frame.
import { tx } from './i18n.ts';

export type PadAction =
  | 'click' | 'cancel' | 'buildHere' | 'upDamage' | 'upRange' | 'upRate' | 'rackPrev' | 'rackNext'
  | 'sendWave' | 'pause' | 'target' | 'ranges' | 'speedUp' | 'speedDown';

/** Standard-mapping button index -> action (labels are the Xbox names; other pads have the same positions). */
export const PAD_BUTTONS: Record<number, PadAction> = {
  0: 'click',      // A
  1: 'cancel',     // B
  2: 'buildHere',  // X: build the highlighted rack turret at the cursor
  3: 'upDamage',   // Y
  4: 'rackPrev',   // LB
  5: 'rackNext',   // RB
  6: 'upRange',    // LT
  7: 'upRate',     // RT
  8: 'sendWave',   // View / Back
  9: 'pause',      // Menu / Start
  10: 'target',    // left stick press
  11: 'ranges',    // right stick press
  12: 'speedUp',   // D-pad up
  13: 'speedDown', // D-pad down
  14: 'rackPrev',  // D-pad left
  15: 'rackNext',  // D-pad right
};

/** Labels for the Controls overlay. */
export const PAD_HELP: readonly [string, string][] = [
  [tx('Left stick'), tx('Move the cursor (press: cycle targeting)')],
  ['A / B', tx('Click (build, select) / cancel or back')],
  ['X', tx('Build the highlighted turret at the cursor')],
  [tx('LB, RB, D-pad left/right'), tx('Walk along the build rack')],
  ['Y / LT / RT', tx('Upgrade damage / range / rate')],
  ['View / Menu', tx('Send the next wave / pause')],
  [tx('D-pad up/down'), tx('Game speed up / down')],
  [tx('Right stick press'), tx('Show all ranges')],
];

/** A pad as far as the reader needs it (matches the browser Gamepad). */
export interface PadState { buttons: readonly { pressed: boolean; value?: number }[]; axes: readonly number[] }

const DEAD = 0.18;          // stick dead zone
const SPEED = 900;          // cursor speed in CSS px per second at full tilt

export class GamepadReader {
  prev: boolean[] = [];

  /** Cursor movement (px) and the actions whose button was pressed since the last poll. */
  poll(pad: PadState, dtMs: number): { dx: number; dy: number; actions: PadAction[] } {
    const actions: PadAction[] = [];
    pad.buttons.forEach((b, i) => {
      const down = !!b && (b.pressed || (b.value ?? 0) > 0.5);
      if (down && !this.prev[i] && PAD_BUTTONS[i]) actions.push(PAD_BUTTONS[i]);
      this.prev[i] = down;
    });
    const ax = (v: number | undefined): number => {
      const x = Number.isFinite(v) ? (v as number) : 0;
      const m = Math.abs(x);
      return m < DEAD ? 0 : Math.sign(x) * ((m - DEAD) / (1 - DEAD)) ** 2; // fine control near the centre
    };
    const t = Math.min(100, Math.max(0, dtMs)) / 1000;
    return { dx: ax(pad.axes[0]) * SPEED * t, dy: ax(pad.axes[1]) * SPEED * t, actions };
  }
}
