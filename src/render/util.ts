// Small shared helpers for the renderer (no three.js dependency).

export type RGB = [number, number, number];

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const TAU = Math.PI * 2;

/** '#rrggbb' or 0xrrggbb -> [r, g, b] floats 0..1 (raw values, no colour management). */
export function hex(c: string | number): RGB {
  const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Deterministic seeded RNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap deterministic hash of two integers -> 0..1. */
export function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Compact number format for floating cash text: 950, 1.2K, 3.4M, 5.6B, 7.8T, then 1.2e15. */
export function fmtCompact(n: number): string {
  n = Math.round(n);
  if (!isFinite(n)) return '0';
  const neg = n < 0;
  n = Math.abs(n);
  let s: string;
  if (n < 1000) s = String(n);
  else if (n >= 1e15) s = n.toExponential(1).replace('e+', 'e');
  else {
    const units = ['K', 'M', 'B', 'T'];
    let i = 0;
    let v = n / 1000;
    while (v >= 999.95 && i < 3) { v /= 1000; i++; }
    s = (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '') + units[i];
  }
  return neg ? '-' + s : s;
}

export const COLORS = {
  blue: '#3b82f6',
  green: '#3ddc6a',
  red: '#ef4444',
  yellow: '#facc15',
};
