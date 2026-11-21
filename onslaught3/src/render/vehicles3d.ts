// [OS3] 3D view: the nine attacker vehicles (the same designs as the 2D sprites in atlas.ts: drone, buggy, saucer,
// crawler, beetle, delta skiff, orb roller, truck, manta) built from the instanced unit shapes in meshes.ts, plus a cue
// per enemy kind on top (armour plate, shield shell, splitter seam, regenerator halo, boss spikes).
// Local coordinates as in the 2D art: lx forward, ly to the right of travel (world y down), lz up, world units at scale 1.

import type { Meshes, MeshBatch } from './meshes.ts';
import type { RGB } from './util.ts';

const DARK: RGB = [0.11, 0.12, 0.14];
const STEEL: RGB = [0.62, 0.65, 0.7];
const GLASS: RGB = [0.16, 0.3, 0.42];
const LAMP: RGB = [1, 0.9, 0.55];

/** Height of the top of each vehicle at scale 1 (HP bar and kind cues sit above it). */
export const VEHICLE_TOP = [9, 8, 9, 8, 7, 7, 13, 7.6, 7];
/** Vehicles that fly or hover: they bob instead of hopping. */
const FLYING = [true, false, true, false, false, true, false, false, true];

export interface VehicleArgs {
  type: number; kind: string | undefined;
  x: number; y: number; rot: number; s: number;
  /** extra height (hover bob), world units */
  lift: number;
  col: RGB; tint: RGB;
  t: number; calm: boolean; shield: boolean; id: number;
}

/** Draw one attacker; returns the height of its top (for the HP bar). */
export function drawVehicle(m: Meshes, a: VehicleArgs): number {
  const { x, y, rot, s, tint } = a;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const z0 = a.lift + (FLYING[a.type] ? (a.calm ? 0 : Math.sin(a.t * 3 + a.id) * 1.2) : 0);
  const c = a.col;
  const lit = (k: number): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  // one part: batch, local centre (lx, ly), base height lz, extra yaw, size (sx along lx, sy along ly, sz up), colour
  const P = (b: MeshBatch, lx: number, ly: number, lz: number, dr: number, sx: number, sy: number, sz: number, k: RGB): void => {
    b.add(x + (cs * lx - sn * ly) * s, y + (sn * lx + cs * ly) * s, z0 + lz * s, rot + dr, sx * s, sy * s, sz * s, k[0] * tint[0], k[1] * tint[1], k[2] * tint[2]);
  };
  const spin = a.calm ? 0 : a.t * 25;
  switch (a.type) {
    case 0: { // quad drone
      P(m.box, 0, 0, 6, Math.PI / 4, 19, 1.3, 0.9, DARK); P(m.box, 0, 0, 6, -Math.PI / 4, 19, 1.3, 0.9, DARK);
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) P(m.cyl, sx * 6.8, sy * 6.8, 6.9, spin, 3.7, 3.7, 0.35, [0.78, 0.88, 0.94]);
      P(m.box, 0, 0, 5.2, 0, 8.4, 7.6, 3, c); P(m.sph, 3.9, 0, 6.6, 0, 1.3, 1.3, 1.3, [0.5, 0.95, 1]);
      break; }
    case 1: { // buggy
      for (const [lx, ly] of [[5.4, -5.4], [5.4, 5.4], [-5.8, -5.4], [-5.8, 5.4]]) P(m.wheel, lx, ly, 2.3, 0, 2.3, 2.4, 2.3, DARK);
      P(m.box, 0, 0, 1.6, 0, 16.8, 8.4, 3.2, c); P(m.box, -0.2, 0, 4.8, 0, 6.4, 6, 2.6, lit(1.3)); P(m.box, 3.6, 0, 4.8, 0, 1, 5, 2.2, GLASS);
      P(m.sph, 8.3, -2.6, 3.4, 0, 0.9, 0.9, 0.9, LAMP); P(m.sph, 8.3, 2.6, 3.4, 0, 0.9, 0.9, 0.9, LAMP);
      break; }
    case 2: { // hover saucer
      P(m.sph, 0, 0, 5.5, 0, 8.6, 8.6, 2.4, c); P(m.tor, 0, 0, 5.5, spin * 0.1, 7.6, 7.6, 3, [1, 0.93, 0.68]);
      P(m.sph, 0, 0, 7, 0, 4.6, 4.6, 3.4, [0.92, 0.9, 1]); P(m.sph, 8.4, 0, 5.5, 0, 1.2, 1.2, 1.2, [1, 0.85, 0.42]);
      break; }
    case 3: { // tracked crawler
      P(m.box, 0, -5.4, 0.4, 0, 18.4, 4, 3.6, DARK); P(m.box, 0, 5.4, 0.4, 0, 18.4, 4, 3.6, DARK);
      P(m.box, 0, 0, 2.4, 0, 15.6, 8.4, 3.2, c); P(m.cyl, -1.6, 0, 5.6, 0, 3.8, 3.8, 2.2, lit(1.3));
      P(m.box, 5.4, 0, 6.2, 0, 8.4, 2, 1.6, [0.24, 0.25, 0.28]);
      break; }
    case 4: { // beetle
      for (const sy of [-1, 1]) for (const lx of [-4.2, 0, 4.2]) P(m.box, lx + 0.7, sy * 5.6, 0.2, sy * (lx < 0 ? 0.35 : lx > 1 ? -0.35 : 0), 1, 6.2, 1, [0.17, 0.11, 0.12]);
      P(m.sph, -0.8, 0, 4, 0, 8.4, 5.2, 3.8, c); P(m.box, -0.8, 0, 7.6, 0, 14, 0.5, 0.3, [0.1, 0.05, 0.06]);
      P(m.sph, 7.4, 0, 3.4, 0, 2.7, 2.6, 2.3, lit(0.7)); P(m.sph, 9.4, -1.2, 3.8, 0, 0.7, 0.7, 0.7, LAMP); P(m.sph, 9.4, 1.2, 3.8, 0, 0.7, 0.7, 0.7, LAMP);
      break; }
    case 5: { // delta skiff
      P(m.delta, 0, 0, 4, 0, 1, 1, 1.6, c); P(m.sph, 2.2, 0, 5.6, 0, 3.3, 1.7, 1.4, [0.72, 0.92, 1]);
      P(m.sph, -5.2, -1.9, 4.8, 0, 1, 1, 1, [1, 0.7, 0.28]); P(m.sph, -5.2, 1.9, 4.8, 0, 1, 1, 1, [1, 0.7, 0.28]);
      break; }
    case 6: { // orb roller
      P(m.sph, 0, 0, 6.4, 0, 6.4, 6.4, 6.4, c); P(m.tor, 0, 0, 6.4, a.calm ? 0 : a.t * 4, 6.5, 6.5, 2, [0.16, 0.09, 0.16]);
      P(m.sph, 5.6, 0, 7.6, 0, 1.3, 1.3, 1.3, [1, 0.95, 0.65]);
      break; }
    case 7: { // truck + trailer
      for (const [lx, ly] of [[-6.2, -5], [-6.2, 5], [-2.2, -5], [-2.2, 5], [6, -4.6], [6, 4.6]]) P(m.wheel, lx, ly, 1.9, 0, 1.9, 2, 1.9, DARK);
      P(m.box, -4.3, 0, 1.6, 0, 11.4, 9, 6, STEEL); P(m.box, 6, 0, 1.6, 0, 7.6, 8, 5, c); P(m.box, 9.5, 0, 3.8, 0, 0.8, 6, 2.2, GLASS);
      P(m.sph, 9.9, -2.6, 2.6, 0, 0.8, 0.8, 0.8, LAMP); P(m.sph, 9.9, 2.6, 2.6, 0, 0.8, 0.8, 0.8, LAMP);
      break; }
    default: { // 8: manta glider
      P(m.manta, 0, 0, 4.4, 0, 1, 1, 1.4, c); P(m.sph, 3.2, 0, 5.6, 0, 2.6, 1.3, 1, [0.05, 0.23, 0.29]);
      P(m.sph, -5.2, -9.4, 5, 0, 0.9, 0.9, 0.9, [0.72, 0.98, 1]); P(m.sph, -5.2, 9.4, 5, 0, 0.9, 0.9, 0.9, [0.72, 0.98, 1]);
    }
  }
  const top = VEHICLE_TOP[a.type] ?? 8;
  // enemy kind cues (shapes work without colour)
  switch (a.kind) {
    case 'armored': // steel plates on both flanks and the roof
      P(m.box, 0, -5.6, 1, 0, 14, 1.2, top * 0.7, STEEL); P(m.box, 0, 5.6, 1, 0, 14, 1.2, top * 0.7, STEEL);
      P(m.box, -1, 0, top, 0, 10, 9, 1, [0.5, 0.53, 0.58]);
      break;
    case 'splitter': // a bright seam across the middle: it breaks in two
      P(m.box, 0, 0, 0.5, 0, 1, 12, top, [1, 0.8, 0.35]);
      break;
    case 'regen':
      P(m.tor, 0, 0, top + 3, a.calm ? 0 : a.t * 1.5, 6, 6, 4, [0.35, 1, 0.5]);
      break;
    case 'boss': // a crown of red spikes
      for (let i = 0; i < 5; i++) { const an = i * Math.PI * 2 / 5; P(m.tet, Math.cos(an) * 4.5, Math.sin(an) * 4.5, top + 1.5, an, 2.2, 2.2, 2.2, [1, 0.22, 0.15]); }
      break;
  }
  if (a.shield) P(m.shell, 0, 0, top * 0.5, 0, 12, 12, top * 0.6 + 3, [0.35, 0.85, 1]);
  return z0 + (top + (a.kind === 'boss' ? 4 : a.kind === 'regen' ? 4 : a.kind === 'armored' ? 1 : 0)) * s;
}
