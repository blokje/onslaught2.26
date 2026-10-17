// Global rules. Medium = the original game (see SPEC.md).

export const FIELD = { width: 720, height: 450, roadWidth: 28, baseSize: [126, 82] };

export const WAVES = {
  size: 10,             // attackers per wave
  spacing: 700,         // ms between attackers in a wave
  baseEnergy: 10,       // HP before the first wave's growth step
  baseSpeed: 60,        // units per second
  types: 9,             // attacker look cycles by (wave - 1) % 9
  earlyBonusPerSec: 1,  // NEW: cash per second skipped when sending a wave early (Space)
};

export const DIFFICULTIES = {
  easy:    { name: 'Easy',    hpGrowth: 1.10,  startCash: 60, lives: 20, waveInterval: 25000 },
  medium:  { name: 'Medium',  hpGrowth: 1.125, startCash: 30, lives: 10, waveInterval: 20000 },
  hard:    { name: 'Hard',    hpGrowth: 1.14,  startCash: 30, lives: 5,  waveInterval: 17000 },
  extreme: { name: 'Extreme', hpGrowth: 1.16,  startCash: 20, lives: 1,  waveInterval: 15000, unlock: { medium: 100 } },
};

export const MODES = {
  normal:  { name: 'Normal' },
  sandbox: { name: 'Sandbox', startCash: 10_000_000, unlockAllTurrets: true, unlock: { anyWave: 50 } },
};

export const SPEEDS = [1, 2, 4, 8];

export const TARGET_MODES = ['near', 'far', 'weak', 'strong', 'slow', 'fast', 'oldest', 'newest'];
export const DIRECTIONAL = { normal: 360, wide: 180, medium: 90, small: 45 };

// Score = total kills x total cash spent (original formula).
export const score = (kills, spent) => kills * spent;
