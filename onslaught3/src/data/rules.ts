// Global rules. Medium = the original game (see SPEC.md).
import type { DifficultyDef, ModeDef, TargetMode, DirectionalMode } from '../types.ts';

export const FIELD = { width: 720, height: 450, roadWidth: 28, baseSize: [126, 82] as [number, number] };

export const WAVES = {
  size: 10,             // attackers per wave
  spacing: 700,         // ms between attackers in a wave
  baseEnergy: 10,       // HP before the first wave's growth step
  baseSpeed: 60,        // units per second
  types: 9,             // attacker look cycles by (wave - 1) % 9
  earlyBonusPerSec: 1,  // NEW: cash per second skipped when sending a wave early (Space)
  // NEW late-game curve (waves 1 to lateWave are exactly original, see SPEC.md section 3):
  lateWave: 100,          // after this wave the curve below applies
  lateGrowthFactor: 0.4,  // HP growth per wave becomes 1 + (hpGrowth - 1) * factor (Medium 1.125 -> 1.05)
  lateBountyGrowth: 1.03, // bounty = round(wave * lateBountyGrowth^(wave - lateWave))
};

// NEW: attackers weave across the road instead of walking single file on the centreline.
// lane = amplitude * (0.6 sin(p k1 + ph1) + 0.4 sin(p k2 + ph2)), p = distance travelled, k = 2 pi / wavelength.
export const WEAVE = { amplitude: 8, wavelength: [250, 450] as [number, number] };

export const DIFFICULTIES: Record<string, DifficultyDef> = {
  easy:    { name: 'Easy',    hpGrowth: 1.10,  startCash: 60, lives: 20, waveInterval: 25000 },
  medium:  { name: 'Medium',  hpGrowth: 1.125, startCash: 30, lives: 10, waveInterval: 20000 },
  hard:    { name: 'Hard',    hpGrowth: 1.165, startCash: 30, lives: 5,  waveInterval: 17000 },
  extreme: { name: 'Extreme', hpGrowth: 1.25,  startCash: 20, lives: 1,  waveInterval: 15000, unlock: { medium: 100 } },
};

export const MODES: Record<string, ModeDef> = {
  normal:  { name: 'Normal' },
  sandbox: { name: 'Sandbox', startCash: 10_000_000, unlockAllTurrets: true, unlock: { anyWave: 50 } },
};

export const SPEEDS: number[] = [1, 2, 4, 8];

export const TARGET_MODES: TargetMode[] = ['near', 'far', 'weak', 'strong', 'slow', 'fast', 'oldest', 'newest'];
// Firing cone widths in degrees, in D cycle order (widest first).
export const DIRECTIONAL: Record<DirectionalMode, number> = { normal: 360, wide: 180, medium: 90, tight: 60, small: 45, pinpoint: 30 };

// Score = total kills x total cash spent (original formula).
export const score = (kills: number, spent: number): number => kills * spent;
