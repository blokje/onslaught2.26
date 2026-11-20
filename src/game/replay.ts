// Replays: a game is its start options plus the player commands it ran, each with the step it ran before
// (game.commandLog). The simulation is deterministic (game.rng), so running the same commands at the same steps gives
// the same game. Pure logic, no DOM: the UI plays a replay by attaching it to a live Game, tests run it headless.
import { Game, isCommandEntry } from './Game.ts';
import type { CommandEntry, GameOpts } from './Game.ts';

export const REPLAY_VERSION = 1;

/** A replay file: what is needed to play the game again, and the result it should reach. */
export interface ReplayData {
  v: number;
  opts: GameOpts;
  log: CommandEntry[];
  /** stepCount when the replay was made (playback stops there). */
  end: number;
  result: { score: number; wave: number; kills: number; over: boolean };
}

/** Make a replay of a game as it is now. */
export function makeReplay(g: Game): ReplayData {
  const s = g.state;
  return JSON.parse(JSON.stringify({
    v: REPLAY_VERSION, opts: g.startOpts, log: g.commandLog, end: g.stepCount,
    result: { score: s.score, wave: s.wave, kills: s.kills, over: s.over },
  }));
}

/** Check untrusted replay data (file or pasted code); throws Error('Invalid replay: ...'). */
export function validateReplay(raw: unknown): ReplayData {
  const bad = (why: string): Error => new Error('Invalid replay: ' + why);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('not an object');
  const r = raw as Record<string, unknown>;
  if (r.v !== REPLAY_VERSION) throw bad('unsupported version');
  if (!r.opts || typeof r.opts !== 'object') throw bad('no options');
  if (!Array.isArray(r.log) || r.log.length > 50000 || !r.log.every(isCommandEntry)) throw bad('bad command log');
  if (!Number.isInteger(r.end) || (r.end as number) < 0 || (r.end as number) > 60 * 60 * 60 * 24) throw bad('bad length');
  const res = r.result as Record<string, unknown> | undefined;
  if (!res || !['score', 'wave', 'kills'].every((k) => Number.isFinite(res[k]))) throw bad('bad result');
  for (let i = 1; i < r.log.length; i++) if ((r.log[i] as CommandEntry).s < (r.log[i - 1] as CommandEntry).s) throw bad('log out of order');
  try { new Game(r.opts as GameOpts); } catch (e) { throw bad('unknown map or options'); }
  return JSON.parse(JSON.stringify(r)) as ReplayData;
}

/**
 * Let a fresh game run the replay's commands at their steps (via game.stepHook). Returns a function that runs the
 * commands logged at or before the current stepCount, for the ones after the last step.
 */
export function attachReplay(g: Game, log: readonly CommandEntry[]): () => void {
  let i = 0;
  const run = (step: number): void => {
    while (i < log.length && log[i].s <= step) {
      const e = log[i++];
      const fn = (g as unknown as Record<string, (...a: unknown[]) => unknown>)[e.c]; // a REPLAY_COMMANDS method
      fn.apply(g, e.a);
    }
  };
  g.stepHook = run;
  return () => run(g.stepCount);
}

/** A live game set up to play a replay (the UI shows it): commands run at their steps, update() stops at the end. */
export function startPlayback(r: ReplayData): { game: Game; progress: () => number; done: () => boolean; matches: () => boolean } {
  const g = new Game(r.opts);
  const flush = attachReplay(g, r.log);
  g.stepLimit = r.end;
  return {
    game: g,
    progress: () => Math.min(1, g.stepCount / Math.max(1, r.end)),
    done: () => g.stepCount >= r.end || g.state.over,
    matches: () => { flush(); return replayMatches(g, r); },
  };
}

/** Play a replay to its end without a screen (tests, verification). */
export function runReplay(r: ReplayData): Game {
  const g = new Game(r.opts);
  const flush = attachReplay(g, r.log);
  g.advance(r.end);
  flush();
  g.stepHook = null;
  return g;
}

/** True when a played-back game reached the replay's recorded result. */
export function replayMatches(g: Game, r: ReplayData): boolean {
  const s = g.state;
  return s.score === r.result.score && s.wave === r.result.wave && s.kills === r.result.kills;
}
