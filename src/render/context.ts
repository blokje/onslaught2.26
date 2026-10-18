// Types shared by the renderer modules (types only, no runtime code).

import type { GameState, Overlay, TurretState, Effect } from '../types.ts';
import type { SpriteBatch, RingBatch, Cell } from './batches.ts';
import type { Particles } from './particles.ts';
import type { TextAtlas } from './atlas.ts';

/** What the renderer needs from a game: the state to draw and (optionally) the combo partner query. */
export interface RenderGame {
  state: GameState;
  comboPartners?: (id: number) => number[];
}

export interface FxCells {
  white: Cell; whiteSolid: Cell; glow: Cell; puff: Cell; flame: Cell; beam: Cell; swirl: Cell; star: Cell;
  rocket: Cell; bomb: Cell; mine: Cell; flag: Cell; spark: Cell; ring: Cell;
}

export interface Cells {
  fx: FxCells;
  att: Cell[];                       // 9 attacker silhouettes
  tb: Cell[];                        // turret base plates by KIND_INDEX
  tw: Cell[];                        // turret weapons by KIND_INDEX
  ti: Record<string, Cell | null>;   // modifier icons by kind
}

/** The ~25 instanced batches, in draw order (see Renderer). */
export interface Batches {
  ringUnder: RingBatch;
  tGlow: SpriteBatch; tBase: SpriteBatch; tWeap: SpriteBatch; tWeapAdd: SpriteBatch; tIcon: SpriteBatch; tTop: SpriteBatch;
  groundRing: RingBatch;
  groundFx: SpriteBatch; groundFxAdd: SpriteBatch;
  attSh: SpriteBatch; attGlow: SpriteBatch; att: SpriteBatch; attTop: SpriteBatch;
  smoke: SpriteBatch; proj: SpriteBatch; projAdd: SpriteBatch; beams: SpriteBatch; blastAdd: SpriteBatch;
  ringAdd: RingBatch;
  text: SpriteBatch;
  ghostBase: SpriteBatch; ghostWeap: SpriteBatch; ghostIcon: SpriteBatch;
  ringTop: RingBatch;
  ovAdd: SpriteBatch;
}

/** Renderer-owned resources handed to the draw functions. */
export interface Res {
  c: Cells;
  b: Batches;
  particles: Particles;
  text: TextAtlas;
  overlay: Overlay;
  cursor: { x: number; y: number } | null;
  game: RenderGame | null;
  trailSeen: Map<number, { x: number; y: number; s: number }>; // projectile id -> last trail point + frame stamp
  fxSeen: Map<number, number>;                                  // effect id -> frame stamp
}

/** Per-frame values shared by the draw functions. */
export interface Frame {
  state: GameState;
  t: number;
  dtMs: number;
  wpp: number;
  frame: number;
  turretById: Map<number, TurretState>;
  holes: Effect[];
  textScale: number;
}
