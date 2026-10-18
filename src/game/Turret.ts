// Turret entity. A plain data object (own fields only, no back references) so it can be
// JSON-serialised as is. Public fields follow ARCHITECTURE.md 1.1; extras are documented below.
import { TURRETS } from '../data/turrets.ts';
import { maxLevels, modRangeAt } from './modifiers.ts';
import type {
  Category, ComboLogEntry, DirectionalMode, FreakStage, KeyColor, StatValues, TargetMode, TurretState,
} from '../types.ts';

/** Object.assign that skips keys able to rewrite the prototype (used for untrusted saves). */
export function assignSafe<T extends object>(target: T, src: object): T {
  for (const k of Object.keys(src)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    (target as Record<string, unknown>)[k] = (src as Record<string, unknown>)[k];
  }
  return target;
}

export class Turret implements TurretState {
  id: number;
  kind: string;
  kills: number;
  x: number;
  y: number;
  angle: number;
  levels: StatValues;
  maxLevels: StatValues;
  stats: StatValues;
  cashValue: number;
  comboCapable: boolean;
  comboReady: boolean;
  freak: FreakStage;
  holding: number;
  links: number[];
  targetMode: TargetMode;
  locked: boolean;
  targetId: number | null;
  directional: { mode: DirectionalMode; angle: number };
  joinedTo: number | null;
  comboColor: KeyColor | null;
  modRange: number;
  category: Category;
  color: KeyColor | null;
  cd: number;
  comboNext: number;
  damageMult: number;
  freakAt: number;
  targeterId: number | null;
  ramp: number;
  rampTarget: number | null;
  combosFired: number;
  combosAssisted: number;
  comboLog: ComboLogEntry[];

  constructor(id: number, kind: string, x: number, y: number) {
    const def = TURRETS[kind];
    this.id = id;
    this.kind = kind;
    this.kills = 0;               // attackers this turret finished off (UI stat)
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.levels = { damage: 0, range: 0, rate: 0 };
    this.maxLevels = maxLevels(kind);
    this.stats = { damage: 0, range: 0, rate: 0 };
    this.cashValue = def.cost;
    this.comboCapable = false;
    this.comboReady = false;
    this.freak = 'off';
    this.holding = 0;
    this.links = [];
    this.targetMode = def.target || 'near';
    this.locked = false;
    this.targetId = null;
    this.directional = { mode: 'normal', angle: 0 };
    this.joinedTo = null;
    this.comboColor = def.category === 'support' && kind === 'comboOnly' ? 'red' : def.color && KEYS_COLOR[def.color] ? def.color : null;
    this.modRange = def.category === 'modifier' ? modRangeAt(0) : 0;
    // ---- additions (optional fields for render/ui/combos)
    this.category = def.category;     // 'weapon' | 'modifier' | 'support'
    this.color = def.color || null;   // 'blue' | 'green' | 'red' | 'yellow' | null
    this.cd = 0;                      // ms until the own fire timer elapses (<= 0 = ready)
    this.comboNext = 0;               // game time (ms) before which no combo may involve this turret
    this.damageMult = 1;              // effective damage multiplier (modifiers + freak-out), for combos
    this.freakAt = 0;                 // game time when the current freak stage ends / next stage starts
    this.targeterId = null;           // id of a Targeter joined to this turret (derived)
    this.ramp = 0;                    // Fusion: ticks on the current target
    this.rampTarget = null;           // Fusion: attacker id the ramp belongs to
    this.combosFired = 0;             // combos this turret led
    this.combosAssisted = 0;          // combos this turret joined as a partner
    this.comboLog = [];               // [{ id, time, role: 'lead'|'partner' }], newest first, max COMBO_LOG_MAX
  }

  static fromJSON(o: Record<string, any>): Turret {
    const t = new Turret(o.id, o.kind, o.x, o.y);
    assignSafe(t, o);
    return t;
  }
}

const KEYS_COLOR: Record<string, number> = { red: 1, green: 1, blue: 1, yellow: 1 };
