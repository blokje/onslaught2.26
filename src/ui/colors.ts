// Combo colours for the UI, each with a shape so colour is never the only cue (accessibility).
// The renderer draws the same shapes on the map (COLOR_SHAPES in src/render/atlas.ts); keep both tables in step.
import type { KeyColor } from '../types.ts';

export type ColorShape = 'triangle' | 'circle' | 'square' | 'diamond';

export const COMBO_HEX: Record<KeyColor, string> = { red: '#ff6a4d', green: '#52d17a', blue: '#4da3ff', yellow: '#ffd54a' };
export const COLOR_SYMBOL: Record<KeyColor, ColorShape> = { red: 'triangle', green: 'circle', blue: 'square', yellow: 'diamond' };
/** Text for screen readers and tooltips, e.g. "red (triangle)". */
export const colorName = (c: KeyColor): string => `${c} (${COLOR_SYMBOL[c]})`;
