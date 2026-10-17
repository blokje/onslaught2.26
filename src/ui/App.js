// OnSlaught2.26 UI orchestrator: screens, input, feedback, persistence and audio wiring.
import './ui.css';
import { h } from './dom.js';
import { MAPS } from '../data/maps.js';
import { TURRETS, BUILD_ORDER, MOVE_COST } from '../data/turrets.js';
import { DIFFICULTIES, MODES, TARGET_MODES } from '../data/rules.js';
import * as storage from './storage.js';
import { AudioEngine } from './audio.js';
import { Menu } from './menu.js';
import { Hud } from './hud.js';
import { buildSettings, buildHelp, buildScores, buildGameOver } from './dialogs.js';
import { formatCash, formatNum } from './format.js';

const GRID = 22;
const FOCUS_RADIUS = 16;
const COMBO_COLORS = ['red', 'green', 'blue', 'yellow'];
const GAME_EVENTS = ['shot', 'kill', 'leak', 'wave', 'blast', 'combo', 'build', 'sell', 'upgrade', 'unlock', 'error', 'message', 'gameover'];
const BLAST_SOUND = { small: 'small', medium: 'medium', large: 'large', huge: 'huge', bfg: 'large', poison: 'medium' };

export class App {
  constructor(rootEl, { createGame, restoreGame, renderer }) {
    this.rootEl = rootEl;
    this.createGame = createGame;
    this.restoreGame = restoreGame;
    this.renderer = renderer;
    this.game = null;

    this.settings = storage.getSettings();
    this.unlocks = storage.getUnlocks();
    this.audio = new AudioEngine();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(this.settings.muted);

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
    this.lastSel = null;

    // DOM
    this.root = h('div', { class: 'os-root' });
    this.menu = new Menu(this);
    this.hud = new Hud(this);
    this.root.append(this.menu.el, this.hud.el, this.buildRotateNotice());
    rootEl.append(this.root);
    this.menu.show();
    this.applyFps();

    this.bindGlobal();
    this.attachCanvas();
    this._saveTimer = setInterval(() => this.autosave(), 10000);
  }

  // =================================================================== DOM helpers
  buildRotateNotice() {
    return h('div', { class: 'os-rotate' },
      h('div', { html: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="14" y="4" width="20" height="40" rx="4" fill="none" stroke="#ffd27a" stroke-width="3"/><circle cx="24" cy="38" r="2" fill="#ffd27a"/></svg>' }),
      h('div', null, 'Please rotate to landscape'));
  }

  openModal(title, content, o = {}) {
    const dismissable = o.dismissable !== false;
    const layer = h('div', { class: 'os-modal-layer' });
    const handle = { el: layer, dismissable, onClose: o.onClose || null };
    handle.close = () => {
      const i = this.modals.indexOf(handle);
      if (i < 0) return;
      this.modals.splice(i, 1);
      layer.remove();
      if (handle.onClose) handle.onClose();
      this.hudDirty = true;
    };
    const closeBtn = dismissable ? h('button', { class: 'os-iconbtn', type: 'button', title: 'Close (Esc)', onclick: () => handle.close() }, '×') : null;
    const foot = o.buttons ? h('div', { class: 'os-modal-foot' }, ...o.buttons.map((b) => {
      const el = h('button', { class: 'os-btn ' + (b.cls || ''), type: 'button' }, b.label);
      el.addEventListener('click', () => b.onClick(handle, el));
      return el;
    })) : null;
    layer.append(h('div', { class: 'os-modal ' + (o.cls || '') },
      h('div', { class: 'os-modal-head' }, h('h2', null, title), closeBtn),
      h('div', { class: 'os-modal-body' }, content), foot));
    if (dismissable) layer.addEventListener('pointerdown', (e) => { if (e.target === layer) handle.close(); });
    this.root.append(layer);
    this.modals.push(handle);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    return handle;
  }

  modalOpen() { return this.modals.length > 0; }
  closeAllModals() { while (this.modals.length) this.modals[this.modals.length - 1].close(); }

  openSettings() {
    if (this.modals.some((m) => m.kind === 'settings')) return;
    const m = this.openModal('Settings', buildSettings(this), { cls: '', buttons: [{ label: 'Done', cls: 'primary', onClick: (hd) => hd.close() }] });
    m.kind = 'settings';
  }
  toggleSettings() {
    const open = this.modals.find((m) => m.kind === 'settings');
    if (open) open.close(); else this.openSettings();
  }
  openHelp() { this.openModal('How to play', buildHelp(), { cls: 'wide', buttons: [{ label: 'Close', cls: 'primary', onClick: (hd) => hd.close() }] }); }
  openScores(highlight) { this.openModal('High scores', buildScores(this, highlight), { cls: 'narrow wide', buttons: [{ label: 'Close', cls: 'primary', onClick: (hd) => hd.close() }] }); }

  openGameMenu() {
    if (!this.game || this.modals.some((m) => m.kind === 'gamemenu')) return;
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
        { label: 'Quit to menu', cls: 'danger', onClick: (hd) => { this._pausedByMenu = false; hd.close(); this.toMenu(); } },
      ],
    });
    m.kind = 'gamemenu';
  }

  // =================================================================== settings, unlocks
  updateSettings(patch) {
    Object.assign(this.settings, patch);
    storage.saveSettings(this.settings);
    if ('volume' in patch) this.audio.setVolume(this.settings.volume);
    if ('muted' in patch) this.audio.setMuted(this.settings.muted);
    if ('showFps' in patch) this.applyFps();
    if ('unlockAll' in patch || 'waveInterval' in patch) this.menu.refresh();
  }

  applyFps() { this.hud.fps.style.display = this.settings.showFps ? '' : 'none'; if (!this.settings.showFps) this.hud.fps.textContent = ''; }

  isDifficultyUnlocked(id) { return !DIFFICULTIES[id]?.unlock || this.settings.unlockAll || !!this.unlocks[id]; }
  isModeUnlocked(id) { return !MODES[id]?.unlock || this.settings.unlockAll || !!this.unlocks[id]; }

  resetProgress() {
    storage.resetProgress();
    this.unlocks = storage.getUnlocks();
    this.menu.refresh();
  }

  checkUnlocks(wave) {
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
  startGame(sel) {
    this.closeAllModals();
    const opts = { mapId: sel.mapId, difficulty: sel.difficulty, mode: sel.mode, unlockAll: !!this.settings.unlockAll };
    if (this.settings.waveInterval > 0) opts.waveInterval = this.settings.waveInterval * 1000;
    let game;
    try { game = this.createGame(opts); } catch (e) { console.error(e); this.menu.show(); this.menu.flash('Could not start the game.'); return; }
    this.attachGame(game);
  }

  continueGame() {
    const save = storage.loadGame();
    if (!save) return;
    let game;
    try { game = this.restoreGame(save.data); } catch (e) {
      console.error(e);
      storage.clearGame();
      this.menu.refresh();
      this.menu.flash('The saved game could not be loaded.');
      return;
    }
    this.closeAllModals();
    this.attachGame(game);
  }

  restart() {
    if (!this.game) return;
    const s = this.game.state;
    this.startGame({ mapId: s.mapId, difficulty: s.difficulty, mode: s.mode });
  }

  attachGame(game) {
    this.detachGame();
    this.game = game;
    this.renderer.setGame(game);
    this.renderer.resetView();
    this.handlers = GAME_EVENTS.map((name) => {
      const fn = (p) => this.onGameEvent(name, p || {});
      game.on(name, fn);
      return [name, fn];
    });
    this.resetInput();
    this._overShown = false;
    this._pausedByMenu = false;
    this.audio.setSpeed(game.state.speed);
    this.menu.hide();
    this.hud.setVisible(true);
    this.hud.panelKey = '';
    this.hudDirty = true;
    this.overlayDirty = true;
    this.attachCanvas();
  }

  detachGame() {
    if (this.game) for (const [name, fn] of this.handlers) { try { this.game.off(name, fn); } catch (e) { /* ignore */ } }
    this.handlers = [];
    this.game = null;
    this.resetInput();
  }

  resetInput() {
    this.mode = 'none'; this.armed = null; this.moveId = null; this.selectedId = null; this.focusId = null;
    this.ghost = null; this.hoverId = null; this.showCombo = false; this.showRanges = 'selected';
    this.setCanvasCursor();
    this.overlayDirty = true;
  }

  toMenu() {
    this.closeAllModals();
    this.autosave();
    this.detachGame();
    this.hud.setVisible(false);
    this.menu.show();
  }

  autosave() {
    const g = this.game;
    if (!g || g.state.over) return;
    try {
      const s = g.state;
      storage.saveGame({ v: 1, at: Date.now(), meta: { mapId: s.mapId, difficulty: s.difficulty, mode: s.mode, wave: s.wave }, data: g.serialize() });
    } catch (e) { /* never break the game over a failed save */ }
  }

  // =================================================================== game events
  onGameEvent(name, p) {
    const a = this.audio;
    switch (name) {
      case 'shot': {
        let kind = p.kind;
        if (!kind && p.turretId != null && this.game) { const t = this.game.state.turrets.find((x) => x.id === p.turretId); kind = t && t.kind; }
        a.shot(kind);
        break;
      }
      case 'kill': a.play('kill'); break;
      case 'blast': a.play('blast_' + (BLAST_SOUND[p.size] || 'small')); break;
      case 'combo': a.play('combo'); this.hud.toast('Combo: ' + (p.name || 'Combo') + '!', 'combo'); break;
      case 'wave': a.play('horn'); this.checkUnlocks(p.wave != null ? p.wave : this.game.state.wave); break;
      case 'leak': a.play('alarm'); this.hud.flashLeak(); break;
      case 'build': a.play('build'); break;
      case 'sell': a.play('sell'); if (p.refund != null) this.hud.addLog('Sold for ' + formatCash(p.refund)); break;
      case 'upgrade': a.play('upgrade'); break;
      case 'unlock': {
        const def = TURRETS[p.kind];
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

  showError(reason) {
    const c = this.cursor;
    this.hud.showError(String(reason), c.known ? c.cx : window.innerWidth / 2, c.known ? c.cy : window.innerHeight / 2);
    this.audio.play('error');
  }

  onGameOver(p) {
    const g = this.game;
    if (!g || this._overShown) return;
    this._overShown = true;
    const s = g.state;
    const info = { score: p.score != null ? p.score : s.score, kills: p.kills != null ? p.kills : s.kills, wave: p.wave != null ? p.wave : s.wave, mapId: s.mapId, difficulty: s.difficulty, mode: s.mode };
    info.rank = info.score > 0 ? storage.addScore(info.mapId, info.difficulty, info.mode, { score: info.score, kills: info.kills, wave: info.wave, date: new Date().toISOString() }) : 0;
    storage.clearGame();
    this.checkUnlocks(info.wave);
    this.cancelMode();
    this.closeAllModals();
    this.audio.play('alarm');
    const m = this.openModal('Game over', buildGameOver(this, info), {
      cls: 'narrow', dismissable: false,
      buttons: [
        { label: 'High scores', onClick: () => this.openScores({ mapId: info.mapId, difficulty: info.difficulty, mode: info.mode, rank: info.rank }) },
        { label: 'Menu', onClick: (hd) => { hd.close(); this.toMenu(); } },
        { label: 'Restart', cls: 'primary', onClick: (hd) => { hd.close(); this.restart(); } },
      ],
    });
    m.kind = 'gameover';
  }

  // =================================================================== per frame
  frame(dtMs) {
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
    const game = this.game;
    if (!game) return;
    if (this.cursorDirty) { this.cursorDirty = false; this.updateCursorWorld(); }
    this.hudAcc += dtMs;
    if (this.hudAcc >= 100 || this.hudDirty) { this.hudAcc = 0; this.hudDirty = false; this.tick(); }
    if (this.overlayDirty) this.pushOverlay();
    if (game.state.over && !this._overShown) this.onGameOver({});
  }

  tick() {
    const game = this.game;
    const s = game.state;
    this.audio.setSpeed(s.speed);
    if (this.focusId != null && !s.attackers.some((a) => a.id === this.focusId)) {
      this.focusId = null;
      try { game.focusFire(null); } catch (e) { /* ignore */ }
    }
    if (this.mode === 'build' || this.mode === 'move') this.cursorDirty = true;   // validity depends on cash, camera may move
    this.hud.update();
  }

  // =================================================================== overlay and cursor
  setCanvasCursor() { if (this.canvas) this.canvas.style.cursor = this.mode !== 'none' ? 'crosshair' : ''; }

  snap(x, y) {
    if (!this.settings.snap) return { x, y };
    return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID };
  }

  ghostKind() {
    if (this.mode === 'build') return this.armed;
    if (this.mode === 'move') {
      const t = this.selectedTurret();
      return t ? t.kind : null;
    }
    return null;
  }

  selectedTurret() {
    if (!this.game || this.selectedId == null) return null;
    return this.game.state.turrets.find((t) => t.id === this.selectedId) || null;
  }

  updateCursorWorld() {
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
        if (!valid && this.mode === 'move' && r && /cash|afford|money/i.test(String(r.reason || ''))) valid = true;
      } catch (e) { valid = false; }
      this.ghost = { kind, x: p.x, y: p.y, valid };
      this.hoverId = null;
    } else {
      this.ghost = null;
      let hid = null;
      try { hid = game.turretAt(w.x, w.y); } catch (e) { hid = null; }
      if (hid === undefined) hid = null;
      this.hoverId = hid;
    }
    this.overlayDirty = true;
  }

  pushOverlay() {
    this.overlayDirty = false;
    try {
      this.renderer.setOverlay({
        ghost: this.ghost,
        selectedId: this.selectedId,
        hoverId: this.hoverId,
        showRanges: this.showRanges,
        showCombo: this.showCombo,
        joinFromId: this.mode === 'join' ? this.selectedId : null,
      });
    } catch (e) { console.error(e); }
  }

  worldAt(clientX, clientY) { return this.renderer.screenToWorld(clientX, clientY); }

  // =================================================================== pointer input
  bindGlobal() {
    const unlockAudio = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      this.autosave();
      // auto-pause a running game while the tab is hidden; it stays paused on return (no auto-resume)
      const g = this.game;
      if (g && !g.state.over && !g.state.paused) { try { g.setPaused(true); } catch (e) { /* ignore */ } }
    });
    window.addEventListener('pagehide', () => this.autosave());
    // UI click / hover sounds
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled) this.audio.play('click');
    });
    this.root.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled && !(e.relatedTarget && b.contains(e.relatedTarget))) this.audio.play('hover');
    });
  }

  attachCanvas() {
    const c = document.querySelector('#game canvas');
    if (!c || c === this.canvas) return;
    this.canvas = c;
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('pointercancel', (e) => { this.ptrs.delete(e.pointerId); this.down = null; if (!this.ptrs.size) this.multi = false; });
    c.addEventListener('pointerleave', () => { this.cursor.over = false; this.cursorDirty = true; });
    this.setCanvasCursor();
  }

  trackCursor(e) {
    const c = this.cursor;
    c.cx = e.clientX; c.cy = e.clientY; c.known = true;
    c.over = e.target === this.canvas;
    this.cursorDirty = true;
  }

  onPointerMove(e) {
    this.trackCursor(e);
    if (this.down && this.down.id === e.pointerId && !this.down.moved) {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 10) this.down.moved = true;
    }
  }

  onPointerDown(e) {
    this.trackCursor(e);
    this.ptrs.set(e.pointerId, true);
    if (this.ptrs.size > 1) { this.multi = true; this.down = null; this.ghost = null; this.overlayDirty = true; return; }
    this.multi = false;
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, moved: false, touch: e.pointerType === 'touch' };
  }

  onPointerUp(e) {
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

  onLeftClick(e) {
    const game = this.game;
    const w = this.worldAt(e.clientX, e.clientY);
    switch (this.mode) {
      case 'build': this.placeAt(this.armed, w.x, w.y, e.shiftKey); break;
      case 'move': this.moveTo(w.x, w.y); break;
      case 'join': this.joinAt(w.x, w.y); break;
      case 'focus': this.focusAt(w.x, w.y); break;
      default: {
        let id = null;
        try { id = game.turretAt(w.x, w.y); } catch (err) { id = null; }
        if (id != null) this.select(id); else this.deselect();
      }
    }
    this.hudDirty = true;
    this.cursorDirty = true;
  }

  // =================================================================== command helpers
  run(fn) {
    const seq = this.errSeq;
    let res = null;
    try { res = fn(); } catch (e) { console.error(e); return null; }
    if (res && res.ok === false && this.errSeq === seq) this.showError(res.reason || 'Not possible');
    this.hudDirty = true;
    return res;
  }

  placeAt(kind, wx, wy, keep) {
    if (!kind || !this.game) return null;
    const p = this.snap(wx, wy);
    const res = this.run(() => this.game.build(kind, p.x, p.y));
    if (res && res.ok) {
      if (!keep) {
        this.cancelMode();
        if (res.id != null) this.select(res.id);
      }
    }
    return res;
  }

  moveTo(wx, wy) {
    const p = this.snap(wx, wy);
    const res = this.run(() => this.game.move(this.moveId, p.x, p.y));
    if (res && res.ok) this.cancelMode();
  }

  joinAt(wx, wy) {
    let id = null;
    try { id = this.game.turretAt(wx, wy); } catch (e) { id = null; }
    const from = this.selectedId;
    if (id == null) { this.cancelMode(); return; }
    if (id === from) this.run(() => this.game.join(from, null));
    else this.run(() => this.game.join(from, id));
    this.cancelMode();
  }

  focusAt(wx, wy) {
    let best = null;
    let bd = FOCUS_RADIUS;
    for (const a of this.game.state.attackers) {
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d <= bd) { bd = d; best = a; }
    }
    if (!best) { this.showError('No attacker there'); return; }
    this.focusId = best.id;
    this.run(() => this.game.focusFire(best.id));
    if (this.mode === 'focus') this.setMode('none');
  }

  // =================================================================== modes and selection
  setMode(m) {
    this.mode = m;
    this.setCanvasCursor();
    this.overlayDirty = true;
    this.cursorDirty = true;
    this.hudDirty = true;
  }

  cancelMode() {
    this.armed = null;
    this.moveId = null;
    this.ghost = null;
    this.setMode('none');
  }

  select(id) {
    if (this.mode === 'build') this.cancelMode();
    this.selectedId = id;
    this.overlayDirty = true;
    this.hudDirty = true;
  }

  deselect() {
    if (this.mode === 'move' || this.mode === 'join') this.cancelMode();
    this.selectedId = null;
    this.overlayDirty = true;
    this.hudDirty = true;
  }

  cancelOrDeselect() {
    if (this.mode !== 'none') this.cancelMode(); else this.deselect();
  }

  clearFocus() {
    if (this.focusId != null || this.mode === 'focus') {
      this.focusId = null;
      if (this.mode === 'focus') this.cancelMode();
      if (this.game) { try { this.game.focusFire(null); } catch (e) { /* ignore */ } }
      this.hudDirty = true;
    }
  }

  modeHint() {
    switch (this.mode) {
      case 'build': return `Placing ${TURRETS[this.armed]?.name || ''}: click to build, Shift+click to keep building, Esc cancels`;
      case 'move': return `Click the new spot (costs ${formatCash(MOVE_COST)}), Esc cancels`;
      case 'join': return 'Click the turret to join with (click the Targeter itself to unjoin), Esc cancels';
      case 'focus': return 'Click an attacker to focus fire on it, Esc cancels';
      default: return '';
    }
  }

  armKind(kind, keep, noToggle) {
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

  rackStep(dir) {
    const s = this.game.state;
    let i = this.rackIndex;
    for (let n = 0; n < BUILD_ORDER.length; n++) {
      i = (i + dir + BUILD_ORDER.length) % BUILD_ORDER.length;
      if (s.unlocked && s.unlocked[BUILD_ORDER[i]]) break;
    }
    this.rackIndex = i;
    if (this.mode === 'build') this.armKind(BUILD_ORDER[i], false, true);
    this.hudDirty = true;
  }

  buildAtCursor() {
    const kind = this.mode === 'build' ? this.armed : BUILD_ORDER[this.rackIndex];
    const s = this.game.state;
    const def = TURRETS[kind];
    if (!s.unlocked || !s.unlocked[kind]) { this.showError(`${def.name} is locked`); return; }
    const c = this.cursor;
    const w = this.worldAt(c.known ? c.cx : window.innerWidth / 2, c.known ? c.cy : window.innerHeight / 2);
    this.placeAt(kind, w.x, w.y, true);
  }

  toggleInfo() {
    this.updateSettings({ infoCollapsed: !this.settings.infoCollapsed });
    this.hudDirty = true;
  }

  // =================================================================== commands (buttons and keys)
  needSelection() {
    const t = this.selectedTurret();
    if (!t) this.showError('Select a turret first');
    return t;
  }

  upgrade(stat, toMax) {
    const t = this.needSelection();
    if (!t) return;
    let cost = null;
    try { cost = this.game.upgradeCost(t.id, stat); } catch (e) { cost = null; }
    if (cost == null) { this.showError('Nothing to upgrade there'); return; }
    this.run(() => this.game.upgrade(t.id, stat, !!toMax));
  }

  sell() {
    const t = this.needSelection();
    if (!t) return;
    const res = this.run(() => this.game.sell(t.id));
    if (res && res.ok) { this.deselect(); }
  }

  startMove() {
    const t = this.needSelection();
    if (!t) return;
    if (this.mode === 'move') { this.cancelMode(); return; }
    if (this.game.state.cash < MOVE_COST) { this.showError(`Moving costs ${formatCash(MOVE_COST)}`); return; }
    this.cancelMode();
    this.moveId = t.id;
    this.setMode('move');
  }

  cycleTarget() {
    const t = this.needSelection();
    if (!t) return;
    if (typeof this.game.cycleTargetMode === 'function') this.run(() => this.game.cycleTargetMode(t.id));
    else {
      const i = TARGET_MODES.indexOf(t.targetMode);
      this.run(() => this.game.setTargetMode(t.id, TARGET_MODES[(i + 1) % TARGET_MODES.length]));
    }
  }

  toggleLock() { const t = this.needSelection(); if (t) this.run(() => this.game.toggleLock(t.id)); }

  cycleDirectional() { const t = this.needSelection(); if (t) this.run(() => this.game.cycleDirectional(t.id)); }

  aimDirectional() {
    const t = this.needSelection();
    if (!t) return;
    const c = this.cursor;
    if (!c.known) return;
    const w = this.worldAt(c.cx, c.cy);
    const angle = Math.atan2(w.y - t.y, w.x - t.x);
    const mode = t.directional && t.directional.mode && t.directional.mode !== 'normal' ? t.directional.mode : 'medium';
    this.run(() => this.game.setDirectional(t.id, mode, angle));
  }

  toggleJoin() {
    const t = this.needSelection();
    if (!t) return;
    if (t.kind !== 'targeter') { this.showError('Only a Targeter can join'); return; }
    if (this.mode === 'join') { this.cancelMode(); return; }
    this.cancelMode();
    this.setMode('join');
  }

  cycleColor() {
    const t = this.needSelection();
    if (!t) return;
    if (t.kind !== 'comboOnly') { this.showError('Only Combo-only has a colour'); return; }
    const i = COMBO_COLORS.indexOf(t.comboColor || 'red');
    this.run(() => this.game.setComboColor(t.id, COMBO_COLORS[(i + 1) % COMBO_COLORS.length]));
  }

  toggleFocusMode() {
    if (this.mode === 'focus' || this.focusId != null) { this.clearFocus(); return; }
    this.cancelMode();
    this.setMode('focus');
  }

  sendWave() { if (this.game) this.run(() => this.game.sendWave()); }
  setSpeed(s) { if (this.game) { this.run(() => this.game.setSpeed(s)); this.audio.setSpeed(s); } }
  togglePause() { if (this.game) this.run(() => this.game.togglePause()); }

  toggleRanges() { this.showRanges = this.showRanges === 'all' ? 'selected' : 'all'; this.overlayDirty = true; }
  toggleCombo() { this.showCombo = !this.showCombo; this.overlayDirty = true; }

  // =================================================================== keyboard
  escapeAction() {
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

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target;
    const tag = tg && tg.tagName;
    const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && tg.type !== 'range' && tg.type !== 'checkbox') || (tg && tg.isContentEditable);
    if (typing) { if (e.key === 'Escape' && tg.blur) tg.blur(); return; }

    if (e.key === 'Escape') { e.preventDefault(); this.escapeAction(); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'g' && !e.repeat) { e.preventDefault(); this.toggleSettings(); return; }
    if (!this.game || this.modalOpen()) return;

    const code = e.code || '';
    const dm = /^Digit([1-8])$/.exec(code);
    if (dm) {
      e.preventDefault();
      if (e.repeat) return;
      const idx = Number(dm[1]) - 1 + (e.shiftKey ? 8 : 0);
      this.armKind(BUILD_ORDER[idx]);
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); this.rackStep(k === 'ArrowLeft' ? -1 : 1); return; }
    if (e.repeat) { if (k === ' ' || k === 'Enter') e.preventDefault(); return; }
    switch (k) {
      case 'q': this.upgrade('damage', e.shiftKey); break;
      case 'w': this.upgrade('range', e.shiftKey); break;
      case 'e': this.upgrade('rate', e.shiftKey); break;
      case 's': this.sell(); break;
      case 'm': this.startMove(); break;
      case 'r': this.toggleRanges(); break;
      case 'c': this.toggleCombo(); break;
      case 't': this.cycleTarget(); break;
      case 'l': this.toggleLock(); break;
      case 'f': this.toggleFocusMode(); break;
      case 'd': if (e.shiftKey) this.aimDirectional(); else this.cycleDirectional(); break;
      case 'j': this.toggleJoin(); break;
      case 'x': this.cycleColor(); break;
      case ' ': this.sendWave(); break;
      case 'p': this.togglePause(); break;
      case 'i': this.toggleInfo(); break;
      case 'b': case 'Enter': this.buildAtCursor(); break;
      default: return;
    }
    e.preventDefault();
    this.hudDirty = true;
  }
}
