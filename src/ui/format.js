// Big number formatting: 1,234 below 10K, then 12.3K, 4.56M, 7.89B, 1.23T, then 1.23e15.

const UNITS = [[1e3, 'K'], [1e6, 'M'], [1e9, 'B'], [1e12, 'T']];

function sig3(v) {
  if (v < 10) return v.toFixed(2);
  if (v < 100) return v.toFixed(1);
  return v.toFixed(0);
}

export function formatNum(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const r = Math.round(a);
  if (r < 10000) return sign + r.toLocaleString('en-US');
  if (a >= 1e15) return sign + a.toExponential(2).replace('e+', 'e');
  let i = 0;
  while (i < UNITS.length - 1 && a >= UNITS[i + 1][0]) i++;
  let str = sig3(a / UNITS[i][0]);
  if (parseFloat(str) >= 1000) {
    // rounding rolled over (e.g. 999.7K): move to the next unit
    if (i + 1 < UNITS.length) { i++; str = sig3(a / UNITS[i][0]); }
    else return sign + a.toExponential(2).replace('e+', 'e');
  }
  return sign + String(parseFloat(str)) + UNITS[i][1];
}

export function formatCash(n) {
  const s = formatNum(n);
  return s.startsWith('-') ? '-$' + s.slice(1) : '$' + s;
}

export function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s + 's';
}
