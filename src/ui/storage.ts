// Persistence. localStorage keys use the prefix "os226.". Every access is wrapped in try/catch and
// an in-memory fallback keeps the game working when storage is disabled or full.

const PREFIX = 'os226.';

export interface PanelPos { x: number; y: number }

export interface Settings {
  volume: number;
  muted: boolean;
  waveInterval: number;
  snap: boolean;
  unlockAll: boolean;
  showFps: boolean;
  autoPause: boolean;
  infoCollapsed: boolean;
  panelPos: PanelPos | null;
  lastMap: string;
  lastDifficulty: string;
  lastMode: string;
}

export interface Unlocks { extreme: boolean; sandbox: boolean }

export interface ScoreEntry { score: number; kills: number; wave: number; date: string }

/** Autosave wrapper written by App.autosave(). data is the opaque Game.serialize() result. */
export interface SaveWrapper {
  v: number;
  at: number;
  meta: { mapId: string; difficulty: string; mode: string; wave: number };
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
  infoCollapsed: false,
  panelPos: null,       // turret panel { x, y } in px from the HUD's top-left, null = default dock
  lastMap: 'map1',
  lastDifficulty: 'medium',
  lastMode: 'normal',
};

/** Stored settings merged over the defaults; values of the wrong type are dropped. */
export function getSettings(): Settings {
  const s = read<unknown>('settings', {});
  // stored data is untrusted: index it loosely and let the per-key type check below decide
  const src = (s && typeof s === 'object' && !Array.isArray(s) ? s : {}) as Record<string, any>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const defaults: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const d = defaults[k], v = src[k];
    if (d === null) { // panelPos: null or a { x, y } pair of finite numbers
      if (v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y)) out[k] = v;
    } else if (typeof v === typeof d && (typeof d !== 'number' || Number.isFinite(v))) out[k] = v;
  }
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
export function addScore(mapId: string, difficulty: string, mode: string, entry: { score: number; kills: number; wave: number; date?: string }): number {
  const all = getAllScores();
  const key = scoreKey(mapId, difficulty, mode);
  const list = Array.isArray(all[key]) ? all[key].slice() : [];
  const e = { score: entry.score, kills: entry.kills, wave: entry.wave, date: entry.date || new Date().toISOString() };
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

// Resets unlocks, high scores and the autosave (settings are kept).
export function resetProgress(): void {
  remove('unlocks');
  remove('scores');
  remove('save');
}
