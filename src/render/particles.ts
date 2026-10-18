// Renderer-owned particle pool (smoke trails, sparks, debris). Not part of game state.
// kind 0: smoke puff (normal blend, grows and fades)   kind 1: additive spark (shrinks and fades)

import type { SpriteBatch, Cell } from './batches.ts';

const STRIDE = 14; // x y vx vy age life s0 s1 r g b a kind drag

export class Particles {
  cap: number;
  n: number;
  d: Float32Array;
  constructor(capacity: number = 2600) {
    this.cap = capacity;
    this.n = 0;
    this.d = new Float32Array(capacity * STRIDE);
  }
  clear(): void { this.n = 0; }
  spawn(kind: number, x: number, y: number, vx: number, vy: number, lifeMs: number, s0: number, s1: number, r: number, g: number, b: number, a: number, drag: number = 0): void {
    if (this.n >= this.cap) return;
    const d = this.d; let o = this.n++ * STRIDE;
    d[o++] = x; d[o++] = y; d[o++] = vx; d[o++] = vy; d[o++] = 0; d[o++] = lifeMs; d[o++] = s0; d[o++] = s1;
    d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a; d[o++] = kind; d[o] = drag;
  }
  /** Advance by dtMs (game time) and draw into the two sprite batches. */
  update(dtMs: number, smokeBatch: SpriteBatch, sparkBatch: SpriteBatch, puffCell: Cell, sparkCell: Cell): void {
    const d = this.d, dt = dtMs / 1000;
    for (let i = 0; i < this.n; i++) {
      let o = i * STRIDE;
      d[o + 4] += dtMs;
      if (d[o + 4] >= d[o + 5]) { // dead: swap with last
        const last = --this.n;
        if (i !== last) d.copyWithin(o, last * STRIDE, last * STRIDE + STRIDE);
        i--; continue;
      }
      const drag = Math.exp(-d[o + 13] * dt);
      d[o + 2] *= drag; d[o + 3] *= drag;
      d[o] += d[o + 2] * dt; d[o + 1] += d[o + 3] * dt;
      const u = d[o + 4] / d[o + 5];
      const size = d[o + 6] + (d[o + 7] - d[o + 6]) * u;
      if (d[o + 12] === 0) {
        const a = d[o + 11] * Math.min(1, u * 8) * (1 - u) * (1 - u);
        smokeBatch.add(d[o], d[o + 1], u * 2 + o * 0.01, size, size, puffCell, d[o + 8], d[o + 9], d[o + 10], a);
      } else {
        const a = d[o + 11] * (1 - u);
        sparkBatch.add(d[o], d[o + 1], 0, size, size, sparkCell, d[o + 8], d[o + 9], d[o + 10], a);
      }
    }
  }
}
