// In-game HUD: top bar, build rack, selected turret panel, message log, toasts, feedback effects.
// Dynamic values are updated through cached setters so the DOM is only touched when something changes.
import { h, setText, setClass, setProp, show } from './dom.js';
import { TURRETS, BUILD_ORDER, SELL_REFUND, MOVE_COST } from '../data/turrets.js';
import { SPEEDS, TARGET_MODES } from '../data/rules.js';
import { iconSvg, LOCK_SVG } from './icons.js';
import { formatNum, formatCash, formatTime } from './format.js';

const TARGET_NAMES = { near: 'Nearest', far: 'Furthest', weak: 'Weakest', strong: 'Strongest', slow: 'Slowest', fast: 'Fastest', oldest: 'Oldest', newest: 'Newest' };
const DIR_NAMES = { normal: 'All around', wide: 'Wide 180', medium: 'Medium 90', small: 'Narrow 45' };
const STAT_NAMES = { damage: 'Damage', range: 'Range', rate: 'Rate' };
const STAT_KEYS = { damage: 'Q', range: 'W', rate: 'E' };
const COMBO_HEX = { red: '#ff6a4d', green: '#52d17a', blue: '#4da3ff', yellow: '#ffd54a' };

export const hotkeyLabel = (i) => (i < 8 ? String(i + 1) : '⇧' + (i - 7));

export class Hud {
  constructor(app) {
    this.app = app;
    this.el = h('div', { class: 'os-hud' });
    this.panelKey = '';
    this.refs = null;
    this.logLines = [];
    this.build();
  }

  btn(cls, text, onclick, title) {
    const b = h('button', { class: 'os-btn ' + cls, type: 'button', tabindex: -1, title: title || null }, text);
    b.addEventListener('click', (e) => { onclick(e); b.blur(); });
    return b;
  }

  stat(key, label, cls) {
    const v = h('span', { class: 'os-stat-v' }, '0');
    this.v[key] = v;
    return h('div', { class: 'os-stat ' + (cls || '') }, h('span', { class: 'os-stat-l' }, label), v);
  }

  build() {
    const app = this.app;
    this.v = {};
    // ----- top bar
    const stats = h('div', { class: 'os-panel' },
      this.stat('cash', 'Cash', 'cash'), this.stat('lives', 'Lives', 'lives'), this.stat('wave', 'Wave', 'wave'),
      this.stat('kills', 'Kills'), this.stat('score', 'Score'));
    this.livesEl = stats.querySelector('.lives');
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
  addLog(text) {
    const line = h('div', { class: 'os-log-line' }, text);
    this.log.append(line);
    this.logLines.push(line);
    while (this.logLines.length > 6) this.logLines.shift().remove();
    setTimeout(() => { line.remove(); const i = this.logLines.indexOf(line); if (i >= 0) this.logLines.splice(i, 1); }, 7000);
  }

  toast(text, cls) {
    const t = h('div', { class: 'os-toast ' + (cls || '') }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 4000);
  }

  showError(text, cx, cy) {
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

  flashLeak() {
    this.leak.classList.remove('show');
    void this.leak.offsetWidth;
    this.leak.classList.add('show');
  }

  setVisible(on) { this.el.classList.toggle('on', on); }

  // ------------------------------------------------------------ per tick update (about 10 Hz)
  update() {
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
    setText(this.pauseBtn.firstChild, s.paused ? 'Resume ' : 'Pause ');
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
  updateSide() {
    const app = this.app;
    const s = app.game.state;
    let t = null;
    if (app.selectedId != null) t = s.turrets.find((x) => x.id === app.selectedId) || null;
    if (app.selectedId != null && !t) { app.deselect(); }
    const buildKind = app.mode === 'build' && app.armed ? app.armed : null;
    const key = t ? 't:' + t.id + ':' + t.kind : (buildKind ? 'b:' + buildKind : '');
    if (key !== this.panelKey) {
      this.panelKey = key;
      this.refs = null;
      this.side.replaceChildren();
      if (t) this.refs = this.buildTurretView(t);
      else if (buildKind) this.refs = this.buildKindView(buildKind);
    }
    setClass(this.side, 'on', !!key);
    setClass(this.side, 'collapsed', app.settings.infoCollapsed);
    if (t && this.refs) this.updateTurretView(t, s);
  }

  header(kind, title, subtitle) {
    const app = this.app;
    const sub = h('span', null, subtitle);
    const collapse = h('button', { class: 'os-iconbtn', type: 'button', tabindex: -1, title: 'Collapse or expand (I)' }, app.settings.infoCollapsed ? '+' : '–');
    collapse.addEventListener('click', () => { app.toggleInfo(); collapse.textContent = app.settings.infoCollapsed ? '+' : '–'; collapse.blur(); });
    this.collapseBtn = collapse;
    const close = h('button', { class: 'os-iconbtn', type: 'button', tabindex: -1, title: 'Close (Esc)' }, '×');
    close.addEventListener('click', () => { app.cancelOrDeselect(); close.blur(); });
    const head = h('div', { class: 'os-side-head' },
      h('div', { class: 'os-ico', html: iconSvg(kind) }),
      h('div', { class: 'os-side-title' }, h('b', null, title), sub),
      collapse, close);
    return { head, sub };
  }

  buildKindView(kind) {
    const def = TURRETS[kind];
    const { head } = this.header(kind, def.name, def.category === 'modifier' ? 'Modifier' : (def.category === 'support' ? 'Support' : 'Weapon'));
    const lines = [];
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
    return {};
  }

  buildTurretView(t) {
    const app = this.app;
    const def = TURRETS[t.kind];
    const cat = def.category;
    const { head, sub } = this.header(t.kind, def.name, cat === 'modifier' ? 'Modifier' : cat === 'support' ? 'Support' : 'Weapon');
    const refs = { sub, rows: {}, def, cat };
    const body = h('div', { class: 'os-side-body' });
    body.append(h('div', { class: 'os-blurb' }, def.blurb));

    // stat rows
    const statsEl = h('div', { class: 'os-stats' });
    const statList = cat === 'modifier' ? ['range'] : ['damage', 'range', 'rate'];
    for (const stat of statList) {
      const maxL = t.maxLevels ? t.maxLevels[stat] : 0;
      const ladder = def.ladders && def.ladders[stat];
      const ladderLen = ladder ? ladder.length : (cat === 'modifier' && stat === 'range' ? 1 : 0);
      const n = maxL || ladderLen;
      if (!n) continue;
      const val = h('b', null, '');
      const pips = h('div', { class: 'os-pips' }, ...Array.from({ length: n }, () => h('span', { class: 'os-pip' })));
      const upBtn = this.btn('', [h('span', null, ''), h('span', { class: 'os-kbd' }, STAT_KEYS[stat])], (e) => app.upgrade(stat, e.shiftKey), 'Upgrade ' + STAT_NAMES[stat].toLowerCase() + ' (' + STAT_KEYS[stat] + ')');
      const maxBtn = this.btn('', 'Max', () => app.upgrade(stat, true), 'Upgrade as far as you can afford (Shift+' + STAT_KEYS[stat] + ')');
      const label = cat === 'modifier' ? 'Influence' : STAT_NAMES[stat];
      const row = h('div', { class: 'os-srow' },
        h('div', { class: 'os-srow-top' }, h('span', null, label), val), pips,
        h('div', { class: 'os-upg' }, upBtn, maxBtn));
      statsEl.append(row);
      refs.rows[stat] = { val, pips: [...pips.children], upBtn, upTxt: upBtn.firstChild, maxBtn, lvl: -1 };
    }
    if (statsEl.children.length) body.append(statsEl);

    // status chips
    refs.chips = {
      freak: h('span', { class: 'os-chip hidden' }), holding: h('span', { class: 'os-chip good hidden' }, 'Holding pattern'),
      combo: h('span', { class: 'os-chip amber hidden' }), links: h('span', { class: 'os-chip hidden' }),
      joined: h('span', { class: 'os-chip hidden' }), kills: h('span', { class: 'os-chip hidden' }),
      lock: h('span', { class: 'os-chip hidden' }, 'Target locked'),
    };
    body.append(h('div', { class: 'os-chips' }, ...Object.values(refs.chips)));

    // actions
    const actions = h('div', { class: 'os-actions' });
    const act = (key, cls, content, fn, title) => { const b = this.btn(cls, content, fn, title); refs[key] = b; actions.append(b); return b; };
    const k = (x) => h('span', { class: 'os-kbd' }, x);
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
    body.append(actions);
    refs.rangeHint = h('div', { class: 'os-hint' }, '');
    body.append(refs.rangeHint);
    this.side.append(head, body);
    for (const key of ['target', 'lock', 'dir', 'join', 'color']) if (refs[key]) refs[key]._label = refs[key].firstChild;
    return refs;
  }

  updateTurretView(t, s) {
    const r = this.refs;
    const app = this.app;
    const cash = s.cash;
    setClass(this.side, 'collapsed', app.settings.infoCollapsed);
    if (this.collapseBtn) setText(this.collapseBtn, app.settings.infoCollapsed ? '+' : '–');
    if (app.settings.infoCollapsed) return;
    const game = app.game;
    // stat rows
    for (const stat of Object.keys(r.rows)) {
      const row = r.rows[stat];
      let value;
      if (r.cat === 'modifier') value = Math.round(t.modRange != null ? t.modRange : (t.stats && t.stats.range) || 0);
      else if (stat === 'damage') value = formatNum(t.stats ? t.stats.damage : 0);
      else if (stat === 'range') value = String(Math.round(t.stats ? t.stats.range : 0));
      else value = Math.round(t.stats ? t.stats.rate : 0) + '/min';
      setText(row.val, value);
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
        const can = cash >= cost;
        setProp(row.upBtn, 'disabled', !can);
        setProp(row.maxBtn, 'disabled', !can);
      }
    }
    // actions
    const refund = Math.floor((t.cashValue || 0) * SELL_REFUND);
    setText(r.sell.firstChild, 'Sell ' + formatCash(refund));
    setProp(r.move, 'disabled', cash < MOVE_COST);
    setClass(r.move, 'is-on', app.mode === 'move');
    if (r.target) setText(r.target._label, 'Target: ' + (TARGET_NAMES[t.targetMode] || t.targetMode || TARGET_MODES[0]));
    if (r.lock) { setClass(r.lock, 'is-on', !!t.locked); }
    if (r.dir) setText(r.dir._label, 'Cone: ' + (DIR_NAMES[t.directional ? t.directional.mode : 'normal'] || 'All around'));
    if (r.join) {
      const j = t.joinedTo != null ? s.turrets.find((x) => x.id === t.joinedTo) : null;
      setText(r.join._label, app.mode === 'join' ? 'Click a turret...' : (j ? 'Joined: ' + TURRETS[j.kind].name + ' (change)' : 'Join to a turret'));
      setClass(r.join, 'is-on', app.mode === 'join');
    }
    if (r.color) {
      const c = t.comboColor || 'red';
      setText(r.color._label, 'Colour: ' + c);
      r.color.style.borderColor = COMBO_HEX[c] || '';
    }
    // chips
    const c = r.chips;
    const fr = t.freak || 'off';
    setClass(c.freak, 'hidden', fr === 'off');
    setClass(c.freak, 'hot', fr === 'warn');
    setClass(c.freak, 'good', fr === 'on');
    setText(c.freak, fr === 'warn' ? 'Freak-out incoming!' : fr === 'on' ? 'FREAKING OUT x3 dmg x4 rate' : 'Freak-out ready');
    setClass(c.holding, 'hidden', !t.holding);
    const capable = t.comboCapable;
    setClass(c.combo, 'hidden', !capable);
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
}
