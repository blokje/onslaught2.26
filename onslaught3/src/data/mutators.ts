// OnSlaught 3 mutators [OS3] (SPEC.md 11.4): rules picked before a game starts, stackable. Each changes the game and
// multiplies the score, so harder games score more. Unknown ids are ignored.
import type { MutatorId } from '../types.ts';

export interface MutatorDef {
  /** Score multiplier (multiplied together when several are on). */
  score: number;
  hp?: number; speed?: number; bounty?: number; startCash?: number;
  noSell?: boolean;
}

export const MUTATORS: Record<MutatorId, MutatorDef> = {
  fast: { score: 1.1, speed: 1.5 },
  tough: { score: 1.3, hp: 1.6 },
  noSell: { score: 1.1, noSell: true },
  poor: { score: 1.15, startCash: 0.5, bounty: 0.85 },
};

export const MUTATOR_IDS = Object.keys(MUTATORS) as MutatorId[];

/** Known mutator ids only, each once, in table order. */
export function cleanMutators(v: unknown): MutatorId[] {
  return Array.isArray(v) ? MUTATOR_IDS.filter((id) => v.includes(id)) : [];
}

/** Combined effect of a set of mutators. */
export function mutatorEffect(ids: readonly MutatorId[]): Required<Omit<MutatorDef, 'noSell'>> & { noSell: boolean } {
  const out = { score: 1, hp: 1, speed: 1, bounty: 1, startCash: 1, noSell: false };
  for (const id of ids) {
    const m = MUTATORS[id];
    if (!m) continue;
    out.score *= m.score; out.hp *= m.hp ?? 1; out.speed *= m.speed ?? 1; out.bounty *= m.bounty ?? 1; out.startCash *= m.startCash ?? 1;
    out.noSell ||= !!m.noSell;
  }
  return out;
}
