// Small seedable PRNG (mulberry32). Whole state is one int32, so it serialises trivially.
export class RNG {
  s: number;

  constructor(seed: number) {
    this.s = (seed | 0) || 0x9e3779b9;
  }
  /** Float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
