// Persistence. localStorage keys use the prefix "os3.". Every access is wrapped in try/catch and
// an in-memory fallback keeps the game working when storage is disabled or full.

import { cleanKeyOverrides } from './keymap.ts';
import { cleanHintIds } from './hints.ts';
import { cleanEarned } from './achievements.ts';
import { COMBOS } from '../data/combos.ts';

const COMBO_IDS: ReadonlySet<string> = new Set(Object.values(COMBOS).flat().map((r) => r.id));
import type { KeyAction } from './keymap.ts';

const PREFIX = 'os3.';

export interface PanelPos { x: number; y: number }

export interface Settings {
  volume: number;
  muted: boolean;
  waveInterval: number;
  snap: boolean;
  unlockAll: boolean;
  showFps: boolean;
  autoPause: boolean;
  /** Send the next wave as soon as the field is clear (after wave 1). */
  autoSend: boolean;
  /** Relaxed rule: allow undo of the last build or upgrade (SPEC.md section 9). */
  undo: boolean;
  /** Accessibility: draw the combo-colour shape on each turret on the map. */
  colorSymbols: boolean;
  /** UI size factor (UI_SCALE range). */
  uiScale: number;
  highContrast: boolean;
  /** No blinking, pulsing, jitter or bright flashes. */
  reduceMotion: boolean;
  screenShake: boolean;
  tiltedView: boolean;
  sfxVolume: number;
  tutorialDone: boolean;
  /** UI language ('' = from the browser). */
  language: string;
  hints: boolean;
  uiVolume: number;
  musicVolume: number;
  infoCollapsed: boolean;
  panelPos: PanelPos | null;
  /** Rebound keys (action -> KeyboardEvent.code); actions not listed use the default in keymap.ts. */
  keys: Partial<Record<KeyAction, string>>;
  lastMap: string;
  lastDifficulty: string;
  lastMode: string;
}

export interface Unlocks { extreme: boolean; sandbox: boolean }

export interface ScoreEntry { score: number; kills: number; wave: number; date: string; /** game used undo */ undo?: boolean }

/** Autosave wrapper written by App.autosave(). data is the opaque Game.serialize() result. */
export interface SaveWrapper {
  v: number;
  at: number;
  meta: { mapId: string; difficulty: string; mode: string; wave: number; /** daily challenge key, if it is one */ daily?: string };
  data: any; // opaque serialized game; only the game layer knows its shape (and the mock game its own)
}

const mem = new Map<string, unknown>();

/** Reads and parses a stored value. The caller states the expected shape; nothing is validated here. */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch (e) { /* storage disabled or corrupt */ }
  return mem.has(key) ? (mem.get(key) as T) : fallback;
}

function write(key: string, value: unknown): boolean {
  mem.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

function remove(key: string): void {
  mem.delete(key);
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
}

/** Defaults for every stored setting; getSettings() falls back to these. */
export const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  muted: false,
  waveInterval: 0,      // seconds, 0 = use the difficulty default
  snap: false,
  unlockAll: false,
  showFps: false,
  autoPause: true,      // pause while the tab is hidden, resume on return
  autoSend: false,      // send the next wave as soon as the field is clear (A key, Auto button)
  undo: false,          // relaxed rule: U takes back the last build or upgrade until that turret fires
  colorSymbols: true,   // accessibility: shape badge of the combo colour on every turret on the map
  uiScale: 1,           // accessibility: UI size factor, UI_SCALE.min to UI_SCALE.max
  highContrast: false,  // accessibility: solid panels, brighter secondary text, stronger outlines
  language: '',         // '' = follow the browser (detectLang), else 'en' | 'nl' | 'de'
  tutorialDone: false,
  hints: true,          // one-time tips (src/ui/hints.ts) in the coach card
  // the tutorial was finished or skipped (hides the menu banner)
  sfxVolume: 1,         // game effects bus (shots, blasts, combos), on top of the master volume
  uiVolume: 1,          // interface bus (clicks, build, upgrade, sell, errors)
  musicVolume: 0.6,     // music bus (src/ui/music.ts); 0 stops the music
  screenShake: true,    // shake the view on big blasts (never with reduce motion)
  tiltedView: false,    // game feel: the field seen at an angle with turret shadows (renderer option `tilted`)
  reduceMotion: false,  // accessibility: calm UI and map; when never saved, getSettings() follows prefers-reduced-motion
  infoCollapsed: false,
  panelPos: null,       // turret panel { x, y } in px from the HUD's top-left, null = default dock
  keys: {},             // rebound keys: { action: KeyboardEvent.code }, only the ones that differ from src/ui/keymap.ts
  lastMap: 'map1',
  lastDifficulty: 'medium',
  lastMode: 'normal',
};

/** Allowed UI scale factors (Settings slider, step 0.1). */
export const UI_SCALE = { min: 0.8, max: 1.6, step: 0.1 };
/** A valid UI scale: clamped to UI_SCALE and rounded to its step; anything else -> 1. */
export function clampScale(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.round(Math.min(UI_SCALE.max, Math.max(UI_SCALE.min, v)) * 10) / 10;
}

/** The OS/browser asks for less motion (false where matchMedia is missing, e.g. in Node). */
function prefersReducedMotion(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

/** Stored settings merged over the defaults; values of the wrong type are dropped. */
export function getSettings(): Settings {
  const s = read<unknown>('settings', {});
  // stored data is untrusted: index it loosely and let the per-key type check below decide
  const src = (s && typeof s === 'object' && !Array.isArray(s) ? s : {}) as Record<string, any>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const defaults: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const d = defaults[k], v = src[k];
    if (k === 'keys') { out[k] = cleanKeyOverrides(v); continue; } // known actions, string codes, nothing reserved
    if (d === null) { // panelPos: null or a { x, y } pair of finite numbers
      if (v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y)) out[k] = v;
    } else if (typeof v === typeof d && (typeof d !== 'number' || Number.isFinite(v))) out[k] = v;
  }
  out.uiScale = clampScale(out.uiScale);
  for (const k of ['sfxVolume', 'uiVolume', 'musicVolume'] as const) out[k] = Math.max(0, Math.min(1, out[k] as number));
  if (typeof src.reduceMotion !== 'boolean') out.reduceMotion = prefersReducedMotion(); // first start: follow the OS
  return out as unknown as Settings; // every key was checked against the type of its default
}

/** Persist the settings object. */
export function saveSettings(settings: Settings): void { write('settings', settings); }

/** Unlock flags { extreme, sandbox }. */
export function getUnlocks(): Unlocks {
  const u = read<Partial<Unlocks> | null>('unlocks', {});
  return { extreme: !!(u && u.extreme), sandbox: !!(u && u.sandbox) };
}

/** Persist the unlock flags. */
export function saveUnlocks(unlocks: Unlocks): void { write('unlocks', unlocks); }

// ---- High scores: top 10 per map + difficulty + mode
const scoreKey = (mapId: string, difficulty: string, mode: string): string => `${mapId}|${difficulty}|${mode}`;

/** All high score tables keyed by map|difficulty|mode. */
export function getAllScores(): Record<string, ScoreEntry[]> {
  const s = read<Record<string, ScoreEntry[]> | null>('scores', {});
  return s && typeof s === 'object' ? s : {};
}

/** Top 10 list for one map, difficulty and mode (empty array if none). */
export function getScores(mapId: string, difficulty: string, mode: string): ScoreEntry[] {
  const list = getAllScores()[scoreKey(mapId, difficulty, mode)];
  return Array.isArray(list) ? list : [];
}

// Returns the 1-based rank of the new entry, or 0 when it did not make the top 10.
export function addScore(mapId: string, difficulty: string, mode: string, entry: { score: number; kills: number; wave: number; date?: string; undo?: boolean }): number {
  const all = getAllScores();
  const key = scoreKey(mapId, difficulty, mode);
  const list = Array.isArray(all[key]) ? all[key].slice() : [];
  const e: ScoreEntry = { score: entry.score, kills: entry.kills, wave: entry.wave, date: entry.date || new Date().toISOString() };
  if (entry.undo) e.undo = true; // the game used undo (relaxed rule); shown with a mark
  let idx = list.findIndex((x) => x.score < e.score);
  if (idx < 0) idx = list.length;
  list.splice(idx, 0, e);
  const top = list.slice(0, 10);
  all[key] = top;
  write('scores', all);
  return idx < 10 ? idx + 1 : 0;
}

// ---- Autosave of the running game
export function saveGame(wrapper: SaveWrapper): boolean { return write('save', wrapper); }
/** The autosave wrapper { v, at, meta, data } or null. */
export function loadGame(): SaveWrapper | null {
  const s = read<SaveWrapper | null>('save', null);
  return s && typeof s === 'object' && s.data ? s : null;
}
/** Delete the autosave. */
export function clearGame(): void { remove('save'); }

/** Manual save slots 1..SLOT_COUNT (os3.slot1 ...), next to the autosave. */
export const SLOT_COUNT = 3;
/** A save wrapper read from untrusted data (a slot or an imported file): shape checked, the game data itself is checked by restoreGame. */
export function cleanSaveWrapper(v: unknown): SaveWrapper | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const w = v as Record<string, unknown>;
  const m = w.meta as Record<string, unknown> | undefined;
  if (!w.data || typeof w.data !== 'object' || !m || typeof m !== 'object') return null;
  if (typeof m.mapId !== 'string' || typeof m.difficulty !== 'string' || typeof m.mode !== 'string' || !Number.isFinite(m.wave)) return null;
  return { v: 1, at: Number.isFinite(w.at) ? (w.at as number) : 0, meta: { mapId: m.mapId, difficulty: m.difficulty, mode: m.mode, wave: m.wave as number, ...(typeof m.daily === 'string' ? { daily: m.daily } : {}) }, data: w.data };
}
const slotOk = (i: number): boolean => Number.isInteger(i) && i >= 1 && i <= SLOT_COUNT;
export function getSlot(i: number): SaveWrapper | null { return slotOk(i) ? cleanSaveWrapper(read<unknown>('slot' + i, null)) : null; }
export function saveSlot(i: number, w: SaveWrapper): boolean { return slotOk(i) && write('slot' + i, w); }
export function clearSlot(i: number): void { if (slotOk(i)) remove('slot' + i); }

// Resets unlocks, high scores and the autosave (settings are kept).
export function resetProgress(): void {
  remove('unlocks');
  remove('scores');
  remove('save');
  remove('codex');
  remove('achievements');
  remove('stats');
  remove('daily');
  for (let i = 1; i <= SLOT_COUNT; i++) remove('slot' + i);
}

/** Daily challenge scores: top 10 per UTC day key ("YYYY-MM-DD"), the last 30 days kept. */
export function getDailyScores(key: string): ScoreEntry[] {
  const all = read<Record<string, ScoreEntry[]> | null>('daily', {});
  const list = all && typeof all === 'object' ? all[key] : null;
  return Array.isArray(list) ? list.filter((e) => e && Number.isFinite(e.score)) : [];
}
/** Add a daily score; returns its 1-based rank, or 0 outside the top 10. */
export function addDailyScore(key: string, entry: ScoreEntry): number {
  const raw = read<Record<string, ScoreEntry[]> | null>('daily', {});
  const all: Record<string, ScoreEntry[]> = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const list = (Array.isArray(all[key]) ? all[key] : []).slice();
  let idx = list.findIndex((x) => x.score < entry.score);
  if (idx < 0) idx = list.length;
  list.splice(idx, 0, entry);
  all[key] = list.slice(0, 10);
  for (const k of Object.keys(all).sort().slice(0, -30)) delete all[k]; // keep the newest 30 days
  write('daily', all);
  return idx < 10 ? idx + 1 : 0;
}

/** Earned achievements: id -> ISO date (unknown ids dropped). */
export function getEarned(): Record<string, string> { return cleanEarned(read<unknown>('achievements', {})); }
export function saveEarned(e: Record<string, string>): void { write('achievements', cleanEarned(e)); }

/** Lifetime stats for achievements: maps a game was started on, daily challenges finished. */
export interface Stats { maps: string[]; dailies: number }
export function getStats(): Stats {
  const raw = read<unknown>('stats', {});
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const maps = Array.isArray(o.maps) ? o.maps.filter((m): m is string => typeof m === 'string' && m.length < 40).slice(0, 200) : [];
  const dailies = typeof o.dailies === 'number' && Number.isFinite(o.dailies) && o.dailies > 0 ? Math.floor(o.dailies) : 0;
  return { maps, dailies };
}
export function saveStats(s: Stats): void { write('stats', s); }

/** Combo Codex: times each recipe was fired, over all games. Unknown ids and bad counts are dropped. */
export function getCodex(): Record<string, number> {
  const raw = read<unknown>('codex', {});
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (COMBO_IDS.has(id) && typeof n === 'number' && Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
  }
  return out;
}

/** Ids of the tips already shown (unknown ids dropped). */
export function getHints(): string[] { return cleanHintIds(read<unknown>('hints', [])); }
export function saveHints(ids: Iterable<string>): void { write('hints', cleanHintIds([...ids])); }

/** Count one firing of a combo recipe in the Codex. */
export function recordCombo(id: string): void {
  if (!COMBO_IDS.has(id)) return;
  const c = getCodex();
  c[id] = (c[id] || 0) + 1;
  write('codex', c);
}
