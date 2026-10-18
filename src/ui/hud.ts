// In-game HUD: top bar, build rack, selected turret panel, message log, toasts, feedback effects.
// Dynamic values are updated through cached setters so the DOM is only touched when something changes.
import type { Kid } from './dom.ts';
import { h, setText, setClass, setProp, show } from './dom.ts';
import { TURRETS, BUILD_ORDER, SELL_REFUND, MOVE_COST, FREAKOUT } from '../data/turrets.ts';
import { SPEEDS, TARGET_MODES } from '../data/rules.ts';
import { iconSvg, LOCK_SVG } from './icons.ts';
import { formatNum, formatCash, formatTime } from './format.ts';
import { COMBOS } from '../data/combos.ts';
import type { App } from './App.ts';
import type { TurretState, GameState, ComboPreview, KeyColor, Stat, TargetMode, DirectionalMode, TurretDef, Category } from '../types.ts';

const TARGET_NAMES: Record<TargetMode, string> = { near: 'Nearest', far: 'Furthest', weak: 'Weakest', strong: 'Strongest', slow: 'Slowest', fast: 'Fastest', oldest: 'Oldest', newest: 'Newest' };
const DIR_NAMES: Record<DirectionalMode, string> = { normal: 'All around', wide: 'Wide 180', medium: 'Medium 90', tight: 'Tight 60', small: 'Narrow 45', pinpoint: 'Pinpoint 30' };
const STAT_NAMES: Record<Stat, string> = { damage: 'Damage', range: 'Range', rate: 'Rate' };
const STAT_KEYS: Record<Stat, string> = { damage: 'Q', range: 'W', rate: 'E' };
const COMBO_HEX: Record<string, string> = { red: '#ff6a4d', green: '#52d17a', blue: '#4da3ff', yellow: '#ffd54a' };

const COLORS: KeyColor[] = ['red', 'green', 'blue', 'yellow'];
const COMBO_NAMES: Record<string, string> = {};
const COMBO_EXACT: Record<string, Partial<Record<KeyColor, number>>> = {};
for (const list of Object.values(COMBOS)) for (const r of list) { COMBO_NAMES[r.id] = r.name; if (r.exact) COMBO_EXACT[r.id] = r.exact; }
// Freak-out adds these to the multiplier sums (src/game/modifiers.js), so without modifiers it is x4 damage, x5 rate.
const FREAK_BONUS = '+' + FREAKOUT.damageMult * 100 + '% dmg +' + FREAKOUT.rateMult * 100 + '% rate';
type TabId = 'general' | 'upgrades' | 'combos' | 'freak';
const TAB_ORDER: TabId[] = ['general', 'upgrades', 'combos', 'freak'];
const TAB_NAMES: Record<TabId, string> = { general: 'General', upgrades: 'Upgrades', combos: 'Combos', freak: 'Freakout' };

const dot = (color: string | null): HTMLElement => h('i', { class: 'os-cdot', style: 'background:' + (COMBO_HEX[color ?? ''] || '#888') });
/** Combo wait in game ms -> "ready" or "2.4s". */
const formatWait = (ms: number): string => (ms <= 0 ? 'ready' : (ms / 1000).toFixed(1) + 's');
const formatAgo = (ms: number): string => { const sec = Math.max(0, Math.floor(ms / 1000)); return sec < 60 ? sec + 's ago' : Math.floor(sec / 60) + 'm ago'; };

export const hotkeyLabel = (i: number): string => (i < 8 ? String(i + 1) : '⇧' + (i - 7));

/** Cached DOM references of one upgrade row in the turret panel. */
interface StatRow { val: HTMLElement; pips: Element[]; upBtn: HTMLButtonElement; upTxt: ChildNode; maxBtn: HTMLButtonElement; lvl: number }

/** Cached DOM references of the Combos tab. */
interface ComboRefs {
  fired: HTMLElement; assisted: HTMLElement; next: HTMLElement; nextName: HTMLElement;
  partners: HTMLElement; recipes: HTMLElement; recent: HTMLElement;
  recipeRows: { el: HTMLElement; status: HTMLElement }[];
  recentRows: { el: HTMLElement; ago: HTMLElement }[];
  partnerEls?: HTMLElement[];
  pKey: string | null; rKey: string | null; lKey: string | null;
}

/** DOM references of the panel built for the selected turret (the build-kind view has none). */
interface TurretRefs {
  sub: HTMLElement;
  rows: Record<string, StatRow>;
  def: TurretDef;
  cat: Category;
  panes: Partial<Record<TabId, HTMLElement>>;
  vals: Record<string, HTMLElement>;
  chips: Record<'holding' | 'combo' | 'links' | 'joined' | 'kills' | 'lock', HTMLElement>;
  sell: HTMLButtonElement;
  move: HTMLButtonElement;
  target?: ActionBtn; lock?: ActionBtn; dir?: ActionBtn; join?: ActionBtn; color?: ActionBtn;
  rangeHint: HTMLElement;
  combo?: ComboRefs;
  freak?: HTMLElement;
  tabBtns: Partial<Record<TabId, HTMLButtonElement>>;
  active?: TabId;
}

/** An action button whose first child is the text label updated every tick. */
type ActionBtn = HTMLButtonElement & { _label?: ChildNode | null };

export class Hud {
  app: App;
  el: HTMLElement;
  panelKey: string;
  refs: TurretRefs | null;
  logLines: HTMLElement[];
  tabPref: TabId;
  v!: Record<string, HTMLElement>;
  livesEl!: HTMLElement;
  sendBtn!: HTMLButtonElement;
  speedBtns!: HTMLButtonElement[];
  pauseBtn!: HTMLButtonElement;
  fps!: HTMLElement;
  top!: HTMLElement;
  rack!: HTMLElement;
  slots!: { kind: string; el: HTMLButtonElement; lockTxt: HTMLElement; def: TurretDef }[];
  side!: HTMLElement;
  log!: HTMLElement;
  toasts!: HTMLElement;
  err!: HTMLElement;
  leak!: HTMLElement;
  focusBadge!: HTMLElement;
  modeHint!: HTMLElement;
  paused!: HTMLElement;
  collapseBtn: HTMLButtonElement | null = null;

  constructor(app: App) {
    this.app = app;
    this.el = h('div', { class: 'os-hud' });
    this.panelKey = '';
    this.refs = null;
    this.logLines = [];
    this.tabPref = 'general';   // remembered turret panel tab (falls back to General when missing)
    this.build();
  }

  btn(cls: string, text: Kid, onclick: (e: MouseEvent) => void, title?: string): HTMLButtonElement {
    const b = h('button', { class: 'os-btn ' + cls, type: 'button', tabindex: -1, title: title || null }, text);
    b.addEventListener('click', (e) => { onclick(e); b.blur(); });
    return b;
  }

  stat(key: string, label: string, cls?: string): HTMLElement {
    const v = h('span', { class: 'os-stat-v' }, '0');
    this.v[key] = v;
    return h('div', { class: 'os-stat ' + (cls || '') }, h('span', { class: 'os-stat-l' }, label), v);
  }

  build(): void {
    const app = this.app;
    this.v = {};
    // ----- top bar
    const stats = h('div', { class: 'os-panel' },
      this.stat('cash', 'Cash', 'cash'), this.stat('lives', 'Lives', 'lives'), this.stat('wave', 'Wave', 'wave'),
      this.stat('kills', 'Kills'), this.stat('score', 'Score'));
    this.livesEl = stats.querySelector<HTMLElement>('.lives')!;
    this.sendBtn = this.btn('primary', ['Send wave ', h('span', { class: 'os-kbd' }, 'Space')], () => app.sendWave(), 'Start the next wave now (Space)');
    const waveBox = h('div', { class: 'os-panel os-wave-box' }, this.stat('next', 'Next wave'), this.sendBtn);
    this.speedBtns = SPEEDS.map((s) => this.btn('', s + 'x', () => app.setSpeed(s), 'Game speed ' + s + 'x'));
    const speeds = h('div', { class: 'os-panel os-speeds' }, ...this.speedBtns);
    this.pauseBtn = this.btn('', ['Pause ', h('span', { class: 'os-kbd' }, 'P')], () => app.togglePause());
    this.fps = h('span', { class: 'os-fps' }, '');
    const ctrls = h('div', { class: 'os-panel os-ctrls' }, this.pauseBtn, this.btn('', 'Menu', () => app.openGameMenu(), 'Options (Esc)'), this.fps);
    this.top = h('div', { class: 'os-top' }, stats, waveBox, speeds, ctrls);

    // ----- rack
    this.rack = h('div', { class: 'os-panel os-rack' });
    this.slots = BUILD_ORDER.map((kind, i) => {
      const def = TURRETS[kind];
      const lockTxt = h('span', null, '');
      const slot = h('button', { class: 'os-slot', type: 'button', tabindex: -1, title: `${def.name} (${hotkeyLabel(i)}): ${def.blurb}` },
        h('span', { class: 'os-hk' }, hotkeyLabel(i)),
        h('span', { class: 'os-ico', html: iconSvg(kind) }),
        h('span', { class: 'os-nm' }, def.name),
        h('span', { class: 'os-cost' }, formatCash(def.cost)),
        h('span', { class: 'os-lockov' }, h('i', { html: LOCK_SVG }), lockTxt));
      slot.addEventListener('click', (e) => { app.armKind(kind, e.shiftKey); slot.blur(); });
      slot.addEventListener('pointerdown', () => { app.rackIndex = i; });
      this.rack.append(slot);
      return { kind, el: slot, lockTxt, def };
    });

    // ----- side panel
    this.side = h('div', { class: 'os-panel os-side' });
    this.initPanelDrag();
    // ----- misc
    this.log = h('div', { class: 'os-log' });
    this.toasts = h('div', { class: 'os-toasts' });
    this.err = h('div', { class: 'os-err' });
    this.leak = h('div', { class: 'os-leak' });
    this.focusBadge = h('div', { class: 'os-focus-badge' }, 'Focus fire on (F or Esc to clear)');
    this.modeHint = h('div', { class: 'os-modehint' });
    this.paused = h('div', { class: 'os-paused' },
      h('div', { class: 'os-paused-title' }, 'PAUSED'),
      h('div', { class: 'os-paused-hint' }, 'Press P or click Resume. No waves are sent while paused.'));
    // the pause tint goes first so the top bar, side panel and rack stay above it and clickable
    this.el.append(this.paused, this.leak, this.top, this.log, this.toasts, this.focusBadge, this.modeHint, this.side, this.rack);
    // the error bubble sits outside of the clipped root so it can sit anywhere
    this.el.append(this.err);
  }

  // ------------------------------------------------------------ feedback
  addLog(text: string): void {
    const line = h('div', { class: 'os-log-line' }, text);
    this.log.append(line);
    this.logLines.push(line);
    while (this.logLines.length > 6) this.logLines.shift()!.remove();
    setTimeout(() => { line.remove(); const i = this.logLines.indexOf(line); if (i >= 0) this.logLines.splice(i, 1); }, 7000);
  }

  toast(text: string, cls?: string): void {
    const t = h('div', { class: 'os-toast ' + (cls || '') }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), 4000);
  }

  showError(text: string, cx: number, cy: number): void {
    const e = this.err;
    e.textContent = text;
    const x = Math.max(8, Math.min(window.innerWidth - 220, cx + 14));
    const y = Math.max(8, Math.min(window.innerHeight - 40, cy - 34));
    e.style.left = x + 'px';
    e.style.top = y + 'px';
    e.classList.remove('show');
    void e.offsetWidth;
    e.classList.add('show');
  }

  flashLeak(): void {
    this.leak.classList.remove('show');
    void this.leak.offsetWidth;
    this.leak.classList.add('show');
  }

  setVisible(on: boolean): void { this.el.classList.toggle('on', on); }

  // ------------------------------------------------------------ per tick update (about 10 Hz)
  update(): void {
    const app = this.app;
    const game = app.game;
    if (!game) return;
    const s = game.state;
    setText(this.v.cash, formatCash(s.cash));
    setText(this.v.lives, formatNum(s.lives));
    setClass(this.livesEl, 'low', s.lives <= 3);
    setText(this.v.wave, s.wave);
    setText(this.v.kills, formatNum(s.kills));
    setText(this.v.score, formatNum(s.score));
    setText(this.v.next, s.over ? '-' : formatTime(s.nextWaveIn));
    this.speedBtns.forEach((b, i) => setClass(b, 'is-on', s.speed === SPEEDS[i]));
    setText(this.pauseBtn.firstChild!, s.paused ? 'Resume ' : 'Pause ');
    setClass(this.pauseBtn, 'is-on', s.paused);
    show(this.paused, s.paused && !app.modalOpen(), 'flex');
    show(this.focusBadge, app.focusId != null, 'block');
    setProp(this.sendBtn, 'disabled', !!s.over || !!s.paused);

    // rack
    const kills = s.kills;
    for (let i = 0; i < this.slots.length; i++) {
      const sl = this.slots[i];
      const locked = !s.unlocked || !s.unlocked[sl.kind];
      setClass(sl.el, 'locked', locked);
      setClass(sl.el, 'poor', !locked && s.cash < sl.def.cost);
      setClass(sl.el, 'armed', app.mode === 'build' && app.armed === sl.kind);
      setClass(sl.el, 'cursor', app.rackIndex === i);
      if (locked) setText(sl.lockTxt, sl.def.unlockKills ? 'at ' + formatNum(sl.def.unlockKills) : '');
      void kills;
    }

    // mode hint
    const hint = app.modeHint();
    setText(this.modeHint, hint);
    show(this.modeHint, !!hint, 'block');

    this.updateSide();
  }

  // ------------------------------------------------------------ side panel
  updateSide(): void {
    const app = this.app;
    const s = app.game!.state;
    let t: TurretState | null = null;
    if (app.selectedId != null) t = s.turrets.find((x) => x.id === app.selectedId) || null;
    if (app.selectedId != null && !t) { app.deselect(); }
    const buildKind = app.mode === 'build' && app.armed ? app.armed : null;
    const key = t ? 't:' + t.id + ':' + t.kind : (buildKind ? 'b:' + buildKind : '');
    if (key !== this.panelKey) {
      this.panelKey = key;
      this.refs = null;
      this.side.replaceChildren();
      if (t) this.refs = this.buildTurretView(t);
      else if (buildKind) this.buildKindView(buildKind);
    }
    const wasOn = this.side.classList.contains('on');
    setClass(this.side, 'on', !!key);
    setClass(this.side, 'collapsed', app.settings.infoCollapsed);
    if (key && !wasOn) this.applyPanelPos();
    if (t && this.refs) this.updateTurretView(t, s);
  }

  // ------------------------------------------------------------ moving the side panel
  /** Drag the side panel by its header, double-click or double-tap the header to dock it again. Saved as settings.panelPos. */
  initPanelDrag(): void {
    const side = this.side;
    let drag: { id: number; dx: number; dy: number; pos: { x: number; y: number } | null } | null = null;
    let lastDown = -1e9;
    const onHead = (e: PointerEvent): boolean => e.target instanceof Element && !!e.target.closest('.os-side-head') && !e.target.closest('button');
    side.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !onHead(e)) return;
      e.preventDefault();
      // a second press within 350 ms docks the panel again (a dblclick event would be retargeted by the pointer capture)
      if (e.timeStamp - lastDown < 350) {
        lastDown = -1e9;
        this.app.updateSettings({ panelPos: null });
        this.applyPanelPos();
        return;
      }
      lastDown = e.timeStamp;
      const r = side.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, pos: null };
      side.setPointerCapture(e.pointerId);
      side.classList.add('dragging');
    });
    side.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const hud = this.el.getBoundingClientRect();
      drag.pos = this.placePanel(e.clientX - drag.dx - hud.left, e.clientY - drag.dy - hud.top);
    });
    const end = (e: PointerEvent): void => {
      if (!drag || e.pointerId !== drag.id) return;
      const pos = drag.pos;
      drag = null;
      side.classList.remove('dragging');
      if (side.hasPointerCapture(e.pointerId)) side.releasePointerCapture(e.pointerId);
      if (pos) this.app.updateSettings({ panelPos: pos });
    };
    side.addEventListener('pointerup', end);
    side.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => this.applyPanelPos());
  }

  /** Put the panel at the saved position (clamped), or back in the CSS dock when there is none. */
  applyPanelPos(): void {
    const p = this.app.settings.panelPos;
    const st = this.side.style;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { st.left = st.top = st.right = st.maxHeight = ''; return; }
    if (this.side.classList.contains('on')) this.placePanel(p.x, p.y);
  }

  /** Place the panel at x, y (px in the HUD), clamped between the top bar and the build rack so its header stays reachable. Returns the clamped position. */
  placePanel(x: number, y: number): { x: number; y: number } {
    const hud = this.el.getBoundingClientRect();
    const r = this.side.getBoundingClientRect();
    const head = this.side.querySelector<HTMLElement>('.os-side-head');
    const headH = head ? head.offsetHeight : 40;
    const topR = this.top.getBoundingClientRect();
    const rackR = this.rack.getBoundingClientRect();
    const minY = topR.height ? topR.bottom - hud.top + 4 : 0;
    const maxY = (rackR.height ? rackR.top - hud.top - 4 : hud.height) - headH;
    x = Math.round(Math.max(0, Math.min(hud.width - r.width, x)));
    y = Math.round(Math.max(minY, Math.min(maxY, y)));
    const st = this.side.style;
    st.left = x + 'px';
    st.top = y + 'px';
    st.right = 'auto';
    st.maxHeight = Math.max(headH, maxY + headH - y) + 'px';
    return { x, y };
  }

  header(kind: string, title: string, subtitle: string): { head: HTMLElement; sub: HTMLElement } {
    const app = this.app;
    const sub = h('span', null, subtitle);
    const collapse = h('button', { class: 'os-iconbtn', type: 'button', tabindex: -1, title: 'Collapse or expand (I)' }, app.settings.infoCollapsed ? '+' : '–');
    collapse.addEventListener('click', () => { app.toggleInfo(); collapse.textContent = app.settings.infoCollapsed ? '+' : '–'; collapse.blur(); });
    this.collapseBtn = collapse;
    const close = h('button', { class: 'os-iconbtn', type: 'button', tabindex: -1, title: 'Close (Esc)' }, '×');
    close.addEventListener('click', () => { app.cancelOrDeselect(); close.blur(); });
    const head = h('div', { class: 'os-side-head', title: 'Drag to move, double-click to reset' },
      h('div', { class: 'os-ico', html: iconSvg(kind) }),
      h('div', { class: 'os-side-title' }, h('b', null, title), sub),
      collapse, close);
    return { head, sub };
  }

  buildKindView(kind: string): void {
    const def = TURRETS[kind];
    const { head } = this.header(kind, def.name, def.category === 'modifier' ? 'Modifier' : (def.category === 'support' ? 'Support' : 'Weapon'));
    const lines: HTMLElement[] = [];
    if (def.base && def.base.rate) {
      lines.push(h('div', { class: 'os-chips' },
        h('span', { class: 'os-chip' }, 'Damage ' + formatNum(def.base.damage)),
        h('span', { class: 'os-chip' }, 'Range ' + def.base.range),
        h('span', { class: 'os-chip' }, 'Rate ' + def.base.rate + '/min')));
    } else if (def.base && def.base.range) {
      lines.push(h('div', { class: 'os-chips' }, h('span', { class: 'os-chip' }, 'Range ' + def.base.range)));
    }
    const body = h('div', { class: 'os-side-body' },
      h('div', { class: 'os-blurb' }, def.blurb),
      h('div', { class: 'os-chips' }, h('span', { class: 'os-chip amber' }, 'Cost ' + formatCash(def.cost))),
      ...lines,
      h('div', { class: 'os-hint' }, 'Click to place. Shift+Click keeps building. Esc or right click cancels.'));
    this.side.append(head, body);
  }

  buildTurretView(t: TurretState): TurretRefs {
    const app = this.app;
    const def = TURRETS[t.kind];
    const cat = def.category;
    const { head, sub } = this.header(t.kind, def.name, cat === 'modifier' ? 'Modifier' : cat === 'support' ? 'Support' : 'Weapon');
    // the remaining fields (vals, chips, sell, move, rangeHint, tabBtns, ...) are assigned below, before refs is returned
    const refs = { sub, rows: {}, def, cat, panes: {}, tabBtns: {} } as unknown as TurretRefs;
    const pane = () => h('div', { class: 'os-side-body os-pane' });

    // ---- General: blurb, current stats, status chips, actions
    const general = pane();
    general.append(h('div', { class: 'os-blurb' }, def.blurb));
    const statList: Stat[] = cat === 'modifier' ? ['range'] : ['damage', 'range', 'rate'];
    refs.vals = {};
    const valsEl = h('div', { class: 'os-vals' });
    for (const stat of statList) {
      if (cat !== 'modifier' && !(def.base && def.base[stat] != null)) continue;
      const b = h('b', null, '');
      refs.vals[stat] = b;
      valsEl.append(h('div', null, h('span', null, cat === 'modifier' ? 'Influence' : STAT_NAMES[stat]), b));
    }
    if (valsEl.children.length) general.append(valsEl);
    refs.chips = {
      holding: h('span', { class: 'os-chip good hidden' }, 'Holding pattern'),
      combo: h('span', { class: 'os-chip amber hidden' }), links: h('span', { class: 'os-chip hidden' }),
      joined: h('span', { class: 'os-chip hidden' }), kills: h('span', { class: 'os-chip hidden' }),
      lock: h('span', { class: 'os-chip hidden' }, 'Target locked'),
    };
    general.append(h('div', { class: 'os-chips' }, ...Object.values(refs.chips)));
    const actions = h('div', { class: 'os-actions' });
    const act = (key: 'sell' | 'move' | 'target' | 'lock' | 'dir' | 'join' | 'color', cls: string, content: Kid, fn: () => void, title: string): HTMLButtonElement => { const b = this.btn(cls, content, fn, title); refs[key] = b; actions.append(b); return b; };
    const k = (x: string): HTMLElement => h('span', { class: 'os-kbd' }, x);
    act('sell', '', [h('span', null, 'Sell'), k('S')], () => app.sell(), 'Sell for 70% of everything spent on it');
    act('move', '', [h('span', null, 'Move ' + formatCash(MOVE_COST)), k('M')], () => app.startMove(), 'Move this turret');
    if (cat === 'weapon') {
      act('target', '', [h('span', null, ''), k('T')], () => app.cycleTarget(), 'Cycle targeting mode');
      act('lock', '', [h('span', null, 'Lock'), k('L')], () => app.toggleLock(), 'Keep the current target while it is in range');
      act('dir', 'wide', [h('span', null, ''), k('D')], () => app.cycleDirectional(), 'Firing cone (Shift+D aims it at the cursor)');
    }
    if (t.kind === 'targeter') {
      act('join', 'wide', [h('span', null, ''), k('J')], () => app.toggleJoin(), 'Join this Targeter to a turret');
    }
    if (t.kind === 'comboOnly') {
      act('color', 'wide', [h('span', null, ''), k('X')], () => app.cycleColor(), 'Cycle the combo colour');
    }
    general.append(actions);
    refs.rangeHint = h('div', { class: 'os-hint' }, '');
    general.append(refs.rangeHint);
    refs.panes.general = general;

    // ---- Upgrades: stat rows with pips and buy buttons
    const statsEl = h('div', { class: 'os-stats' });
    for (const stat of statList) {
      const maxL = t.maxLevels ? t.maxLevels[stat] : 0;
      const ladder = def.ladders && def.ladders[stat];
      const ladderLen = ladder ? ladder.length : (cat === 'modifier' && stat === 'range' ? 1 : 0);
      const n = maxL || ladderLen;
      if (!n) continue;
      const val = h('b', null, '');
      const pips = h('div', { class: 'os-pips' }, ...Array.from({ length: n }, () => h('span', { class: 'os-pip' })));
      const upBtn = this.btn('', [h('span', null, ''), h('span', { class: 'os-kbd' }, STAT_KEYS[stat])], (e: MouseEvent) => app.upgrade(stat, e.shiftKey), 'Upgrade ' + STAT_NAMES[stat].toLowerCase() + ' (' + STAT_KEYS[stat] + ')');
      const maxBtn = this.btn('', 'Max', () => app.upgrade(stat, true), 'Upgrade as far as you can afford (Shift+' + STAT_KEYS[stat] + ')');
      const label = cat === 'modifier' ? 'Influence' : STAT_NAMES[stat];
      const row = h('div', { class: 'os-srow' },
        h('div', { class: 'os-srow-top' }, h('span', null, label), val), pips,
        h('div', { class: 'os-upg' }, upBtn, maxBtn));
      statsEl.append(row);
      refs.rows[stat] = { val, pips: [...pips.children], upBtn, upTxt: upBtn.firstChild!, maxBtn, lvl: -1 };
    }
    if (statsEl.children.length) {
      refs.panes.upgrades = pane();
      refs.panes.upgrades.append(statsEl);
    }

    // ---- Combos: counts, partners and countdown, recipes, recent combos
    if (cat === 'weapon' || t.kind === 'comboOnly') {
      const cp = pane();
      const cr = refs.combo = { fired: h('b', null, '0'), assisted: h('b', null, '0'), next: h('b', null, ''), nextName: h('span', null, ''),
        partners: h('div', { class: 'os-cpartners' }), recipes: h('div', { class: 'os-clist' }), recent: h('div', { class: 'os-clist' }),
        recipeRows: [], recentRows: [], pKey: null, rKey: null, lKey: null };
      cp.append(
        h('div', { class: 'os-vals two' }, h('div', null, h('span', null, 'Fired'), cr.fired), h('div', null, h('span', null, 'Assisted'), cr.assisted)),
        h('div', { class: 'os-ctitle' }, 'Combo with'), cr.partners,
        h('div', { class: 'os-cnext' }, h('span', null, 'Next combo'), cr.next, cr.nextName),
        h('div', { class: 'os-ctitle' }, t.kind === 'comboOnly' ? 'Can assist in' : 'Combos'), cr.recipes,
        h('div', { class: 'os-ctitle' }, 'Recent'), cr.recent);
      refs.panes.combos = cp;
    }

    // ---- Freakout
    if (def.freakout) {
      const fp = pane();
      refs.freak = h('span', { class: 'os-chip' });
      fp.append(h('div', { class: 'os-chips' }, refs.freak),
        h('div', { class: 'os-hint' }, 'Reach the damage and rate levels to make it eligible. It then freaks out every ' +
          FREAKOUT.space / 2000 + ' to ' + FREAKOUT.space / 1000 + ' s (less with more rate upgrades): a ' + FREAKOUT.warn / 1000 +
          ' s warning, then ' + FREAKOUT.length / 1000 + ' s of ' + FREAK_BONUS + ' (added to the modifier bonuses).'));
      refs.panes.freak = fp;
    }

    // ---- tab strip (only when there is more than one tab)
    const ids = TAB_ORDER.filter((id) => refs.panes[id]);
    this.side.append(head);
    if (ids.length > 1) {
      const strip = h('div', { class: 'os-tabs', role: 'tablist' });
      for (const id of ids) {
        const b = h('button', { class: 'os-tab', type: 'button', tabindex: -1, role: 'tab' }, TAB_NAMES[id]);
        b.addEventListener('click', () => { this.tabPref = id; this.showTab(); b.blur(); });
        refs.tabBtns[id] = b;
        strip.append(b);
      }
      this.side.append(strip);
    }
    for (const id of ids) this.side.append(refs.panes[id]!);
    for (const key of ['target', 'lock', 'dir', 'join', 'color'] as const) { const b = refs[key]; if (b) b._label = b.firstChild; }
    this.refs = refs;
    this.showTab();
    return refs;
  }

  /** Show the remembered tab, or General when the selected turret does not have it. */
  showTab(): void {
    const r = this.refs;
    if (!r || !r.panes) return;
    const active = r.panes[this.tabPref] ? this.tabPref : 'general';
    r.active = active;
    for (const id of Object.keys(r.panes) as TabId[]) {
      setClass(r.panes[id]!, 'off', id !== active);
      const tb = r.tabBtns[id];
      if (tb) { setClass(tb, 'is-on', id === active); tb.setAttribute('aria-selected', String(id === active)); }
    }
    if (this.app.game && this.app.game.state) {
      const t = this.app.game.state.turrets.find((x) => x.id === this.app.selectedId);
      if (t) this.updateTurretView(t, this.app.game.state);
    }
  }

  updateTurretView(t: TurretState, s: GameState): void {
    const r = this.refs!;
    const app = this.app;
    setClass(this.side, 'collapsed', app.settings.infoCollapsed);
    if (this.collapseBtn) setText(this.collapseBtn, app.settings.infoCollapsed ? '+' : '–');
    if (app.settings.infoCollapsed) return;
    if (r.active === 'upgrades') this.updateUpgrades(t, s);
    else if (r.active === 'combos') this.updateCombos(t, s);
    else if (r.active === 'freak') this.updateFreak(t);
    else this.updateGeneral(t, s);
  }

  statValue(t: TurretState, stat: Stat): string {
    if (this.refs!.cat === 'modifier') return String(Math.round(t.modRange != null ? t.modRange : (t.stats && t.stats.range) || 0));
    if (stat === 'damage') return formatNum(t.stats ? t.stats.damage : 0);
    if (stat === 'range') return String(Math.round(t.stats ? t.stats.range : 0));
    return Math.round(t.stats ? t.stats.rate : 0) + '/min';
  }

  updateGeneral(t: TurretState, s: GameState): void {
    const r = this.refs!;
    const app = this.app;
    for (const stat of Object.keys(r.vals) as Stat[]) setText(r.vals[stat], this.statValue(t, stat));
    const refund = Math.floor((t.cashValue || 0) * SELL_REFUND);
    setText(r.sell.firstChild!, 'Sell ' + formatCash(refund));
    setProp(r.move, 'disabled', s.cash < MOVE_COST);
    setClass(r.move, 'is-on', app.mode === 'move');
    if (r.target) setText(r.target._label!, 'Target: ' + (TARGET_NAMES[t.targetMode] || t.targetMode || TARGET_MODES[0]));
    if (r.lock) { setClass(r.lock, 'is-on', !!t.locked); }
    if (r.dir) setText(r.dir._label!, 'Cone: ' + (DIR_NAMES[t.directional ? t.directional.mode : 'normal'] || 'All around'));
    if (r.join) {
      const j = t.joinedTo != null ? s.turrets.find((x) => x.id === t.joinedTo) : null;
      setText(r.join._label!, app.mode === 'join' ? 'Click a turret...' : (j ? 'Joined: ' + TURRETS[j.kind].name + ' (change)' : 'Join to a turret'));
      setClass(r.join, 'is-on', app.mode === 'join');
    }
    if (r.color) {
      const c = t.comboColor || 'red';
      setText(r.color._label!, 'Colour: ' + c);
      r.color.style.borderColor = COMBO_HEX[c] || '';
    }
    const c = r.chips;
    setClass(c.holding, 'hidden', !t.holding);
    setClass(c.combo, 'hidden', !t.comboCapable);
    setText(c.combo, t.comboReady ? 'Combo ready' : 'Combo capable');
    const nLinks = t.links ? t.links.length : 0;
    setClass(c.links, 'hidden', !nLinks);
    setText(c.links, 'Chained lasers: ' + nLinks);
    const hasKills = typeof t.kills === 'number';
    setClass(c.kills, 'hidden', !hasKills);
    if (hasKills) setText(c.kills, 'Kills: ' + formatNum(t.kills));
    setClass(c.lock, 'hidden', !t.locked);
    setClass(c.joined, 'hidden', true);
    setText(r.rangeHint, r.cat === 'modifier' ? 'Boosts every turret whose centre is inside the circle.' : (t.kind === 'targeter' ? 'Join it to a turret to lend it this range.' : ''));
  }

  updateUpgrades(t: TurretState, s: GameState): void {
    const r = this.refs!;
    const game = this.app.game!;
    for (const stat of Object.keys(r.rows) as Stat[]) {
      const row = r.rows[stat];
      setText(row.val, this.statValue(t, stat));
      const lvl = t.levels ? t.levels[stat] || 0 : 0;
      if (row.lvl !== lvl) { row.lvl = lvl; row.pips.forEach((p, i) => setClass(p, 'on', i < lvl)); }
      let cost = null;
      try { cost = game.upgradeCost(t.id, stat); } catch (e) { cost = null; }
      if (cost == null) {
        setText(row.upTxt, 'Maxed');
        setProp(row.upBtn, 'disabled', true);
        setProp(row.maxBtn, 'disabled', true);
      } else {
        setText(row.upTxt, '+ ' + formatCash(cost));
        const can = s.cash >= cost;
        setProp(row.upBtn, 'disabled', !can);
        setProp(row.maxBtn, 'disabled', !can);
      }
    }
  }

  updateFreak(t: TurretState): void {
    const fo = this.refs!.def.freakout!;
    const el = this.refs!.freak!;
    const fr = t.freak || 'off';
    setClass(el, 'hot', fr === 'warn');
    setClass(el, 'good', fr === 'on');
    let txt;
    if (fr === 'off') {
      const lv = t.levels || {};
      const d = Math.min(lv.damage || 0, fo.damage), ra = Math.min(lv.rate || 0, fo.rate);
      txt = 'Freak-out at ' + fo.damage + ' dmg + ' + fo.rate + ' rate (' + d + '/' + fo.damage + ', ' + ra + '/' + fo.rate + ')';
    } else if (fr === 'warn') txt = 'Freak-out incoming!';
    else if (fr === 'on') txt = 'FREAKING OUT ' + FREAK_BONUS;
    else txt = 'Freak-out ready';
    setText(el, txt);
  }

  updateCombos(t: TurretState, s: GameState): void {
    const cr = this.refs!.combo!;
    const game = this.app.game!;
    setText(cr.fired, formatNum(t.combosFired || 0));
    setText(cr.assisted, formatNum(t.combosAssisted || 0));
    const pv = (game.comboPreview && game.comboPreview(t.id)) || { leads: false, partners: [], recipes: [], next: null };

    // partners in range (rebuilt only when the set changes)
    const pKey = pv.partners.map((p) => `${p.id}${p.color}`).join(',');
    if (pKey !== cr.pKey) {
      cr.pKey = pKey;
      cr.partnerEls = pv.partners.map((p) => h('span', { class: 'os-cpart' }, dot(p.color), TURRETS[p.kind] ? TURRETS[p.kind].name : p.kind));
      if (cr.partnerEls.length) cr.partners.replaceChildren(...cr.partnerEls);
      else cr.partners.replaceChildren(h('span', { class: 'os-hint' }, 'No weapons within combo range'));
    }
    pv.partners.forEach((p, i) => setClass(cr.partnerEls![i], 'off', p.wait > 0));

    // next combo
    if (!t.comboCapable) { setText(cr.next, 'n/a'); setText(cr.nextName, t.kind === 'comboOnly' ? '' : 'Unlocks at max damage'); }
    else if (!pv.next) { setText(cr.next, 'n/a'); setText(cr.nextName, pv.leads ? 'No recipe with these partners' : 'No lead in range'); }
    else { setText(cr.next, pv.next.wait > 0 ? 'in ' + formatWait(pv.next.wait) : 'ready'); setText(cr.nextName, pv.next.name); }

    // recipes (rows rebuilt only when the list changes; status text every update)
    const rKey = pv.recipes.map((x) => x.id).join(',');
    if (rKey !== cr.rKey) {
      cr.rKey = rKey;
      cr.recipeRows = pv.recipes.map((x) => {
        const status = h('em', null, '');
        const dots = [];
        for (const col of COLORS) for (let i = 0; i < (x.needs[col] || 0); i++) dots.push(dot(col));
        const el = h('div', { class: 'os-crow' }, h('span', { class: 'os-cdots' }, ...dots), h('span', { class: 'os-cname' }, x.name, x.isNew ? h('i', { class: 'os-cnew' }, 'new') : null), status);
        return { el, status };
      });
      if (cr.recipeRows.length) cr.recipes.replaceChildren(...cr.recipeRows.map((x) => x.el));
      else cr.recipes.replaceChildren(h('span', { class: 'os-hint' }, 'No lead within combo range needs this colour'));
    }
    pv.recipes.forEach((x, i) => {
      const row = cr.recipeRows[i];
      const miss = Object.entries(x.missing);
      let txt;
      if (miss.length) txt = 'needs ' + miss.map(([col, n]) => n + ' ' + col).join(', ');
      else if (x.exactBlocked) txt = 'needs exactly ' + Object.entries(COMBO_EXACT[x.id] || {}).map(([col, n]) => n + ' ' + col).join(', ');
      else if (x.wait === Infinity) txt = 'n/a';
      else txt = formatWait(x.wait);
      setText(row.status, txt);
      setClass(row.el, 'off', x.wait === Infinity);
      setClass(row.el, 'next', !!pv.next && pv.next.id === x.id);
    });

    // recent combos
    const log = t.comboLog || [];
    const lKey = log.length + ':' + (log[0] ? log[0].time + log[0].id : '');
    if (lKey !== cr.lKey) {
      cr.lKey = lKey;
      cr.recentRows = log.map((e) => {
        const ago = h('em', null, '');
        const el = h('div', { class: 'os-crow' }, h('span', { class: 'os-cname' }, COMBO_NAMES[e.id] || e.id),
          h('span', { class: 'os-crole' }, e.role === 'lead' ? 'fired' : 'assisted'), ago);
        return { el, ago };
      });
      if (cr.recentRows.length) cr.recent.replaceChildren(...cr.recentRows.map((x) => x.el));
      else cr.recent.replaceChildren(h('span', { class: 'os-hint' }, 'None yet'));
    }
    log.forEach((e, i) => setText(cr.recentRows[i].ago, formatAgo(s.time - e.time)));
  }
}
