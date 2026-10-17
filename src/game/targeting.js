// Target acquisition and validation (modes, directional cones).
import { DIRECTIONAL } from '../data/rules.js';

const TAU = Math.PI * 2;

/** Is attacker a inside the turret's directional cone (as seen from the acquisition origin)? */
export function inCone(t, ox, oy, a) {
  const mode = t.directional.mode;
  if (mode === 'normal') return true;
  const half = ((DIRECTIONAL[mode] || 360) / 2) * (Math.PI / 180);
  let diff = Math.atan2(a.y - oy, a.x - ox) - t.directional.angle;
  diff = ((((diff + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return Math.abs(diff) <= half;
}

/** Alive, in range and inside the cone. */
export function targetValid(t, a, ox, oy, range) {
  if (!a || a.dead || a.swallowed) return false;
  const dx = a.x - ox, dy = a.y - oy;
  if (dx * dx + dy * dy > range * range) return false;
  return inCone(t, ox, oy, a);
}

/**
 * Pick the best attacker for the turret's target mode within `range` of (ox, oy).
 * near: closest; far: furthest along the path; weak/strong: lowest/highest hp; slow/fast: lowest/highest speed; oldest/newest: spawned first/last.
 * Ties resolve by grid order (deterministic).
 */
export function acquire(game, t, ox, oy, range) {
  const buf = game._acqBuf;
  const n = game.grid.query(ox, oy, range, buf);
  const mode = t.targetMode;
  const cone = t.directional.mode !== 'normal';
  let best = null, bestKey = Infinity;
  for (let i = 0; i < n; i++) {
    const a = buf[i];
    if (a.swallowed) continue; // inside a black hole
    if (cone && !inCone(t, ox, oy, a)) continue;
    let key;
    switch (mode) {
      case 'far': key = -a.progress; break;
      case 'weak': key = a.hp; break;
      case 'strong': key = -a.hp; break;
      case 'slow': key = a.speed; break;
      case 'fast': key = -a.speed; break;
      case 'oldest': key = a.id; break;   // ids only increase, so lowest id = spawned first
      case 'newest': key = -a.id; break;
      default: { const dx = a.x - ox, dy = a.y - oy; key = dx * dx + dy * dy; }
    }
    if (key < bestKey || best === null) { bestKey = key; best = a; }
  }
  return best;
}
