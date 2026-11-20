// Wave scheduling: wave n has WAVES.size attackers, WAVES.spacing ms apart.
import { WAVES } from '../data/rules.ts';
import { createAttacker } from './Attacker.ts';
import type { Game } from './Game.ts';

/** Most wave records kept in state.history (older ones are dropped); far above any real game. */
export const HISTORY_MAX = 5000;

/** A wave being spawned: `left` attackers to go, next one in `t` ms. */
export interface Spawner { wave: number; left: number; t: number }

/** Advances the wave counter, records a history entry and queues a spawner for the new wave. */
export function startWave(game: Game): void {
  const s = game.state;
  s.wave += 1;
  // end-of-run report data (state.history): the economy just before this wave's attackers appear
  const h = (s.history ||= []);
  h.push({ wave: s.wave, time: s.time, cash: s.cash, lives: s.lives, kills: s.kills, spent: s.spent, damage: s.damageTotal || 0 });
  if (h.length > HISTORY_MAX) h.shift();
  game.spawners.push({ wave: s.wave, left: WAVES.size, t: 0 });
  game.emit('wave', { wave: s.wave });
}

/** Spawns due attackers from every active spawner and drops spawners that are finished. */
export function updateSpawners(game: Game, dt: number): void {
  const sp = game.spawners;
  for (let i = 0; i < sp.length; i++) {
    const w = sp[i];
    w.t -= dt;
    while (w.left > 0 && w.t <= 0) {
      game.addAttacker(createAttacker(game, w.wave));
      w.left--;
      w.t += WAVES.spacing;
    }
  }
  let j = 0;
  for (let i = 0; i < sp.length; i++) if (sp[i].left > 0) sp[j++] = sp[i];
  sp.length = j;
}
