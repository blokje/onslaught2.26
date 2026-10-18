// Polyline road: length, position/angle at a distance, distance to the road, road sample points.
import type { Point } from '../types.ts';

/** Anything Path.place can write a position onto (attackers, or a scratch object). `_seg` is the segment cursor. */
export interface Placeable { x: number; y: number; angle: number; _seg: number }
/** A road sample point: position and distance along the road. */
export interface RoadSample { x: number; y: number; d: number }

const CORNER_BLEND = 20; // a sideways offset turns with the road over this distance either side of a waypoint
                         // (at most half of each neighbouring segment)

function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

/** Angle from a to b at fraction t, along the shortest arc. */
function blendAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

export class Path {
  points: Point[];
  cum: number[];
  segLen: number[];
  segAngle: number[];
  length: number;
  blend: number[];
  _samples: RoadSample[] | null;

  /** @param points waypoints [[x,y],...] */
  constructor(points: Point[]) {
    this.points = points.map((p): Point => [p[0], p[1]]);
    this.cum = [0];
    this.segLen = [];
    this.segAngle = [];
    for (let i = 0; i < this.points.length - 1; i++) {
      const dx = this.points[i + 1][0] - this.points[i][0];
      const dy = this.points[i + 1][1] - this.points[i][1];
      const l = Math.hypot(dx, dy);
      this.segLen.push(l);
      this.segAngle.push(Math.atan2(dy, dx));
      this.cum.push(this.cum[i] + l);
    }
    this.length = this.cum[this.cum.length - 1];
    // blend[v]: corner blend distance at waypoint v (0 at the two ends)
    this.blend = this.points.map((_, v) => (v === 0 || v === this.points.length - 1) ? 0
      : Math.min(CORNER_BLEND, this.segLen[v - 1] / 2, this.segLen[v] / 2));
    this._samples = null;
  }

  /**
   * Writes x, y, angle for distance d along the path onto object o.
   * o._seg is used as a cursor so repeated calls for a moving object are O(1).
   * `lateral` shifts the point that far to the left of the travel direction (negative = right).
   */
  place<T extends Placeable>(o: T, d: number, lateral = 0): T {
    const last = this.segLen.length - 1;
    let i = o._seg | 0;
    if (i > last) i = last;
    while (i < last && d > this.cum[i + 1]) i++;
    while (i > 0 && d < this.cum[i]) i--;
    o._seg = i;
    const l = this.segLen[i];
    let f = l > 0 ? (d - this.cum[i]) / l : 0;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    const a = this.points[i], b = this.points[i + 1];
    o.x = a[0] + (b[0] - a[0]) * f;
    o.y = a[1] + (b[1] - a[1]) * f;
    o.angle = this.segAngle[i];
    if (lateral !== 0) {
      // normal angle: this segment's, blended with the neighbour's near a waypoint (bisector at the waypoint)
      let ang = this.segAngle[i];
      const into = d - this.cum[i], left = this.cum[i + 1] - d;
      const b0 = this.blend[i], b1 = this.blend[i + 1];
      if (into < b0) {
        ang = blendAngle(this.segAngle[i - 1], ang, 0.5 + 0.5 * Math.max(0, into) / b0);
      } else if (left < b1) {
        ang = blendAngle(ang, this.segAngle[i + 1], 0.5 - 0.5 * Math.max(0, left) / b1);
      }
      o.x += Math.sin(ang) * lateral;
      o.y -= Math.cos(ang) * lateral;
    }
    return o;
  }

  at(d: number): Placeable {
    return this.place({ x: 0, y: 0, angle: 0, _seg: 0 }, Math.max(0, Math.min(this.length, d)));
  }

  /** Distance from a point to the road centreline. */
  distanceTo(x: number, y: number): number {
    let best = Infinity;
    for (let i = 0; i < this.segLen.length; i++) {
      const a = this.points[i], b = this.points[i + 1];
      const d = distToSegmentSq(x, y, a[0], a[1], b[0], b[1]);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Road sample points every `step` units: [{x, y, d}], cached for the default step. */
  samples(step = 4): RoadSample[] {
    if (step === 4 && this._samples) return this._samples;
    const out: RoadSample[] = [];
    for (let d = 0; d < this.length; d += step) {
      const p = this.at(d);
      out.push({ x: p.x, y: p.y, d });
    }
    const e = this.at(this.length);
    out.push({ x: e.x, y: e.y, d: this.length });
    if (step === 4) this._samples = out;
    return out;
  }
}
