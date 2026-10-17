// Wave scheduling: wave n has WAVES.size attackers, WAVES.spacing ms apart.
import { WAVES } from '../data/rules.js';
import { createAttacker } from './Attacker.js';

export function startWave(game) {
  const s = game.state;
  s.wave += 1;
  game.spawners.push({ wave: s.wave, left: WAVES.size, t: 0 });
  game.emit('wave', { wave: s.wave });
}

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
