// Balance tooling for the new content (5 extra weapons, 4 new combos, difficulty, unlock thresholds).
// Pure headless: drives src/game/Game.js in Node. Nothing here touches the game code.
//
//   node scripts/balance.mjs dps          cost efficiency of every weapon (single turret DPS vs originals)
//   node scripts/balance.mjs combos       damage of all 20 combos (one shot per recharge, and a marching stream)
//   node scripts/balance.mjs difficulty   greedy bot on maps 1, 4, 9 at every difficulty (wave reached)
//   node scripts/balance.mjs unlock       wave at which a medium game reaches each unlock threshold
//   node scripts/balance.mjs all
//
// Method notes (kept in the code so results are reproducible):
//  * DPS: one build is simulated alone (the engine is deterministic and independent turrets do not interact, apart
//    from the Green laser chain which is simulated as a group of 4), against attackers with 1e30 HP so nothing dies
//    (no overkill). Combos are disabled in this harness (tryFire stubbed) so only the weapon itself is measured.
//    Total DPS at a budget = sum over the builds the budget buys (copies of the maxed build once a single turret
//    cannot absorb more money). Levels are picked by enumeration: max damage x rate (x range for the Railgun,
//    because its piercing depends on reach) among all level triples that fit the budget and a minimum range.
//  * Blue/Yellow freak-out is NOT in the raw simulation window (first freak after 60 s); the "avg" column adds the
//    expected freak-out uptime analytically (see freakFactor).
import { Game, STEP_MS } from '../src/game/Game.js';
import { TURRETS } from '../src/data/turrets.js';
import { COMBOS } from '../src/data/combos.js';
import { DIFFICULTIES, FIELD } from '../src/data/rules.js';
import { MAPS } from '../src/data/maps.js';

const fmt = (x) => {
  if (!isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a >= 1e9) return (x / 1e9).toFixed(2) + 'G';
  if (a >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (x / 1e3).toFixed(1) + 'k';
  return x.toFixed(a < 10 ? 2 : 0);
};
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

// ------------------------------------------------------------------ builds (level triples)
const lad = (k, s) => TURRETS[k].ladders[s];
const cum = (k, s, n) => { let c = 0; for (let i = 0; i < n; i++) c += lad(k, s)[i].cost; return c; };
const val = (k, s, n) => (n === 0 ? TURRETS[k].base[s] : lad(k, s)[n - 1].value);
const maxCost = (k) => TURRETS[k].cost + ['damage', 'range', 'rate'].reduce((c, s) => c + cum(k, s, lad(k, s).length), 0);

function bestBuild(k, budget, { minRange = 0, weightRange = false } = {}) {
  const def = TURRETS[k];
  let best = null;
  for (let d = 0; d <= lad(k, 'damage').length; d++) {
    for (let r = 0; r <= lad(k, 'range').length; r++) {
      for (let t = 0; t <= lad(k, 'rate').length; t++) {
        const cost = def.cost + cum(k, 'damage', d) + cum(k, 'range', r) + cum(k, 'rate', t);
        if (cost > budget) continue;
        const range = val(k, 'range', r);
        if (range < minRange) continue;
        const score = val(k, 'damage', d) * val(k, 'rate', t) * (weightRange ? range : 1);
        if (!best || score > best.score || (score === best.score && cost < best.cost)) best = { d, r, t, cost, score };
      }
    }
  }
  return best;
}

/** Expected freak-out multiplier (damage x rate) averaged over time, for Blue / Yellow with 4+4 upgrades. */
function freakFactor(k, b) {
  const def = TURRETS[k];
  if (!def.freakout || b.d < def.freakout.damage || b.t < def.freakout.rate) return 1;
  const F = { warn: 3000, length: 5000, space: 80000, damageMult: 3, rateMult: 4 };
  const gap = F.space / 2 + F.space / 4 - b.t * 4000;         // mean time from 'off' to next warn
  const cycle = Math.max(gap, 0) + F.warn + F.length;
  const u = F.length / cycle;
  return 1 - u + u * (1 + F.damageMult) * (1 + F.rateMult);
}

// ------------------------------------------------------------------ DPS harness
const UX = 590 / Math.hypot(590, 410), UY = 410 / Math.hypot(590, 410);       // map9 road direction
const NX = -UY, NY = UX;
const ROAD_LEN = Math.hypot(590, 410);

function levelUp(g, id, b) {
  for (const [s, n] of [['damage', b.d], ['range', b.r], ['rate', b.t]]) for (let i = 0; i < n; i++) g.upgrade(id, s);
}

/** scen: {type:'single', D} frozen target with turrets on an arc at distance D; {type:'stream', place:'side'|'head'}. */
function measure(kind, b, count, scen) {
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 1, waveInterval: 1e12 });
  g.state.lives = 1e12;
  g.combos.tryFire = () => false;
  g._placementProblem = () => null;
  const ids = [];
  const T = { x: 300, y: 200 };
  for (let i = 0; i < count; i++) {
    let x, y;
    if (scen.type === 'single') {
      const th = Math.PI + (i - (count - 1) / 2) * (12 / scen.D);
      x = T.x + Math.cos(th) * scen.D; y = T.y + Math.sin(th) * scen.D;
    } else if (scen.place === 'side') {
      const s = ROAD_LEN / 2 + (i - (count - 1) / 2) * 8;
      x = UX * s + NX * 40; y = UY * s + NY * 40;
    } else {
      const s = -30 - i * 6;
      x = UX * s; y = UY * s;
    }
    const r = g.build(kind, x, y);
    if (!r.ok) throw new Error('build ' + kind + ': ' + r.reason);
    levelUp(g, r.id, b);
    ids.push(r.id);
  }
  if (Math.abs(g.state.spent - count * b.cost) > 1e-6) throw new Error('cost mismatch ' + kind);
  let dmg = 0, t0 = Infinity;
  const orig = g.damageAttacker.bind(g);
  g.damageAttacker = (a, d, s, p) => { if (g.state.time >= t0) dmg += d; return orig(a, d, s, p); };
  let target = null;
  let warm, win;
  if (scen.type === 'single') {
    target = g.spawnAttacker(1, 1e30);
    target.blackholed = true; target.x = T.x; target.y = T.y;
    warm = 12; win = 30;
  } else { warm = 20; win = 30; }
  let acc = 0;
  const total = Math.round((warm + win) / (STEP_MS / 1000));
  for (let i = 0; i < total; i++) {
    if (i === Math.round(warm / (STEP_MS / 1000))) t0 = g.state.time;
    if (scen.type === 'stream') { acc += STEP_MS; if (acc >= 700) { acc -= 700; g.spawnAttacker(1, 1e30); } }
    g.advance(1);
  }
  return dmg / win;
}

const cache = new Map();
function dpsOf(kind, b, count, scen) {
  const key = [kind, b.d, b.r, b.t, count, scen.type, scen.D || scen.place].join('|');
  if (!cache.has(key)) cache.set(key, measure(kind, b, count, scen));
  return cache.get(key);
}

/** Plan the builds a budget buys and sum their DPS. Green is always built as chains of 4. */
function planDps(kind, B, scen, opt = {}) {
  const unit = kind === 'green' ? 4 : 1;
  const def = TURRETS[kind];
  let rem = B, dps = 0, dpsAvg = 0, spent = 0, desc = [];
  for (let guard = 0; guard < 40 && rem >= unit * def.cost; guard++) {
    const per = Math.min(rem / unit, maxCost(kind));
    const b = bestBuild(kind, per, opt);
    if (!b) break;
    const d = dpsOf(kind, b, unit, scen);
    dps += d;
    dpsAvg += d * freakFactor(kind, b);
    spent += unit * b.cost; rem -= unit * b.cost;
    desc.push(`${unit > 1 ? unit + 'x' : ''}${b.d}/${b.r}/${b.t}`);
    if (unit * b.cost >= unit * maxCost(kind) - 1e-6 || B <= 0) { /* maxed copy, loop for more */ }
    if (b.cost === 0) break;
  }
  return { dps, dpsAvg, spent, desc: desc.join(' ') };
}

const BUDGETS = [5000, 20000, 80000, 300000];
const ORIG = ['blue', 'green', 'red', 'yellow'];
const NEW = ['sniper', 'fusion', 'railgun'];

function dpsReport() {
  console.log('\n=== DPS per investment (rows: kind, columns: budget). dps raw / avg incl. expected freak-out (Blue, Yellow)');
  console.log('Level triples are damage/range/rate levels of the (largest) build. Green = chains of 4.');
  const scenarios = [
    { name: 'S1 stream, turret beside the road (spaced 42 u, 60 u/s)', scen: { type: 'stream', place: 'side' }, opt: {} },
    { name: 'S2 sustained single target at 40 u (frozen)', scen: { type: 'single', D: 40 }, opt: {} },
    { name: 'S3 single target at long range 320 u (needs range >= 320)', scen: { type: 'single', D: 320 }, opt: { minRange: 320 } },
    { name: 'S4 head-on straight stretch: turret on the road axis, stream walks away along the line (railgun niche)', scen: { type: 'stream', place: 'head' }, opt: {} },
  ];
  const summary = {};
  for (const sc of scenarios) {
    console.log(`\n--- ${sc.name}`);
    console.log(pad('kind', 9) + BUDGETS.map((B) => rpad('$' + B / 1000 + 'K', 14)).join('') + '   (ratio to best original, avg column)');
    const rows = {};
    for (const k of [...ORIG, ...NEW]) {
      rows[k] = BUDGETS.map((B) => {
        if (TURRETS[k].cost * (k === 'green' ? 4 : 1) > B) return null;
        const opt = { ...sc.opt, weightRange: k === 'railgun' };
        const p = planDps(k, B, sc.scen, opt);
        return p.dps > 0 ? p : null;
      });
    }
    for (const k of [...ORIG, ...NEW]) {
      const line = rows[k].map((p) => rpad(p ? fmt(p.dps) + (p.dpsAvg > p.dps * 1.01 ? '/' + fmt(p.dpsAvg) : '') : '-', 14)).join('');
      console.log(pad(k, 9) + line);
    }
    const ratios = {};
    for (const k of NEW) {
      ratios[k] = BUDGETS.map((B, i) => {
        const p = rows[k][i];
        if (!p) return null;
        const best = Math.max(...ORIG.map((o) => (rows[o][i] ? rows[o][i].dpsAvg : 0)));
        const bestRaw = Math.max(...ORIG.map((o) => (rows[o][i] ? rows[o][i].dps : 0)));
        return { avg: p.dpsAvg / best, raw: p.dps / bestRaw, spent: p.spent };
      });
      console.log(pad(k + ' x', 9) + ratios[k].map((r) => rpad(r ? r.raw.toFixed(2) + '/' + r.avg.toFixed(2) : '-', 14)).join('') + '   (raw/avg-freak)');
    }
    summary[sc.name] = ratios;
  }
  // builds chosen for ONE turret at each budget (damage/range/rate levels)
  console.log('\n--- level triples (damage/range/rate) of the best single build at each budget');
  for (const k of [...ORIG, ...NEW]) {
    console.log(pad(k, 9) + BUDGETS.map((B) => rpad(TURRETS[k].cost > B ? '-' : (() => { const b = bestBuild(k, Math.min(B, maxCost(k)), { weightRange: k === 'railgun' }); return `${b.d}/${b.r}/${b.t}`; })(), 10)).join(''));
  }
  console.log('\n--- maxed single-turret cost: ' + [...ORIG, ...NEW, 'targeter', 'comboOnly'].map((k) => `${k} ${fmt(maxCost(k))}`).join(', '));
  // damage-maxed cost (what a combo partner needs)
  // Support turrets: price of the same reach on the turret itself vs a Targeter
  console.log('\n--- Targeter: cost of reach R (Targeter base + range ladder) vs the turret reaching R on its own ladder');
  const reachCost = (k, R) => { if (k === 'targeter') { let c = TURRETS.targeter.cost; for (let i = 0; i < lad(k, 'range').length && val(k, 'range', i) < R; i++) c += lad(k, 'range')[i].cost; return val(k, 'range', lad(k, 'range').length) >= R ? c : null; } let c = 0; for (let i = 0; i < lad(k, 'range').length && val(k, 'range', i) < R; i++) c += lad(k, 'range')[i].cost; return val(k, 'range', lad(k, 'range').length) >= R ? c : null; };
  console.log(pad('reach', 8) + ['targeter', ...ORIG].map((k) => rpad(k, 10)).join(''));
  for (const R of [150, 200, 250, 300, 350]) console.log(pad(R, 8) + ['targeter', ...ORIG].map((k) => rpad(reachCost(k, R) == null ? 'n/a' : fmt(reachCost(k, R)), 10)).join(''));
  console.log('--- combo-capable cost (build + damage ladder only): ' + [...ORIG, ...NEW].map((k) => `${k} ${fmt(TURRETS[k].cost + cum(k, 'damage', lad(k, 'damage').length))}`).join(', ') + `, comboOnly ${fmt(TURRETS.comboOnly.cost)}`);
}

// ------------------------------------------------------------------ combos
const RECIPES = [];
for (const [colour, list] of Object.entries(COMBOS)) for (const r of list) RECIPES.push({ colour, r });

function slotsFor(probe, x, y) {
  const out = [];
  for (let r = 46; r <= 68; r += 6) {
    for (let a = 0; a < 360; a += 10) {
      const sx = x + Math.cos((a * Math.PI) / 180) * r, sy = y + Math.sin((a * Math.PI) / 180) * r;
      if (!probe.canBuild('blue', sx, sy).ok) continue;
      if (out.every((o) => Math.hypot(o.x - sx, o.y - sy) >= 45)) out.push({ x: sx, y: sy });
    }
  }
  return out;
}
function comboSpot() {
  // beside the middle of the straight map9 road
  const probe = new Game({ mapId: 'map9', mode: 'sandbox', seed: 1 });
  let best = null;
  for (let off = 40; off <= 60; off += 5) {
    const s = ROAD_LEN / 2;
    for (const sign of [1, -1]) {
      const x = UX * s + NX * off * sign, y = UY * s + NY * off * sign;
      if (!probe.canBuild('blue', x, y).ok) continue;
      const slots = slotsFor(probe, x, y);
      if (!best || slots.length > best.slots.length) best = { x, y, slots };
    }
  }
  return best;
}

function comboSetup(r, colour, spot, seed = 5) {
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed, waveInterval: 1e12 });
  g.state.lives = 1e12;
  const need = [];
  for (const [c, n] of Object.entries(r.needs)) for (let i = 0; i < n; i++) need.push(c);
  const lead = g.turretMap.get(g.build(colour, spot.x, spot.y).id);
  const partners = need.map((c, i) => {
    const o = g.turretMap.get(g.build(c, spot.slots[i].x, spot.slots[i].y).id);
    return o;
  });
  for (const t of [lead, ...partners]) {
    for (const st of ['range', 'rate']) g.upgrade(t.id, st, true);
    g.upgrade(t.id, 'damage', true);
  }
  return { g, lead, partners };
}

/** After the first combo fires, lock every turret so exactly one combo is measured (no normal shots, no second combo). */
function lockAfterFirst(g, onFire) {
  g.on('combo', (e) => {
    onFire(e);
    for (const t of g.state.turrets) { t.cd = 1e9; t.comboNext = 1e12; }
  });
}

/**
 * One combo shot. layout: 'single' | 'pack' (frozen attackers on the road, spaced 42 u) or 'walk'
 * (attackers keep marching, a continuous stream of 700 ms spacing, 8 of them already around the turrets).
 * Returns the total damage dealt by that single combo within 22 s, and the id of the combo that fired.
 */
function comboOneShot(r, colour, spot, layout, seed = 5) {
  const { g, lead } = comboSetup(r, colour, spot, seed);
  g.combos.dbg = true;
  const road = g.roadPoints();
  let c = road[0];
  for (const q of road) if (Math.hypot(q.x - lead.x, q.y - lead.y) < Math.hypot(c.x - lead.x, c.y - lead.y)) c = q;
  const n = layout === 'single' ? 1 : layout === 'pack' ? 6 : 8;
  const frozen = layout !== 'walk';
  const atts = [];
  for (let i = 0; i < n; i++) {
    const a = g.spawnAttacker(1, 1e15);
    const d = c.d + (i - (n - 1) / 2) * 42;
    a.progress = d; g.path.place(a, d); if (frozen) a.blackholed = true;
    atts.push(a);
  }
  g.grid.rebuild(g.state.attackers);
  let dmg = 0, fired = null;
  const orig = g.damageAttacker.bind(g);
  g.damageAttacker = (a, d, s, p) => { dmg += d; return orig(a, d, s, p); };
  lockAfterFirst(g, (e) => { if (!fired) fired = e.id; });
  const steps = Math.round(22 / (STEP_MS / 1000));
  let acc = 0;
  for (let i = 0; i < steps; i++) {
    if (layout === 'walk') { acc += STEP_MS; if (acc >= 700) { acc -= 700; g.spawnAttacker(1, 1e15); } }
    g.advance(1);
  }
  const hit = atts.filter((a) => a.hp < a.maxHp).length;
  return { dmg, fired, hit };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function combosReport() {
  console.log('\n=== Combos (real implementation, one combo per run, all turrets fully upgraded, no modifiers).');
  console.log('    value = total damage of ONE combo / recharge seconds. single/pack: frozen attackers (1 / 6 spaced 42 u);');
  console.log('    walk: marching stream, mean of 10 seeds (mines land on random road points, napalm burns walkers ~2.7 s).');
  const spot = comboSpot();
  const rows = [];
  for (const { colour, r } of RECIPES) {
    const n = 1 + Object.values(r.needs).reduce((a, b) => a + b, 0);
    const sec = r.recharge / 1000;
    const one = comboOneShot(r, colour, spot, 'single');
    const pack = comboOneShot(r, colour, spot, 'pack');
    const walks = [];
    let wrong = 0;
    for (let seed = 1; seed <= 10; seed++) { const w = comboOneShot(r, colour, spot, 'walk', seed); walks.push(w.dmg / sec); if (w.fired !== r.id) wrong++; }
    rows.push({ id: r.id, isNew: !!r.isNew, n, recharge: r.recharge, single: one.dmg / sec, pack: pack.dmg / sec, packHit: pack.hit, walk: mean(walks), wrong, firedPack: pack.fired });
  }
  console.log(pad('combo', 22) + rpad('turrets', 8) + rpad('rech s', 8) + rpad('single/s', 11) + rpad('pack/s', 11) + rpad('hit', 5) + rpad('walk/s', 11) + '  note');
  for (const x of rows) {
    console.log(pad(x.id + (x.isNew ? ' *' : ''), 22) + rpad(x.n, 8) + rpad((x.recharge / 1000).toFixed(1), 8) + rpad(fmt(x.single), 11) + rpad(fmt(x.pack), 11) + rpad(x.packHit, 5) + rpad(fmt(x.walk), 11)
      + (x.firedPack !== x.id ? `  pack fired ${x.firedPack}` : '') + (x.wrong ? `  walk: other recipe in ${x.wrong}/10` : ''));
  }
  const by = Object.fromEntries(rows.map((x) => [x.id, x]));
  const ratio = (id, refs, key) => (by[id][key] / (refs.reduce((s, i) => s + by[i][key], 0) / refs.length)).toFixed(2);
  const pairs = [
    ['napalm', ['nuke', 'bigMine']], ['tazerRocket', ['laserRocket', 'clusterBomb']],
    ['shockwave', ['bfg']], ['tazerBfg', ['bfg']],
  ];
  console.log('\nRatio new / mean(reference): single, pack, walk');
  for (const [id, refs] of pairs) console.log(pad(id, 14) + 'vs ' + pad(refs.join('+'), 24) + ['single', 'pack', 'walk'].map((k) => rpad(ratio(id, refs, k), 7)).join(''));
}

// ------------------------------------------------------------------ greedy bot (adapted from sim-test.mjs)
function bestSpots(mapId, count, spacing = 46, radius = 110) {
  const probe = new Game({ mapId, mode: 'sandbox', seed: 1 });
  const road = probe.roadPoints();
  const cand = [];
  for (let x = 22; x <= 698; x += 11) {
    for (let y = 22; y <= 428; y += 11) {
      if (!probe.canBuild('blue', x, y).ok) continue;
      let score = 0;
      for (const r of road) if ((r.x - x) ** 2 + (r.y - y) ** 2 <= radius * radius) score++;
      cand.push({ x, y, score });
    }
  }
  cand.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of cand) {
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= spacing)) out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

/** Same policy as sim-test: more turrets over time (4 + wave/2), then cheapest upgrade first. */
function makePlayer(game, spots, kinds = ['blue', 'green', 'red', 'yellow']) {
  let next = 0;
  return function act() {
    const s = game.state;
    for (let guard = 0; guard < 40; guard++) {
      const want = 4 + Math.floor(s.wave / 2);
      if (next < spots.length && s.turrets.length < want) {
        const kind = kinds[next % kinds.length];
        const r = game.build(kind, spots[next].x, spots[next].y);
        if (r.ok) { next++; continue; }
        if (r.reason === 'Not enough cash') break;
        next++; continue;
      }
      let best = null;
      for (const t of s.turrets) for (const st of ['damage', 'rate', 'range']) {
        const c = game.upgradeCost(t.id, st);
        if (c != null && (!best || c < best.c)) best = { id: t.id, st, c };
      }
      if (best && s.cash >= best.c) { game.upgrade(best.id, best.st); continue; }
      break;
    }
  };
}

function playGame(mapId, difficulty, seed, maxWave = 400) {
  const g = new Game({ mapId, difficulty, seed });
  const act = makePlayer(g, bestSpots(mapId, 40));
  let frames = 0;
  while (!g.state.over && g.state.wave < maxWave && frames < 400000) {
    g.advance(10);
    act();
    frames++;
  }
  return { wave: g.state.wave, kills: g.state.kills, over: g.state.over, spent: g.state.spent, turrets: g.state.turrets.length };
}

function difficultyReport(maps = ['map1', 'map4', 'map9'], seeds = [11, 12, 13]) {
  console.log('\n=== Greedy bot: wave reached at game over (mean of seeds ' + seeds.join(',') + ')');
  const diffs = Object.keys(DIFFICULTIES);
  console.log(pad('map', 8) + diffs.map((d) => rpad(d, 10)).join('') + rpad('ext/med', 9) + rpad('hard/med', 9) + rpad('easy/med', 9));
  const tot = Object.fromEntries(diffs.map((d) => [d, 0]));
  for (const m of maps) {
    const row = {};
    for (const d of diffs) {
      const w = seeds.map((s) => playGame(m, d, s).wave);
      row[d] = w.reduce((a, b) => a + b, 0) / w.length;
      tot[d] += row[d];
    }
    console.log(pad(m, 8) + diffs.map((d) => rpad(row[d].toFixed(1), 10)).join('')
      + rpad((row.extreme / row.medium).toFixed(2), 9) + rpad((row.hard / row.medium).toFixed(2), 9) + rpad((row.easy / row.medium).toFixed(2), 9));
  }
  console.log(pad('mean', 8) + diffs.map((d) => rpad((tot[d] / maps.length).toFixed(1), 10)).join('')
    + rpad((tot.extreme / tot.medium).toFixed(2), 9) + rpad((tot.hard / tot.medium).toFixed(2), 9) + rpad((tot.easy / tot.medium).toFixed(2), 9));
}

// ------------------------------------------------------------------ unlock thresholds
function clusterSlots(probe, x, y, n) {
  const out = [];
  for (let r = 46; r <= 62; r += 8) {
    for (let a = 0; a < 360; a += 15) {
      const sx = x + Math.cos((a * Math.PI) / 180) * r, sy = y + Math.sin((a * Math.PI) / 180) * r;
      if (!probe.canBuild('blue', sx, sy).ok) continue;
      if (out.every((o) => Math.hypot(o.x - sx, o.y - sy) >= 45)) out.push({ x: sx, y: sy });
    }
  }
  return out.length >= n - 1 ? out : null;
}

/**
 * Combo bot: concentrate money on one cluster of 3 to 4 turrets at a time, damage ladder first, so combos
 * (Nuke or BFG) fire; the next cluster is only started when every turret has its damage maxed.
 */
function makeComboBot(game, mapId, pattern) {
  const probe = new Game({ mapId, mode: 'sandbox', seed: 1 });
  const clusters = bestSpots(mapId, 14, 130).map((c) => ({ c, s: clusterSlots(probe, c.x, c.y, pattern.length) })).filter((k) => k.s);
  let ci = 0;
  const built = {};
  return function act() {
    const st = game.state;
    for (let guard = 0; guard < 50; guard++) {
      const allMax = st.turrets.every((t) => t.levels.damage >= t.maxLevels.damage);
      const want = Math.min(clusters.length, allMax ? ci + 1 : ci || 1);
      if (ci < want) {
        const spots = [clusters[ci].c, ...clusters[ci].s];
        let ok = true;
        for (let i = 0; i < pattern.length; i++) {
          if (built[ci * 10 + i]) continue;
          const r = game.build(pattern[i], spots[i].x, spots[i].y);
          if (r.ok) built[ci * 10 + i] = r.id; else { ok = false; break; }
        }
        if (ok) { ci++; continue; }
        break;
      }
      let best = null;
      for (const t of st.turrets) for (const stat of ['damage', 'rate', 'range']) {
        const c = game.upgradeCost(t.id, stat);
        if (c == null) continue;
        const key = (stat === 'damage' ? 0 : stat === 'rate' ? 1 : 2) * 1e9 + c;
        if (!best || key < best.key) best = { id: t.id, stat, c, key };
      }
      if (best && st.cash >= best.c) { game.upgrade(best.id, best.stat); continue; }
      break;
    }
  };
}

function unlockReport(maps = ['map1', 'map4', 'map9'], seed = 11) {
  const names = Object.entries(TURRETS).filter(([, d]) => d.unlockKills != null).map(([k, d]) => [k, d.unlockKills]).sort((a, b) => a[1] - b[1]);
  console.log('\n=== Medium game: wave at which each unlock threshold is reached ("-" = never before game over).');
  console.log('    Kills accrue at most 10 per wave, so wave >= kills / 10 + 1 (upper bound on speed).');
  console.log('    new weapons: ' + names.filter(([k]) => ['targeter', 'sniper', 'fusion', 'railgun', 'comboOnly'].includes(k)).map(([k, u]) => `${k} ${u} (wave >= ${Math.floor(u / 10) + 1})`).join(', '));
  const bots = [
    ['greedy', (g, m) => makePlayer(g, bestSpots(m, 40))],
    ['combo red+blue+blue', (g, m) => makeComboBot(g, m, ['red', 'blue', 'blue'])],
    ['combo green+red+blue', (g, m) => makeComboBot(g, m, ['green', 'red', 'blue'])],
  ];
  for (const [bn, mk] of bots) {
    for (const m of maps) {
      const g = new Game({ mapId: m, difficulty: 'medium', seed });
      const act = mk(g, m);
      const when = {};
      g.on('unlock', (e) => { when[e.kind] = g.state.wave; });
      let n = 0;
      while (!g.state.over && g.state.wave < 300 && n < 400000) { g.advance(10); act(); n++; }
      const key = ['targeter', 'sniper', 'fusion', 'railgun', 'comboOnly'];
      console.log(`${pad(bn, 21)} ${m}: over at wave ${rpad(g.state.wave, 3)}, ${rpad(g.state.kills, 4)} kills, spent ${rpad(fmt(g.state.spent), 6)} | ` + key.map((k) => `${k} ${when[k] ?? '-'}`).join(', '));
    }
  }
}

// ------------------------------------------------------------------ main
export { bestBuild, planDps, maxCost, cum, val, dpsOf, measure, freakFactor, comboSpot, comboOneShot, playGame, bestSpots, makePlayer };
const isMain = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
const mode = process.argv[2] || 'all';
if (isMain) {
  if (mode === 'dps' || mode === 'all') dpsReport();
  if (mode === 'combos' || mode === 'all') combosReport();
  if (mode === 'difficulty' || mode === 'all') difficultyReport();
  if (mode === 'unlock' || mode === 'all') unlockReport();
}
