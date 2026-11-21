// OnSlaught 3 enemy kinds [OS3] (SPEC.md section 11). Multipliers apply to the wave's normal attacker (waveHp, waveBounty,
// base speed). Weakness multipliers are by the source turret's weapon (TURRETS[kind].weapon); combos count as their lead.
import type { EnemyKind } from '../types.ts';

export interface EnemyDef {
  name: string;
  hp: number; speed: number; bounty: number;
  /** Flat damage taken off every hit, as a fraction of the attacker's max HP (a hit keeps at least 25%). */
  armor?: number;
  /** Extra shield HP (fraction of max HP) that is used up before HP; `shieldVs` multiplies damage to the shield. */
  shield?: number;
  shieldVs?: Record<string, number>;
  /** Damage multiplier by weapon before armor. */
  weakTo?: Record<string, number>;
  /** HP regained per second as a fraction of max HP, unless poisoned. */
  regen?: number;
  /** On death: this many children of `splitInto`, each with `splitHp` of the max HP and `splitBounty` of the bounty. */
  split?: number; splitInto?: EnemyKind; splitHp?: number; splitBounty?: number;
  /** Drawn size relative to a normal attacker. */
  size: number;
  blurb: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  normal: { name: 'Runner', hp: 1, speed: 1, bounty: 1, size: 1, blurb: 'The standard attacker.' },
  armored: { name: 'Armored', hp: 1.1, speed: 0.85, bounty: 1.3, armor: 0.03, weakTo: { rocket: 1.4, sniper: 1.4, rail: 1.4 }, size: 1.1,
    blurb: 'Each hit loses a fixed chunk to the armour, so many small hits do little. Rockets, Sniper and Railgun do 40% more.' },
  shielded: { name: 'Shielded', hp: 0.8, speed: 1, bounty: 1.3, shield: 0.6, shieldVs: { spark: 3, laser: 1.5, fusion: 1.5 }, size: 1,
    blurb: 'A shield takes the first hits. Tazer sparks do triple damage to it, lasers and Fusion 50% more.' },
  swarm: { name: 'Swarmer', hp: 0.35, speed: 1.3, bounty: 0.45, size: 0.7, blurb: 'Small, fast and in pairs. Splash damage and chains clear them.' },
  splitter: { name: 'Splitter', hp: 0.8, speed: 0.95, bounty: 0.8, split: 2, splitInto: 'swarm', splitHp: 0.3, splitBounty: 0.3, size: 1.05,
    blurb: 'Breaks into two Swarmers when destroyed. Keep turrets further down the road.' },
  regen: { name: 'Regenerator', hp: 1, speed: 1, bounty: 1.2, regen: 0.04, size: 1,
    blurb: 'Heals 4% of its HP per second, but not while a Tazer slows it.' },
  boss: { name: 'Boss', hp: 10, speed: 0.7, bounty: 12, armor: 0.015, weakTo: { rocket: 1.2, sniper: 1.4, rail: 1.4 }, size: 1.8,
    blurb: 'Every 10th wave: slow, huge and armoured, worth a lot.' },
};

/** Kinds that rotate in from wave 5 (one per wave, a second one from wave 15). */
export const ENEMY_ROTATION: EnemyKind[] = ['armored', 'swarm', 'shielded', 'regen', 'splitter'];
