// Turret definitions. Numbers for the 4 basic turrets and 7 modifiers come from the original
// game (see SPEC.md). The 5 extra weapons are new designs for OnSlaught2.26.
//
// Ladders: each entry is [cost, newValue]. Level 0 = base stat; level n = ladder[n-1][1].
// rate is shots per minute (fire interval ms = 60000 / rate).

import type { KeyColor, LadderStep, TurretDef } from '../types.ts';

export const KEYS: KeyColor[] = ['blue', 'green', 'red', 'yellow'];

const L = (pairs: [number, number][]): LadderStep[] => pairs.map(([c, v]) => ({ cost: c, value: v }));

export const TURRETS: Record<string, TurretDef> = {
  blue: {
    name: 'Cannon', color: 'blue', category: 'weapon', cost: 10, hotkey: '1',
    base: { damage: 15, range: 130, rate: 100 },
    ladders: {
      damage: L([[20, 30], [50, 60], [100, 150], [250, 400], [600, 1200], [1000, 3100], [1100, 8500], [1200, 18400], [1500, 46000]]),
      range: L([[30, 140], [100, 150], [200, 165], [500, 180], [950, 220]]),
      rate: L([[50, 110], [150, 125], [300, 140], [450, 160], [950, 180], [1000, 200], [1450, 240]]),
    },
    weapon: 'shell', target: 'near', freakout: { damage: 4, rate: 4 },
    blurb: 'Fast shells, short range. Freaks out after 4 damage + 4 rate upgrades.',
  },
  green: {
    name: 'Laser', color: 'green', category: 'weapon', cost: 15, hotkey: '2',
    base: { damage: 25, range: 100, rate: 60 },
    ladders: {
      damage: L([[20, 50], [50, 120], [125, 400], [300, 1500], [700, 3900], [850, 9300], [950, 19500], [1000, 35000]]),
      range: L([[15, 110], [25, 125], [40, 140], [65, 160], [105, 180], [170, 205], [275, 230], [445, 255], [720, 285], [1100, 320]]),
      rate: L([[30, 65], [75, 70], [180, 80], [300, 90], [450, 105], [600, 120], [800, 135], [900, 160], [1000, 190]]),
    },
    weapon: 'laser', target: 'near', link: { mult: 1.25 },
    blurb: 'Piercing beam: leftover energy goes on through attackers in line. Lasers in range chain, each link adds x1.25.',
  },
  red: {
    name: 'Rocket', color: 'red', category: 'weapon', cost: 20, hotkey: '3',
    base: { damage: 50, range: 200, rate: 50 },
    ladders: {
      damage: L([[50, 120], [100, 350], [200, 800], [350, 1950], [650, 6050], [1200, 11500], [1300, 27000], [1500, 48900], [1500, 65000]]),
      range: L([[35, 210], [80, 220], [160, 230], [400, 250], [900, 275], [1100, 300], [1300, 325], [1500, 350]]),
      rate: L([[30, 60], [60, 70], [115, 85], [200, 100], [340, 115], [600, 135], [900, 155], [1050, 180], [1150, 210]]),
    },
    weapon: 'rocket', target: 'near', holding: { range: 3, rate: 3, max: 4 },
    blurb: 'Homing rockets, long range. Holding pattern after 3 range + 3 rate upgrades.',
  },
  yellow: {
    name: 'Tazer', color: 'yellow', category: 'weapon', cost: 50, hotkey: '4',
    base: { damage: 50, range: 70, rate: 60 },
    ladders: {
      damage: L([[40, 75], [80, 125], [190, 200], [300, 800], [600, 3500], [1000, 11000], [1100, 30000]]),
      range: L([[50, 75], [100, 85], [300, 105], [600, 130], [1000, 155]]),
      rate: L([[50, 70], [100, 80], [225, 90], [390, 100], [650, 120], [1100, 150], [1450, 180]]),
    },
    weapon: 'spark', target: 'fast', poisonMax: 10, freakout: { damage: 4, rate: 4 },
    blurb: 'Sparks slow attackers (poison). Freaks out after 4 damage + 4 rate upgrades.',
  },

  // ---- Modifiers: affect every non-modifier turret whose centre is within range.
  rangeUp: {
    name: 'Ranger', category: 'modifier', cost: 2000, hotkey: '5', unlockKills: 300,
    mod: { rangeAdd: 100 }, blurb: '+100 range to turrets in range.',
  },
  damageUp: {
    name: 'Boom', category: 'modifier', cost: 5000, hotkey: '6', unlockKills: 450,
    mod: { damageMult: 0.4 }, blurb: '+40% damage to turrets in range.',
  },
  rateUpEx: {
    name: 'SpeedEx', category: 'modifier', cost: 1200, hotkey: '7', unlockKills: 550,
    mod: { rateAdd: 60, damageMult: -0.4, rangeMult: -0.1 }, blurb: '+60 rate, -40% damage, -10% range.',
  },
  rangeUpEx: {
    name: 'RangerEx', category: 'modifier', cost: 1000, hotkey: '8', unlockKills: 700,
    mod: { rangeAdd: 100, rateMult: -0.25 }, blurb: '+100 range, -25% rate.',
  },
  rateUp: {
    name: 'Speed', category: 'modifier', cost: 3000, hotkey: '!1', unlockKills: 850,
    mod: { rateAdd: 120 }, blurb: '+120 rate to turrets in range.',
  },
  damageUpBig: {
    name: 'BigBang', category: 'modifier', cost: 8500, hotkey: '!2', unlockKills: 1000,
    mod: { damageMult: 1.0 }, blurb: '+100% damage to turrets in range.',
  },
  damageUpBigEx: {
    name: 'BigBangEx', category: 'modifier', cost: 3500, hotkey: '!3', unlockKills: 1100,
    mod: { damageMult: 1.0, rangeMult: -0.3, rateMult: -0.3 }, blurb: '+100% damage, -30% range, -30% rate.',
  },

  // ---- New weapons (OnSlaught2.26 designs)
  targeter: {
    name: 'Targeter', category: 'support', cost: 3000, hotkey: '!4', unlockKills: 1200,
    base: { damage: 0, range: 150, rate: 0 },
    ladders: { damage: [], range: L([[400, 175], [800, 200], [1300, 230], [2000, 265], [3200, 300]]), rate: [] },
    blurb: 'Join (J) to a turret: that turret acquires targets from here, using this range.',
  },
  sniper: {
    name: 'Sniper', color: 'blue', category: 'weapon', cost: 6000, hotkey: '!5', unlockKills: 1300,
    base: { damage: 280000, range: 420, rate: 12 },
    ladders: {
      damage: L([[1500, 460000], [2500, 700000], [4000, 910000], [6000, 1400000], [9000, 1800000], [13000, 2200000]]),
      range: L([[1500, 460], [2500, 500], [4000, 550]]),
      rate: L([[1500, 14], [2500, 16], [4000, 19], [6000, 22]]),
    },
    weapon: 'sniper', target: 'strong', comboColor: null,
    blurb: 'Huge single hits at very long range. Prefers the strongest attacker.',
  },
  fusion: {
    name: 'Fusion', color: 'green', category: 'weapon', cost: 7500, hotkey: '!6', unlockKills: 1400,
    base: { damage: 4100, range: 110, rate: 300 },
    ladders: {
      damage: L([[2000, 6700], [3500, 8500], [6000, 13000], [9500, 17000], [15000, 25000]]),
      range: L([[1500, 125], [3000, 140], [5000, 160]]),
      rate: L([[2000, 360], [3500, 420], [6000, 480]]),
    },
    weapon: 'fusion', target: 'near', ramp: { perTick: 0.15, max: 6 },
    blurb: 'Continuous beam; damage ramps up to x6 while it stays on the same target.',
  },
  railgun: {
    name: 'Railgun', color: 'red', category: 'weapon', cost: 9000, hotkey: '!7', unlockKills: 1500,
    base: { damage: 67000, range: 300, rate: 20 },
    ladders: {
      damage: L([[3000, 110000], [5000, 160000], [8000, 220000], [12000, 280000], [18000, 370000]]),
      range: L([[2500, 340], [5000, 380]]),
      rate: L([[3000, 24], [5000, 29], [8000, 35]]),
    },
    weapon: 'rail', target: 'near',
    blurb: 'Piercing slug: damages every attacker on the line, out to its range.',
  },
  comboOnly: {
    name: 'Combo-only', category: 'support', cost: 3000, hotkey: '!8', unlockKills: 1600,
    base: { damage: 0, range: 0, rate: 0 }, ladders: { damage: [], range: [], rate: [] },
    blurb: 'Never fires. Counts as a fully upgraded turret of the colour you pick (X) in combos.',
  },
};

export const MODIFIER_RANGE = { base: 80, upgradeCost: 1500, upgraded: 130 };
export const SELL_REFUND = 0.7;
export const MOVE_COST = 500;
export const TURRET_SIZE = 44;          // footprint (diameter) for placement checks
export const COMBO_RANGE = 70;          // centre-to-centre distance for combo partners
export const FREAKOUT = { warn: 3000, length: 5000, damageMult: 3, rateMult: 4, space: 80000, first: 60000 };
export const POISON = { minSpeed: 5, recoverPerSec: 2 };
export const BUILD_ORDER: string[] = ['blue', 'green', 'red', 'yellow', 'rangeUp', 'damageUp', 'rateUpEx', 'rangeUpEx',
  'rateUp', 'damageUpBig', 'damageUpBigEx', 'targeter', 'sniper', 'fusion', 'railgun', 'comboOnly'];
