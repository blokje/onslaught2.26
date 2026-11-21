// [OS3] Names and descriptions of the enemy kinds for the UI, marked with tx() so they get translated where shown.
// The numbers live in src/data/enemies.ts; keep the texts in step with it.
import { tx } from './i18n.ts';
import type { EnemyKind } from '../types.ts';

export const ENEMY_TEXT: Record<EnemyKind, { name: string; blurb: string }> = {
  normal: { name: tx('Runner'), blurb: tx('The standard attacker.') },
  armored: { name: tx('Armored'), blurb: tx('Each hit loses a fixed chunk to the armour, so many small hits do little. Rockets, Sniper and Railgun do 40% more.') },
  shielded: { name: tx('Shielded'), blurb: tx('A shield takes the first hits. Tazer sparks do triple damage to it, lasers and Fusion 50% more.') },
  swarm: { name: tx('Swarmer'), blurb: tx('Small, fast and in pairs. Splash damage and chains clear them.') },
  splitter: { name: tx('Splitter'), blurb: tx('Breaks into two Swarmers when destroyed. Keep turrets further down the road.') },
  regen: { name: tx('Regenerator'), blurb: tx('Heals 4% of its HP per second, but not while a Tazer slows it.') },
  boss: { name: tx('Boss'), blurb: tx('Every 10th wave: slow, huge and armoured, worth a lot.') },
};
