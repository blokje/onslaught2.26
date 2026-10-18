// Persistence. localStorage keys use the prefix "os226.". Every access is wrapped in try/catch and
// an in-memory fallback keeps the game working when storage is disabled or full.

const PREFIX = 'os226.';
const mem = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw != null) return JSON.parse(raw);
  } catch (e) { /* storage disabled or corrupt */ }
  return mem.has(key) ? mem.get(key) : fallback;
}

function write(key, value) {
  mem.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

function remove(key) {
  mem.delete(key);
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
}

/** Defaults for every stored setting; getSettings() falls back to these. */
export const DEFAULT_SETTINGS = {
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
export function getSettings() {
  const s = read('settings', {});
  const src = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const d = DEFAULT_SETTINGS[k], v = src[k];
    if (d === null) { // panelPos: null or a { x, y } pair of finite numbers
      if (v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y)) out[k] = v;
    } else if (typeof v === typeof d && (typeof d !== 'number' || Number.isFinite(v))) out[k] = v;
  }
  return out;
}

/** Persist the settings object. */
export function saveSettings(settings) { write('settings', settings); }

/** Unlock flags { extreme, sandbox }. */
export function getUnlocks() {
  const u = read('unlocks', {});
  return { extreme: !!(u && u.extreme), sandbox: !!(u && u.sandbox) };
}

/** Persist the unlock flags. */
export function saveUnlocks(unlocks) { write('unlocks', unlocks); }

// ---- High scores: top 10 per map + difficulty + mode
const scoreKey = (mapId, difficulty, mode) => `${mapId}|${difficulty}|${mode}`;

/** All high score tables keyed by map|difficulty|mode. */
export function getAllScores() {
  const s = read('scores', {});
  return s && typeof s === 'object' ? s : {};
}

/** Top 10 list for one map, difficulty and mode (empty array if none). */
export function getScores(mapId, difficulty, mode) {
  const list = getAllScores()[scoreKey(mapId, difficulty, mode)];
  return Array.isArray(list) ? list : [];
}

// Returns the 1-based rank of the new entry, or 0 when it did not make the top 10.
export function addScore(mapId, difficulty, mode, entry) {
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
export function saveGame(wrapper) { return write('save', wrapper); }
/** The autosave wrapper { v, at, meta, data } or null. */
export function loadGame() {
  const s = read('save', null);
  return s && typeof s === 'object' && s.data ? s : null;
}
/** Delete the autosave. */
export function clearGame() { remove('save'); }

// Resets unlocks, high scores and the autosave (settings are kept).
export function resetProgress() {
  remove('unlocks');
  remove('scores');
  remove('save');
}
