// Daily challenge: everyone gets the same map, difficulty and random seed on the same UTC day. Pure (tested in Node):
// the game itself stays deterministic through game.rng, so the same seed and the same moves give the same game.
import { MAPS } from '../data/maps.ts';

export interface Daily { key: string; seed: number; mapId: string; difficulty: 'easy' | 'medium' | 'hard' }

/** 32-bit FNV-1a hash of a string. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const DAILY_MAPS = MAPS.filter((m) => m.id !== 'tutorial').map((m) => m.id);
const DAILY_DIFFS: Daily['difficulty'][] = ['easy', 'medium', 'medium', 'hard'];

/** The challenge of a UTC day (key "YYYY-MM-DD"). */
export function dailyFor(date: Date): Daily {
  const key = date.toISOString().slice(0, 10);
  const seed = hash32('os3-daily-' + key);
  return { key, seed, mapId: DAILY_MAPS[seed % DAILY_MAPS.length], difficulty: DAILY_DIFFS[(seed >>> 11) % DAILY_DIFFS.length] };
}
