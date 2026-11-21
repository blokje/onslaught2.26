// [OS3] Names of the field views (settings `viewMode`, the settings dialog and the V toast).
import { tx } from './i18n.ts';
import type { ViewMode } from './storage.ts';

export const VIEW_NAMES: Record<ViewMode, string> = { '3d': tx('3D'), top: tx('Top-down'), tilted: tx('Tilted view') };
