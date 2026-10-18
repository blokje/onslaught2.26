// Interfaces the UI needs from the game and the renderer. Both the real objects (src/game/Game.ts,
// src/render/Renderer.ts) and the fakes in mock.ts satisfy them, so App never imports either class.
// Methods use method syntax on purpose: parameters stay bivariant, so a Game that accepts narrower
// argument types (for example a TurretKind union) still fits.
import type {
  GameState, GameOptions, GameEvents, GameEventName, Result, ComboPreview, Overlay,
  Stat, TargetMode, DirectionalMode, KeyColor,
} from '../types.ts';

export type CommandResult = Result<{ id?: number; refund?: number; levels?: number }>;

export interface AppGame {
  readonly state: GameState;
  on<K extends GameEventName>(name: K, fn: (payload: GameEvents[K]) => void): unknown;
  off<K extends GameEventName>(name: K, fn: (payload: GameEvents[K]) => void): void;
  update(dtMs: number): void;
  serialize(): unknown;
  canBuild(kind: string, x: number, y: number): Result;
  build(kind: string, x: number, y: number): CommandResult;
  upgrade(id: number, stat: Stat, toMax?: boolean): CommandResult;
  upgradeCost(id: number, stat: Stat): number | null;
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
}

export interface AppOptions {
  createGame: (opts: GameOptions) => AppGame;
  /** `save` is the `data` field of the autosave wrapper (the result of serialize()). */
  // any: the serialized shape is private to each game implementation (real Game or mock), so it is passed through untouched
  restoreGame: (save: any) => AppGame;
  renderer: AppRenderer;
}
