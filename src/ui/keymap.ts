// One table of rebindable keyboard actions. App.onKey, the controls overlay (? key) and the rebinding UI all read it,
// so the handler and the help text cannot drift apart. Bindings are KeyboardEvent.code values (physical keys), so they
// do not depend on the keyboard layout; Shift variants (Shift+Q = max, Shift+D = aim) belong to the action itself.
import { tx } from './i18n.ts';

export type KeyAction =
  | 'upDamage' | 'upRange' | 'upRate' | 'sell' | 'move' | 'target' | 'lock' | 'focus' | 'cone' | 'join' | 'color'
  | 'undo' | 'codex' | 'ranges' | 'combo' | 'sendWave' | 'autoSend' | 'pause' | 'info' | 'settings' | 'build' | 'keys';

export interface KeyActionDef { id: KeyAction; code: string; label: string; group: 'Turret' | 'View' | 'Game' }

/** Default bindings (SPEC.md section 8). Order is the order shown in the controls overlay. */
export const KEY_ACTIONS: readonly KeyActionDef[] = [
  { id: 'upDamage', code: 'KeyQ', label: tx('Upgrade damage (Shift: as far as you can afford)'), group: 'Turret' },
  { id: 'upRange', code: 'KeyW', label: tx('Upgrade range (Shift: max)'), group: 'Turret' },
  { id: 'upRate', code: 'KeyE', label: tx('Upgrade rate (Shift: max)'), group: 'Turret' },
  { id: 'sell', code: 'KeyS', label: tx('Sell the selected turret (70% back)'), group: 'Turret' },
  { id: 'move', code: 'KeyM', label: tx('Move it ($500), then click the new spot'), group: 'Turret' },
  { id: 'target', code: 'KeyT', label: tx('Cycle targeting mode'), group: 'Turret' },
  { id: 'lock', code: 'KeyL', label: tx('Lock onto the current target'), group: 'Turret' },
  { id: 'focus', code: 'KeyF', label: tx('Focus fire: press, then click an attacker'), group: 'Turret' },
  { id: 'cone', code: 'KeyD', label: tx('Cycle the firing cone (Shift: aim it at the cursor)'), group: 'Turret' },
  { id: 'join', code: 'KeyJ', label: tx('Targeter: join to a turret'), group: 'Turret' },
  { id: 'color', code: 'KeyX', label: tx('Combo-only: cycle its colour'), group: 'Turret' },
  { id: 'undo', code: 'KeyU', label: tx('Undo the last build or upgrade (Relaxed: undo setting)'), group: 'Turret' },
  { id: 'build', code: 'KeyB', label: tx('Build the armed turret at the cursor (Enter works too)'), group: 'Turret' },
  { id: 'ranges', code: 'KeyR', label: tx('Show all range rings'), group: 'View' },
  { id: 'combo', code: 'KeyC', label: tx('Show combo partners of the selected turret'), group: 'View' },
  { id: 'codex', code: 'KeyK', label: tx('Combo Codex: every combo and what it does'), group: 'View' },
  { id: 'info', code: 'KeyI', label: tx('Collapse or expand the turret panel'), group: 'View' },
  { id: 'sendWave', code: 'Space', label: tx('Send the next wave now (bonus cash)'), group: 'Game' },
  { id: 'autoSend', code: 'KeyA', label: tx('Auto-send waves on/off'), group: 'Game' },
  { id: 'pause', code: 'KeyP', label: tx('Pause / resume'), group: 'Game' },
  { id: 'settings', code: 'KeyG', label: tx('Settings'), group: 'Game' },
  { id: 'keys', code: 'Slash', label: tx('This controls overview (? also works)'), group: 'Game' },
];

/** Keys that keep their fixed meaning and cannot be bound to an action. */
export const RESERVED_CODES: ReadonlySet<string> = new Set([
  'Escape', 'Enter', 'NumpadEnter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock',
]);

/** Fixed (not rebindable) controls, for the overlay. */
export const FIXED_KEYS: readonly [string, string][] = [
  [tx('1 to 8, Shift+1 to 8'), tx('Pick a turret to build (Shift: the second row of eight)')],
  [tx('Click, Shift+Click'), tx('Build, select or pick a target; Shift keeps building')],
  [tx('Left, Right'), tx('Walk along the build rack')],
  [tx('Esc, right click'), tx('Cancel, deselect, or open the game menu')],
  [tx('Wheel, right drag'), tx('Zoom and pan (two fingers on touch)')],
  [tx('Drag panel header'), tx('Move the turret panel; double-click puts it back')],
];

const DEFAULT_CODE = new Map(KEY_ACTIONS.map((a) => [a.id, a.code]));
const IS_ACTION = new Set<string>(KEY_ACTIONS.map((a) => a.id));

/** Check a binding override map from storage: known actions, string codes, nothing reserved. */
export function cleanKeyOverrides(v: unknown): Partial<Record<KeyAction, string>> {
  const out: Partial<Record<KeyAction, string>> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, code] of Object.entries(v)) {
    if (IS_ACTION.has(k) && typeof code === 'string' && code.length > 0 && code.length < 40 && !RESERVED_CODES.has(code)) {
      out[k as KeyAction] = code;
    }
  }
  return out;
}

/** Effective binding of every action: defaults with the overrides on top. */
export function resolveBindings(overrides: Partial<Record<KeyAction, string>>): Record<KeyAction, string> {
  const out = {} as Record<KeyAction, string>;
  for (const a of KEY_ACTIONS) out[a.id] = overrides[a.id] || a.code;
  return out;
}

/** code -> action lookup for the key handler (the first action wins if two share a code). */
export function codeLookup(bindings: Record<KeyAction, string>): Map<string, KeyAction> {
  const m = new Map<string, KeyAction>();
  for (const a of KEY_ACTIONS) if (!m.has(bindings[a.id])) m.set(bindings[a.id], a.id);
  return m;
}

/**
 * New override map after binding `action` to `code`. An action that already used `code` takes over the old key of
 * `action` (a swap), so no two actions share a key. Bindings equal to the default are dropped from the map.
 */
export function rebind(overrides: Partial<Record<KeyAction, string>>, action: KeyAction, code: string): Partial<Record<KeyAction, string>> {
  const cur = resolveBindings(overrides);
  const old = cur[action];
  for (const a of KEY_ACTIONS) if (a.id !== action && cur[a.id] === code) cur[a.id] = old;
  cur[action] = code;
  const out: Partial<Record<KeyAction, string>> = {};
  for (const a of KEY_ACTIONS) if (cur[a.id] !== DEFAULT_CODE.get(a.id)) out[a.id] = cur[a.id];
  return out;
}

/** Short label for a KeyboardEvent.code ('KeyQ' -> 'Q', 'Digit0' -> '0', 'Slash' -> '/'). */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return 'Num ' + code.slice(6);
  const named: Record<string, string> = {
    Space: 'Space', Slash: '/', Backslash: '\\', Period: '.', Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[',
    BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Backspace: 'Backspace', Delete: 'Del', Home: 'Home',
    End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins', IntlBackslash: '<',
  };
  return named[code] || code;
}
