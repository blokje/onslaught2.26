// Stat ladders and the effective-stat formula.
//   effective = (ladder value + sum of flat adds) * max(0.2, 1 + sum of multiplier bonuses)
// Freak-out ADDS its multipliers to the sums (damage +3, rate +4), like the original.
import { TURRETS, MODIFIER_RANGE, FREAKOUT } from '../data/turrets.ts';

export const STATS = ['damage', 'range', 'rate'];

/** Maximum upgrade level per stat for a turret kind (modifiers only have one range upgrade). */
export function maxLevels(kind) {
  const d = TURRETS[kind];
  if (d.category === 'modifier') return { damage: 0, range: 1, rate: 0 };
  return {
    damage: d.ladders.damage.length,
    range: d.ladders.range.length,
    rate: d.ladders.rate.length,
  };
}

/** Raw (pre-modifier) stat value at a level; level 0 = base. */
export function ladderValue(kind, stat, level) {
  const d = TURRETS[kind];
  if (level <= 0) return d.base[stat];
  return d.ladders[stat][level - 1].value;
}

/** Cost of the next upgrade for a stat or null when maxed / not upgradable. */
export function nextUpgradeCost(kind, stat, level) {
  const d = TURRETS[kind];
  if (d.category === 'modifier') {
    return stat === 'range' && level < 1 ? MODIFIER_RANGE.upgradeCost : null;
  }
  const lad = d.ladders[stat];
  return level < lad.length ? lad[level].cost : null;
}

/** Modifier aura radius at a range level (base, or upgraded from level 1). */
export function modRangeAt(level) {
  return level >= 1 ? MODIFIER_RANGE.upgraded : MODIFIER_RANGE.base;
}

/** A fresh, all-zero modifier bonus sum for addMod. */
export function emptyMods() {
  return { damageAdd: 0, rangeAdd: 0, rateAdd: 0, damageMult: 0, rangeMult: 0, rateMult: 0 };
}

/** Adds one modifier's bonuses into a running sum (mutates sum). */
export function addMod(sum, mod) {
  if (mod.damageAdd) sum.damageAdd += mod.damageAdd;
  if (mod.rangeAdd) sum.rangeAdd += mod.rangeAdd;
  if (mod.rateAdd) sum.rateAdd += mod.rateAdd;
  if (mod.damageMult) sum.damageMult += mod.damageMult;
  if (mod.rangeMult) sum.rangeMult += mod.rangeMult;
  if (mod.rateMult) sum.rateMult += mod.rateMult;
}

const mult = (sum) => Math.max(0.2, 1 + sum);

/**
 * Effective stats for a turret given the summed modifier bonuses affecting it.
 * Support turrets (Targeter, Combo-only) and modifiers pass `mods = null` and get raw values.
 * @returns {{damage:number, range:number, rate:number, damageMult:number}}
 */
export function computeStats(t, mods) {
  const d = TURRETS[t.kind];
  if (d.category === 'modifier') {
    return { damage: 0, range: modRangeAt(t.levels.range), rate: 0, damageMult: 1 };
  }
  const raw = {
    damage: ladderValue(t.kind, 'damage', t.levels.damage),
    range: ladderValue(t.kind, 'range', t.levels.range),
    rate: ladderValue(t.kind, 'rate', t.levels.rate),
  };
  if (!mods || d.category !== 'weapon') return { ...raw, damageMult: 1 };
  let dm = mods.damageMult, rm = mods.rateMult;
  if (t.freak === 'on') {
    dm += FREAKOUT.damageMult;
    rm += FREAKOUT.rateMult;
  }
  const dMul = mult(dm);
  return {
    damage: (raw.damage + mods.damageAdd) * dMul,
    range: (raw.range + mods.rangeAdd) * mult(mods.rangeMult),
    rate: (raw.rate + mods.rateAdd) * mult(rm),
    damageMult: dMul,
  };
}
