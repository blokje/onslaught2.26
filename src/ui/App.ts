// OnSlaught2.26 UI orchestrator: screens, input, feedback, persistence and audio wiring.
import './ui.css';
import { h } from './dom.ts';
import { TURRETS, BUILD_ORDER, MOVE_COST } from '../data/turrets.ts';
import { MAPS } from '../data/maps.ts';
import { DIFFICULTIES, MODES, SPEEDS, TARGET_MODES } from '../data/rules.ts';
import * as storage from './storage.ts';
import { AudioEngine } from './audio.ts';
import { Menu } from './menu.ts';
import { Hud } from './hud.ts';
import { buildSettings, buildHelp, buildScores, buildGameOver, buildKeys } from './dialogs.ts';
import { buildCodex } from './codex.ts';
import { Tutorial } from './tutorial.ts';
import { Hints } from './hints.ts';
import { musicIntensity } from './music.ts';
import { ACHIEVEMENTS, newlyEarned } from './achievements.ts';
import { dailyFor } from './daily.ts';
import { GamepadReader } from './gamepad.ts';
import type { PadAction } from './gamepad.ts';
import type { Hint } from './hints.ts';

/** Wave interval on the tutorial map while the coach runs: long, so no wave comes before the player sends one. */
const TUTORIAL_WAVE_MS = 600000;
/** A tip closes by itself after this many ms. */
const TIP_MS = 12000;
import { codeLookup, keyLabel, resolveBindings } from './keymap.ts';
import { clampScale } from './storage.ts';
import type { KeyAction } from './keymap.ts';
import { formatCash, formatNum } from './format.ts';
import type { AppGame, AppRenderer, AppOptions, CommandResult, ReplayPlayback, ReplaySupport } from './appTypes.ts';
import { encodeReplay, decodeReplay } from './replayCode.ts';
import type { GameEventName, GameEvents, GameOptions, GameState, Overlay, Stat, TurretState, Attacker, KeyColor, DirectionalMode, WaveRecord } from '../types.ts';

const GRID = 22;
const FOCUS_RADIUS = 16;
const COMBO_COLORS: KeyColor[] = ['red', 'green', 'blue', 'yellow'];
const GAME_EVENTS: GameEventName[] = ['shot', 'kill', 'leak', 'wave', 'blast', 'combo', 'build', 'sell', 'upgrade', 'unlock', 'error', 'message', 'gameover', 'undo'];
const BLAST_SOUND: Record<string, string> = { small: 'small', medium: 'medium', large: 'large', huge: 'huge', bfg: 'large', poison: 'medium' };

type Keys<T> = T extends unknown ? keyof T : never;
type Val<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;
/** Every event payload merged into one all-optional shape: onGameEvent reads fields by event name. */
type LooseEvent = { [K in Keys<GameEvents[GameEventName]>]?: Val<GameEvents[GameEventName], K> };

type InputMode = 'none' | 'build' | 'move' | 'join' | 'focus';

export interface ModalOptions {
  dismissable?: boolean;
  onClose?: (() => void) | null;
  cls?: string;
  buttons?: { label: string; cls?: string; onClick: (handle: ModalHandle, el: HTMLButtonElement) => void }[];
}

export interface ModalHandle {
  el: HTMLElement;
  dismissable: boolean;
  onClose: (() => void) | null;
  close: () => void;
  kind?: string;
}

interface CursorState { cx: number; cy: number; over: boolean; known: boolean; wx?: number; wy?: number }
interface PointerDown { id: number; x: number; y: number; button: number; moved: boolean; touch: boolean }
export interface GameOverInfo { score: number; kills: number; wave: number; mapId: string; difficulty: string; mode: string; rank: number; report?: RunReport; daily?: { key: string; rank: number } }
/** End-of-run report data for the game-over dialog (built from game.state in App.onGameOver). */
export interface RunReport {
  history: WaveRecord[];
  damageTotal: number;
  combos: number;
  time: number;
  /** Turrets standing at the end with the most damageDealt, best first (max 5). */
  top: { kind: string; damage: number; kills: number }[];
}
export interface ScoreHighlight { mapId: string; difficulty: string; mode: string; rank: number }
type GhostState = Overlay['ghost'];

const MAPS_BY_ID: Record<string, { name: string }> = Object.fromEntries(MAPS.map((m) => [m.id, m]));

let modalSeq = 0;

/** Keep Tab and Shift+Tab inside an open dialog (wraps around). */
function trapTab(e: KeyboardEvent, box: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const items = [...box.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]')]
    .filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1], at = document.activeElement;
  if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (at === last || !box.contains(at))) { e.preventDefault(); first.focus(); }
}

/** Report data from the final game state (history, totals, top 5 turrets by damage). */
export function buildReportData(s: GameState): RunReport {
  const top = s.turrets
    .filter((t) => (t.damageDealt || 0) > 0)
    .sort((a, b) => (b.damageDealt || 0) - (a.damageDealt || 0))
    .slice(0, 5)
    .map((t) => ({ kind: t.kind, damage: t.damageDealt || 0, kills: t.kills || 0 }));
  return {
    history: s.history || [],
    damageTotal: s.damageTotal ?? s.turrets.reduce((n, t) => n + (t.damageDealt || 0), 0),
    combos: s.turrets.reduce((n, t) => n + (t.combosFired || 0), 0),
    time: s.time,
    top,
  };
}

export class App {
  rootEl: HTMLElement;
  createGame: AppOptions['createGame'];
  restoreGame: AppOptions['restoreGame'];
  renderer: AppRenderer;
  game: AppGame | null;
  settings: storage.Settings;
  unlocks: storage.Unlocks;
  audio: AudioEngine;
  mode: InputMode;
  armed: string | null;
  moveId: number | null;
  selectedId: number | null;
  focusId: number | null;
  showRanges: Overlay['showRanges'];
  showCombo: boolean;
  hoverId: number | null;
  /** Range ring of the hovered range upgrade (set by the Hud's Upgrades tab). */
  previewRange: Overlay['previewRange'] = null;
  /** Running tutorial (How to Play map), or null. */
  tutorial: Tutorial | null = null;
  /** One-time tips: which are due and which one is on screen (with its auto-close timer). */
  hints: Hints = new Hints(storage.getHints());
  tipShown: Hint | null = null;
  /** Earned achievements (id -> date), loaded once and saved on change. */
  earned: Record<string, string> = storage.getEarned();
  _achTick = 0;
  /** Gamepad: edge detection per pad, and whether a pad was used (shows the cursor). */
  pad = new GamepadReader();
  padActive = false;
  /** Replay support (null in the UI demo) and the replay being watched, if any. */
  replays: ReplaySupport | null = null;
  replayView: { pb: ReplayPlayback; data: unknown; ended: boolean } | null = null;
  /** Key of the daily challenge being played ("YYYY-MM-DD"), or null. */
  daily: string | null = null;
  tipTimer: ReturnType<typeof setTimeout> | null = null;
  /** Element currently highlighted by the coach. */
  coachTargetEl: Element | null = null;
  /** KeyboardEvent.code -> action, from settings.keys over the defaults in keymap.ts. */
  keyMap: Map<string, KeyAction> = new Map();
  /** Set while the controls overlay waits for a new key; gets the next keydown instead of the game. */
  keyCapture: ((e: KeyboardEvent) => void) | null = null;
  rackIndex: number;
  cursor: CursorState;
  ghost: GhostState;
  cursorDirty: boolean;
  overlayDirty: boolean;
  hudDirty: boolean;
  hudAcc: number;
  fpsAcc: number;
  fpsN: number;
  errSeq: number;
  modals: ModalHandle[];
  handlers: [GameEventName, (p: GameEvents[GameEventName]) => void][];
  ptrs: Map<number, boolean>;
  down: PointerDown | null;
  multi: boolean;
  canvas: HTMLCanvasElement | null;
  _overShown: boolean;
  _pausedByMenu: boolean;
  _autoPaused: boolean;
  lastSel: number | null;
  root: HTMLElement;
  menu: Menu;
  hud: Hud;
  _saveTimer: ReturnType<typeof setInterval>;

  constructor(rootEl: HTMLElement, { createGame, restoreGame, renderer, replays }: AppOptions) {
    this.rootEl = rootEl;
    this.replays = replays || null;
    this.createGame = createGame;
    this.restoreGame = restoreGame;
    this.renderer = renderer;
    this.game = null;

    this.settings = storage.getSettings();
    this.applyKeys();
    this.unlocks = storage.getUnlocks();
    this.audio = new AudioEngine();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(this.settings.muted);
    this.audio.setBusVolume('sfx', this.settings.sfxVolume);
    this.audio.setBusVolume('ui', this.settings.uiVolume);
    this.audio.setBusVolume('music', this.settings.musicVolume);

    // input state
    this.mode = 'none';            // 'none' | 'build' | 'move' | 'join' | 'focus'
    this.armed = null;             // turret kind in build mode
    this.moveId = null;
    this.selectedId = null;
    this.focusId = null;
    this.showRanges = 'selected';
    this.showCombo = false;
    this.hoverId = null;
    this.rackIndex = 0;
    this.cursor = { cx: 0, cy: 0, over: false, known: false };
    this.ghost = null;
    this.cursorDirty = false;
    this.overlayDirty = true;
    this.hudDirty = false;
    this.hudAcc = 0;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.errSeq = 0;
    this.modals = [];
    this.handlers = [];
    this.ptrs = new Map();
    this.down = null;
    this.multi = false;
    this.canvas = null;
    this._overShown = false;
    this._pausedByMenu = false;
    this._autoPaused = false; // paused by hiding the tab; resumes when the tab is visible again
    this.lastSel = null;

    // DOM
    this.root = h('div', { class: 'os-root' });
    this.menu = new Menu(this);
    this.hud = new Hud(this);
    this.root.append(this.menu.el, this.hud.el, this.buildRotateNotice());
    rootEl.append(this.root);
    this.menu.show();
    this.applyFps();
    this.applyLook();

    this.bindGlobal();
    this.attachCanvas();
    this._saveTimer = setInterval(() => this.autosave(), 10000);
  }

  // =================================================================== DOM helpers
  buildRotateNotice(): HTMLElement {
    return h('div', { class: 'os-rotate' },
      h('div', { html: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="14" y="4" width="20" height="40" rx="4" fill="none" stroke="#ffd27a" stroke-width="3"/><circle cx="24" cy="38" r="2" fill="#ffd27a"/></svg>' }),
      h('div', null, 'Please rotate to landscape'));
  }

  openModal(title: string, content: Node, o: ModalOptions = {}): ModalHandle {
    const dismissable = o.dismissable !== false;
    const titleId = 'os-dlg-' + (++modalSeq);
    // keyboard focus returns here when the dialog closes (only if it was a real, tabbable control)
    const prev = document.activeElement instanceof HTMLElement && document.activeElement.tabIndex >= 0 ? document.activeElement : null;
    const layer = h('div', { class: 'os-modal-layer' });
    const handle: ModalHandle = {
      el: layer, dismissable, onClose: o.onClose || null,
      close: () => {
        const i = this.modals.indexOf(handle);
        if (i < 0) return;
        this.modals.splice(i, 1);
        layer.remove();
        if (handle.onClose) handle.onClose();
        this.hudDirty = true;
        if (prev && prev.isConnected) prev.focus();
      },
    };
    const closeBtn = dismissable ? h('button', { class: 'os-iconbtn', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => handle.close() }, '×') : null;
    const foot = o.buttons ? h('div', { class: 'os-modal-foot' }, ...o.buttons.map((b) => {
      const el = h('button', { class: 'os-btn ' + (b.cls || ''), type: 'button' }, b.label);
      el.addEventListener('click', () => b.onClick(handle, el));
      return el;
    })) : null;
    // a dialog for screen readers; the box itself takes focus (not a button, so a stray Space or Enter does nothing)
    const box = h('div', { class: 'os-modal ' + (o.cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: -1 },
      h('div', { class: 'os-modal-head' }, h('h2', { id: titleId }, title), closeBtn),
      h('div', { class: 'os-modal-body' }, content), foot);
    layer.append(box);
    layer.addEventListener('keydown', (e) => trapTab(e, box));
    if (dismissable) layer.addEventListener('pointerdown', (e) => { if (e.target === layer) handle.close(); });
    this.root.append(layer);
    this.modals.push(handle);
    box.focus({ preventScroll: true });
    return handle;
  }

  modalOpen(): boolean { return this.modals.length > 0; }
  closeAllModals(): void { while (this.modals.length) this.modals[this.modals.length - 1].close(); }

  openSettings(): void {
    if (this.modals.some((m) => m.kind === 'settings')) return;
    const m = this.openModal('Settings', buildSettings(this), { cls: '', buttons: [{ label: 'Done', cls: 'primary', onClick: (hd) => hd.close() }] });
    m.kind = 'settings';
  }
  toggleSettings(): void {
    const open = this.modals.find((m) => m.kind === 'settings');
    if (open) open.close(); else this.openSettings();
  }
  openHelp(): void { this.openModal('How to play', buildHelp(this), { cls: 'wide', buttons: [{ label: 'Close', cls: 'primary', onClick: (hd) => hd.close() }] }); }
  openScores(highlight?: ScoreHighlight): void { this.openModal('High scores', buildScores(this, highlight), { cls: 'narrow wide', buttons: [{ label: 'Close', cls: 'primary', onClick: (hd) => hd.close() }] }); }

  openGameMenu(): void {
    if (!this.game || this.modals.some((m) => m.kind === 'gamemenu')) return;
    this._autoPaused = false;
    const wasPaused = this.game.state.paused;
    if (!wasPaused) { this.game.setPaused(true); this._pausedByMenu = true; }
    let restartStep = 0;
    const m = this.openModal('Menu', h('div', { class: 'os-hint', style: 'font-size:.95em' }, 'The game is paused.'), {
      cls: 'narrow',
      onClose: () => { if (this._pausedByMenu && this.game) this.game.setPaused(false); this._pausedByMenu = false; },
      buttons: [
        { label: 'Resume', cls: 'primary', onClick: (hd) => hd.close() },
        { label: 'Restart', cls: '', onClick: (hd, el) => {
          if (restartStep === 0) { restartStep = 1; el.textContent = 'Sure? Click again'; return; }
          this._pausedByMenu = false;
          hd.close();
          this.restart();
        } },
        { label: 'Settings', cls: '', onClick: () => this.openSettings() },
        { label: 'Combo Codex', cls: '', onClick: () => this.openCodex() },
        { label: 'Saves', cls: '', onClick: () => this.openSaves() },
        { label: 'Quit to menu', cls: 'danger', onClick: (hd) => { hd.close(); this.toMenu(); } }, // close() resumes a menu pause, so the autosave is not paused
      ],
    });
    m.kind = 'gamemenu';
  }

  // =================================================================== settings, unlocks
  updateSettings(patch: Partial<storage.Settings>): void {
    Object.assign(this.settings, patch);
    storage.saveSettings(this.settings);
    if ('volume' in patch) this.audio.setVolume(this.settings.volume);
    if ('muted' in patch) this.audio.setMuted(this.settings.muted);
    if ('sfxVolume' in patch) this.audio.setBusVolume('sfx', this.settings.sfxVolume);
    if ('uiVolume' in patch) this.audio.setBusVolume('ui', this.settings.uiVolume);
    if ('musicVolume' in patch) this.audio.setBusVolume('music', this.settings.musicVolume);
    if ('showFps' in patch) this.applyFps();
    if ('uiScale' in patch || 'highContrast' in patch || 'reduceMotion' in patch || 'screenShake' in patch) this.applyLook();
    if ('keys' in patch) this.applyKeys();
    if ('colorSymbols' in patch) this.overlayDirty = true;
    if ('unlockAll' in patch || 'waveInterval' in patch) this.menu.refresh();
  }

  /** Accessibility look: --ui-scale, high contrast (os-hc), reduce motion (os-rm and the renderer option). */
  applyLook(): void {
    const sc = clampScale(this.settings.uiScale);
    this.root.style.setProperty('--ui-scale', String(sc));
    this.root.classList.toggle('os-hc', !!this.settings.highContrast);
    this.root.classList.toggle('os-rm', !!this.settings.reduceMotion);
    try { this.renderer.setOptions?.({ reduceMotion: !!this.settings.reduceMotion, screenShake: !!this.settings.screenShake }); } catch (e) { console.error(e); }
    this.hud.applyPanelPos(); // the panel size changed with the scale; keep it on screen
  }

  applyFps(): void { this.hud.fps.style.display = this.settings.showFps ? '' : 'none'; if (!this.settings.showFps) this.hud.fps.textContent = ''; }

  // only ids that have an `unlock` rule ('extreme', 'sandbox') ever reach the unlocks lookup
  isDifficultyUnlocked(id: string): boolean { return !DIFFICULTIES[id]?.unlock || this.settings.unlockAll || !!this.unlocks[id as keyof storage.Unlocks]; }
  isModeUnlocked(id: string): boolean { return !MODES[id]?.unlock || this.settings.unlockAll || !!this.unlocks[id as keyof storage.Unlocks]; }

  resetProgress(): void {
    storage.resetProgress();
    this.earned = {};
    this.unlocks = storage.getUnlocks();
    this.menu.refresh();
  }

  checkUnlocks(wave: number): void {
    const g = this.game;
    if (!g || g.state.mode !== 'normal') return;
    let changed = false;
    if (wave >= 100 && g.state.difficulty === 'medium' && !this.unlocks.extreme) {
      this.unlocks.extreme = true; changed = true;
      this.hud.toast('Extreme difficulty unlocked!', 'unlock');
    }
    if (wave >= 50 && !this.unlocks.sandbox) {
      this.unlocks.sandbox = true; changed = true;
      this.hud.toast('Sandbox mode unlocked!', 'unlock');
    }
    if (changed) { storage.saveUnlocks(this.unlocks); this.audio.play('unlock'); this.menu.refresh(); }
  }

  // =================================================================== game lifecycle
  startGame(sel: { mapId: string; difficulty: string; mode: string }, extra: { seed?: number; daily?: string } = {}): void {
    this.closeAllModals();
    const opts: GameOptions = { mapId: sel.mapId, difficulty: sel.difficulty, mode: sel.mode, unlockAll: !!this.settings.unlockAll };
    if (this.settings.waveInterval > 0) opts.waveInterval = this.settings.waveInterval * 1000;
    if (extra.seed != null) opts.seed = extra.seed;
    if (extra.daily) { opts.unlockAll = false; delete opts.waveInterval; } // the same rules for everyone on that day
    const tut = sel.mapId === 'tutorial'; // the How to Play map always runs the coach
    if (tut) opts.waveInterval = TUTORIAL_WAVE_MS;
    let game: AppGame;
    try { game = this.createGame(opts); } catch (e) { console.error(e); this.menu.show(); this.menu.flash('Could not start the game.'); return; }
    this.attachGame(game);
    this.daily = extra.daily || null;
    if (tut) { this.tutorial = new Tutorial(); this.renderCoach(); }
    const st = storage.getStats();
    if (!st.maps.includes(sel.mapId)) { st.maps.push(sel.mapId); storage.saveStats(st); }
    this.checkAchievements();
  }

  /** Earn any new achievements for the current state (and the event that triggered the check, if any). */
  checkAchievements(event?: { name: string; payload: Record<string, unknown> }): void {
    if (this.replayView) return;
    const g = this.game;
    const st = storage.getStats();
    const ctx = {
      state: g ? g.state : null, event, codex: new Set(Object.keys(storage.getCodex())), mapsPlayed: new Set(st.maps),
      tutorialDone: !!this.settings.tutorialDone, startLives: g ? DIFFICULTIES[g.state.difficulty]?.lives || 10 : 10, dailies: st.dailies,
    };
    const fresh = newlyEarned(this.earned, ctx);
    if (!fresh.length) return;
    const now = new Date().toISOString();
    for (const a of fresh) {
      this.earned[a.id] = now;
      this.hud.toast('Achievement: ' + a.name, 'unlock');
      this.hud.addLog('Achievement unlocked: ' + a.name + ' (' + a.desc + ')');
    }
    this.audio.play('unlock');
    storage.saveEarned(this.earned);
  }

  openAchievements(): void {
    const done = ACHIEVEMENTS.filter((a) => this.earned[a.id]).length;
    const list = h('div', { class: 'os-ach-list' }, ...ACHIEVEMENTS.map((a) => {
      const d = this.earned[a.id];
      let when = '';
      try { if (d) when = new Date(d).toLocaleDateString(); } catch (e) { /* ignore */ }
      return h('div', { class: 'os-ach' + (d ? ' done' : '') }, h('span', { class: 'os-ach-mark', 'aria-hidden': 'true' }, d ? '\u2605' : '\u2606'),
        h('div', null, h('b', null, a.name), h('div', { class: 'os-hint' }, a.desc)), h('span', { class: 'os-ach-when' }, d ? when : 'locked'));
    }));
    this.openModal('Achievements', h('div', null, h('p', { class: 'os-hint' }, `Earned ${done} of ${ACHIEVEMENTS.length}. Sandbox games do not count for wave, score or cash goals.`), list),
      { cls: 'wide', buttons: [{ label: 'Close', cls: 'primary', onClick: (hd) => hd.close() }] });
  }

  /** Start today's daily challenge (UTC day): fixed map, difficulty and seed, no unlock-all, default wave interval. */
  startDaily(): void {
    const d = dailyFor(new Date());
    this.startGame({ mapId: d.mapId, difficulty: d.difficulty, mode: 'normal' }, { seed: d.seed, daily: d.key });
  }

  /** Start the interactive tutorial on the How to Play map (Easy, Normal mode). */
  startTutorial(): void { this.startGame({ mapId: 'tutorial', difficulty: 'easy', mode: 'normal' }); }

  /** Show the current tutorial step in the coach card (or hide it). */
  renderCoach(): void {
    const t = this.tutorial;
    if (!t || t.over) { this.dismissTip(false); this.hud.showCoach(null); this.setCoachTarget(null); return; }
    const st = t.step, last = t.index === t.count - 1;
    const buttons: { label: string; primary?: boolean; onClick: () => void }[] = [];
    if (t.index > 0) buttons.push({ label: 'Back', onClick: () => { t.back(); this.renderCoach(); } });
    if (!last) buttons.push({ label: 'Skip tutorial', onClick: () => this.endTutorial(true) });
    if (!st.done) buttons.push({ label: last ? 'Finish' : 'Next', primary: true, onClick: () => { t.next(); if (t.over) this.endTutorial(false); else this.renderCoach(); } });
    this.hud.showCoach({ key: 'tut:' + st.id + ':' + JSON.stringify(this.settings.keys), title: st.title, text: st.text((a) => this.keyFor(a)), progress: `${t.index + 1} / ${t.count}`, buttons });
    this.setCoachTarget(st.target || null);
  }

  /** Tutorial finished or skipped: remember it, give the map its normal wave interval back. */
  endTutorial(skipped: boolean): void {
    if (!this.tutorial) return;
    this.tutorial = null;
    this.updateSettings({ tutorialDone: true });
    this.checkAchievements();
    this.restoreWaveInterval();
    this.renderCoach();
    this.hud.toast(skipped ? 'Tutorial skipped. Replay it from the menu.' : 'Tutorial done. Waves now come by themselves.');
  }

  /** Tips (setting hints): queue state-based ones, show the next when none is on screen. Never during the tutorial. */
  tipTick(): void {
    if (!this.settings.hints || !this.game || this.replayView) return;
    const before = this.hints.seen.size;
    this.hints.onState(this.game.state);
    if (this.hints.seen.size !== before) storage.saveHints(this.hints.seen);
    if (this.tipShown || this.modalOpen()) return;
    const h = this.hints.next();
    if (!h) return;
    storage.saveHints(this.hints.seen);
    this.tipShown = h;
    this.hud.showCoach({ key: 'tip:' + h.id, tip: true, title: h.title, text: h.text((a) => this.keyFor(a)), buttons: [{ label: 'Got it', primary: true, onClick: () => this.dismissTip(true) }] });
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => { if (this.tipShown === h) this.dismissTip(true); }, TIP_MS);
  }

  /** Close the tip on screen (`redraw`: hide the coach card now). */
  dismissTip(redraw: boolean): void {
    if (this.tipTimer) { clearTimeout(this.tipTimer); this.tipTimer = null; }
    if (!this.tipShown) return;
    this.tipShown = null;
    if (redraw) this.hud.showCoach(null);
  }

  /** Forget which tips were shown (Settings > Reset tips). */
  resetTips(): void { this.dismissTip(true); this.hints = new Hints(); storage.saveHints([]); }

  /** Highlight one element for the coach (class os-coach-target), or none. Re-applied each tick: panels rebuild. */
  setCoachTarget(selector: string | null): void {
    const el = selector ? this.root.querySelector(selector) : null;
    if (el === this.coachTargetEl) return;
    if (this.coachTargetEl) this.coachTargetEl.classList.remove('os-coach-target');
    this.coachTargetEl = el;
    if (el) el.classList.add('os-coach-target');
  }

  continueGame(): void {
    const save = storage.loadGame();
    if (!save) return;
    let game: AppGame;
    try { game = this.restoreGame(save.data); } catch (e) {
      console.error(e);
      storage.clearGame();
      this.menu.refresh();
      this.menu.flash('The saved game could not be loaded.');
      return;
    }
    this.closeAllModals();
    this.attachGame(game);
    this.daily = typeof save.meta?.daily === 'string' ? save.meta.daily : null;
  }

  restart(): void {
    if (!this.game) return;
    const s = this.game.state;
    this.startGame({ mapId: s.mapId, difficulty: s.difficulty, mode: s.mode });
  }

  attachGame(game: AppGame): void {
    this.detachGame();
    this.game = game;
    this.renderer.setGame(game);
    this.renderer.resetView();
    this.handlers = GAME_EVENTS.map((name) => {
      const fn = (p: GameEvents[GameEventName]): void => this.onGameEvent(name, p || {});
      // name is the union of all events here; the handler accepts every payload
      // (typed as the generic K = GameEventName)
      game.on(name, fn);
      return [name, fn] as [GameEventName, (p: GameEvents[GameEventName]) => void];
    });
    this.resetInput();
    this._overShown = false;
    this._pausedByMenu = false;
    this._autoPaused = false;
    this.audio.setSpeed(game.state.speed);
    this.menu.hide();
    this.hud.setVisible(true);
    this.hud.panelKey = '';
    this.hudDirty = true;
    this.overlayDirty = true;
    this.attachCanvas();
  }

  detachGame(): void {
    if (this.game) for (const [name, fn] of this.handlers) { try { this.game.off(name, fn); } catch (e) { /* ignore */ } }
    this.handlers = [];
    this.game = null;
    this.tutorial = null;
    this.daily = null;
    this.replayView = null;
    this.renderCoach();
    this.resetInput();
    // the menu must not keep drawing the old game, selection rings or build ghost
    try { this.renderer.setGame(null); } catch (e) { console.error(e); }
    this.pushOverlay();
  }

  resetInput(): void {
    this.mode = 'none'; this.armed = null; this.moveId = null; this.selectedId = null; this.focusId = null;
    this.ghost = null; this.hoverId = null; this.showCombo = false; this.showRanges = 'selected';
    this.setCanvasCursor();
    this.overlayDirty = true;
  }

  toMenu(): void {
    this.closeAllModals();
    this.autosave();
    this.detachGame();
    this.hud.setVisible(false);
    this.menu.show();
  }

  /** A save wrapper of the running game (autosave, slots, export), or null (no game, game over, watching a replay). */
  saveWrapper(): storage.SaveWrapper | null {
    const g = this.game;
    if (!g || g.state.over || this.replayView) return null;
    const s = g.state;
    const data = g.serialize();
    // the Esc menu pauses the game only while it is open, so never save that pause
    const saved = data as { state?: { paused?: boolean } } | null;
    if (this._pausedByMenu && saved && saved.state) saved.state.paused = false;
    return { v: 1, at: Date.now(), meta: { mapId: s.mapId, difficulty: s.difficulty, mode: s.mode, wave: s.wave, ...(this.daily ? { daily: this.daily } : {}) }, data };
  }

  autosave(): void {
    try { const w = this.saveWrapper(); if (w) storage.saveGame(w); } catch (e) { /* never break the game over a failed save */ }
  }

  /** Load a save wrapper (autosave, slot or import) as the running game. Returns an error text or null. */
  loadWrapper(w: storage.SaveWrapper): string | null {
    let game: AppGame;
    try { game = this.restoreGame(w.data); } catch (e) { console.error(e); return e instanceof Error ? e.message : 'The save could not be loaded.'; }
    this.closeAllModals();
    this.attachGame(game);
    this.daily = typeof w.meta?.daily === 'string' ? w.meta.daily : null;
    return null;
  }

  /** Saves dialog: the autosave and the slots (load, delete, export; "Save here" while a game runs) and import. */
  openSaves(): void {
    const body = h('div', { class: 'os-saves' });
    const msg = h('p', { class: 'os-hint' }, '');
    const desc = (w: storage.SaveWrapper | null): string => {
      if (!w) return 'Empty';
      const map = MAPS_BY_ID[w.meta.mapId];
      let when = '';
      try { when = w.at ? new Date(w.at).toLocaleString() : ''; } catch (e) { /* ignore */ }
      return `${map ? map.name : w.meta.mapId}, ${DIFFICULTIES[w.meta.difficulty]?.name || w.meta.difficulty}${w.meta.mode === 'sandbox' ? ' (Sandbox)' : ''}, wave ${w.meta.wave}${w.meta.daily ? ', daily ' + w.meta.daily : ''}${when ? ' - ' + when : ''}`;
    };
    const exportFile = (w: storage.SaveWrapper): void => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(w)], { type: 'application/json' }));
      const a = h('a', { href: url, download: `onslaught-save-${w.meta.mapId}-wave${w.meta.wave}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    const btn = (label: string, fn: () => void, cls = ''): HTMLButtonElement => { const b = h('button', { class: 'os-btn small ' + cls, type: 'button' }, label); b.addEventListener('click', fn); return b; };
    const render = (): void => {
      const rows: HTMLElement[] = [];
      const auto = storage.loadGame();
      rows.push(h('div', { class: 'os-save-row' }, h('b', null, 'Autosave'), h('span', null, desc(auto)),
        auto ? btn('Load', () => { msg.textContent = this.loadWrapper(auto) || ''; }) : null, auto ? btn('Export', () => exportFile(auto)) : null));
      const cur = this.saveWrapper();
      for (let i = 1; i <= storage.SLOT_COUNT; i++) {
        const w = storage.getSlot(i);
        rows.push(h('div', { class: 'os-save-row' }, h('b', null, 'Slot ' + i), h('span', null, desc(w)),
          cur ? btn('Save here', () => { const c = this.saveWrapper(); if (c && storage.saveSlot(i, c)) { msg.textContent = 'Saved in slot ' + i + '.'; render(); } else msg.textContent = 'Could not save (storage full or disabled?).'; }, 'primary') : null,
          w ? btn('Load', () => { msg.textContent = this.loadWrapper(w) || ''; }) : null,
          w ? btn('Export', () => exportFile(w)) : null,
          w ? btn('Delete', () => { storage.clearSlot(i); msg.textContent = 'Slot ' + i + ' cleared.'; render(); }, 'danger') : null));
      }
      body.replaceChildren(...rows);
    };
    const file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Import a save file' });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      f.text().then((t) => {
        let w: storage.SaveWrapper | null = null;
        try { w = storage.cleanSaveWrapper(JSON.parse(t)); } catch (e) { w = null; }
        msg.textContent = w ? (this.loadWrapper(w) || '') : 'That file is not an OnSlaught2.26 save.';
      }, () => { msg.textContent = 'Could not read the file.'; });
    });
    render();
    this.openModal('Saves', h('div', { class: 'os-help' }, body, h('h3', null, 'Import'), h('p', { class: 'os-hint' }, 'Load a save file exported here or on another device:'), file, msg),
      { cls: 'wide', buttons: [{ label: 'Close', cls: 'primary', onClick: (hd) => hd.close() }] });
  }

  // =================================================================== game events
  onGameEvent(name: GameEventName, p: LooseEvent): void {
    const a = this.audio;
    if (this.tutorial) this.tutorial.observe(name, typeof p.kind === 'string' ? p.kind : undefined);
    if (name === 'combo' || name === 'gameover' || (name === 'kill' && !this.earned.firstKill)) this.checkAchievements({ name, payload: p as Record<string, unknown> });
    else if (this.settings.hints && !this.replayView) this.hints.onEvent(name, p as Record<string, unknown>);
    switch (name) {
      case 'shot': {
        let kind: string | null | undefined = p.kind;
        if (!kind && p.turretId != null && this.game) { const t = this.game.state.turrets.find((x) => x.id === p.turretId); kind = t && t.kind; }
        a.shot(kind);
        break;
      }
      case 'kill': a.play('kill'); break;
      case 'blast': a.play('blast_' + (BLAST_SOUND[p.size as string | number] || 'small')); break;
      case 'combo': a.play('combo'); if (typeof p.id === 'string') storage.recordCombo(p.id); this.hud.toast('Combo: ' + (p.name || 'Combo') + '!', 'combo'); break;
      case 'wave': a.play('horn'); this.hud.announce('Wave ' + (p.wave ?? '') + ' started'); this.checkUnlocks(p.wave != null ? p.wave : this.game!.state.wave); break;
      case 'leak': a.play('alarm'); this.hud.flashLeak(); this.hud.announce('Leak! ' + (p.lives ?? '') + ' lives left'); break;
      case 'build': a.play('build'); break;
      case 'sell': a.play('sell'); if (p.refund != null) this.hud.addLog('Sold for ' + formatCash(p.refund)); break;
      case 'upgrade': a.play('upgrade'); break;
      case 'undo': a.play('sell'); if (p.refund != null) this.hud.addLog('Undone, refunded ' + formatCash(p.refund)); break;
      case 'unlock': {
        const def = p.kind != null ? TURRETS[p.kind] : undefined;
        this.hud.toast('Unlocked: ' + (def ? def.name : p.kind), 'unlock');
        this.hud.addLog('New turret available: ' + (def ? def.name : p.kind));
        a.play('unlock');
        break;
      }
      case 'error': this.errSeq++; this.showError(p.reason || 'Not possible'); break;
      case 'message': if (p.text) this.hud.addLog(p.text); break;
      case 'gameover': this.onGameOver(p); break;
      default: break;
    }
  }

  showError(reason: string): void {
    const c = this.cursor;
    this.hud.showError(String(reason), c.known ? c.cx : window.innerWidth / 2, c.known ? c.cy : window.innerHeight / 2);
    this.audio.play('error');
  }

  onGameOver(p: { score?: number; kills?: number; wave?: number }): void {
    const g = this.game;
    if (!g || this._overShown) return;
    this._overShown = true;
    if (this.replayView) { this.replayEnded(); return; }
    const s = g.state;
    const info: GameOverInfo = { rank: 0, score: p.score != null ? p.score : s.score, kills: p.kills != null ? p.kills : s.kills, wave: p.wave != null ? p.wave : s.wave, mapId: s.mapId, difficulty: s.difficulty, mode: s.mode };
    info.report = buildReportData(s);
    let replay: unknown = null;
    try { replay = this.replays ? this.replays.make(g) : null; } catch (e) { console.error(e); }
    if (this.daily && info.score > 0) {
      const dr = storage.addDailyScore(this.daily, { score: info.score, kills: info.kills, wave: info.wave, date: new Date().toISOString(), ...(s.undoUsed ? { undo: true } : {}) });
      const st = storage.getStats(); st.dailies++; storage.saveStats(st);
      info.daily = { key: this.daily, rank: dr };
      this.checkAchievements(); // the daily goal counts as soon as the score is stored
    }
    info.rank = info.score > 0 ? storage.addScore(info.mapId, info.difficulty, info.mode, { score: info.score, kills: info.kills, wave: info.wave, date: new Date().toISOString(), undo: !!s.undoUsed }) : 0;
    storage.clearGame();
    this.checkUnlocks(info.wave);
    this.cancelMode();
    this.closeAllModals();
    this.audio.play('alarm');
    const m = this.openModal('Game over', buildGameOver(info), {
      cls: '', dismissable: false,
      buttons: [
        ...(replay ? [{ label: 'Save replay', onClick: () => this.downloadReplay(replay) }, { label: 'Copy replay code', onClick: (_h: unknown, el: HTMLButtonElement) => { void this.copyReplay(replay, el); } }] : []),
        { label: 'High scores', onClick: () => this.openScores({ mapId: info.mapId, difficulty: info.difficulty, mode: info.mode, rank: info.rank }) },
        { label: 'Menu', onClick: (hd) => { hd.close(); this.toMenu(); } },
        { label: 'Restart', cls: 'primary', onClick: (hd) => { hd.close(); this.restart(); } },
      ],
    });
    m.kind = 'gameover';
  }

  // =================================================================== replays
  /** Save a replay as a JSON file. */
  downloadReplay(data: unknown): void {
    const info = this.replays ? this.replays.info(data) : null;
    const name = `onslaught-${info ? info.mapId : 'replay'}-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /** Copy a replay code to the clipboard (the button shows the outcome). */
  async copyReplay(data: unknown, el: HTMLButtonElement): Promise<void> {
    try {
      const code = await encodeReplay(data);
      await navigator.clipboard.writeText(code);
      el.textContent = 'Code copied';
    } catch (e) { console.error(e); el.textContent = 'Copy failed'; }
  }

  /** Replays dialog: paste a code or open a file, then watch it. */
  openReplays(): void {
    if (!this.replays) return;
    const area = h('textarea', { class: 'os-replay-code', rows: 4, placeholder: 'Paste a replay code here', 'aria-label': 'Replay code' });
    const file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Replay file' });
    const msg = h('p', { class: 'os-hint' }, 'Replays come from the game-over screen: Save replay or Copy replay code.');
    const load = async (text: string): Promise<void> => {
      try {
        const data = this.replays!.validate(await decodeReplay(text));
        this.closeAllModals();
        this.startReplay(data);
      } catch (e) { msg.textContent = e instanceof Error ? e.message : 'Could not read that replay.'; }
    };
    file.addEventListener('change', () => { const f = file.files && file.files[0]; if (f) f.text().then(load, () => { msg.textContent = 'Could not read the file.'; }); });
    this.openModal('Replays', h('div', { class: 'os-help' }, msg, area, h('div', { style: 'margin-top:.5em' }, file)), {
      cls: '', buttons: [{ label: 'Close', onClick: (hd) => hd.close() }, { label: 'Watch', cls: 'primary', onClick: () => { void load(area.value); } }],
    });
  }

  /** Watch a validated replay: a fresh game plays the recorded commands; the player can only change speed and pause. */
  startReplay(data: unknown): void {
    if (!this.replays) return;
    const pb = this.replays.play(data);
    this.attachGame(pb.game);
    this.replayView = { pb, data, ended: false };
    this.hud.toast('Watching a replay. Speed and pause work; Esc menu to leave.');
  }

  /** The replay reached its end: pause and say whether it reproduced the recorded result. */
  replayEnded(): void {
    const v = this.replayView;
    if (!v || v.ended) return;
    v.ended = true;
    const ok = v.pb.matches();
    try { this.game?.setPaused(true); } catch (e) { /* ignore */ }
    const info = this.replays ? this.replays.info(v.data) : null;
    const text = ok ? `Replay finished: wave ${info?.wave}, score ${formatNum(info?.score ?? 0)}, exactly as recorded.` : 'Replay finished, but the result differs from the recorded one (the file may have been edited or made by another version).';
    this.hud.addLog(text);
    this.openModal('Replay finished', h('p', null, text), { cls: 'narrow', buttons: [{ label: 'Menu', cls: 'primary', onClick: (hd) => { hd.close(); this.toMenu(); } }] });
  }

  // =================================================================== per frame
  frame(dtMs: number): void {
    if (!this.canvas || !this.canvas.isConnected) this.attachCanvas();
    this.fpsAcc += dtMs; this.fpsN++;
    if (this.fpsAcc >= 500) {
      if (this.settings.showFps && this.game) {
        const fps = Math.round((this.fpsN * 1000) / this.fpsAcc);
        const t = fps + ' fps';
        if (this.hud.fps.textContent !== t) this.hud.fps.textContent = t;
      }
      this.fpsAcc = 0; this.fpsN = 0;
    }
    this.musicTick();
    this.padTick(dtMs);
    const game = this.game;
    if (!game) return;
    if (this.cursorDirty) { this.cursorDirty = false; this.updateCursorWorld(); }
    this.hudAcc += dtMs;
    if (this.hudAcc >= 100 || this.hudDirty) { this.hudAcc = 0; this.hudDirty = false; this.tick(); }
    if (this.overlayDirty) this.pushOverlay();
    this.autoSendCheck(game);
    if (game.state.over && !this._overShown) this.onGameOver({});
  }

  /** Poll the first connected gamepad: the left stick moves a cursor, buttons map to actions (PAD_BUTTONS). */
  padTick(dtMs: number): void {
    let pad: Gamepad | null = null;
    try { pad = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find((p): p is Gamepad => !!p && p.connected) || null; } catch (e) { pad = null; }
    if (!pad) { if (this.padActive) { this.padActive = false; this.hud.showPadCursor(null); } return; }
    const r = this.pad.poll(pad, dtMs);
    if (!r.dx && !r.dy && !r.actions.length) { if (this.padActive && this.game) this.hud.showPadCursor(this.cursor); return; }
    if (!this.padActive) { this.padActive = true; if (!this.cursor.known) { this.cursor.cx = window.innerWidth / 2; this.cursor.cy = window.innerHeight / 2; } }
    const c = this.cursor;
    c.cx = Math.max(0, Math.min(window.innerWidth - 1, c.cx + r.dx));
    c.cy = Math.max(0, Math.min(window.innerHeight - 1, c.cy + r.dy));
    c.known = true; c.over = true;
    this.cursorDirty = true;
    this.hud.showPadCursor(this.game ? c : null);
    for (const a of r.actions) this.padAction(a);
  }

  padAction(a: PadAction): void {
    if (a === 'cancel') { this.escapeAction(); return; }
    if (a === 'pause' && !this.game) return;
    // in menus and dialogs A presses the focused button, the stick does not move focus (use Tab / D-pad there)
    if (!this.game || this.modalOpen()) { if (a === 'click' && document.activeElement instanceof HTMLElement) document.activeElement.click(); return; }
    const g = this.game;
    switch (a) {
      case 'click': this.onLeftClick({ clientX: this.cursor.cx, clientY: this.cursor.cy, shiftKey: false }); break;
      case 'buildHere': this.buildAtCursor(); break;
      case 'upDamage': this.upgrade('damage', false); break;
      case 'upRange': this.upgrade('range', false); break;
      case 'upRate': this.upgrade('rate', false); break;
      case 'rackPrev': this.rackStep(-1); break;
      case 'rackNext': this.rackStep(1); break;
      case 'sendWave': this.sendWave(); break;
      case 'pause': this.togglePause(); break;
      case 'target': this.cycleTarget(); break;
      case 'ranges': this.toggleRanges(); break;
      case 'speedUp': case 'speedDown': {
        const i = SPEEDS.indexOf(g.state.speed);
        this.setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + (a === 'speedUp' ? 1 : -1)))]);
        break;
      }
    }
    this.hudDirty = true;
  }

  /** Music: calm in the menu, follows the pressure in a game, silent while paused, after game over or at volume 0. */
  musicTick(): void {
    const m = this.audio.music();
    if (!m) return;
    const g = this.game;
    const quiet = this.settings.musicVolume <= 0 || this.settings.muted || (g != null && (g.state.paused || g.state.over));
    if (quiet) { if (m.playing) m.stop(); return; }
    if (!m.playing) m.start();
    m.setIntensity(g ? musicIntensity(g.state, DIFFICULTIES[g.state.difficulty]?.lives || 10) : 0);
  }

  /** Auto-send (setting autoSend): once the player has started wave 1, send the next wave when the field is clear. */
  autoSendCheck(game: AppGame): void {
    const s = game.state;
    if (this.replayView) return;
    if (!this.settings.autoSend || s.wave < 1 || s.over || s.paused || this.modalOpen()) return;
    if (game.waveActive()) return;
    this.sendWave();
  }

  toggleAutoSend(): void {
    this.updateSettings({ autoSend: !this.settings.autoSend });
    this.hud.toast(this.settings.autoSend ? 'Auto-send on: the next wave starts when the field is clear' : 'Auto-send off');
    this.hudDirty = true;
  }

  tick(): void {
    const game = this.game!;
    const s = game.state;
    this.audio.setSpeed(s.speed);
    if (this.focusId != null && !s.attackers.some((a) => a.id === this.focusId)) {
      this.focusId = null;
      try { game.focusFire(null); } catch (e) { /* ignore */ }
    }
    if (this.mode === 'build' || this.mode === 'move') this.cursorDirty = true;   // validity depends on cash, camera may move
    this.hud.update();
    this.coachTick();
    if (this.replayView && !this.replayView.ended && this.replayView.pb.done()) this.replayEnded();
    if (++this._achTick % 10 === 0) this.checkAchievements(); // about once a second
  }

  /** Advance the tutorial when its goal is met, keep the highlight on the (rebuilt) target. */
  coachTick(): void {
    const t = this.tutorial;
    if (!this.game) return;
    if (!t) { this.tipTick(); return; }
    if (t.check({ state: this.game.state, tab: this.hud.refs?.active ?? null })) this.renderCoach();
    else if (!t.over) this.setCoachTarget(t.step.target || null);
  }

  // =================================================================== overlay and cursor
  setCanvasCursor(): void { if (this.canvas) this.canvas.style.cursor = this.mode !== 'none' ? 'crosshair' : ''; }

  snap(x: number, y: number): { x: number; y: number } {
    if (!this.settings.snap) return { x, y };
    return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID };
  }

  ghostKind(): string | null {
    if (this.mode === 'build') return this.armed;
    if (this.mode === 'move') {
      const t = this.selectedTurret();
      return t ? t.kind : null;
    }
    return null;
  }

  selectedTurret(): TurretState | null {
    if (!this.game || this.selectedId == null) return null;
    return this.game.state.turrets.find((t) => t.id === this.selectedId) || null;
  }

  updateCursorWorld(): void {
    const game = this.game;
    const c = this.cursor;
    if (!game || !c.over) { if (this.ghost || this.hoverId != null) { this.ghost = null; this.hoverId = null; this.overlayDirty = true; } return; }
    const w = this.renderer.screenToWorld(c.cx, c.cy);
    c.wx = w.x; c.wy = w.y;
    const kind = this.ghostKind();
    if (kind) {
      const p = this.snap(w.x, w.y);
      let valid = false;
      try {
        const r = game.canBuild(kind, p.x, p.y);
        valid = !!(r && r.ok);
        if (!valid && this.mode === 'move' && r && !r.ok && /cash|afford|money/i.test(String(r.reason || ''))) valid = true;
      } catch (e) { valid = false; }
      this.ghost = { kind, x: p.x, y: p.y, valid };
      this.hoverId = null;
    } else {
      this.ghost = null;
      let hid: number | null | undefined = null;
      try { hid = game.turretAt(w.x, w.y); } catch (e) { hid = null; }
      if (hid === undefined) hid = null;
      this.hoverId = hid;
    }
    this.overlayDirty = true;
  }

  pushOverlay(): void {
    this.overlayDirty = false;
    try {
      this.renderer.setOverlay({
        ghost: this.ghost,
        selectedId: this.selectedId,
        hoverId: this.hoverId,
        showRanges: this.showRanges,
        showCombo: this.showCombo,
        joinFromId: this.mode === 'join' ? this.selectedId : null,
        previewRange: this.previewRange,
        colorSymbols: this.settings.colorSymbols,
      });
    } catch (e) { console.error(e); }
  }

  worldAt(clientX: number, clientY: number): { x: number; y: number } { return this.renderer.screenToWorld(clientX, clientY); }

  // =================================================================== pointer input
  bindGlobal(): void {
    const unlockAudio = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: true });
    document.addEventListener('visibilitychange', () => {
      const g = this.game;
      if (document.visibilityState === 'hidden') {
        this.autosave();
        // auto-pause a running game while the tab is hidden (setting); a manual pause is left alone
        if (this.settings.autoPause && g && !g.state.over && !g.state.paused) {
          try { g.setPaused(true); this._autoPaused = true; } catch (e) { /* ignore */ }
        }
        return;
      }
      // back on the tab: resume only what the auto-pause paused
      if (this._autoPaused && g && !g.state.over && g.state.paused) { try { g.setPaused(false); } catch (e) { /* ignore */ } }
      this._autoPaused = false;
    });
    window.addEventListener('pagehide', () => this.autosave());
    // UI click / hover sounds
    this.root.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (b && !b.disabled) this.audio.play('click');
    });
    this.root.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (b && !b.disabled && !(e.relatedTarget instanceof Node && b.contains(e.relatedTarget))) this.audio.play('hover');
    });
  }

  attachCanvas(): void {
    const c = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (!c || c === this.canvas) return;
    this.canvas = c;
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('pointercancel', (e) => { this.ptrs.delete(e.pointerId); this.down = null; if (!this.ptrs.size) this.multi = false; });
    c.addEventListener('pointerleave', () => { this.cursor.over = false; this.cursorDirty = true; });
    this.setCanvasCursor();
  }

  trackCursor(e: PointerEvent): void {
    const c = this.cursor;
    c.cx = e.clientX; c.cy = e.clientY; c.known = true;
    c.over = e.target === this.canvas;
    this.cursorDirty = true;
  }

  onPointerMove(e: PointerEvent): void {
    this.trackCursor(e);
    if (this.down && this.down.id === e.pointerId && !this.down.moved) {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 10) this.down.moved = true;
    }
  }

  onPointerDown(e: PointerEvent): void {
    this.trackCursor(e);
    this.ptrs.set(e.pointerId, true);
    if (this.ptrs.size > 1) { this.multi = true; this.down = null; this.ghost = null; this.overlayDirty = true; return; }
    this.multi = false;
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, moved: false, touch: e.pointerType === 'touch' };
  }

  onPointerUp(e: PointerEvent): void {
    const d = this.down;
    this.ptrs.delete(e.pointerId);
    const multi = this.multi;
    if (!this.ptrs.size) this.multi = false;
    if (!d || d.id !== e.pointerId) return;
    this.down = null;
    if (multi || !this.game || this.modalOpen()) return;
    // touch in a placement mode: allow dragging the ghost, then place where the finger lifts
    const placing = d.touch && (this.mode === 'build' || this.mode === 'move');
    if (d.moved && !placing) return;
    if (d.button === 2) { if (this.mode !== 'none' || this.focusId != null) this.escapeAction(); return; }
    if (d.button !== 0) return;
    this.onLeftClick(e);
  }

  onLeftClick(e: { clientX: number; clientY: number; shiftKey: boolean }): void {
    const game = this.game!;
    const w = this.worldAt(e.clientX, e.clientY);
    switch (this.mode) {
      case 'build': this.placeAt(this.armed, w.x, w.y, e.shiftKey); break;
      case 'move': this.moveTo(w.x, w.y); break;
      case 'join': this.joinAt(w.x, w.y); break;
      case 'focus': this.focusAt(w.x, w.y); break;
      default: {
        let id: number | null | undefined = null;
        try { id = game.turretAt(w.x, w.y); } catch (err) { id = null; }
        if (id != null) this.select(id); else this.deselect();
      }
    }
    this.hudDirty = true;
    this.cursorDirty = true;
  }

  // =================================================================== command helpers
  run(fn: () => CommandResult | void, view = false): CommandResult | void | null {
    // watching a replay: only view commands (speed, pause) may run, everything else would change the recorded game
    if (this.replayView && !view) { this.hud.toast('Watching a replay: you cannot change this game.'); return null; }
    const seq = this.errSeq;
    let res: CommandResult | void | null = null;
    try { res = fn(); } catch (e) { console.error(e); return null; }
    if (res && res.ok === false && this.errSeq === seq) this.showError(res.reason || 'Not possible');
    this.hudDirty = true;
    return res;
  }

  placeAt(kind: string | null, wx: number, wy: number, keep?: boolean): CommandResult | void | null {
    if (!kind || !this.game) return null;
    const p = this.snap(wx, wy);
    const res = this.run(() => this.game!.build(kind, p.x, p.y));
    if (res && res.ok) {
      if (!keep) {
        this.cancelMode();
        if (res.id != null) this.select(res.id);
      }
    }
    return res;
  }

  moveTo(wx: number, wy: number): void {
    const p = this.snap(wx, wy);
    const res = this.run(() => this.game!.move(this.moveId!, p.x, p.y));
    if (res && res.ok) this.cancelMode();
  }

  joinAt(wx: number, wy: number): void {
    let id: number | null | undefined = null;
    try { id = this.game!.turretAt(wx, wy); } catch (e) { id = null; }
    const from = this.selectedId;
    if (id == null) { this.cancelMode(); return; }
    if (id === from) this.run(() => this.game!.join(from!, null));
    else this.run(() => this.game!.join(from!, id!));
    this.cancelMode();
  }

  focusAt(wx: number, wy: number): void {
    let best: Attacker | null = null;
    let bd = FOCUS_RADIUS;
    for (const a of this.game!.state.attackers) {
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d <= bd) { bd = d; best = a; }
    }
    if (!best) { this.showError('No attacker there'); return; }
    const target: Attacker = best;
    this.focusId = target.id;
    this.run(() => this.game!.focusFire(target.id));
    if (this.mode === 'focus') this.setMode('none');
  }

  // =================================================================== modes and selection
  setMode(m: InputMode): void {
    this.mode = m;
    this.setCanvasCursor();
    this.overlayDirty = true;
    this.cursorDirty = true;
    this.hudDirty = true;
  }

  cancelMode(): void {
    this.armed = null;
    this.moveId = null;
    this.ghost = null;
    this.setMode('none');
  }

  select(id: number): void {
    if (this.mode === 'build') this.cancelMode();
    this.selectedId = id;
    this.overlayDirty = true;
    this.hudDirty = true;
  }

  /** Show (or clear with null) the dashed "range after upgrade" ring. */
  setPreviewRange(p: Overlay['previewRange']): void {
    const cur = this.previewRange;
    if (cur === p || (cur && p && cur.id === p.id && cur.range === p.range)) return;
    this.previewRange = p;
    this.overlayDirty = true;
  }

  deselect(): void {
    if (this.mode === 'move' || this.mode === 'join') this.cancelMode();
    this.selectedId = null;
    this.overlayDirty = true;
    this.hudDirty = true;
  }

  cancelOrDeselect(): void {
    if (this.mode !== 'none') this.cancelMode(); else this.deselect();
  }

  clearFocus(): void {
    if (this.focusId != null || this.mode === 'focus') {
      this.focusId = null;
      if (this.mode === 'focus') this.cancelMode();
      if (this.game) { try { this.game.focusFire(null); } catch (e) { /* ignore */ } }
      this.hudDirty = true;
    }
  }

  modeHint(): string {
    switch (this.mode) {
      case 'build': return `Placing ${TURRETS[this.armed ?? '']?.name || ''}: click to build, Shift+click to keep building, Esc cancels`;
      case 'move': return `Click the new spot (costs ${formatCash(MOVE_COST)}), Esc cancels`;
      case 'join': return 'Click the turret to join with (click the Targeter itself to unjoin), Esc cancels';
      case 'focus': return 'Click an attacker to focus fire on it, Esc cancels';
      default: return '';
    }
  }

  armKind(kind: string, keep?: boolean, noToggle?: boolean): void {
    const game = this.game;
    if (!game) return;
    const def = TURRETS[kind];
    const s = game.state;
    this.rackIndex = BUILD_ORDER.indexOf(kind);
    if (!noToggle && this.mode === 'build' && this.armed === kind) { this.cancelMode(); return; }
    if (!s.unlocked || !s.unlocked[kind]) {
      this.showError(def.unlockKills ? `${def.name} unlocks at ${formatNum(def.unlockKills)} kills` : `${def.name} is locked`);
      return;
    }
    if (s.cash < def.cost) { this.showError(`Not enough cash for ${def.name} (${formatCash(def.cost)})`); return; }
    if (this.mode === 'move' || this.mode === 'join' || this.mode === 'focus') this.cancelMode();
    this.selectedId = null;
    this.armed = kind;
    this.setMode('build');
    void keep;
  }

  rackStep(dir: number): void {
    const s = this.game!.state;
    let i = this.rackIndex;
    for (let n = 0; n < BUILD_ORDER.length; n++) {
      i = (i + dir + BUILD_ORDER.length) % BUILD_ORDER.length;
      if (s.unlocked && s.unlocked[BUILD_ORDER[i]]) break;
    }
    this.rackIndex = i;
    if (this.mode === 'build') this.armKind(BUILD_ORDER[i], false, true);
    this.hudDirty = true;
  }

  buildAtCursor(): void {
    const kind = (this.mode === 'build' ? this.armed : BUILD_ORDER[this.rackIndex]) as string;
    const s = this.game!.state;
    const def = TURRETS[kind];
    if (!s.unlocked || !s.unlocked[kind]) { this.showError(`${def.name} is locked`); return; }
    const c = this.cursor;
    const w = this.worldAt(c.known ? c.cx : window.innerWidth / 2, c.known ? c.cy : window.innerHeight / 2);
    this.placeAt(kind, w.x, w.y, true);
  }

  toggleInfo(): void {
    this.updateSettings({ infoCollapsed: !this.settings.infoCollapsed });
    this.hudDirty = true;
  }

  // =================================================================== commands (buttons and keys)
  needSelection(): TurretState | null {
    const t = this.selectedTurret();
    if (!t) this.showError('Select a turret first');
    return t;
  }

  upgrade(stat: Stat, toMax?: boolean): void {
    const t = this.needSelection();
    if (!t) return;
    let cost: number | null = null;
    try { cost = this.game!.upgradeCost(t.id, stat); } catch (e) { cost = null; }
    if (cost == null) { this.showError('Nothing to upgrade there'); return; }
    this.run(() => this.game!.upgrade(t.id, stat, !!toMax));
  }

  /** Undo the last build or upgrade (only with the Relaxed: undo setting on). */
  undo(): void {
    const g = this.game;
    if (!g) return;
    if (!this.settings.undo) { this.hud.toast('Undo is off. Turn on "Relaxed: undo" in Settings.'); return; }
    const res = this.run(() => g.undo());
    if (res && res.ok && this.selectedId != null && !g.state.turrets.some((t) => t.id === this.selectedId)) this.deselect();
  }

  sell(): void {
    const t = this.needSelection();
    if (!t) return;
    const res = this.run(() => this.game!.sell(t.id));
    if (res && res.ok) { this.deselect(); }
  }

  startMove(): void {
    const t = this.needSelection();
    if (!t) return;
    if (this.mode === 'move') { this.cancelMode(); return; }
    if (this.game!.state.cash < MOVE_COST) { this.showError(`Moving costs ${formatCash(MOVE_COST)}`); return; }
    this.cancelMode();
    this.moveId = t.id;
    this.setMode('move');
  }

  cycleTarget(): void {
    const t = this.needSelection();
    if (!t) return;
    const game = this.game!;
    if (typeof game.cycleTargetMode === 'function') this.run(() => game.cycleTargetMode(t.id));
    else {
      const i = TARGET_MODES.indexOf(t.targetMode);
      this.run(() => game.setTargetMode(t.id, TARGET_MODES[(i + 1) % TARGET_MODES.length]));
    }
  }

  toggleLock(): void { const t = this.needSelection(); if (t) this.run(() => this.game!.toggleLock(t.id)); }

  cycleDirectional(): void { const t = this.needSelection(); if (t) this.run(() => this.game!.cycleDirectional(t.id)); }

  aimDirectional(): void {
    const t = this.needSelection();
    if (!t) return;
    const c = this.cursor;
    if (!c.known) return;
    const w = this.worldAt(c.cx, c.cy);
    const angle = Math.atan2(w.y - t.y, w.x - t.x);
    const mode: DirectionalMode = t.directional && t.directional.mode && t.directional.mode !== 'normal' ? t.directional.mode : 'medium';
    this.run(() => this.game!.setDirectional(t.id, mode, angle));
  }

  toggleJoin(): void {
    const t = this.needSelection();
    if (!t) return;
    if (t.kind !== 'targeter') { this.showError('Only a Targeter can join'); return; }
    if (this.mode === 'join') { this.cancelMode(); return; }
    this.cancelMode();
    this.setMode('join');
  }

  cycleColor(): void {
    const t = this.needSelection();
    if (!t) return;
    if (t.kind !== 'comboOnly') { this.showError('Only Combo-only has a colour'); return; }
    const i = COMBO_COLORS.indexOf(t.comboColor || 'red');
    this.run(() => this.game!.setComboColor(t.id, COMBO_COLORS[(i + 1) % COMBO_COLORS.length]));
  }

  toggleFocusMode(): void {
    if (this.mode === 'focus' || this.focusId != null) { this.clearFocus(); return; }
    this.cancelMode();
    this.setMode('focus');
  }

  sendWave(): void {
    const g = this.game;
    if (!g) return;
    // tutorial: the long hold before wave 1 must not turn into a huge early bonus, so the normal interval comes back
    // first (the bonus is then the usual one) and later waves come by themselves
    if (this.tutorial && g.state.wave === 0) this.restoreWaveInterval();
    this.run(() => g.sendWave());
  }

  /** Give the running game its normal wave interval (setting or difficulty default). */
  restoreWaveInterval(): void {
    const g = this.game;
    if (!g || !g.setWaveInterval) return;
    const ms = this.settings.waveInterval > 0 ? this.settings.waveInterval * 1000 : (DIFFICULTIES[g.state.difficulty]?.waveInterval || 20000);
    try { g.setWaveInterval(ms); } catch (e) { console.error(e); }
  }
  setSpeed(s: number): void { const g = this.game; if (g) { this.run(() => g.setSpeed(s), true); this.audio.setSpeed(s); } }
  togglePause(): void { this._autoPaused = false; const g = this.game; if (g) this.run(() => g.togglePause(), true); }

  toggleRanges(): void { this.showRanges = this.showRanges === 'all' ? 'selected' : 'all'; this.overlayDirty = true; }
  toggleCombo(): void { this.showCombo = !this.showCombo; this.overlayDirty = true; }

  // =================================================================== keyboard
  escapeAction(): void {
    if (this.modals.length) {
      const top = this.modals[this.modals.length - 1];
      if (top.dismissable) top.close();
      return;
    }
    if (!this.game) return;
    if (this.mode !== 'none') { this.cancelMode(); if (this.focusId != null) { /* focus target stays until cleared */ } return; }
    if (this.focusId != null) { this.clearFocus(); return; }
    if (this.selectedId != null) { this.deselect(); return; }
    this.openGameMenu();
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target instanceof HTMLElement ? e.target : null;
    const tag = tg && tg.tagName;
    const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && (tg as HTMLInputElement).type !== 'range' && (tg as HTMLInputElement).type !== 'checkbox') || (tg && tg.isContentEditable);
    if (typing) { if (e.key === 'Escape' && tg && tg.blur) tg.blur(); return; }

    // the controls overlay is waiting for a new key: it gets this one (Escape cancels there)
    if (this.keyCapture) { e.preventDefault(); if (!e.repeat) this.keyCapture(e); return; }
    if (e.key === 'Escape') { e.preventDefault(); if (!e.repeat) this.escapeAction(); return; }

    const code = e.code || '';
    // rebindable actions (src/ui/keymap.ts); Enter is a fixed alias of build, '?' of the controls overlay
    const action: KeyAction | undefined = code === 'Enter' || code === 'NumpadEnter' ? 'build' : (e.key === '?' ? 'keys' : this.keyMap.get(code));
    if ((action === 'settings' || action === 'keys' || action === 'codex') && !e.repeat) {
      e.preventDefault();
      if (action === 'settings') this.toggleSettings(); else if (action === 'codex') this.toggleCodex(); else this.toggleKeys();
      return;
    }
    if (!this.game || this.modalOpen()) return;

    const dm = /^Digit([1-8])$/.exec(code);
    if (dm) {
      e.preventDefault();
      if (e.repeat) return;
      const idx = Number(dm[1]) - 1 + (e.shiftKey ? 8 : 0);
      this.armKind(BUILD_ORDER[idx]);
      return;
    }
    if (code === 'ArrowLeft' || code === 'ArrowRight') { e.preventDefault(); this.rackStep(code === 'ArrowLeft' ? -1 : 1); return; }
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    this.runAction(action, e.shiftKey);
    this.hudDirty = true;
  }

  /** Perform a keyboard action (the handler for KEY_ACTIONS). */
  runAction(action: KeyAction, shift: boolean): void {
    switch (action) {
      case 'upDamage': this.upgrade('damage', shift); break;
      case 'upRange': this.upgrade('range', shift); break;
      case 'upRate': this.upgrade('rate', shift); break;
      case 'sell': this.sell(); break;
      case 'undo': this.undo(); break;
      case 'move': this.startMove(); break;
      case 'ranges': this.toggleRanges(); break;
      case 'combo': this.toggleCombo(); break;
      case 'target': this.cycleTarget(); break;
      case 'lock': this.toggleLock(); break;
      case 'focus': this.toggleFocusMode(); break;
      case 'cone': if (shift) this.aimDirectional(); else this.cycleDirectional(); break;
      case 'join': this.toggleJoin(); break;
      case 'color': this.cycleColor(); break;
      case 'sendWave': this.sendWave(); break;
      case 'autoSend': this.toggleAutoSend(); break;
      case 'pause': this.togglePause(); break;
      case 'info': this.toggleInfo(); break;
      case 'build': this.buildAtCursor(); break;
      case 'settings': this.toggleSettings(); break;
      case 'keys': this.toggleKeys(); break;
      case 'codex': this.toggleCodex(); break;
    }
  }

  /** Rebuild the code -> action lookup from the settings (after a rebind or reset). */
  applyKeys(): void { this.keyMap = codeLookup(resolveBindings(this.settings.keys)); }

  /** Label of the key currently bound to an action ('Q', 'Space', ...), for buttons and hints. */
  keyFor(action: KeyAction): string { return keyLabel(resolveBindings(this.settings.keys)[action]); }

  openKeys(): void {
    if (this.modals.some((m) => m.kind === 'keys')) return;
    const m = this.openModal('Controls', buildKeys(this), {
      cls: 'wide', onClose: () => { this.keyCapture = null; },
      buttons: [{ label: 'Close', cls: 'primary', onClick: (hd) => hd.close() }],
    });
    m.kind = 'keys';
  }
  openCodex(): void {
    if (this.modals.some((m) => m.kind === 'codex')) return;
    if (this.tutorial) this.tutorial.codexOpened = true;
    const m = this.openModal('Combo Codex', buildCodex(storage.getCodex()), { cls: 'wide', buttons: [{ label: 'Close', cls: 'primary', onClick: (hd) => hd.close() }] });
    m.kind = 'codex';
  }
  toggleCodex(): void {
    const open = this.modals.find((m) => m.kind === 'codex');
    if (open) open.close(); else this.openCodex();
  }

  toggleKeys(): void {
    const open = this.modals.find((m) => m.kind === 'keys');
    if (open) open.close(); else this.openKeys();
  }
}
