// Synthesized sound effects (Web Audio, no audio files). The context is created on the first user gesture.
// Every sound is rate limited (about 12 per second, fewer at high game speed) and everything runs through
// a master gain and a compressor so it never clips.

// Relative minimum gap per sound name (multiplier on the base gap).
const GAP = {
  shot: 1, kill: 1.2, blast_small: 1.2, blast_medium: 1.6, blast_large: 2.5, blast_huge: 6,
  combo: 4, horn: 6, alarm: 4, unlock: 6, click: 0.6, hover: 1.5, error: 3, build: 1.5, sell: 1.5, upgrade: 1.5,
};

// Map a turret kind or projectile/beam kind to a shot sound.
const SHOT_MAP = {
  blue: 'cannon', shell: 'cannon', cannon: 'cannon',
  green: 'laser', laser: 'laser', chain: 'laser',
  red: 'rocket', rocket: 'rocket',
  yellow: 'spark', spark: 'spark',
  sniper: 'sniper',
  fusion: 'fusion',
  railgun: 'rail', rail: 'rail',
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.bus = null;
    this.master = null;
    this.noiseBuf = null;
    this.volume = 0.7;
    this.muted = false;
    this.speed = 1;
    this.last = new Map();
    this.voices = 0;
  }

  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.apply(); }
  setMuted(m) { this.muted = !!m; this.apply(); }
  setSpeed(s) { this.speed = s || 1; }

  apply() {
    if (!this.master) return;
    const g = this.muted ? 0 : this.volume * 0.85;
    try { this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02); } catch (e) { /* ignore */ }
  }

  // Call from a user gesture handler.
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        this.ctx = ctx;
        this.bus = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.knee.value = 12;
        comp.ratio.value = 8;
        comp.attack.value = 0.003;
        comp.release.value = 0.15;
        this.master = ctx.createGain();
        this.bus.connect(comp);
        comp.connect(this.master);
        this.master.connect(ctx.destination);
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this.apply();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio unavailable */ }
  }

  // ---- public entry points used by the App
  shot(kind) {
    const name = SHOT_MAP[kind];
    if (name) this.play('shot_' + name, 'shot');
  }

  play(name, gapKey) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted || this.volume <= 0) return;
    if (this.voices > 36) return;
    const key = gapKey || name;
    const base = 1000 / 12;
    const speedF = 1 + Math.log2(Math.max(1, this.speed)) * 0.6;
    const gap = base * (GAP[key] || GAP[name] || 1) * speedF;
    const now = performance.now();
    const prev = this.last.get(name) || 0;
    if (now - prev < gap) return;
    this.last.set(name, now);
    // cheap global cap: at most ~40 sounds per second across the board
    if (this._gStamp === undefined || now - this._gStamp > 1000) { this._gStamp = now; this._gCount = 0; }
    if (++this._gCount > 40) return;
    try { this['s_' + name]?.(); } catch (e) { /* ignore */ }
  }

  // ---- synthesis helpers
  _tone(type, f0, f1, dur, peak, opts = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const a = opts.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (opts.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lp;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.bus);
    this.voices++;
    osc.onended = () => { this.voices--; };
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise(dur, peak, opts = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type || 'lowpass';
    const f0 = opts.f0 || 1000;
    const f1 = opts.f1 || f0;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = opts.q || 1;
    const g = ctx.createGain();
    const a = opts.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // ---- shots
  s_shot_cannon() {
    this._tone('sine', 240, 70, 0.11, 0.35);
    this._noise(0.05, 0.14, { type: 'bandpass', f0: 1800, q: 0.8 });
  }
  s_shot_laser() {
    this._tone('sawtooth', 1500, 380, 0.13, 0.08, { lp: 3500 });
    this._tone('sine', 900, 300, 0.1, 0.1);
  }
  s_shot_rocket() {
    this._noise(0.38, 0.2, { type: 'bandpass', f0: 350, f1: 2200, q: 1.2, attack: 0.05 });
    this._tone('sine', 130, 70, 0.2, 0.15);
  }
  s_shot_spark() {
    for (let i = 0; i < 4; i++) {
      this._noise(0.025, 0.1, { type: 'highpass', f0: 3000 + Math.random() * 2500, delay: i * 0.03 + Math.random() * 0.02 });
    }
    this._tone('square', 2200, 900, 0.07, 0.04, { lp: 4000 });
  }
  s_shot_sniper() {
    this._noise(0.07, 0.3, { type: 'highpass', f0: 1800 });
    this._tone('sine', 170, 38, 0.32, 0.4);
  }
  s_shot_rail() {
    this._tone('square', 95, 40, 0.2, 0.18, { lp: 600 });
    this._noise(0.14, 0.12, { type: 'lowpass', f0: 900, f1: 120 });
    this._tone('sine', 2100, 1500, 0.1, 0.05, { delay: 0.02 });
  }
  s_shot_fusion() {
    this._tone('triangle', 110, 120, 0.09, 0.12);
    this._tone('sine', 220, 240, 0.09, 0.06);
  }

  // ---- impacts
  s_kill() { this._tone('sine', 1500, 850, 0.05, 0.09); }
  s_blast_small() {
    this._noise(0.25, 0.3, { type: 'lowpass', f0: 1400, f1: 120 });
    this._tone('sine', 120, 45, 0.22, 0.28);
  }
  s_blast_medium() {
    this._noise(0.42, 0.4, { type: 'lowpass', f0: 1200, f1: 90 });
    this._tone('sine', 100, 38, 0.38, 0.38);
  }
  s_blast_large() {
    this._noise(0.7, 0.5, { type: 'lowpass', f0: 1000, f1: 70 });
    this._tone('sine', 80, 30, 0.6, 0.5);
  }
  s_blast_huge() {
    this._noise(1.9, 0.6, { type: 'lowpass', f0: 500, f1: 40, attack: 0.02 });
    this._tone('sine', 55, 22, 1.7, 0.65, { attack: 0.02 });
    this._tone('sawtooth', 40, 25, 1.4, 0.18, { lp: 160, delay: 0.05 });
  }

  // ---- events
  s_combo() {
    const f = [523.25, 659.25, 783.99, 1046.5];
    f.forEach((hz, i) => this._tone('triangle', hz, hz, 0.7, 0.14, { delay: i * 0.05, attack: 0.02 }));
  }
  s_horn() {
    this._tone('sawtooth', 196, 190, 0.55, 0.14, { lp: 800, attack: 0.05 });
    this._tone('sawtooth', 247, 240, 0.55, 0.12, { lp: 800, attack: 0.05 });
  }
  s_alarm() {
    for (let i = 0; i < 3; i++) {
      this._tone('square', i % 2 ? 480 : 640, i % 2 ? 480 : 640, 0.14, 0.12, { delay: i * 0.16, lp: 2200 });
    }
  }
  s_unlock() {
    this._tone('sine', 880, 880, 0.5, 0.16, { attack: 0.01 });
    this._tone('sine', 1318.5, 1318.5, 0.6, 0.14, { delay: 0.12, attack: 0.01 });
    this._tone('sine', 1760, 1760, 0.7, 0.1, { delay: 0.24, attack: 0.01 });
  }
  s_click() { this._tone('sine', 760, 560, 0.04, 0.12); }
  s_hover() { this._tone('sine', 1300, 1300, 0.025, 0.03); }
  s_error() { this._tone('sawtooth', 120, 90, 0.16, 0.14, { lp: 700 }); }
  s_build() { this._tone('sine', 300, 120, 0.12, 0.25); this._noise(0.06, 0.1, { type: 'lowpass', f0: 900 }); }
  s_sell() { this._tone('sine', 1200, 1200, 0.1, 0.1); this._tone('sine', 1800, 1800, 0.14, 0.08, { delay: 0.07 }); }
  s_upgrade() { this._tone('triangle', 500, 500, 0.08, 0.12); this._tone('triangle', 750, 750, 0.12, 0.12, { delay: 0.07 }); }
}
