// Attacker creation, movement along the path, poison/slow.
import { WAVES, WEAVE } from '../data/rules.js';
import { POISON } from '../data/turrets.js';

/** HP of an attacker in wave n: baseEnergy * hpGrowth^n (plain doubles, trillions are fine). */
export const waveHp = (n, growth) => WAVES.baseEnergy * Math.pow(growth, n);

export function createAttacker(game, wave, hpOverride) {
  const hp = hpOverride != null ? hpOverride : waveHp(wave, game.hpGrowth);
  const a = {
    id: game.nextId++,
    type: (wave - 1) % WAVES.types,
    x: 0, y: 0, angle: 0,
    hp, maxHp: hp,
    speed: WAVES.baseSpeed, baseSpeed: WAVES.baseSpeed,
    poisoned: false, blackholed: false,
    progress: 0,
    // additions
    wave, bounty: wave, dead: false, _seg: 0,
  };
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
export function laneOffset(a) {
  const w = a.weave;
  if (!w) return 0;
  const p = a.progress;
  return WEAVE.amplitude * (0.6 * Math.sin(p * w[2] + w[0]) + 0.4 * Math.sin(p * w[3] + w[1]));
}

/** Slow an attacker: speed = baseSpeed / strength (floor 5). Strength <= 1 does nothing. */
export function applyPoison(a, strength) {
  if (!(strength > 1)) return;
  const slowed = Math.max(POISON.minSpeed, a.baseSpeed / strength);
  if (slowed < a.speed) a.speed = slowed;
  if (a.speed < a.baseSpeed) a.poisoned = true;
}

/** Advance all attackers; leaks are flagged dead and handled via game.leak(). */
export function moveAttackers(game, dt) {
  const dtS = dt / 1000;
  const list = game.state.attackers;
  const path = game.path;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
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
