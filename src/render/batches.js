// Instanced quad batches. Everything the renderer draws (sprites, rings, beams, text) goes through
// these two classes, so a full frame is ~25 draw calls regardless of entity count.
//
// Coordinates passed to add() are WORLD coordinates (x right, y down). The vertex shader flips y
// into three.js space. All colours are raw 0..1 floats (no colour management anywhere).

import * as THREE from 'three';

const SPRITE_STRIDE = 13; // x y rot | sx sy | u0 v0 u1 v1 | r g b a
const RING_STRIDE = 11;   // x y R | width fill soft dash | r g b a

function makeGeometry(stride, capacity, attrs) {
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
attribute vec3 aPR; attribute vec4 aW; attribute vec4 aCol;
uniform float uWpp;
varying vec2 vLocal; varying vec3 vPR; varying vec4 vW; varying vec4 vCol;
void main() {
  float h = aPR.z + aW.x * 0.5 + uWpp * 2.0;
  vec2 l = position.xy * 2.0 * h;
  vLocal = l; vPR = aPR; vW = aW; vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(aPR.x + l.x, -(aPR.y + l.y), 0.0, 1.0);
}`;

const RING_FRAG = /* glsl */ `
uniform float uWpp; uniform float uTime;
varying vec2 vLocal; varying vec3 vPR; varying vec4 vW; varying vec4 vCol;
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
  float fillM = (1.0 - smoothstep(R - aa, R + aa, r)) * vW.y;
  float a = line + fillM * (1.0 - line);
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}`;

function baseMaterial(additive, extra) {
  return Object.assign({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }, extra);
}

/** Textured instanced quads. cell = {u0,v0,u1,v1} (texture coords, v0 = top row of the canvas). */
export class SpriteBatch {
  constructor(texture, capacity, { additive = false, order = 0 } = {}) {
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
  setTexture(t) { this.material.uniforms.map.value = t; }
  begin() { this.count = 0; }
  add(x, y, rot, sx, sy, cell, r, g, b, a) {
    if (this.count >= this.capacity) return;
    const d = this.data;
    let o = this.count++ * SPRITE_STRIDE;
    d[o++] = x; d[o++] = y; d[o++] = rot; d[o++] = sx; d[o++] = sy;
    d[o++] = cell.u0; d[o++] = cell.v0; d[o++] = cell.u1; d[o++] = cell.v1;
    d[o++] = r; d[o++] = g; d[o++] = b; d[o] = a;
  }
  /** Line segment as a stretched quad (cell should be a horizontal band such as the beam cell). */
  line(x1, y1, x2, y2, width, cell, r, g, b, a) {
    const dx = x2 - x1, dy = y2 - y1;
    this.add((x1 + x2) * 0.5, (y1 + y2) * 0.5, Math.atan2(dy, dx), Math.hypot(dx, dy), width, cell, r, g, b, a);
  }
  end() {
    this.geometry.instanceCount = this.count;
    this.buf.needsUpdate = true;
    this.mesh.visible = this.count > 0;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/** Procedural rings / discs with screen-constant AA. width is in WORLD units. */
export class RingBatch {
  constructor(capacity, { additive = false, order = 0 } = {}) {
    this.capacity = capacity;
    this.count = 0;
    const { geometry, data, buf } = makeGeometry(RING_STRIDE, capacity, [['aPR', 3], ['aW', 4], ['aCol', 4]]);
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
  begin(wpp, t) { this.count = 0; this.uniforms.uWpp.value = wpp; this.uniforms.uTime.value = t; }
  /** width: stroke width (world units). fill: 0..1 disc fill alpha. soft: 0..1 edge softness. dash: dash count (0 = solid). */
  add(x, y, R, width, fill, soft, dash, r, g, b, a) {
    if (this.count >= this.capacity) return;
    const d = this.data;
    let o = this.count++ * RING_STRIDE;
    d[o++] = x; d[o++] = y; d[o++] = R;
    d[o++] = width; d[o++] = fill; d[o++] = soft; d[o++] = dash;
    d[o++] = r; d[o++] = g; d[o++] = b; d[o] = a;
  }
  end() {
    this.geometry.instanceCount = this.count;
    this.buf.needsUpdate = true;
    this.mesh.visible = this.count > 0;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
