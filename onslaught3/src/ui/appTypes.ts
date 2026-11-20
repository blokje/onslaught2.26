// Interfaces the UI needs from the game and the renderer. Both the real objects (src/game/Game.ts,
// src/render/Renderer.ts) and the fakes in mock.ts satisfy them, so App never imports either class.
// Methods use method syntax on purpose: parameters stay bivariant, so a Game that accepts narrower
// argument types (for example a TurretKind union) still fits.
import type {
  GameState, GameOptions, GameEvents, GameEventName, Result, ComboPreview, Overlay,
  Stat, TargetMode, DirectionalMode, KeyColor, WavePreview, UpgradePreview, RenderOptions,
} from '../types.ts';

export type CommandResult = Result<{ id?: number; refund?: number; levels?: number }>;

export interface AppGame {
  readonly state: GameState;
  /** [OS3] options the game runs with (Restart keeps its mutators, also after Continue). */
  readonly opts?: { readonly mutators?: readonly string[] };
  on<K extends GameEventName>(name: K, fn: (payload: GameEvents[K]) => void): unknown;
  off<K extends GameEventName>(name: K, fn: (payload: GameEvents[K]) => void): void;
  update(dtMs: number): void;
  serialize(): unknown;
  canBuild(kind: string, x: number, y: number): Result;
  build(kind: string, x: number, y: number): CommandResult;
  upgrade(id: number, stat: Stat, toMax?: boolean): CommandResult;
  upgradeCost(id: number, stat: Stat): number | null;
  upgradePreview(id: number, stat: Stat): UpgradePreview | null;
  sell(id: number): CommandResult;
  move(id: number, x: number, y: number): CommandResult;
  setTargetMode(id: number, mode: TargetMode): CommandResult;
  cycleTargetMode(id: number): CommandResult;
  toggleLock(id: number): CommandResult;
  focusFire(attackerId: number | null): CommandResult;
  setDirectional(id: number, mode: DirectionalMode, angle: number): CommandResult;
  cycleDirectional(id: number): CommandResult;
  join(targeterId: number, turretId: number | null): CommandResult;
  setComboColor(id: number, color: KeyColor): CommandResult;
  comboPreview(id: number): ComboPreview | null;
  sendWave(): CommandResult;
  wavePreview(n?: number): WavePreview;
  waveActive(): boolean;
  /** Optional (real Game): change the wave interval of the running game, ms >= 1000. */
  setWaveInterval?(ms: number): CommandResult | unknown;
  undo(): CommandResult;
  /** kind/turret/stat/levels are optional so the UI can build a translated label (the mock returns null). */
  undoInfo(): { label: string; refund: number; kind?: 'build' | 'upgrade'; turret?: string; stat?: Stat; levels?: number } | null;
  setSpeed(speed: number): CommandResult | void;
  togglePause(): CommandResult | void;
  setPaused(paused: boolean): CommandResult | void;
  turretAt(x: number, y: number): number | null | undefined;
}

export interface AppRenderer {
  setGame(game: AppGame | null): void;
  resetView(): void;
  setOverlay(overlay: Overlay): void;
  screenToWorld(clientX: number, clientY: number): { x: number; y: number };
  render(realDtMs?: number): void;
  /** Optional: presentation options (the mock renderer has none). */
  setOptions?(o: Partial<RenderOptions>): void;
}

/** A replay being shown: the live game plus its progress and end check. */
export interface ReplayPlayback { game: AppGame; progress(): number; done(): boolean; matches(): boolean }
/** Replay support from the game layer (src/main.ts wires src/game/replay.ts); the UI never imports Game itself. */
export interface ReplaySupport {
  /** Replay data of a running game, or null when the game cannot make one (the mock). */
  make(game: AppGame): unknown | null;
  /** Check untrusted data (a file or pasted code); throws Error('Invalid replay: ...'). */
  validate(raw: unknown): unknown;
  play(data: unknown): ReplayPlayback;
  info(data: unknown): { mapId: string; difficulty: string; wave: number; score: number };
}

export interface AppOptions {
  createGame: (opts: GameOptions) => AppGame;
  /** `save` is the `data` field of the autosave wrapper (the result of serialize()). */
  // any: the serialized shape is private to each game implementation (real Game or mock), so it is passed through untouched
  restoreGame: (save: any) => AppGame;
  renderer: AppRenderer;
  /** Optional: replays (the UI demo has none). */
  replays?: ReplaySupport;
}
