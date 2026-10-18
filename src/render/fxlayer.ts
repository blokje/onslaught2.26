// Beams, effects and UI overlays. Rebuilt every frame from game.state / overlay settings.

import { TURRETS, MODIFIER_RANGE, COMBO_RANGE } from '../data/turrets.ts';
import { BLAST_RADIUS } from '../data/combos.ts';
import type { BlastSize } from '../types.ts';
import { DIRECTIONAL } from '../data/rules.ts';
import { KIND_INDEX, MOD_TINT } from './atlas.ts';
import { clamp, hash2, fmtCompact, TAU } from './util.ts';
import { rgb, rangeOf, turretColor } from './entities.ts';
import type { RGB } from './util.ts';
import type { Cell, SpriteBatch } from './batches.ts';
import type { Effect, TurretState } from '../types.ts';
import type { Res, Frame } from './context.ts';

const easeOut = (u: number, p: number = 3): number => 1 - Math.pow(1 - u, p);

// ------------------------------------------------------------------------------------------------ beams
export function drawBeams(R: Res, f: Frame): void {
  const { b, c } = R;
  const L = b.beams, beamCell = c.fx.beam, glow = c.fx.glow;
  let idx = 0;
  const tick = Math.floor(f.t * 26);
  for (const bm of f.state.beams) {
    idx++;
    const x1 = bm.x1, y1 = bm.y1, x2 = bm.x2, y2 = bm.y2;
    const u = clamp(bm.ttl > 0 ? bm.age / bm.ttl : 1, 0, 1), a = 1 - u;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    switch (bm.kind) {
      case 'laser':
        L.line(x1, y1, x2, y2, 9, beamCell, 0.2, 1, 0.4, 0.5 * a);
        L.line(x1, y1, x2, y2, 2.6, beamCell, 0.85, 1, 0.9, a);
        L.add(x2, y2, 0, 12, 12, glow, 0.4, 1, 0.55, 0.8 * a);
        L.add(x1, y1, 0, 9, 9, glow, 0.4, 1, 0.55, 0.6 * a);
        break;
      case 'chain': {
        const fl = 0.75 + 0.25 * Math.sin(f.t * 50 + idx);
        L.line(x1, y1, x2, y2, 5, beamCell, 0.25, 1, 0.45, 0.28 * a * fl);
        L.line(x1, y1, x2, y2, 1.7, beamCell, 0.6, 1, 0.7, 0.85 * a * fl);
        break; }
      case 'spark': {
        const n = clamp(Math.round(len / 9), 3, 18);
        const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
        let px = x1, py = y1;
        for (let i = 1; i <= n; i++) {
          const k = i / n;
          const taper = Math.sin(k * Math.PI);
          const off = i === n ? 0 : (hash2(idx * 131 + i, tick) - 0.5) * 2 * Math.min(9, 3 + len * 0.05) * taper;
          const qx = x1 + (x2 - x1) * k + nx * off, qy = y1 + (y2 - y1) * k + ny * off;
          L.line(px, py, qx, qy, 5.5, beamCell, 1, 0.85, 0.25, 0.35 * a);
          L.line(px, py, qx, qy, 1.7, beamCell, 1, 0.97, 0.7, a);
          if (hash2(idx + i * 7, tick + 5) < 0.12) { // small side branch
            const bx = qx + nx * (hash2(i, tick) - 0.5) * 16, by = qy + ny * (hash2(i + 3, tick) - 0.5) * 16;
            L.line(qx, qy, bx, by, 1.1, beamCell, 1, 0.95, 0.6, 0.8 * a);
          }
          px = qx; py = qy;
        }
        L.add(x2, y2, 0, 11, 11, glow, 1, 0.9, 0.35, 0.8 * a);
        break; }
      case 'fusion': {
        const pu = 1 + 0.18 * Math.sin(f.t * 45 + idx);
        L.line(x1, y1, x2, y2, 14 * pu, beamCell, 1, 0.45, 0.08, 0.5 * Math.min(1, a * 1.5));
        L.line(x1, y1, x2, y2, 6 * pu, beamCell, 1, 0.75, 0.25, 0.9 * Math.min(1, a * 1.5));
        L.line(x1, y1, x2, y2, 2.4, beamCell, 1, 0.97, 0.8, Math.min(1, a * 1.5));
        L.add(x2, y2, f.t * 3, 22 * pu, 22 * pu, c.fx.star, 1, 0.7, 0.25, 0.8 * a);
        L.add(x2, y2, 0, 26, 26, glow, 1, 0.5, 0.1, 0.6 * a);
        L.add(x1, y1, 0, 14, 14, glow, 1, 0.6, 0.15, 0.7 * a);
        break; }
      case 'rail':
        L.line(x1, y1, x2, y2, 13, beamCell, 0.35, 0.85, 1, 0.55 * Math.sqrt(a));
        L.line(x1, y1, x2, y2, 3.4, beamCell, 0.92, 1, 1, Math.pow(a, 1.5));
        L.line(x1, y1, x2, y2, 24, beamCell, 0.2, 0.6, 1, 0.12 * Math.sqrt(a));
        L.add(x1, y1, 0, 22, 22, glow, 0.6, 0.95, 1, 0.8 * a);
        break;
      case 'sniper':
        L.line(x1, y1, x2, y2, 5, beamCell, 0.7, 0.85, 1, 0.3 * a);
        L.line(x1, y1, x2, y2, 1.6, beamCell, 1, 1, 1, Math.pow(a, 1.3));
        L.add(x2, y2, 0, 9, 9, glow, 0.9, 0.95, 1, 0.7 * a);
        break;
      default:
        L.line(x1, y1, x2, y2, 2, beamCell, 1, 1, 1, a);
    }
  }
}

// ------------------------------------------------------------------------------------------------ effects
function blastRadius(e: Effect): number {
  return e.radius > 0 ? e.radius : (BLAST_RADIUS[e.data && e.data.size as BlastSize] || 40);
}

export function drawEffects(R: Res, f: Frame): void {
  const { b, c, particles } = R;
  const t = f.t;
  const seen = R.fxSeen, stamp = f.frame;
  const text = R.text;
  for (const e of f.state.effects) {
    const u = clamp(e.duration > 0 ? e.age / e.duration : 1, 0, 1), a = 1 - u;
    const x = e.x, y = e.y;
    const first = !seen.has(e.id);
    seen.set(e.id, stamp);
    switch (e.kind) {
      case 'blast': {
        const r0 = blastRadius(e);
        const big = r0 > 70;
        b.blastAdd.add(x, y, 0, r0 * 2.1 * (0.5 + 0.7 * easeOut(u)), r0 * 2.1 * (0.5 + 0.7 * easeOut(u)), c.fx.glow, 1, 0.72, 0.3, 0.9 * Math.pow(a, 1.6));
        const cs = r0 * 1.25 * (1 - u * 0.6);
        b.blastAdd.add(x, y, 0, cs, cs, c.fx.glow, 1, 0.96, 0.82, Math.pow(a, 3));
        if (u < 0.28) b.blastAdd.add(x, y, u * 3, r0 * 1.9, r0 * 1.9, c.fx.star, 1, 0.9, 0.6, (1 - u / 0.28) * 0.8);
        b.ringAdd.add(x, y, r0 * easeOut(u, 2.6), Math.max(1.5, r0 * 0.16 * a), 0, 0.65, 0, 1, 0.62, 0.22, 0.9 * Math.pow(a, 1.3));
        if (big) b.ringAdd.add(x, y, r0 * 0.8 * easeOut(u, 3.4), Math.max(1, r0 * 0.07 * a), 0, 0.4, 0, 1, 0.95, 0.75, 0.7 * a);
        if (u > 0.12) { // dark smoke bloom
          const ss = r0 * (1.2 + 0.7 * u);
          b.smoke.add(x, y, u, ss, ss, c.fx.puff, 0.22, 0.19, 0.17, 0.4 * Math.min(1, (u - 0.12) * 5) * a);
        }
        if (first) { // debris + smoke puffs
          const n = clamp(Math.round(r0 / 3.5), 8, 44);
          for (let i = 0; i < n; i++) {
            const ang = Math.random() * TAU, sp = 40 + Math.random() * r0 * 2.2;
            particles.spawn(1, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 320 + Math.random() * 450, 4 + r0 * 0.05, 0.8, 1, 0.65 + Math.random() * 0.3, 0.25, 0.9, 2.6);
          }
          for (let i = 0; i < 5; i++) {
            const ang = Math.random() * TAU, sp = 6 + Math.random() * r0 * 0.5;
            particles.spawn(0, x + Math.cos(ang) * r0 * 0.2, y + Math.sin(ang) * r0 * 0.2, Math.cos(ang) * sp, Math.sin(ang) * sp, 800 + Math.random() * 500, r0 * 0.45, r0 * 1.05, 0.3, 0.27, 0.24, 0.45, 1.2);
          }
        }
        break; }
      case 'poisonCloud': {
        const r0 = e.radius > 0 ? e.radius : BLAST_RADIUS.poison;
        const fade = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.22);
        b.groundRing.add(x, y, r0 * 0.96, 2, 0.1 * fade, 0.5, 0, 0.35, 0.9, 0.25, 0.9);
        const n = 14;
        for (let i = 0; i < n; i++) {
          const h1 = hash2(e.id, i), h2 = hash2(e.id + 17, i), h3 = hash2(e.id + 91, i);
          const ang = h1 * TAU + t * (0.12 + h3 * 0.25) * (h2 < 0.5 ? 1 : -1), d = Math.sqrt(h2) * r0 * 0.72;
          const s = r0 * (0.55 + 0.5 * h3) * (0.95 + 0.06 * Math.sin(t * 1.6 + i));
          b.groundFx.add(x + Math.cos(ang) * d, y + Math.sin(ang) * d, t * 0.2 * (h1 - 0.5) + i, s, s, c.fx.puff, 0.42 + 0.1 * h3, 0.9, 0.28, 0.2 * fade);
        }
        break; }
      case 'blackHole': {
        const r0 = e.radius > 0 ? e.radius : 120;
        const g = easeOut(Math.min(1, u / 0.12), 2) * Math.min(1, (1 - u) / 0.15);
        const core = 24 * g;
        b.groundRing.add(x, y, r0, 1.6, 0.05 * g, 0.5, 26, 0.6, 0.35, 1, 0.45 * g);
        b.groundFx.add(x, y, 0, core * 4.5, core * 4.5, c.fx.glow, 0.05, 0.0, 0.1, 0.8 * g);
        b.groundFxAdd.add(x, y, t * 2.8, r0 * 0.95 * g, r0 * 0.95 * g, c.fx.swirl, 0.55, 0.35, 1, 0.32 * g);
        b.groundFxAdd.add(x, y, -t * 4.2, r0 * 0.5 * g, r0 * 0.5 * g, c.fx.swirl, 1, 0.65, 0.3, 0.45 * g);
        b.groundFx.add(x, y, 0, core * 2.3, core * 2.3, c.fx.glow, 0, 0, 0, 1);
        b.ringAdd.add(x, y, core * 1.05, 3.4 * g + 0.5, 0, 0.8, 0, 1, 0.65, 0.25, 0.9 * g);
        b.ringAdd.add(x, y, core * 1.55, 2, 0, 0.9, 0, 0.7, 0.4, 1, 0.55 * g);
        break; }
      case 'napalm': {
        const pts = e.data && e.data.points;
        if (!pts) break;
        const fade = Math.min(1, u / 0.08) * Math.min(1, (1 - u) / 0.3);
        const step = pts.length > 60 ? Math.ceil(pts.length / 60) : 1;
        for (let i = 0; i < pts.length; i += step) {
          const p = pts[i], h = hash2(e.id, i);
          b.groundFx.add(p[0], p[1], 0, 22, 22, c.fx.glow, 0.12, 0.06, 0.03, 0.5 * fade);
          for (let k = 0; k < 3; k++) {
            const fl = 1 + 0.3 * Math.sin(t * (8 + h * 5) + i * 1.7 + k * 2.1);
            const s = (11 + 8 * hash2(i, e.id + k)) * fl * fade;
            b.groundFxAdd.add(p[0] + (hash2(i + k, 5) - 0.5) * 10, p[1] + (hash2(i, 9 + k) - 0.5) * 8 - s * 0.3, (Math.sin(t * 6 + i + k) * 0.14), s * 1.05, s * 1.25, c.fx.flame, 1, 0.55 + 0.3 * h, 0.15, 0.85);
          }
          b.groundFxAdd.add(p[0], p[1], 0, 20, 20, c.fx.glow, 1, 0.4, 0.05, 0.3 * fade);
        }
        break; }
      case 'shockwave': {
        const r0 = e.radius > 0 ? e.radius : 200;
        const r = r0 * easeOut(u, 2);
        b.ringAdd.add(x, y, r, 3 + 11 * a, 0.05 * a, 0.7, 0, 0.7, 0.92, 1, 0.8 * a);
        b.ringAdd.add(x, y, r * 0.92, 2 + 4 * a, 0, 0.8, 0, 1, 1, 1, 0.5 * a);
        break; }
      case 'cash': {
        const amount = e.data && e.data.amount != null ? e.data.amount : 0;
        const ent = text.get('+$' + fmtCompact(amount), 30);
        if (!ent) break;
        const al = u < 0.65 ? 1 : (1 - u) / 0.35;
        const pop = 1 + 0.35 * Math.max(0, 1 - u * 9);
        const hgt = 0.29 * ent.ph * pop * f.textScale;
        b.text.add(x, y - 6 - easeOut(u, 2) * 24, 0, hgt * ent.aspect, hgt, ent, 0.8, 1, 0.45, al);
        break; }
      case 'comboName': {
        const name = e.data && e.data.name ? String(e.data.name) : '';
        if (!name) break;
        const ent = text.get(name, 44);
        if (!ent) break;
        const al = u < 0.7 ? 1 : (1 - u) / 0.3;
        const pop = 1 + 0.5 * Math.max(0, 1 - u * 7);
        const hgt = 0.3 * ent.ph * pop * f.textScale;
        const ty = y - 22 - easeOut(u, 2) * 26;
        b.blastAdd.add(x, ty, 0, hgt * ent.aspect * 1.1, hgt * 2.2, c.fx.glow, 1, 0.8, 0.3, 0.35 * al);
        b.text.add(x, ty, 0, hgt * ent.aspect, hgt, ent, 1, 0.9, 0.5, al);
        break; }
      case 'freakWarn': {
        const tt = e.data && f.turretById.get(e.data.turretId);
        const cx = tt ? tt.x : x, cy = tt ? tt.y : y;
        const fade = Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.1);
        for (let k = 0; k < 2; k++) {
          const ph = (u * 3 + k * 0.5) % 1;
          b.ringAdd.add(cx, cy, 20 + 22 * ph, 2.4, 0, 0.55, 0, 1, 0.2, 0.12, 0.8 * (1 - ph) * fade);
        }
        break; }
      default: break;
    }
  }
  if (seen.size > f.state.effects.length + 32) for (const [id, s] of seen) if (s !== stamp) seen.delete(id);
}

// ------------------------------------------------------------------------------------------------ overlays
/** Half-angle (radians) of a turret's firing cone, or 0 when it fires all around. */
function coneHalf(tr: TurretState): number {
  const d = tr.directional;
  if (!d || d.mode === 'normal' || !DIRECTIONAL[d.mode]) return 0;
  return (DIRECTIONAL[d.mode] / 2) * (Math.PI / 180);
}

/** Where a weapon acquires targets from: itself, or the Targeter joined to it (as in weapons.js origin()). */
function coneOrigin(tr: TurretState, turrets: TurretState[]): { x: number; y: number; r: number } {
  for (const g of turrets) if (g.joinedTo === tr.id) return { x: g.x, y: g.y, r: rangeOf(g) };
  return { x: tr.x, y: tr.y, r: rangeOf(tr) };
}

/**
 * Firing cone as a ground wedge: two edges, the arc along the range and a dashed centre aim line.
 * Drawn with normal blending (additive washes out on the light terrain). Edges start just outside the
 * turret base so they do not cross it. Angles are world radians (y down), as in targeting.js inCone.
 * detail: degrees per arc segment (coarser for the R "all ranges" view to stay inside the batch).
 * outline: dark under-stroke for contrast (selected turret).
 */
function drawCone(L: SpriteBatch, cell: Cell, px: (n: number) => number, ox: number, oy: number, range: number, angle: number, half: number, col: RGB, alpha: number, detail: number, outline: boolean): void {
  if (range <= 0 || half <= 0) return;
  const a0 = angle - half, a1 = angle + half;
  const r0 = Math.min(20, range * 0.5);
  const n = Math.max(2, Math.min(60, Math.ceil((2 * half) / (detail * Math.PI / 180))));
  const passes: [number, RGB, number][] = outline
    ? [[px(4.2), [0.04, 0.08, 0.12], alpha * 0.45], [px(2), col, alpha]]
    : [[px(1.5), col, alpha]];
  for (const [w, [r, g, bl], a] of passes) {
    for (const e of [a0, a1]) {
      const ca = Math.cos(e), sa = Math.sin(e);
      L.line(ox + ca * r0, oy + sa * r0, ox + ca * range, oy + sa * range, w, cell, r, g, bl, a);
    }
    let qx = ox + Math.cos(a0) * range, qy = oy + Math.sin(a0) * range;
    for (let i = 1; i <= n; i++) {
      const an = a0 + (a1 - a0) * (i / n);
      const x = ox + Math.cos(an) * range, y = oy + Math.sin(an) * range;
      L.line(qx, qy, x, y, w, cell, r, g, bl, a);
      qx = x; qy = y;
    }
  }
  // dashed centre line: shows where the cone is aimed
  const dash = Math.max(px(6), range / 14), ca = Math.cos(angle), sa = Math.sin(angle);
  for (let d = r0; d < range - dash * 0.5; d += dash * 2) {
    const e = Math.min(d + dash, range);
    L.line(ox + ca * d, oy + sa * d, ox + ca * e, oy + sa * e, px(1.3), cell, col[0], col[1], col[2], alpha * 0.6);
  }
}

export function drawOverlay(R: Res, f: Frame): void {
  const { b, c } = R;
  const o = R.overlay, wpp = f.wpp, t = f.t;
  const px = (n: number): number => n * wpp; // screen pixels -> world units
  const st = f.state, byId = f.turretById;

  // faint range rings for everything
  if (o.showRanges === 'all') {
    for (const tr of st.turrets) {
      const r = rangeOf(tr);
      if (r <= 0) continue;
      const col = turretColor(tr);
      const half = coneHalf(tr);
      if (half > 0) {
        const og = coneOrigin(tr, st.turrets);
        drawCone(b.groundFx, c.fx.whiteSolid, px, og.x, og.y, og.r, tr.directional.angle, half, col, 0.5, 8, false);
      } else {
        b.ringUnder.add(tr.x, tr.y, r, px(1), 0.025, 0, 0, col[0], col[1], col[2], 0.3);
      }
    }
  }

  // aim tick on every weapon that has a firing cone, so restricted turrets stand out unselected.
  // Overlays run after effects, so if groundFx is full only these cone strokes are dropped.
  for (const tr of st.turrets) {
    const half = coneHalf(tr);
    if (half <= 0) continue;
    const ca = Math.cos(tr.directional.angle), sa = Math.sin(tr.directional.angle);
    b.groundFx.line(tr.x + ca * 21, tr.y + sa * 21, tr.x + ca * 35, tr.y + sa * 35, px(4.6), c.fx.whiteSolid, 0.05, 0.05, 0.05, 0.5);
    b.groundFx.line(tr.x + ca * 21, tr.y + sa * 21, tr.x + ca * 35, tr.y + sa * 35, px(2.6), c.fx.whiteSolid, 1, 0.78, 0.3, 1);
  }

  // focus fire: pulsing red reticle that follows the focused attacker (screen-constant size)
  if (st.focusId != null) {
    let fa = null;
    for (const a of st.attackers) if (a.id === st.focusId) { fa = a; break; }
    if (fa && !fa.dead) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      const R0 = px(15 + 3 * pulse), spin = t * 1.2;
      b.ringTop.add(fa.x, fa.y, R0, px(2), 0, 0.15, 0, 1, 0.12, 0.1, 0.95);
      b.ringTop.add(fa.x, fa.y, px(8), px(1.2), 0, 0.1, 0, 1, 0.3, 0.2, 0.6 + 0.3 * pulse);
      for (let k = 0; k < 4; k++) { // four crosshair ticks, slowly rotating
        const an = spin + k * Math.PI / 2, ca = Math.cos(an), sa = Math.sin(an);
        const r1 = px(10), r2 = px(24 + 2 * pulse);
        b.ovAdd.line(fa.x + ca * r1, fa.y + sa * r1, fa.x + ca * r2, fa.y + sa * r2, px(2.4), c.fx.beam, 1, 0.15, 0.1, 0.95);
      }
      b.ovAdd.add(fa.x, fa.y, 0, px(46), px(46), c.fx.glow, 1, 0.1, 0.05, 0.28 + 0.18 * pulse);
    }
  }

  // joined Targeters and the selected turret's Green links
  for (const tr of st.turrets) {
    if (tr.joinedTo != null) {
      const o2 = byId.get(tr.joinedTo);
      if (o2) b.ovAdd.line(tr.x, tr.y, o2.x, o2.y, px(1.4), c.fx.beam, 1, 0.65, 0.25, 0.45);
    }
  }
  const sel = o.selectedId != null ? byId.get(o.selectedId) : null;
  if (sel && sel.links) for (const id of sel.links) { const o2 = byId.get(id); if (o2) b.ovAdd.line(sel.x, sel.y, o2.x, o2.y, px(1.6), c.fx.beam, 0.4, 1, 0.55, 0.5); }

  // hover highlight
  const hov = o.hoverId != null && o.hoverId !== o.selectedId ? byId.get(o.hoverId) : null;
  if (hov) {
    b.ringTop.add(hov.x, hov.y, 25.5, px(2.2), 0.07, 0.15, 0, 1, 1, 1, 0.8);
    const r = rangeOf(hov);
    const half = coneHalf(hov);
    if (r > 0 && o.showRanges !== 'all') {
      if (half > 0) {
        const og = coneOrigin(hov, st.turrets);
        drawCone(b.groundFx, c.fx.whiteSolid, px, og.x, og.y, og.r, hov.directional.angle, half, [1, 1, 1], 0.5, 8, false);
      } else {
        b.ringUnder.add(hov.x, hov.y, r, px(1), 0.03, 0, 0, 1, 1, 1, 0.3);
      }
    }
  }

  // selected turret: range ring + marching highlight
  if (sel) {
    const r = rangeOf(sel);
    const isMod = TURRETS[sel.kind] && TURRETS[sel.kind].category === 'modifier';
    const col: RGB = isMod ? rgb(MOD_TINT[sel.kind] || '#ffffff') : [0.7, 0.95, 1];
    const half = coneHalf(sel);
    if (r > 0 && half > 0) {
      // cone: the full ring stays as a faint reference, the wedge is what actually fires
      const og = coneOrigin(sel, st.turrets);
      b.ringUnder.add(og.x, og.y, og.r, px(1.2), 0.02, 0, 0, col[0], col[1], col[2], 0.22);
      drawCone(b.groundFx, c.fx.whiteSolid, px, og.x, og.y, og.r, sel.directional.angle, half, col, 0.95, 4, true);
    } else if (r > 0) {
      b.ringUnder.add(sel.x, sel.y, r, px(2.2), 0.08, 0.35, 0, col[0], col[1], col[2], 0.28);
      b.ringUnder.add(sel.x, sel.y, r, px(1.4), 0, 0, 0, col[0], col[1], col[2], 0.95);
    }
    b.ringTop.add(sel.x, sel.y, 27.5, px(2.4), 0.05, 0.1, 16, 1, 0.9, 0.4, 0.95);
    b.ringTop.add(sel.x, sel.y, 25.4, px(1.2), 0, 0, 0, 1, 1, 0.8, 0.6 + 0.2 * Math.sin(t * 5));
  }

  // combo partners
  if (o.showCombo && sel && R.game && typeof R.game.comboPartners === 'function') {
    let ids: number[] = [];
    try { ids = R.game.comboPartners(sel.id) || []; } catch (_) { ids = []; }
    b.ringTop.add(sel.x, sel.y, COMBO_RANGE, px(1.6), 0.035, 0, 18, 1, 0.85, 0.3, 0.9);
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) continue;
      b.ovAdd.line(sel.x, sel.y, p.x, p.y, px(2.2), c.fx.beam, 1, 0.85, 0.3, 0.8);
      b.ovAdd.line(sel.x, sel.y, p.x, p.y, px(6), c.fx.beam, 1, 0.75, 0.2, 0.2);
      b.ringTop.add(p.x, p.y, 25.5, px(2), 0.06, 0.2, 0, 1, 0.85, 0.3, 0.9);
    }
  }

  // targeter join line to the cursor
  if (o.joinFromId != null) {
    const src = byId.get(o.joinFromId);
    if (src) {
      b.ringTop.add(src.x, src.y, 27.5, px(2.4), 0.05, 0.1, 16, 1, 0.65, 0.25, 0.95);
      if (R.cursor) {
        b.ovAdd.line(src.x, src.y, R.cursor.x, R.cursor.y, px(2.4), c.fx.beam, 1, 0.65, 0.25, 0.85);
        b.ovAdd.line(src.x, src.y, R.cursor.x, R.cursor.y, px(7), c.fx.beam, 1, 0.55, 0.15, 0.2);
        b.ringTop.add(R.cursor.x, R.cursor.y, px(9), px(2), 0.1, 0, 0, 1, 0.75, 0.35, 0.95);
      }
    }
  }

  // ghost (build / move preview)
  const gh = o.ghost;
  if (gh && TURRETS[gh.kind] && KIND_INDEX[gh.kind] !== undefined) {
    const def = TURRETS[gh.kind], idx = KIND_INDEX[gh.kind];
    const ok = !!gh.valid;
    const tint = ok ? [0.6, 1, 0.65] : [1, 0.42, 0.4];
    const col = ok ? [0.35, 1, 0.5] : [1, 0.3, 0.28];
    const isMod = def.category === 'modifier';
    const rng = isMod ? MODIFIER_RANGE.base : (def.base && def.base.range) || 0;
    if (rng > 0) {
      b.ringTop.add(gh.x, gh.y, rng, px(2), 0.1, 0.3, 0, col[0], col[1], col[2], 0.75);
    }
    b.ghostBase.add(gh.x, gh.y, 0, 64, 64, c.tb[idx], tint[0], tint[1], tint[2], 0.78);
    const rot = isMod ? t * 0.8 : 0;
    const gws = isMod ? 50 : 64;
    b.ghostWeap.add(gh.x, gh.y, rot, gws, gws, c.tw[idx], tint[0], tint[1], tint[2], 0.78);
    const gIcon = c.ti[gh.kind];
    if (isMod && gIcon) b.ghostIcon.add(gh.x, gh.y, 0, 32, 32, gIcon, tint[0], tint[1], tint[2], 0.9);
    b.ringTop.add(gh.x, gh.y, 22, px(2.4), 0, 0.15, 14, col[0], col[1], col[2], 0.95);
  }
}
