// Main menu screen.
import { h } from './dom.ts';
import { MAPS } from '../data/maps.ts';
import { DIFFICULTIES, MODES } from '../data/rules.ts';
import { LOCK_SVG } from './icons.ts';
import * as storage from './storage.ts';
import type { App } from './App.ts';
import type { MapDef } from '../types.ts';

const FIELD_W = 720;
const FIELD_H = 450;

export function drawMapPreview(canvas: HTMLCanvasElement, map: MapDef): void {
  const W = 192;
  const H = 120;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const g = canvas.getContext('2d')!;
  g.scale(dpr * (W / FIELD_W), dpr * (H / FIELD_H));
  g.fillStyle = '#c9ad78';
  g.fillRect(0, 0, FIELD_W, FIELD_H);
  // faint grid like circuit lines
  g.strokeStyle = 'rgba(90, 66, 30, 0.18)';
  g.lineWidth = 1;
  for (let x = 0; x <= FIELD_W; x += 45) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, FIELD_H); g.stroke(); }
  for (let y = 0; y <= FIELD_H; y += 45) { g.beginPath(); g.moveTo(0, y); g.lineTo(FIELD_W, y); g.stroke(); }
  const p = map.path;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const trace = () => {
    g.beginPath();
    g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
  };
  g.strokeStyle = '#4a3320';
  g.lineWidth = 36;
  trace(); g.stroke();
  g.strokeStyle = '#7b583a';
  g.lineWidth = 28;
  trace(); g.stroke();
  // base (map.base is the top-left corner of a 126 x 82 footprint)
  const [bx, by] = map.base;
  g.fillStyle = '#3a2a1c';
  g.fillRect(bx - 4, by - 4, 134, 90);
  g.fillStyle = '#f2a93b';
  g.fillRect(bx, by, 126, 82);
  g.fillStyle = '#7a4a10';
  g.fillRect(bx + 30, by + 22, 66, 38);
  // entry marker
  g.fillStyle = '#ff6a4d';
  g.beginPath(); g.arc(p[0][0], p[0][1], 16, 0, Math.PI * 2); g.fill();
}

export class Menu {
  app: App;
  el: HTMLElement;
  mapBtns: Map<string, HTMLButtonElement>;
  diffBtns: Map<string, HTMLButtonElement>;
  modeBtns: Map<string, HTMLButtonElement>;
  sel!: { mapId: string; difficulty: string; mode: string }; // assigned in build(), called by the constructor
  note!: HTMLElement;
  startBtn!: HTMLButtonElement;
  contBtn!: HTMLButtonElement;

  constructor(app: App) {
    this.app = app;
    this.el = h('div', { class: 'os-menu' });
    this.mapBtns = new Map();
    this.diffBtns = new Map();
    this.modeBtns = new Map();
    this.build();
  }

  build(): void {
    const app = this.app;
    const s = app.settings;
    this.sel = {
      mapId: MAPS.some((m) => m.id === s.lastMap) ? s.lastMap : MAPS[0].id,
      difficulty: DIFFICULTIES[s.lastDifficulty] ? s.lastDifficulty : 'medium',
      mode: MODES[s.lastMode] ? s.lastMode : 'normal',
    };

    const logo = h('div', { class: 'os-logo' },
      h('div', { html: LOGO_SVG }),
      h('div', null,
        h('h1', { 'aria-label': 'OnSlaught2.26' }, h('span', { class: 't1' }, 'OnSlaught'), h('span', { class: 't2' }, '2.26')),
        h('p', null, 'Hold the line. Upgrade. Combine. Survive.')));

    const maps = h('div', { class: 'os-maps' });
    let extraNo = 0;
    MAPS.forEach((m, i) => {
      const label = m.extra ? `E${++extraNo}. ${m.name}` : `${i + 1}. ${m.name}`;
      const cv = h('canvas');
      drawMapPreview(cv, m);
      const b = h('button', { class: 'os-map', type: 'button', onclick: () => this.pickMap(m.id) }, cv, h('span', null, label));
      this.mapBtns.set(m.id, b);
      maps.append(b);
    });

    const diff = h('div', { class: 'os-seg' });
    for (const [id, d] of Object.entries(DIFFICULTIES)) {
      const b = h('button', { class: 'os-btn', type: 'button', onclick: () => this.pickDiff(id) },
        h('span', { class: 'os-lockic', html: LOCK_SVG }), d.name);
      this.diffBtns.set(id, b);
      diff.append(b);
    }
    const mode = h('div', { class: 'os-seg' });
    for (const [id, m] of Object.entries(MODES)) {
      const b = h('button', { class: 'os-btn', type: 'button', onclick: () => this.pickMode(id) },
        h('span', { class: 'os-lockic', html: LOCK_SVG }), m.name);
      this.modeBtns.set(id, b);
      mode.append(b);
    }
    this.note = h('div', { class: 'os-menu-note' });
    this.startBtn = h('button', { class: 'os-btn primary big', type: 'button', onclick: () => this.start() }, 'Start');
    this.contBtn = h('button', { class: 'os-btn big', type: 'button', onclick: () => app.continueGame() }, 'Continue');

    const side = h('div', { class: 'os-menu-side' },
      h('div', null, h('h4', null, 'Difficulty'), diff),
      h('div', null, h('h4', null, 'Mode'), mode),
      this.note,
      this.startBtn,
      this.contBtn,
      h('div', { class: 'os-menu-btns' },
        h('button', { class: 'os-btn', type: 'button', onclick: () => app.openScores() }, 'High scores'),
        h('button', { class: 'os-btn', type: 'button', onclick: () => app.openSettings() }, 'Settings'),
        h('button', { class: 'os-btn', type: 'button', onclick: () => app.openHelp() }, 'How to play')));

    this.el.append(h('div', { class: 'os-panel os-menu-card' }, logo, h('div', { class: 'os-menu-main' }, maps, side)));
    this.refresh();
  }

  pickMap(id: string): void { this.sel.mapId = id; this.app.updateSettings({ lastMap: id }); this.refresh(); }

  pickDiff(id: string): void {
    if (!this.app.isDifficultyUnlocked(id)) { this.flash('Extreme unlocks after you reach wave 100 on Medium.'); return; }
    this.sel.difficulty = id;
    this.app.updateSettings({ lastDifficulty: id });
    this.refresh();
  }

  pickMode(id: string): void {
    if (!this.app.isModeUnlocked(id)) { this.flash('Sandbox unlocks after you reach wave 50 on any difficulty.'); return; }
    this.sel.mode = id;
    this.app.updateSettings({ lastMode: id });
    this.refresh();
  }

  flash(text: string): void { this.note.textContent = text; this.app.audio.play('error'); }

  start(): void {
    this.app.startGame({ ...this.sel });
  }

  refresh(): void {
    const app = this.app;
    if (!app.isDifficultyUnlocked(this.sel.difficulty)) this.sel.difficulty = 'medium';
    if (!app.isModeUnlocked(this.sel.mode)) this.sel.mode = 'normal';
    for (const [id, b] of this.mapBtns) b.classList.toggle('sel', id === this.sel.mapId);
    for (const [id, b] of this.diffBtns) {
      b.classList.toggle('is-on', id === this.sel.difficulty);
      b.classList.toggle('locked', !app.isDifficultyUnlocked(id));
      b.title = DIFFICULTIES[id].unlock ? 'Reach wave 100 on Medium to unlock' : '';
    }
    for (const [id, b] of this.modeBtns) {
      b.classList.toggle('is-on', id === this.sel.mode);
      b.classList.toggle('locked', !app.isModeUnlocked(id));
      b.title = MODES[id].unlock ? 'Reach wave 50 on any difficulty to unlock' : '';
    }
    const d = DIFFICULTIES[this.sel.difficulty];
    const secs = app.settings.waveInterval > 0 ? app.settings.waveInterval : d.waveInterval / 1000;
    this.note.textContent = this.sel.mode === 'sandbox'
      ? 'Sandbox: huge starting cash, everything unlocked.'
      : `${d.name}: $${d.startCash} start, ${d.lives} ${d.lives === 1 ? 'life' : 'lives'}, new wave every ${secs}s.`;
    const save = storage.loadGame();
    this.contBtn.style.display = save ? '' : 'none';
    if (save) {
      const m = save.meta || {};
      const map = MAPS.find((x) => x.id === m.mapId);
      this.contBtn.replaceChildren('Continue', h('span', { class: 'os-sub' },
        `${map ? map.name : 'Saved game'}${m.difficulty ? ', ' + (DIFFICULTIES[m.difficulty]?.name || m.difficulty) : ''}${m.wave != null ? ', wave ' + m.wave : ''}`));
    }
  }

  show(): void { this.refresh(); this.el.classList.add('on'); }
  hide(): void { this.el.classList.remove('on'); }
}

const LOGO_SVG = `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
<circle cx="32" cy="32" r="29" fill="#2b251f" stroke="#f2a93b" stroke-width="3"/>
<circle cx="32" cy="32" r="21" fill="none" stroke="#7d6c52" stroke-width="2" stroke-dasharray="4 3"/>
<g transform="rotate(-38 32 32)"><rect x="27.5" y="5" width="9" height="30" rx="3" fill="#f2a93b" stroke="#fff0c8" stroke-width="2"/><circle cx="32" cy="35" r="11" fill="#c27a14" stroke="#fff0c8" stroke-width="2.4"/></g>
<circle cx="32" cy="35" r="4" fill="#fff0c8"/>
<path d="M9 52l9-9M55 52l-9-9" stroke="#ff6a4d" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;
