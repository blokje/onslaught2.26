// OnSlaught 3 simulation core. Pure logic: no DOM, no three.js, runs in Node.
// Interface contract: ARCHITECTURE.md section 1. Rules: SPEC.md sections 2 to 6 and 9.
//
// ---------------------------------------------------------------------------------------------
// COMBO MODULE HOOKS (for src/game/combos.ts)
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
//   game.spawnProjectile(kind, props) -> projectile  appended to state.projectiles; see projectiles.ts for props
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

import { FIELD, WAVES, DIFFICULTIES, MODES, SPEEDS, TARGET_MODES, DIRECTIONAL } from '../data/rules.ts';
import { MAPS } from '../data/maps.ts';
import {
  TURRETS, SELL_REFUND, MOVE_COST, TURRET_SIZE, COMBO_RANGE, FREAKOUT,
} from '../data/turrets.ts';
import { BLAST_RADIUS } from '../data/combos.ts';
import { RNG } from './rng.ts';
import { Emitter } from './events.ts';
import { Path } from './Path.ts';
import type { RoadSample } from './Path.ts';
import { SpatialGrid } from './grid.ts';
import { Turret, assignSafe } from './Turret.ts';
import { emptyMods, addMod, computeStats, nextUpgradeCost, modRangeAt, STATS } from './modifiers.ts';
import type { ModSum } from './modifiers.ts';
import { createAttacker, moveAttackers, applyPoison, waveHp, waveBounty, laneOffset } from './Attacker.ts';
import { ENEMIES } from '../data/enemies.ts';
import { startWave, updateSpawners, HISTORY_MAX, waveKinds } from './Waves.ts';
import { stepTurret, chainBonus, releaseOrbiter } from './weapons.ts';
import { updateProjectiles } from './projectiles.ts';
import type {
  Attacker, Beam, BeamKind, BlastSize, ComboPreview, DifficultyId, DirectionalMode, Effect, EffectKind, Fail, GameEventName, GameEvents,
  GameOptions, GameState, KeyColor, ModeId, Projectile, ProjectileKind, Result, Stat, StatValues, TargetMode, TurretState, UpgradePreview, WavePreview, WaveRecord, EnemyKind,
} from '../types.ts';
import type { Spawner } from './Waves.ts';
import { Combos } from './combos.ts';

export const STEP_MS = 1000 / 60;
// Seed used when opts.seed is missing (src/game must not call Math.random). Callers that want a
// different game each time (src/main.ts) pass opts.seed themselves.
const DEFAULT_SEED = 0x2261;
// Save format version and sanity caps for Game.deserialize (far above anything play can reach).
const SAVE_VERSION = 1;
const SAVE_LIMITS = { turrets: 2000, attackers: 5000, projectiles: 20000, beams: 5000, effects: 5000, spawners: 1000 };
const isObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
/** A well-formed command log entry (untrusted saves and replay files). */
export const isCommandEntry = (e: unknown): e is CommandEntry => isObj(e) && Number.isInteger(e.s) && e.s >= 0 && typeof e.c === 'string' && (REPLAY_COMMANDS as readonly string[]).includes(e.c) && Array.isArray(e.a) && e.a.length <= 4;
const MAX_BEAMS = 400;
const MAX_EFFECTS = 300;
const DIRECTIONAL_ORDER = Object.keys(DIRECTIONAL) as DirectionalMode[]; // D cycle order
const COMBO_COLORS: KeyColor[] = ['red', 'green', 'blue', 'yellow'];

export interface GameOpts {
  mapId: string; difficulty: string; mode: string; unlockAll: boolean;
  seed: number; waveInterval: number | null;
}

/** What game.undo() would take back: an English label, the refund, and the parts for a translated label. */
export interface UndoInfo { label: string; refund: number; kind: 'build' | 'upgrade'; turret: string; stat?: Stat; levels?: number }

/** The last build or upgrade, as game.undo() needs it (in memory only). */
interface UndoRecord {
  kind: 'build' | 'upgrade';
  id: number;
  cost: number;            // full refund
  fired: boolean;          // the turret fired since: too late
  label: string;           // for the UI ("build Cannon", "damage upgrade x3 (Laser)")
  stat?: Stat;
  levels?: number;
  before?: { levels: StatValues; cashValue: number; freak: TurretState['freak']; freakAt: number };
}

/** Serialised game (output of Game.serialize, plain JSON). */
export interface SaveData {
  version: number;
  opts: GameOpts;
  rng: number;
  nextId: number;
  acc: number;
  stepCount: number;
  focusId: number | null;
  spawners: Spawner[];
  waveInterval: number;
  state: Pick<GameState, 'time' | 'speed' | 'paused' | 'over' | 'cash' | 'lives' | 'kills' | 'spent' | 'wave' | 'nextWaveIn' | 'score' | 'unlocked' | 'history' | 'damageTotal' | 'undoUsed'>;
  turrets: TurretState[];
  attackers: Attacker[];
  projectiles: Projectile[];
  beams: Beam[];
  effects: Effect[];
  combos: unknown;
  /** Optional (since replays): every successful player command with its step, for replays. */
  commandLog?: CommandEntry[];
  /** Optional (since replays): the options at game start. */
  startOpts?: GameOpts;
}

/** Player commands that change the game; replays log and re-run exactly these (src/game/replay.ts). */
export const REPLAY_COMMANDS = [
  'build', 'upgrade', 'sell', 'move', 'setTargetMode', 'cycleTargetMode', 'toggleLock', 'focusFire',
  'setDirectional', 'cycleDirectional', 'join', 'setComboColor', 'sendWave', 'setWaveInterval', 'undo',
] as const;
export type ReplayCommand = typeof REPLAY_COMMANDS[number];
/** One logged command: the step it ran before (stepCount at that moment), its name and its arguments. */
export interface CommandEntry { s: number; c: ReplayCommand; a: unknown[] }
/** Most commands a save keeps for its replay (a long game uses a few thousand). */
export const COMMAND_LOG_MAX = 50000;

export class Game {
  opts: GameOpts;
  rng: RNG;
  events: Emitter;
  nextId: number;
  acc: number;
  stepCount: number;
  _focusId: number | null;
  spawners: Spawner[];
  hpGrowth: number;
  waveInterval: number;
  path: Path;
  grid: SpatialGrid;
  turretMap: Map<number, Turret>;
  attackerMap: Map<number, Attacker>;
  _acqBuf: Attacker[];
  _projBuf: Attacker[];
  _blastBuf: Attacker[];
  state: GameState;
  _nextUnlock: number;
  combos: Combos;
  /** Successful player commands with their step (saved), see REPLAY_COMMANDS. */
  commandLog: CommandEntry[] = [];
  /** The options this game started with (replays); `opts` can change later (setWaveInterval). */
  startOpts: GameOpts;
  /** update() never steps past this stepCount (replay playback stops at the replay's end). Not saved. */
  stepLimit = Infinity;
  /** Nesting depth of running replay commands (only depth 0 is logged). */
  _cmdDepth = 0;
  /** Called at the start of every step with stepCount (replay playback), or null. Not saved. */
  stepHook: ((step: number) => void) | null = null;
  /** Last build/upgrade that undo() can take back (not saved: a restored game starts without one). */
  _undo: UndoRecord | null = null;

  constructor(options: GameOptions = {}) {
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
    this.startOpts = { ...this.opts }; // replays start from these (setWaveInterval later changes opts)

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
    const unlocked: Record<string, true> = {};
    for (const [k, d] of Object.entries(TURRETS)) if (unlockedAll || d.unlockKills == null) unlocked[k] = true;

    this.state = {
      time: 0, speed: 1, paused: false, over: false,
      difficulty: o.difficulty as DifficultyId, mode: o.mode as ModeId, mapId: o.mapId, // validated against DIFFICULTIES / MODES above
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
      history: [], damageTotal: 0, undoUsed: false,
    };
    this._nextUnlock = this._computeNextUnlock();
    this.combos = new Combos(this);
    // undo ends once the turret fires (normal shots and combos; chain and holding call markFired directly)
    this.on('shot', (p) => this.markFired(p.turretId));
    this.on('combo', (p) => { this.markFired(p.turretId); for (const id of p.partnerIds) this.markFired(id); });
    this._wrapCommands();
  }

  /**
   * Log every successful replay command with the current stepCount (commandLog). Wrapping the instance methods keeps
   * the commands themselves untouched; a command run by a replay is logged the same way, so logs compare equal.
   */
  _wrapCommands(): void {
    const self = this as unknown as Record<string, (...a: unknown[]) => unknown>; // method table, looked up by name
    for (const name of REPLAY_COMMANDS) {
      const orig = self[name];
      self[name] = (...args: unknown[]): unknown => {
        // only the outermost command is logged (cycleTargetMode calls setTargetMode; replaying both would cycle twice)
        this._cmdDepth++;
        let r: { ok?: boolean } | null;
        try { r = orig.apply(this, args) as { ok?: boolean } | null; } finally { this._cmdDepth--; }
        if (this._cmdDepth === 0 && r && r.ok && this.commandLog.length < COMMAND_LOG_MAX) this.commandLog.push({ s: this.stepCount, c: name, a: JSON.parse(JSON.stringify(args)) });
        return r;
      };
    }
  }

  /** Focus-fire target; mirrored to state.focusId for the renderer. */
  get focusId(): number | null { return this._focusId; }
  set focusId(v: number | null) { this._focusId = v; if (this.state) this.state.focusId = v; }

  // ------------------------------------------------------------------ events
  on<K extends GameEventName>(name: K, fn: (p: GameEvents[K]) => void): () => void { return this.events.on(name, fn); }
  off<K extends GameEventName>(name: K, fn: (p: GameEvents[K]) => void): void { this.events.off(name, fn); }
  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void { this.events.emit(name, payload); }

  _fail(reason: string): Fail {
    this.emit('error', { reason });
    return { ok: false, reason };
  }

  // ------------------------------------------------------------------ time
  /** Advance by real milliseconds; fixed 1/60 s steps scaled by speed (max 8 per call per speed unit). */
  update(realDtMs: number): void {
    const s = this.state;
    if (s.paused || s.over || !(realDtMs > 0)) return;
    this.acc += realDtMs * s.speed;
    const maxSteps = 8 * s.speed;
    let n = 0;
    while (this.acc >= STEP_MS && n < maxSteps && !s.over && this.stepCount < this.stepLimit) {
      this.step(STEP_MS);
      this.acc -= STEP_MS;
      n++;
    }
    if (n >= maxSteps) this.acc = 0; // drop backlog instead of spiralling
  }

  /** Run exactly `steps` simulation steps (ignores speed/pause; for tests and tools). */
  advance(steps: number): void {
    for (let i = 0; i < steps && !this.state.over; i++) this.step(STEP_MS);
  }

  step(dt: number): void {
    if (this.stepHook) this.stepHook(this.stepCount); // replays run the commands logged for this step first
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

  _cleanup(): void {
    const list = this.state.attackers;
    let j = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) list[j++] = list[i];
    list.length = j;
  }

  _ageVisuals(dt: number): void {
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

  setSpeed(sp: number): Result {
    if (!SPEEDS.includes(sp)) return this._fail('Invalid speed');
    this.state.speed = sp;
    return { ok: true };
  }
  setPaused(p: boolean): Result { this.state.paused = !!p; return { ok: true }; }
  togglePause(): Result<{ paused: boolean }> { this.state.paused = !this.state.paused; return { ok: true, paused: this.state.paused }; }
  setWaveInterval(ms: number): Result {
    if (!Number.isFinite(ms) || ms < 1000) return this._fail('Invalid wave interval');
    this.waveInterval = ms;
    this.opts.waveInterval = ms;
    if (this.state.nextWaveIn > ms) this.state.nextWaveIn = ms;
    return { ok: true };
  }

  // ------------------------------------------------------------------ waves
  sendWave(): Result<{ bonus: number }> {
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

  /** Read-only: true while a wave is still spawning or any attacker is alive (auto-send waits for false). */
  waveActive(): boolean {
    if (this.spawners.length > 0) return true;
    for (const a of this.state.attackers) if (!a.dead) return true;
    return false;
  }

  /** Read-only outlook for wave n (default: the next wave). Same formulas as createAttacker, no rng. */
  wavePreview(n?: number): WavePreview {
    const w = Math.max(1, Math.floor(n ?? this.state.wave + 1));
    const kinds: Partial<Record<EnemyKind, number>> = {};
    const list = waveKinds(w);
    for (const k of list) kinds[k] = (kinds[k] || 0) + 1;
    return { wave: w, type: (w - 1) % WAVES.types, hp: waveHp(w, this.hpGrowth), bounty: waveBounty(w), count: list.length, kinds };
  }

  /** Add an attacker to the field (used by waves; also handy for tests). */
  addAttacker(a: Attacker): Attacker {
    this.state.attackers.push(a);
    this.attackerMap.set(a.id, a);
    return a;
  }
  /** Create and add an attacker of the given wave (hp from the wave formula unless hpOverride). */
  spawnAttacker(wave: number, hpOverride?: number | null): Attacker {
    return this.addAttacker(createAttacker(this, wave, hpOverride));
  }

  leak(a: Attacker): void {
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
  /** Returns true if the attacker died from this hit. */
  damageAttacker(a: Attacker, dmg: number, sourceTurret: TurretState | null | undefined, poison = 0): boolean {
    if (a.dead) return false;
    if (a.kind && dmg > 0) dmg = this._defend(a, dmg, sourceTurret);
    // effective damage for the turret's stats: overkill is not counted
    if (sourceTurret && dmg > 0) {
      const eff = Math.min(dmg, Math.max(0, a.hp));
      sourceTurret.damageDealt = (sourceTurret.damageDealt || 0) + eff;
      this.state.damageTotal = (this.state.damageTotal || 0) + eff;
    }
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

  /**
   * [OS3] Damage after the attacker's weakness, shield and armour (ENEMIES): weakness multiplies first; a shield takes the
   * hit (with its own multiplier) until it is gone, the rest goes on; armour then takes a fixed chunk off, keeping 25%.
   */
  _defend(a: Attacker, dmg: number, src: TurretState | null | undefined): number {
    const def = ENEMIES[a.kind!];
    const weapon = src ? TURRETS[src.kind]?.weapon || '' : '';
    if (def.weakTo && def.weakTo[weapon]) dmg *= def.weakTo[weapon];
    if (a.shield && a.shield > 0) {
      const k = (def.shieldVs && def.shieldVs[weapon]) || 1;
      const used = Math.min(a.shield, dmg * k);
      a.shield -= used;
      dmg -= used / k;
      if (dmg <= 0) return 0;
    }
    if (def.armor) dmg = Math.max(dmg * 0.25, dmg - def.armor * a.maxHp);
    return dmg;
  }

  killAttacker(a: Attacker, opts?: { bounty?: number }): void {
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
    // [OS3] splitters break into smaller attackers at the same place (not when swallowed by a black hole)
    const sd = a.kind ? ENEMIES[a.kind] : null;
    if (sd && sd.split && sd.splitInto && !a.blackholed) {
      for (let i = 0; i < sd.split; i++) {
        const c = createAttacker(this, a.wave, a.maxHp * (sd.splitHp || 0.3), sd.splitInto);
        c.bounty = Math.max(1, Math.round(a.bounty * (sd.splitBounty || 0.3)));
        c.progress = Math.max(0, a.progress - 6 * i);
        this.path.place(c, c.progress, laneOffset(c));
        this.addAttacker(c);
      }
    }
    if (s.kills >= this._nextUnlock) this._checkUnlocks();
  }

  blast(x: number, y: number, size: BlastSize | number, damage: number, opts: { poison?: number; source?: TurretState | null } = {}): void {
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
  visualBlast(x: number, y: number, size: BlastSize | number): void {
    const radius = (typeof size === 'number' ? size : BLAST_RADIUS[size] || 40) * 0.6;
    this.addEffect('blast', { x, y, radius, duration: 300, data: { size } });
    this.emit('blast', { size, x, y });
  }

  attackersInRadius(x: number, y: number, r: number): Attacker[] {
    const out: Attacker[] = [];
    this.grid.query(x, y, r, out);
    return out;
  }

  roadPoints(): RoadSample[] { return this.path.samples(4); }

  chainLaserDamage(green: TurretState, consume = false): number {
    return green.stats.damage + chainBonus(this, green, new Set([green.id]), consume);
  }

  // ------------------------------------------------------------------ visuals
  spawnProjectile(kind: ProjectileKind, props: Partial<Projectile> = {}): Projectile {
    const p = Object.assign(
      { id: this.nextId++, kind, x: 0, y: 0, angle: 0, speed: 0, mode: 'straight' as const, targetId: null, age: 0, dead: false },
      props,
    );
    this.state.projectiles.push(p);
    return p;
  }

  addEffect(kind: EffectKind, props: Partial<Effect> = {}): Effect {
    const e: Effect = Object.assign(
      { id: this.nextId++, kind, x: 0, y: 0, radius: 0, age: 0, duration: 500, data: {} },
      props,
    );
    const fx = this.state.effects;
    fx.push(e);
    if (fx.length > MAX_EFFECTS) fx.splice(0, fx.length - MAX_EFFECTS);
    return e;
  }

  addBeam(kind: BeamKind, x1: number, y1: number, x2: number, y2: number, ttl = 120): Beam {
    const b: Beam = { kind, x1, y1, x2, y2, age: 0, ttl };
    const beams = this.state.beams;
    beams.push(b);
    if (beams.length > MAX_BEAMS) beams.splice(0, beams.length - MAX_BEAMS);
    return b;
  }

  startRecharge(turret: TurretState, ms: number): void {
    turret.cd = ms;
    turret.comboNext = this.state.time + ms;
  }

  // ------------------------------------------------------------------ economy and unlocks
  _refreshScore(): void {
    const s = this.state;
    s.score = s.kills * s.spent;
  }

  _computeNextUnlock(): number {
    let next = Infinity;
    for (const [k, d] of Object.entries(TURRETS)) {
      if (!this.state.unlocked[k] && d.unlockKills != null && d.unlockKills < next) next = d.unlockKills;
    }
    return next;
  }

  _checkUnlocks(): void {
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
  _placementProblem(_kind: string, x: number, y: number, excludeId: number | null = null): string | null {
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

  canBuild(kind: string, x: number, y: number): Result {
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

  build(kind: string, x: number, y: number): Result<{ id: number }> {
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
    this._undo = { kind: 'build', id: t.id, cost: def.cost, fired: false, label: 'build ' + def.name };
    this._recompute();
    this._refreshScore();
    this.emit('build', { id: t.id, kind });
    return { ok: true, id: t.id };
  }

  // ------------------------------------------------------------------ undo (optional relaxed rule, SPEC.md section 9)
  /** A turret fired (shot, chain contribution, holding rocket, combo): it can no longer be undone. */
  markFired(id: number): void { if (this._undo && this._undo.id === id) this._undo.fired = true; }

  /** What `undo()` would take back, or null. Read-only. */
  undoInfo(): UndoInfo | null {
    const u = this._undo;
    const t = u ? this.turretMap.get(u.id) : undefined;
    if (!u || !t || u.fired || this.state.over) return null;
    return { label: u.label, refund: u.cost, kind: u.kind, turret: t.kind, stat: u.stat, levels: u.levels };
  }

  /**
   * Take back the last build or upgrade with a full refund, while that turret has not fired since (any later build,
   * upgrade, sell or move ends the chance). `spent` and the score go back too, and `state.undoUsed` is set for good.
   */
  undo(): Result<{ refund: number }> {
    const u = this._undo;
    const t = u ? this.turretMap.get(u.id) : undefined;
    if (!u || !t || this.state.over) return this._fail('Nothing to undo');
    if (u.fired) return this._fail('It has fired since, too late to undo');
    const s = this.state;
    this._undo = null;
    s.cash += u.cost;
    s.spent -= u.cost;
    s.undoUsed = true;
    if (u.kind === 'build') {
      s.turrets.splice(s.turrets.indexOf(t), 1);
      this.turretMap.delete(t.id);
      for (const o of s.turrets) if (o.joinedTo === t.id) o.joinedTo = null;
    } else {
      const b = u.before!;
      t.levels = { ...b.levels };
      t.cashValue = b.cashValue;
      t.freak = b.freak;
      t.freakAt = b.freakAt;
    }
    this._recompute();
    this._refreshScore();
    this.emit('undo', { id: t.id, kind: u.kind, refund: u.cost });
    return { ok: true, refund: u.cost };
  }

  turretAt(x: number, y: number): number | null {
    let best: number | null = null, bd = (TURRET_SIZE / 2) * (TURRET_SIZE / 2);
    const ts = this.state.turrets;
    for (let i = 0; i < ts.length; i++) {
      const d = (ts[i].x - x) ** 2 + (ts[i].y - y) ** 2;
      if (d <= bd) { bd = d; best = ts[i].id; }
    }
    return best;
  }

  // ------------------------------------------------------------------ upgrades, sell, move
  upgradeCost(id: number, stat: Stat): number | null {
    const t = this.turretMap.get(id);
    if (!t || !STATS.includes(stat)) return null;
    return nextUpgradeCost(t.kind, stat, t.levels[stat]);
  }

  /**
   * Read-only: effective stats now and after one more level of `stat` (modifiers and freak-out included, as they
   * are right now). Null when the turret is missing or the stat is maxed / not upgradable. No rng, no state change.
   */
  upgradePreview(id: number, stat: Stat): UpgradePreview | null {
    const t = this.turretMap.get(id);
    if (!t || !STATS.includes(stat)) return null;
    const cost = nextUpgradeCost(t.kind, stat, t.levels[stat]);
    if (cost == null) return null;
    const mods = this.state.turrets.filter((m) => m.category === 'modifier');
    const sum = this._modSumFor(t, mods);
    const pick = (e: StatValues): StatValues => ({ damage: e.damage, range: e.range, rate: e.rate });
    const from = pick(computeStats(t, sum));
    const to = pick(computeStats({ kind: t.kind, freak: t.freak, levels: { ...t.levels, [stat]: t.levels[stat] + 1 } }, sum));
    return { stat, cost, from, to };
  }

  upgrade(id: number, stat: Stat, toMax = false): Result<{ levels: number }> {
    const t = this.turretMap.get(id);
    if (this.state.over) return this._fail('Game over');
    if (!t) return this._fail('No such turret');
    if (!STATS.includes(stat)) return this._fail('Unknown stat');
    const s = this.state;
    const before = { levels: { ...t.levels }, cashValue: t.cashValue, freak: t.freak, freakAt: t.freakAt };
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
    this._undo = {
      kind: 'upgrade', id, cost: t.cashValue - before.cashValue, fired: false, stat, levels: n, before,
      label: `${stat} upgrade${n > 1 ? ' x' + n : ''} (${TURRETS[t.kind].name})`,
    };
    this._recompute();
    this._refreshScore();
    this.emit('upgrade', { id, stat, levels: n });
    return { ok: true, levels: n };
  }

  sell(id: number): Result<{ refund: number }> {
    const t = this.turretMap.get(id);
    if (this.state.over) return this._fail('Game over');
    if (!t) return this._fail('No such turret');
    const s = this.state;
    // circling rockets dive at the weakest attacker within 720
    for (const p of s.projectiles) {
      if (p.orbiting && p.ownerId === id) {
        let best: Attacker | null = null;
        for (const a of s.attackers) {
          if (a.dead || Math.hypot(a.x - t.x, a.y - t.y) > 720) continue;
          if (!best || a.hp < best.hp) best = a;
        }
        releaseOrbiter(this, p, best, t.stats.damage);
        p.ownerId = null;
      }
    }
    const refund = Math.floor(t.cashValue * SELL_REFUND);
    this._undo = null;
    s.cash += refund;
    s.turrets.splice(s.turrets.indexOf(t), 1);
    this.turretMap.delete(id);
    for (const o of s.turrets) if (o.joinedTo === id) o.joinedTo = null;
    this._recompute();
    this.emit('sell', { id, refund });
    return { ok: true, refund };
  }

  move(id: number, x: number, y: number): Result {
    const t = this.turretMap.get(id);
    if (this.state.over) return this._fail('Game over');
    if (!t) return this._fail('No such turret');
    const s = this.state;
    const problem = this._placementProblem(t.kind, x, y, id);
    if (problem) return this._fail(problem);
    if (s.cash < MOVE_COST) return this._fail('Not enough cash');
    s.cash -= MOVE_COST;
    s.spent += MOVE_COST;
    this._undo = null;
    t.x = x; t.y = y;
    t.targetId = null;
    this._recompute();
    this._refreshScore();
    this.emit('move', { id, x, y });
    return { ok: true };
  }

  // ------------------------------------------------------------------ targeting commands
  setTargetMode(id: number, mode: TargetMode): Result<{ mode: TargetMode }> {
    const t = this.turretMap.get(id);
    if (!t) return this._fail('No such turret');
    if (!TARGET_MODES.includes(mode)) return this._fail('Unknown target mode');
    if (t.category !== 'weapon') return this._fail('This turret does not shoot');
    t.targetMode = mode;
    t.targetId = null;
    return { ok: true, mode };
  }
  cycleTargetMode(id: number): Result<{ mode: TargetMode }> {
    const t = this.turretMap.get(id);
    if (!t) return this._fail('No such turret');
    return this.setTargetMode(id, TARGET_MODES[(TARGET_MODES.indexOf(t.targetMode) + 1) % TARGET_MODES.length]);
  }
  toggleLock(id: number): Result<{ locked: boolean }> {
    const t = this.turretMap.get(id);
    if (!t || t.category !== 'weapon') return this._fail('No such weapon');
    t.locked = !t.locked;
    return { ok: true, locked: t.locked };
  }
  focusFire(attackerId: number | null | undefined): Result {
    if (attackerId == null) { this.focusId = null; return { ok: true }; }
    const a = this.attackerMap.get(attackerId);
    if (!a || a.dead) return this._fail('No such attacker');
    this.focusId = attackerId;
    return { ok: true };
  }
  setDirectional(id: number, mode: DirectionalMode, angle?: number | null): Result {
    const t = this.turretMap.get(id);
    if (!t || t.category !== 'weapon') return this._fail('No such weapon');
    if (!DIRECTIONAL_ORDER.includes(mode)) return this._fail('Unknown cone');
    t.directional.mode = mode;
    if (angle != null) t.directional.angle = angle;
    t.targetId = null;
    return { ok: true };
  }
  cycleDirectional(id: number): Result {
    const t = this.turretMap.get(id);
    if (!t) return this._fail('No such turret');
    const next = DIRECTIONAL_ORDER[(DIRECTIONAL_ORDER.indexOf(t.directional.mode) + 1) % DIRECTIONAL_ORDER.length];
    return this.setDirectional(id, next);
  }
  join(targeterId: number, turretId?: number | null): Result<{ joinedTo: number | null }> {
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
  setComboColor(id: number, color: KeyColor): Result {
    const t = this.turretMap.get(id);
    if (!t || t.kind !== 'comboOnly') return this._fail('Not a Combo-only turret');
    if (!COMBO_COLORS.includes(color)) return this._fail('Unknown colour');
    t.comboColor = color;
    return { ok: true };
  }

  comboPartners(id: number): number[] {
    const t = this.turretMap.get(id);
    if (!t) return [];
    const out: number[] = [];
    for (const o of this.state.turrets) {
      if (o.id === id || (o.category !== 'weapon' && o.kind !== 'comboOnly')) continue;
      if (Math.hypot(o.x - t.x, o.y - t.y) <= COMBO_RANGE) out.push(o.id);
    }
    return out;
  }

  /** Read-only combo outlook for the panel (no rng): see Combos.preview. */
  comboPreview(id: number): ComboPreview | null {
    const t = this.turretMap.get(id);
    return t && this.combos ? this.combos.preview(t) : null;
  }

  // ------------------------------------------------------------------ derived turret state
  /** Summed bonuses of the modifiers whose aura reaches a weapon (null for modifiers and support turrets). */
  _modSumFor(t: TurretState, mods: TurretState[]): ModSum | null {
    if (t.category !== 'weapon') return null;
    const sum = emptyMods();
    for (const m of mods) {
      if (Math.hypot(m.x - t.x, m.y - t.y) <= m.modRange) addMod(sum, TURRETS[m.kind].mod!);
    }
    return sum;
  }

  /** Recompute modifiers, effective stats, links, joins, combo capability and freak eligibility. */
  _recompute(): void {
    const s = this.state;
    const turrets = s.turrets;
    const mods: TurretState[] = [];
    for (const t of turrets) {
      if (t.category === 'modifier') { t.modRange = modRangeAt(t.levels.range); mods.push(t); }
    }
    const greens: TurretState[] = [];
    for (const t of turrets) {
      const def = TURRETS[t.kind];
      const sum = this._modSumFor(t, mods);
      // freak-out eligibility
      if (def.freakout) {
        const ok = t.levels.damage >= def.freakout.damage && t.levels.rate >= def.freakout.rate;
        if (ok && t.freak === 'off') { t.freak = 'available'; t.freakAt = s.time + FREAKOUT.first; }
      }
      const ns = computeStats(t, sum);
      const old = t.stats;
      // rescale a running shot interval, but never a combo recharge (a fixed time, cd and comboNext run together)
      if (t.category === 'weapon' && old.rate > 0 && ns.rate > 0 && old.rate !== ns.rate && t.cd > 0 && s.time >= t.comboNext) t.cd *= old.rate / ns.rate;
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

  _tickFreak(): void {
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
  serialize(): SaveData {
    const s = this.state;
    return JSON.parse(JSON.stringify({
      version: SAVE_VERSION,
      opts: this.opts,
      startOpts: this.startOpts,
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
        history: s.history, damageTotal: s.damageTotal, undoUsed: s.undoUsed,
      },
      turrets: s.turrets, attackers: s.attackers, projectiles: s.projectiles,
      beams: s.beams, effects: s.effects,
      combos: this.combos.serialize ? this.combos.serialize() : null,
      commandLog: this.commandLog,
    }));
  }

  static deserialize(save: unknown): Game {
    const bad = (why: string): Error => new Error(`Invalid save: ${why}`);
    if (!isObj(save)) throw bad('not an object');
    if (save.version !== SAVE_VERSION) throw bad(`unsupported version ${save.version}`);
    // `d` is untrusted JSON: it is validated field by field below before use, so it stays `any` until then.
    const d: any = JSON.parse(JSON.stringify(save));
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
    g.startOpts = { ...g.opts };
    if (isObj(d.startOpts)) { try { g.startOpts = { ...new Game(d.startOpts).opts }; } catch (e) { /* unknown map etc.: keep opts */ } } // validated by the constructor
    g.rng.s = d.rng;
    g.nextId = d.nextId;
    g.acc = d.acc;
    g.stepCount = d.stepCount;
    g.focusId = d.focusId;
    g.spawners = d.spawners;
    g.waveInterval = d.waveInterval;
    const s = g.state;
    assignSafe(s, d.state);
    // optional fields added after save version 1: dropped (not rejected) when missing or malformed
    const keys: (keyof WaveRecord)[] = ['wave', 'time', 'cash', 'lives', 'kills', 'spent', 'damage'];
    s.history = Array.isArray(s.history) && s.history.length <= HISTORY_MAX
      && s.history.every((r) => isObj(r) && keys.every((k) => Number.isFinite(r[k])))
      ? s.history.map((r) => ({ wave: r.wave, time: r.time, cash: r.cash, lives: r.lives, kills: r.kills, spent: r.spent, damage: r.damage }))
      : [];
    if (!Number.isFinite(s.damageTotal)) s.damageTotal = 0;
    s.undoUsed = s.undoUsed === true;
    for (const o of d.turrets) { const t = Turret.fromJSON(o); s.turrets.push(t); g.turretMap.set(t.id, t); }
    for (const a of d.attackers) {
      // [OS3] an unknown enemy kind (edited save) becomes a normal attacker; a shield must be a finite number
      if (a.kind != null && !Object.hasOwn(ENEMIES, a.kind)) delete a.kind;
      if (a.shield != null && !Number.isFinite(a.shield)) delete a.shield;
      s.attackers.push(a); g.attackerMap.set(a.id, a);
    }
    for (const sp of g.spawners) if (sp.kinds != null && !(Array.isArray(sp.kinds) && sp.kinds.every((k: unknown) => typeof k === 'string' && Object.hasOwn(ENEMIES, k)))) delete sp.kinds;
    s.projectiles.push(...d.projectiles);
    s.beams.push(...d.beams);
    s.effects.push(...d.effects);
    g._nextUnlock = g._computeNextUnlock();
    if (g.combos.deserialize && d.combos != null) g.combos.deserialize(d.combos);
    // optional since replays: an old save simply has no log (its replay starts empty); a broken one is dropped
    g.commandLog = Array.isArray(d.commandLog) && d.commandLog.length <= COMMAND_LOG_MAX && d.commandLog.every(isCommandEntry) ? d.commandLog : [];
    return g;
  }
}
