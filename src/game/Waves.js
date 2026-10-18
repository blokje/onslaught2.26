// Wave scheduling: wave n has WAVES.size attackers, WAVES.spacing ms apart.
import { WAVES } from '../data/rules.js';
import { createAttacker } from './Attacker.js';

/** Advances the wave counter and queues a spawner for the new wave. */
export function startWave(game) {
  const s = game.state;
  s.wave += 1;
  game.spawners.push({ wave: s.wave, left: WAVES.size, t: 0 });
  game.emit('wave', { wave: s.wave });
}

/** Spawns due attackers from every active spawner and drops spawners that are finished. */
export function updateSpawners(game, dt) {
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
