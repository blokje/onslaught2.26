// OnSlaught2.26 renderer: three.js orthographic top-down view of game.state.
// Public API (see ARCHITECTURE.md section 2):
//   new Renderer(container), setGame(game), render(realDtMs), screenToWorld(cx, cy),
//   worldToScreen(x, y), setOverlay({...}), resetView()
// Optional extras: setViewInsets({top,right,bottom,left}), getZoom(), dispose(), canvas.
//
// Performance: every dynamic thing is drawn through ~25 instanced batches (see batches.js). Instance
// buffers are rewritten each frame (a few hundred to a few thousand small records), textures are
// atlases generated once, and there are no per-entity three.js objects.

import * as THREE from 'three';
import { FIELD } from '../data/rules.ts';
import { SpriteBatch, RingBatch } from './batches.ts';
import { buildFxAtlas, buildUnitAtlas, buildTurretAtlases, TextAtlas, cellUV, modIconUV, MOD_KINDS, FX, KIND_INDEX } from './atlas.ts';
import { Terrain } from './terrain.ts';
import { CameraController } from './camera.ts';
import { Particles } from './particles.ts';
import { drawTurrets, drawAttackers, drawProjectiles } from './entities.ts';
import { drawBeams, drawEffects, drawOverlay } from './fxlayer.ts';
import { clamp } from './util.ts';

const DEFAULT_OVERLAY = { ghost: null, selectedId: null, hoverId: null, showRanges: 'selected', showCombo: false, joinFromId: null };
const CLEAR = 0x120e0b;

export class Renderer {
  constructor(container) {
    this.container = container;
    this.game = null;
    this.t = 0;          // animation clock, seconds (real time, always runs)
    this.frame = 0;
    this.overlay = Object.assign({}, DEFAULT_OVERLAY);
    this._cursorClient = null;
    this._dpr = 0;

    // --- three.js core. antialias is off on purpose: all edges are shader-antialiased or textured.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // we write display values directly
    this.renderer.setClearColor(CLEAR, 1);
    this.renderer.sortObjects = true;
    this.canvas = this.renderer.domElement;
    const cs = this.canvas.style;
    cs.display = 'block'; cs.width = '100%'; cs.height = '100%'; cs.touchAction = 'none'; cs.outline = 'none';
    cs.userSelect = 'none'; cs.webkitUserSelect = 'none';
    container.appendChild(this.canvas);
    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    this.camera.position.z = 5;

    // --- art
    const fxA = buildFxAtlas(), unitA = buildUnitAtlas(), turA = buildTurretAtlases();
    this.text = new TextAtlas();
    const fxC = {
      white: cellUV(FX.white, 30), whiteSolid: cellUV(FX.white, 80),
      glow: cellUV(FX.glow), puff: cellUV(FX.puff), flame: cellUV(FX.flame), beam: cellUV(FX.beam),
      swirl: cellUV(FX.swirl), star: cellUV(FX.star), rocket: cellUV(FX.rocket), bomb: cellUV(FX.bomb),
      mine: cellUV(FX.mine), flag: cellUV(FX.flag), spark: cellUV(FX.spark), ring: cellUV(FX.ring),
    };
    const nKinds = Object.keys(KIND_INDEX).length;
    this.res = {
      c: {
        fx: fxC,
        att: Array.from({ length: 9 }, (_, i) => cellUV(i)),
        tb: Array.from({ length: nKinds }, (_, i) => cellUV(i)),
        tw: Array.from({ length: nKinds }, (_, i) => cellUV(i)),
        ti: Object.fromEntries(MOD_KINDS.map((k) => [k, modIconUV(k)])),
      },
      b: {},
      particles: new Particles(2600),
      text: this.text,
      overlay: this.overlay,
      cursor: null,
      game: null,
      trailSeen: new Map(),
      fxSeen: new Map(),
    };
    const b = this.res.b;
    const mk = (name, batch) => { b[name] = batch; this.scene.add(batch.mesh); return batch; };
    const FXT = fxA.texture, UT = unitA.texture, TB = turA.base, TW = turA.weapon, TI = turA.icon, TT = this.text.texture;
    this.terrain = new Terrain(this.scene, FXT);
    mk('ringUnder', new RingBatch(600, { order: 3 }));
    mk('tGlow', new SpriteBatch(FXT, 600, { additive: true, order: 3.5 }));
    mk('tBase', new SpriteBatch(TB, 400, { order: 4 }));
    mk('tWeap', new SpriteBatch(TW, 400, { order: 5 }));
    mk('tWeapAdd', new SpriteBatch(TW, 800, { additive: true, order: 5.1 }));
    mk('tIcon', new SpriteBatch(TI, 400, { order: 5.2 }));
    mk('tTop', new SpriteBatch(FXT, 1400, { order: 5.5 }));
    mk('groundRing', new RingBatch(200, { order: 6 }));
    mk('groundFx', new SpriteBatch(FXT, 1200, { order: 6.2 }));
    mk('groundFxAdd', new SpriteBatch(FXT, 3000, { additive: true, order: 6.3 }));
    mk('attSh', new SpriteBatch(UT, 1200, { order: 6.8 }));
    mk('attGlow', new SpriteBatch(FXT, 1200, { additive: true, order: 6.9 }));
    mk('att', new SpriteBatch(UT, 1200, { order: 7 }));
    mk('attTop', new SpriteBatch(FXT, 2600, { order: 7.2 }));
    mk('smoke', new SpriteBatch(FXT, 3600, { order: 7.8 }));
    mk('proj', new SpriteBatch(FXT, 1500, { order: 8 }));
    mk('projAdd', new SpriteBatch(FXT, 4500, { additive: true, order: 8.2 }));
    mk('beams', new SpriteBatch(FXT, 12000, { additive: true, order: 9 }));
    mk('blastAdd', new SpriteBatch(FXT, 800, { additive: true, order: 10 }));
    mk('ringAdd', new RingBatch(1200, { additive: true, order: 10.2 }));
    mk('text', new SpriteBatch(TT, 400, { order: 11 }));
    mk('ghostBase', new SpriteBatch(TB, 4, { order: 12 }));
    mk('ghostWeap', new SpriteBatch(TW, 4, { order: 12.1 }));
    mk('ghostIcon', new SpriteBatch(TI, 4, { order: 12.2 }));
    mk('ringTop', new RingBatch(500, { order: 12.5 }));
    mk('ovAdd', new SpriteBatch(FXT, 800, { additive: true, order: 12.6 }));
    this.sprites = ['tGlow', 'tBase', 'tWeap', 'tWeapAdd', 'tIcon', 'tTop', 'groundFx', 'groundFxAdd', 'attSh', 'attGlow', 'att', 'attTop', 'smoke', 'proj', 'projAdd', 'beams', 'blastAdd', 'text', 'ghostBase', 'ghostWeap', 'ghostIcon', 'ovAdd'].map((n) => b[n]);
    this.rings = ['ringUnder', 'groundRing', 'ringAdd', 'ringTop'].map((n) => b[n]);

    // --- camera + input
    this.view = new CameraController(this.canvas);
    this._onPointerMove = (e) => { this._cursorClient = { x: e.clientX, y: e.clientY }; };
    this._onPointerLeave = () => { /* keep last cursor: join lines stay where they were */ };
    this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });
    this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });

    this._resize(true);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(container);
    }
    this._onWinResize = () => this._resize();
    window.addEventListener('resize', this._onWinResize);
  }

  // ------------------------------------------------------------------ public API
  /** Pass null to detach: nothing is drawn and the road is cleared until the next game. */
  setGame(game) {
    this.game = game || null;
    this.res.game = this.game;
    this.res.particles.clear();
    this.res.trailSeen.clear();
    this.res.fxSeen.clear();
    this.terrain.mapKey = '__reset__'; // force the next frame to rebuild road + base for this game's map
  }

  screenToWorld(clientX, clientY) { return this.view.screenToWorld(clientX, clientY); }
  worldToScreen(x, y) { return this.view.worldToScreen(x, y); }

  /** Merge overlay settings (full or partial objects both work). */
  setOverlay(o) { Object.assign(this.overlay, o || {}); }

  resetView() { this.view.reset(); }

  /** Optional: reserve screen space covered by HUD panels (CSS px) so the fitted field avoids it. */
  setViewInsets(insets) { this.view.setInsets(insets || {}); }
  getZoom() { return this.view.zoom; }

  render(realDtMs = 16) {
    this._resize();
    const dt = clamp(realDtMs || 0, 0, 100);
    this.t += dt / 1000;
    this.frame++;
    const st = this.game ? this.game.state : null;
    const R = this.res;
    const speed = st ? Math.min(st.speed || 1, 8) : 1;
    const dtMs = st && st.paused ? 0 : dt * speed;

    // camera
    const view = this.view, s = view.scale, c = view.center();
    const hw = view.W / 2 / s, hh = view.H / 2 / s;
    const cam = this.camera;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh;
    cam.position.x = c.x; cam.position.y = -c.y;
    cam.updateProjectionMatrix();
    const wpp = 1 / s;

    // scenery
    this.terrain.setMap(st ? st.map : null);
    this.terrain.update(this.t, wpp);

    for (const sb of this.sprites) sb.begin();
    for (const rb of this.rings) rb.begin(wpp, this.t);
    this.text.beginFrame();

    if (st) {
      const turretById = new Map();
      for (const tr of st.turrets) turretById.set(tr.id, tr);
      const holes = [];
      for (const e of st.effects) if (e.kind === 'blackHole') holes.push(e);
      const f = {
        state: st, t: this.t, dtMs, wpp, frame: this.frame, turretById, holes,
        textScale: clamp(1 / Math.sqrt(view.zoom), 0.7, 1.4),
      };
      R.cursor = this.overlay.joinFromId != null && this._cursorClient ? view.screenToWorld(this._cursorClient.x, this._cursorClient.y) : null;
      drawTurrets(R, f);
      drawAttackers(R, f);
      drawProjectiles(R, f);
      drawBeams(R, f);
      drawEffects(R, f);
      R.particles.update(dtMs, R.b.smoke, R.b.projAdd, R.c.fx.puff, R.c.fx.spark);
      drawOverlay(R, f);
    }

    for (const sb of this.sprites) sb.end();
    for (const rb of this.rings) rb.end();
    this.text.endFrame();
    this.renderer.render(this.scene, cam);
  }

  dispose() {
    if (this._ro) this._ro.disconnect();
    window.removeEventListener('resize', this._onWinResize);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.view.dispose();
    this.renderer.dispose();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }

  // ------------------------------------------------------------------ internals
  _resize(force) {
    const cont = this.container;
    const w = Math.max(1, cont.clientWidth || window.innerWidth), h = Math.max(1, cont.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!force && w === this.view.W && h === this.view.H && dpr === this._dpr) return;
    const first = force === true;
    this._dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.view.setSize(w, h);
    if (first) this.view.reset();
  }
}

export default Renderer;
void FIELD;
