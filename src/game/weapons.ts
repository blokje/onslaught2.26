// Per-turret behaviour each simulation step: cooldown, target upkeep, firing, and the weapon kinds.
import { TURRETS } from '../data/turrets.ts';
import { acquire, targetValid } from './targeting.ts';

const SHELL = { speed: 900, impact: 8 };
const ROCKET = { speed: 250, turn: (270 * Math.PI) / 180, impact: 10, ttl: 12000 };
const HOLD = { radius: 35, omega: 3.2 };
const RAIL_WIDTH = 8;
const LASER_WIDTH = 4; // half-width of the piercing laser line, half the Railgun's
const MUZZLE = 12;

export const fireInterval = (t) => (t.stats.rate > 0 ? 60000 / t.stats.rate : Infinity);

/** True when the turret has the range and rate levels that unlock its holding behaviour. */
export function holdingEnabled(t) {
  const h = TURRETS[t.kind].holding;
  return !!h && t.levels.range >= h.range && t.levels.rate >= h.rate;
}

/** Where the turret acquires targets from: itself, or its joined Targeter. */
function origin(game, t, out) {
  if (t.targeterId != null) {
    const g = game.turretMap.get(t.targeterId);
    if (g) {
      out.x = g.x; out.y = g.y; out.range = g.stats.range;
      return out;
    }
  }
  out.x = t.x; out.y = t.y; out.range = t.stats.range;
  return out;
}

const ORIGIN = { x: 0, y: 0, range: 0 };

/** Advances one turret by dt ms: cooldown, target acquisition and firing its weapon. */
export function stepTurret(game, t, dt) {
  const s = game.state;
  if (t.category !== 'weapon') {
    // Combo-only: always capable, never fires, only its timers matter for combos
    if (t.kind === 'comboOnly') {
      t.cd = Math.max(t.cd - dt, -dt);
      t.comboReady = t.cd <= 0 && s.time >= t.comboNext;
    }
    return;
  }

  // 1) cooldown (a little banked overshoot keeps the effective rate exact at 60 Hz steps)
  t.cd -= dt;
  if (t.cd < -dt) t.cd = -dt;
  const ready = t.cd <= 0;
  t.comboReady = t.comboCapable && ready && s.time >= t.comboNext;

  const def = TURRETS[t.kind];
  const o = origin(game, t, ORIGIN);
  const ox = o.x, oy = o.y, range = o.range;

  // 2) target upkeep: keep while valid, focus fire overrides
  let target = t.targetId != null ? game.attackerMap.get(t.targetId) : undefined;
  if (target && !targetValid(t, target, ox, oy, range)) target = undefined;
  if (game.focusId != null) {
    const f = game.attackerMap.get(game.focusId);
    if (f && !f.dead && !f.swallowed) {
      const dx = f.x - ox, dy = f.y - oy;
      if (dx * dx + dy * dy <= range * range) target = f;
    }
  }
  // Yellow (instant sparks) re-acquires every shot unless locked or focus-fired
  if (target && ready && def.weapon === 'spark' && !t.locked && game.focusId == null) {
    target = acquire(game, t, ox, oy, range) || target;
  }
  if (!target && (ready || ((game.stepCount + t.id) & 7) === 0)) {
    target = acquire(game, t, ox, oy, range) || undefined;
  }
  t.targetId = target ? target.id : null;
  if (target) t.angle = Math.atan2(target.y - t.y, target.x - t.x);
  if (def.weapon === 'fusion' && !target) { t.ramp = 0; t.rampTarget = null; }

  // 3) Red holding pattern while idle
  if (def.holding && holdingEnabled(t) && !target) {
    if (ready && t.holding < def.holding.max) {
      spawnOrbiter(game, t);
      t.cd += fireInterval(t);
    }
    return;
  }
  if (!target || !ready) return;

  // 4) fire. A combo-capable lead that is ready offers a combo first.
  if (t.comboReady && game.combos && game.combos.tryFire(t)) return;
  fire(game, t, target, ox, oy, range, def);
}

function spawnOrbiter(game, t) {
  game.spawnProjectile('rocket', {
    x: t.x + HOLD.radius, y: t.y, angle: 0, speed: ROCKET.speed,
    mode: 'orbit', ownerId: t.id, orbitA: game.rng.next() * Math.PI * 2, orbitR: HOLD.radius, orbitW: HOLD.omega,
    turnRate: ROCKET.turn, retarget: true, impactRadius: ROCKET.impact, damage: 0, visualBlast: 'small',
    sourceId: t.id, orbiting: true, ttl: null,
  });
  t.holding++;
}

/** Turn an orbiting rocket into a diving one. */
export function releaseOrbiter(game, p, target, damage) {
  p.mode = 'homing';
  p.orbiting = false;
  p.targetId = target ? target.id : null;
  p.damage = damage;
  p.ttl = ROCKET.ttl;
  p.speed = ROCKET.speed;
}

function launchRocket(game, t, target) {
  const a = Math.atan2(target.y - t.y, target.x - t.x);
  game.spawnProjectile('rocket', {
    x: t.x + Math.cos(a) * MUZZLE, y: t.y + Math.sin(a) * MUZZLE, angle: a, speed: ROCKET.speed,
    mode: 'homing', turnRate: ROCKET.turn, targetId: target.id, retarget: true,
    impactRadius: ROCKET.impact, damage: t.stats.damage, visualBlast: 'small', sourceId: t.id, ttl: ROCKET.ttl,
  });
}

/** Total chain bonus damage of the Greens linked to `lead`. consume: reset the contributors' timers and draw beams. */
export function chainBonus(game, lead, visited, consume) {
  const mult = TURRETS.green.link.mult;
  let sum = 0;
  for (let i = 0; i < lead.links.length; i++) {
    const id = lead.links[i];
    if (visited.has(id)) continue;
    const g = game.turretMap.get(id);
    if (!g || g.cd > 0) continue;
    visited.add(id);
    const sub = chainBonus(game, g, visited, consume);
    sum += (g.stats.damage + sub) * mult;
    if (consume) {
      g.cd = fireInterval(g);
      game.addBeam('chain', g.x, g.y, lead.x, lead.y, 160);
    }
  }
  return sum;
}

const PIERCE_HITS = [];
const PIERCE_ALONG = [];

/**
 * Piercing laser: spend `energy` along the line from `t` through `target`, nearest attacker first.
 * An attacker with hp <= energy dies and costs its hp; the first stronger one takes the rest and stops the beam.
 */
function pierceLaser(game, t, target, energy, reach) {
  const dx = target.x - t.x, dy = target.y - t.y;
  const dist = Math.hypot(dx, dy);
  const a = dist > 0 ? Math.atan2(dy, dx) : t.angle;
  const ux = Math.cos(a), uy = Math.sin(a);
  const len = Math.max(reach, dist + 1);
  const hits = PIERCE_HITS, along = PIERCE_ALONG;
  hits.length = 0; along.length = 0;
  const list = game.state.attackers;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e.swallowed) continue;
    const rx = e.x - t.x, ry = e.y - t.y;
    const d = rx * ux + ry * uy;
    if (d < 0 || d > len) continue;
    if (e !== target && Math.abs(rx * uy - ry * ux) > LASER_WIDTH) continue;
    // insertion sort by distance along the line (ties by id, so the order is deterministic)
    let j = hits.length;
    while (j > 0 && (along[j - 1] > d || (along[j - 1] === d && hits[j - 1].id > e.id))) {
      hits[j] = hits[j - 1]; along[j] = along[j - 1]; j--;
    }
    hits[j] = e; along[j] = d;
  }
  let endX = t.x + ux * len, endY = t.y + uy * len;
  for (let i = 0; i < hits.length && energy > 0; i++) {
    const e = hits[i];
    if (e.hp <= energy) {
      energy -= e.hp;
      game.damageAttacker(e, e.hp, t, 0);
      if (energy <= 0) { endX = e.x; endY = e.y; }
    } else {
      game.damageAttacker(e, energy, t, 0);
      energy = 0;
      endX = e.x; endY = e.y;
    }
  }
  hits.length = 0;
  game.addBeam('laser', t.x, t.y, endX, endY, 140);
}

function fire(game, t, target, ox, oy, range, def) {
  const dmg = t.stats.damage;
  const interval = fireInterval(t);
  switch (def.weapon) {
    case 'shell': {
      const a = Math.atan2(target.y - t.y, target.x - t.x);
      game.spawnProjectile('shell', {
        x: t.x + Math.cos(a) * MUZZLE, y: t.y + Math.sin(a) * MUZZLE, angle: a, speed: SHELL.speed,
        mode: 'homing', turnRate: 1000, targetId: target.id, impactRadius: SHELL.impact,
        damage: dmg, sourceId: t.id,
      });
      break;
    }
    case 'rocket': {
      // release circling rockets first, they dive at the target
      let released = 0;
      if (t.holding > 0) {
        const list = game.state.projectiles;
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (p.orbiting && p.ownerId === t.id && !p.dead) {
            releaseOrbiter(game, p, target, dmg);
            released++;
          }
        }
        t.holding = 0;
      }
      if (!released) launchRocket(game, t, target);
      break;
    }
    case 'laser': {
      const visited = new Set([t.id]);
      const total = dmg + chainBonus(game, t, visited, true);
      pierceLaser(game, t, target, total, range + Math.hypot(ox - t.x, oy - t.y));
      break;
    }
    case 'spark': {
      const poison = 1 + ((def.poisonMax || 10) - 1) * (t.maxLevels.damage ? t.levels.damage / t.maxLevels.damage : 0);
      game.addBeam('spark', t.x, t.y, target.x, target.y, 120);
      game.damageAttacker(target, dmg, t, poison);
      break;
    }
    case 'sniper': {
      game.addBeam('sniper', t.x, t.y, target.x, target.y, 260);
      game.damageAttacker(target, dmg, t, 0);
      break;
    }
    case 'fusion': {
      if (t.rampTarget === target.id) t.ramp++;
      else { t.ramp = 0; t.rampTarget = target.id; }
      const mult = Math.min(def.ramp.max, 1 + def.ramp.perTick * t.ramp);
      game.addBeam('fusion', t.x, t.y, target.x, target.y, Math.max(100, Math.min(interval, 250)));
      game.damageAttacker(target, dmg * mult, t, 0);
      break;
    }
    case 'rail': {
      const a = Math.atan2(target.y - t.y, target.x - t.x);
      const ux = Math.cos(a), uy = Math.sin(a);
      const len = Math.max(range + Math.hypot(ox - t.x, oy - t.y), Math.hypot(target.x - t.x, target.y - t.y) + 1);
      game.addBeam('rail', t.x, t.y, t.x + ux * len, t.y + uy * len, 300);
      const list = game.state.attackers;
      // Like blast(), this intentionally also hits black-hole-swallowed attackers.
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        const rx = e.x - t.x, ry = e.y - t.y;
        const along = rx * ux + ry * uy;
        if (along < 0 || along > len) continue;
        if (Math.abs(rx * uy - ry * ux) <= RAIL_WIDTH) game.damageAttacker(e, dmg, t, 0);
      }
      break;
    }
    default:
      return;
  }
  t.cd += interval;
  game.emit('shot', { kind: def.weapon, turretId: t.id });
}
