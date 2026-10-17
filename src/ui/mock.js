// Test harness: a fake Game (implements the ARCHITECTURE.md section 1 API with fake, simple rules)
// and a 2D canvas MockRenderer (implements the section 2 API). Used by ui-demo.html only.
import { MAPS } from '../data/maps.js';
import { TURRETS, BUILD_ORDER, MODIFIER_RANGE, SELL_REFUND, MOVE_COST, TURRET_SIZE, COMBO_RANGE } from '../data/turrets.js';
import { DIFFICULTIES, MODES, WAVES, TARGET_MODES, DIRECTIONAL } from '../data/rules.js';

const STATS = ['damage', 'range', 'rate'];
const DIR_MODES = Object.keys(DIRECTIONAL);

export function createMockGame(opts = {}) { return new MockGame(opts); }
export function restoreMockGame(save) { return new MockGame(save.opts || {}, save); }

class MockGame {
  constructor(opts, saved) {
    this.opts = { mapId: 'map1', difficulty: 'medium', mode: 'normal', unlockAll: false, ...opts };
    this.listeners = {};
    if (saved) {
      this.state = JSON.parse(JSON.stringify(saved.state));
      this.nid = saved.nid;
      this.queue = saved.queue || [];
      this.spawnClock = saved.spawnClock || 0;
      this.cool = saved.cool || {};
    } else {
      const o = this.opts;
      const diff = DIFFICULTIES[o.difficulty] || DIFFICULTIES.medium;
      const mode = MODES[o.mode] || MODES.normal;
      const m = MAPS.find((x) => x.id === o.mapId) || MAPS[0];
      let length = 0;
      for (let i = 1; i < m.path.length; i++) length += Math.hypot(m.path[i][0] - m.path[i - 1][0], m.path[i][1] - m.path[i - 1][1]);
      const unlocked = {};
      for (const k of BUILD_ORDER) unlocked[k] = !TURRETS[k].unlockKills || o.unlockAll || !!mode.unlockAllTurrets;
      this.state = {
        time: 0, speed: 1, paused: false, over: false, difficulty: o.difficulty, mode: o.mode, mapId: m.id,
        cash: mode.startCash && o.mode === 'sandbox' ? mode.startCash : diff.startCash, lives: diff.lives, kills: 0, spent: 0, wave: 0,
        nextWaveIn: o.waveInterval || diff.waveInterval, score: 0, unlocked,
        map: { id: m.id, name: m.name, path: m.path, base: { x: m.base[0], y: m.base[1], w: 126, h: 82 }, roadWidth: 28, length },
        attackers: [], turrets: [], projectiles: [], beams: [], effects: [],
      };
      this.nid = 1;
      this.queue = [];
      this.spawnClock = 0;
      this.cool = {};
    }
    this.cum = [0];
    const p = this.state.map.path;
    for (let i = 1; i < p.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    this.comboClock = 0;
  }

  // ---------- events
  on(n, f) { (this.listeners[n] ||= []).push(f); }
  off(n, f) { const l = this.listeners[n]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
  emit(n, p) { for (const f of (this.listeners[n] || []).slice()) f(p); }
  fail(reason) { this.emit('error', { reason }); return { ok: false, reason }; }

  // ---------- persistence
  serialize() { return JSON.parse(JSON.stringify({ opts: this.opts, state: this.state, nid: this.nid, queue: this.queue, spawnClock: this.spawnClock, cool: this.cool })); }
  static deserialize(save) { return restoreMockGame(save); }

  // ---------- simulation
  update(dtMs) {
    const s = this.state;
    if (s.paused || s.over) return;
    let t = dtMs * s.speed;
    while (t > 0) { const step = Math.min(t, 50); this.step(step); t -= step; if (s.over) break; }
  }

  posAt(d) {
    const p = this.state.map.path;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const f = Math.max(0, Math.min(1, (d - this.cum[i - 1]) / seg));
    return { x: p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, y: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f, angle: Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]) };
  }

  step(ms) {
    const s = this.state;
    s.time += ms;
    s.nextWaveIn -= ms;
    if (s.nextWaveIn <= 0) this.startWave(false);
    // spawn
    this.spawnClock -= ms;
    while (this.queue.length && this.spawnClock <= 0) {
      const a = this.queue.shift();
      s.attackers.push({ id: this.nid++, type: a.type, x: 0, y: 0, angle: 0, hp: a.hp, maxHp: a.hp, bounty: a.bounty, speed: 60, baseSpeed: 60, poisoned: false, blackholed: false, progress: 0 });
      this.spawnClock += WAVES.spacing;
    }
    if (!this.queue.length) this.spawnClock = 0;
    // move
    for (const a of s.attackers) {
      a.progress += (a.speed * ms) / 1000;
      const p = this.posAt(Math.min(a.progress, s.map.length));
      a.x = p.x; a.y = p.y; a.angle = p.angle;
    }
    for (let i = s.attackers.length - 1; i >= 0; i--) {
      const a = s.attackers[i];
      if (a.progress >= s.map.length) {
        s.attackers.splice(i, 1);
        s.lives = Math.max(0, s.lives - 1);
        this.emit('leak', { lives: s.lives });
        if (s.lives <= 0) { this.finish(); return; }
      }
    }
    // turrets shoot
    s.beams = s.beams.filter((b) => (b.age += ms) < b.ttl);
    for (const t of s.turrets) {
      const def = TURRETS[t.kind];
      if (def.category !== 'weapon') continue;
      this.cool[t.id] = (this.cool[t.id] || 0) - ms;
      if (this.cool[t.id] > 0) continue;
      let target = null;
      let bd = Infinity;
      for (const a of s.attackers) {
        const d = Math.hypot(a.x - t.x, a.y - t.y);
        if (d <= t.stats.range && d < bd) { bd = d; target = a; }
      }
      if (!target) continue;
      this.cool[t.id] = 60000 / Math.max(1, t.stats.rate);
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      t.targetId = target.id;
      this.emit('shot', { kind: t.kind, turretId: t.id });
      s.beams.push({ kind: def.weapon === 'laser' ? 'laser' : 'spark', x1: t.x, y1: t.y, x2: target.x, y2: target.y, age: 0, ttl: 120 });
      target.hp -= t.stats.damage;
      this.emit('hit', { attackerId: target.id });
      if (target.hp <= 0) this.kill(target);
    }
    // fake freak-out cycle
    for (const t of s.turrets) {
      if (t.kind === 'blue' || t.kind === 'yellow') {
        if (t.levels.damage >= 4 && t.levels.rate >= 4) {
          const ph = (s.time / 1000 + t.id * 7) % 40;
          t.freak = ph > 37 ? 'warn' : ph > 32 ? 'on' : 'available';
        } else t.freak = 'off';
      }
    }
    // fake combos and unlocks
    this.comboClock += ms;
    if (this.comboClock > 20000) {
      this.comboClock = 0;
      const t = s.turrets.find((x) => x.comboCapable);
      if (t) { this.emit('combo', { id: 'nuke', name: 'Nuke', turretId: t.id }); this.emit('blast', { size: 'huge', x: t.x, y: t.y }); }
    }
    for (const k of BUILD_ORDER) {
      const def = TURRETS[k];
      if (!s.unlocked[k] && def.unlockKills && s.kills >= def.unlockKills) { s.unlocked[k] = true; this.emit('unlock', { kind: k }); }
    }
  }

  startWave(early) {
    const s = this.state;
    const diff = DIFFICULTIES[s.difficulty] || DIFFICULTIES.medium;
    s.wave++;
    const hp = WAVES.baseEnergy * Math.pow(diff.hpGrowth, s.wave);
    for (let i = 0; i < WAVES.size; i++) this.queue.push({ type: (s.wave - 1) % 9, hp, bounty: s.wave });
    this.spawnClock = 0;
    s.nextWaveIn = this.opts.waveInterval || diff.waveInterval;
    this.emit('wave', { wave: s.wave });
    this.emit('message', { text: `Wave ${s.wave} incoming${early ? ' (early)' : ''}` });
  }

  kill(a) {
    const s = this.state;
    const i = s.attackers.indexOf(a);
    if (i >= 0) s.attackers.splice(i, 1);
    s.kills++;
    s.cash += a.bounty;
    s.score = s.kills * s.spent;
    this.emit('kill', { attackerId: a.id, x: a.x, y: a.y, bounty: a.bounty });
    if (s.kills % 6 === 0) this.emit('blast', { size: ['small', 'medium', 'large'][s.kills % 3], x: a.x, y: a.y });
  }

  finish() {
    const s = this.state;
    s.over = true;
    s.score = s.kills * s.spent;
    this.emit('gameover', { score: s.score, kills: s.kills, wave: s.wave });
  }

  // ---------- helpers
  find(id) { return this.state.turrets.find((t) => t.id === id) || null; }

  distToRoad(x, y) {
    const p = this.state.map.path;
    let best = Infinity;
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1];
      const [bx, by] = p[i];
      const dx = bx - ax; const dy = by - ay;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
    }
    return best;
  }

  recompute(t) {
    const def = TURRETS[t.kind];
    t.maxLevels = { damage: 0, range: 0, rate: 0 };
    if (def.ladders) for (const st of STATS) t.maxLevels[st] = def.ladders[st].length;
    if (def.category === 'modifier') t.maxLevels.range = 1;
    if (def.base) {
      for (const st of STATS) {
        const lv = t.levels[st];
        t.stats[st] = lv > 0 && def.ladders ? def.ladders[st][lv - 1].value : def.base[st];
      }
    }
    if (def.category === 'modifier') t.modRange = t.levels.range ? MODIFIER_RANGE.upgraded : MODIFIER_RANGE.base;
    t.comboCapable = def.category === 'weapon' && t.maxLevels.damage > 0 && t.levels.damage >= t.maxLevels.damage;
    t.comboReady = t.comboCapable;
  }

  // ---------- commands
  canBuild(kind, x, y, ignoreId = null) {
    const s = this.state;
    const def = TURRETS[kind];
    if (!def) return { ok: false, reason: 'Unknown turret' };
    if (!s.unlocked[kind]) return { ok: false, reason: 'Turret is locked' };
    if (s.cash < def.cost) return { ok: false, reason: 'Not enough cash' };
    const h = TURRET_SIZE / 2;
    if (x < h || y < h || x > 720 - h || y > 450 - h) return { ok: false, reason: 'Outside the field' };
    if (this.distToRoad(x, y) < h + 14) return { ok: false, reason: 'Too close to the road' };
    const b = s.map.base;
    if (x > b.x - h && x < b.x + b.w + h && y > b.y - h && y < b.y + b.h + h) return { ok: false, reason: 'Too close to the base' };
    for (const t of s.turrets) if (t.id !== ignoreId && Math.hypot(t.x - x, t.y - y) < TURRET_SIZE) return { ok: false, reason: 'Overlaps another turret' };
    return { ok: true };
  }

  build(kind, x, y) {
    const c = this.canBuild(kind, x, y);
    if (!c.ok) return this.fail(c.reason);
    const s = this.state;
    const def = TURRETS[kind];
    const t = {
      id: this.nid++, kind, x, y, angle: 0, levels: { damage: 0, range: 0, rate: 0 }, maxLevels: {}, stats: { damage: 0, range: 0, rate: 0 },
      cashValue: def.cost, comboCapable: false, comboReady: false, freak: 'off', holding: false, links: [],
      targetMode: def.target || 'near', locked: false, targetId: null, directional: { mode: 'normal', angle: 0 },
      joinedTo: null, comboColor: 'red', modRange: 0, kills: 0,
    };
    this.recompute(t);
    s.cash -= def.cost; s.spent += def.cost; s.score = s.kills * s.spent;
    s.turrets.push(t);
    this.emit('build', { id: t.id, kind });
    return { ok: true, id: t.id };
  }

  upgradeCost(id, stat) {
    const t = this.find(id);
    if (!t) return null;
    const def = TURRETS[t.kind];
    if (def.category === 'modifier') return stat === 'range' && !t.levels.range ? MODIFIER_RANGE.upgradeCost : null;
    const lad = def.ladders && def.ladders[stat];
    if (!lad) return null;
    const lv = t.levels[stat];
    return lv >= lad.length ? null : lad[lv].cost;
  }

  upgrade(id, stat, toMax = false) {
    const t = this.find(id);
    if (!t) return this.fail('No such turret');
    const s = this.state;
    let n = 0;
    do {
      const cost = this.upgradeCost(id, stat);
      if (cost == null) return n ? { ok: true } : this.fail('Already at maximum');
      if (s.cash < cost) return n ? { ok: true } : this.fail('Not enough cash');
      s.cash -= cost; s.spent += cost; t.cashValue += cost; t.levels[stat]++;
      this.recompute(t);
      s.score = s.kills * s.spent;
      this.emit('upgrade', { id, stat });
      n++;
    } while (toMax);
    return { ok: true };
  }

  sell(id) {
    const t = this.find(id);
    if (!t) return this.fail('No such turret');
    const s = this.state;
    const refund = Math.floor(t.cashValue * SELL_REFUND);
    s.cash += refund;
    s.turrets.splice(s.turrets.indexOf(t), 1);
    this.emit('sell', { id, refund });
    return { ok: true, refund };
  }

  move(id, x, y) {
    const t = this.find(id);
    if (!t) return this.fail('No such turret');
    const s = this.state;
    if (s.cash < MOVE_COST) return this.fail('Not enough cash to move');
    const h = TURRET_SIZE / 2;
    if (x < h || y < h || x > 720 - h || y > 450 - h) return this.fail('Outside the field');
    if (this.distToRoad(x, y) < h + 14) return this.fail('Too close to the road');
    for (const o of s.turrets) if (o.id !== id && Math.hypot(o.x - x, o.y - y) < TURRET_SIZE) return this.fail('Overlaps another turret');
    s.cash -= MOVE_COST; t.x = x; t.y = y;
    return { ok: true };
  }

  setTargetMode(id, mode) { const t = this.find(id); if (!t) return this.fail('No such turret'); t.targetMode = mode; return { ok: true }; }
  cycleTargetMode(id) { const t = this.find(id); if (!t) return this.fail('No such turret'); return this.setTargetMode(id, TARGET_MODES[(TARGET_MODES.indexOf(t.targetMode) + 1) % TARGET_MODES.length]); }
  toggleLock(id) { const t = this.find(id); if (!t) return this.fail('No such turret'); t.locked = !t.locked; return { ok: true }; }
  focusFire(aid) { this.focus = aid; return { ok: true }; }
  setDirectional(id, mode, angle) { const t = this.find(id); if (!t) return this.fail('No such turret'); t.directional = { mode, angle }; return { ok: true }; }
  cycleDirectional(id) { const t = this.find(id); if (!t) return this.fail('No such turret'); t.directional.mode = DIR_MODES[(DIR_MODES.indexOf(t.directional.mode) + 1) % DIR_MODES.length]; return { ok: true }; }
  join(tid, other) {
    const t = this.find(tid);
    if (!t || t.kind !== 'targeter') return this.fail('Only a Targeter can join');
    t.joinedTo = other == null || t.joinedTo === other ? null : other;
    return { ok: true };
  }
  setComboColor(id, color) { const t = this.find(id); if (!t) return this.fail('No such turret'); t.comboColor = color; return { ok: true }; }
  comboPartners(id) {
    const t = this.find(id);
    if (!t) return [];
    return this.state.turrets.filter((o) => o.id !== id && o.comboCapable && Math.hypot(o.x - t.x, o.y - t.y) <= COMBO_RANGE).map((o) => o.id);
  }
  sendWave() {
    const s = this.state;
    if (s.over) return this.fail('Game over');
    s.cash += Math.floor(s.nextWaveIn / 1000) * WAVES.earlyBonusPerSec;
    this.startWave(true);
    return { ok: true };
  }
  setSpeed(v) { this.state.speed = v; return { ok: true }; }
  togglePause() { this.state.paused = !this.state.paused; return { ok: true }; }
  setPaused(b) { this.state.paused = !!b; return { ok: true }; }
  turretAt(x, y) {
    for (const t of this.state.turrets) if (Math.hypot(t.x - x, t.y - y) <= TURRET_SIZE / 2) return t.id;
    return null;
  }

  // handy for demos: grant cash / kills
  cheat(cash = 100000, kills = 0) { this.state.cash += cash; this.state.kills += kills; }
}

// =====================================================================================================
// MockRenderer: 2D canvas, same public API as src/render/Renderer.js (section 2 of ARCHITECTURE.md).
const COL = { blue: '#4da3ff', green: '#52d17a', red: '#ff6a4d', yellow: '#ffd54a' };

export class MockRenderer {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.game = null;
    this.overlay = { ghost: null, selectedId: null, hoverId: null, showRanges: 'selected', showCombo: false, joinFromId: null };
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.mouse = { x: 0, y: 0 };
    this.drag = null;
    this.size = { w: 1, h: 1, dpr: 1 };
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.screenToWorld(e.clientX, e.clientY);
      this.zoom = Math.max(0.5, Math.min(4, this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const after = this.screenToWorld(e.clientX, e.clientY);
      this.panX += (after.x - before.x) * this.baseScale() * this.zoom;
      this.panY += (after.y - before.y) * this.baseScale() * this.zoom;
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => { if (e.button === 1 || e.button === 2) { this.drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); } });
    c.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (this.drag) { this.panX += e.clientX - this.drag.x; this.panY += e.clientY - this.drag.y; this.drag = { x: e.clientX, y: e.clientY }; }
    });
    c.addEventListener('pointerup', () => { this.drag = null; });
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.size = { w: r.width, h: r.height, dpr };
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  baseScale() { return Math.min(this.size.w / 720, this.size.h / 450) * 0.94; }
  setGame(g) { this.game = g; }
  resetView() { this.zoom = 1; this.panX = 0; this.panY = 0; }
  setOverlay(o) { Object.assign(this.overlay, o); }

  worldToScreen(x, y) {
    const r = this.canvas.getBoundingClientRect();
    const s = this.baseScale() * this.zoom;
    return { x: r.left + this.size.w / 2 + this.panX + (x - 360) * s, y: r.top + this.size.h / 2 + this.panY + (y - 225) * s };
  }

  screenToWorld(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const s = this.baseScale() * this.zoom;
    return { x: (cx - r.left - this.size.w / 2 - this.panX) / s + 360, y: (cy - r.top - this.size.h / 2 - this.panY) / s + 225 };
  }

  render() {
    const { w, h, dpr } = this.size;
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1a1410';
    g.fillRect(0, 0, w, h);
    const s = this.baseScale() * this.zoom;
    g.translate(w / 2 + this.panX, h / 2 + this.panY);
    g.scale(s, s);
    g.translate(-360, -225);
    g.fillStyle = '#d4b987';
    g.fillRect(0, 0, 720, 450);
    g.strokeStyle = 'rgba(100,75,35,0.18)';
    g.lineWidth = 1;
    for (let x = 0; x <= 720; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 450); g.stroke(); }
    for (let y = 0; y <= 450; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(720, y); g.stroke(); }
    const game = this.game;
    if (!game) return;
    const st = game.state;
    const p = st.map.path;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (const q of p) g.lineTo(q[0], q[1]);
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 28; g.stroke();
    const b = st.map.base;
    g.fillStyle = '#4a3828'; g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = '#f2a93b'; g.lineWidth = 3; g.strokeRect(b.x, b.y, b.w, b.h);
    const ov = this.overlay;
    const ring = (x, y, r, col) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = col + '22'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke(); };
    for (const t of st.turrets) {
      const def = TURRETS[t.kind];
      const col = COL[def.color] || '#c9b6ff';
      if (ov.showRanges === 'all' || t.id === ov.selectedId) ring(t.x, t.y, def.category === 'modifier' ? t.modRange : t.stats.range, '#ffffff');
      g.beginPath(); g.arc(t.x, t.y, 20, 0, Math.PI * 2); g.fillStyle = '#3a342c'; g.fill();
      g.lineWidth = t.id === ov.selectedId ? 4 : 2; g.strokeStyle = t.id === ov.selectedId ? '#ffd27a' : t.id === ov.hoverId ? '#fff' : '#222'; g.stroke();
      g.save(); g.translate(t.x, t.y); g.rotate(t.angle);
      g.fillStyle = col; g.fillRect(0, -4, 22, 8); g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill(); g.restore();
    }
    if (ov.showCombo && ov.selectedId != null) {
      const t = game.find(ov.selectedId);
      if (t) for (const id of game.comboPartners(t.id)) { const o = game.find(id); g.strokeStyle = '#ff0'; g.lineWidth = 2; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(o.x, o.y); g.stroke(); }
    }
    for (const bm of st.beams) { g.strokeStyle = bm.kind === 'laser' ? '#7fffa0' : '#ffe27a'; g.lineWidth = 2; g.beginPath(); g.moveTo(bm.x1, bm.y1); g.lineTo(bm.x2, bm.y2); g.stroke(); }
    for (const a of st.attackers) {
      g.save(); g.translate(a.x, a.y); g.rotate(a.angle);
      g.fillStyle = `hsl(${a.type * 40},60%,45%)`; g.fillRect(-9, -6, 18, 12); g.restore();
      g.fillStyle = '#300'; g.fillRect(a.x - 10, a.y - 12, 20, 3); g.fillStyle = '#6f6'; g.fillRect(a.x - 10, a.y - 12, 20 * Math.max(0, a.hp / a.maxHp), 3);
    }
    if (ov.joinFromId != null) {
      const t = game.find(ov.joinFromId);
      if (t) { const m = this.screenToWorld(this.mouse.x, this.mouse.y); g.strokeStyle = '#8cf'; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(m.x, m.y); g.stroke(); g.setLineDash([]); }
    }
    if (ov.ghost) {
      const gh = ov.ghost;
      const def = TURRETS[gh.kind];
      const col = gh.valid ? '#66ff88' : '#ff5544';
      const r = def.category === 'modifier' ? MODIFIER_RANGE.base : (def.base ? def.base.range : 0);
      if (r) ring(gh.x, gh.y, r, col);
      g.globalAlpha = 0.7; g.beginPath(); g.arc(gh.x, gh.y, 20, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.globalAlpha = 1;
    }
    // tiny HUD line so the mock is recognisable
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '11px monospace'; g.fillText('MockRenderer (2D)', 8, h - 6);
  }
}
