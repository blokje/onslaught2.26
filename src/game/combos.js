// Combo module: recipe matching and every combo effect (see SPEC.md sections 6 and 9, src/data/combos.js).
//
// Damage scaling: every damage value in a recipe is a base value multiplied by the lead's `damageMult`
// (the engine's effective damage multiplier: modifiers plus freak-out). Poison strengths are not scaled.
// "chain" (fx.chain, laser.chain, cluster.chain) adds game.chainLaserDamage(partnerGreen, true), computed
// once when the combo fires and NOT scaled (it is the partner Green's own beam damage).
//
// State kept here (all JSON-able, saved by serialize/deserialize): black holes, napalm / poison zones and
// shockwaves. Mines, rockets, plasma balls and bomblets are ordinary projectiles with a `tag` and a `data`
// object, so the engine already saves them. Only the cached mine road points are dropped.
import { COMBOS, MINE } from '../data/combos.js';
import { COMBO_RANGE } from '../data/turrets.js';
import { ladderValue } from './modifiers.js';
import { impact } from './projectiles.js';
import { applyPoison } from './Attacker.js';

const COLORS = ['red', 'green', 'blue', 'yellow'];
const RECIPES = {};
for (const list of Object.values(COMBOS)) for (const r of list) RECIPES[r.id] = r;

const ROCKET_TURN = 8;               // rad/s for combo rockets (they should not miss)
const BFG_TURN = 4;
const SMALL_ROCKET = { speed: 250, turn: (270 * Math.PI) / 180, impact: 10, ttl: 12000 };
const MAX_MINES = 12;
const MINE_LIFE = 60000;
const NAPALM_TICK = 250;
const NAPALM_RADIUS = 14;
const LASER_ROCKET_TICK = 150;
const BOMBLET_SPEED = 200;
const BOMBLET_LASER_RANGE = 200;

export class Combos {
  constructor(game) {
    this.game = game;
    this.holes = [];   // { x, y, radius, gravity, end, swallowed: [attackerId] }
    this.zones = [];   // { kind: 'napalm'|'cloud', ..., end, next }
    this.waves = [];   // shockwaves { x, y, r, max, speed, damage, poison, knock, srcId, hit: [ids] }
    this.mineCache = new Map(); // turretId -> { x, y, pts }
    this._buf = [];
  }

  // ------------------------------------------------------------------ helpers
  _ready(t) {
    // computed here (not t.comboReady) so a partner used earlier in the same step is not used twice
    return t.comboCapable && t.cd <= 0 && this.game.state.time >= t.comboNext;
  }

  _rand(n) { return Math.floor(this.game.rng.next() * n); }

  _src(p) { return p.sourceId != null ? this.game.turretMap.get(p.sourceId) || null : null; }

  /** Random living, not swallowed attacker within r of (x, y), or null. */
  _randomAttacker(x, y, r) {
    const buf = this._buf;
    const n = this.game.grid.query(x, y, r, buf);
    let m = 0;
    for (let i = 0; i < n; i++) if (!buf[i].swallowed) buf[m++] = buf[i];
    if (m === 0) return null;
    return buf[this._rand(m)];
  }

  /** Nearest living, not swallowed attacker to (x, y) within r that is not in `skip` (array of ids). */
  _nearestAttacker(x, y, r, skip) {
    const buf = this._buf;
    const n = this.game.grid.query(x, y, r, buf);
    let best = null, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const a = buf[i];
      if (a.swallowed || (skip && skip.includes(a.id))) continue;
      const d = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  // ------------------------------------------------------------------ firing
  /** Called before a normal shot of a combo-capable, ready lead. Return true if a combo fired. */
  tryFire(lead) {
    const game = this.game;
    if (!lead.color || lead.kind === 'comboOnly') return false;
    const recipes = COMBOS[lead.color];
    if (!recipes) return false;
    if (!this._ready(lead)) return false;

    const groups = { red: [], green: [], blue: [], yellow: [] };
    const ids = game.comboPartners(lead.id);
    for (let i = 0; i < ids.length; i++) {
      const t = game.turretMap.get(ids[i]);
      if (!t || !this._ready(t)) continue;
      const col = t.kind === 'comboOnly' ? t.comboColor : t.color;
      if (groups[col]) groups[col].push(t);
    }

    for (const r of recipes) {
      let ok = true;
      for (const c of COLORS) {
        const need = r.needs[c] || 0;
        if (groups[c].length < need) { ok = false; break; }
        if (r.exact && r.exact[c] != null && groups[c].length !== r.exact[c]) { ok = false; break; }
      }
      if (!ok) continue;
      if (this._fire(lead, r, groups)) return true;
    }
    return false;
  }

  _fire(lead, r, groups) {
    const game = this.game;
    const target = lead.targetId != null ? game.attackerMap.get(lead.targetId) : null;
    const fx = r.fx;
    const mult = lead.damageMult > 0 ? lead.damageMult : 1;

    // a recipe whose effect cannot be placed does not fire (the next recipe is tried)
    let spot = null;
    if (fx.blackHole) {
      spot = this._holeSpot(lead, fx.blackHole.placeRange);
      if (!spot) return false;
    } else if (fx.projectile === 'mine') {
      spot = this._mineSpot(lead);
      if (!spot) return false;
    } else if (fx.projectile && !target) {
      return false;
    }

    // choose partners at random
    const chosen = [];
    for (const c of COLORS) {
      const need = r.needs[c] || 0;
      if (!need) continue;
      const pool = groups[c].slice();
      for (let k = 0; k < need; k++) chosen.push(pool.splice(this._rand(pool.length), 1)[0]);
    }
    const green = chosen.find((t) => t.kind !== 'comboOnly' && t.color === 'green');
    const needChain = fx.chain || (fx.laser && fx.laser.chain) || (fx.cluster && fx.cluster.chain);
    const chain = needChain && green ? game.chainLaserDamage(green, true) : 0;

    // recharge, name, chain beams
    game.startRecharge(lead, r.recharge);
    for (const t of chosen) {
      game.startRecharge(t, r.recharge);
      game.addBeam('chain', t.x, t.y, lead.x, lead.y, 300);
    }
    game.emit('combo', { id: r.id, name: r.name, turretId: lead.id });
    game.addEffect('comboName', { x: lead.x, y: lead.y - 30, radius: 0, duration: 1800, data: { name: r.name } });
    if (target) lead.angle = Math.atan2(target.y - lead.y, target.x - lead.x);

    if (fx.blackHole) this._openHole(fx.blackHole, spot);
    else if (fx.shockwave) this._shockwave(lead, fx.shockwave, mult);
    else if (fx.projectile === 'mine') this._launchMine(lead, r, mult, chain, spot);
    else this._launch(lead, r, target, mult, chain);
    return true;
  }

  // ------------------------------------------------------------------ projectile launch
  _launch(lead, r, target, mult, chain) {
    const game = this.game;
    const fx = r.fx;
    const a = Math.atan2(target.y - lead.y, target.x - lead.x);
    const homing = fx.projectile === 'clusterBomb';
    const isBfg = fx.projectile === 'bfg';
    const p = game.spawnProjectile(fx.projectile, {
      x: lead.x + Math.cos(a) * 14, y: lead.y + Math.sin(a) * 14, angle: a, speed: fx.speed,
      mode: 'homing', turnRate: homing ? 1000 : isBfg ? BFG_TURN : ROCKET_TURN, targetId: target.id, retarget: true,
      impactRadius: isBfg ? 14 : 10, damage: (fx.hit || 0) * mult + (fx.chain ? chain : 0), sourceId: lead.id,
      ttl: isBfg ? 40000 : 15000,
      tag: fx.projectile,
      data: { cid: r.id, mult, chain },
    });
    if (fx.blast) p.blast = { size: fx.blast.size, damage: fx.blast.damage * mult, poison: fx.blast.poison || 0 };
    else p.visualBlast = 'small';
    if (fx.projectile === 'laserRocket') p.data.t = LASER_ROCKET_TICK;
    if (isBfg) {
      p.data.tLaser = fx.laser || fx.sparks ? 60000 / (fx.laser ? fx.laser.rate : fx.sparks.rate) : 0;
      p.data.tRocket = fx.rockets ? 60000 / fx.rockets.rate : 0;
    }
  }

  // ------------------------------------------------------------------ mines
  _maxRange(t) { return ladderValue(t.kind, 'range', t.maxLevels.range); }

  _mineSpot(lead) {
    const game = this.game;
    let c = this.mineCache.get(lead.id);
    if (!c || c.x !== lead.x || c.y !== lead.y) {
      const R = this._maxRange(lead), R2 = R * R;
      const pts = [];
      for (const q of game.roadPoints()) {
        if ((q.x - lead.x) ** 2 + (q.y - lead.y) ** 2 <= R2) pts.push(q);
      }
      c = { x: lead.x, y: lead.y, pts };
      this.mineCache.set(lead.id, c);
    }
    return c.pts.length ? c.pts[this._rand(c.pts.length)] : null;
  }

  _launchMine(lead, r, mult, chain, spot) {
    const game = this.game;
    const fx = r.fx;
    // max 12 mines per turret: remove the oldest
    const mines = game.state.projectiles.filter((p) => p.tag === 'mine' && !p.dead && p.sourceId === lead.id);
    for (let i = 0; i <= mines.length - MAX_MINES; i++) mines[i].dead = true;
    const p = game.spawnProjectile('mine', {
      x: lead.x, y: lead.y, angle: Math.atan2(spot.y - lead.y, spot.x - lead.x), speed: MINE.travelSpeed,
      mode: 'goto', destX: spot.x, destY: spot.y, stay: true, sourceId: lead.id, tag: 'mine',
      damage: fx.hit * mult, blast: { size: fx.blast.size, damage: fx.blast.damage * mult, poison: 0 },
      data: { cid: r.id, mult, chain, armed: false },
    });
    return p;
  }

  // ------------------------------------------------------------------ black hole
  _holeSpot(lead, range) {
    const R2 = range * range;
    const pts = [];
    for (const q of this.game.roadPoints()) {
      if ((q.x - lead.x) ** 2 + (q.y - lead.y) ** 2 <= R2) pts.push(q);
    }
    return pts.length ? pts[this._rand(pts.length)] : null;
  }

  _openHole(cfg, spot) {
    const game = this.game;
    game.addEffect('blackHole', { x: spot.x, y: spot.y, radius: cfg.radius, duration: cfg.duration, data: {} });
    this.holes.push({
      x: spot.x, y: spot.y, radius: cfg.radius, gravity: cfg.gravity,
      end: game.state.time + cfg.duration, swallowed: [],
    });
  }

  _updateHoles(dt) {
    const game = this.game;
    const now = game.state.time;
    const dtS = dt / 1000;
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      const closing = now >= h.end;
      if (!closing) {
        const found = game.attackersInRadius(h.x, h.y, h.radius);
        for (const a of found) {
          if (a.swallowed) continue;
          a.blackholed = true;   // engine: no road movement, $0 bounty
          a.swallowed = true;    // targeting: not a valid target any more
          a.bounty = 0;
          h.swallowed.push(a.id);
        }
      }
      const keep = [];
      for (const id of h.swallowed) {
        const a = game.attackerMap.get(id);
        if (!a || a.dead) continue;
        if (!closing) {
          const dx = h.x - a.x, dy = h.y - a.y;
          const d = Math.hypot(dx, dy);
          const step = h.gravity * dtS;
          if (d <= step) { a.x = h.x; a.y = h.y; game.killAttacker(a, { bounty: 0 }); continue; }
          a.x += (dx / d) * step; a.y += (dy / d) * step;
          keep.push(id);
        } else {
          game.killAttacker(a, { bounty: 0 });
        }
      }
      h.swallowed = keep;
      if (closing) this.holes.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ shockwave
  _shockwave(lead, cfg, mult) {
    const game = this.game;
    game.addEffect('shockwave', {
      x: lead.x, y: lead.y, radius: cfg.radius, duration: (cfg.radius / cfg.speed) * 1000,
      data: { speed: cfg.speed },
    });
    this.waves.push({
      x: lead.x, y: lead.y, r: 0, max: cfg.radius, speed: cfg.speed, damage: cfg.damage * mult,
      poison: cfg.poison || 0, knock: cfg.knockback, srcId: lead.id, hit: [],
    });
  }

  _updateWaves(dt) {
    const game = this.game;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r = Math.min(w.max, w.r + w.speed * (dt / 1000));
      const found = game.attackersInRadius(w.x, w.y, w.r);
      const src = game.turretMap.get(w.srcId) || null;
      for (const a of found) {
        if (w.hit.includes(a.id) || a.swallowed) continue;
        w.hit.push(a.id);
        if (game.damageAttacker(a, w.damage, src, w.poison)) continue;
        if (!a.blackholed) {
          a.progress = Math.max(0, a.progress - w.knock);
          game.path.place(a, a.progress);
        }
      }
      if (w.r >= w.max) this.waves.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ zones (napalm, poison cloud)
  _napalm(p, x, y, cfg, mult) {
    const game = this.game;
    const road = game.roadPoints();
    let best = null, bd = Infinity;
    for (const q of road) {
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) return;
    const half = cfg.length / 2;
    const points = [];
    for (const q of road) if (Math.abs(q.d - best.d) <= half) points.push([q.x, q.y]);
    game.addEffect('napalm', { x: best.x, y: best.y, radius: NAPALM_RADIUS, duration: cfg.duration, data: { points } });
    this.zones.push({
      kind: 'napalm', points, dmg: cfg.dps * mult * (NAPALM_TICK / 1000), srcId: p.sourceId,
      end: game.state.time + cfg.duration, next: game.state.time + NAPALM_TICK,
    });
  }

  _cloud(x, y, radius, duration, poison) {
    const game = this.game;
    game.addEffect('poisonCloud', { x, y, radius, duration, data: {} });
    this.zones.push({ kind: 'cloud', x, y, radius, poison, end: game.state.time + duration, next: game.state.time + 250 });
  }

  _updateZones() {
    const game = this.game;
    const now = game.state.time;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (now >= z.end) { this.zones.splice(i, 1); continue; }
      if (now < z.next) continue;
      z.next += NAPALM_TICK;
      if (z.kind === 'napalm') {
        const src = game.turretMap.get(z.srcId) || null;
        const hit = new Set();
        for (const q of z.points) {
          const found = game.attackersInRadius(q[0], q[1], NAPALM_RADIUS);
          for (const a of found) {
            if (a.swallowed || hit.has(a.id)) continue;
            hit.add(a.id);
            game.damageAttacker(a, z.dmg, src, 0);
          }
        }
      } else {
        const found = game.attackersInRadius(z.x, z.y, z.radius);
        for (const a of found) if (!a.swallowed) applyPoison(a, z.poison);
      }
    }
  }

  // ------------------------------------------------------------------ per step
  /** Called once per simulation step, after attackers moved and before turrets fire. */
  update(dt) {
    if (this.holes.length) this._updateHoles(dt);
    if (this.waves.length) this._updateWaves(dt);
    if (this.zones.length) this._updateZones();
    if (this.mineCache.size > 64) this.mineCache.clear();
  }

  // ------------------------------------------------------------------ projectile hooks
  projectileUpdate(p, dt) {
    const game = this.game;
    const d = p.data;
    if (!d) return;
    const r = RECIPES[d.cid];
    if (!r) return;
    const fx = r.fx;
    const src = this._src(p);

    if (p.tag === 'mine') {
      if (p.age > MINE_LIFE) { p.dead = true; return; }
      if (!d.armed) {
        if (Math.hypot(p.destX - p.x, p.destY - p.y) < 0.5) d.armed = true;
        return;
      }
      const a = this._nearestAttacker(p.x, p.y, MINE.triggerRadius, null);
      if (a) impact(game, p, p.x, p.y, a);
      return;
    }

    if (p.tag === 'laserRocket') {
      d.t -= dt;
      if (d.t <= 0) {
        d.t += LASER_ROCKET_TICK;
        const a = this._nearestAttacker(p.x, p.y, fx.laser.range, null);
        if (a) {
          game.addBeam('laser', p.x, p.y, a.x, a.y, 120);
          game.damageAttacker(a, fx.laser.damage * d.mult + (fx.laser.chain ? d.chain : 0), src, 0);
        }
      }
      return;
    }

    if (p.tag === 'bfg') {
      if (d.tLaser > 0) {
        d.tLaser -= dt;
        if (d.tLaser <= 0) {
          const spark = !fx.laser && fx.sparks;
          d.tLaser += 60000 / (spark ? fx.sparks.rate : fx.laser.rate);
          const range = spark ? fx.sparks.range : fx.laser.range;
          const a = this._randomAttacker(p.x, p.y, range);
          if (a) {
            if (spark) {
              game.addBeam('spark', p.x, p.y, a.x, a.y, 120);
              game.damageAttacker(a, fx.sparks.damage * d.mult, src, fx.sparks.poison || 0);
            } else {
              game.addBeam('laser', p.x, p.y, a.x, a.y, 120);
              game.damageAttacker(a, fx.laser.damage * d.mult, src, 0);
            }
          }
        }
      }
      if (d.tRocket > 0) {
        d.tRocket -= dt;
        if (d.tRocket <= 0) {
          d.tRocket += 60000 / fx.rockets.rate;
          const a = this._randomAttacker(p.x, p.y, fx.rockets.range);
          if (a) {
            game.spawnProjectile('rocket', {
              x: p.x, y: p.y, angle: Math.atan2(a.y - p.y, a.x - p.x), speed: SMALL_ROCKET.speed,
              mode: 'homing', turnRate: SMALL_ROCKET.turn, targetId: a.id, retarget: true,
              impactRadius: SMALL_ROCKET.impact, damage: fx.rockets.damage * d.mult, visualBlast: 'small',
              sourceId: p.sourceId, ttl: SMALL_ROCKET.ttl,
            });
          }
        }
      }
    }
  }

  projectileImpact(p, x, y, target) {
    const game = this.game;
    const d = p.data;
    if (!d) return;
    const r = RECIPES[d.cid];
    if (!r) return;
    const fx = r.fx;
    const src = this._src(p);

    switch (p.tag) {
      case 'poisonRocket':
        this._cloud(x, y, 110, 3000, fx.blast.poison || 2);
        break;
      case 'laserRocket': {
        const b = fx.burst;
        for (let i = 0; i < b.qty; i++) {
          const a = this._randomAttacker(x, y, b.range);
          if (!a) break;
          game.addBeam('laser', x, y, a.x, a.y, 160);
          game.damageAttacker(a, b.damage * d.mult, src, 0);
        }
        break;
      }
      case 'napalmRocket':
        this._napalm(p, x, y, fx.napalm, d.mult);
        break;
      case 'tazerRocket': {
        const cs = fx.chainSpark;
        const hit = target ? [target.id] : [];
        let cx = x, cy = y;
        for (let i = 0; i < cs.qty; i++) {
          const a = this._nearestAttacker(cx, cy, cs.range, hit);
          if (!a) break;
          hit.push(a.id);
          game.addBeam('spark', cx, cy, a.x, a.y, 150);
          game.damageAttacker(a, cs.damage * d.mult, src, cs.poison || 0);
          cx = a.x; cy = a.y;
        }
        break;
      }
      case 'clusterBomb':
      case 'mine':
        this._clusterExtras(p, x, y, r, d, src);
        break;
      case 'bomblet': {
        const a = this._nearestAttacker(x, y, BOMBLET_LASER_RANGE, null);
        if (a && d.laser > 0) {
          game.addBeam('laser', x, y, a.x, a.y, 150);
          game.damageAttacker(a, d.laser + (d.chainOn ? d.chain : 0), src, 0);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Bomblets and spark bursts after a cluster bomb or mine went off. */
  _clusterExtras(p, x, y, r, d, src) {
    const game = this.game;
    const fx = r.fx;
    if (fx.cluster) {
      const c = fx.cluster;
      for (let i = 0; i < c.qty; i++) {
        const ang = game.rng.next() * Math.PI * 2;
        const dist = 40 + game.rng.next() * 50;
        game.spawnProjectile('cluster', {
          x, y, angle: ang, speed: BOMBLET_SPEED, mode: 'goto',
          destX: x + Math.cos(ang) * dist, destY: y + Math.sin(ang) * dist,
          sourceId: p.sourceId, tag: 'bomblet',
          blast: { size: 'small', damage: c.damage * d.mult, poison: 0 },
          data: { cid: r.id, mult: d.mult, chain: d.chain, chainOn: !!c.chain, laser: (c.laser || 0) * d.mult },
        });
      }
    }
    if (fx.sparks) {
      const s = fx.sparks;
      for (let i = 0; i < s.qty; i++) {
        const a = this._nearestAttacker(x, y, s.range, null);
        if (!a) break;
        game.addBeam('spark', x, y, a.x, a.y, 150);
        game.damageAttacker(a, s.damage * d.mult, src, s.poison || 0);
      }
    }
  }

  // ------------------------------------------------------------------ persistence
  serialize() {
    return { holes: this.holes, zones: this.zones, waves: this.waves };
  }

  deserialize(json) {
    this.holes = (json && json.holes) || [];
    this.zones = (json && json.zones) || [];
    this.waves = (json && json.waves) || [];
    this.mineCache.clear();
  }
}
