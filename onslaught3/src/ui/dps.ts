// Damage per second per turret, measured by the UI from turret.damageDealt (no simulation state).
// One sample per turret per second of game time; DPS is the damage over the last DPS_WINDOW ms of game time.
import type { TurretState } from '../types.ts';

export const DPS_WINDOW = 10000; // ms of game time
const SAMPLE_EVERY = 1000;       // ms of game time between samples
const MAX_SAMPLES = DPS_WINDOW / SAMPLE_EVERY + 1;

/** [game time, damageDealt] pairs, oldest first. */
type Samples = [number, number][];

export class DpsTracker {
  owner: unknown = null;
  next = 0;
  samples = new Map<number, Samples>();

  /** Take a sample if a second of game time has passed. `owner` (the game object) resets the tracker when it changes. */
  sample(owner: unknown, time: number, turrets: readonly TurretState[]): void {
    if (owner !== this.owner || time < this.next - SAMPLE_EVERY) { this.owner = owner; this.samples.clear(); this.next = 0; }
    if (time < this.next) return;
    this.next = time + SAMPLE_EVERY;
    const seen = new Set<number>();
    for (const t of turrets) {
      seen.add(t.id);
      let list = this.samples.get(t.id);
      if (!list) { list = []; this.samples.set(t.id, list); }
      list.push([time, t.damageDealt || 0]);
      if (list.length > MAX_SAMPLES) list.shift();
    }
    for (const id of this.samples.keys()) if (!seen.has(id)) this.samples.delete(id);
  }

  /** DPS of a turret over up to the last DPS_WINDOW ms, or null while less than one second has been measured. */
  dps(t: TurretState, time: number): number | null {
    const list = this.samples.get(t.id);
    if (!list || !list.length) return null;
    const [t0, d0] = list[0];
    const span = time - t0;
    if (span < SAMPLE_EVERY) return null;
    return Math.max(0, ((t.damageDealt || 0) - d0) / span) * 1000;
  }
}
