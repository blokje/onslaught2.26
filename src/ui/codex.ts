// Combo Codex: every combo recipe with its partners, recharge and effect. The effect text is generated from the recipe
// data (src/data/combos.ts), so the words and the numbers can never drift apart. describeCombo is pure (tested in Node).
import { h } from './dom.ts';
import { formatNum } from './format.ts';
import { COMBOS, BLAST_RADIUS } from '../data/combos.ts';
import { colorDot, COMBO_HEX } from './colors.ts';
import { t, tx } from './i18n.ts';
import type { ComboRecipe, KeyColor, ProjectileKind } from '../types.ts';

const COLORS: KeyColor[] = ['red', 'green', 'blue', 'yellow'];
const LEAD_ORDER: KeyColor[] = ['red', 'green', 'blue', 'yellow'];

const PROJECTILE: Partial<Record<ProjectileKind, string>> = {
  nuke: tx('Nuke rocket'), poisonRocket: tx('Poison rocket'), laserRocket: tx('Laser rocket'), napalmRocket: tx('Napalm rocket'),
  tazerRocket: tx('Tazer rocket'), bfg: tx('Slow plasma ball'), clusterBomb: tx('Cluster bomb'), mine: tx('Landmine on the road'),
};

const sec = (ms: number): string => (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + ' s';

/** Colour word, shape word and "{n} colour" count, each with a literal translation key. */
const COLOUR_WORD: Record<KeyColor, () => string> = { red: () => t('Red'), green: () => t('Green'), blue: () => t('Blue'), yellow: () => t('Yellow') };
const SHAPE_WORD: Record<KeyColor, () => string> = { red: () => t('triangle'), green: () => t('circle'), blue: () => t('square'), yellow: () => t('diamond') };
const COLOUR_COUNT: Record<KeyColor, (n: number) => string> = {
  red: (n) => t('{n} red', { n }), green: (n) => t('{n} green', { n }), blue: (n) => t('{n} blue', { n }), yellow: (n) => t('{n} yellow', { n }),
};
const isColour = (c: string): c is KeyColor => (COLORS as string[]).includes(c);

/** One line describing what a combo does, built from its fx data (damage values before modifiers). */
export function describeCombo(r: ComboRecipe): string {
  const fx = r.fx;
  const parts: string[] = [];
  if (fx.projectile) parts.push(PROJECTILE[fx.projectile] ? t(PROJECTILE[fx.projectile]!) : t('Rocket'));
  if (fx.hit != null) parts.push(t('{n} hit', { n: formatNum(fx.hit) }));
  if (fx.blast) {
    const size = typeof fx.blast.size === 'number' ? fx.blast.size : BLAST_RADIUS[fx.blast.size];
    const v = { d: formatNum(fx.blast.damage), r: size };
    parts.push(fx.blast.poison ? t('{d} blast (radius {r}), slows', v) : t('{d} blast (radius {r})', v));
  }
  if (fx.napalm) parts.push(t('burning road {len} long, {dps} per second for {s}', { len: fx.napalm.length, dps: formatNum(fx.napalm.dps), s: sec(fx.napalm.duration) }));
  if (fx.laser) {
    const v = { d: formatNum(fx.laser.damage), r: fx.laser.range };
    parts.push(fx.laser.chain ? t('lasers of {d} + laser chain on the way (range {r})', v) : t('lasers of {d} on the way (range {r})', v));
  }
  if (fx.burst) parts.push(t('{q} x {d} laser burst on impact', { q: fx.burst.qty, d: formatNum(fx.burst.damage) }));
  if (fx.chainSpark) parts.push(t('{q} chain sparks of {d} that slow', { q: fx.chainSpark.qty, d: formatNum(fx.chainSpark.damage) }));
  if (fx.rockets) parts.push(t('rockets of {d} on the way', { d: formatNum(fx.rockets.damage) }));
  if (fx.cluster) {
    const v = { q: fx.cluster.qty, d: formatNum(fx.cluster.damage), l: formatNum(fx.cluster.laser || 0) };
    parts.push(fx.cluster.laser ? t('{q} clusters of {d} with {l} lasers', v) : t('{q} clusters of {d}', v));
  }
  if (fx.sparks) parts.push(t('{q} sparks of {d} that slow', { q: fx.sparks.qty, d: formatNum(fx.sparks.damage) }));
  if (fx.blackHole) {
    const b = fx.blackHole;
    parts.push(t('Black hole on the road (within {p}): swallows every attacker within {r} for {s}, no bounty', { p: b.placeRange, r: b.radius, s: sec(b.duration) }));
  }
  if (fx.shockwave) parts.push(t('Expanding ring: {d} to everything within {r}, knocks attackers back and slows', { d: formatNum(fx.shockwave.damage), r: fx.shockwave.radius }));
  if (fx.chain && !fx.laser?.chain) parts.push(t('+ laser chain'));
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

/** Partner colours as a flat list, e.g. { red: 2, blue: 1 } -> ['red', 'red', 'blue']. */
export function partnerList(r: ComboRecipe): KeyColor[] {
  const out: KeyColor[] = [];
  for (const c of COLORS) for (let i = 0; i < (r.needs[c] || 0); i++) out.push(c);
  return out;
}

/** Number of recipes in the game (all lead colours). */
export const COMBO_COUNT = LEAD_ORDER.reduce((n, c) => n + COMBOS[c].length, 0);

/** The Codex dialog body. `fired` maps recipe id -> times fired (src/ui/storage.ts getCodex). */
export function buildCodex(fired: Record<string, number>): HTMLElement {
  const found = Object.keys(fired).filter((id) => fired[id] > 0).length;
  const root = h('div', { class: 'os-help os-codex' },
    h('p', { class: 'os-hint' },
      t('Discovered {found} of {total}. A combo needs turrets with fully upgraded damage within 70 of each other. The lead (the first to fire) picks the family by its colour; recipes are tried top to bottom. Damage values are before modifiers.',
        { found, total: COMBO_COUNT })));
  for (const lead of LEAD_ORDER) {
    root.append(h('h3', null, colorDot(lead), ' ' + t('{colour} ({shape}) leads', { colour: COLOUR_WORD[lead](), shape: SHAPE_WORD[lead]() })));
    const list = h('div', { class: 'os-codex-list' });
    for (const r of COMBOS[lead]) {
      const n = fired[r.id] || 0;
      const exact = r.exact ? ' ' + t('(exactly {list})', { list: Object.entries(r.exact).filter(([c]) => isColour(c)).map(([c, k]) => COLOUR_COUNT[c as KeyColor](k || 0)).join(', ') }) : '';
      list.append(h('div', { class: 'os-codex-row' + (n ? ' found' : ''), style: `border-left-color:${COMBO_HEX[lead]}` },
        h('div', { class: 'os-codex-top' },
          h('span', { class: 'os-cdots' }, colorDot(lead), h('span', { class: 'os-codex-plus' }, '+'), ...partnerList(r).map((c) => colorDot(c))),
          h('b', null, r.name),
          r.isNew ? h('i', { class: 'os-cnew', title: t('Designed for this remake') }, t('new')) : null,
          h('span', { class: 'os-codex-meta' }, t('recharge {s}', { s: sec(r.recharge) })),
          h('span', { class: 'os-codex-found', title: n ? t('Fired {n} times', { n }) : t('Not fired yet') }, n ? '✓ ' + formatNum(n) : t('not yet'))),
        h('div', { class: 'os-codex-desc' }, describeCombo(r) + exact)));
    }
    root.append(list);
  }
  return root;
}
