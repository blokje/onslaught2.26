// Achievements (local only). A table of pure checks, tested in Node; the App feeds them events and state and stores
// what was earned in src/ui/storage.ts (os226.achievements). Sandbox games never count for score, wave or cash goals.
import { TURRETS } from '../data/turrets.ts';
import { MAPS } from '../data/maps.ts';
import type { GameState } from '../types.ts';

/** What a check can look at. `event` is the game event that triggered this check, if any. */
export interface AchCtx {
  state: GameState | null;
  event?: { name: string; payload: Record<string, unknown> };
  /** Recipe ids fired at least once over all games (Combo Codex). */
  codex: ReadonlySet<string>;
  /** Map ids a game was started on, over all games. */
  mapsPlayed: ReadonlySet<string>;
  tutorialDone: boolean;
  /** Lives the current game started with. */
  startLives: number;
  /** Daily challenges finished (scored), over all days. */
  dailies: number;
}

export interface Achievement { id: string; name: string; desc: string; check: (c: AchCtx) => boolean }

const real = (c: AchCtx): GameState | null => (c.state && c.state.mode !== 'sandbox' ? c.state : null);
const ev = (c: AchCtx, name: string): boolean => !!c.event && c.event.name === name;
const comboId = (c: AchCtx): string => (c.event && typeof c.event.payload.id === 'string' ? c.event.payload.id : '');
const atLeast = (c: AchCtx, wave: number, diffs: string[] | null): boolean => {
  const s = real(c);
  return !!s && s.wave >= wave && (!diffs || diffs.includes(s.difficulty));
};
const MEDIUM_UP = ['medium', 'hard', 'extreme'];
const MODIFIERS = Object.keys(TURRETS).filter((k) => TURRETS[k].category === 'modifier');
const EXTRA_MAPS = new Set(MAPS.filter((m) => m.extra).map((m) => m.id));

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'firstKill', name: 'First Blood', desc: 'Destroy your first attacker.', check: (c) => ev(c, 'kill') },
  { id: 'tutorial', name: 'Fast Learner', desc: 'Finish or skip the tutorial.', check: (c) => c.tutorialDone },
  { id: 'firstCombo', name: 'Together', desc: 'Fire your first combo.', check: (c) => ev(c, 'combo') || c.codex.size > 0 },
  { id: 'nuke', name: 'Mushroom Cloud', desc: 'Fire a Nuke.', check: (c) => (ev(c, 'combo') && comboId(c) === 'nuke') || c.codex.has('nuke') },
  { id: 'blackHole', name: 'Event Horizon', desc: 'Open a Black Hole.', check: (c) => (ev(c, 'combo') && comboId(c) === 'blackHole') || c.codex.has('blackHole') },
  { id: 'combos10', name: 'Collector', desc: 'Discover 10 different combos.', check: (c) => c.codex.size >= 10 },
  { id: 'combos20', name: 'Codex Complete', desc: 'Discover all 20 combos.', check: (c) => c.codex.size >= 20 },
  { id: 'freak', name: 'Freaked Out', desc: 'Have a turret freak out.', check: (c) => !!c.state && c.state.turrets.some((t) => t.freak === 'on') },
  { id: 'maxed', name: 'Fully Loaded', desc: 'Upgrade every stat of one weapon to the top.', check: (c) => !!real(c) && real(c)!.turrets.some((t) => t.category === 'weapon'
      && t.levels.damage >= t.maxLevels.damage && t.levels.range >= t.maxLevels.range && t.levels.rate >= t.maxLevels.rate) },
  { id: 'modifiers', name: 'Support Crew', desc: 'Have all 7 modifiers on the field at once.', check: (c) => !!real(c) && MODIFIERS.every((k) => real(c)!.turrets.some((t) => t.kind === k)) },
  { id: 'army', name: 'Army', desc: 'Have 50 turrets on the field.', check: (c) => !!real(c) && real(c)!.turrets.length >= 50 },
  { id: 'rich', name: 'Rainy Day Fund', desc: 'Hold $100,000 at once.', check: (c) => !!real(c) && real(c)!.cash >= 100000 },
  { id: 'wave25', name: 'Holding On', desc: 'Reach wave 25.', check: (c) => atLeast(c, 25, null) },
  { id: 'wave50', name: 'Veteran', desc: 'Reach wave 50 on Medium or harder.', check: (c) => atLeast(c, 50, MEDIUM_UP) },
  { id: 'wave100', name: 'The Wall', desc: 'Reach wave 100 on Medium or harder.', check: (c) => atLeast(c, 100, MEDIUM_UP) },
  { id: 'hard100', name: 'Hardened', desc: 'Reach wave 100 on Hard or Extreme.', check: (c) => atLeast(c, 100, ['hard', 'extreme']) },
  { id: 'extreme50', name: 'One Life', desc: 'Reach wave 50 on Extreme.', check: (c) => atLeast(c, 50, ['extreme']) },
  { id: 'clean30', name: 'Untouchable', desc: 'Reach wave 30 without losing a life.', check: (c) => !!real(c) && real(c)!.wave >= 30 && real(c)!.lives >= c.startLives },
  { id: 'extraMap', name: 'Explorer', desc: 'Reach wave 25 on one of the extra maps (E1 to E8).', check: (c) => atLeast(c, 25, null) && EXTRA_MAPS.has(real(c)!.mapId) },
  { id: 'allMaps', name: 'Cartographer', desc: 'Start a game on every map.', check: (c) => MAPS.every((m) => c.mapsPlayed.has(m.id)) },
  { id: 'score1b', name: 'Billionaire', desc: 'Score 1,000,000,000 in one game.', check: (c) => !!real(c) && real(c)!.score >= 1e9 },
  { id: 'daily', name: 'Daily Habit', desc: 'Finish a daily challenge.', check: (c) => c.dailies >= 1 },
];

/** Waves that earn map stars (1, 2, 3) on a map and difficulty, in Normal mode. */
export const STAR_WAVES = [25, 50, 100] as const;
/** Stars (0 to 3) for the best wave reached. */
export const starsForWave = (wave: number): number => STAR_WAVES.filter((w) => wave >= w).length;
/** Best wave on a map and difficulty from its high-score list (Normal mode lists only). */
export const bestWave = (list: readonly { wave: number }[]): number => list.reduce((m, e) => Math.max(m, Number.isFinite(e.wave) ? e.wave : 0), 0);

const IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
/** Keep only known ids with a date string (stored data). */
export function cleanEarned(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, d] of Object.entries(v as Record<string, unknown>)) if (IDS.has(k) && typeof d === 'string' && d.length < 40) out[k] = d;
  return out;
}

/** Which achievements are new for this context, given what was already earned. */
export function newlyEarned(earned: Record<string, string>, c: AchCtx): Achievement[] {
  const out: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (earned[a.id]) continue;
    try { if (a.check(c)) out.push(a); } catch (e) { /* a check must never break the game */ }
  }
  return out;
}
