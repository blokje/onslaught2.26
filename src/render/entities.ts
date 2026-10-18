// Per-frame drawing of turrets, attackers and projectiles into the shared batches.
// Everything is rebuilt each frame from game.state (cheap: a few hundred instances).

import { TURRETS, TURRET_SIZE } from '../data/turrets.ts';
import { KIND_INDEX, KIND_TINT, COMBO_COLOR } from './atlas.ts';
import { clamp, hex, hash2, TAU } from './util.ts';
import type { RGB } from './util.ts';
import type { TurretState } from '../types.ts';
import type { Res, Frame } from './context.ts';

const rgbCache = new Map<string, RGB>();
export function rgb(c: string): RGB {
  let v = rgbCache.get(c);
  if (!v) { v = hex(c); rgbCache.set(c, v); }
  return v;
}

const PIP_STATS: ['damage' | 'range' | 'rate', RGB][] = [['damage', [1, 0.45, 0.25]], ['range', [0.35, 0.85, 1]], ['rate', [0.7, 1, 0.35]]];

/** Rendering tint for a turret kind (used for glow, rings). */
export function turretColor(t: TurretState): RGB {
  if (t.kind === 'comboOnly' && t.comboColor && COMBO_COLOR[t.comboColor]) return rgb(COMBO_COLOR[t.comboColor]);
  return rgb(KIND_TINT[t.kind] || '#ffffff');
}

/** Influence / firing range ring radius for a turret (0 = none). */
export function rangeOf(t: TurretState): number {
  const def = TURRETS[t.kind];
  if (!def) return 0;
  if (def.category === 'modifier') return t.modRange || 80;
  return (t.stats && t.stats.range) || (def.base && def.base.range) || 0;
}

export function drawTurrets(R: Res, f: Frame): void {
  const { b, c } = R, t0 = f.t;
  const wpp = f.wpp;
  for (const t of f.state.turrets) {
    const idx = KIND_INDEX[t.kind];
    if (idx === undefined) continue;
    const def = TURRETS[t.kind];
    const isMod = def.category === 'modifier';
    const col = turretColor(t);
    const seed = t.id * 0.731;
    const x = t.x, y = t.y;

    // halo when a combo is possible
    if (t.comboCapable) {
      const a = 0.26 + 0.1 * Math.sin(t0 * 2.2 + seed);
      b.tGlow.add(x, y, 0, 74, 74, c.fx.glow, col[0], col[1], col[2], a);
    }

    // base plate (tinted red and flashing during the freak-out warning)
    let br = 1, bg = 1, bb = 1;
    if (t.freak === 'warn') { const fl = 0.5 + 0.5 * Math.sin(t0 * 16); bg = bb = 1 - 0.55 * fl; }
    b.tBase.add(x, y, 0, 64, 64, c.tb[idx], br, bg, bb, 1);

    // weapon
    let rot = t.angle || 0;
    if (isMod) rot = t0 * (t.kind === 'rateUp' || t.kind === 'rateUpEx' ? 1.6 : 0.7) + seed;
    else if (t.kind === 'comboOnly') rot = t0 * 0.4 + seed;
    let wr = 1, wg = 1, wb = 1;
    if (t.kind === 'comboOnly') { wr = col[0]; wg = col[1]; wb = col[2]; }
    if (t.freak === 'warn') { const fl = 0.5 + 0.5 * Math.sin(t0 * 16); wg = wb = 1 - 0.45 * fl; }
    let jx = 0, jy = 0;
    if (t.freak === 'on') { // heat jitter + shimmer copies + glow
      jx = (Math.random() - 0.5) * 1.3; jy = (Math.random() - 0.5) * 1.3;
      const fl = 0.8 + 0.2 * Math.random();
      b.tGlow.add(x, y, 0, 92, 92, c.fx.glow, 1, 0.45, 0.1, 0.42 * fl);
      for (let k = 0; k < 2; k++) {
        b.tWeapAdd.add(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3 - 1, rot, isMod ? 50 : 64, isMod ? 50 : 64, c.tw[idx], 1, 0.5, 0.15, 0.22);
      }
      if (f.dtMs > 0 && Math.random() < f.dtMs * 0.012) {
        R.particles.spawn(1, x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, -26 - Math.random() * 18, 700, 5, 1, 1, 0.55, 0.15, 0.55, 0);
      }
    }
    const ws = isMod ? 50 : 64; // modifier dishes are drawn smaller so the icon on top stays readable
    b.tWeap.add(x + jx, y + jy, rot, ws, ws, c.tw[idx], wr, wg, wb, 1);
    const icon = c.ti[t.kind];
    if (isMod && icon) b.tIcon.add(x, y, 0, 32, 32, icon, wr, wg, wb, 1);

    // freak indicators
    if (t.freak === 'available') {
      const a = 0.55 + 0.4 * Math.sin(t0 * 4 + seed);
      b.ringAdd.add(x + 15, y - 15, 2.6, 1.2, 1, 0.3, 0, 1, 0.8, 0.25, a);
    } else if (t.freak === 'warn') {
      const fl = Math.sin(t0 * 16) > -0.2 ? 1 : 0.15;
      b.ringAdd.add(x, y, 26, 2.6, 0.12 * fl, 0.4, 0, 1, 0.15, 0.1, 0.95 * fl);
    }
    // combo ready pulse
    if (t.comboReady) {
      const ph = (t0 * 1.1 + seed) % 1;
      b.ringAdd.add(x, y, 21 + 9 * ph, 2.2, 0, 0.5, 0, col[0], col[1], col[2], 0.85 * (1 - ph));
      b.ringAdd.add(x, y, 22, 1.4, 0, 0.3, 0, 1, 1, 0.85, 0.55 + 0.25 * Math.sin(t0 * 6 + seed));
    }

    // upgrade pips (3 bars: damage / range / rate as a fraction of maxLevels)
    if (t.levels && t.maxLevels) {
      let row = 0, full = true, shown = 0;
      for (const [stat] of PIP_STATS) if (t.maxLevels[stat] > 0) shown++;
      for (const [stat, pc] of PIP_STATS) {
        const m = t.maxLevels[stat];
        if (!m) continue;
        const fr = clamp((t.levels[stat] || 0) / m, 0, 1);
        if (fr < 1) full = false;
        const py = y + 24.4 + row * 2.7;
        b.tTop.add(x, py, 0, 17, 2.3, c.fx.whiteSolid, 0.05, 0.06, 0.08, 0.7);
        if (fr > 0) {
          const w = 16 * fr;
          const gold = fr >= 1;
          b.tTop.add(x - 8 + w / 2, py, 0, w, 1.5, c.fx.whiteSolid, gold ? 1 : pc[0], gold ? 0.85 : pc[1], gold ? 0.25 : pc[2], 1);
        }
        row++;
      }
      void full; void shown;
    }
    void TURRET_SIZE; void wpp;
  }
}

// ------------------------------------------------------------------------------------------------
const HP_W = 15;

export function drawAttackers(R: Res, f: Frame): void {
  const { b, c } = R;
  const holes = f.holes;
  for (const a of f.state.attackers) {
    const type = (((a.type | 0) % 9) + 9) % 9;
    const cell = c.att[type];
    let scale = 1, rot = a.angle || 0, r = 1, g = 1, bl = 1;
    const x = a.x, y = a.y;
    if (a.blackholed) {
      let best = 1e9, rad = 120;
      for (const h of holes) { const d = Math.hypot(h.x - x, h.y - y); if (d < best) { best = d; rad = h.radius || 120; } }
      scale = best < 1e9 ? clamp(best / rad * 1.2, 0.18, 1) : 0.6;
      rot += f.t * 11 + a.id;
      r = 0.65; g = 0.45; bl = 1;
    } else {
      b.attSh.add(x + 1.8, y + 2.6, rot, 32, 32, cell, 0, 0, 0, 0.3);
    }
    if (a.poisoned) {
      r *= 0.55; g *= 1; bl *= 0.5;
      b.attGlow.add(x, y, 0, 34, 34, c.fx.glow, 0.3, 1, 0.2, 0.42 + 0.12 * Math.sin(f.t * 6 + a.id));
    }
    const s = 32 * scale;
    b.att.add(x, y, rot, s, s, cell, r, g, bl, 1);
    // HP bar (always screen-up, drawn above the unit)
    const fr = clamp(a.maxHp > 0 ? a.hp / a.maxHp : 0, 0, 1);
    const by = y - 13.2 * (0.4 + 0.6 * scale);
    b.attTop.add(x, by, 0, HP_W + 1.4, 3.2, c.fx.whiteSolid, 0.03, 0.03, 0.04, 0.72);
    if (fr > 0) {
      const w = HP_W * fr;
      b.attTop.add(x - HP_W / 2 + w / 2, by, 0, w, 2, c.fx.whiteSolid, fr > 0.5 ? (1 - fr) * 2 : 1, fr > 0.5 ? 1 : fr * 2, 0.15, 1);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// kind -> look. body: tint of the rocket sprite, flame: exhaust tint, smoke: trail tint
interface RocketLook { size: number; body: RGB; flame: RGB; smoke: RGB; smokeSize: number; glow: [number, number, number, number] | null }
const ROCKETS: Record<string, RocketLook> = {
  rocket:       { size: 18, body: [1, 0.4, 0.32], flame: [1, 0.6, 0.2], smoke: [0.78, 0.76, 0.74], smokeSize: 7, glow: null },
  nuke:         { size: 34, body: [1, 0.86, 0.35], flame: [1, 0.7, 0.3], smoke: [0.5, 0.46, 0.42], smokeSize: 14, glow: [1, 0.55, 0.15, 60] },
  poisonRocket: { size: 18, body: [0.5, 1, 0.4], flame: [0.5, 1, 0.35], smoke: [0.45, 0.95, 0.35], smokeSize: 8, glow: [0.4, 1, 0.3, 22] },
  laserRocket:  { size: 18, body: [0.35, 1, 0.75], flame: [0.4, 1, 0.8], smoke: [0.6, 0.95, 0.85], smokeSize: 7, glow: [0.3, 1, 0.7, 22] },
  napalmRocket: { size: 19, body: [1, 0.55, 0.12], flame: [1, 0.45, 0.08], smoke: [0.3, 0.26, 0.24], smokeSize: 9, glow: [1, 0.45, 0.1, 24] },
  tazerRocket:  { size: 18, body: [1, 0.92, 0.3], flame: [1, 0.95, 0.4], smoke: [1, 0.95, 0.6], smokeSize: 7, glow: [1, 0.9, 0.3, 24] },
};

export function drawProjectiles(R: Res, f: Frame): void {
  const { b, c, particles } = R;
  const t = f.t;
  const seen = R.trailSeen; // id -> {x,y}; entries not touched this frame are dropped
  const stamp = f.frame;
  for (const p of f.state.projectiles) {
    const x = p.x, y = p.y, ang = p.angle || 0;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const rk = ROCKETS[p.kind];
    if (rk) {
      // smoke trail: puffs every few units travelled
      let tr = seen.get(p.id);
      if (!tr) { tr = { x, y, s: stamp }; seen.set(p.id, tr); }
      tr.s = stamp;
      const dist = Math.hypot(x - tr.x, y - tr.y);
      if (f.dtMs > 0) {
        const step = rk.smokeSize * 0.55;
        if (dist >= step) {
          const n = Math.min(4, Math.floor(dist / step));
          for (let i = 1; i <= n; i++) {
            const k = i / n;
            particles.spawn(0, tr.x + (x - tr.x) * k - cs * 4, tr.y + (y - tr.y) * k - sn * 4, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 650 + Math.random() * 250,
              rk.smokeSize * 0.5, rk.smokeSize * 1.5, rk.smoke[0], rk.smoke[1], rk.smoke[2], 0.55, 1.5);
          }
          tr.x = x; tr.y = y;
        }
      } else { tr.x = x; tr.y = y; }
      // exhaust flame + body
      const fl = 0.8 + 0.3 * Math.sin(t * 40 + p.id * 3) + Math.random() * 0.1;
      const k = rk.size / 18;
      b.projAdd.add(x - cs * 8 * k, y - sn * 8 * k, ang - Math.PI / 2, 6.5 * k * fl, 14 * k * fl, c.fx.flame, rk.flame[0], rk.flame[1], rk.flame[2], 0.95);
      if (rk.glow) b.projAdd.add(x, y, 0, rk.glow[3] * (0.9 + 0.1 * Math.sin(t * 9 + p.id)), rk.glow[3] * (0.9 + 0.1 * Math.sin(t * 9 + p.id)), c.fx.glow, rk.glow[0], rk.glow[1], rk.glow[2], 0.4);
      b.proj.add(x, y, ang, rk.size, rk.size, c.fx.rocket, rk.body[0], rk.body[1], rk.body[2], 1);
      if (p.kind === 'tazerRocket' && Math.random() < 0.5) {
        b.projAdd.add(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, 0, 5, 5, c.fx.spark, 1, 1, 0.7, 0.9);
      }
      if (p.kind === 'nuke') { // radiation shimmer ring
        b.ringAdd.add(x, y, 11 + 2 * Math.sin(t * 12), 1.6, 0, 0.5, 0, 1, 0.8, 0.3, 0.55);
      }
      continue;
    }
    switch (p.kind) {
      case 'shell':
        b.projAdd.add(x - cs * 2.5, y - sn * 2.5, ang, 10, 3.6, c.fx.spark, 0.65, 0.85, 1, 0.8);
        b.projAdd.add(x, y, 0, 4.4, 4.4, c.fx.spark, 1, 1, 1, 1);
        break;
      case 'bfg': {
        const pu = 1 + 0.08 * Math.sin(t * 14 + p.id);
        b.projAdd.add(x, y, 0, 70 * pu, 70 * pu, c.fx.glow, 0.25, 1, 0.35, 0.5);
        b.projAdd.add(x, y, t * 4.5, 32 * pu, 32 * pu, c.fx.swirl, 0.5, 1, 0.6, 0.95);
        b.projAdd.add(x, y, -t * 6.5, 22 * pu, 22 * pu, c.fx.swirl, 0.8, 1, 0.85, 0.85);
        b.projAdd.add(x, y, 0, 16 * pu, 16 * pu, c.fx.spark, 0.9, 1, 0.9, 1);
        b.ringAdd.add(x, y, 13 * pu, 2, 0, 0.7, 0, 0.4, 1, 0.5, 0.7);
        // crackling arcs
        for (let i = 0; i < 3; i++) {
          const a0 = hash2(p.id, Math.floor(t * 24) * 3 + i) * TAU, l = 12 + hash2(i, Math.floor(t * 24)) * 14;
          b.projAdd.line(x + Math.cos(a0) * 9, y + Math.sin(a0) * 9, x + Math.cos(a0 + 0.35) * l, y + Math.sin(a0 + 0.35) * l, 1.5, c.fx.beam, 0.7, 1, 0.8, 0.9);
        }
        if (f.dtMs > 0 && Math.random() < f.dtMs * 0.03) particles.spawn(1, x, y, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 500, 6, 1, 0.5, 1, 0.6, 0.8, 1);
        break; }
      case 'clusterBomb':
        b.proj.add(x, y, ang, 15, 15, c.fx.bomb, 1, 1, 1, 1);
        b.projAdd.add(x - cs * 6, y - sn * 6, 0, 8, 8, c.fx.spark, 1, 0.7, 0.3, 0.7);
        break;
      case 'cluster':
        b.projAdd.add(x, y, 0, 15, 15, c.fx.glow, 1, 0.55, 0.15, 0.5);
        b.projAdd.add(x, y, 0, 6, 6, c.fx.spark, 1, 0.85, 0.5, 1);
        break;
      case 'mine': {
        b.proj.add(x, y, ang, 15, 15, c.fx.mine, 1, 1, 1, 1);
        // travelling: steady dim disc; armed (placed): blinking light
        const armed = p.armed === true;
        const on = armed && Math.sin(t * 7 + p.id * 1.7) > 0.55;
        b.projAdd.add(x, y, 0, 11, 11, c.fx.glow, 1, 0.15, 0.1, armed ? (on ? 0.95 : 0.2) : 0.3);
        break; }
      default:
        b.projAdd.add(x, y, 0, 6, 6, c.fx.spark, 1, 1, 1, 1);
    }
  }
  // forget trails of projectiles that vanished
  if (seen.size > f.state.projectiles.length + 16) for (const [id, tr] of seen) if (tr.s !== stamp) seen.delete(id);
}

