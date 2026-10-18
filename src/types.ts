// Shared types for the layer contract in ARCHITECTURE.md. Types only (no runtime code), so every
// layer and the Node tests can import it. Keep it in sync with ARCHITECTURE.md.

// ------------------------------------------------------------------ basics
export type Point = [number, number];
export type Stat = 'damage' | 'range' | 'rate';
export type StatValues = Record<Stat, number>;
export type KeyColor = 'red' | 'green' | 'blue' | 'yellow';
export type Category = 'weapon' | 'modifier' | 'support';
export type TargetMode = 'near' | 'far' | 'weak' | 'strong' | 'slow' | 'fast' | 'oldest' | 'newest';
export type DirectionalMode = 'normal' | 'wide' | 'medium' | 'tight' | 'small' | 'pinpoint';
export type FreakStage = 'off' | 'available' | 'warn' | 'on';
export type DifficultyId = 'easy' | 'medium' | 'hard' | 'extreme';
export type ModeId = 'normal' | 'sandbox';
export type BlastSize = 'small' | 'medium' | 'large' | 'huge' | 'bfg' | 'poison';

// ------------------------------------------------------------------ data (src/data)
export interface LadderStep { cost: number; value: number }

export interface ModifierEffect {
  rangeAdd?: number; rateAdd?: number;
  damageMult?: number; rangeMult?: number; rateMult?: number;
}

export interface TurretDef {
  name: string;
  color?: KeyColor;
  category: Category;
  cost: number;
  hotkey: string;
  unlockKills?: number;
  base?: StatValues;
  ladders?: Record<Stat, LadderStep[]>;
  weapon?: string;
  target?: TargetMode;
  freakout?: { damage: number; rate: number };
  ramp?: { perTick: number; max: number };
  link?: { mult: number };                               // Laser: chain multiplier
  holding?: { range: number; rate: number; max: number }; // Rockets: holding pattern
  poisonMax?: number;                                    // Tazer: strongest slow
  comboColor?: KeyColor | null;
  mod?: ModifierEffect;
  blurb: string;
}

export interface BlastSpec { size: BlastSize | number; damage: number; poison?: number }

/** Combo effect parameters; the shape differs per recipe, see src/data/combos.ts and src/game/combos.ts. */
export interface ComboFx {
  projectile?: string;
  speed?: number;
  hit?: number;
  chain?: boolean;
  blast?: BlastSpec;
  napalm?: { length: number; duration: number; dps: number };
  laser?: { damage: number; range: number; chain?: boolean; rate?: number };
  burst?: { qty: number; damage: number; range: number };
  chainSpark?: { qty: number; range: number; damage: number; poison: number };
  rockets?: { damage: number; range: number; rate: number };
  cluster?: { qty: number; damage: number; laser?: number; chain?: boolean };
  sparks?: { qty: number; damage: number; poison: number; range: number; rate?: number };
  blackHole?: { placeRange: number; radius: number; gravity: number; duration: number };
  shockwave?: { radius: number; speed: number; damage: number; knockback: number; poison: number };
}

export type ColorCounts = Partial<Record<KeyColor, number>>;

export interface ComboRecipe {
  id: string;
  name: string;
  isNew?: boolean;
  needs: ColorCounts;
  exact?: ColorCounts;
  takes?: ColorCounts;
  recharge: number;
  fx: ComboFx;
}

export interface MapDef {
  id: string;
  name: string;
  base: Point;
  path: Point[];
}

export interface DifficultyDef {
  name: string; hpGrowth: number; startCash: number; lives: number; waveInterval: number;
  unlock?: { medium: number };
}

export interface ModeDef {
  name: string; startCash?: number; unlockAllTurrets?: boolean;
  unlock?: { anyWave: number };
}

// ------------------------------------------------------------------ game state (ARCHITECTURE.md 1.1)
export interface Attacker {
  id: number;
  type: number;            // 0..8
  x: number; y: number; angle: number;
  hp: number; maxHp: number;
  speed: number; baseSpeed: number;
  poisoned: boolean;
  blackholed: boolean;
  progress: number;        // distance along the path
  weave?: [number, number, number, number];
  // internals (src/game/Attacker.ts)
  wave: number;
  bounty: number;
  dead: boolean;
  swallowed?: boolean;
  _seg: number;
  [extra: string]: unknown; // combo bookkeeping (black hole, knockback)
}

export interface ComboLogEntry { id: string; time: number; role: 'lead' | 'partner' }

export interface TurretState {
  id: number;
  kind: string;            // key of TURRETS
  x: number; y: number; angle: number;
  levels: StatValues; maxLevels: StatValues; stats: StatValues;
  cashValue: number;
  comboCapable: boolean; comboReady: boolean;
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
  combosFired: number; combosAssisted: number;
  comboLog: ComboLogEntry[];
  // optional additions (src/game/Turret.ts)
  kills: number;
  category: Category;
  color: KeyColor | null;
  cd: number;
  comboNext: number;
  damageMult: number;
  freakAt: number;
  targeterId: number | null;
  ramp: number;
  rampTarget: number | null;
}

export type ProjectileKind =
  | 'shell' | 'rocket' | 'nuke' | 'poisonRocket' | 'laserRocket' | 'napalmRocket' | 'tazerRocket'
  | 'bfg' | 'clusterBomb' | 'cluster' | 'mine';

/** Projectile fields, see the comment header of src/game/projectiles.ts. */
export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x: number; y: number; angle: number;
  speed: number;
  mode: 'straight' | 'homing' | 'orbit' | 'goto';
  armed?: boolean;
  targetId?: number | null;
  turnRate?: number;
  retarget?: boolean;
  damage?: number;
  impactRadius?: number;
  poison?: number;
  blast?: BlastSpec | null;
  visualBlast?: BlastSize | number;
  sourceId?: number | null;
  ttl?: number;
  age?: number;
  dead?: boolean;
  ownerId?: number; orbitA?: number; orbitR?: number; orbitW?: number;
  destX?: number; destY?: number; stay?: boolean;
  tag?: string;
  data?: Record<string, unknown>;
}

export type BeamKind = 'laser' | 'chain' | 'spark' | 'fusion' | 'rail' | 'sniper';
export interface Beam { kind: BeamKind; x1: number; y1: number; x2: number; y2: number; age: number; ttl: number }

export type EffectKind = 'blast' | 'poisonCloud' | 'blackHole' | 'napalm' | 'shockwave' | 'cash' | 'comboName' | 'freakWarn';
export interface Effect {
  id: number;
  kind: EffectKind;
  x: number; y: number; radius: number;
  age: number; duration: number;
  data: Record<string, any>; // per kind: size, points, amount, name, turretId
}

export interface MapState {
  id: string; name: string;
  path: Point[];
  base: { x: number; y: number; w: number; h: number };
  roadWidth: number;
  length: number;
}

export interface GameState {
  time: number;
  speed: number;
  paused: boolean; over: boolean;
  difficulty: DifficultyId; mode: ModeId; mapId: string;
  cash: number; lives: number; kills: number; spent: number; wave: number;
  nextWaveIn: number;
  score: number;
  unlocked: Record<string, true>;
  map: MapState;
  attackers: Attacker[];
  turrets: TurretState[];   // Turret instances (src/game/Turret.ts)
  focusId: number | null;
  projectiles: Projectile[];
  beams: Beam[];
  effects: Effect[];
}

export interface GameOptions {
  mapId?: string;
  difficulty?: string;
  mode?: string;
  unlockAll?: boolean;
  seed?: number;
  waveInterval?: number | null;
}

// ------------------------------------------------------------------ commands (ARCHITECTURE.md 1.2)
export type Fail = { ok: false; reason: string };
export type Result<T extends object = {}> = ({ ok: true } & T) | Fail;

export interface ComboPreview {
  leads: boolean;
  partners: { id: number; kind: string; color: KeyColor | null; wait: number }[];
  recipes: { id: string; name: string; isNew: boolean; needs: ColorCounts; missing: ColorCounts; exactBlocked: boolean; wait: number }[];
  next: { id: string; name: string; wait: number } | null;
}

// ------------------------------------------------------------------ events (ARCHITECTURE.md 1.3)
export interface GameEvents {
  shot: { kind: string; turretId: number };
  hit: { attackerId: number };
  kill: { attackerId: number; x: number; y: number; bounty: number };
  leak: { lives: number };
  wave: { wave: number };
  blast: { size: BlastSize | number; x: number; y: number };
  combo: { id: string; name: string; turretId: number; partnerIds: number[] };
  build: { id: number; kind: string };
  sell: { id: number; refund: number };
  upgrade: { id: number; stat: Stat; levels: number };
  move: { id: number; x: number; y: number };
  unlock: { kind: string };
  freakout: { id: number; stage: FreakStage };
  message: { text: string };
  gameover: { score: number; kills: number; wave: number };
  error: { reason: string };
}
export type GameEventName = keyof GameEvents;

// ------------------------------------------------------------------ renderer (ARCHITECTURE.md 2)
export interface Overlay {
  ghost: { kind: string; x: number; y: number; valid: boolean } | null;
  selectedId: number | null;
  hoverId: number | null;
  showRanges: 'selected' | 'all';
  showCombo: boolean;
  joinFromId: number | null;
}

export interface ViewInsets { top: number; right: number; bottom: number; left: number }
