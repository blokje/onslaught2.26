// Combo colours for the UI, each with a shape so colour is never the only cue (accessibility).
// The renderer draws the same shapes on the map (COLOR_SHAPES in src/render/atlas.ts); keep both tables in step.
import { h } from './dom.ts';
import type { KeyColor } from '../types.ts';

export type ColorShape = 'triangle' | 'circle' | 'square' | 'diamond';

export const COMBO_HEX: Record<KeyColor, string> = { red: '#ff6a4d', green: '#52d17a', blue: '#4da3ff', yellow: '#ffd54a' };
export const COLOR_SYMBOL: Record<KeyColor, ColorShape> = { red: 'triangle', green: 'circle', blue: 'square', yellow: 'diamond' };
/** Text for screen readers and tooltips, e.g. "red (triangle)". */
export const colorName = (c: KeyColor): string => `${c} (${COLOR_SYMBOL[c]})`;

/** Colour dot with its shape (triangle, circle, square, diamond), so it reads without colour vision too. */
export function colorDot(color: string | null): HTMLElement {
  const c = color && Object.hasOwn(COMBO_HEX, color) ? color as KeyColor : null;
  return h('i', { class: 'os-cdot' + (c ? ' sym-' + COLOR_SYMBOL[c] : ''), style: 'background:' + (c ? COMBO_HEX[c] : '#888'), title: c ? colorName(c) : null, role: c ? 'img' : null, 'aria-label': c ? colorName(c) : null });
}
