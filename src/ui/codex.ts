// Combo Codex: every combo recipe with its partners, recharge and effect. The effect text is generated from the recipe
// data (src/data/combos.ts), so the words and the numbers can never drift apart. describeCombo is pure (tested in Node).
import { h } from './dom.ts';
import { formatNum } from './format.ts';
import { COMBOS, BLAST_RADIUS } from '../data/combos.ts';
import { colorDot, COLOR_SYMBOL, COMBO_HEX } from './colors.ts';
import type { ComboRecipe, KeyColor, ProjectileKind } from '../types.ts';

const COLORS: KeyColor[] = ['red', 'green', 'blue', 'yellow'];
const LEAD_ORDER: KeyColor[] = ['red', 'green', 'blue', 'yellow'];

const PROJECTILE: Partial<Record<ProjectileKind, string>> = {
  nuke: 'Nuke rocket', poisonRocket: 'Poison rocket', laserRocket: 'Laser rocket', napalmRocket: 'Napalm rocket',
  tazerRocket: 'Tazer rocket', bfg: 'Slow plasma ball', clusterBomb: 'Cluster bomb', mine: 'Landmine on the road',
};

const sec = (ms: number): string => (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + ' s';

/** One line describing what a combo does, built from its fx data (damage values before modifiers). */
export function describeCombo(r: ComboRecipe): string {
  const fx = r.fx;
  const parts: string[] = [];
  if (fx.projectile) parts.push(PROJECTILE[fx.projectile] || 'Rocket');
  if (fx.hit != null) parts.push(formatNum(fx.hit) + ' hit');
  if (fx.blast) {
    const size = typeof fx.blast.size === 'number' ? fx.blast.size : BLAST_RADIUS[fx.blast.size];
    parts.push(`${formatNum(fx.blast.damage)} blast (radius ${size})` + (fx.blast.poison ? ', slows' : ''));
  }
  if (fx.napalm) parts.push(`burning road ${fx.napalm.length} long, ${formatNum(fx.napalm.dps)} per second for ${sec(fx.napalm.duration)}`);
  if (fx.laser) parts.push(`lasers of ${formatNum(fx.laser.damage)}${fx.laser.chain ? ' + laser chain' : ''} on the way (range ${fx.laser.range})`);
  if (fx.burst) parts.push(`${fx.burst.qty} x ${formatNum(fx.burst.damage)} laser burst on impact`);
  if (fx.chainSpark) parts.push(`${fx.chainSpark.qty} chain sparks of ${formatNum(fx.chainSpark.damage)} that slow`);
  if (fx.rockets) parts.push(`rockets of ${formatNum(fx.rockets.damage)} on the way`);
  if (fx.cluster) parts.push(`${fx.cluster.qty} clusters of ${formatNum(fx.cluster.damage)}` + (fx.cluster.laser ? ` with ${formatNum(fx.cluster.laser)} lasers` : ''));
  if (fx.sparks) parts.push(`${fx.sparks.qty} sparks of ${formatNum(fx.sparks.damage)} that slow`);
  if (fx.blackHole) {
    const b = fx.blackHole;
    parts.push(`Black hole on the road (within ${b.placeRange}): swallows every attacker within ${b.radius} for ${sec(b.duration)}, no bounty`);
  }
  if (fx.shockwave) parts.push(`Expanding ring: ${formatNum(fx.shockwave.damage)} to everything within ${fx.shockwave.radius}, knocks attackers back and slows`);
  if (fx.chain && !fx.laser?.chain) parts.push('+ laser chain');
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
      `Discovered ${found} of ${COMBO_COUNT}. A combo needs turrets with fully upgraded damage within 70 of each other. `
      + 'The lead (the first to fire) picks the family by its colour; recipes are tried top to bottom. '
      + 'Damage values are before modifiers.'));
  for (const lead of LEAD_ORDER) {
    root.append(h('h3', null, colorDot(lead), ` ${lead[0].toUpperCase() + lead.slice(1)} (${COLOR_SYMBOL[lead]}) leads`));
    const list = h('div', { class: 'os-codex-list' });
    for (const r of COMBOS[lead]) {
      const n = fired[r.id] || 0;
      const exact = r.exact ? ' (exactly ' + Object.entries(r.exact).map(([c, k]) => `${k} ${c}`).join(', ') + ')' : '';
      list.append(h('div', { class: 'os-codex-row' + (n ? ' found' : ''), style: `border-left-color:${COMBO_HEX[lead]}` },
        h('div', { class: 'os-codex-top' },
          h('span', { class: 'os-cdots' }, colorDot(lead), h('span', { class: 'os-codex-plus' }, '+'), ...partnerList(r).map((c) => colorDot(c))),
          h('b', null, r.name),
          r.isNew ? h('i', { class: 'os-cnew', title: 'Designed for this remake' }, 'new') : null,
          h('span', { class: 'os-codex-meta' }, 'recharge ' + sec(r.recharge)),
          h('span', { class: 'os-codex-found', title: n ? `Fired ${n} times` : 'Not fired yet' }, n ? '✓ ' + formatNum(n) : 'not yet')),
        h('div', { class: 'os-codex-desc' }, describeCombo(r) + exact)));
    }
    root.append(list);
  }
  return root;
}
