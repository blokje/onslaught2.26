// [OS3] 3D view camera: a perspective camera orbiting a target point on the ground.
// World coordinates stay x right, y down (720 x 450); three.js space is (x, -y, z) with z up, the same mapping the
// batches use. Picking casts a ray onto the ground plane z = 0, so building and selecting stay exact.
// No DOM access here: the canvas rectangle comes from a callback, so the maths runs (and is tested) in Node.

import * as THREE from 'three';
import { FIELD } from '../data/rules.ts';
import { clamp } from './util.ts';
import type { ViewInsets } from '../types.ts';

export const PITCH_DEFAULT = 0.96;          // about 55 degrees above the ground
export const PITCH_MIN = 0.6, PITCH_MAX = 1.35;
const FOV = 38;                               // vertical field of view, degrees

type RectFn = () => { left: number; top: number };

export class View3D {
  camera: THREE.PerspectiveCamera;
  /** Ground point (world units) the camera looks at, at the centre of the free area. */
  tx = FIELD.width / 2; ty = FIELD.height / 2;
  yaw = 0; pitch = PITCH_DEFAULT;
  /** Distance at zoom 1 (chosen by fit()). */
  fitDist = 800;
  zoom = 1;
  W = 1; H = 1;
  insets: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  rect: RectFn;
  /** Extra target offset (world units) for screen shake; not part of picking. */
  shakeX = 0; shakeY = 0;
  _ray = new THREE.Raycaster();
  _v = new THREE.Vector3();
  _n = new THREE.Vector2();
  constructor(rect: RectFn) {
    this.rect = rect;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 5, 20000);
    this.camera.up.set(0, 0, 1);
  }

  get dist(): number { return this.fitDist / this.zoom; }

  /** Place the camera from target, yaw, pitch and distance; call after any change. */
  update(): void {
    const cam = this.camera, d = this.dist, c = Math.cos(this.pitch) * d;
    const tx = this.tx + this.shakeX, ty = this.ty + this.shakeY;
    // yaw 0: the camera stands south of the target (larger world y), looking north
    cam.position.set(tx + Math.sin(this.yaw) * c, -(ty + Math.cos(this.yaw) * c), Math.sin(this.pitch) * d);
    cam.lookAt(tx, -ty, 0);
    cam.aspect = this.W / this.H;
    const off = this._offset();
    cam.setViewOffset(this.W, this.H, -off.x, -off.y, this.W, this.H); // target appears at the free-area centre
    cam.near = Math.max(1, d * 0.05); cam.far = d * 6 + 4000;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  _offset(): { x: number; y: number } { const i = this.insets; return { x: (i.left - i.right) / 2, y: (i.top - i.bottom) / 2 }; }

  setSize(w: number, h: number): void { this.W = Math.max(1, w); this.H = Math.max(1, h); this.fit(); }
  setInsets(i: Partial<ViewInsets>): void { Object.assign(this.insets, i); this.fit(); }

  /** Start rotation: in a portrait free area the field turns a quarter so its long side runs up the screen. */
  defaultYaw(): number {
    const i = this.insets;
    return this.H - i.top - i.bottom > (this.W - i.left - i.right) * 1.15 ? Math.PI / 2 : 0;
  }

  /** Choose fitDist so the whole field fits in the free area (with the default yaw and the current pitch). */
  fit(): void {
    const save = { tx: this.tx, ty: this.ty, yaw: this.yaw, zoom: this.zoom, sx: this.shakeX, sy: this.shakeY };
    this.tx = FIELD.width / 2; this.ty = FIELD.height / 2; this.yaw = this.defaultYaw(); this.zoom = 1; this.shakeX = this.shakeY = 0;
    const m = Math.max(10, Math.min(this.W, this.H) * 0.03), i = this.insets;
    const x0 = i.left + m, x1 = this.W - i.right - m, y0 = i.top + m, y1 = this.H - i.bottom - m;
    const fits = (): boolean => {
      this.update();
      for (const [wx, wy] of [[0, 0], [FIELD.width, 0], [0, FIELD.height], [FIELD.width, FIELD.height]]) {
        const p = this._project(wx, wy);
        if (!p || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return false;
      }
      return true;
    };
    let lo = 50, hi = 50000;
    for (let k = 0; k < 40; k++) { const mid = Math.sqrt(lo * hi); this.fitDist = mid; if (fits()) hi = mid; else lo = mid; }
    this.fitDist = hi;
    Object.assign(this, { tx: save.tx, ty: save.ty, yaw: save.yaw, zoom: save.zoom, shakeX: save.sx, shakeY: save.sy });
    this.clampTarget();
    this.update();
  }

  reset(): void { this.tx = FIELD.width / 2; this.ty = FIELD.height / 2; this.yaw = this.defaultYaw(); this.pitch = PITCH_DEFAULT; this.zoom = 1; this.fit(); }

  clampTarget(): void { this.tx = clamp(this.tx, 0, FIELD.width); this.ty = clamp(this.ty, 0, FIELD.height); }

  /** Canvas-local pixel of a world ground point (null when behind the camera). */
  _project(x: number, y: number, z: number = 0): { x: number; y: number } | null {
    const v = this._v.set(x, -y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H };
  }

  /** Ground point under a canvas-local pixel. Above the horizon it returns a far point in that direction. */
  _pick(px: number, py: number): { x: number; y: number } {
    this._n.set(px / this.W * 2 - 1, 1 - py / this.H * 2);
    this._ray.setFromCamera(this._n, this.camera);
    const o = this._ray.ray.origin, d = this._ray.ray.direction;
    const t = d.z < -1e-4 ? -o.z / d.z : this.dist * 8;
    return { x: o.x + d.x * t, y: -(o.y + d.y * t) };
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.rect();
    return this._pick(clientX - r.left, clientY - r.top);
  }
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const r = this.rect(), p = this._project(x, y) || { x: -1e5, y: -1e5 };
    return { x: r.left + p.x, y: r.top + p.y };
  }

  /** Keep the ground point `w` under the canvas-local pixel (px, py) by moving the target. */
  keepUnder(w: { x: number; y: number }, px: number, py: number): void {
    this.update();
    const now = this._pick(px, py);
    this.tx += w.x - now.x; this.ty += w.y - now.y;
    this.clampTarget();
    this.update();
  }

  zoomAt(newZoom: number, px: number, py: number, min: number, max: number): void {
    const w = this._pick(px, py);
    this.zoom = clamp(newZoom, min, max);
    this.keepUnder(w, px, py);
  }

  /** Drag the ground by (dx, dy) CSS pixels. */
  panBy(dx: number, dy: number): void {
    const cx = this.W / 2, cy = this.H / 2;
    const a = this._pick(cx, cy), b = this._pick(cx - dx, cy - dy);
    const lim = this.dist; // a drag near the horizon must not throw the view away
    this.tx += clamp(b.x - a.x, -lim, lim); this.ty += clamp(b.y - a.y, -lim, lim);
    this.clampTarget();
    this.update();
  }

  rotate(dYaw: number, dPitch: number = 0): void {
    this.yaw = Math.atan2(Math.sin(this.yaw + dYaw), Math.cos(this.yaw + dYaw));
    this.pitch = clamp(this.pitch + dPitch, PITCH_MIN, PITCH_MAX);
    this.update();
  }

  /** World units per CSS pixel at the target (used for screen-constant line widths). */
  wpp(): number { return 2 * this.dist * Math.tan(FOV * Math.PI / 360) / this.H; }
}
