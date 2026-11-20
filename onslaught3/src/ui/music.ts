// Adaptive background music, synthesized (Web Audio, no audio files). A 16-step pattern over a 4-chord loop; layers
// join as the intensity rises (pad, then kick and bass, then arpeggio, then hats and a faster tempo).
// `musicStep` is pure (which notes play on a step at an intensity) and tested in Node; MusicPlayer schedules them.

/** One note to play: synth voice, MIDI pitch (or 0 for noise), length in steps, velocity 0..1. */
export interface MusicNote { voice: 'pad' | 'bass' | 'arp' | 'kick' | 'hat'; midi: number; len: number; vel: number }

// A minor loop: Am, F, C, G (roots as MIDI, chord tones as offsets)
const ROOTS = [57, 53, 60, 55];
const TRIADS = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
const ARP = [0, 1, 2, 1, 2, 0, 1, 2];

/** Tempo in steps (16th notes) per second for an intensity 0..1: 96 bpm calm, up to 132 bpm under pressure. */
export function musicTempo(intensity: number): number {
  const bpm = 96 + 36 * Math.max(0, Math.min(1, intensity));
  return (bpm / 60) * 4;
}

/** Notes starting on `step` (counting from 0, 16 per bar, 4 bars per loop) at intensity 0..1. */
export function musicStep(step: number, intensity: number): MusicNote[] {
  const i = Math.max(0, Math.min(1, intensity));
  const bar = Math.floor(step / 16) % 4, s = step % 16;
  const root = ROOTS[bar], triad = TRIADS[bar];
  const out: MusicNote[] = [];
  if (s === 0) for (const o of triad) out.push({ voice: 'pad', midi: root + o, len: 16, vel: 0.35 + 0.2 * i });
  if (i >= 0.15 && s % 4 === 0) out.push({ voice: 'kick', midi: 0, len: 1, vel: s === 0 ? 0.9 : 0.6 });
  if (i >= 0.25 && (s === 0 || s === 6 || s === 8 || s === 14)) out.push({ voice: 'bass', midi: root - 12, len: s === 6 || s === 14 ? 2 : 4, vel: 0.7 });
  if (i >= 0.45 && s % 2 === 0) out.push({ voice: 'arp', midi: root + 12 + triad[ARP[(s / 2) % 8]], len: 1, vel: 0.35 + 0.25 * i });
  if (i >= 0.65 && s % 2 === 1) out.push({ voice: 'hat', midi: 0, len: 1, vel: s % 4 === 3 ? 0.5 : 0.3 });
  return out;
}

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Plays the music on an AudioContext into `out` (the music bus). Call setIntensity from the game, stop() when idle. */
export class MusicPlayer {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
  intensity = 0;
  target = 0;
  step = 0;
  nextTime = 0;
  timer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: AudioContext, out: AudioNode, noise: AudioBuffer) { this.ctx = ctx; this.out = out; this.noise = noise; }

  get playing(): boolean { return this.timer != null; }

  start(): void {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.pump(), 50);
  }

  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  /** Target intensity 0..1; the played value follows it smoothly (about 4 s for a full change). */
  setIntensity(v: number): void { this.target = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); }

  /** Schedule every step that starts within the next 0.25 s. */
  pump(): void {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05; // after a stall, do not burst
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.intensity += Math.max(-0.02, Math.min(0.02, this.target - this.intensity));
      const dur = 1 / musicTempo(this.intensity);
      for (const n of musicStep(this.step, this.intensity)) this.play(n, this.nextTime, dur);
      this.step = (this.step + 1) % 64;
      this.nextTime += dur;
    }
  }

  play(n: MusicNote, t: number, stepDur: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.out);
    const len = n.len * stepDur;
    if (n.voice === 'kick' || n.voice === 'hat') {
      if (n.voice === 'kick') {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * n.vel, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); o.start(t); o.stop(t + 0.2);
      } else {
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
        src.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7000;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * n.vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        src.connect(f); f.connect(g); src.start(t, Math.random()); src.stop(t + 0.06);
      }
      return;
    }
    const o = ctx.createOscillator();
    o.type = n.voice === 'pad' ? 'triangle' : n.voice === 'bass' ? 'sawtooth' : 'square';
    o.frequency.setValueAtTime(hz(n.midi), t);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = n.voice === 'pad' ? 900 : n.voice === 'bass' ? 420 : 1800;
    const peak = (n.voice === 'pad' ? 0.07 : n.voice === 'bass' ? 0.16 : 0.05) * n.vel;
    const att = n.voice === 'pad' ? Math.min(0.6, len * 0.3) : 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len * (n.voice === 'pad' ? 1.05 : 0.9));
    o.connect(f); f.connect(g);
    o.start(t); o.stop(t + len * 1.1 + 0.05);
  }
}

/** Musical pressure 0..1 from the game: attackers on the field, lives lost, and whether a wave is running. */
export function musicIntensity(s: { attackers: { dead?: boolean }[]; lives: number; wave: number; over: boolean }, startLives: number): number {
  if (s.over || s.wave === 0) return 0.1;
  let alive = 0;
  for (const a of s.attackers) if (!a.dead) alive++;
  const crowd = Math.min(1, alive / 25);
  const danger = startLives > 0 ? 1 - s.lives / startLives : 0;
  return Math.min(1, 0.2 + 0.55 * crowd + 0.35 * danger);
}
