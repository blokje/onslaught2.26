// Attacker creation, movement along the path, poison/slow.
import { WAVES, WEAVE } from '../data/rules.ts';
import { POISON } from '../data/turrets.ts';
import type { Attacker, EnemyKind } from '../types.ts';
import { ENEMIES } from '../data/enemies.ts';
import type { Game } from './Game.ts';

/**
 * HP of an attacker in wave n: baseEnergy * hpGrowth^n up to WAVES.lateWave (original), then the growth per wave
 * drops to 1 + (hpGrowth - 1) * lateGrowthFactor (plain doubles, trillions are fine).
 */
export function waveHp(n: number, growth: number): number {
  const early = Math.min(n, WAVES.lateWave), late = Math.max(0, n - WAVES.lateWave);
  return WAVES.baseEnergy * Math.pow(growth, early) * Math.pow(1 + (growth - 1) * WAVES.lateGrowthFactor, late);
}

/** Bounty of an attacker in wave n: $n up to WAVES.lateWave (original), then n * lateBountyGrowth^(n - lateWave). */
export function waveBounty(n: number): number {
  if (n <= WAVES.lateWave) return n;
  return Math.round(n * Math.pow(WAVES.lateBountyGrowth, n - WAVES.lateWave));
}

/** Builds a new attacker object for the given wave (hp from the wave curve unless hpOverride); does not add it to the game. */
export function createAttacker(game: Game, wave: number, hpOverride?: number | null, kind: EnemyKind = 'normal'): Attacker {
  const def = ENEMIES[kind] || ENEMIES.normal;
  const hp = hpOverride != null ? hpOverride : waveHp(wave, game.hpGrowth) * def.hp * game.mut.hp;
  const a: Attacker = {
    id: game.nextId++,
    type: (wave - 1) % WAVES.types,
    x: 0, y: 0, angle: 0,
    hp, maxHp: hp,
    speed: WAVES.baseSpeed * def.speed * game.mut.speed, baseSpeed: WAVES.baseSpeed * def.speed * game.mut.speed,
    poisoned: false, blackholed: false,
    progress: 0,
    // additions
    wave, bounty: Math.max(1, Math.round(waveBounty(wave) * def.bounty * game.mut.bounty)), dead: false, _seg: 0,
  };
  if (kind !== 'normal') a.kind = kind;
  if (def.shield) a.shield = hp * def.shield;
  // sideways weave: two random phases and wavenumbers, drawn once (laneOffset is a pure function of progress)
  const [w0, w1] = WEAVE.wavelength;
  const rng = game.rng;
  a.weave = [
    rng.next() * Math.PI * 2, rng.next() * Math.PI * 2,
    (Math.PI * 2) / (w0 + rng.next() * (w1 - w0)), (Math.PI * 2) / (w0 + rng.next() * (w1 - w0)),
  ];
  game.path.place(a, 0, laneOffset(a));
  return a;
}

/** Sideways offset from the road centreline at the attacker's current progress (|offset| <= WEAVE.amplitude). */
export function laneOffset(a: Pick<Attacker, 'weave' | 'progress'>): number {
  const w = a.weave;
  if (!w) return 0;
  const p = a.progress;
  return WEAVE.amplitude * (0.6 * Math.sin(p * w[2] + w[0]) + 0.4 * Math.sin(p * w[3] + w[1]));
}

/** Slow an attacker: speed = baseSpeed / strength (floor 5). Strength <= 1 does nothing. */
export function applyPoison(a: Attacker, strength: number): void {
  if (!(strength > 1)) return;
  const slowed = Math.max(POISON.minSpeed, a.baseSpeed / strength);
  if (slowed < a.speed) a.speed = slowed;
  if (a.speed < a.baseSpeed) a.poisoned = true;
}

/** Advance all attackers; leaks are flagged dead and handled via game.leak(). */
export function moveAttackers(game: Game, dt: number): void {
  const dtS = dt / 1000;
  const list = game.state.attackers;
  const path = game.path;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    // [OS3] regenerators heal unless poisoned (slowed)
    const rg = a.kind ? ENEMIES[a.kind].regen : 0;
    if (rg && !a.poisoned && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * rg * dtS);
    if (a.speed < a.baseSpeed) {
      a.speed += POISON.recoverPerSec * dtS;
      if (a.speed >= a.baseSpeed) { a.speed = a.baseSpeed; a.poisoned = false; }
    }
    // black-holed attackers are moved by the combo module, not by the road
    if (a.blackholed) continue;
    a.progress += a.speed * dtS;
    if (a.progress >= path.length) {
      game.leak(a);
      if (game.state.over) return;
      continue;
    }
    path.place(a, a.progress, laneOffset(a));
  }
}
