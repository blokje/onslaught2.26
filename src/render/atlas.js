// Procedural art: every sprite is drawn once with the 2D canvas API into texture atlases.
// Nothing here is copied from any existing game; shapes and palettes are original.
//
// Atlases (all 1024 x 1024, 4 x 4 cells of 256 px, flipY = false so v = 0 is the canvas top):
//   fx        generic glows, puffs, flames, beam band, projectile bodies, flag ...
//   units     the 9 attacker silhouettes (cell = 32 world units)
//   tBase     16 turret base plates (cell = 64 world units)
//   tWeapon   16 turret weapons, drawn pointing +x (cell = 64 world units)

import * as THREE from 'three';
import { BUILD_ORDER } from '../data/turrets.js';
import { mulberry32, TAU } from './util.js';

const SIZE = 1024, CELL = 256, COLS = 4;

// ---------- small canvas helpers (all in "unit" space after setup) ----------
function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function rad(ctx, x0, y0, r0, x1, y1, r1, stops) {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
const OUT = 'rgba(12,14,20,0.85)';
function fillStroke(ctx, fill, lw = 0.5, stroke = OUT) {
  ctx.fillStyle = fill; ctx.fill();
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function metalDisc(ctx, x, y, r, c0, c1, c2, lw = 0.6) {
  circle(ctx, x, y, r);
  fillStroke(ctx, rad(ctx, x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r, [[0, c0], [0.55, c1], [1, c2]]), lw);
}
function glowDot(ctx, x, y, r, color, blur = 8) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; circle(ctx, x, y, r);
  ctx.fillStyle = rad(ctx, x, y, 0, x, y, r, [[0, '#ffffff'], [0.45, color], [1, color]]); ctx.fill(); ctx.restore();
}

/** Begin drawing in cell i: origin at cell centre, scaled to `unitsPerCell`, clipped to the cell. */
function beginCell(ctx, i, unitsPerCell) {
  ctx.save();
  ctx.translate((i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2);
  ctx.beginPath(); ctx.rect(-CELL / 2, -CELL / 2, CELL, CELL); ctx.clip();
  const s = CELL / unitsPerCell;
  ctx.scale(s, s);
}
export function cellUV(i, inset = 0) {
  const x = (i % COLS) * CELL + inset, y = Math.floor(i / COLS) * CELL + inset, n = CELL - inset * 2;
  return { u0: x / SIZE, v0: y / SIZE, u1: (x + n) / SIZE, v1: (y + n) / SIZE };
}

function toTexture(canvas, mips = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// =====================================================================================
// FX atlas
// =====================================================================================
export const FX = {
  white: 0, glow: 1, puff: 2, flame: 3, beam: 4, swirl: 5, star: 6, rocket: 7,
  bomb: 8, mine: 9, flag: 10, spark: 11, ring: 12, dish: 13,
};
export const FX_UNITS = 32; // fx cell size in world units when drawn at scale 1 (callers pass their own sizes)

export function buildFxAtlas() {
  const canvas = newCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const P = 1; // px drawing; helpers below use raw pixel space (cell = 256 px)

  // white (solid)
  beginCell(ctx, FX.white, CELL); ctx.fillStyle = '#fff'; ctx.fillRect(-120, -120, 240, 240); ctx.restore();

  // soft glow (gaussian-ish)
  beginCell(ctx, FX.glow, CELL);
  ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, 124, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.8)'], [0.35, 'rgba(255,255,255,0.3)'], [0.65, 'rgba(255,255,255,0.07)'], [1, 'rgba(255,255,255,0)']]);
  circle(ctx, 0, 0, 125); ctx.fill(); ctx.restore();

  // smoke / cloud puff: overlapping soft blobs, masked to a round falloff
  beginCell(ctx, FX.puff, CELL);
  {
    const rnd = mulberry32(11);
    for (let i = 0; i < 16; i++) {
      const a = rnd() * TAU, d = rnd() * 48, r = 36 + rnd() * 34, x = Math.cos(a) * d, y = Math.sin(a) * d;
      ctx.fillStyle = rad(ctx, x, y, 0, x, y, r, [[0, 'rgba(255,255,255,0.42)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
      circle(ctx, x, y, r); ctx.fill();
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, 124, [[0, '#fff'], [0.6, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(-128, -128, 256, 256);
  }
  ctx.restore();

  // flame: teardrop pointing UP (-y)
  beginCell(ctx, FX.flame, CELL);
  ctx.shadowColor = 'rgba(255,120,20,0.9)'; ctx.shadowBlur = 22;
  ctx.beginPath(); ctx.moveTo(0, -112);
  ctx.bezierCurveTo(26, -62, 58, -18, 48, 34); ctx.bezierCurveTo(42, 84, -42, 84, -48, 34); ctx.bezierCurveTo(-58, -18, -26, -62, 0, -112);
  ctx.fillStyle = lin(ctx, 0, -112, 0, 84, [[0, 'rgba(255,90,10,0)'], [0.3, 'rgba(255,100,20,0.85)'], [0.7, 'rgba(255,200,70,0.97)'], [1, 'rgba(255,250,210,1)']]);
  ctx.fill(); ctx.restore();

  // beam band: horizontal, gaussian profile across y
  beginCell(ctx, FX.beam, CELL);
  ctx.fillStyle = lin(ctx, 0, -126, 0, 126, [[0, 'rgba(255,255,255,0)'], [0.25, 'rgba(255,255,255,0.18)'], [0.42, 'rgba(255,255,255,0.7)'], [0.5, 'rgba(255,255,255,1)'], [0.58, 'rgba(255,255,255,0.7)'], [0.75, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(-128, -128, 256, 256); ctx.restore();

  // swirl: four spiral arms
  beginCell(ctx, FX.swirl, CELL);
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    for (let s = 0; s < 40; s++) {
      const f = s / 40, r0 = 12 + f * 108, a0 = k * Math.PI / 2 + f * 3.6, a1 = k * Math.PI / 2 + (f + 0.025) * 3.6, r1 = 12 + (f + 0.025) * 108;
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * (1 - f) ** 1.3 + 0.03})`;
      ctx.lineWidth = 15 * (1 - f) + 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1); ctx.stroke();
    }
  }
  ctx.restore();

  // 4-point star flash
  beginCell(ctx, FX.star, CELL);
  ctx.shadowColor = '#fff'; ctx.shadowBlur = 16; ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 16 : 118; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.restore();

  // rocket body, pointing +x. neutral greys so the tint colours it. Cell = 24 units => 10.67 px/unit
  beginCell(ctx, FX.rocket, 24); // now in units, scale 10.67
  {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    // fins
    ctx.beginPath(); ctx.moveTo(-5.4, 0); ctx.lineTo(-3.2, -3.6); ctx.lineTo(-1.2, -3.6); ctx.lineTo(-1.8, 0); ctx.lineTo(-1.2, 3.6); ctx.lineTo(-3.2, 3.6); ctx.closePath();
    fillStroke(ctx, '#9a9a9a', 0.35);
    // body
    rrect(ctx, -5.4, -1.45, 8.4, 2.9, 1.2);
    fillStroke(ctx, lin(ctx, 0, -1.45, 0, 1.45, [[0, '#ffffff'], [0.5, '#d8d8d8'], [1, '#8a8a8a']]), 0.35);
    // nose cone
    ctx.beginPath(); ctx.moveTo(3, -1.45); ctx.quadraticCurveTo(5.8, -0.9, 6.6, 0); ctx.quadraticCurveTo(5.8, 0.9, 3, 1.45); ctx.closePath();
    fillStroke(ctx, lin(ctx, 3, 0, 6.6, 0, [[0, '#ffe9d0'], [1, '#c0c0c0']]), 0.35);
    // stripe
    ctx.fillStyle = 'rgba(60,60,70,0.55)'; ctx.fillRect(-0.4, -1.45, 0.9, 2.9);
  }
  ctx.restore();

  // cluster bomb body: neutral sphere with a band and fins
  beginCell(ctx, FX.bomb, 24);
  {
    ctx.beginPath(); ctx.moveTo(-6.4, 0); ctx.lineTo(-4.4, -4.6); ctx.lineTo(-2.4, -4.6); ctx.lineTo(-3.2, 0); ctx.lineTo(-2.4, 4.6); ctx.lineTo(-4.4, 4.6); ctx.closePath();
    fillStroke(ctx, '#8a8f96', 0.35);
    circle(ctx, 0, 0, 4.6);
    fillStroke(ctx, rad(ctx, -1.4, -1.6, 0.4, 0, 0, 4.6, [[0, '#ffffff'], [0.5, '#a3a9b0'], [1, '#4f555d']]), 0.4);
    ctx.fillStyle = 'rgba(255,170,60,0.95)'; ctx.fillRect(-0.6, -4.5, 1.7, 9);
    circle(ctx, 4.8, 0, 1.1); fillStroke(ctx, '#d0d0d0', 0.3);
  }
  ctx.restore();

  // mine
  beginCell(ctx, FX.mine, 24);
  {
    metalDisc(ctx, 0, 0, 5.4, '#c8ccb8', '#6b7160', '#363a30', 0.45);
    circle(ctx, 0, 0, 3.6); ctx.lineWidth = 0.3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    circle(ctx, 0, 0, 1.7); fillStroke(ctx, '#2b2e27', 0.3);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; circle(ctx, Math.cos(a) * 4.4, Math.sin(a) * 4.4, 0.45); ctx.fillStyle = '#20231d'; ctx.fill(); }
  }
  ctx.restore();

  // flag cloth (pivot at left edge centre), 28 x 18 units over the 256 cell is too big: draw at 28 units/cell
  beginCell(ctx, FX.flag, 28);
  {
    ctx.beginPath(); ctx.moveTo(-9, -5.5); ctx.bezierCurveTo(-4, -7.2, 2, -3.6, 9, -5); ctx.lineTo(9, 3.2); ctx.bezierCurveTo(2, 4.4, -4, 7.4, -9, 5.5); ctx.closePath();
    fillStroke(ctx, lin(ctx, 0, -6, 0, 6, [[0, '#2fd3c2'], [0.5, '#1fa99b'], [0.5, '#f4c64e'], [1, '#d9a02f']]), 0.4);
    circle(ctx, 1, 0, 2.2); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
  }
  ctx.restore();

  // hard bright dot (spark)
  beginCell(ctx, FX.spark, CELL);
  ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, 120, [[0, '#fff'], [0.25, 'rgba(255,255,255,0.95)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  circle(ctx, 0, 0, 125); ctx.fill(); ctx.restore();

  // thin ring (used rarely as sprite; most rings use RingBatch)
  beginCell(ctx, FX.ring, CELL);
  circle(ctx, 0, 0, 110); ctx.lineWidth = 10; ctx.strokeStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore();

  // dish (reserved)
  beginCell(ctx, FX.dish, CELL); ctx.restore();

  return { canvas, texture: toTexture(canvas) };
}

// =====================================================================================
// Attackers (9 silhouettes), cell = 32 world units, drawn pointing +x
// =====================================================================================
export const ATTACKER_COLORS = ['#22b8a8', '#f08a24', '#9a63e8', '#8fa04a', '#d83a4a', '#3d9bf0', '#e24bb4', '#d2a23a', '#27c8e8'];

function shade(hexColor, f) { // multiply a #rrggbb by f (0..2)
  const n = parseInt(hexColor.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
function bodyGrad(ctx, color, y0 = -6, y1 = 6) { return lin(ctx, 0, y0, 0, y1, [[0, shade(color, 1.35)], [0.5, color], [1, shade(color, 0.6)]]); }

const ATTACKER_DRAW = [
  // 0: quad drone
  (ctx, c) => {
    ctx.lineCap = 'round';
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      ctx.strokeStyle = '#2a2f38'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sx * 6.4, sy * 6.4); ctx.stroke();
      circle(ctx, sx * 6.8, sy * 6.8, 3.7); ctx.fillStyle = 'rgba(210,235,245,0.38)'; ctx.fill(); ctx.lineWidth = 0.45; ctx.strokeStyle = 'rgba(30,40,50,0.9)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx * 6.8 - 3.2, sy * 6.8); ctx.lineTo(sx * 6.8 + 3.2, sy * 6.8); ctx.strokeStyle = 'rgba(30,40,50,0.35)'; ctx.lineWidth = 0.35; ctx.stroke();
      circle(ctx, sx * 6.8, sy * 6.8, 0.7); ctx.fillStyle = '#20262e'; ctx.fill();
    }
    rrect(ctx, -4.2, -3.8, 8.4, 7.6, 2.4); fillStroke(ctx, bodyGrad(ctx, c, -4, 4), 0.55);
    glowDot(ctx, 3.6, 0, 1.3, '#7ff4ff', 5);
    circle(ctx, -3, 0, 0.7); ctx.fillStyle = '#ff5a5a'; ctx.fill();
  },
  // 1: buggy
  (ctx, c) => {
    for (const [x, y] of [[5.4, -5.4], [5.4, 5.4], [-5.8, -5.4], [-5.8, 5.4]]) { rrect(ctx, x - 2.3, y - 1.2, 4.6, 2.4, 0.9); fillStroke(ctx, '#1d2026', 0.4); }
    rrect(ctx, -8.4, -4.2, 16.8, 8.4, 2.6); fillStroke(ctx, bodyGrad(ctx, c, -4.2, 4.2), 0.55);
    rrect(ctx, -3.4, -3, 6.4, 6, 1.4); fillStroke(ctx, lin(ctx, 0, -3, 0, 3, [[0, shade(c, 1.5)], [1, shade(c, 0.9)]]), 0.45);
    rrect(ctx, 3.2, -2.5, 2.6, 5, 0.8); fillStroke(ctx, '#27425c', 0.35);
    ctx.strokeStyle = 'rgba(20,20,25,0.7)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-3.4, -3.4); ctx.lineTo(-3.4, 3.4); ctx.stroke();
    glowDot(ctx, 8.1, -2.6, 0.95, '#ffe58a', 4); glowDot(ctx, 8.1, 2.6, 0.95, '#ffe58a', 4);
    circle(ctx, -8.1, -2.8, 0.6); circle(ctx, -8.1, 2.8, 0.6); ctx.fillStyle = '#ff4a4a'; ctx.fill();
  },
  // 2: hover saucer
  (ctx, c) => {
    ctx.save(); ctx.shadowColor = shade(c, 1.2); ctx.shadowBlur = 5; circle(ctx, 0, 0, 8.6); fillStroke(ctx, rad(ctx, -2, -3, 1, 0, 0, 8.6, [[0, shade(c, 1.4)], [0.7, shade(c, 0.8)], [1, shade(c, 0.45)]]), 0.6); ctx.restore();
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10; circle(ctx, Math.cos(a) * 7.2, Math.sin(a) * 7.2, 0.62); ctx.fillStyle = i % 2 ? '#ffe9a0' : '#ffffff'; ctx.fill(); }
    metalDisc(ctx, 0, 0, 5.2, '#f4f1ff', shade(c, 1.3), shade(c, 0.5), 0.5);
    ctx.beginPath(); ctx.moveTo(8.9, 0); ctx.lineTo(6.2, -1.7); ctx.lineTo(6.2, 1.7); ctx.closePath(); fillStroke(ctx, '#ffd86a', 0.3);
  },
  // 3: tracked crawler
  (ctx, c) => {
    for (const y of [-5.4, 5.4]) {
      rrect(ctx, -9.2, y - 2, 18.4, 4, 2); fillStroke(ctx, '#23262c', 0.5);
      ctx.strokeStyle = 'rgba(120,125,135,0.55)'; ctx.lineWidth = 0.4;
      for (let x = -8; x <= 8; x += 2) { ctx.beginPath(); ctx.moveTo(x, y - 1.8); ctx.lineTo(x, y + 1.8); ctx.stroke(); }
    }
    rrect(ctx, -7.8, -4.2, 15.6, 8.4, 1.8); fillStroke(ctx, bodyGrad(ctx, c, -4.2, 4.2), 0.55);
    rrect(ctx, 1.5, -1.0, 8.2, 2, 0.6); fillStroke(ctx, '#3b3f46', 0.4);
    metalDisc(ctx, -1.6, 0, 3.6, shade(c, 1.6), shade(c, 1.1), shade(c, 0.6), 0.5);
    circle(ctx, -1.6, 0, 1.2); fillStroke(ctx, '#2a2d33', 0.3);
  },
  // 4: beetle with six legs
  (ctx, c) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a1d1f'; ctx.lineWidth = 1.1;
    for (const sy of [-1, 1]) for (const x of [-4.2, 0, 4.2]) {
      ctx.beginPath(); ctx.moveTo(x, sy * 2.6); ctx.lineTo(x + 1.4, sy * 6.2); ctx.lineTo(x + (x < 0 ? -1.6 : x > 1 ? 2.2 : 0.2), sy * 8.8); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(-0.8, 0, 8.4, 5.2, 0, 0, TAU); fillStroke(ctx, rad(ctx, -2, -2, 1, -0.8, 0, 8, [[0, shade(c, 1.5)], [0.6, c], [1, shade(c, 0.5)]]), 0.55);
    ctx.strokeStyle = 'rgba(20,10,12,0.65)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6.5, 0); ctx.stroke();
    circle(ctx, 7.4, 0, 2.6); fillStroke(ctx, shade(c, 0.7), 0.5);
    glowDot(ctx, 8.4, -1.2, 0.7, '#ffe27a', 3); glowDot(ctx, 8.4, 1.2, 0.7, '#ffe27a', 3);
    ctx.strokeStyle = '#2a1d1f'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(9.4, -1.6); ctx.lineTo(11, -2.6); ctx.moveTo(9.4, 1.6); ctx.lineTo(11, 2.6); ctx.stroke();
  },
  // 5: delta skiff
  (ctx, c) => {
    ctx.beginPath(); ctx.moveTo(10.6, 0); ctx.lineTo(-6.8, -8.4); ctx.lineTo(-3.6, 0); ctx.lineTo(-6.8, 8.4); ctx.closePath();
    fillStroke(ctx, lin(ctx, -6, -8, 10, 0, [[0, shade(c, 0.6)], [0.5, c], [1, shade(c, 1.5)]]), 0.6);
    ctx.beginPath(); ctx.moveTo(8.4, 0); ctx.lineTo(-2.5, -3); ctx.lineTo(-4.4, 0); ctx.lineTo(-2.5, 3); ctx.closePath(); fillStroke(ctx, shade(c, 0.55), 0.4);
    ctx.beginPath(); ctx.ellipse(2.2, 0, 3.3, 1.7, 0, 0, TAU); fillStroke(ctx, lin(ctx, 0, -1.7, 0, 1.7, [[0, '#d8f7ff'], [1, '#2d6f9a']]), 0.4);
    glowDot(ctx, -5.2, -1.9, 1, '#ffb347', 5); glowDot(ctx, -5.2, 1.9, 1, '#ffb347', 5);
  },
  // 6: orb roller
  (ctx, c) => {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 2; circle(ctx, 0, 0, 7.6); ctx.restore();
    metalDisc(ctx, 0, 0, 7.6, shade(c, 1.7), c, shade(c, 0.42), 0.6);
    ctx.strokeStyle = 'rgba(25,10,25,0.6)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.ellipse(0, 0, 7.4, 2.8, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 2.8, 7.4, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.4; circle(ctx, Math.cos(a) * 8.2, Math.sin(a) * 8.2, 0.7); ctx.fillStyle = '#2a2230'; ctx.fill(); }
    glowDot(ctx, 5.2, 0, 1.3, '#fff2a6', 5);
  },
  // 7: truck + trailer
  (ctx, c) => {
    for (const [x, y] of [[-6.2, -5], [-6.2, 5], [-2.2, -5], [-2.2, 5], [6, -4.6], [6, 4.6]]) { rrect(ctx, x - 1.7, y - 1, 3.4, 2, 0.7); fillStroke(ctx, '#1c1f24', 0.35); }
    rrect(ctx, -10, -4.5, 11.4, 9, 1.4); fillStroke(ctx, lin(ctx, 0, -4.5, 0, 4.5, [[0, shade('#b8bcc2', 1.2)], [1, shade('#b8bcc2', 0.7)]]), 0.55);
    ctx.strokeStyle = 'rgba(40,44,52,0.55)'; ctx.lineWidth = 0.4; for (let x = -8; x <= 0; x += 2) { ctx.beginPath(); ctx.moveTo(x, -4.2); ctx.lineTo(x, 4.2); ctx.stroke(); }
    ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1.2, 0); ctx.lineTo(2.6, 0); ctx.stroke();
    rrect(ctx, 2.2, -4, 7.6, 8, 1.8); fillStroke(ctx, bodyGrad(ctx, c, -4, 4), 0.55);
    rrect(ctx, 6.6, -3, 2.4, 6, 0.8); fillStroke(ctx, '#27425c', 0.35);
    glowDot(ctx, 9.8, -2.6, 0.8, '#ffe58a', 4); glowDot(ctx, 9.8, 2.6, 0.8, '#ffe58a', 4);
    circle(ctx, -10, -2.8, 0.55); circle(ctx, -10, 2.8, 0.55); ctx.fillStyle = '#ff4a4a'; ctx.fill();
  },
  // 8: manta glider
  (ctx, c) => {
    ctx.beginPath(); ctx.moveTo(10, 0);
    ctx.bezierCurveTo(5, -2, 0, -9, -5.4, -10); ctx.bezierCurveTo(-4.4, -5, -4.8, -2, -9.4, 0);
    ctx.bezierCurveTo(-4.8, 2, -4.4, 5, -5.4, 10); ctx.bezierCurveTo(0, 9, 5, 2, 10, 0); ctx.closePath();
    fillStroke(ctx, lin(ctx, -8, -9, 9, 5, [[0, shade(c, 0.55)], [0.55, c], [1, shade(c, 1.5)]]), 0.6);
    ctx.strokeStyle = 'rgba(8,40,50,0.7)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-8, 0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(3.2, 0, 2.6, 1.3, 0, 0, TAU); fillStroke(ctx, '#0d3a4a', 0.35);
    glowDot(ctx, -5.2, -9.4, 0.9, '#b8fbff', 4); glowDot(ctx, -5.2, 9.4, 0.9, '#b8fbff', 4);
  },
];

export function buildUnitAtlas() {
  const canvas = newCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 9; i++) {
    beginCell(ctx, i, 32);
    ATTACKER_DRAW[i](ctx, ATTACKER_COLORS[i]);
    ctx.restore();
  }
  return { canvas, texture: toTexture(canvas) };
}

// =====================================================================================
// Turrets: base plates + weapons. cell = 64 world units (4 px / unit)
// =====================================================================================
export const WEAPON_COLOR = { blue: '#3b82f6', green: '#3ddc6a', red: '#ef4444', yellow: '#facc15' };
export const MOD_TINT = {
  rangeUp: '#35d0ff', damageUp: '#ff7a2e', rateUpEx: '#b6f03c', rangeUpEx: '#6f86ff',
  rateUp: '#ffd23a', damageUpBig: '#ff3355', damageUpBigEx: '#e04bff',
};
export const KIND_TINT = Object.assign({
  blue: WEAPON_COLOR.blue, green: WEAPON_COLOR.green, red: WEAPON_COLOR.red, yellow: WEAPON_COLOR.yellow,
  targeter: '#ff9f43', sniper: '#5aa9ff', fusion: '#59ffb0', railgun: '#ff6a3a', comboOnly: '#d8e0f0',
}, MOD_TINT);
export const COMBO_COLOR = { red: '#ff4a3d', green: '#3dff6a', blue: '#3d8bff', yellow: '#ffd93d' };

export const KIND_INDEX = {};
BUILD_ORDER.forEach((k, i) => { KIND_INDEX[k] = i; });

function chevrons(ctx, n, x0, y0, s) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) { const x = x0 + i * s * 0.9; ctx.beginPath(); ctx.moveTo(x - s * 0.5, y0 - s * 0.8); ctx.lineTo(x + s * 0.4, y0); ctx.lineTo(x - s * 0.5, y0 + s * 0.8); ctx.stroke(); }
}
function exchangeArrows(ctx, y, w) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-w, y - 1.1); ctx.lineTo(w, y - 1.1); ctx.moveTo(w - 1.3, y - 2.3); ctx.lineTo(w, y - 1.1); ctx.lineTo(w - 1.3, y + 0.1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w, y + 1.1); ctx.lineTo(-w, y + 1.1); ctx.moveTo(-w + 1.3, y - 0.1); ctx.lineTo(-w, y + 1.1); ctx.lineTo(-w + 1.3, y + 2.3); ctx.stroke();
}
function starburst(ctx, n, r0, r1) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, r = i % 2 ? r0 : r1; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath();
}
function rangeIcon(ctx) {
  circle(ctx, 0, 0, 3.1); ctx.stroke();
  ctx.beginPath(); for (const a of [0, 1, 2, 3]) { const an = a * Math.PI / 2 + Math.PI / 4; ctx.moveTo(Math.cos(an) * 4.6, Math.sin(an) * 4.6); ctx.lineTo(Math.cos(an) * 8, Math.sin(an) * 8); } ctx.stroke();
  circle(ctx, 0, 0, 0.9); ctx.fill();
}

function drawModIcon(ctx, kind, tint) {
  ctx.save(); ctx.strokeStyle = tint; ctx.fillStyle = tint; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = tint; ctx.shadowBlur = 5;
  switch (kind) {
    case 'rangeUp': rangeIcon(ctx); break;
    case 'rangeUpEx': ctx.translate(0, -2.2); ctx.scale(0.8, 0.8); rangeIcon(ctx); break;
    case 'damageUp': starburst(ctx, 6, 3, 8.2); ctx.fill(); break;
    case 'damageUpBig': starburst(ctx, 8, 3.6, 9.5); ctx.fill(); break;
    case 'damageUpBigEx': ctx.translate(0, -2); starburst(ctx, 8, 2.6, 6.8); ctx.fill(); break;
    case 'rateUp': chevrons(ctx, 3, -3.6, 0, 3.4); break;
    case 'rateUpEx': chevrons(ctx, 2, -2.6, -2, 3); break;
    default: break;
  }
  ctx.restore();
  if (kind === 'rangeUpEx' || kind === 'damageUpBigEx' || kind === 'rateUpEx') {
    ctx.save(); ctx.strokeStyle = tint; ctx.lineWidth = 1.1; ctx.shadowColor = tint; ctx.shadowBlur = 4; exchangeArrows(ctx, 7.6, 4.8); ctx.restore();
  }
}

function drawBase(ctx, kind) {
  const isMod = !!MOD_TINT[kind];
  const accent = KIND_TINT[kind] || '#aab';
  // soft drop shadow
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 7; ctx.shadowOffsetX = 1.2; ctx.shadowOffsetY = 2.4;
  circle(ctx, 0, 0, 20.6); ctx.fillStyle = '#2a2e35'; ctx.fill(); ctx.restore();
  // outer plate
  metalDisc(ctx, 0, 0, 21, '#a3aab2', '#69717a', '#383d44', 0.8);
  // coloured rim
  circle(ctx, 0, 0, 19); ctx.lineWidth = isMod ? 2.6 : 1.7; ctx.strokeStyle = accent; ctx.globalAlpha = 0.95; ctx.stroke(); ctx.globalAlpha = 1;
  if (isMod) { // dotted outer ring for modifiers
    ctx.save(); ctx.setLineDash([1.4, 2.0]); circle(ctx, 0, 0, 16.2); ctx.lineWidth = 0.9; ctx.strokeStyle = accent; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.restore();
  }
  // inner deck
  circle(ctx, 0, 0, 15.2); fillStroke(ctx, rad(ctx, -4, -5, 1, 0, 0, 15, [[0, '#5a626b'], [1, '#2d3238']]), 0.6, 'rgba(0,0,0,0.6)');
  // bolts
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + Math.PI / 8; circle(ctx, Math.cos(a) * 17.6, Math.sin(a) * 17.6, 0.85); ctx.fillStyle = '#c8cdd2'; ctx.fill(); ctx.lineWidth = 0.25; ctx.strokeStyle = '#1a1d22'; ctx.stroke(); }
  if (isMod) drawModIcon(ctx, kind, accent);
  if (kind === 'comboOnly') { circle(ctx, 0, 0, 12); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); }
}

function drawModWeapon(ctx, kind, tint) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const steel = ['#e2e6ea', '#8e969e', '#41474e'];
  const dish = (x, r, ang) => {
    ctx.save(); ctx.translate(x, 0); ctx.rotate(ang);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r, 0, -Math.PI / 2, Math.PI / 2, true); ctx.closePath();
    fillStroke(ctx, lin(ctx, -r * 0.5, 0, r * 0.5, 0, [[0, steel[2]], [0.55, steel[1]], [1, steel[0]]]), 0.6);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.38, r * 0.78, 0, -Math.PI / 2, Math.PI / 2, true); ctx.closePath();
    ctx.fillStyle = tint; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = steel[1]; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.9, 0); ctx.stroke();
    glowDot(ctx, r * 0.95, 0, 1.2, tint, 5);
    ctx.restore();
  };
  metalDisc(ctx, 0, 0, 5, steel[0], steel[1], steel[2], 0.5);
  switch (kind) {
    case 'rangeUp': dish(-3, 10.5, 0); break;
    case 'rangeUpEx': dish(-2, 8.5, 0.0); dish(2, 6, Math.PI); break;
    case 'damageUp': case 'damageUpBig': case 'damageUpBigEx': {
      const big = kind !== 'damageUp';
      for (const a of [-0.9, 0, 0.9]) { ctx.strokeStyle = steel[1]; ctx.lineWidth = big ? 2 : 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.stroke(); glowDot(ctx, Math.cos(a) * 13, Math.sin(a) * 13, big ? 2.2 : 1.6, tint, 7); }
      glowDot(ctx, 0, 0, big ? 4.4 : 3.4, tint, 10);
      if (kind === 'damageUpBigEx') { dish(-5, 5, Math.PI); }
      break; }
    case 'rateUp': case 'rateUpEx': {
      ctx.save(); // radar sweep wedge
      ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, 15, [[0, tint], [1, 'rgba(0,0,0,0)']]); ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 15, -0.32, 0.32); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.strokeStyle = steel[0]; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(14, 0); ctx.stroke();
      ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(11, -3.6); ctx.lineTo(11, 3.6); ctx.stroke();
      if (kind === 'rateUpEx') { ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(-11, 0); ctx.moveTo(-8, -3); ctx.lineTo(-8, 3); ctx.stroke(); }
      glowDot(ctx, 14.5, 0, 1.4, tint, 6);
      break; }
    default: break;
  }
}

const WEAPON_DRAW = {
  blue(ctx) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 0.8; ctx.shadowOffsetY = 1.2;
    rrect(ctx, 3, -3.6, 21, 7.2, 1.6); ctx.fillStyle = '#2a3a60'; ctx.fill(); ctx.restore();
    rrect(ctx, 3, -3.6, 21, 7.2, 1.6); fillStroke(ctx, lin(ctx, 0, -3.6, 0, 3.6, [[0, '#d2e4ff'], [0.35, '#5f98f0'], [1, '#1d3f8f']]), 0.6);
    rrect(ctx, 21, -4.6, 4.8, 9.2, 1); fillStroke(ctx, lin(ctx, 0, -4.6, 0, 4.6, [[0, '#6b7690'], [1, '#262d42']]), 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(5, -2.2); ctx.lineTo(20, -2.2); ctx.stroke();
    metalDisc(ctx, 0, 0, 10.4, '#a8c8ff', '#3f74dc', '#1b3c88', 0.7);
    metalDisc(ctx, -0.5, -0.5, 5.2, '#e4efff', '#7aa7f2', '#2e56b0', 0.5);
    circle(ctx, 6.8, 0, 0.001);
    for (const a of [0.7, 2.4, 3.9, 5.5]) { circle(ctx, Math.cos(a) * 8.2, Math.sin(a) * 8.2, 0.6); ctx.fillStyle = '#16264f'; ctx.fill(); }
  },
  green(ctx) {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(5, s * 4.5); ctx.lineTo(13, s * 9.2); ctx.lineTo(14.5, s * 5.2); ctx.lineTo(10, s * 3.5); ctx.closePath(); fillStroke(ctx, '#1f7a3e', 0.5); }
    metalDisc(ctx, 0, 0, 10.2, '#b8f0c8', '#2f9c55', '#145a2a', 0.7);
    rrect(ctx, 2, -4.6, 15, 9.2, 2.2); fillStroke(ctx, lin(ctx, 0, -4.6, 0, 4.6, [[0, '#8df0ae'], [0.5, '#2ea85a'], [1, '#0f4a23']]), 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(4, -3.4, 10, 0.8);
    circle(ctx, 17.4, 0, 5); fillStroke(ctx, '#0e2b17', 0.6);
    glowDot(ctx, 17.4, 0, 3.4, '#4dffa0', 10);
    circle(ctx, 16.6, -1, 1); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    metalDisc(ctx, -1, 0, 4.4, '#d8ffe4', '#3fbf6f', '#17602f', 0.5);
  },
  red(ctx) {
    metalDisc(ctx, 0, 0, 10, '#ff9d9d', '#c23a3a', '#6e1717', 0.7);
    rrect(ctx, -7, -9.4, 22, 18.8, 2.6); fillStroke(ctx, lin(ctx, 0, -9.4, 0, 9.4, [[0, '#ff8a80'], [0.5, '#b82f2f'], [1, '#601414']]), 0.7);
    for (const j of [-1, 0, 1]) {
      const y = j * 5.8;
      rrect(ctx, 3, y - 2.6, 15, 5.2, 2.2); fillStroke(ctx, '#17171b', 0.5);
      ctx.beginPath(); ctx.moveTo(17, y - 2.1); ctx.quadraticCurveTo(21.5, y - 1.4, 23.6, y); ctx.quadraticCurveTo(21.5, y + 1.4, 17, y + 2.1); ctx.closePath(); fillStroke(ctx, lin(ctx, 17, 0, 23.6, 0, [[0, '#f5f5f5'], [1, '#ff5a4a']]), 0.45);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(5, y - 1.8, 10, 0.7);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-3, -9); ctx.lineTo(-3, 9); ctx.stroke();
    metalDisc(ctx, -2, 0, 3.4, '#ffd0d0', '#d04545', '#7a1b1b', 0.5);
  },
  yellow(ctx) {
    ctx.strokeStyle = '#8a8f96'; ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(6, s * 3); ctx.quadraticCurveTo(13, s * 3, 17.4, s * 7); ctx.stroke(); glowDot(ctx, 18.2, s * 7.4, 1.9, '#ffe35a', 9); }
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,230,0.9)'; ctx.lineWidth = 0.6; ctx.shadowColor = '#ffe35a'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.moveTo(18.2, -7.4); ctx.lineTo(20, -3.6); ctx.lineTo(17.6, -1.2); ctx.lineTo(20, 2); ctx.lineTo(18.2, 7.4); ctx.stroke(); ctx.restore();
    metalDisc(ctx, 0, 0, 10.4, '#ffe9a0', '#b0821a', '#5a3f0a', 0.7);
    for (const [r, c] of [[8.4, '#d89a35'], [6.3, '#f0b850'], [4.4, '#c98a2b']]) { circle(ctx, 0, 0, r); ctx.lineWidth = 1.2; ctx.strokeStyle = c; ctx.stroke(); }
    glowDot(ctx, 0, 0, 3.4, '#ffe96a', 12);
  },
  targeter(ctx) {
    ctx.strokeStyle = '#6c737b'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-3, -2); ctx.moveTo(-9, 6); ctx.lineTo(-3, 2); ctx.stroke();
    metalDisc(ctx, -2, 0, 5.2, '#e2e6ea', '#7d858d', '#3a4046', 0.6);
    ctx.save(); ctx.shadowColor = '#ff9f43'; ctx.shadowBlur = 6; ctx.strokeStyle = '#ffb46a'; ctx.lineWidth = 1.3;
    circle(ctx, 4, 0, 8.6); ctx.stroke(); circle(ctx, 4, 0, 3.6); ctx.lineWidth = 0.8; ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath();
    for (const a of [0, 1, 2, 3]) { const an = a * Math.PI / 2; ctx.moveTo(4 + Math.cos(an) * 5.2, Math.sin(an) * 5.2); ctx.lineTo(4 + Math.cos(an) * 12.2, Math.sin(an) * 12.2); }
    ctx.stroke(); ctx.restore();
    glowDot(ctx, 4, 0, 1.1, '#fff1d8', 4);
  },
  sniper(ctx) {
    rrect(ctx, -10, -3, 13, 6, 1.4); fillStroke(ctx, lin(ctx, 0, -3, 0, 3, [[0, '#7f93b5'], [1, '#2b374f']]), 0.6);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1.2;
    rrect(ctx, 0, -1.5, 31, 3, 0.8); fillStroke(ctx, lin(ctx, 0, -1.5, 0, 1.5, [[0, '#e8f0ff'], [0.5, '#7d92b8'], [1, '#2d3b58']]), 0.5); ctx.restore();
    rrect(ctx, 27.6, -2.6, 4.6, 5.2, 0.8); fillStroke(ctx, '#1f2740', 0.5);
    rrect(ctx, 3, -6.2, 12, 3.6, 1.4); fillStroke(ctx, lin(ctx, 0, -6.2, 0, -2.6, [[0, '#4a5878'], [1, '#1a2238']]), 0.5);
    glowDot(ctx, 15.4, -4.4, 1.3, '#5ab4ff', 5);
    metalDisc(ctx, -1, 0, 6.2, '#b8c8e6', '#5470a8', '#26345a', 0.6);
    ctx.fillStyle = '#5aa9ff'; ctx.fillRect(-9, -0.5, 8, 1);
  },
  fusion(ctx) {
    ctx.strokeStyle = '#7f8a94'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.4; ctx.beginPath(); ctx.arc(0, 0, 10.6, a, a + 1.55); ctx.stroke(); }
    ctx.strokeStyle = '#c8d2da'; ctx.lineWidth = 0.7;
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.4; ctx.beginPath(); ctx.arc(0, 0, 11.2, a + 0.1, a + 1.4); ctx.stroke(); }
    rrect(ctx, 7, -3.4, 12, 6.8, 2); fillStroke(ctx, lin(ctx, 0, -3.4, 0, 3.4, [[0, '#7a8a94'], [1, '#2c353c']]), 0.6);
    circle(ctx, 19, 0, 3.6); ctx.lineWidth = 0.9; ctx.strokeStyle = '#59ffb0'; ctx.stroke();
    glowDot(ctx, 19, 0, 1.6, '#59ffb0', 8);
    circle(ctx, 0, 0, 7.2); fillStroke(ctx, '#1b2a2a', 0.6);
    ctx.save(); ctx.shadowColor = '#59ffb0'; ctx.shadowBlur = 16; circle(ctx, 0, 0, 5.6);
    ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, 5.6, [[0, '#ffffff'], [0.4, '#a8ffd8'], [1, '#19c97a']]); ctx.fill(); ctx.restore();
  },
  railgun(ctx) {
    rrect(ctx, -10, -8, 11, 16, 2); fillStroke(ctx, lin(ctx, 0, -8, 0, 8, [[0, '#d07a6a'], [0.5, '#8a2f26'], [1, '#42130f']]), 0.7);
    for (const s of [-1, 1]) { rrect(ctx, -1, s * 4 - 1.5, 30, 3, 0.8); fillStroke(ctx, lin(ctx, 0, s * 4 - 1.5, 0, s * 4 + 1.5, [[0, '#f0f3f6'], [0.5, '#8c959e'], [1, '#3c434a']]), 0.5); }
    ctx.save(); ctx.shadowColor = '#ff7a3a'; ctx.shadowBlur = 7;
    for (const x of [4, 10, 16, 22]) { ctx.fillStyle = '#ff9a5a'; ctx.fillRect(x - 0.7, -5.8, 1.4, 11.6); }
    ctx.restore();
    for (const s of [-1, 1]) { metalDisc(ctx, -5, s * 4.4, 2.2, '#ffd0c0', '#c04a3a', '#5a1a14', 0.4); }
    glowDot(ctx, 29, 0, 1.2, '#ff9a5a', 6);
  },
  comboOnly(ctx) {
    ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 7;
    circle(ctx, 0, 0, 13.6); ctx.lineWidth = 3.4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.restore();
    circle(ctx, 0, 0, 10.6); ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.save(); ctx.rotate(a); ctx.fillRect(11.6, -1, 3.4, 2); ctx.restore(); }
  },
};

export function buildTurretAtlases() {
  const cb = newCanvas(SIZE, SIZE), cw = newCanvas(SIZE, SIZE);
  const xb = cb.getContext('2d'), xw = cw.getContext('2d');
  BUILD_ORDER.forEach((kind, i) => {
    beginCell(xb, i, 64); drawBase(xb, kind); xb.restore();
    beginCell(xw, i, 64);
    if (WEAPON_DRAW[kind]) WEAPON_DRAW[kind](xw);
    else if (MOD_TINT[kind]) drawModWeapon(xw, kind, MOD_TINT[kind]);
    xw.restore();
  });
  return { base: toTexture(cb), weapon: toTexture(cw) };
}

// =====================================================================================
// Text atlas: small shelf-packed canvas for "+$n" and combo names
// =====================================================================================
export class TextAtlas {
  constructor(w = 1024, h = 512) {
    this.w = w; this.h = h;
    this.canvas = newCanvas(w, h);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false; this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter; this.texture.magFilter = THREE.LinearFilter;
    this.map = new Map();
    this._reset();
    this.dirty = false;
  }
  _reset() { this.map.clear(); this.cx = 0; this.cy = 0; this.rowH = 0; this.full = false; this.ctx.clearRect(0, 0, this.w, this.h); this.dirty = true; }
  /** Call once at frame start: wipes the atlas when nearly full (entries are re-created on demand). */
  beginFrame() { if (this.full) this._reset(); }
  endFrame() { if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; } }
  /** Returns { u0, v0, u1, v1, aspect } for the text, drawing it on first use; null when the atlas is full. */
  get(str, px = 30) {
    const key = px + '|' + str;
    let e = this.map.get(key);
    if (e) return e;
    const ctx = this.ctx;
    ctx.font = `bold ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const pad = 8;
    const tw = Math.ceil(ctx.measureText(str).width) + pad * 2, th = Math.ceil(px * 1.35) + pad * 2;
    if (this.cx + tw > this.w) { this.cx = 0; this.cy += this.rowH; this.rowH = 0; }
    if (this.cy + th > this.h) { this.full = true; return null; }
    const x = this.cx, y = this.cy;
    this.cx += tw; this.rowH = Math.max(this.rowH, th);
    if (this.cy + this.rowH > this.h * 0.85) this.full = true; // reset next frame, but keep serving this one
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, px * 0.2); ctx.strokeStyle = 'rgba(10,8,6,0.9)';
    ctx.strokeText(str, x + tw / 2, y + th / 2 + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillText(str, x + tw / 2, y + th / 2 + 1);
    e = { u0: x / this.w, v0: y / this.h, u1: (x + tw) / this.w, v1: (y + th) / this.h, aspect: tw / th, pw: tw, ph: th };
    this.map.set(key, e);
    this.dirty = true;
    return e;
  }
}
