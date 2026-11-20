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
import type { AppGame } from './appTypes.ts';
import { DpsTracker } from './dps.ts';
import { COMBO_HEX, colorDot, colorName } from './colors.ts';
import type { KeyAction } from './keymap.ts';
import { t, tx } from './i18n.ts';

/** What the coach card shows: a tutorial step or a tip. `key` identifies it (the card rebuilds when it changes). */
export interface CoachView {
  key: string; title: string; text: string; progress?: string; tip?: boolean;
  buttons: { label: string; primary?: boolean; onClick: () => void }[];
}
import type { TurretState, GameState, KeyColor, Stat, TargetMode, DirectionalMode, TurretDef, Category } from '../types.ts';

const TARGET_NAMES: Record<TargetMode, string> = { near: tx('Nearest'), far: tx('Furthest'), weak: tx('Weakest'), strong: tx('Strongest'), slow: tx('Slowest'), fast: tx('Fastest'), oldest: tx('Oldest'), newest: tx('Newest') };
const DIR_NAMES: Record<DirectionalMode, string> = { normal: tx('All around'), wide: tx('Wide 180'), medium: tx('Medium 90'), tight: tx('Tight 60'), small: tx('Narrow 45'), pinpoint: tx('Pinpoint 30') };
/** "2 red" in the current language (the same keys as the Combo Codex). */
const colorCount = (col: string, n: number): string =>
  col === 'red' ? t('{n} red', { n }) : col === 'green' ? t('{n} green', { n }) : col === 'blue' ? t('{n} blue', { n }) : col === 'yellow' ? t('{n} yellow', { n }) : n + ' ' + col;
const STAT_NAMES: Record<Stat, string> = { damage: tx('Damage'), range: tx('Range'), rate: tx('Rate') };
/** Tooltip of the "+ cost" upgrade button per stat ({key}: its key). */
const UPGRADE_TITLES: Record<Stat, string> = { damage: tx('Upgrade damage ({key})'), range: tx('Upgrade range ({key})'), rate: tx('Upgrade rate ({key})') };
const STAT_ACTION: Record<Stat, KeyAction> = { damage: 'upDamage', range: 'upRange', rate: 'upRate' };

const COLORS: KeyColor[] = ['red', 'green', 'blue', 'yellow'];
const COMBO_NAMES: Record<string, string> = {};
const COMBO_EXACT: Record<string, Partial<Record<KeyColor, number>>> = {};
for (const list of Object.values(COMBOS)) for (const r of list) { COMBO_NAMES[r.id] = r.name; if (r.exact) COMBO_EXACT[r.id] = r.exact; }
// Freak-out adds these to the multiplier sums (src/game/modifiers.js), so without modifiers it is x4 damage, x5 rate.
const freakBonus = (): string => t('+{d}% dmg +{r}% rate', { d: FREAKOUT.damageMult * 100, r: FREAKOUT.rateMult * 100 });
const CAT_NAMES: Record<Category, string> = { weapon: tx('Weapon'), modifier: tx('Modifier'), support: tx('Support') };
const INFLUENCE = tx('Influence');
type TabId = 'general' | 'upgrades' | 'combos' | 'freak';
const TAB_ORDER: TabId[] = ['general', 'upgrades', 'combos', 'freak'];
const TAB_NAMES: Record<TabId, string> = { general: tx('General'), upgrades: tx('Upgrades'), combos: tx('Combos'), freak: 'Freakout' };

const dot = colorDot;
/** Combo wait in game ms -> "ready" or "2.4s". */
const formatWait = (ms: number): string => (ms <= 0 ? t('ready') : (ms / 1000).toFixed(1) + 's');
const formatAgo = (ms: number): string => { const sec = Math.max(0, Math.floor(ms / 1000)); return sec < 60 ? t('{n}s ago', { n: sec }) : t('{n}m ago', { n: Math.floor(sec / 60) }); };

/** Long-press time (ms) on a rack slot that shows the turret's info on touch screens. */
const LONG_PRESS_MS = 450;
/** Below this window width (CSS px) the HUD uses the phone layout (see the max-width media query in ui.css). */
export const NARROW_PX = 760;
/** One line about a turret kind for the long-press toast. */
const slotInfo = (kind: string): string => {
  const d = TURRETS[kind];
  const v = { name: d.name, cost: formatCash(d.cost), kills: formatNum(d.unlockKills || 0), blurb: t(d.blurb) };
  return d.unlockKills ? t('{name}, {cost} (unlocks at {kills} kills): {blurb}', v) : t('{name}, {cost}: {blurb}', v);
};

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
  chips: Record<'holding' | 'combo' | 'links' | 'joined' | 'kills' | 'damage' | 'lock', HTMLElement>;
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
  autoBtn!: HTMLButtonElement;
  undoBtn!: HTMLButtonElement;
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
  /** Coach card (tutorial steps and tips), top centre below the top bar. */
  coach!: HTMLElement;
  replayBadge!: HTMLElement;
  /** Gamepad cursor (crosshair), shown while a pad is used in a game. */
  padCursor: HTMLElement = h('div', { class: 'os-padcursor', 'aria-hidden': 'true' });
  coachKey = '';
  paused!: HTMLElement;
  collapseBtn: HTMLButtonElement | null = null;
  incomingEl: HTMLElement | null = null;
  /** Screen-reader live region (visually hidden) and its rate limit state. */
  live: HTMLElement = h('div', { class: 'os-sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  livePending: string | null = null;
  liveTimer: ReturnType<typeof setTimeout> | null = null;
  incomingWave = -1;
  /** Stat whose "+ cost" button is hovered (Upgrades tab preview), or null. */
  previewStat: Stat | null = null;
  /** Top-bar key hints and the action whose key they show. */
  keyHints: [HTMLElement, KeyAction][] = [];
  /** Per-turret DPS from damageDealt samples (game time). */
  dps = new DpsTracker();
  incomingGame: AppGame | null = null;

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

  /** Key hint for a top-bar button; its text follows the player's binding (refreshed in update). */
  hk(action: KeyAction): HTMLElement {
    const el = h('span', { class: 'os-kbd' }, this.app.keyFor(action));
    this.keyHints.push([el, action]);
    return el;
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
      this.stat('cash', t('Cash'), 'cash'), this.stat('lives', t('Lives'), 'lives'), this.stat('wave', t('Wave'), 'wave'),
      this.stat('kills', t('Kills')), this.stat('score', t('Score')));
    this.livesEl = stats.querySelector<HTMLElement>('.lives')!;
    this.sendBtn = this.btn('primary', [t('Send wave') + ' ', this.hk('sendWave')], () => app.sendWave(), t('Start the next wave now'));
    this.incomingEl = this.stat('incoming', t('Wave {n}', { n: 1 }), 'incoming');
    this.autoBtn = this.btn('', [t('Auto') + ' ', this.hk('autoSend')], () => app.toggleAutoSend(), t('Auto-send: start the next wave as soon as the field is clear'));
    const waveBox = h('div', { class: 'os-panel os-wave-box' }, this.stat('next', t('Next wave')), this.incomingEl, this.sendBtn, this.autoBtn);
    this.speedBtns = SPEEDS.map((s) => this.btn('', s + 'x', () => app.setSpeed(s), t('Game speed {s}x', { s })));
    const speeds = h('div', { class: 'os-panel os-speeds' }, ...this.speedBtns);
    this.pauseBtn = this.btn('', [t('Pause') + ' ', this.hk('pause')], () => app.togglePause());
    this.fps = h('span', { class: 'os-fps' }, '');
    this.undoBtn = this.btn('', [t('Undo') + ' ', this.hk('undo')], () => app.undo(), t('Undo the last build or upgrade'));
    const ctrls = h('div', { class: 'os-panel os-ctrls' }, this.undoBtn, this.pauseBtn, this.btn('', t('Menu'), () => app.openGameMenu(), t('Options (Esc)')), this.fps);
    this.top = h('div', { class: 'os-top' }, stats, waveBox, speeds, ctrls);

    // ----- rack
    this.rack = h('div', { class: 'os-panel os-rack' });
    this.slots = BUILD_ORDER.map((kind, i) => {
      const def = TURRETS[kind];
      const lockTxt = h('span', null, '');
      const slot = h('button', { class: 'os-slot', type: 'button', tabindex: -1, title: `${def.name} (${hotkeyLabel(i)}): ${t(def.blurb)}` },
        h('span', { class: 'os-hk' }, hotkeyLabel(i)),
        h('span', { class: 'os-ico', html: iconSvg(kind) }),
        h('span', { class: 'os-nm' }, def.name),
        h('span', { class: 'os-cost' }, formatCash(def.cost)),
        h('span', { class: 'os-lockov' }, h('i', { html: LOCK_SVG }), lockTxt));
      // touch: a long press shows what the turret is (there is no hover tooltip on a phone) instead of arming it
      let pressTimer: ReturnType<typeof setTimeout> | null = null, longPress = false;
      slot.addEventListener('pointerdown', (e) => {
        longPress = false;
        if (e.pointerType !== 'touch') return;
        pressTimer = setTimeout(() => { longPress = true; this.toast(slotInfo(kind)); }, LONG_PRESS_MS);
      });
      const cancelPress = (): void => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
      slot.addEventListener('pointerup', cancelPress);
      slot.addEventListener('pointerleave', cancelPress);
      slot.addEventListener('contextmenu', (e) => e.preventDefault());
      slot.addEventListener('click', (e) => { if (longPress) { longPress = false; return; } app.armKind(kind, e.shiftKey); slot.blur(); });
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
    this.replayBadge = h('div', { class: 'os-replay-badge', role: 'status' }, t('REPLAY'));
    this.focusBadge = h('div', { class: 'os-focus-badge' }, t('Focus fire on') + ' (', this.hk('focus'), ' ' + t('or Esc to clear') + ')');
    this.modeHint = h('div', { class: 'os-modehint' });
    this.paused = h('div', { class: 'os-paused' },
      h('div', { class: 'os-paused-title' }, t('PAUSED')),
      h('div', { class: 'os-paused-hint' }, t('Press') + ' ', this.hk('pause'), ' ' + t('or click Resume. No waves are sent while paused.')));
    // the pause tint goes first so the top bar, side panel and rack stay above it and clickable
    this.coach = h('div', { class: 'os-panel os-coach', role: 'region', 'aria-label': t('Tutorial and tips') });
    this.el.append(this.padCursor, this.replayBadge, this.paused, this.leak, this.top, this.log, this.toasts, this.focusBadge, this.modeHint, this.side, this.rack, this.coach);
    // the error bubble sits outside of the clipped root so it can sit anywhere
    this.el.append(this.err, this.live);
  }

  /** Show the gamepad crosshair at a screen point, or hide it with null. */
  showPadCursor(p: { cx: number; cy: number } | null): void {
    this.padCursor.style.display = p ? 'block' : 'none';
    if (p) this.padCursor.style.transform = `translate(${p.cx}px, ${p.cy}px)`;
  }

  // ------------------------------------------------------------ coach card (tutorial and tips)
  /** Show a coach card, or hide it with null. Rebuilt only when `key` changes; the text is also announced. */
  showCoach(v: CoachView | null): void {
    const key = v ? v.key : '';
    if (key === this.coachKey) return;
    this.coachKey = key;
    if (!v) { this.coach.classList.remove('on'); this.coach.replaceChildren(); return; }
    this.coach.className = 'os-panel os-coach on ' + (v.tip ? 'tip' : 'tut');
    this.coach.replaceChildren(
      h('div', { class: 'os-coach-head' }, h('span', { class: 'os-coach-tag' }, v.tip ? t('Tip') : t('Tutorial')), h('b', null, v.title), v.progress ? h('span', { class: 'os-coach-prog' }, v.progress) : null),
      h('p', null, v.text),
      h('div', { class: 'os-coach-btns' }, ...v.buttons.map((b) => {
        const el = h('button', { class: 'os-btn small' + (b.primary ? ' primary' : ''), type: 'button', tabindex: -1 }, b.label);
        el.addEventListener('click', () => { b.onClick(); el.blur(); });
        return el;
      })));
    this.announce((v.tip ? t('Tip') + ': ' : '') + v.title + '. ' + v.text);
  }

  // ------------------------------------------------------------ feedback
  /**
   * Tell screen readers (polite live region). At most one message per second: the latest wins, so 8x speed does not
   * flood the reader.
   */
  announce(text: string): void {
    this.livePending = text;
    if (this.liveTimer) return;
    const flush = (): void => {
      this.liveTimer = null;
      if (this.livePending == null) return;
      this.live.textContent = this.livePending;
      this.livePending = null;
      this.liveTimer = setTimeout(flush, 1000);
    };
    flush();
  }

  addLog(text: string): void {
    this.announce(text);
    const line = h('div', { class: 'os-log-line' }, text);
    this.log.append(line);
    this.logLines.push(line);
    while (this.logLines.length > 6) this.logLines.shift()!.remove();
    setTimeout(() => { line.remove(); const i = this.logLines.indexOf(line); if (i >= 0) this.logLines.splice(i, 1); }, 7000);
  }

  toast(text: string, cls?: string): void {
    this.announce(text);
    const tu = h('div', { class: 'os-toast ' + (cls || '') }, text);
    this.toasts.append(tu);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
    setTimeout(() => tu.remove(), 4000);
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

  /** Next-wave outlook in the top bar ("1.2K HP $12"), rebuilt only when the wave number changes. */
  updateIncoming(game: AppGame, wave: number): void {
    if (this.incomingWave === wave && this.incomingGame === game) return;
    this.incomingWave = wave;
    this.incomingGame = game;
    const p = game.wavePreview();
    setText(this.incomingEl!.firstChild!, t('Wave {n}', { n: p.wave }));
    setText(this.v.incoming, `${formatNum(p.hp)} HP $${formatNum(p.bounty)}`);
    const lines = [t('Coming up ({n} attackers per wave, HP and bounty each):', { n: p.count })];
    for (let n = p.wave; n < p.wave + 5; n++) {
      const q = game.wavePreview(n);
      lines.push(t('Wave {n}: {hp} HP, {cash}', { n: q.wave, hp: formatNum(q.hp), cash: '$' + formatNum(q.bounty) }));
    }
    this.incomingEl!.title = lines.join('\n');
  }

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
    setText(this.v.next, s.over ? '-' : app.tutorial && s.wave === 0 ? t('you start') : formatTime(s.nextWaveIn));
    this.updateIncoming(game, s.wave);
    this.dps.sample(game, s.time, s.turrets);
    this.speedBtns.forEach((b, i) => setClass(b, 'is-on', s.speed === SPEEDS[i]));
    setText(this.pauseBtn.firstChild!, (s.paused ? t('Resume') : t('Pause')) + ' ');
    setClass(this.pauseBtn, 'is-on', s.paused);
    show(this.paused, s.paused && !app.modalOpen(), 'flex');
    show(this.focusBadge, app.focusId != null, 'block');
    show(this.replayBadge, !!app.replayView, 'block');
    if (app.replayView) setText(this.replayBadge, t('REPLAY {p}%', { p: Math.round(app.replayView.pb.progress() * 100) }));
    setProp(this.sendBtn, 'disabled', !!s.over || !!s.paused);
    setClass(this.autoBtn, 'is-on', app.settings.autoSend);
    show(this.undoBtn, app.settings.undo, 'inline-flex');
    if (app.settings.undo) {
      const u = game.undoInfo();
      setProp(this.undoBtn, 'disabled', !u);
      const what = !u ? '' : u.kind === 'build' && u.turret ? t('build {name}', { name: TURRETS[u.turret]?.name || u.turret })
        : u.kind === 'upgrade' && u.turret && u.stat ? t('{stat} upgrade x{n} ({name})', { stat: t(STAT_NAMES[u.stat]), n: u.levels || 1, name: TURRETS[u.turret]?.name || u.turret }) : u.label;
      setProp(this.undoBtn, 'title', u ? t('Undo {what} (+{cash})', { what, cash: formatCash(u.refund) }) : t('Nothing to undo (a turret that fired since cannot be undone)'));
    }
    for (const [el, action] of this.keyHints) setText(el, app.keyFor(action));

    // rack
    for (let i = 0; i < this.slots.length; i++) {
      const sl = this.slots[i];
      const locked = !s.unlocked || !s.unlocked[sl.kind];
      setClass(sl.el, 'locked', locked);
      setClass(sl.el, 'poor', !locked && s.cash < sl.def.cost);
      setClass(sl.el, 'armed', app.mode === 'build' && app.armed === sl.kind);
      setClass(sl.el, 'cursor', app.rackIndex === i);
      if (locked) setText(sl.lockTxt, sl.def.unlockKills ? t('at {n}', { n: formatNum(sl.def.unlockKills) }) : '');
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
    let tu: TurretState | null = null;
    if (app.selectedId != null) tu = s.turrets.find((x) => x.id === app.selectedId) || null;
    if (app.selectedId != null && !tu) { app.deselect(); }
    const buildKind = app.mode === 'build' && app.armed ? app.armed : null;
    const key = tu ? 't:' + tu.id + ':' + tu.kind : (buildKind ? 'b:' + buildKind : '');
    if (key !== this.panelKey) {
      this.panelKey = key;
      this.refs = null;
      this.previewStat = null;
      app.setPreviewRange(null);
      this.side.replaceChildren();
      if (tu) this.refs = this.buildTurretView(tu);
      else if (buildKind) this.buildKindView(buildKind);
    }
    const wasOn = this.side.classList.contains('on');
    setClass(this.side, 'on', !!key);
    setClass(this.side, 'collapsed', app.settings.infoCollapsed);
    if (key && !wasOn) this.applyPanelPos();
    if (tu && this.refs) this.updateTurretView(tu, s);
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
    // the docked panel sits below the top bar; the bar wraps to more rows at a large UI scale or a narrow window
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => { const hgt = this.top.offsetHeight; if (hgt) this.el.style.setProperty('--top-h', (this.top.offsetTop + hgt) + 'px'); }).observe(this.top);
    }
  }

  /** Put the panel at the saved position (clamped), or back in the CSS dock when there is none. */
  applyPanelPos(): void {
    const p = this.app.settings.panelPos;
    const st = this.side.style;
    // narrow screens dock the panel as a bottom sheet (CSS); a dragged position would not fit there
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || window.innerWidth <= NARROW_PX) { st.left = st.top = st.right = st.maxHeight = ''; return; }
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
    const collapse = h('button', { class: 'os-iconbtn', type: 'button', tabindex: -1, title: t('Collapse or expand (I)'), 'aria-label': t('Collapse or expand the panel') }, app.settings.infoCollapsed ? '+' : '–');
    collapse.addEventListener('click', () => { app.toggleInfo(); collapse.textContent = app.settings.infoCollapsed ? '+' : '–'; collapse.blur(); });
    this.collapseBtn = collapse;
    const close = h('button', { class: 'os-iconbtn', type: 'button', tabindex: -1, title: t('Close (Esc)'), 'aria-label': t('Close the panel') }, '×');
    close.addEventListener('click', () => { app.cancelOrDeselect(); close.blur(); });
    const head = h('div', { class: 'os-side-head', title: t('Drag to move, double-click to reset') },
      h('div', { class: 'os-ico', html: iconSvg(kind) }),
      h('div', { class: 'os-side-title' }, h('b', null, title), sub),
      collapse, close);
    return { head, sub };
  }

  buildKindView(kind: string): void {
    const def = TURRETS[kind];
    const { head } = this.header(kind, def.name, t(CAT_NAMES[def.category]));
    const lines: HTMLElement[] = [];
    if (def.base && def.base.rate) {
      lines.push(h('div', { class: 'os-chips' },
        h('span', { class: 'os-chip' }, t('Damage') + ' ' + formatNum(def.base.damage)),
        h('span', { class: 'os-chip' }, t('Range') + ' ' + def.base.range),
        h('span', { class: 'os-chip' }, t('Rate') + ' ' + def.base.rate + '/min')));
    } else if (def.base && def.base.range) {
      lines.push(h('div', { class: 'os-chips' }, h('span', { class: 'os-chip' }, t('Range') + ' ' + def.base.range)));
    }
    const body = h('div', { class: 'os-side-body' },
      h('div', { class: 'os-blurb' }, t(def.blurb)),
      h('div', { class: 'os-chips' }, h('span', { class: 'os-chip amber' }, t('Cost') + ' ' + formatCash(def.cost))),
      ...lines,
      h('div', { class: 'os-hint' }, t('Click to place. Shift+Click keeps building. Esc or right click cancels.')));
    this.side.append(head, body);
  }

  buildTurretView(tu: TurretState): TurretRefs {
    const app = this.app;
    const def = TURRETS[tu.kind];
    const cat = def.category;
    const { head, sub } = this.header(tu.kind, def.name, t(CAT_NAMES[cat]));
    // the remaining fields (vals, chips, sell, move, rangeHint, tabBtns, ...) are assigned below, before refs is returned
    const refs = { sub, rows: {}, def, cat, panes: {}, tabBtns: {} } as unknown as TurretRefs;
    const pane = () => h('div', { class: 'os-side-body os-pane' });

    // ---- General: blurb, current stats, status chips, actions
    const general = pane();
    general.append(h('div', { class: 'os-blurb' }, t(def.blurb)));
    const statList: Stat[] = cat === 'modifier' ? ['range'] : ['damage', 'range', 'rate'];
    refs.vals = {};
    const valsEl = h('div', { class: 'os-vals' });
    for (const stat of statList) {
      if (cat !== 'modifier' && !(def.base && def.base[stat] != null)) continue;
      const b = h('b', null, '');
      refs.vals[stat] = b;
      valsEl.append(h('div', null, h('span', null, t(cat === 'modifier' ? INFLUENCE : STAT_NAMES[stat])), b));
    }
    if (valsEl.children.length) general.append(valsEl);
    refs.chips = {
      holding: h('span', { class: 'os-chip good hidden' }, t('Holding pattern')),
      combo: h('span', { class: 'os-chip amber hidden' }), links: h('span', { class: 'os-chip hidden' }),
      joined: h('span', { class: 'os-chip hidden' }), kills: h('span', { class: 'os-chip hidden' }),
      damage: h('span', { class: 'os-chip hidden', title: t('Damage this turret has done (overkill not counted, its combos included) and its damage per second over the last 10 s of game time') }),
      lock: h('span', { class: 'os-chip hidden' }, t('Target locked')),
    };
    general.append(h('div', { class: 'os-chips' }, ...Object.values(refs.chips)));
    const actions = h('div', { class: 'os-actions' });
    const act = (key: 'sell' | 'move' | 'target' | 'lock' | 'dir' | 'join' | 'color', cls: string, content: Kid, fn: () => void, title: string): HTMLButtonElement => { const b = this.btn(cls, content, fn, title); refs[key] = b; actions.append(b); return b; };
    const k = (x: string): HTMLElement => h('span', { class: 'os-kbd' }, x);
    act('sell', '', [h('span', null, t('Sell')), k(app.keyFor('sell'))], () => app.sell(), t('Sell for 70% of everything spent on it'));
    act('move', '', [h('span', null, t('Move') + ' ' + formatCash(MOVE_COST)), k(app.keyFor('move'))], () => app.startMove(), t('Move this turret'));
    if (cat === 'weapon') {
      act('target', '', [h('span', null, ''), k(app.keyFor('target'))], () => app.cycleTarget(), t('Cycle targeting mode'));
      act('lock', '', [h('span', null, t('Lock')), k(app.keyFor('lock'))], () => app.toggleLock(), t('Keep the current target while it is in range'));
      act('dir', 'wide', [h('span', null, ''), k(app.keyFor('cone'))], () => app.cycleDirectional(), t('Firing cone (Shift+{key} aims it at the cursor)', { key: app.keyFor('cone') }));
    }
    if (tu.kind === 'targeter') {
      act('join', 'wide', [h('span', null, ''), k(app.keyFor('join'))], () => app.toggleJoin(), t('Join this Targeter to a turret'));
    }
    if (tu.kind === 'comboOnly') {
      act('color', 'wide', [h('span', null, ''), k(app.keyFor('color'))], () => app.cycleColor(), t('Cycle the combo colour'));
    }
    general.append(actions);
    refs.rangeHint = h('div', { class: 'os-hint' }, '');
    general.append(refs.rangeHint);
    refs.panes.general = general;

    // ---- Upgrades: stat rows with pips and buy buttons
    const statsEl = h('div', { class: 'os-stats' });
    for (const stat of statList) {
      const maxL = tu.maxLevels ? tu.maxLevels[stat] : 0;
      const ladder = def.ladders && def.ladders[stat];
      const ladderLen = ladder ? ladder.length : (cat === 'modifier' && stat === 'range' ? 1 : 0);
      const n = maxL || ladderLen;
      if (!n) continue;
      const val = h('b', null, '');
      const pips = h('div', { class: 'os-pips' }, ...Array.from({ length: n }, () => h('span', { class: 'os-pip' })));
      const key = app.keyFor(STAT_ACTION[stat]);
      const upBtn = this.btn('', [h('span', null, ''), h('span', { class: 'os-kbd' }, key)], (e: MouseEvent) => app.upgrade(stat, e.shiftKey), t(UPGRADE_TITLES[stat], { key }));
      const maxBtn = this.btn('', t('Max'), () => app.upgrade(stat, true), t('Upgrade as far as you can afford (Shift+{key})', { key }));
      const label = t(cat === 'modifier' ? INFLUENCE : STAT_NAMES[stat]);
      const row = h('div', { class: 'os-srow' },
        h('div', { class: 'os-srow-top' }, h('span', null, label), val), pips,
        h('div', { class: 'os-upg' }, upBtn, maxBtn));
      // hovering a stat row previews the value after one more level (and the new range ring); on the row, not the
      // button, because a disabled button (not enough cash) gets no pointer events
      row.addEventListener('pointerenter', () => { this.previewStat = stat; this.refreshUpgrades(); });
      row.addEventListener('pointerleave', () => { if (this.previewStat === stat) { this.previewStat = null; this.refreshUpgrades(); } });
      statsEl.append(row);
      refs.rows[stat] = { val, pips: [...pips.children], upBtn, upTxt: upBtn.firstChild!, maxBtn, lvl: -1 };
    }
    if (statsEl.children.length) {
      refs.panes.upgrades = pane();
      refs.panes.upgrades.append(statsEl);
    }

    // ---- Combos: counts, partners and countdown, recipes, recent combos
    if (cat === 'weapon' || tu.kind === 'comboOnly') {
      const cp = pane();
      const cr = refs.combo = { fired: h('b', null, '0'), assisted: h('b', null, '0'), next: h('b', null, ''), nextName: h('span', null, ''),
        partners: h('div', { class: 'os-cpartners' }), recipes: h('div', { class: 'os-clist' }), recent: h('div', { class: 'os-clist' }),
        recipeRows: [], recentRows: [], pKey: null, rKey: null, lKey: null };
      cp.append(
        h('div', { class: 'os-vals two' }, h('div', null, h('span', null, t('Fired')), cr.fired), h('div', null, h('span', null, t('Assisted')), cr.assisted)),
        h('div', { class: 'os-ctitle' }, t('Combo with')), cr.partners,
        h('div', { class: 'os-cnext' }, h('span', null, t('Next combo')), cr.next, cr.nextName),
        h('div', { class: 'os-ctitle' }, tu.kind === 'comboOnly' ? t('Can assist in') : t('Combos'),
          h('button', { class: 'os-linkbtn', type: 'button', tabindex: -1, title: t('Combo Codex ({key})', { key: app.keyFor('codex') }), onclick: () => app.openCodex() }, t('All combos'))), cr.recipes,
        h('div', { class: 'os-ctitle' }, t('Recent')), cr.recent);
      refs.panes.combos = cp;
    }

    // ---- Freakout
    if (def.freakout) {
      const fp = pane();
      refs.freak = h('span', { class: 'os-chip' });
      fp.append(h('div', { class: 'os-chips' }, refs.freak),
        h('div', { class: 'os-hint' }, t('Reach the damage and rate levels to make it eligible. It then freaks out every {a} to {b} s (less with more rate upgrades): a {warn} s warning, then {len} s of {bonus} (added to the modifier bonuses).',
          { a: FREAKOUT.space / 2000, b: FREAKOUT.space / 1000, warn: FREAKOUT.warn / 1000, len: FREAKOUT.length / 1000, bonus: freakBonus() })));
      refs.panes.freak = fp;
    }

    // ---- tab strip (only when there is more than one tab)
    const ids = TAB_ORDER.filter((id) => refs.panes[id]);
    this.side.append(head);
    if (ids.length > 1) {
      const strip = h('div', { class: 'os-tabs', role: 'tablist' });
      for (const id of ids) {
        const b = h('button', { class: 'os-tab', type: 'button', tabindex: -1, role: 'tab', id: 'os-tab-' + id, 'aria-controls': 'os-pane-' + id }, t(TAB_NAMES[id]));
        b.addEventListener('click', () => { this.tabPref = id; this.showTab(); b.blur(); });
        refs.tabBtns[id] = b;
        strip.append(b);
      }
      this.side.append(strip);
    }
    for (const id of ids) {
      const pn = refs.panes[id]!;
      pn.id = 'os-pane-' + id;
      if (ids.length > 1) { pn.setAttribute('role', 'tabpanel'); pn.setAttribute('aria-labelledby', 'os-tab-' + id); }
      this.side.append(pn);
    }
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
      const tu = this.app.game.state.turrets.find((x) => x.id === this.app.selectedId);
      if (tu) this.updateTurretView(tu, this.app.game.state);
    }
  }

  updateTurretView(tu: TurretState, s: GameState): void {
    const r = this.refs!;
    const app = this.app;
    setClass(this.side, 'collapsed', app.settings.infoCollapsed);
    if (this.collapseBtn) setText(this.collapseBtn, app.settings.infoCollapsed ? '+' : '–');
    if (app.settings.infoCollapsed || r.active !== 'upgrades') app.setPreviewRange(null);
    if (app.settings.infoCollapsed) return;
    if (r.active === 'upgrades') this.updateUpgrades(tu, s);
    else if (r.active === 'combos') this.updateCombos(tu, s);
    else if (r.active === 'freak') this.updateFreak(tu);
    else this.updateGeneral(tu, s);
  }

  statValue(tu: TurretState, stat: Stat): string {
    if (this.refs!.cat === 'modifier') return String(Math.round(tu.modRange != null ? tu.modRange : (tu.stats && tu.stats.range) || 0));
    if (stat === 'damage') return formatNum(tu.stats ? tu.stats.damage : 0);
    if (stat === 'range') return String(Math.round(tu.stats ? tu.stats.range : 0));
    return Math.round(tu.stats ? tu.stats.rate : 0) + '/min';
  }

  updateGeneral(tu: TurretState, s: GameState): void {
    const r = this.refs!;
    const app = this.app;
    for (const stat of Object.keys(r.vals) as Stat[]) setText(r.vals[stat], this.statValue(tu, stat));
    const refund = Math.floor((tu.cashValue || 0) * SELL_REFUND);
    setText(r.sell.firstChild!, t('Sell') + ' ' + formatCash(refund));
    setProp(r.move, 'disabled', s.cash < MOVE_COST);
    setClass(r.move, 'is-on', app.mode === 'move');
    if (r.target) { const m = tu.targetMode || TARGET_MODES[0]; setText(r.target._label!, t('Target: {mode}', { mode: TARGET_NAMES[m] ? t(TARGET_NAMES[m]) : m })); }
    if (r.lock) { setClass(r.lock, 'is-on', !!tu.locked); }
    if (r.dir) setText(r.dir._label!, t('Cone: {cone}', { cone: t(DIR_NAMES[tu.directional ? tu.directional.mode : 'normal'] || DIR_NAMES.normal) }));
    if (r.join) {
      const j = tu.joinedTo != null ? s.turrets.find((x) => x.id === tu.joinedTo) : null;
      setText(r.join._label!, app.mode === 'join' ? t('Click a turret...') : (j ? t('Joined: {name} (change)', { name: TURRETS[j.kind].name }) : t('Join to a turret')));
      setClass(r.join, 'is-on', app.mode === 'join');
    }
    if (r.color) {
      const c = tu.comboColor || 'red';
      setText(r.color._label!, t('Colour: {c}', { c: colorName(c) }));
      r.color.style.borderColor = COMBO_HEX[c] || '';
    }
    const c = r.chips;
    setClass(c.holding, 'hidden', !tu.holding);
    setClass(c.combo, 'hidden', !tu.comboCapable);
    setText(c.combo, tu.comboReady ? t('Combo ready') : t('Combo capable'));
    const nLinks = tu.links ? tu.links.length : 0;
    setClass(c.links, 'hidden', !nLinks);
    setText(c.links, t('Chained lasers: {n}', { n: nLinks }));
    const hasKills = typeof tu.kills === 'number';
    setClass(c.kills, 'hidden', !hasKills);
    if (hasKills) setText(c.kills, t('Kills: {n}', { n: formatNum(tu.kills) }));
    const isWeapon = r.cat === 'weapon';
    setClass(c.damage, 'hidden', !isWeapon);
    if (isWeapon) {
      const dps = this.dps.dps(tu, s.time);
      setText(c.damage, t('Damage: {d}, DPS: {dps}', { d: formatNum(tu.damageDealt || 0), dps: dps == null ? '...' : formatNum(dps) }));
    }
    setClass(c.lock, 'hidden', !tu.locked);
    setClass(c.joined, 'hidden', true);
    setText(r.rangeHint, r.cat === 'modifier' ? t('Boosts every turret whose centre is inside the circle.') : (tu.kind === 'targeter' ? t('Join it to a turret to lend it this range.') : ''));
  }

  /** Re-run the Upgrades tab now (hover changes should not wait for the next 10 Hz tick). */
  refreshUpgrades(): void {
    const game = this.app.game;
    if (!game || !this.refs || this.refs.active !== 'upgrades') return;
    const tu = game.state.turrets.find((x) => x.id === this.app.selectedId);
    if (tu) this.updateUpgrades(tu, game.state);
  }

  /** A stat value in the panel's format (damage 1.2K, range 130, rate 60/min). */
  formatStat(stat: Stat, v: number): string {
    if (stat === 'damage') return formatNum(v);
    if (stat === 'range') return String(Math.round(v));
    return Math.round(v) + '/min';
  }

  updateUpgrades(tu: TurretState, s: GameState): void {
    const r = this.refs!;
    const game = this.app.game!;
    let ring: { id: number; range: number } | null = null;
    for (const stat of Object.keys(r.rows) as Stat[]) {
      const row = r.rows[stat];
      let pv = null;
      if (this.previewStat === stat) { try { pv = game.upgradePreview(tu.id, stat); } catch (e) { pv = null; } }
      setClass(row.val, 'os-preview', !!pv);
      if (pv) {
        setText(row.val, this.formatStat(stat, pv.from[stat]) + ' → ' + this.formatStat(stat, pv.to[stat]));
        if (stat === 'range') ring = { id: tu.id, range: pv.to.range };
      } else setText(row.val, this.statValue(tu, stat));
      const lvl = tu.levels ? tu.levels[stat] || 0 : 0;
      if (row.lvl !== lvl) { row.lvl = lvl; row.pips.forEach((p, i) => setClass(p, 'on', i < lvl)); }
      let cost = null;
      try { cost = game.upgradeCost(tu.id, stat); } catch (e) { cost = null; }
      if (cost == null) {
        setText(row.upTxt, t('Maxed'));
        setProp(row.upBtn, 'disabled', true);
        setProp(row.maxBtn, 'disabled', true);
      } else {
        setText(row.upTxt, '+ ' + formatCash(cost));
        const can = s.cash >= cost;
        setProp(row.upBtn, 'disabled', !can);
        setProp(row.maxBtn, 'disabled', !can);
      }
    }
    this.app.setPreviewRange(ring);
  }

  updateFreak(tu: TurretState): void {
    const fo = this.refs!.def.freakout!;
    const el = this.refs!.freak!;
    const fr = tu.freak || 'off';
    setClass(el, 'hot', fr === 'warn');
    setClass(el, 'good', fr === 'on');
    let txt;
    if (fr === 'off') {
      const lv = tu.levels || {};
      const d = Math.min(lv.damage || 0, fo.damage), ra = Math.min(lv.rate || 0, fo.rate);
      txt = t('Freak-out at {dmg} dmg + {rate} rate ({d}/{dmg}, {r}/{rate})', { dmg: fo.damage, rate: fo.rate, d, r: ra });
    } else if (fr === 'warn') txt = t('Freak-out incoming!');
    else if (fr === 'on') txt = t('FREAKING OUT {bonus}', { bonus: freakBonus() });
    else txt = t('Freak-out ready');
    setText(el, txt);
  }

  updateCombos(tu: TurretState, s: GameState): void {
    const cr = this.refs!.combo!;
    const game = this.app.game!;
    setText(cr.fired, formatNum(tu.combosFired || 0));
    setText(cr.assisted, formatNum(tu.combosAssisted || 0));
    const pv = (game.comboPreview && game.comboPreview(tu.id)) || { leads: false, partners: [], recipes: [], next: null };

    // partners in range (rebuilt only when the set changes)
    const pKey = pv.partners.map((p) => `${p.id}${p.color}`).join(',');
    if (pKey !== cr.pKey) {
      cr.pKey = pKey;
      cr.partnerEls = pv.partners.map((p) => h('span', { class: 'os-cpart' }, dot(p.color), TURRETS[p.kind] ? TURRETS[p.kind].name : p.kind));
      if (cr.partnerEls.length) cr.partners.replaceChildren(...cr.partnerEls);
      else cr.partners.replaceChildren(h('span', { class: 'os-hint' }, t('No weapons within combo range')));
    }
    pv.partners.forEach((p, i) => setClass(cr.partnerEls![i], 'off', p.wait > 0));

    // next combo
    if (!tu.comboCapable) { setText(cr.next, t('n/a')); setText(cr.nextName, tu.kind === 'comboOnly' ? '' : t('Unlocks at max damage')); }
    else if (!pv.next) { setText(cr.next, t('n/a')); setText(cr.nextName, pv.leads ? t('No recipe with these partners') : t('No lead in range')); }
    else { setText(cr.next, pv.next.wait > 0 ? t('in {time}', { time: formatWait(pv.next.wait) }) : t('ready')); setText(cr.nextName, pv.next.name); }

    // recipes (rows rebuilt only when the list changes; status text every update)
    const rKey = pv.recipes.map((x) => x.id).join(',');
    if (rKey !== cr.rKey) {
      cr.rKey = rKey;
      cr.recipeRows = pv.recipes.map((x) => {
        const status = h('em', null, '');
        const dots = [];
        for (const col of COLORS) for (let i = 0; i < (x.needs[col] || 0); i++) dots.push(dot(col));
        const el = h('div', { class: 'os-crow' }, h('span', { class: 'os-cdots' }, ...dots), h('span', { class: 'os-cname' }, x.name, x.isNew ? h('i', { class: 'os-cnew' }, t('new')) : null), status);
        return { el, status };
      });
      if (cr.recipeRows.length) cr.recipes.replaceChildren(...cr.recipeRows.map((x) => x.el));
      else cr.recipes.replaceChildren(h('span', { class: 'os-hint' }, t('No lead within combo range needs this colour')));
    }
    pv.recipes.forEach((x, i) => {
      const row = cr.recipeRows[i];
      const miss = Object.entries(x.missing);
      let txt;
      if (miss.length) txt = t('needs {list}', { list: miss.map(([col, n]) => colorCount(col, n)).join(', ') });
      else if (x.exactBlocked) txt = t('needs exactly {list}', { list: Object.entries(COMBO_EXACT[x.id] || {}).map(([col, n]) => colorCount(col, n ?? 0)).join(', ') });
      else if (x.wait === Infinity) txt = t('n/a');
      else txt = formatWait(x.wait);
      setText(row.status, txt);
      setClass(row.el, 'off', x.wait === Infinity);
      setClass(row.el, 'next', !!pv.next && pv.next.id === x.id);
    });

    // recent combos
    const log = tu.comboLog || [];
    const lKey = log.length + ':' + (log[0] ? log[0].time + log[0].id : '');
    if (lKey !== cr.lKey) {
      cr.lKey = lKey;
      cr.recentRows = log.map((e) => {
        const ago = h('em', null, '');
        const el = h('div', { class: 'os-crow' }, h('span', { class: 'os-cname' }, COMBO_NAMES[e.id] || e.id),
          h('span', { class: 'os-crole' }, e.role === 'lead' ? t('fired') : t('assisted')), ago);
        return { el, ago };
      });
      if (cr.recentRows.length) cr.recent.replaceChildren(...cr.recentRows.map((x) => x.el));
      else cr.recent.replaceChildren(h('span', { class: 'os-hint' }, t('None yet')));
    }
    log.forEach((e, i) => setText(cr.recentRows[i].ago, formatAgo(s.time - e.time)));
  }
}
