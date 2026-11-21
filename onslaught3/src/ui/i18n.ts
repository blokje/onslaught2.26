// Translations. English is the source language and also the key: t('Send wave') or t('Wave {n} started', { n }).
// Dutch and German live in src/ui/lang/*.ts (one module per UI area, each { nl: {...}, de: {...} }), merged here.
// A missing translation falls back to English. sim-test (i18n) scans the source for every t('...') key and checks that
// both languages have it with the same {placeholders}. Proper names (turrets, combos, maps) stay English on purpose.
import { HUD_TEXT } from './lang/hud.ts';
import { DIALOG_TEXT } from './lang/dialogs.ts';
import { CONTENT_TEXT } from './lang/content.ts';

export type Lang = 'en' | 'nl' | 'de';
export const LANGS: readonly { id: Lang; name: string }[] = [{ id: 'en', name: 'English' }, { id: 'nl', name: 'Nederlands' }, { id: 'de', name: 'Deutsch' }];

/** A translation module: English text -> Dutch / German text. */
export interface LangPack { nl: Record<string, string>; de: Record<string, string> }

const PACKS: readonly LangPack[] = [HUD_TEXT, DIALOG_TEXT, CONTENT_TEXT];
export const DICT: Record<'nl' | 'de', Record<string, string>> = { nl: {}, de: {} };
for (const p of PACKS) { Object.assign(DICT.nl, p.nl); Object.assign(DICT.de, p.de); }

let current: Lang = 'en';
export function setLang(l: Lang): void { current = l === 'nl' || l === 'de' ? l : 'en'; }
export function getLang(): Lang { return current; }

/** The language to start with when none is chosen: the browser's first preference we support, else English. */
export function detectLang(prefs: readonly string[]): Lang {
  for (const p of prefs) {
    const base = String(p).toLowerCase().slice(0, 2);
    if (base === 'nl' || base === 'de' || base === 'en') return base;
  }
  return 'en';
}

/**
 * Mark English text in a table (labels, names, descriptions) as a translation key without translating it now: modules
 * load before the language is set, so such tables keep English and the UI calls t(entry.label) when it shows them.
 * Returns its argument unchanged; the i18n test collects tx('...') keys like t('...') keys.
 */
export function tx(en: string): string { return en; }

/** Translate an English text (also the key) and fill {name} placeholders. */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? en : (DICT[current][en] ?? en);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}
