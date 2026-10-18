// OnSlaught2.26 simulation core. Pure logic: no DOM, no three.js, runs in Node.
// Interface contract: ARCHITECTURE.md section 1. Rules: SPEC.md sections 2 to 6 and 9.
//
// ---------------------------------------------------------------------------------------------
// COMBO MODULE HOOKS (for src/game/combos.js)
//
// game.combos = new Combos(game)   created in the Game constructor; the engine calls
//   combos.tryFire(lead)  -> boolean   before a NORMAL shot of a combo-capable lead whose
//                                       lead.comboReady is true. Return true if a combo fired
//                                       (the normal shot is then skipped).
//   combos.update(dt)                  once per 1/60 s step, after attackers moved, before turrets
//   combos.projectileUpdate?.(p, dt)   per step for projectiles that have p.tag
//   combos.projectileImpact?.(p, x, y, target)  after a tagged projectile's normal impact
//   combos.serialize?.() / deserialize?.(json)  optional, persisted with the game
//
// Turret fields a combo needs (all on the Turret objects in game.state.turrets):
//   comboCapable (damage maxed; Combo-only always), comboReady (capable && cd <= 0 && time >= comboNext),
//   cd (ms until the own fire timer elapses; <= 0 = ready), comboNext (game time before which it can't join),
//   damageMult (effective damage multiplier from modifiers and freak-out), color ('blue'|'green'|'red'|'yellow'|null),
//   comboColor (Combo-only: the chosen colour; weapons: their own colour), stats.{damage,range,rate}.
// To start a recharge: game.startRecharge(turret, ms)  (sets cd = ms and comboNext = time + ms).
//
// Helpers on Game (all safe to call from combos):
//   game.comboPartners(id)            -> [turretId]  weapon/Combo-only turrets within COMBO_RANGE (70), excluding self
//   game.comboPreview(id)             -> read-only combo outlook for the UI (Combos.preview), no rng
//   game.spawnProjectile(kind, props) -> projectile  appended to state.projectiles; see projectiles.js for props
//                                        (modes: straight | homing | orbit | goto; blast, poison, tag, ttl, stay...)
//   game.addEffect(kind, props)       -> effect      {x, y, radius, duration, data}; aged in game ms
//   game.addBeam(kind, x1, y1, x2, y2, ttl = 120)    short-lived line, aged in (real-time-ish) ms
//   game.damageAttacker(att, dmg, sourceTurret, poison = 0) -> boolean (true if it died); handles kills, bounty, events
//   game.blast(x, y, size, damage, { poison, source }) damages every attacker within the blast radius, emits 'blast'
//   game.attackersInRadius(x, y, r)   -> [attacker]  fresh array of living attackers (centre within r)
//   game.roadPoints()                 -> [{x, y, d}] road samples every 4 units (shared array, do not mutate)
//   game.chainLaserDamage(green, consume = false) -> dmg + chain bonus of a Green (consume: contributors reset timers)
//   game.killAttacker(att, { bounty })  kill without damage; attacker.blackholed = true gives $0
//   game.emit(name, payload)          fire a game event (e.g. 'combo' {id, name, turretId})
//   game.rng.next()                   deterministic random in [0, 1)
//   game.path (Path), game.turretMap / game.attackerMap (id -> entity), game.state
// Black-holed attackers (attacker.blackholed = true) are not moved along the road by the engine;
// the combo module moves them (set x/y) and kills them (killAttacker) when the hole closes.
// ---------------------------------------------------------------------------------------------

import { FIELD, WAVES, DIFFICULTIES, MODES, SPEEDS, TARGET_MODES, DIRECTIONAL } from '../data/rules.js';
import { MAPS } from '../data/maps.js';
import {
  TURRETS, SELL_REFUND, MOVE_COST, TURRET_SIZE, COMBO_RANGE, FREAKOUT,
} from '../data/turrets.js';
import { BLAST_RADIUS } from '../data/combos.js';
import { RNG } from './rng.js';
import { Emitter } from './events.js';
import { Path } from './Path.js';
import { SpatialGrid } from './grid.js';
import { Turret, assignSafe } from './Turret.js';
import { emptyMods, addMod, computeStats, nextUpgradeCost, modRangeAt, STATS } from './modifiers.js';
import { createAttacker, moveAttackers, applyPoison } from './Attacker.js';
import { startWave, updateSpawners } from './Waves.js';
import { stepTurret, chainBonus, releaseOrbiter } from './weapons.js';
import { updateProjectiles } from './projectiles.js';
import { Combos } from './combos.js';

export const STEP_MS = 1000 / 60;
// Seed used when opts.seed is missing (src/game must not call Math.random). Callers that want a
// different game each time (src/main.js) pass opts.seed themselves.
const DEFAULT_SEED = 0x2261;
// Save format version and sanity caps for Game.deserialize (far above anything play can reach).
const SAVE_VERSION = 1;
const SAVE_LIMITS = { turrets: 2000, attackers: 5000, projectiles: 20000, beams: 5000, effects: 5000, spawners: 1000 };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MAX_BEAMS = 400;
const MAX_EFFECTS = 300;
const DIRECTIONAL_ORDER = Object.keys(DIRECTIONAL); // D cycle order
const COMBO_COLORS = ['red', 'green', 'blue', 'yellow'];

export class Game {
  constructor(options = {}) {
    const o = { mapId: 'map1', difficulty: 'medium', mode: 'normal', unlockAll: false, ...options };
    const map = MAPS.find((m) => m.id === o.mapId);
    if (!map) throw new Error(`Unknown map: ${o.mapId}`);
    if (!DIFFICULTIES[o.difficulty]) o.difficulty = 'medium';
    if (!MODES[o.mode]) o.mode = 'normal';
    if (o.seed == null) o.seed = DEFAULT_SEED;
    const diff = DIFFICULTIES[o.difficulty];
    const mode = MODES[o.mode];
    this.opts = {
      mapId: o.mapId, difficulty: o.difficulty, mode: o.mode, unlockAll: !!o.unlockAll,
      seed: o.seed, waveInterval: o.waveInterval ?? null,
    };

    this.rng = new RNG(o.seed);
    this.events = new Emitter();
    this.nextId = 1;
    this.acc = 0;
    this.stepCount = 0;
    this._focusId = null;
    this.spawners = [];
    this.hpGrowth = diff.hpGrowth;
    this.waveInterval = o.waveInterval ?? diff.waveInterval;

    this.path = new Path(map.path);
    this.grid = new SpatialGrid(FIELD.width, FIELD.height, 64);
    this.turretMap = new Map();
    this.attackerMap = new Map();
    this._acqBuf = [];
    this._projBuf = [];
    this._blastBuf = [];

    const unlockedAll = this.opts.unlockAll || !!mode.unlockAllTurrets;
    const unlocked = {};
    for (const [k, d] of Object.entries(TURRETS)) if (unlockedAll || d.unlockKills == null) unlocked[k] = true;

    this.state = {
      time: 0, speed: 1, paused: false, over: false,
      difficulty: o.difficulty, mode: o.mode, mapId: o.mapId,
      cash: mode.startCash ?? diff.startCash, lives: diff.lives, kills: 0, spent: 0, wave: 0,
      nextWaveIn: this.waveInterval, score: 0,
      unlocked,
      map: {
        id: map.id, name: map.name, path: this.path.points,
        base: { x: map.base[0], y: map.base[1], w: FIELD.baseSize[0], h: FIELD.baseSize[1] },
        roadWidth: FIELD.roadWidth, length: this.path.length,
      },
      attackers: [], turrets: [], projectiles: [], beams: [], effects: [],
      focusId: null,
    };
    this._nextUnlock = this._computeNextUnlock();
    this.combos = new Combos(this);
  }

  /** Focus-fire target; mirrored to state.focusId for the renderer. */
  get focusId() { return this._focusId; }
  set focusId(v) { this._focusId = v; if (this.state) this.state.focusId = v; }

  // ------------------------------------------------------------------ events
  on(name, fn) { return this.events.on(name, fn); }
  off(name, fn) { this.events.off(name, fn); }
  emit(name, payload) { this.events.emit(name, payload); }

  _fail(reason) {
    this.emit('error', { reason });
    return { ok: false, reason };
  }

  // ------------------------------------------------------------------ time
  /** Advance by real milliseconds; fixed 1/60 s steps scaled by speed (max 8 per call per speed unit). */
  update(realDtMs) {
    const s = this.state;
    if (s.paused || s.over || !(realDtMs > 0)) return;
    this.acc += realDtMs * s.speed;
    const maxSteps = 8 * s.speed;
    let n = 0;
    while (this.acc >= STEP_MS && n < maxSteps && !s.over) {
      this.step(STEP_MS);
      this.acc -= STEP_MS;
      n++;
    }
    if (n >= maxSteps) this.acc = 0; // drop backlog instead of spiralling
  }

  /** Run exactly `steps` simulation steps (ignores speed/pause; for tests and tools). */
  advance(steps) {
    for (let i = 0; i < steps && !this.state.over; i++) this.step(STEP_MS);
  }

  step(dt) {
    const s = this.state;
    s.time += dt;
    this.stepCount++;

    // wave timer
    s.nextWaveIn -= dt;
    if (s.nextWaveIn <= 0) {
      startWave(this);
      s.nextWaveIn += this.waveInterval;
      if (s.nextWaveIn <= 0) s.nextWaveIn = this.waveInterval;
    }
    updateSpawners(this, dt);

    moveAttackers(this, dt);
    if (s.over) { this._cleanup(); return; }
    this.grid.rebuild(s.attackers);

    this.combos.update(dt);
    this._tickFreak();
    const turrets = s.turrets;
    for (let i = 0; i < turrets.length; i++) stepTurret(this, turrets[i], dt);
    updateProjectiles(this, dt);
    this._ageVisuals(dt);
    this._cleanup();
  }

  _cleanup() {
    const list = this.state.attackers;
    let j = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) list[j++] = list[i];
    list.length = j;
  }

  _ageVisuals(dt) {
    const s = this.state;
    const beamDt = dt / s.speed; // beams stay visible for a few rendered frames even at 8x
    const beams = s.beams;
    let j = 0;
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i];
      b.age += beamDt;
      if (b.age < b.ttl) beams[j++] = b;
    }
    beams.length = j;
    const fx = s.effects;
    j = 0;
    for (let i = 0; i < fx.length; i++) {
      const e = fx[i];
      e.age += dt;
      if (e.age < e.duration) fx[j++] = e;
    }
    fx.length = j;
  }

  setSpeed(sp) {
    if (!SPEEDS.includes(sp)) return this._fail('Invalid speed');
    this.state.speed = sp;
    return { ok: true };
  }
  setPaused(p) { this.state.paused = !!p; return { ok: true }; }
  togglePause() { this.state.paused = !this.state.paused; return { ok: true, paused: this.state.paused }; }
  setWaveInterval(ms) {
    if (!Number.isFinite(ms) || ms < 1000) return this._fail('Invalid wave interval');
    this.waveInterval = ms;
    this.opts.waveInterval = ms;
    if (this.state.nextWaveIn > ms) this.state.nextWaveIn = ms;
    return { ok: true };
  }

  // ------------------------------------------------------------------ waves
  sendWave() {
    const s = this.state;
    if (s.over) return this._fail('Game over');
    if (s.paused) return this._fail('Game is paused');
    const bonus = WAVES.earlyBonusPerSec * Math.floor(Math.max(0, s.nextWaveIn) / 1000);
    s.cash += bonus;
    startWave(this);
    s.nextWaveIn = this.waveInterval;
    if (bonus > 0) this.emit('message', { text: `Early wave bonus: $${bonus}` });
    return { ok: true, bonus };
  }

  /** Add an attacker to the field (used by waves; also handy for tests). */
  addAttacker(a) {
    this.state.attackers.push(a);
    this.attackerMap.set(a.id, a);
    return a;
  }
  /** Create and add an attacker of the given wave (hp from the wave formula unless hpOverride). */
  spawnAttacker(wave, hpOverride) {
    return this.addAttacker(createAttacker(this, wave, hpOverride));
  }

  leak(a) {
    const s = this.state;
    a.dead = true;
    this.attackerMap.delete(a.id);
    if (this.focusId === a.id) this.focusId = null;
    s.lives = Math.max(0, s.lives - 1);
    this.emit('leak', { lives: s.lives });
    if (s.lives <= 0 && !s.over) {
      s.over = true;
      this._refreshScore();
      this.emit('gameover', { score: s.score, kills: s.kills, wave: s.wave });
    }
  }

  // ------------------------------------------------------------------ damage, kills, blasts
  /** @returns {boolean} true if the attacker died from this hit */
  damageAttacker(a, dmg, sourceTurret, poison = 0) {
    if (a.dead) return false;
    a.hp -= dmg;
    if (poison > 1) applyPoison(a, poison);
    this.emit('hit', { attackerId: a.id });
    if (a.hp <= 0) {
      if (sourceTurret) sourceTurret.kills = (sourceTurret.kills || 0) + 1;
      this.killAttacker(a);
      return true;
    }
    return false;
  }

  killAttacker(a, opts) {
    if (a.dead) return;
    const s = this.state;
    a.dead = true;
    a.hp = 0;
    this.attackerMap.delete(a.id);
    if (this.focusId === a.id) this.focusId = null;
    s.kills++;
    const bounty = a.blackholed ? 0 : (opts && opts.bounty != null ? opts.bounty : a.bounty);
    s.cash += bounty;
    if (bounty > 0) this.addEffect('cash', { x: a.x, y: a.y, duration: 900, data: { amount: bounty } });
    this._refreshScore();
    this.emit('kill', { attackerId: a.id, x: a.x, y: a.y, bounty });
    if (s.kills >= this._nextUnlock) this._checkUnlocks();
  }

  blast(x, y, size, damage, opts = {}) {
    const radius = typeof size === 'number' ? size : BLAST_RADIUS[size] || 40;
    if (damage > 0) {
      const buf = this._blastBuf;
      const n = this.grid.query(x, y, radius, buf);
      for (let i = 0; i < n; i++) this.damageAttacker(buf[i], damage, opts.source || null, opts.poison || 0);
    }
    this.addEffect('blast', { x, y, radius, duration: 450, data: { size: typeof size === 'number' ? 'custom' : size } });
    this.emit('blast', { size, x, y });
  }

  /** Blast graphics + event without damage (e.g. plain rocket impacts). */
  visualBlast(x, y, size) {
    const radius = (typeof size === 'number' ? size : BLAST_RADIUS[size] || 40) * 0.6;
    this.addEffect('blast', { x, y, radius, duration: 300, data: { size } });
    this.emit('blast', { size, x, y });
  }

  attackersInRadius(x, y, r) {
    const out = [];
    this.grid.query(x, y, r, out);
    return out;
  }

  roadPoints() { return this.path.samples(4); }

  chainLaserDamage(green, consume = false) {
    return green.stats.damage + chainBonus(this, green, new Set([green.id]), consume);
  }

  // ------------------------------------------------------------------ visuals
  spawnProjectile(kind, props = {}) {
    const p = Object.assign(
      { id: this.nextId++, kind, x: 0, y: 0, angle: 0, speed: 0, mode: 'straight', targetId: null, age: 0, dead: false },
      props,
    );
    this.state.projectiles.push(p);
    return p;
  }

  addEffect(kind, props = {}) {
    const e = Object.assign(
      { id: this.nextId++, kind, x: 0, y: 0, radius: 0, age: 0, duration: 500, data: {} },
      props,
    );
    const fx = this.state.effects;
    fx.push(e);
    if (fx.length > MAX_EFFECTS) fx.splice(0, fx.length - MAX_EFFECTS);
    return e;
  }

  addBeam(kind, x1, y1, x2, y2, ttl = 120) {
    const b = { kind, x1, y1, x2, y2, age: 0, ttl };
    const beams = this.state.beams;
    beams.push(b);
    if (beams.length > MAX_BEAMS) beams.splice(0, beams.length - MAX_BEAMS);
    return b;
  }

  startRecharge(turret, ms) {
    turret.cd = ms;
    turret.comboNext = this.state.time + ms;
  }

  // ------------------------------------------------------------------ economy and unlocks
  _refreshScore() {
    const s = this.state;
    s.score = s.kills * s.spent;
  }

  _computeNextUnlock() {
    let next = Infinity;
    for (const [k, d] of Object.entries(TURRETS)) {
      if (!this.state.unlocked[k] && d.unlockKills != null && d.unlockKills < next) next = d.unlockKills;
    }
    return next;
  }

  _checkUnlocks() {
    const s = this.state;
    for (const [k, d] of Object.entries(TURRETS)) {
      if (!s.unlocked[k] && d.unlockKills != null && s.kills >= d.unlockKills) {
        s.unlocked[k] = true;
        this.emit('unlock', { kind: k });
        this.emit('message', { text: `${d.name} unlocked` });
      }
    }
    this._nextUnlock = this._computeNextUnlock();
  }

  // ------------------------------------------------------------------ placement
  _placementProblem(kind, x, y, excludeId = null) {
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) return 'Invalid position';
    const m = this.state.map;
    const half = TURRET_SIZE / 2;
    if (!(x >= half && x <= FIELD.width - half && y >= half && y <= FIELD.height - half)) return 'Outside the field';
    if (this.path.distanceTo(x, y) < m.roadWidth / 2 + 16) return 'Too close to the road';
    const b = m.base;
    const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
    const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
    if (Math.hypot(dx, dy) < 16) return 'Too close to the base';
    const ts = this.state.turrets;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (t.id === excludeId) continue;
      if (Math.hypot(t.x - x, t.y - y) < TURRET_SIZE) return 'Overlaps another turret';
    }
    return null;
  }

  canBuild(kind, x, y) {
    const def = Object.hasOwn(TURRETS, kind) ? TURRETS[kind] : null;
    const s = this.state;
    if (s.over) return { ok: false, reason: 'Game over' };
    if (!def) return { ok: false, reason: 'Unknown turret' };
    if (!s.unlocked[kind]) return { ok: false, reason: 'Locked' };
    const problem = this._placementProblem(kind, x, y);
    if (problem) return { ok: false, reason: problem };
    if (s.cash < def.cost) return { ok: false, reason: 'Not enough cash' };
    return { ok: true };
  }

  build(kind, x, y) {
    const c = this.canBuild(kind, x, y);
    if (!c.ok) return this._fail(c.reason);
    const s = this.state;
    const def = TURRETS[kind];
    const t = new Turret(this.nextId, kind, x, y); // construct first so a failure cannot cost cash
    this.nextId++;
    s.cash -= def.cost;
    s.spent += def.cost;
    s.turrets.push(t);
    this.turretMap.set(t.id, t);
    this._recompute();
    this._refreshScore();
    this.emit('build', { id: t.id, kind });
    return { ok: true, id: t.id };
  }

  turretAt(x, y) {
    let best = null, bd = (TURRET_SIZE / 2) * (TURRET_SIZE / 2);
    const ts = this.state.turrets;
    for (let i = 0; i < ts.length; i++) {
      const d = (ts[i].x - x) ** 2 + (ts[i].y - y) ** 2;
      if (d <= bd) { bd = d; best = ts[i].id; }
    }
    return best;
  }

  // ------------------------------------------------------------------ upgrades, sell, move
  upgradeCost(id, stat) {
    const t = this.turretMap.get(id);
    if (!t || !STATS.includes(stat)) return null;
    return nextUpgradeCost(t.kind, stat, t.levels[stat]);
  }

  upgrade(id, stat, toMax = false) {
    const t = this.turretMap.get(id);
    if (this.state.over) return this._fail('Game over');
    if (!t) return this._fail('No such turret');
    if (!STATS.includes(stat)) return this._fail('Unknown stat');
    const s = this.state;
    let n = 0, reason = 'Fully upgraded';
    for (;;) {
      const cost = nextUpgradeCost(t.kind, stat, t.levels[stat]);
      if (cost == null) { reason = n ? '' : 'Fully upgraded'; break; }
      if (s.cash < cost) { reason = 'Not enough cash'; break; }
      s.cash -= cost;
      s.spent += cost;
      t.cashValue += cost;
      t.levels[stat]++;
      n++;
      if (!toMax) break;
    }
    if (n === 0) return this._fail(reason);
    this._recompute();
    this._refreshScore();
    this.emit('upgrade', { id, stat, levels: n });
    return { ok: true, levels: n };
  }

  sell(id) {
    const t = this.turretMap.get(id);
    if (this.state.over) return this._fail('Game over');
    if (!t) return this._fail('No such turret');
    const s = this.state;
    // circling rockets dive at the weakest attacker within 720
    for (const p of s.projectiles) {
      if (p.orbiting && p.ownerId === id) {
        let best = null;
        for (const a of s.attackers) {
          if (a.dead || Math.hypot(a.x - t.x, a.y - t.y) > 720) continue;
          if (!best || a.hp < best.hp) best = a;
        }
        releaseOrbiter(this, p, best, t.stats.damage);
        p.ownerId = null;
      }
    }
    const refund = Math.floor(t.cashValue * SELL_REFUND);
    s.cash += refund;
    s.turrets.splice(s.turrets.indexOf(t), 1);
    this.turretMap.delete(id);
    for (const o of s.turrets) if (o.joinedTo === id) o.joinedTo = null;
    this._recompute();
    this.emit('sell', { id, refund });
    return { ok: true, refund };
  }

  move(id, x, y) {
    const t = this.turretMap.get(id);
    if (this.state.over) return this._fail('Game over');
    if (!t) return this._fail('No such turret');
    const s = this.state;
    const problem = this._placementProblem(t.kind, x, y, id);
    if (problem) return this._fail(problem);
    if (s.cash < MOVE_COST) return this._fail('Not enough cash');
    s.cash -= MOVE_COST;
    s.spent += MOVE_COST;
    t.x = x; t.y = y;
    t.targetId = null;
    this._recompute();
    this._refreshScore();
    this.emit('move', { id, x, y });
    return { ok: true };
  }

  // ------------------------------------------------------------------ targeting commands
  setTargetMode(id, mode) {
    const t = this.turretMap.get(id);
    if (!t) return this._fail('No such turret');
    if (!TARGET_MODES.includes(mode)) return this._fail('Unknown target mode');
    if (t.category !== 'weapon') return this._fail('This turret does not shoot');
    t.targetMode = mode;
    t.targetId = null;
    return { ok: true, mode };
  }
  cycleTargetMode(id) {
    const t = this.turretMap.get(id);
    if (!t) return this._fail('No such turret');
    return this.setTargetMode(id, TARGET_MODES[(TARGET_MODES.indexOf(t.targetMode) + 1) % TARGET_MODES.length]);
  }
  toggleLock(id) {
    const t = this.turretMap.get(id);
    if (!t || t.category !== 'weapon') return this._fail('No such weapon');
    t.locked = !t.locked;
    return { ok: true, locked: t.locked };
  }
  focusFire(attackerId) {
    if (attackerId == null) { this.focusId = null; return { ok: true }; }
    const a = this.attackerMap.get(attackerId);
    if (!a || a.dead) return this._fail('No such attacker');
    this.focusId = attackerId;
    return { ok: true };
  }
  setDirectional(id, mode, angle) {
    const t = this.turretMap.get(id);
    if (!t || t.category !== 'weapon') return this._fail('No such weapon');
    if (!DIRECTIONAL_ORDER.includes(mode)) return this._fail('Unknown cone');
    t.directional.mode = mode;
    if (angle != null) t.directional.angle = angle;
    t.targetId = null;
    return { ok: true };
  }
  cycleDirectional(id) {
    const t = this.turretMap.get(id);
    if (!t) return this._fail('No such turret');
    const next = DIRECTIONAL_ORDER[(DIRECTIONAL_ORDER.indexOf(t.directional.mode) + 1) % DIRECTIONAL_ORDER.length];
    return this.setDirectional(id, next);
  }
  join(targeterId, turretId) {
    const g = this.turretMap.get(targeterId);
    if (!g || g.kind !== 'targeter') return this._fail('Not a Targeter');
    if (turretId == null || g.joinedTo === turretId) {
      g.joinedTo = null;
    } else {
      const t = this.turretMap.get(turretId);
      if (!t || t.category !== 'weapon') return this._fail('Targeters can only join weapons');
      for (const o of this.state.turrets) if (o.kind === 'targeter' && o.joinedTo === turretId) o.joinedTo = null;
      g.joinedTo = turretId;
    }
    this._recompute();
    return { ok: true, joinedTo: g.joinedTo };
  }
  setComboColor(id, color) {
    const t = this.turretMap.get(id);
    if (!t || t.kind !== 'comboOnly') return this._fail('Not a Combo-only turret');
    if (!COMBO_COLORS.includes(color)) return this._fail('Unknown colour');
    t.comboColor = color;
    return { ok: true };
  }

  comboPartners(id) {
    const t = this.turretMap.get(id);
    if (!t) return [];
    const out = [];
    for (const o of this.state.turrets) {
      if (o.id === id || (o.category !== 'weapon' && o.kind !== 'comboOnly')) continue;
      if (Math.hypot(o.x - t.x, o.y - t.y) <= COMBO_RANGE) out.push(o.id);
    }
    return out;
  }

  /** Read-only combo outlook for the panel (no rng): see Combos.preview. */
  comboPreview(id) {
    const t = this.turretMap.get(id);
    return t && this.combos ? this.combos.preview(t) : null;
  }

  // ------------------------------------------------------------------ derived turret state
  /** Recompute modifiers, effective stats, links, joins, combo capability and freak eligibility. */
  _recompute() {
    const s = this.state;
    const turrets = s.turrets;
    const mods = [];
    for (const t of turrets) {
      if (t.category === 'modifier') { t.modRange = modRangeAt(t.levels.range); mods.push(t); }
    }
    const greens = [];
    for (const t of turrets) {
      const def = TURRETS[t.kind];
      let sum = null;
      if (t.category === 'weapon') {
        sum = emptyMods();
        for (const m of mods) {
          if (Math.hypot(m.x - t.x, m.y - t.y) <= m.modRange) addMod(sum, TURRETS[m.kind].mod);
        }
      }
      // freak-out eligibility
      if (def.freakout) {
        const ok = t.levels.damage >= def.freakout.damage && t.levels.rate >= def.freakout.rate;
        if (ok && t.freak === 'off') { t.freak = 'available'; t.freakAt = s.time + FREAKOUT.first; }
      }
      const ns = computeStats(t, sum);
      const old = t.stats;
      if (t.category === 'weapon' && old.rate > 0 && ns.rate > 0 && old.rate !== ns.rate && t.cd > 0) t.cd *= old.rate / ns.rate;
      old.damage = ns.damage; old.range = ns.range; old.rate = ns.rate;
      t.damageMult = ns.damageMult;
      t.comboCapable = t.kind === 'comboOnly' || (t.category === 'weapon' && t.levels.damage >= t.maxLevels.damage);
      t.targeterId = null;
      if (t.kind === 'green') greens.push(t);
    }
    for (const t of turrets) {
      if (t.kind === 'targeter' && t.joinedTo != null) {
        const j = this.turretMap.get(t.joinedTo);
        if (j) j.targeterId = t.id; else t.joinedTo = null;
      }
    }
    // laser links: every other Green within this Green's effective range
    for (const g of greens) {
      g.links = [];
      for (const o of greens) {
        if (o !== g && Math.hypot(o.x - g.x, o.y - g.y) <= g.stats.range) g.links.push(o.id);
      }
    }
  }

  _tickFreak() {
    const s = this.state;
    const turrets = s.turrets;
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      if (t.freak === 'off' || t.freak === undefined) continue;
      if (s.time < t.freakAt) continue;
      if (t.freak === 'available') {
        t.freak = 'warn';
        t.freakAt = s.time + FREAKOUT.warn;
        this.addEffect('freakWarn', { x: t.x, y: t.y, radius: 30, duration: FREAKOUT.warn, data: { turretId: t.id } });
        this.emit('freakout', { id: t.id, stage: 'warn' });
      } else if (t.freak === 'warn') {
        t.freak = 'on';
        t.freakAt = s.time + FREAKOUT.length;
        this._recompute();
        this.emit('freakout', { id: t.id, stage: 'on' });
      } else if (t.freak === 'on') {
        t.freak = 'available';
        t.freakAt = s.time + FREAKOUT.space / 2 + this.rng.next() * (FREAKOUT.space / 2) - t.levels.rate * 4000;
        this._recompute();
        this.emit('freakout', { id: t.id, stage: 'off' });
      }
    }
  }

  // ------------------------------------------------------------------ persistence
  serialize() {
    const s = this.state;
    return JSON.parse(JSON.stringify({
      version: SAVE_VERSION,
      opts: this.opts,
      rng: this.rng.s,
      nextId: this.nextId,
      acc: this.acc,
      stepCount: this.stepCount,
      focusId: this.focusId,
      spawners: this.spawners,
      waveInterval: this.waveInterval,
      state: {
        time: s.time, speed: s.speed, paused: s.paused, over: s.over,
        cash: s.cash, lives: s.lives, kills: s.kills, spent: s.spent, wave: s.wave,
        nextWaveIn: s.nextWaveIn, score: s.score, unlocked: s.unlocked,
      },
      turrets: s.turrets, attackers: s.attackers, projectiles: s.projectiles,
      beams: s.beams, effects: s.effects,
      combos: this.combos.serialize ? this.combos.serialize() : null,
    }));
  }

  static deserialize(save) {
    const bad = (why) => new Error(`Invalid save: ${why}`);
    if (!isObj(save)) throw bad('not an object');
    if (save.version !== SAVE_VERSION) throw bad(`unsupported version ${save.version}`);
    const d = JSON.parse(JSON.stringify(save));
    if (!isObj(d.state)) throw bad('state missing');
    if (d.opts != null && !isObj(d.opts)) throw bad('opts is not an object');
    for (const [key, max] of Object.entries(SAVE_LIMITS)) {
      if (!Array.isArray(d[key])) throw bad(`${key} is not an array`);
      if (d[key].length > max) throw bad(`too many ${key}`);
    }
    for (const k of ['time', 'cash', 'lives', 'kills', 'spent', 'wave', 'nextWaveIn', 'score']) {
      if (!Number.isFinite(d.state[k])) throw bad(`state.${k} is not a finite number`);
    }
    for (const k of ['nextId', 'acc', 'stepCount', 'waveInterval']) {
      if (!Number.isFinite(d[k])) throw bad(`${k} is not a finite number`);
    }
    if (!Number.isFinite(d.rng)) throw bad('rng is not a finite number');
    for (const o of d.turrets) {
      if (!isObj(o) || typeof o.kind !== 'string' || !Object.hasOwn(TURRETS, o.kind)) throw bad('unknown turret kind');
      if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.id)) throw bad('bad turret');
    }
    for (const key of ['attackers', 'projectiles', 'beams', 'effects']) {
      for (const o of d[key]) if (!isObj(o)) throw bad(`${key} holds a non-object`);
    }
    const g = new Game(d.opts);
    g.rng.s = d.rng;
    g.nextId = d.nextId;
    g.acc = d.acc;
    g.stepCount = d.stepCount;
    g.focusId = d.focusId;
    g.spawners = d.spawners;
    g.waveInterval = d.waveInterval;
    const s = g.state;
    assignSafe(s, d.state);
    for (const o of d.turrets) { const t = Turret.fromJSON(o); s.turrets.push(t); g.turretMap.set(t.id, t); }
    for (const a of d.attackers) { s.attackers.push(a); g.attackerMap.set(a.id, a); }
    s.projectiles.push(...d.projectiles);
    s.beams.push(...d.beams);
    s.effects.push(...d.effects);
    g._nextUnlock = g._computeNextUnlock();
    if (g.combos.deserialize && d.combos != null) g.combos.deserialize(d.combos);
    return g;
  }
}
