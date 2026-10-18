// Fake game used to test the renderer without the real simulation (see render-demo.html).
// It produces a state object shaped exactly like ARCHITECTURE.md section 1.1 and animates it:
// attackers walk the chosen map path, every turret kind is placed (plus a combo cluster), turrets
// aim and shoot (projectiles + beams), and every effect kind cycles.

import { MAPS } from '../data/maps.ts';
import { TURRETS, BUILD_ORDER, COMBO_RANGE, MODIFIER_RANGE } from '../data/turrets.ts';
import { FIELD } from '../data/rules.ts';
import { mulberry32 } from './util.ts';
import type { RenderGame } from './context.ts';
import type {
  Attacker, BeamKind, BlastSize, Effect, EffectKind, GameState, KeyColor, LadderStep, MapState, Point, Projectile, ProjectileKind, Stat, TurretState,
} from '../types.ts';

/** Demo turret: a real TurretState plus the demo's own animation fields. */
interface DemoTurret extends TurretState { cool: number; freakOffset: number; spin: number }
/** Demo projectile: flies straight to (tx, ty) and then runs onArrive (the demo has no real projectile simulation). */
interface DemoProjectile extends Projectile { tx: number; ty: number; onArrive?: () => void; life: number; mineBlast?: boolean; stress?: boolean }
interface DemoState extends GameState { turrets: DemoTurret[]; projectiles: DemoProjectile[] }

export interface DemoGame extends RenderGame {
  state: DemoState;
  comboPartners(tid: number): number[];
  turretAt(x: number, y: number): number | null;
  togglePause(): void;
  setSpeed(s: number): void;
  setStress(on: boolean): void;
  addStressProjectiles(): void;
  update(dtMsReal: number): void;
}

const BASE_W = FIELD.baseSize[0], BASE_H = FIELD.baseSize[1];

export function createDemoGame({ mapIndex = 0, seed = 1 }: { mapIndex?: number; seed?: number } = {}): DemoGame {
  const m = MAPS[mapIndex % MAPS.length];
  const rnd = mulberry32(seed);
  const path = m.path;
  // cumulative lengths
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const length = cum[cum.length - 1];
  function pointAt(s: number): { x: number; y: number; angle: number } {
    s = Math.max(0, Math.min(length, s));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const a = path[i - 1], b = path[i], seg = cum[i] - cum[i - 1] || 1, k = (s - cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  function distToPath(x: number, y: number): number {
    let best = 1e9;
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i];
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1;
      let t = ((x - ax) * ex + (y - ay) * ey) / l2; t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (ax + ex * t), y - (ay + ey * t)));
    }
    return best;
  }

  const map: MapState = { id: m.id, name: m.name, path: path.map((p) => [p[0], p[1]]), base: { x: m.base[0], y: m.base[1], w: BASE_W, h: BASE_H }, roadWidth: FIELD.roadWidth, length };
  const state: DemoState = {
    time: 0, speed: 1, paused: false, over: false, difficulty: 'medium', mode: 'sandbox', mapId: m.id,
    cash: 1e7, lives: 10, kills: 0, spent: 0, wave: 1, nextWaveIn: 20000, score: 0,
    unlocked: Object.fromEntries(BUILD_ORDER.map((k) => [k, true as const])),
    focusId: null, map, attackers: [], turrets: [], projectiles: [], beams: [], effects: [],
  };
  let nextId = 1;
  const id = () => nextId++;

  // ---------------------------------------------------------------- turret placement
  const inBase = (x: number, y: number, pad: number): boolean => x > map.base.x - pad && x < map.base.x + map.base.w + pad && y > map.base.y - pad && y < map.base.y + map.base.h + pad;
  const candidates: Point[] = [];
  for (let y = 26; y < FIELD.height - 20; y += 11) for (let x = 26; x < FIELD.width - 20; x += 11) {
    if (distToPath(x, y) > 38 && !inBase(x, y, 26)) candidates.push([x, y]);
  }
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  const placed: DemoTurret[] = [];
  const free = (x: number, y: number, sp: number): boolean => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= sp);

  function makeTurret(kind: string, x: number, y: number, extra: Partial<DemoTurret> & { full?: boolean } = {}): DemoTurret {
    const def = TURRETS[kind];
    const lad: Partial<Record<Stat, LadderStep[]>> = def.ladders || {};
    const isMod = def.category === 'modifier';
    const maxLevels = isMod ? { damage: 0, range: 1, rate: 0 } : { damage: (lad.damage || []).length, range: (lad.range || []).length, rate: (lad.rate || []).length };
    const { full, ...rest } = extra;
    const levels = {
      damage: full ? maxLevels.damage : Math.floor(rnd() * (maxLevels.damage + 1)),
      range: full ? maxLevels.range : Math.floor(rnd() * (maxLevels.range + 1)),
      rate: full ? maxLevels.rate : Math.floor(rnd() * (maxLevels.rate + 1)),
    };
    const base = def.base || { damage: 0, range: 0, rate: 0 };
    const t: DemoTurret = {
      id: id(), kind, x, y, angle: rnd() * Math.PI * 2, levels, maxLevels,
      stats: { damage: base.damage, range: levels.range && lad.range && lad.range[levels.range - 1] ? lad.range[levels.range - 1].value : base.range, rate: base.rate },
      cashValue: def.cost, comboCapable: levels.damage >= maxLevels.damage && maxLevels.damage > 0, comboReady: false,
      freak: 'off', holding: 0, links: [], targetMode: def.target || 'near', locked: false, targetId: null,
      directional: { mode: 'normal', angle: 0 }, joinedTo: null,
      comboColor: kind === 'comboOnly' ? (['red', 'green', 'blue', 'yellow'] as KeyColor[])[Math.floor(rnd() * 4)] : null,
      modRange: isMod ? (levels.range ? MODIFIER_RANGE.upgraded : MODIFIER_RANGE.base) : 0,
      // fields the renderer never reads, present so the object satisfies TurretState
      kills: 0, combosFired: 0, combosAssisted: 0, comboLog: [], category: def.category, color: def.color || null, cd: 0, comboNext: 0, damageMult: 1, freakAt: 0, targeterId: null, ramp: 0, rampTarget: null,
      cool: rnd() * 1000, freakOffset: rnd() * 20, spin: (rnd() - 0.5) * 1.5,
      ...rest,
    };
    placed.push(t); state.turrets.push(t);
    return t;
  }

  // combo cluster: red + 2 blue + green + yellow, all damage-maxed and close together
  let cluster: Point[] | null = null;
  for (const [sx, sy] of candidates) {
    const near = candidates.filter(([x, y]) => { const d = Math.hypot(x - sx, y - sy); return d >= 48 && d <= 62; });
    const picks: Point[] = [[sx, sy]];
    for (const c of near) { if (picks.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) >= 46)) picks.push(c); if (picks.length === 5) break; }
    if (picks.length === 5) { cluster = picks; break; }
  }
  if (cluster) {
    const cl: Point[] = cluster;
    ['red', 'blue', 'blue', 'green', 'yellow'].forEach((k, i) => { makeTurret(k, cl[i][0], cl[i][1], { full: true, comboReady: i < 3 }); });
  }
  // one of every kind
  for (const kind of BUILD_ORDER) {
    const c = candidates.find(([x, y]) => free(x, y, 50));
    if (!c) break;
    makeTurret(kind, c[0], c[1], {});
  }
  // extra basics so there is plenty of shooting
  for (let i = 0; i < 10; i++) {
    const c = candidates.find(([x, y]) => free(x, y, 46));
    if (!c) break;
    makeTurret(['blue', 'green', 'red', 'yellow'][i % 4], c[0], c[1], {});
  }
  // link greens, join a targeter
  const greens = state.turrets.filter((t) => t.kind === 'green');
  for (const g of greens) g.links = greens.filter((o) => o !== g && Math.hypot(o.x - g.x, o.y - g.y) < 120).map((o) => o.id);
  const targeter = state.turrets.find((t) => t.kind === 'targeter'), someBlue = state.turrets.find((t) => t.kind === 'blue');
  if (targeter && someBlue) someBlue.joinedTo = targeter.id;
  const freakers = state.turrets.filter((t) => t.kind === 'blue' || t.kind === 'yellow');
  const reds = state.turrets.filter((t) => t.kind === 'red');
  if (reds[0]) reds[0].holding = 1;
  // a firing cone (D / Shift+D in the game), aimed at the nearest road point
  if (reds[1]) {
    let best: { x: number; y: number; angle: number } | null = null, bd = Infinity;
    for (let s = 0; s < length; s += 10) { const p = pointAt(s); const d = Math.hypot(p.x - reds[1].x, p.y - reds[1].y); if (d < bd) { bd = d; best = p; } }
    if (best) reds[1].directional = { mode: 'medium', angle: Math.atan2(best.y - reds[1].y, best.x - reds[1].x) };
  }

  // ---------------------------------------------------------------- simulation bits
  let spawnTimer = 0, spawnCount = 0, specialTimer = 1500, fxTimer = 0, blastSizeIdx = 0, comboNameTimer = 2500;
  let stress = false, simTime = 0;
  const BLAST_SIZES: BlastSize[] = ['small', 'medium', 'large', 'huge', 'bfg'];
  const timers: Record<string, number> = { poison: 3000, hole: 6000, napalm: 4500, shock: 2000, blast: 600 };

  function addEffect(kind: EffectKind, x: number, y: number, radius: number, duration: number, data?: Record<string, unknown>): Effect {
    const e: Effect = { id: id(), kind, x, y, radius: radius || 0, age: 0, duration, data: data || {} };
    state.effects.push(e); return e;
  }
  function addBeam(kind: BeamKind, x1: number, y1: number, x2: number, y2: number, ttl: number): void { state.beams.push({ kind, x1, y1, x2, y2, age: 0, ttl }); }
  function addProj(kind: ProjectileKind, x: number, y: number, tx: number, ty: number, speed: number, onArrive: () => void, life?: number): DemoProjectile {
    const angle = Math.atan2(ty - y, tx - x);
    const p: DemoProjectile = { id: id(), kind, mode: 'goto', x, y, angle, tx, ty, speed, onArrive, life: life || 0 };
    state.projectiles.push(p);
    return p;
  }
  function randomRoadPoint() { return pointAt(rnd() * length); }
  function roadPointsAround(s0: number, len: number): Point[] { const pts: Point[] = []; for (let s = s0; s < s0 + len; s += 12) { const p = pointAt(s); pts.push([p.x, p.y]); } return pts; }

  function spawnAttacker(progress: number = 0): void {
    const wave = state.wave;
    const hp = 10 * Math.pow(1.125, wave) * (0.5 + rnd());
    const p = pointAt(progress);
    state.attackers.push({ id: id(), type: spawnCount++ % 9, x: p.x, y: p.y, angle: p.angle, hp, maxHp: hp, speed: 60, baseSpeed: 60, poisoned: false, blackholed: false, progress, wave, bounty: 0, dead: false, _seg: 0 });
  }
  function killAttacker(a: Attacker, reward: boolean = true): void {
    state.attackers.splice(state.attackers.indexOf(a), 1);
    state.kills++;
    if (reward && !a.blackholed) addEffect('cash', a.x, a.y, 0, 1100, { amount: Math.round(Math.pow(10, 0.5 + rnd() * 6.5)) });
  }
  function nearestAttacker(x: number, y: number, range: number): Attacker | null {
    let best: Attacker | null = null, bd = range;
    for (const a of state.attackers) { const d = Math.hypot(a.x - x, a.y - y); if (d <= bd) { bd = d; best = a; } }
    return best;
  }
  function hurt(a: Attacker, dmg: number): void { a.hp -= dmg; if (a.hp <= 0 && state.attackers.includes(a)) killAttacker(a); }

  function launchSpecial() {
    const turrets = state.turrets;
    const src = turrets[Math.floor(rnd() * turrets.length)];
    const target: { x: number; y: number; progress?: number } = state.attackers.length ? state.attackers[Math.floor(rnd() * state.attackers.length)] : randomRoadPoint();
    const tx = target.x, ty = target.y;
    const kinds = ['nuke', 'poisonRocket', 'laserRocket', 'napalmRocket', 'tazerRocket', 'bfg', 'clusterBomb', 'mine', 'rocket', 'rail', 'sniper'];
    const kind = kinds[specialIdx++ % kinds.length];
    const burst = (size: BlastSize): Effect => addEffect('blast', tx, ty, 0, 700, { size });
    switch (kind) {
      case 'nuke': addProj('nuke', src.x, src.y, tx, ty, 150, () => burst('huge')); break;
      case 'poisonRocket': addProj('poisonRocket', src.x, src.y, tx, ty, 150, () => { addEffect('poisonCloud', tx, ty, 110, 4200); burst('small'); }); break;
      case 'laserRocket': addProj('laserRocket', src.x, src.y, tx, ty, 120, () => { burst('small'); for (let i = 0; i < 6; i++) { const a = nearestAttacker(tx, ty, 200); if (a) addBeam('laser', tx, ty, a.x, a.y, 200); } }); break;
      case 'napalmRocket': addProj('napalmRocket', src.x, src.y, tx, ty, 150, () => { const s0 = Math.max(0, (target.progress || 0) - 40); addEffect('napalm', tx, ty, 0, 4000, { points: roadPointsAround(s0, 160) }); }); break;
      case 'tazerRocket': addProj('tazerRocket', src.x, src.y, tx, ty, 200, () => { burst('small'); for (let i = 0; i < 4; i++) { const a = nearestAttacker(tx, ty, 150); if (a) addBeam('spark', tx, ty, a.x + (rnd() - 0.5) * 30, a.y + (rnd() - 0.5) * 30, 220); } }); break;
      case 'bfg': addProj('bfg', src.x, src.y, tx, ty, 70, () => { burst('bfg'); }); break;
      case 'clusterBomb': addProj('clusterBomb', src.x, src.y, tx, ty, 300, () => {
        burst('medium');
        for (let i = 0; i < 7; i++) { const ang = (i / 7) * Math.PI * 2, d = 40 + rnd() * 30; addProj('cluster', tx, ty, tx + Math.cos(ang) * d, ty + Math.sin(ang) * d, 120, (() => { const bx = tx + Math.cos(ang) * d, by = ty + Math.sin(ang) * d; return () => addEffect('blast', bx, by, 0, 500, { size: 'small' }); })()); }
      }); break;
      case 'mine': { const p = randomRoadPoint(); const mp = addProj('mine', src.x, src.y, p.x, p.y, 220, () => {}, 3500); mp.mineBlast = true; break; }
      case 'rocket': addProj('rocket', src.x, src.y, tx, ty, 250, () => burst('small')); break;
      case 'rail': addBeam('rail', src.x, src.y, src.x + Math.cos(src.angle) * 300, src.y + Math.sin(src.angle) * 300, 400); break;
      case 'sniper': addBeam('sniper', src.x, src.y, tx, ty, 260); break;
      default: break;
    }
  }
  let specialIdx = 0;

  function turretFire(t: DemoTurret, a: Attacker): void {
    const dx = a.x - t.x, dy = a.y - t.y;
    switch (t.kind) {
      case 'blue': addProj('shell', t.x + Math.cos(t.angle) * 24, t.y + Math.sin(t.angle) * 24, a.x, a.y, 700, () => hurt(a, 6 + 6 * rnd())); break;
      case 'green': addBeam('laser', t.x + Math.cos(t.angle) * 20, t.y + Math.sin(t.angle) * 20, a.x, a.y, 130); hurt(a, 3); for (const lid of t.links.slice(0, 2)) { const o = state.turrets.find((q) => q.id === lid); if (o) addBeam('chain', t.x, t.y, o.x, o.y, 140); } break;
      case 'red': addProj('rocket', t.x + Math.cos(t.angle) * 22, t.y + Math.sin(t.angle) * 22, a.x, a.y, 230, () => { addEffect('blast', a.x, a.y, 0, 450, { size: 'small' }); hurt(a, 15); }); break;
      case 'yellow': addBeam('spark', t.x, t.y, a.x, a.y, 170); a.poisoned = true; hurt(a, 4); break;
      case 'sniper': addBeam('sniper', t.x, t.y, a.x, a.y, 260); hurt(a, 40); break;
      case 'fusion': addBeam('fusion', t.x + Math.cos(t.angle) * 20, t.y + Math.sin(t.angle) * 20, a.x, a.y, 90); hurt(a, 6); break;
      case 'railgun': addBeam('rail', t.x, t.y, t.x + Math.cos(t.angle) * (t.stats.range || 300), t.y + Math.sin(t.angle) * (t.stats.range || 300), 420); hurt(a, 30); break;
      default: break;
    }
    void dx; void dy;
  }

  const WEAPONS = new Set(['blue', 'green', 'red', 'yellow', 'sniper', 'fusion', 'railgun']);
  const game: DemoGame = {
    state,
    comboPartners(tid: number): number[] {
      const t = state.turrets.find((q) => q.id === tid);
      if (!t) return [];
      return state.turrets.filter((o) => o !== t && Math.hypot(o.x - t.x, o.y - t.y) <= COMBO_RANGE).map((o) => o.id);
    },
    turretAt(x: number, y: number): number | null {
      let best: number | null = null, bd = TURRETS.blue ? 22 : 22;
      for (const t of state.turrets) { const d = Math.hypot(t.x - x, t.y - y); if (d <= bd) { bd = d; best = t.id; } }
      return best;
    },
    togglePause(): void { state.paused = !state.paused; },
    setSpeed(s: number): void { state.speed = s; },
    setStress(on: boolean): void {
      if (on === stress) return;
      stress = on;
      if (on) {
        // up to 150 turrets (relaxed spacing), 300 attackers spread on the road, 400 shells/rockets in flight
        for (const [x, y] of candidates) { if (state.turrets.length >= 150) break; if (free(x, y, 30)) makeTurret(['blue', 'green', 'red', 'yellow'][state.turrets.length % 4], x, y, {}); }
        const missing = 300 - state.attackers.length;
        for (let i = 0; i < missing; i++) spawnAttacker(1 + (i / 300) * (length - 4));
      } else {
        state.turrets.length = Math.min(state.turrets.length, 40);
        placed.length = state.turrets.length;
        state.attackers.length = Math.min(state.attackers.length, 30);
        state.projectiles = state.projectiles.filter((p) => !p.stress);
      }
    },
    addStressProjectiles(): void {
      let n = 0;
      for (const p of state.projectiles) if (p.stress) n++;
      for (; n < 400; n++) {
        const t = state.turrets[Math.floor(rnd() * state.turrets.length)];
        const tx = rnd() * FIELD.width, ty = rnd() * FIELD.height;
        const sp = addProj(n % 3 === 0 ? 'rocket' : 'shell', t.x, t.y, tx, ty, 150 + rnd() * 200, () => {});
        sp.stress = true;
      }
    },

    update(dtMsReal: number): void {
      if (state.paused) return;
      const dt = Math.min(dtMsReal, 100) * state.speed;
      state.time += dt; simTime += dt;
      const dts = dt / 1000;

      // spawn attackers (a stream of waves)
      spawnTimer -= dt;
      if (spawnTimer <= 0 && state.attackers.length < (stress ? 300 : 60)) { spawnAttacker(0); spawnTimer = 700; if (spawnCount % 10 === 0) state.wave++; }

      // attackers
      for (const a of state.attackers.slice()) {
        if (a.blackholed) {
          const h = state.effects.find((e) => e.kind === 'blackHole');
          if (!h) { a.blackholed = false; } else {
            const d = Math.hypot(h.x - a.x, h.y - a.y);
            if (d < 6) { killAttacker(a, false); continue; }
            a.x += ((h.x - a.x) / d) * 260 * dts; a.y += ((h.y - a.y) / d) * 260 * dts; continue;
          }
        }
        const sp = a.poisoned ? 22 : 60;
        a.progress += sp * dts;
        if (a.progress >= length - 4) { state.attackers.splice(state.attackers.indexOf(a), 1); state.lives = Math.max(1, state.lives); continue; }
        const p = pointAt(a.progress);
        a.x = p.x; a.y = p.y; a.angle = p.angle;
        if (a.poisoned && rnd() < dts * 0.4) a.poisoned = false;
      }

      // turrets: aim, shoot, freak cycle
      for (const t of state.turrets) {
        const def = TURRETS[t.kind];
        if (def.category === 'modifier' || !WEAPONS.has(t.kind)) { t.angle += t.spin * dts; continue; }
        const range = (t.stats.range || 100) + 20;
        const a = nearestAttacker(t.x, t.y, range);
        t.targetId = a ? a.id : null;
        const want = a ? Math.atan2(a.y - t.y, a.x - t.x) : t.angle + t.spin * dts * 0.6;
        let diff = ((want - t.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        t.angle += Math.max(-1, Math.min(1, diff)) * Math.min(1, dts * 9) * (a ? 1 : 0.1);
        t.cool -= dt;
        if (a && t.cool <= 0 && Math.abs(diff) < 0.35) {
          turretFire(t, a);
          const rate = Math.max(30, (t.stats.rate || 60));
          t.cool = (60000 / rate) * (t.kind === 'sniper' || t.kind === 'railgun' ? 1.5 : 1) * (stress ? 2.5 : 1);
        }
      }
      for (const t of freakers) {
        const cyc = ((simTime / 1000 + t.freakOffset) % 22);
        const prev = t.freak;
        t.freak = cyc < 7 ? 'available' : cyc < 10 ? 'warn' : cyc < 15 ? 'on' : 'off';
        if (t.freak === 'warn' && prev !== 'warn') addEffect('freakWarn', t.x, t.y, 0, 3000, { turretId: t.id });
      }

      // moving projectiles
      for (const p of state.projectiles) {
        if (p.speed > 0) {
          const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dts;
          if (d <= step) { p.x = p.tx; p.y = p.ty; p.dead = true; if (p.onArrive) p.onArrive(); } else { p.x += (dx / d) * step; p.y += (dy / d) * step; p.angle = Math.atan2(dy, dx); }
        } else if (p.life > 0) {
          p.life -= dt;
          if (p.life <= 0) { p.dead = true; if (p.mineBlast) addEffect('blast', p.x, p.y, 0, 600, { size: 'large' }); }
        }
        if (p.speed > 0 && p.kind === 'mine' && p.dead && p.life > 0) { p.dead = false; p.speed = 0; }
      }
      state.projectiles = state.projectiles.filter((p) => !p.dead);
      if (stress) game.addStressProjectiles();

      // beams
      for (const b of state.beams) b.age += dt;
      state.beams = state.beams.filter((b) => b.age < b.ttl);

      // effect generators (cycle through every kind)
      for (const k of Object.keys(timers)) timers[k] -= dt;
      if (timers.blast <= 0) { timers.blast = 900; const p = randomRoadPoint(); addEffect('blast', p.x, p.y, 0, 650, { size: BLAST_SIZES[blastSizeIdx++ % BLAST_SIZES.length] }); }
      if (timers.poison <= 0) { timers.poison = 7000; const p = randomRoadPoint(); addEffect('poisonCloud', p.x, p.y, 110, 4500); for (const a of state.attackers) if (Math.hypot(a.x - p.x, a.y - p.y) < 110) a.poisoned = true; }
      if (timers.hole <= 0) {
        timers.hole = 11000; const p = randomRoadPoint(); addEffect('blackHole', p.x, p.y, 120, 3000);
        for (const a of state.attackers) if (Math.hypot(a.x - p.x, a.y - p.y) < 120) a.blackholed = true;
      }
      if (timers.napalm <= 0) { timers.napalm = 9000; const s0 = rnd() * Math.max(1, length - 200); const p = pointAt(s0 + 80); addEffect('napalm', p.x, p.y, 0, 4000, { points: roadPointsAround(s0, 160) }); }
      if (timers.shock <= 0) { timers.shock = 6000; const t = state.turrets[Math.floor(rnd() * state.turrets.length)]; addEffect('shockwave', t.x, t.y, 200, 900); }
      specialTimer -= dt; if (specialTimer <= 0) { specialTimer = 1100; launchSpecial(); }
      comboNameTimer -= dt;
      if (comboNameTimer <= 0 && cluster) { comboNameTimer = 5000; const names = ['Nuke', 'Poison Gas Rocket', 'Big Cluster Landmine', 'Black Hole', 'BFG']; addEffect('comboName', cluster[0][0], cluster[0][1], 0, 1900, { name: names[Math.floor(rnd() * names.length)] }); }
      fxTimer += dt;

      // effects
      for (const e of state.effects) e.age += dt;
      state.effects = state.effects.filter((e) => e.age < e.duration);
      state.score = state.kills * state.spent;
    },
  };
  return game;
}
