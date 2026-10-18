// Camera state + input. World coordinates: x right, y down, field 720 x 450.
// scale = CSS pixels per world unit = fitScale * zoom. The orthographic camera is configured from this.
//
// Input rules: left button / single touch are NEVER consumed (the UI owns them). We only react to
//   - wheel (zoom toward cursor),
//   - middle / right button drag (pan), context menu suppressed,
//   - two touch pointers (pinch zoom + two-finger pan).

import { FIELD } from '../data/rules.ts';
import { clamp } from './util.ts';
import type { ViewInsets } from '../types.ts';

interface Pair { mx: number; my: number; dist: number }
type Handlers = Record<string, EventListener>;

export const ZOOM_MIN = 0.5, ZOOM_MAX = 4;

export class CameraController {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  zoom: number;
  cx: number;
  cy: number;
  insets: ViewInsets;
  fitScale: number;
  touches: Map<number, { x: number; y: number }>;
  gesture: Pair | null;
  pan: { id: number; x: number; y: number } | null;
  _h!: Handlers; // set in _bind()
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.W = 1; this.H = 1;          // CSS pixel size of the canvas
    this.zoom = 1;                   // relative to the fitted view
    this.cx = FIELD.width / 2; this.cy = FIELD.height / 2; // world point at the centre of the free area
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.fitScale = 1;
    this.touches = new Map();        // pointerId -> {x, y} (client px)
    this.gesture = null;             // { mx, my, dist }
    this.pan = null;                 // { id, x, y }
    this._bind();
  }

  get scale(): number { return this.fitScale * this.zoom; }

  /** Free-area centre offset (px) from the canvas centre, caused by UI insets. */
  _offset(): { x: number; y: number } { return { x: (this.insets.left - this.insets.right) / 2, y: (this.insets.top - this.insets.bottom) / 2 }; }

  setSize(w: number, h: number): void {
    this.W = Math.max(1, w); this.H = Math.max(1, h);
    this._fit();
    this._clamp();
  }
  setInsets(i: Partial<ViewInsets>): void { Object.assign(this.insets, i); this._fit(); this._clamp(); }

  _fit(): void {
    const m = Math.max(10, Math.min(this.W, this.H) * 0.03);
    const aw = Math.max(50, this.W - this.insets.left - this.insets.right - 2 * m);
    const ah = Math.max(50, this.H - this.insets.top - this.insets.bottom - 2 * m);
    this.fitScale = Math.min(aw / FIELD.width, ah / FIELD.height);
  }

  reset(): void { this.zoom = 1; this.cx = FIELD.width / 2; this.cy = FIELD.height / 2; this._clamp(); }

  /** Keep at least `keep` pixels of the field visible on each axis. */
  _clamp(): void {
    const s = this.scale;
    const keep = Math.min(160, Math.min(this.W, this.H) * 0.25);
    const cl = (c: number, size: number, half: number): number => {
      const lo = -half + keep / s, hi = size + half - keep / s;
      return lo > hi ? size / 2 : clamp(c, lo, hi);
    };
    // world centre of the canvas = cx - offset/scale (free-area centre is cx). Clamp the canvas-centre world point.
    const off = this._offset();
    let wx = this.cx - off.x / s, wy = this.cy - off.y / s;
    wx = cl(wx, FIELD.width, this.W / 2 / s); wy = cl(wy, FIELD.height, this.H / 2 / s);
    this.cx = wx + off.x / s; this.cy = wy + off.y / s;
  }

  /** World point at the centre of the canvas (what the three.js camera looks at). */
  center(): { x: number; y: number } { const off = this._offset(); return { x: this.cx - off.x / this.scale, y: this.cy - off.y / this.scale }; }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect(), c = this.center(), s = this.scale;
    return { x: c.x + (clientX - r.left - this.W / 2) / s, y: c.y + (clientY - r.top - this.H / 2) / s };
  }
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect(), c = this.center(), s = this.scale;
    return { x: r.left + this.W / 2 + (x - c.x) * s, y: r.top + this.H / 2 + (y - c.y) * s };
  }

  /** Zoom to `newZoom` keeping the world point under client (px, py) fixed. */
  zoomAt(newZoom: number, clientX: number, clientY: number): void {
    const before = this.screenToWorld(clientX, clientY);
    this.zoom = clamp(newZoom, ZOOM_MIN, ZOOM_MAX);
    const r = this.canvas.getBoundingClientRect(), s = this.scale, off = this._offset();
    // canvas-centre world = before - (client - rect - W/2) / s ; free-area centre = that + off/s
    this.cx = before.x - (clientX - r.left - this.W / 2) / s + off.x / s;
    this.cy = before.y - (clientY - r.top - this.H / 2) / s + off.y / s;
    this._clamp();
  }
  panBy(dxPx: number, dyPx: number): void { this.cx -= dxPx / this.scale; this.cy -= dyPx / this.scale; this._clamp(); }

  // ------------------------------------------------------------ events
  _bind(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    // EventListener is typed with a generic Event; the DOM only calls these with the matching event type, hence the casts
    this._h = {
      contextmenu: (e: Event) => e.preventDefault(),
      auxclick: (e: Event) => { if ((e as MouseEvent).button === 1) e.preventDefault(); },
      mousedown: (e: Event) => { if ((e as MouseEvent).button === 1) e.preventDefault(); }, // stop middle-click autoscroll
      wheel: (e: Event) => this._onWheel(e as WheelEvent),
      pointerdown: (e: Event) => this._onDown(e as PointerEvent),
      pointermove: (e: Event) => this._onMove(e as PointerEvent),
      pointerup: (e: Event) => this._onUp(e as PointerEvent),
      pointercancel: (e: Event) => this._onUp(e as PointerEvent),
    };
    c.addEventListener('contextmenu', this._h.contextmenu);
    c.addEventListener('auxclick', this._h.auxclick);
    c.addEventListener('mousedown', this._h.mousedown);
    c.addEventListener('wheel', this._h.wheel, { passive: false });
    c.addEventListener('pointerdown', this._h.pointerdown);
    c.addEventListener('pointermove', this._h.pointermove);
    c.addEventListener('pointerup', this._h.pointerup);
    c.addEventListener('pointercancel', this._h.pointercancel);
  }
  dispose(): void {
    const c = this.canvas;
    for (const [k, f] of Object.entries(this._h)) c.removeEventListener(k, f);
  }

  _onWheel(e: WheelEvent): void {
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 400;
    const k = e.ctrlKey ? 0.012 : 0.0016; // trackpad pinch reports ctrlKey with small deltas
    this.zoomAt(this.zoom * Math.exp(-clamp(dy, -240, 240) * k), e.clientX, e.clientY);
  }

  _onDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) this._startGesture();
      return; // never consume
    }
    if (e.button === 1 || e.button === 2) {
      this.pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      e.preventDefault();
    }
  }

  _onMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      t.x = e.clientX; t.y = e.clientY;
      if (this.touches.size >= 2 && this.gesture) this._updateGesture();
      return;
    }
    if (this.pan && this.pan.id === e.pointerId) {
      if ((e.buttons & 6) === 0) { this.pan = null; return; } // button released outside
      this.panBy(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan.x = e.clientX; this.pan.y = e.clientY;
    }
  }

  _onUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.gesture = null;
      else this._startGesture();
      return;
    }
    if (this.pan && this.pan.id === e.pointerId) {
      this.pan = null;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
  }

  _pair(): Pair {
    const it = this.touches.values();
    const a = it.next().value!, b = it.next().value!; // callers guarantee two touches
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  _startGesture(): void { this.gesture = this._pair(); }
  _updateGesture(): void {
    const g = this.gesture, n = this._pair();
    if (!g) return;
    // zoom about the previous midpoint, then translate so the same world point follows the new midpoint
    const worldAtPrev = this.screenToWorld(g.mx, g.my);
    this.zoom = clamp(this.zoom * n.dist / g.dist, ZOOM_MIN, ZOOM_MAX);
    const r = this.canvas.getBoundingClientRect(), s = this.scale, off = this._offset();
    this.cx = worldAtPrev.x - (n.mx - r.left - this.W / 2) / s + off.x / s;
    this.cy = worldAtPrev.y - (n.my - r.top - this.H / 2) / s + off.y / s;
    this._clamp();
    this.gesture = n;
  }
}
