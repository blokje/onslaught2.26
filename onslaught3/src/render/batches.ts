// Instanced quad batches. Everything the renderer draws (sprites, rings, beams, text) goes through
// these two classes, so a full frame is ~25 draw calls regardless of entity count.
//
// Coordinates passed to add() are WORLD coordinates (x right, y down). The vertex shader flips y
// into three.js space. All colours are raw 0..1 floats (no colour management anywhere).

import * as THREE from 'three';

const SPRITE_STRIDE = 13; // x y rot | sx sy | u0 v0 u1 v1 | r g b a
const RING_STRIDE = 15;   // x y R | width fill soft dash | start sweep ticks clip | r g b a

/** Texture rectangle of one sprite (texture coords; v0 = top row of the canvas). */
export interface Cell { u0: number; v0: number; u1: number; v1: number }

interface BatchOptions { additive?: boolean; order?: number }
interface GeometryParts { geometry: THREE.InstancedBufferGeometry; data: Float32Array; buf: THREE.InstancedInterleavedBuffer }

function makeGeometry(stride: number, capacity: number, attrs: [string, number][]): GeometryParts {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const data = new Float32Array(stride * capacity);
  const buf = new THREE.InstancedInterleavedBuffer(data, stride, 1);
  buf.setUsage(THREE.DynamicDrawUsage);
  let off = 0;
  for (const [name, size] of attrs) {
    g.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, size, off));
    off += size;
  }
  g.instanceCount = 0;
  return { geometry: g, data, buf };
}

const SPRITE_VERT = /* glsl */ `
attribute vec3 aPR; attribute vec2 aSize; attribute vec4 aUV; attribute vec4 aCol;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec2 l = position.xy * aSize;                       // local y is DOWN (world convention)
  float c = cos(aPR.z), s = sin(aPR.z);
  vec2 w = aPR.xy + vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  vUv = vec2(aUV.x + (position.x + 0.5) * (aUV.z - aUV.x), aUV.y + (position.y + 0.5) * (aUV.w - aUV.y));
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(w.x, -w.y, 0.0, 1.0);
}`;

const SPRITE_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
}`;

const RING_VERT = /* glsl */ `
attribute vec3 aPR; attribute vec4 aW; attribute vec4 aArc; attribute vec4 aCol;
uniform float uWpp;
varying vec2 vLocal; varying vec3 vPR; varying vec4 vW; varying vec4 vArc; varying vec4 vCol;
void main() {
  float h = aPR.z + aW.x * 0.5 + uWpp * 2.0;
  vec2 l = position.xy * 2.0 * h;
  vLocal = l; vPR = aPR; vW = aW; vArc = aArc; vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(aPR.x + l.x, -(aPR.y + l.y), 0.0, 1.0);
}`;

const RING_FRAG = /* glsl */ `
uniform float uWpp; uniform float uTime;
varying vec2 vLocal; varying vec3 vPR; varying vec4 vW; varying vec4 vArc; varying vec4 vCol;
void main() {
  float R = vPR.z;
  float r = length(vLocal);
  float hw = vW.x * 0.5;
  float aa = uWpp;
  float d = abs(r - R);
  float line = 1.0 - smoothstep(hw * (1.0 - vW.z), hw + aa, d);
  if (vW.w > 0.5) {
    float ang = atan(vLocal.y, vLocal.x) / 6.2831853;
    float m = fract(ang * vW.w + uTime * 0.08);
    line *= smoothstep(0.0, 0.06, m) * (1.0 - smoothstep(0.5, 0.56, m));
  }
  if (vArc.y > 0.0) {
    // arc: s = arc length clockwise (on screen) from start; keep [0, sweep * clip], AA in world units
    float circ = 6.2831853 * R;
    float s = fract(atan(vLocal.y, vLocal.x) / 6.2831853 - vArc.x) * circ;
    float len = vArc.y * circ;
    float end = len * vArc.w;
    float sd = s <= end ? -min(s, end - s) : min(s - end, circ - s);
    line *= 1.0 - smoothstep(-aa * 0.5, aa * 0.5, sd);
    if (vArc.z > 0.5) {
      // ticks: sweep split into vArc.z equal ticks with a fixed world-unit gap
      float tl = len / vArc.z;
      float m = mod(s, tl);
      float e = min(m - 0.45, tl - 0.45 - m);
      line *= smoothstep(-aa * 0.5, aa * 0.5, e);
    }
  }
  float fillM = (1.0 - smoothstep(R - aa, R + aa, r)) * vW.y;
  float a = line + fillM * (1.0 - line);
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}`;

function baseMaterial(additive: boolean, extra: THREE.ShaderMaterialParameters): THREE.ShaderMaterialParameters {
  return Object.assign({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }, extra);
}

/** Textured instanced quads. cell = {u0,v0,u1,v1} (texture coords, v0 = top row of the canvas). */
export class SpriteBatch {
  capacity: number;
  count: number;
  geometry: THREE.InstancedBufferGeometry;
  data: Float32Array;
  buf: THREE.InstancedInterleavedBuffer;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  constructor(texture: THREE.Texture, capacity: number, { additive = false, order = 0 }: BatchOptions = {}) {
    this.capacity = capacity;
    this.count = 0;
    const { geometry, data, buf } = makeGeometry(SPRITE_STRIDE, capacity, [['aPR', 3], ['aSize', 2], ['aUV', 4], ['aCol', 4]]);
    this.geometry = geometry; this.data = data; this.buf = buf;
    this.material = new THREE.ShaderMaterial(baseMaterial(additive, {
      uniforms: { map: { value: texture } }, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
    }));
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
  }
  setTexture(t: THREE.Texture): void { this.material.uniforms.map.value = t; }
  begin(): void { this.count = 0; }
  add(x: number, y: number, rot: number, sx: number, sy: number, cell: Cell, r: number, g: number, b: number, a: number): void {
    if (this.count >= this.capacity) return;
    const d = this.data;
    let o = this.count++ * SPRITE_STRIDE;
    d[o++] = x; d[o++] = y; d[o++] = rot; d[o++] = sx; d[o++] = sy;
    d[o++] = cell.u0; d[o++] = cell.v0; d[o++] = cell.u1; d[o++] = cell.v1;
    d[o++] = r; d[o++] = g; d[o++] = b; d[o] = a;
  }
  /** Line segment as a stretched quad (cell should be a horizontal band such as the beam cell). */
  line(x1: number, y1: number, x2: number, y2: number, width: number, cell: Cell, r: number, g: number, b: number, a: number): void {
    const dx = x2 - x1, dy = y2 - y1;
    this.add((x1 + x2) * 0.5, (y1 + y2) * 0.5, Math.atan2(dy, dx), Math.hypot(dx, dy), width, cell, r, g, b, a);
  }
  end(): void {
    this.geometry.instanceCount = this.count;
    this.buf.needsUpdate = true;
    this.mesh.visible = this.count > 0;
  }
  dispose(): void { this.geometry.dispose(); this.material.dispose(); }
}

/** Procedural rings / discs with screen-constant AA. width is in WORLD units. */
export class RingBatch {
  capacity: number;
  count: number;
  geometry: THREE.InstancedBufferGeometry;
  data: Float32Array;
  buf: THREE.InstancedInterleavedBuffer;
  uniforms: { uWpp: { value: number }; uTime: { value: number } };
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  constructor(capacity: number, { additive = false, order = 0 }: BatchOptions = {}) {
    this.capacity = capacity;
    this.count = 0;
    const { geometry, data, buf } = makeGeometry(RING_STRIDE, capacity, [['aPR', 3], ['aW', 4], ['aArc', 4], ['aCol', 4]]);
    this.geometry = geometry; this.data = data; this.buf = buf;
    this.uniforms = { uWpp: { value: 1 }, uTime: { value: 0 } };
    this.material = new THREE.ShaderMaterial(baseMaterial(additive, {
      uniforms: this.uniforms, vertexShader: RING_VERT, fragmentShader: RING_FRAG,
    }));
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
  }
  begin(wpp: number, t: number): void { this.count = 0; this.uniforms.uWpp.value = wpp; this.uniforms.uTime.value = t; }
  /** width: stroke width (world units). fill: 0..1 disc fill alpha. soft: 0..1 edge softness. dash: dash count (0 = solid). */
  add(x: number, y: number, R: number, width: number, fill: number, soft: number, dash: number, r: number, g: number, b: number, a: number): void {
    if (this.count >= this.capacity) return;
    const d = this.data;
    let o = this.count++ * RING_STRIDE;
    d[o++] = x; d[o++] = y; d[o++] = R;
    d[o++] = width; d[o++] = fill; d[o++] = soft; d[o++] = dash;
    d[o++] = 0; d[o++] = 0; d[o++] = 0; d[o++] = 1;
    d[o++] = r; d[o++] = g; d[o++] = b; d[o] = a;
  }
  /** Partial ring. start: circle fraction (0 = right, 0.25 = down, clockwise on screen). sweep: 0..1 of the circle.
   *  ticks: equal ticks with a small gap (0 = solid). clip: 0..1 of the sweep that is drawn (fill level). */
  arc(x: number, y: number, R: number, width: number, start: number, sweep: number, ticks: number, clip: number, r: number, g: number, b: number, a: number): void {
    if (this.count >= this.capacity || sweep <= 0 || clip <= 0) return;
    const d = this.data;
    let o = this.count++ * RING_STRIDE;
    d[o++] = x; d[o++] = y; d[o++] = R;
    d[o++] = width; d[o++] = 0; d[o++] = 0; d[o++] = 0;
    d[o++] = start; d[o++] = Math.min(sweep, 1); d[o++] = ticks; d[o++] = Math.min(clip, 1);
    d[o++] = r; d[o++] = g; d[o++] = b; d[o] = a;
  }
  end(): void {
    this.geometry.instanceCount = this.count;
    this.buf.needsUpdate = true;
    this.mesh.visible = this.count > 0;
  }
  dispose(): void { this.geometry.dispose(); this.material.dispose(); }
}
