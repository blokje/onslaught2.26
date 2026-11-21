// Wave scheduling: wave n has WAVES.size attackers, WAVES.spacing ms apart.
import { WAVES } from '../data/rules.ts';
import { createAttacker } from './Attacker.ts';
import type { Game } from './Game.ts';
import type { EnemyKind } from '../types.ts';
import { ENEMY_ROTATION } from '../data/enemies.ts';

/** Most wave records kept in state.history (older ones are dropped); far above any real game. */
export const HISTORY_MAX = 5000;

/** A wave being spawned: `left` attackers to go, next one in `t` ms. */
export interface Spawner { wave: number; left: number; t: number; /** [OS3] kinds still to spawn, in order (missing = all normal) */ kinds?: EnemyKind[] }

/**
 * [OS3] The attackers of wave n, in spawn order. Deterministic (no rng): waves 1 to 4 are normal; from wave 5 every other
 * attacker is the wave's special kind (ENEMY_ROTATION), from wave 15 a second special kind joins; a Swarmer slot spawns
 * two; every 10th wave a Boss leads it.
 */
export function waveKinds(n: number): EnemyKind[] {
  const out: EnemyKind[] = [];
  const r = ENEMY_ROTATION, A = r[(n - 5) % r.length], B = r[(n - 3) % r.length];
  for (let i = 0; i < WAVES.size; i++) {
    let k: EnemyKind = 'normal';
    if (n % 10 === 0 && i === 0) k = 'boss';
    else if (n >= 5 && i % 2 === 1) k = n >= 15 && i % 4 === 3 ? B : A;
    out.push(k);
    if (k === 'swarm') out.push('swarm');
  }
  return out;
}

/** Advances the wave counter, records a history entry and queues a spawner for the new wave. */
export function startWave(game: Game): void {
  const s = game.state;
  s.wave += 1;
  // end-of-run report data (state.history): the economy just before this wave's attackers appear
  const h = (s.history ||= []);
  h.push({ wave: s.wave, time: s.time, cash: s.cash, lives: s.lives, kills: s.kills, spent: s.spent, damage: s.damageTotal || 0 });
  if (h.length > HISTORY_MAX) h.shift();
  const kinds = waveKinds(s.wave);
  game.spawners.push({ wave: s.wave, left: kinds.length, t: 0, kinds });
  game.emit('wave', { wave: s.wave });
}

/** Spawns due attackers from every active spawner and drops spawners that are finished. */
export function updateSpawners(game: Game, dt: number): void {
  const sp = game.spawners;
  for (let i = 0; i < sp.length; i++) {
    const w = sp[i];
    w.t -= dt;
    while (w.left > 0 && w.t <= 0) {
      const kind = w.kinds ? w.kinds[w.kinds.length - w.left] : 'normal';
      game.addAttacker(createAttacker(game, w.wave, null, kind));
      w.left--;
      w.t += WAVES.spacing;
    }
  }
  let j = 0;
  for (let i = 0; i < sp.length; i++) if (sp[i].left > 0) sp[j++] = sp[i];
  sp.length = j;
}
