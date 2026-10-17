// Polyline road: length, position/angle at a distance, distance to the road, road sample points.

function distToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

export class Path {
  /** @param {number[][]} points waypoints [[x,y],...] */
  constructor(points) {
    this.points = points.map((p) => [p[0], p[1]]);
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
    this._samples = null;
  }

  /**
   * Writes x, y, angle for distance d along the path onto object o.
   * o._seg is used as a cursor so repeated calls for a moving object are O(1).
   */
  place(o, d) {
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
    return o;
  }

  /** @returns {{x:number,y:number,angle:number}} */
  at(d) {
    return this.place({ _seg: 0 }, Math.max(0, Math.min(this.length, d)));
  }

  /** Distance from a point to the road centreline. */
  distanceTo(x, y) {
    let best = Infinity;
    for (let i = 0; i < this.segLen.length; i++) {
      const a = this.points[i], b = this.points[i + 1];
      const d = distToSegmentSq(x, y, a[0], a[1], b[0], b[1]);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Road sample points every `step` units: [{x, y, d}], cached for the default step. */
  samples(step = 4) {
    if (step === 4 && this._samples) return this._samples;
    const out = [];
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
