// Generic projectile movement: straight, homing, orbiting and goto (bombs / mines).
//
// Projectile fields (all JSON-able): id, kind, x, y, angle, speed (units/s),
//   mode: 'straight' | 'homing' | 'orbit' | 'goto'
//   targetId, turnRate (rad/s, homing), retarget (bool: homing rockets pick the nearest attacker when the target dies)
//   damage (direct hit, to target or first attacker touched), impactRadius, poison (strength > 1 slows)
//   blast: { size:'small'|'medium'|'large'|'huge'|'bfg'|'poison'|number, damage, poison }
//   visualBlast: size (blast effect only, no damage)
//   sourceId (turret id), ttl (ms, optional: removed when it runs out), age
//   orbit: ownerId, orbitA (angle), orbitR (radius), orbitW (rad/s)
//   goto: destX, destY, stay (true: park at the destination instead of impacting, e.g. mines)
//   tag, data: free for the combo module (see combos.projectileUpdate / projectileImpact hooks)
const OFF = 90;

function turnToward(p, tx, ty, dtS) {
  const desired = Math.atan2(ty - p.y, tx - p.x);
  let diff = desired - p.angle;
  diff = ((((diff + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  const maxTurn = (p.turnRate || 0) * dtS;
  p.angle += diff < -maxTurn ? -maxTurn : diff > maxTurn ? maxTurn : diff;
}

function nearestAttacker(game, x, y) {
  let best = null, bd = Infinity;
  const list = game.state.attackers;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead || a.swallowed) continue;
    const d = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/** Resolves a projectile hit: marks it dead, damages the target, applies blast or visual blast, notifies combos. */
export function impact(game, p, x, y, target) {
  p.dead = true;
  const src = p.sourceId != null ? game.turretMap.get(p.sourceId) || null : null;
  if (p.damage > 0 && target && !target.dead) game.damageAttacker(target, p.damage, src, p.poison || 0);
  if (p.blast) game.blast(x, y, p.blast.size, p.blast.damage, { poison: p.blast.poison, source: src });
  else if (p.visualBlast) game.visualBlast(x, y, p.visualBlast);
  if (p.tag && game.combos && game.combos.projectileImpact) game.combos.projectileImpact(p, x, y, target);
}

/** Moves every projectile by one step according to its mode and resolves impacts and expiry. */
export function updateProjectiles(game, dt) {
  const dtS = dt / 1000;
  const list = game.state.projectiles;
  // holding counters are recounted from the orbiting rockets
  const turrets = game.state.turrets;
  for (let i = 0; i < turrets.length; i++) if (turrets[i].kind === 'red') turrets[i].holding = 0;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.dead) continue;
    p.age += dt;
    if (p.ttl != null) {
      p.ttl -= dt;
      if (p.ttl <= 0 && !p.stay) { p.dead = true; continue; }
    }
    if (p.tag && game.combos && game.combos.projectileUpdate) {
      game.combos.projectileUpdate(p, dt);
      if (p.dead) continue;
    }

    if (p.mode === 'orbit') {
      const owner = game.turretMap.get(p.ownerId);
      if (!owner) { p.dead = true; continue; }
      owner.holding++;
      p.orbitA += p.orbitW * dtS;
      p.x = owner.x + Math.cos(p.orbitA) * p.orbitR;
      p.y = owner.y + Math.sin(p.orbitA) * p.orbitR;
      p.angle = p.orbitA + Math.PI / 2;
      continue;
    }

    const step = p.speed * dtS;

    if (p.mode === 'goto') {
      const dx = p.destX - p.x, dy = p.destY - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.0001) p.angle = Math.atan2(dy, dx);
      if (d <= step) {
        p.x = p.destX; p.y = p.destY;
        if (!p.stay) impact(game, p, p.x, p.y, null);
      } else {
        p.x += (dx / d) * step; p.y += (dy / d) * step;
      }
      continue;
    }

    if (p.mode === 'homing') {
      let target = p.targetId != null ? game.attackerMap.get(p.targetId) : null;
      let swallowed = false;
      if (target && (target.dead || target.swallowed)) { swallowed = !!target.swallowed && !target.dead; target = null; } // black hole victims are not chased
      if (!target) {
        if (p.retarget || swallowed) {
          target = nearestAttacker(game, p.x, p.y);
          if (target || !swallowed) p.targetId = target ? target.id : null; // none valid: fly on straight
        } else if (p.damage > 0 && !p.blast) {
          p.dead = true; continue; // shell lost its target
        }
      }
      if (target) {
        const dx = target.x - p.x, dy = target.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= (p.impactRadius || 8) + step) {
          p.x = target.x; p.y = target.y;
          impact(game, p, target.x, target.y, target);
          continue;
        }
        turnToward(p, target.x, target.y, dtS);
      }
    } else if (p.damage > 0 || p.blast) {
      // straight projectile: hits the first attacker it touches
      const buf = game._projBuf;
      if (game.grid.query(p.x, p.y, (p.impactRadius || 8) + step, buf) > 0) {
        const a = buf[0];
        impact(game, p, a.x, a.y, a);
        continue;
      }
    }
    p.x += Math.cos(p.angle) * step;
    p.y += Math.sin(p.angle) * step;
    if (p.x < -OFF || p.x > 720 + OFF || p.y < -OFF || p.y > 450 + OFF) p.dead = true;
  }

  // compact in place
  let j = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[j++] = list[i];
  list.length = j;
}
