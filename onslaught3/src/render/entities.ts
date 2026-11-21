// Per-frame drawing of turrets, attackers and projectiles into the shared batches.
// Everything is rebuilt each frame from game.state (cheap: a few hundred instances).

import { TURRETS, TURRET_SIZE } from '../data/turrets.ts';
import { KIND_INDEX, KIND_TINT, COMBO_COLOR, ATTACKER_COLORS } from './atlas.ts';
import { clamp, hex, hash2, TAU } from './util.ts';
import type { RGB } from './util.ts';
import type { TurretState } from '../types.ts';
import { ENEMIES } from '../data/enemies.ts';
import type { Res, Frame } from './context.ts';

const rgbCache = new Map<string, RGB>();
export function rgb(c: string): RGB {
  let v = rgbCache.get(c);
  if (!v) { v = hex(c); rgbCache.set(c, v); }
  return v;
}

const PIP_STATS: ['damage' | 'range' | 'rate', RGB][] = [['damage', [1, 0.45, 0.25]], ['range', [0.35, 0.85, 1]], ['rate', [0.7, 1, 0.35]]];

// Upgrade ring: outer edge stays inside TURRET_SIZE / 2 so neighbours at the minimum spacing never overlap.
const RING_W = 3;                                // tick band width
const RING_R = TURRET_SIZE / 2 - 0.5 - RING_W / 2; // tick band centre
const RING_ACC_W = 1;                            // inner stat-colour arc
const RING_ACC_R = RING_R - RING_W / 2 - 0.4 - RING_ACC_W / 2;
const RING_GAP = 1.8;                            // gap between stat segments (world units of arc)
const RING_MIN_TICK_PX = 2.5;                    // narrower ticks merge into a solid arc
// colour-symbol badge: drawn size of the 32-unit icon cell (shape about 9 units) and its offset below the centre
const SYMBOL_SIZE = 15;
const SYMBOL_DY = 14;

// [OS3] 3D view shapes (world units). The upgrade ring lies on top of the plinth (Renderer lifts tRing to PLINTH_H).
export const PLINTH_H = 5;
const PLINTH_R = TURRET_SIZE / 2 - 0.5;
const GUNMETAL: RGB = [0.3, 0.32, 0.36];
/** Barrel per weapon kind: length, width, height. */
const BARREL: Record<string, [number, number, number]> = {
  blue: [16, 6, 6], green: [18, 3.5, 3.5], red: [12, 12, 7], yellow: [10, 4, 4],
  targeter: [8, 8, 5], sniper: [28, 3, 3], fusion: [14, 7, 7], railgun: [30, 5, 4],
};

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
  const calm = R.opts.reduceMotion; // accessibility: no blinking, jitter or pulsing
  for (const t of f.state.turrets) {
    const idx = KIND_INDEX[t.kind];
    if (idx === undefined) continue;
    const def = TURRETS[t.kind];
    const isMod = def.category === 'modifier';
    const col = turretColor(t);
    const seed = t.id * 0.731;
    const x = t.x, y = t.y;

    // tilted view: a soft drop shadow below and in front of the turret, so it reads as standing on the field
    const m3 = R.opts.view3d ? R.m : null;
    if (m3) b.tShadow.add(x + 6, y + 7, 0, 66, 56, c.fx.glow, 0, 0, 0, 0.5);
    else if (R.opts.tilted) b.tShadow.add(x + 2, y + 7, 0, 54, 40, c.fx.glow, 0, 0, 0, 0.55);

    // halo when a combo is possible
    if (t.comboCapable) {
      const a = calm ? 0.3 : 0.26 + 0.1 * Math.sin(t0 * 2.2 + seed);
      b.tGlow.add(x, y, 0, 74, 74, c.fx.glow, col[0], col[1], col[2], a);
    }

    // base plate (tinted red and flashing during the freak-out warning)
    let br = 1, bg = 1, bb = 1;
    if (t.freak === 'warn') { const fl = calm ? 0.6 : 0.5 + 0.5 * Math.sin(t0 * 16); bg = bb = 1 - 0.55 * fl; }
    if (m3) m3.cyl.add(x, y, 0, 0, PLINTH_R, PLINTH_R, PLINTH_H, 0.24 * br, 0.26 * bg, 0.3 * bb);
    else b.tBase.add(x, y, 0, 64, 64, c.tb[idx], br, bg, bb, 1);

    // weapon
    let rot = t.angle || 0;
    if (isMod) rot = t0 * (t.kind === 'rateUp' || t.kind === 'rateUpEx' ? 1.6 : 0.7) + seed;
    else if (t.kind === 'comboOnly') rot = t0 * 0.4 + seed;
    let wr = 1, wg = 1, wb = 1;
    if (t.kind === 'comboOnly') { wr = col[0]; wg = col[1]; wb = col[2]; }
    if (t.freak === 'warn') { const fl = calm ? 0.6 : 0.5 + 0.5 * Math.sin(t0 * 16); wg = wb = 1 - 0.45 * fl; }
    let jx = 0, jy = 0;
    if (t.freak === 'on' && calm) { // steady glow instead of jitter and shimmer
      b.tGlow.add(x, y, 0, 92, 92, c.fx.glow, 1, 0.45, 0.1, 0.38);
    } else if (t.freak === 'on') { // heat jitter + shimmer copies + glow
      jx = (Math.random() - 0.5) * 1.3; jy = (Math.random() - 0.5) * 1.3;
      const fl = 0.8 + 0.2 * Math.random();
      b.tGlow.add(x, y, 0, 92, 92, c.fx.glow, 1, 0.45, 0.1, 0.42 * fl);
      for (let k = 0; k < 2 && !m3; k++) {
        b.tWeapAdd.add(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3 - 1, rot, isMod ? 50 : 64, isMod ? 50 : 64, c.tw[idx], 1, 0.5, 0.15, 0.22);
      }
      if (f.dtMs > 0 && Math.random() < f.dtMs * 0.012) {
        R.particles.spawn(1, x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, -26 - Math.random() * 18, 700, 5, 1, 1, 0.55, 0.15, 0.55, 0);
      }
    }
    const ws = isMod ? 50 : 64; // modifier dishes are drawn smaller so the icon on top stays readable
    const icon = c.ti[t.kind];
    if (m3) {
      const k0 = PLINTH_H, kx = x + jx, ky = y + jy;
      const tr = col[0] * wr, tg = col[1] * wg, tb = col[2] * wb;
      if (isMod) {
        m3.oct.add(kx, ky, k0, rot, 14, 14, 5, tr * 0.9, tg * 0.9, tb * 0.9);
        m3.tor.add(kx, ky, k0 + 5.5, rot, 11, 11, 3, tr, tg, tb);
        if (icon) b.tIcon.addAt(x, y, k0 + 5.3, 0, 0, 0, 30, 30, icon, 1, 1, 1, 1);
      } else if (t.kind === 'comboOnly') {
        m3.cyl.add(kx, ky, k0, 0, 7, 7, 5, 0.35, 0.37, 0.42);
        m3.sph.add(kx, ky, k0 + 13, rot, 9, 9, 9, tr, tg, tb);
        m3.tor.add(kx, ky, k0 + 13, rot, 13, 13, 4, tr * 0.8, tg * 0.8, tb * 0.8);
      } else {
        const bar = BARREL[t.kind] || [14, 5, 5];
        m3.cyl.add(kx, ky, k0, 0, 11, 11, 8, tr * 0.75, tg * 0.75, tb * 0.75);
        m3.sph.add(kx, ky, k0 + 10, rot, 8.5, 8.5, 7, tr, tg, tb);
        const d = bar[0] / 2 + 3;
        m3.box.add(kx + Math.cos(rot) * d, ky + Math.sin(rot) * d, k0 + 9.5 - bar[2] / 2 + 1, rot, bar[0], bar[1], bar[2], GUNMETAL[0] * wr, GUNMETAL[1] * wg, GUNMETAL[2] * wb);
        if (t.kind === 'yellow') m3.tor.add(kx, ky, k0 + 10, 0, 10, 10, 4, 1, 0.9, 0.35);
      }
    } else {
      b.tWeap.add(x + jx, y + jy, rot, ws, ws, c.tw[idx], wr, wg, wb, 1);
      if (isMod && icon) b.tIcon.add(x, y, 0, 32, 32, icon, wr, wg, wb, 1);
    }
    // colour-symbol badge (accessibility): the combo colour as a shape, low on the base, inside the upgrade ring
    if (R.overlay.colorSymbols !== false && t.comboColor) {
      const sym = c.sym[t.comboColor];
      if (sym) { const sc = rgb(COMBO_COLOR[t.comboColor]); b.tIcon.addAt(x, y + SYMBOL_DY, m3 ? PLINTH_H + 0.3 : 0, 0, 0, 0, SYMBOL_SIZE, SYMBOL_SIZE, sym, sc[0], sc[1], sc[2], 1); }
    }

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

    // upgrade ring: one segment per upgradable stat (clockwise from the top: damage, range, rate),
    // one tick per level, yellow while the stat is below max, green at max
    if (t.levels && t.maxLevels) {
      let n = 0;
      for (const [stat] of PIP_STATS) if (t.maxLevels[stat] > 0) n++;
      const gap = n > 1 ? RING_GAP / (TAU * RING_R) : 0;
      const sweep = 1 / n - gap;
      let i = 0;
      for (const [stat, pc] of PIP_STATS) {
        const m = t.maxLevels[stat];
        if (!m) continue;
        const start = -0.25 + i / n + gap / 2;
        const fr = clamp((t.levels[stat] || 0) / m, 0, 1);
        const ticks = (sweep * TAU * RING_R) / m / wpp >= RING_MIN_TICK_PX ? m : 0;
        b.tRing.arc(x, y, RING_R, RING_W, start, sweep, ticks, 1, 0.12, 0.14, 0.17, 0.85);
        if (fr >= 1) b.tRing.arc(x, y, RING_R, RING_W, start, sweep, ticks, 1, 0.55, 0.88, 0.3, 1);
        else b.tRing.arc(x, y, RING_R, RING_W, start, sweep, ticks, fr, 1, 0.78, 0.2, 1);
        b.tRing.arc(x, y, RING_ACC_R, RING_ACC_W, start, sweep, 0, 1, pc[0], pc[1], pc[2], 0.9);
        i++;
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
const HP_W = 15;

export function drawAttackers(R: Res, f: Frame): void {
  const { b, c } = R;
  const holes = f.holes;
  const m3 = R.opts.view3d ? R.m : null;
  const calm = R.opts.reduceMotion;
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
    } else if (!m3) {
      b.attSh.add(x + 1.8, y + 2.6, rot, 32, 32, cell, 0, 0, 0, 0.3);
    }
    if (a.poisoned) {
      r *= 0.55; g *= 1; bl *= 0.5;
      b.attGlow.add(x, y, 0, 34, 34, c.fx.glow, 0.3, 1, 0.2, 0.42 + 0.12 * Math.sin(f.t * 6 + a.id));
    }
    // [OS3] enemy kinds: size, and a cue per kind that also works without colour (ring style, bars)
    const kd = a.kind ? ENEMIES[a.kind] : null;
    const ks = kd ? kd.size : 1;
    if (kd && !a.blackholed) {
      const rr = 13 * ks;
      if (a.kind === 'armored' || a.kind === 'boss') b.groundRing.add(x, y, rr, 2.6, 0, 0.2, a.kind === 'boss' ? 0 : 6, a.kind === 'boss' ? 0.9 : 0.62, a.kind === 'boss' ? 0.18 : 0.64, a.kind === 'boss' ? 0.15 : 0.7, 0.95);
      if (a.kind === 'boss') b.attGlow.add(x, y, 0, 70, 70, c.fx.glow, 1, 0.2, 0.1, R.opts.reduceMotion ? 0.35 : 0.3 + 0.12 * Math.sin(f.t * 3 + a.id));
      if (a.shield && a.shield > 0) b.ringAdd.add(x, y, rr + 2.5, 1.6, 0.08, 0.6, 0, 0.35, 0.85, 1, 0.45 + 0.4 * Math.min(1, a.shield / Math.max(1, a.maxHp * (kd.shield || 1))));
      if (a.kind === 'regen' && a.hp < a.maxHp && !a.poisoned) b.attGlow.add(x, y, 0, 30, 30, c.fx.glow, 0.3, 1, 0.45, R.opts.reduceMotion ? 0.35 : 0.25 + 0.2 * Math.sin(f.t * 5 + a.id));
      if (a.kind === 'splitter') b.groundRing.add(x, y, rr, 1.4, 0, 0.3, 4, 1, 0.75, 0.3, 0.85);
    }
    const s = 32 * scale * ks;
    // HP bar (always screen-up, drawn above the unit); a boss gets a longer one, a shield a cyan bar above it.
    // 2D: offsets in world y; 3D: billboarded above the body (bx, by, bz are the bar centre, oy shifts it up the screen)
    let bx = x, by = y - 13.2 * (0.4 + 0.6 * scale) * ks, bz = 0;
    if (m3) {
      const col = rgb(ATTACKER_COLORS[type]);
      const cr = col[0] * r, cg = col[1] * g, cb = col[2] * bl;
      const rad = 7 * scale * ks;
      const hop = calm || a.blackholed ? 0 : Math.abs(Math.sin(f.t * 9 + a.id * 1.3)) * 1.6;
      b.attSh.add(x + 3, y + 3, 0, rad * 3, rad * 2.6, c.fx.glow, 0, 0, 0, 0.45);
      const z = rad + hop;
      switch (a.kind) {
        case 'armored': m3.oct.add(x, y, hop, rot, rad * 1.15, rad * 1.15, rad * 1.4, cr * 0.6 + 0.2, cg * 0.6 + 0.2, cb * 0.6 + 0.22); m3.box.add(x, y, hop + rad * 1.4, rot, rad * 1.2, rad * 0.9, rad * 0.35, cr, cg, cb); break;
        case 'swarm': m3.tet.add(x, y, z, rot + f.t * (calm ? 0 : 3), rad * 1.2, rad * 1.2, rad * 1.2, cr, cg, cb); break;
        case 'splitter': {
          const px = -Math.sin(rot) * rad * 0.55, py = Math.cos(rot) * rad * 0.55;
          m3.sph.add(x + px, y + py, z, rot, rad * 0.75, rad * 0.75, rad * 0.75, cr, cg, cb);
          m3.sph.add(x - px, y - py, z, rot, rad * 0.75, rad * 0.75, rad * 0.75, cr * 0.8 + 0.2, cg * 0.8 + 0.15, cb * 0.8);
          break; }
        case 'boss': m3.dod.add(x, y, z, rot, rad, rad, rad, cr * 0.6 + 0.4, cg * 0.5, cb * 0.5); break;
        default: m3.sph.add(x, y, z, rot, rad * 1.2, rad, rad, cr, cg, cb);
      }
      if (a.kind === 'regen') m3.tor.add(x, y, z, f.t * (calm ? 0 : 1.5), rad * 1.4, rad * 1.4, rad * 1.2, 0.35, 1, 0.5);
      if (a.shield && a.shield > 0) m3.shell.add(x, y, z, 0, rad * 1.6, rad * 1.6, rad * 1.6, 0.35, 0.85, 1);
      bx = x; by = y; bz = z + rad + 7 + (a.kind === 'armored' ? rad * 0.4 : 0);
    } else {
      b.att.add(x, y, rot, s, s, cell, r, g, bl, 1);
    }
    const bar = (ox: number, oy: number, w: number, h: number, cr: number, cg: number, cb: number, ca: number): void => {
      if (m3) b.attTop.addAt(bx, by, bz, ox, oy, 0, w, h, c.fx.whiteSolid, cr, cg, cb, ca);
      else b.attTop.add(bx + ox, by + oy, 0, w, h, c.fx.whiteSolid, cr, cg, cb, ca);
    };
    const fr = clamp(a.maxHp > 0 ? a.hp / a.maxHp : 0, 0, 1);
    const hw = HP_W * (ks > 1.4 ? 2 : 1);
    bar(0, 0, hw + 1.4, 3.2, 0.03, 0.03, 0.04, 0.72);
    if (fr > 0) {
      const w = hw * fr;
      bar(-hw / 2 + w / 2, 0, w, 2, fr > 0.5 ? (1 - fr) * 2 : 1, fr > 0.5 ? 1 : fr * 2, 0.15, 1);
    }
    if (kd && kd.shield && a.shield && a.shield > 0) {
      const sw = hw * clamp(a.shield / (a.maxHp * kd.shield), 0, 1);
      bar(-hw / 2 + sw / 2, -3, sw, 1.6, 0.35, 0.85, 1, 1);
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

