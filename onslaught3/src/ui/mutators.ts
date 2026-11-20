// [OS3] Names and descriptions of the mutators for the UI (tx() keys, translated where shown). Numbers: src/data/mutators.ts.
import { tx } from './i18n.ts';
import type { MutatorId } from '../types.ts';

export const MUTATOR_TEXT: Record<MutatorId, { name: string; desc: string }> = {
  fast: { name: tx('Fast'), desc: tx('Attackers move 50% faster.') },
  tough: { name: tx('Tough'), desc: tx('Attackers have 60% more HP.') },
  noSell: { name: tx('No selling'), desc: tx('Turrets cannot be sold.') },
  poor: { name: tx('Poor'), desc: tx('Half the starting cash, 15% less bounty.') },
};
