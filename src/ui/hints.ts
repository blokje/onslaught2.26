// Contextual tips: shown once each, the first time something happens (pure, tested in Node). The App feeds events and
// state, shows the next queued tip in the coach card and stores which ones were seen (src/ui/storage.ts).
import { TURRETS } from '../data/turrets.ts';
import type { GameState } from '../types.ts';
import type { KeyAction } from './keymap.ts';

export interface Hint {
  id: string;
  title: string;
  text: (key: (a: KeyAction) => string) => string;
  /** Fires on this game event (with its payload), or ... */
  event?: string;
  match?: (payload: Record<string, unknown>) => boolean;
  /** ... when this is true for the game state (checked about 10 times a second). */
  when?: (s: GameState) => boolean;
}

const EXTRA = new Set(['targeter', 'sniper', 'fusion', 'railgun', 'comboOnly']);
const kindOf = (p: Record<string, unknown>): string => (typeof p.kind === 'string' ? p.kind : '');

export const HINTS: readonly Hint[] = [
  { id: 'leak', title: 'A leak', event: 'leak',
    text: () => 'An attacker reached your base and cost a life. Add turrets where the road is long and straight, or upgrade the ones you have.' },
  { id: 'lowLives', title: 'Few lives left', when: (s) => s.lives > 0 && s.lives <= 3 && s.wave > 0,
    text: (k) => `Only a few lives left. Tazers slow attackers down, and focus fire (${k('focus')}, then click an attacker) makes every turret in reach shoot the same one.` },
  { id: 'modifier', title: 'Modifiers', event: 'unlock', match: (p) => TURRETS[kindOf(p)]?.category === 'modifier',
    text: () => 'You unlocked a modifier. Modifiers do not shoot: they boost every turret whose centre is inside their circle, and their effects stack. Some trade one stat for another.' },
  { id: 'extraWeapon', title: 'A new weapon', event: 'unlock', match: (p) => EXTRA.has(kindOf(p)),
    text: (k) => `You unlocked one of the late weapons. Select it after building to see what it does; the Targeter is joined to another turret with ${k('join')}.` },
  { id: 'freakout', title: 'Freak-out', when: (s) => s.turrets.some((t) => t.freak !== 'off'),
    text: () => 'A Cannon or Tazer with 4 damage and 4 rate upgrades now freaks out now and then: a short warning, then a few seconds of much more damage and fire rate. Its Freakout tab shows when.' },
  { id: 'comboReady', title: 'Combo ready', when: (s) => s.turrets.some((t) => t.category === 'weapon' && t.comboCapable),
    text: (k) => `A turret has fully upgraded damage, so it can join combos. Put other maxed turrets within 70 of it. Select it and press ${k('combo')} to see its partners; the Combos tab shows what is missing, ${k('codex')} lists every recipe.` },
  { id: 'firstCombo', title: 'Your first combo', event: 'combo',
    text: (k) => `That was a combo. The turret that fired first decided which one. Every combo you fire is marked in the Combo Codex (${k('codex')}).` },
  { id: 'noUpgrades', title: 'Upgrades', when: (s) => s.wave >= 10 && s.turrets.length > 0 && s.turrets.every((t) => !t.levels.damage && !t.levels.range && !t.levels.rate),
    text: (k) => `Attackers get tougher every wave. Upgrading is often better value than another turret: select one and press ${k('upDamage')}, ${k('upRange')} or ${k('upRate')}. Hover a row in the Upgrades tab to preview it.` },
];

const IDS = new Set(HINTS.map((x) => x.id));
/** Keep only known hint ids (for stored data). */
export const cleanHintIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && IDS.has(x)) : []);

/** Which tips are due. `seen` holds every tip already queued or shown, so each one comes at most once. */
export class Hints {
  seen: Set<string>;
  queue: Hint[] = [];

  constructor(seen: Iterable<string> = []) { this.seen = new Set(seen); }

  private add(h: Hint): void { if (!this.seen.has(h.id)) { this.seen.add(h.id); this.queue.push(h); } }

  /** A game event happened. */
  onEvent(name: string, payload: Record<string, unknown>): void {
    for (const h of HINTS) if (h.event === name && (!h.match || h.match(payload))) this.add(h);
  }

  /** Check the state-based tips. */
  onState(s: GameState): void {
    for (const h of HINTS) if (h.when && !this.seen.has(h.id) && h.when(s)) this.add(h);
  }

  /** Take the next tip to show, or null. */
  next(): Hint | null { return this.queue.shift() || null; }
}
