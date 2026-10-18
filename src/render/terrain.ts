// Static scenery: sandy ground with circuit lines, the road (signed-distance texture rendered with
// screen-constant anti-aliasing), road dashes, and the fenced base compound.
//
// The whole backdrop is ONE quad whose fragment shader combines:
//   - a 2 px/unit ground canvas (noise + circuit pattern, generated once),
//   - a per-map 8-bit distance-to-road texture (bilinear filtered, so edges stay crisp at any zoom),
//   - the field frame + vignette.

import * as THREE from 'three';
import { FIELD } from '../data/rules.ts';
import { SpriteBatch } from './batches.ts';
import { FX, cellUV } from './atlas.ts';
import { mulberry32, clamp, TAU } from './util.ts';

const PPU = 2;          // texels per world unit (ground + distance field)
const MARGIN = 100;     // backdrop extends this far beyond the field on every side
const REG = { x0: -MARGIN, y0: -MARGIN, w: FIELD.width + 2 * MARGIN, h: FIELD.height + 2 * MARGIN };
const DMAX = 40;        // distance field is clamped to this many world units
const ROAD_EXTEND = 70; // road continues this far beyond a border entry point

const GROUND_VERT = /* glsl */ `
varying vec2 vWorld;
void main() {
  vWorld = vec2(position.x, -position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(position.xy, 0.0, 1.0);
}`;

const GROUND_FRAG = /* glsl */ `
uniform sampler2D uGround; uniform sampler2D uSdf;
uniform vec4 uRegion; uniform float uHalfRoad; uniform float uWpp; uniform float uDmax; uniform float uHasRoad;
varying vec2 vWorld;
void main() {
  vec2 uv = (vWorld - uRegion.xy) / uRegion.zw;
  vec3 g = texture2D(uGround, uv).rgb;
  vec3 col = g;
  float lum = dot(g, vec3(0.3333));
  float aa = max(uWpp * 0.8, 0.3);
  if (uHasRoad > 0.5) {
    float d = texture2D(uSdf, uv).r * uDmax;
    float body = 1.0 - smoothstep(uHalfRoad - aa, uHalfRoad + aa, d);
    float shadow = (1.0 - smoothstep(uHalfRoad, uHalfRoad + 7.0, d)) * 0.3;
    col *= 1.0 - shadow;
    float e = smoothstep(uHalfRoad - 6.5, uHalfRoad - 0.6, d);
    vec3 dark = vec3(0.29, 0.19, 0.115);
    vec3 light = vec3(0.50, 0.365, 0.235);
    vec3 rc = mix(dark, light, e * e);
    rc *= 0.92 + (lum - 0.78) * 1.4;
    float rim = smoothstep(uHalfRoad - 1.5, uHalfRoad - 0.2, d);
    rc = mix(rc, vec3(0.16, 0.105, 0.065), rim * 0.55);
    col = mix(col, rc, body);
  }
  // field frame and vignette
  vec2 q = abs(vWorld - vec2(360.0, 225.0)) - vec2(360.0, 225.0);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float outMask = smoothstep(-aa, aa, sd);
  col = mix(col, col * 0.5, outMask);
  col = mix(col, vec3(0.07, 0.055, 0.043), smoothstep(0.0, 90.0, sd));
  float inner = (1.0 - smoothstep(0.0, 22.0, -sd)) * (1.0 - outMask) * 0.10;
  col *= 1.0 - inner;
  float bl = 1.0 - smoothstep(0.0, aa + 0.8, abs(sd - 0.2));
  col = mix(col, vec3(1.0, 0.84, 0.52), bl * 0.7);
  gl_FragColor = vec4(col, 1.0);
}`;

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------------------------------------------------------------- ground texture
function valueNoise(rnd, gw, gh) {
  const g = new Float32Array((gw + 2) * (gh + 2));
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const stride = gw + 2;
  return (u, v) => { // u in 0..gw, v in 0..gh
    const x0 = Math.floor(u), y0 = Math.floor(v);
    let fx = u - x0, fy = v - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * stride + x0], b = g[y0 * stride + x0 + 1], c = g[(y0 + 1) * stride + x0], d = g[(y0 + 1) * stride + x0 + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function buildGroundTexture() {
  const W = REG.w * PPU, H = REG.h * PPU;
  const canvas = newCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(20261017);
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const cell1 = 70 * PPU / 2, cell2 = 16 * PPU / 2; // ~70 and ~16 world units
  const n1 = valueNoise(rnd, Math.ceil(W / cell1) + 1, Math.ceil(H / cell1) + 1);
  const n2 = valueNoise(rnd, Math.ceil(W / cell2) + 1, Math.ceil(H / cell2) + 1);
  const grain = mulberry32(99);
  for (let y = 0, o = 0; y < H; y++) {
    for (let x = 0; x < W; x++, o += 4) {
      const f = 1 + (n1(x / cell1, y / cell1) - 0.5) * 0.2 + (n2(x / cell2, y / cell2) - 0.5) * 0.09 + (grain() - 0.5) * 0.05;
      d[o] = clamp(222 * f, 0, 255); d[o + 1] = clamp(190 * f, 0, 255); d[o + 2] = clamp(136 * f * (1 + (n1(x / cell1 + 9, y / cell1) - 0.5) * 0.06), 0, 255); d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // circuit-board lines, pads, chips and rings in a slightly darker tone
  ctx.save();
  ctx.scale(PPU, PPU); ctx.translate(MARGIN, MARGIN);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const r = mulberry32(777);
  const grid = 15;
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const snap = (v) => Math.round(v / grid) * grid;
  const line = 'rgba(120,84,44,0.17)', lineStrong = 'rgba(110,76,40,0.22)';
  for (let i = 0; i < 190; i++) {
    let x = snap(r() * REG.w - MARGIN), y = snap(r() * REG.h - MARGIN), dir = Math.floor(r() * 8);
    const steps = 3 + Math.floor(r() * 5);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < steps; s++) {
      const len = (1 + Math.floor(r() * 5)) * grid, dd = DIRS[dir], k = dd[0] && dd[1] ? 0.7071 : 1;
      x += dd[0] * len * k; y += dd[1] * len * k; ctx.lineTo(x, y);
      dir = (dir + (r() < 0.5 ? 1 : 7) * (r() < 0.75 ? 1 : 2)) % 8;
    }
    ctx.lineWidth = r() < 0.22 ? 2.1 : 1.1; ctx.strokeStyle = ctx.lineWidth > 1.5 ? lineStrong : line; ctx.stroke();
    ctx.lineWidth = 1; circle(ctx, x, y, 2.6);
    if (r() < 0.55) { ctx.strokeStyle = lineStrong; ctx.stroke(); } else { ctx.fillStyle = lineStrong; ctx.fill(); }
  }
  for (let i = 0; i < 16; i++) { // concentric pads
    const x = r() * REG.w - MARGIN, y = r() * REG.h - MARGIN;
    ctx.strokeStyle = line; ctx.lineWidth = 1.1;
    for (const rr of [7, 13, 20]) if (r() < 0.8) { circle(ctx, x, y, rr); ctx.stroke(); }
    circle(ctx, x, y, 2); ctx.fillStyle = lineStrong; ctx.fill();
  }
  for (let i = 0; i < 12; i++) { // chips with pins
    const w = 26 + r() * 34, h = 18 + r() * 22, x = snap(r() * REG.w - MARGIN), y = snap(r() * REG.h - MARGIN);
    ctx.strokeStyle = lineStrong; ctx.lineWidth = 1.3; ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 0.9; ctx.beginPath();
    for (let px = x + 5; px < x + w - 3; px += 6) { ctx.moveTo(px, y); ctx.lineTo(px, y - 4); ctx.moveTo(px, y + h); ctx.lineTo(px, y + h + 4); }
    for (let py = y + 5; py < y + h - 3; py += 6) { ctx.moveTo(x, py); ctx.lineTo(x - 4, py); ctx.moveTo(x + w, py); ctx.lineTo(x + w + 4, py); }
    ctx.stroke();
    circle(ctx, x + 5, y + 5, 1.6); ctx.fillStyle = lineStrong; ctx.fill();
  }
  // pebbles
  for (let i = 0; i < 1100; i++) {
    const x = r() * REG.w - MARGIN, y = r() * REG.h - MARGIN, rr = 0.4 + r() * 1.1;
    circle(ctx, x, y, rr); ctx.fillStyle = r() < 0.5 ? 'rgba(90,62,34,0.22)' : 'rgba(255,240,205,0.18)'; ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }

// ---------------------------------------------------------------- road
/** Path with a lead-in segment when the first point sits on the field border. */
function extendedPath(path) {
  const p = path.map((q) => [q[0], q[1]]);
  const [x, y] = p[0], [nx, ny] = p[1] || [x + 1, y];
  const onBorder = x <= 1 || x >= FIELD.width - 1 || y <= 1 || y >= FIELD.height - 1;
  if (onBorder) {
    let dx = x - nx, dy = y - ny; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    p.unshift([x + dx * ROAD_EXTEND, y + dy * ROAD_EXTEND]);
  }
  return p;
}

function buildSdf(path, data) {
  const W = REG.w * PPU, H = REG.h * PPU;
  const dist = new Float32Array(W * H).fill(DMAX);
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1];
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1;
    const minx = Math.max(0, Math.floor((Math.min(ax, bx) - DMAX - REG.x0) * PPU)), maxx = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + DMAX - REG.x0) * PPU));
    const miny = Math.max(0, Math.floor((Math.min(ay, by) - DMAX - REG.y0) * PPU)), maxy = Math.min(H - 1, Math.ceil((Math.max(ay, by) + DMAX - REG.y0) * PPU));
    for (let j = miny; j <= maxy; j++) {
      const py = REG.y0 + (j + 0.5) / PPU;
      for (let k = minx; k <= maxx; k++) {
        const px = REG.x0 + (k + 0.5) / PPU;
        let t = ((px - ax) * ex + (py - ay) * ey) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - (ax + ex * t), dy = py - (ay + ey * t);
        const dd = Math.sqrt(dx * dx + dy * dy), idx = j * W + k;
        if (dd < dist[idx]) dist[idx] = dd;
      }
    }
  }
  for (let i = 0; i < dist.length; i++) data[i] = Math.round(Math.min(1, dist[i] / DMAX) * 255);
}

// ---------------------------------------------------------------- compound
function drawCompound(base, pathEnd) {
  const S = 4, pad = 20, w = base.w, h = base.h;
  const canvas = newCanvas((w + pad * 2) * S, (h + pad * 2) * S);
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S); ctx.translate(pad, pad);
  // entry side + gate position
  const e = pathEnd || [base.x - 1, base.y + h / 2];
  const dists = { left: Math.abs(e[0] - base.x), right: Math.abs(e[0] - (base.x + w)), top: Math.abs(e[1] - base.y), bottom: Math.abs(e[1] - (base.y + h)) };
  const side = Object.keys(dists).sort((a, b) => dists[a] - dists[b])[0];
  const gate = (side === 'left' || side === 'right') ? clamp(e[1] - base.y, 18, h - 18) : clamp(e[0] - base.x, 18, w - 18);
  const GAP = 16; // half width of the gate opening

  // dirt apron + floor
  ctx.save(); ctx.shadowColor = 'rgba(40,26,12,0.55)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 1.5;
  rrect(ctx, 0, 0, w, h, 7); ctx.fillStyle = '#4a4338'; ctx.fill(); ctx.restore();
  rrect(ctx, 1.8, 1.8, w - 3.6, h - 3.6, 5.5);
  const fg = ctx.createLinearGradient(0, 0, w, h); fg.addColorStop(0, '#8a8174'); fg.addColorStop(1, '#6a6256');
  ctx.fillStyle = fg; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(30,24,16,0.7)'; ctx.stroke();
  ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(30,24,16,0.14)'; ctx.lineWidth = 0.35; ctx.beginPath();
  for (let x = 14; x < w; x += 14) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 14; y < h; y += 14) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke(); ctx.restore();

  const mirror = side === 'left';
  const padX = w * (mirror ? 0.67 : 0.33), bunkX = w * (mirror ? 0.3 : 0.72), cy = h / 2;
  // landing pad
  circle(ctx, padX, cy, 21); ctx.fillStyle = '#464a52'; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = '#1f2227'; ctx.stroke();
  circle(ctx, padX, cy, 18); ctx.lineWidth = 1.3; ctx.strokeStyle = '#f2d24b'; ctx.stroke();
  ctx.fillStyle = '#f0f0e8'; ctx.fillRect(padX - 6.5, cy - 8, 2.6, 16); ctx.fillRect(padX + 3.9, cy - 8, 2.6, 16); ctx.fillRect(padX - 4, cy - 1.2, 8, 2.4);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; circle(ctx, padX + Math.cos(a) * 19.6, cy + Math.sin(a) * 19.6, 1); ctx.fillStyle = '#ffb347'; ctx.fill(); }
  // bunker
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.6;
  rrect(ctx, bunkX - 17, cy - 13, 34, 26, 3); ctx.fillStyle = '#555c66'; ctx.fill(); ctx.restore();
  rrect(ctx, bunkX - 17, cy - 13, 34, 26, 3);
  const bg = ctx.createLinearGradient(0, cy - 13, 0, cy + 13); bg.addColorStop(0, '#a4adb8'); bg.addColorStop(1, '#5c646f');
  ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = '#1d2026'; ctx.stroke();
  rrect(ctx, bunkX - 13, cy - 9, 26, 18, 2); ctx.fillStyle = '#3d444e'; ctx.fill(); ctx.lineWidth = 0.4; ctx.stroke();
  circle(ctx, bunkX - 4, cy, 4.6); ctx.fillStyle = '#2a2f37'; ctx.fill(); ctx.strokeStyle = '#9aa4b0'; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.fillStyle = '#242830'; for (let i = 0; i < 4; i++) ctx.fillRect(bunkX + 4, cy - 6 + i * 3.2, 7, 1.4);
  // barrels + crates
  for (const [bx, by] of [[w - 11, h - 10], [w - 17, h - 8], [10, h - 11]]) { circle(ctx, bx, by, 3); ctx.fillStyle = '#d2622b'; ctx.fill(); ctx.lineWidth = 0.4; ctx.strokeStyle = '#4a1d0a'; ctx.stroke(); circle(ctx, bx, by, 1.6); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke(); }
  rrect(ctx, 6, 6, 8, 8, 1); ctx.fillStyle = '#9a7a4a'; ctx.fill(); ctx.lineWidth = 0.5; ctx.strokeStyle = '#3c2c14'; ctx.stroke();

  // fence with a gate gap
  const I = 3; // inset
  const edges = [
    { n: 'top', x0: I, y0: I, x1: w - I, y1: I }, { n: 'right', x0: w - I, y0: I, x1: w - I, y1: h - I },
    { n: 'bottom', x0: w - I, y0: h - I, x1: I, y1: h - I }, { n: 'left', x0: I, y0: h - I, x1: I, y1: I },
  ];
  const horizontal = (n) => n === 'top' || n === 'bottom';
  const posts = [];
  ctx.lineCap = 'round';
  for (const ed of edges) {
    const len = Math.hypot(ed.x1 - ed.x0, ed.y1 - ed.y0);
    const ux = (ed.x1 - ed.x0) / len, uy = (ed.y1 - ed.y0) / len;
    // t-range along this edge in 0..len; gate centre in edge coordinates
    let spans = [[0, len]];
    let gc = -1; // gate centre as distance along this edge
    if (ed.n === side) {
      const gl = horizontal(side) ? [gate, side === 'top' ? I : h - I] : [side === 'left' ? I : w - I, gate];
      gc = (gl[0] - ed.x0) * ux + (gl[1] - ed.y0) * uy;
      spans = [[0, Math.max(0, gc - GAP)], [Math.min(len, gc + GAP), len]];
    }
    for (const [a, b] of spans) {
      if (b - a < 0.5) continue;
      ctx.beginPath(); ctx.moveTo(ed.x0 + ux * a + 0.5, ed.y0 + uy * a + 0.9); ctx.lineTo(ed.x0 + ux * b + 0.5, ed.y0 + uy * b + 0.9);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(20,16,10,0.55)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ed.x0 + ux * a, ed.y0 + uy * a); ctx.lineTo(ed.x0 + ux * b, ed.y0 + uy * b);
      ctx.lineWidth = 1.1; ctx.strokeStyle = '#6a727c'; ctx.stroke();
      ctx.lineWidth = 0.45; ctx.strokeStyle = '#d3dae2'; ctx.stroke();
      for (let t = a; t <= b + 0.01; t += 11) posts.push([ed.x0 + ux * Math.min(t, b), ed.y0 + uy * Math.min(t, b), false]);
      posts.push([ed.x0 + ux * b, ed.y0 + uy * b, false]);
    }
    if (ed.n === side) { // gate pillars
      for (const o of [gc - GAP, gc + GAP]) posts.push([ed.x0 + ux * o, ed.y0 + uy * o, true]);
    }
  }
  for (const [x, y, big] of posts) {
    circle(ctx, x, y, big ? 2.4 : 1.15); ctx.fillStyle = big ? '#8d96a1' : '#d4dae0'; ctx.fill(); ctx.lineWidth = 0.35; ctx.strokeStyle = '#20242a'; ctx.stroke();
  }
  for (const [x, y] of [[I, I], [w - I, I], [w - I, h - I], [I, h - I]]) { circle(ctx, x, y, 2); ctx.fillStyle = '#b9c1ca'; ctx.fill(); ctx.lineWidth = 0.4; ctx.strokeStyle = '#20242a'; ctx.stroke(); }

  // flag pole (cloth is animated separately)
  const fx = side === 'right' ? 12 : w - 12, fy = side === 'bottom' ? 12 : h - 12;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 2; ctx.shadowOffsetX = 1.4; ctx.shadowOffsetY = 1.8;
  circle(ctx, fx, fy, 2.3); ctx.fillStyle = '#9aa3ad'; ctx.fill(); ctx.restore();
  circle(ctx, fx, fy, 1.3); ctx.fillStyle = '#e8edf2'; ctx.fill();

  const gateAbs = horizontal(side) ? [base.x + gate, side === 'top' ? base.y + I : base.y + h - I] : [side === 'left' ? base.x + I : base.x + w - I, base.y + gate];
  return {
    canvas, pad, side,
    flag: [base.x + fx, base.y + fy, fx > w / 2],
    beacon: [base.x + bunkX + 9.5, base.y + cy - 7.5],
    gate: gateAbs, gateLights: horizontal(side) ? [[gateAbs[0] - GAP, gateAbs[1]], [gateAbs[0] + GAP, gateAbs[1]]] : [[gateAbs[0], gateAbs[1] - GAP], [gateAbs[0], gateAbs[1] + GAP]],
  };
}
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- Terrain
export class Terrain {
  /** @param fxTexture the shared fx atlas texture */
  constructor(scene, fxTexture) {
    this.mapKey = null;
    this.groundTex = buildGroundTexture();
    const W = REG.w * PPU, H = REG.h * PPU;
    this.sdfData = new Uint8Array(W * H).fill(255);
    this.sdfTex = new THREE.DataTexture(this.sdfData, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    this.sdfTex.minFilter = THREE.LinearFilter; this.sdfTex.magFilter = THREE.LinearFilter;
    this.sdfTex.generateMipmaps = false; this.sdfTex.unpackAlignment = 1; this.sdfTex.needsUpdate = true;

    const geo = new THREE.BufferGeometry();
    const x0 = REG.x0, x1 = REG.x0 + REG.w, y0 = -(REG.y0 + REG.h), y1 = -REG.y0;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.uniforms = {
      uGround: { value: this.groundTex }, uSdf: { value: this.sdfTex },
      uRegion: { value: new THREE.Vector4(REG.x0, REG.y0, REG.w, REG.h) },
      uHalfRoad: { value: 14 }, uWpp: { value: 1 }, uDmax: { value: DMAX }, uHasRoad: { value: 0 },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 0;
    scene.add(this.mesh);

    // static road dashes and the compound (own textures), plus tiny dynamic batches
    this.white = cellUV(FX.white, 70);
    this.dashes = new SpriteBatch(fxTexture, 600, { order: 1 });
    scene.add(this.dashes.mesh);
    this.compoundTex = null;
    this.compound = new SpriteBatch(fxTexture, 2, { order: 2 });
    scene.add(this.compound.mesh);
    this.dyn = new SpriteBatch(fxTexture, 8, { order: 2.5 });          // flag cloth
    this.dynAdd = new SpriteBatch(fxTexture, 8, { additive: true, order: 2.6 }); // beacons
    scene.add(this.dyn.mesh); scene.add(this.dynAdd.mesh);
    this.fxCells = { flag: cellUV(FX.flag), glow: cellUV(FX.glow) };
    this.info = null;
  }

  setMap(map) {
    const key = map ? map.id + '|' + map.path.length + '|' + map.roadWidth + '|' + (map.base ? map.base.x + ',' + map.base.y : '') : null;
    if (key === this.mapKey) return;
    this.mapKey = key;
    this.dashes.begin(); this.dashes.end(); this.compound.begin(); this.compound.end();
    this.info = null;
    if (!map) { this.uniforms.uHasRoad.value = 0; return; }

    const path = extendedPath(map.path);
    buildSdf(path, this.sdfData);
    this.sdfTex.needsUpdate = true;
    this.uniforms.uHalfRoad.value = (map.roadWidth || FIELD.roadWidth) / 2;
    this.uniforms.uHasRoad.value = 1;

    // dashes
    const STEP = 16, LEN = 7;
    let carry = 8;
    for (let i = 0; i + 1 < path.length; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1];
      const l = Math.hypot(bx - ax, by - ay); if (l < 1e-3) continue;
      const ux = (bx - ax) / l, uy = (by - ay) / l, rot = Math.atan2(uy, ux);
      let s = carry;
      for (; s <= l; s += STEP) {
        if (s - LEN / 2 < 2 || s + LEN / 2 > l - 2) continue; // never straddle a corner
        this.dashes.add(ax + ux * s, ay + uy * s, rot, LEN, 1.5, this.white, 1.0, 0.93, 0.72, 0.30);
      }
      carry = s - l;
    }
    this.dashes.end();

    // compound
    if (map.base) {
      const end = map.path[map.path.length - 1];
      const info = drawCompound(map.base, end);
      this.info = info;
      if (this.compoundTex) this.compoundTex.dispose();
      const t = new THREE.CanvasTexture(info.canvas);
      t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
      this.compoundTex = t;
      this.compound.setTexture(t);
      this.compound.begin();
      this.compound.add(map.base.x + map.base.w / 2, map.base.y + map.base.h / 2, 0, map.base.w + info.pad * 2, map.base.h + info.pad * 2, { u0: 0, v0: 0, u1: 1, v1: 1 }, 1, 1, 1, 1);
      this.compound.end();
    }
  }

  /** Per-frame: animate flag and beacons, update AA width. */
  update(t, wpp) {
    this.uniforms.uWpp.value = wpp;
    const i = this.info;
    this.dyn.begin(); this.dynAdd.begin();
    if (i) {
      const wave = Math.sin(t * 3.1) * 0.14 + Math.sin(t * 5.3 + 1) * 0.05;
      const dirRight = !i.flag[2];
      const rot = (dirRight ? 0 : Math.PI) + wave;
      const L = 15, ox = Math.cos(rot) * L * 0.5, oy = Math.sin(rot) * L * 0.5;
      this.dyn.add(i.flag[0] + ox, i.flag[1] + oy, rot, L * (1 + Math.sin(t * 4.2) * 0.04), 10, this.fxCells.flag, 1, 1, 1, 1);
      const blink = (Math.floor(t * 1.6) % 2) ? 1 : 0.25;
      this.dynAdd.add(i.beacon[0], i.beacon[1], 0, 9, 9, this.fxCells.glow, 1, 0.2, 0.15, blink);
      const g = 0.7 + 0.3 * Math.sin(t * 2.5);
      this.dynAdd.add(i.gateLights[0][0], i.gateLights[0][1], 0, 8, 8, this.fxCells.glow, 0.3, 1, 0.45, g);
      this.dynAdd.add(i.gateLights[1][0], i.gateLights[1][1], 0, 8, 8, this.fxCells.glow, 0.3, 1, 0.45, g);
    }
    this.dyn.end(); this.dynAdd.end();
  }
}
