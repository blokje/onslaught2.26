// Small original SVG icons, one consistent style: dark rounded base, bright coloured weapon, light outline.

const BASE = '<circle cx="24" cy="24" r="20.5" fill="#2b251f" stroke="#7d6c52" stroke-width="2.5"/>';
const HEX = '<polygon points="24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5" fill="#2b251f" stroke="#a98a5a" stroke-width="2.5" stroke-linejoin="round"/>';

const C = { blue: '#4da3ff', green: '#52d17a', red: '#ff6a4d', yellow: '#ffd54a', cyan: '#6fd3e8', orange: '#ff9a3d', lime: '#b6e35a', light: '#f6ecd8' };

const glyphRange = (col: string, s = 1): string => `<g transform="translate(24 24) scale(${s}) translate(-24 -24)" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"><circle cx="24" cy="24" r="3" fill="${col}" stroke="none"/><path d="M17 17a10 10 0 0 0 0 14M31 17a10 10 0 0 1 0 14M12 12a17 17 0 0 0 0 24M36 12a17 17 0 0 1 0 24"/></g>`;
const star = (cx: number, cy: number, ro: number, ri: number, n: number, col: string): string => {
  let p = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = (Math.PI * i) / n - Math.PI / 2;
    p += `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)} `;
  }
  return `<polygon points="${p.trim()}" fill="${col}" stroke="${C.light}" stroke-width="1.5" stroke-linejoin="round"/>`;
};
const glyphDamage = (col: string, big: boolean): string => big
  ? star(24, 24, 17, 8, 8, col) + star(24, 24, 8, 4, 8, C.light)
  : star(24, 24, 14, 6.5, 6, col);
const glyphRate = (col: string): string => `<g fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 13l11 11-11 11M25 13l11 11-11 11"/></g>`;
const exMark = '<g fill="none" stroke="#f6ecd8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M31 10h9l-3-3M40 10l-3 3M40 15h-9l3-3M31 15l3 3"/></g>';

const ICONS: Record<string, string> = {
  blue: BASE + `<g transform="rotate(-40 24 24)"><rect x="20" y="4" width="8" height="24" rx="2.5" fill="${C.blue}" stroke="#d3eaff" stroke-width="1.6"/><circle cx="24" cy="27" r="9" fill="#2f7fd6" stroke="#d3eaff" stroke-width="1.8"/></g>`,
  green: BASE + `<path d="M24 4v9M24 35v9M4 24h9M35 24h9" stroke="${C.green}" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="24" r="10" fill="#2a9a55" stroke="#dcffe8" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="#effff4"/>`,
  red: BASE + `<rect x="9" y="22" width="30" height="13" rx="3" fill="#6b2a21" stroke="#ffd2c8" stroke-width="1.5"/>` +
    [13, 21, 29].map((x) => `<rect x="${x}" y="9" width="7" height="22" rx="3.5" fill="${C.red}" stroke="#ffd2c8" stroke-width="1.5"/>`).join(''),
  yellow: BASE + `<path d="M26 5L15 22h9L18 43l16-24h-9z" fill="${C.yellow}" stroke="#fff3bd" stroke-width="1.8" stroke-linejoin="round"/>`,
  rangeUp: HEX + glyphRange(C.cyan),
  damageUp: HEX + glyphDamage(C.orange, false),
  rateUpEx: HEX + glyphRate(C.lime) + exMark,
  rangeUpEx: HEX + glyphRange(C.cyan, 0.9) + exMark,
  rateUp: HEX + glyphRate(C.lime),
  damageUpBig: HEX + glyphDamage(C.orange, true),
  damageUpBigEx: HEX + glyphDamage(C.orange, true) + exMark,
  targeter: BASE + `<circle cx="24" cy="24" r="12" fill="none" stroke="${C.light}" stroke-width="2.6"/><path d="M24 6v10M24 32v10M6 24h10M32 24h10" stroke="${C.light}" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="24" r="2.8" fill="#ff6a4d"/>`,
  sniper: BASE + `<g transform="rotate(-35 24 24)"><rect x="21.5" y="2" width="5" height="32" rx="2" fill="${C.blue}" stroke="#d3eaff" stroke-width="1.5"/><rect x="18" y="20" width="12" height="8" rx="2" fill="#2f7fd6" stroke="#d3eaff" stroke-width="1.5"/></g><circle cx="24" cy="26" r="6" fill="#2b251f" stroke="${C.light}" stroke-width="1.8"/><circle cx="24" cy="26" r="1.6" fill="#ff6a4d"/>`,
  fusion: BASE + `<circle cx="24" cy="24" r="14" fill="none" stroke="${C.green}" stroke-width="3" stroke-dasharray="6 4"/><circle cx="24" cy="24" r="8" fill="#2a9a55" stroke="#dcffe8" stroke-width="2"/><circle cx="24" cy="24" r="3.5" fill="#fff"/>`,
  railgun: BASE + `<g transform="rotate(-40 24 24)"><rect x="14" y="5" width="5" height="36" rx="2" fill="${C.red}" stroke="#ffd2c8" stroke-width="1.5"/><rect x="29" y="5" width="5" height="36" rx="2" fill="${C.red}" stroke="#ffd2c8" stroke-width="1.5"/><rect x="21" y="14" width="6" height="14" rx="3" fill="${C.light}"/></g>`,
  comboOnly: BASE + `<path d="M24 24V9A15 15 0 0 1 39 24z" fill="${C.red}"/><path d="M24 24h15A15 15 0 0 1 24 39z" fill="${C.green}"/><path d="M24 24v15A15 15 0 0 1 9 24z" fill="${C.blue}"/><path d="M24 24H9A15 15 0 0 1 24 9z" fill="${C.yellow}"/><circle cx="24" cy="24" r="15" fill="none" stroke="${C.light}" stroke-width="1.8"/>`,
};

export function iconSvg(kind: string, size = '100%'): string {
  const body = ICONS[kind] || BASE;
  return `<svg class="os-svg" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}

export const LOCK_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="#d9c29a"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#d9c29a" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16" r="1.6" fill="#2b251f"/></svg>';

export const TURRET_COLORS: Record<string, string> = { blue: C.blue, green: C.green, red: C.red, yellow: C.yellow };
