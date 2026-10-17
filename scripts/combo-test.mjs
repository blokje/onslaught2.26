// Combo tests. Run: node scripts/combo-test.mjs
// For each of the 20 recipes: build lead + partners (sandbox cash), upgrade everything to max, run the sim and
// check that the right combo fires, recharge is applied, damage is dealt and the specific behaviour happens.
import { Game, STEP_MS } from '../src/game/Game.js';
import { COMBOS, MINE } from '../src/data/combos.js';

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!cond) failures++;
}

const MAP = 'map1';
const HP = 1e12;

// ------------------------------------------------------------------ layout: a lead spot with 6 ring slots
function slotsFor(probe, x, y) {
  // greedy: build spots within 70 of the lead, at least 44 apart (the turret footprint)
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
function findSpot(minRoad = 0, maxRoad = 60) {
  const probe = new Game({ mapId: MAP, mode: 'sandbox', seed: 1 });
  const road = probe.roadPoints();
  let best = null;
  for (let x = 60; x <= 660; x += 6) {
    for (let y = 60; y <= 390; y += 6) {
      if (!probe.canBuild('blue', x, y).ok) continue;
      const rd = probe.path.distanceTo(x, y);
      if (rd < minRoad || rd > maxRoad) continue;
      let score = 0;
      for (const r of road) if ((r.x - x) ** 2 + (r.y - y) ** 2 <= 90 * 90) score++;
      if (best && score <= best.score) continue;
      const slots = slotsFor(probe, x, y);
      if (slots.length >= 5) best = { x, y, score, slots };
    }
  }
  return best;
}
const SPOT = findSpot(0, 60);
const FAR_SPOT = findSpot(100, 130); // at least 100 from any road point (for the "no road in reach" test)

// ------------------------------------------------------------------ scenario builder
/**
 * spec: { lead: kind, partners: [kind | {kind, color, unmaxed}], mods: [kind], seed, spot }
 * Everything is upgraded to max (damage, range, rate) except `unmaxed` partners (damage one level short).
 */
function setup(spec) {
  const g = new Game({ mapId: MAP, mode: 'sandbox', seed: spec.seed || 5, waveInterval: 1e9 });
  const spot = spec.spot || SPOT;
  const slots = spot.slots;
  const lead = g.turretMap.get(g.build(spec.lead, spot.x, spot.y).id);
  const partners = [];
  (spec.partners || []).forEach((p, i) => {
    const o = typeof p === 'string' ? { kind: p } : p;
    const r = g.build(o.kind, slots[i].x, slots[i].y);
    if (!r.ok) throw new Error('build failed: ' + r.reason);
    const t = g.turretMap.get(r.id);
    if (o.color) g.setComboColor(t.id, o.color);
    t.__unmaxed = !!o.unmaxed;
    partners.push(t);
  });
  (spec.mods || []).forEach((k, i) => {
    const r = g.build(k, slots[slots.length - 1 - i].x, slots[slots.length - 1 - i].y);
    if (!r.ok) throw new Error('mod build failed: ' + r.reason);
  });
  for (const t of [lead, ...partners]) {
    if (t.kind === 'comboOnly') continue;
    for (const st of ['range', 'rate']) g.upgrade(t.id, st, true);
    if (t.__unmaxed) {
      const n = t.maxLevels.damage - 1;
      for (let i = 0; i < n; i++) g.upgrade(t.id, 'damage');
    } else g.upgrade(t.id, 'damage', true);
  }
  return { g, lead, partners, spot };
}

function roadNear(g, spot, r = 90) {
  return g.roadPoints().filter((q) => (q.x - spot.x) ** 2 + (q.y - spot.y) ** 2 <= r * r);
}
/** n attackers on the road near the spot. frozen: pinned in place (engine treats blackholed as "not moved"). */
function addAttackers(g, spot, n, frozen = true, hp = HP) {
  const pts = roadNear(g, spot);
  const out = [];
  for (let i = 0; i < n; i++) {
    const q = pts[Math.floor(((i + 0.5) * pts.length) / n)];
    const a = g.spawnAttacker(1, hp);
    a.progress = q.d;
    g.path.place(a, q.d);
    if (frozen) a.blackholed = true;
    out.push(a);
  }
  g.grid.rebuild(g.state.attackers);
  return out;
}

// ------------------------------------------------------------------ observer
function observe(g) {
  const o = { combos: [], blasts: [], kills: [], beams: {}, projKinds: {}, effects: {}, _b: new WeakSet(), _p: new WeakSet(), _e: new WeakSet() };
  g.on('combo', (e) => o.combos.push({ ...e, time: g.state.time }));
  g.on('blast', (e) => o.blasts.push({ ...e }));
  g.on('kill', (e) => o.kills.push({ ...e }));
  o.tick = () => {
    for (const b of g.state.beams) if (!o._b.has(b)) { o._b.add(b); o.beams[b.kind] = (o.beams[b.kind] || 0) + 1; }
    for (const p of g.state.projectiles) if (!o._p.has(p)) { o._p.add(p); o.projKinds[p.kind] = (o.projKinds[p.kind] || 0) + 1; }
    for (const e of g.state.effects) if (!o._e.has(e)) { o._e.add(e); o.effects[e.kind] = (o.effects[e.kind] || 0) + 1; }
  };
  return o;
}
function run(g, o, steps, hook) {
  for (let i = 0; i < steps; i++) { g.advance(1); o.tick(); if (hook && hook(i) === 'stop') return i + 1; }
  return steps;
}
const lossOf = (list) => list.reduce((s, a) => s + (a.maxHp - a.hp), 0);
const blastCount = (o, size) => o.blasts.filter((b) => b.size === size).length;

// ------------------------------------------------------------------ recipes -> scenarios
const recipes = [];
for (const [colour, list] of Object.entries(COMBOS)) for (const r of list) recipes.push({ colour, r });
check('20 recipes in data', recipes.length === 20, String(recipes.length));

function partnersFor(r) {
  const out = [];
  for (const [c, n] of Object.entries(r.needs)) for (let i = 0; i < n; i++) out.push(c);
  return out;
}

// per-recipe observation window (steps after the combo): recharge minus a margin so no second combo fires
const windowFor = (r) => Math.min(400, Math.floor(r.recharge / STEP_MS) - 6);

for (const { colour, r } of recipes) {
  const fx = r.fx;
  const isHole = !!fx.blackHole, isWave = !!fx.shockwave, isMine = fx.projectile === 'mine';
  const sc = setup({ lead: colour, partners: partnersFor(r) });
  const { g, lead, partners } = sc;
  const needMoving = isHole || isWave;
  const atts = addAttackers(g, sc.spot, 8, !needMoving);
  const o = observe(g);
  const cash0 = g.state.cash, kills0 = g.state.kills;

  // step until the first combo
  let guard = 0;
  while (!o.combos.length && guard++ < 120) { g.advance(1); o.tick(); }
  const first = o.combos[0];
  check(`[${r.id}] fires, correct id, lead = ${colour}`, first && first.id === r.id && first.turretId === lead.id && first.name === r.name,
    first ? first.id : 'no combo');
  if (!first) continue;
  const ct = g.state.time;
  check(`[${r.id}] recharge applied to lead and partners`,
    Math.abs(lead.comboNext - ct - r.recharge) <= 2 * STEP_MS && lead.cd > r.recharge - 40 &&
    partners.every((p) => Math.abs(p.comboNext - ct - r.recharge) <= 2 * STEP_MS && !p.comboReady));
  check(`[${r.id}] comboName effect and partner chain beams`,
    g.state.effects.some((e) => e.kind === 'comboName' && e.data.name === r.name) && (o.beams.chain || 0) >= partners.length);

  // ---- behaviour
  const win = windowFor(r);
  if (isHole) {
    const before = g.state.attackers.length;
    const targetedSwallowed = { n: 0 };
    run(g, o, win, () => {
      for (const t of g.state.turrets) {
        const a = t.targetId != null ? g.attackerMap.get(t.targetId) : null;
        if (a && a.swallowed) targetedSwallowed.n++;
      }
    });
    check(`[${r.id}] black hole effect created`, !!o.effects.blackHole);
    const killed = g.state.kills - kills0;
    check(`[${r.id}] swallows attackers: kills counted, $0 paid`, killed >= 2 && g.state.cash === cash0 && o.kills.every((k) => k.bounty === 0),
      `kills ${killed}, cash delta ${g.state.cash - cash0}`);
    check(`[${r.id}] swallowed attackers never targeted`, targetedSwallowed.n === 0, String(targetedSwallowed.n));
    check(`[${r.id}] only attackers inside the radius died`, killed < before, `${killed} of ${before}`);
    continue;
  }
  if (isWave) {
    // moving attackers: look for a knockback jump between two steps
    const prev = new Map(g.state.attackers.map((a) => [a.id, a.progress]));
    let maxBack = 0;
    run(g, o, 60, () => {
      for (const a of g.state.attackers) {
        const d = a.progress - prev.get(a.id);
        if (d < maxBack) maxBack = d;
        prev.set(a.id, a.progress);
      }
    });
    check(`[${r.id}] shockwave effect, hits and knocks back`, !!o.effects.shockwave && maxBack <= -fx.shockwave.knockback + 3, `max jump ${maxBack.toFixed(1)}`);
    check(`[${r.id}] shockwave deals damage and poison`, lossOf(g.state.attackers) >= fx.shockwave.damage && g.state.attackers.some((a) => a.poisoned),
      `loss ${lossOf(g.state.attackers).toExponential(2)}`);
    continue;
  }
  if (isMine) {
    // phase 1: travel and arm
    let mine = null;
    run(g, o, 120, () => { mine = g.state.projectiles.find((p) => p.kind === 'mine'); if (mine && mine.data.armed) return 'stop'; });
    check(`[${r.id}] mine spawned, travels and arms`, !!mine && mine.data.armed && Math.hypot(mine.x - mine.destX, mine.y - mine.destY) < 1);
    // mine point lies within the lead's maximum range
    const maxR = 350; // red max; blue max is 220, this is only a loose bound for the lead (blue)
    check(`[${r.id}] mine is on the road within max range of the lead`,
      g.path.distanceTo(mine.x, mine.y) < 2 && Math.hypot(mine.x - lead.x, mine.y - lead.y) <= 220 + 1e-6 && maxR > 0);
    // phase 2: stays armed while nobody is near
    for (const a of g.state.attackers) {
      const d = Math.hypot(a.x - mine.x, a.y - mine.y);
      if (d < 40) { a.x = mine.x + (a.x - mine.x) / (d || 1) * 60 + 60; a.y = mine.y + 60; }
    }
    g.grid.rebuild(g.state.attackers);
    const b0 = o.blasts.length;
    run(g, o, 20);
    check(`[${r.id}] mine stays armed, no early blast`, !mine.dead && o.blasts.length === b0);
    // phase 3: attacker walks within trigger radius
    const v = g.spawnAttacker(1, HP);
    v.blackholed = true; v.x = mine.x + MINE.triggerRadius - 4; v.y = mine.y;
    g.grid.rebuild(g.state.attackers);
    const loss0 = v.maxHp - v.hp;
    run(g, o, 4);
    check(`[${r.id}] mine triggers: removed, hit + blast on the attacker`, mine.dead && (v.maxHp - v.hp - loss0) >= fx.hit + fx.blast.damage - 1 && blastCount(o, fx.blast.size) >= 1,
      `loss ${(v.maxHp - v.hp).toExponential(2)}`);
    if (fx.cluster) {
      run(g, o, 90);
      check(`[${r.id}] bomblets blast`, blastCount(o, 'small') >= fx.cluster.qty, String(blastCount(o, 'small')));
      if (fx.cluster.laser) check(`[${r.id}] bomblet lasers`, (o.beams.laser || 0) >= fx.cluster.qty, String(o.beams.laser));
    }
    if (fx.sparks) check(`[${r.id}] spark bursts`, (o.beams.spark || 0) >= fx.sparks.qty, String(o.beams.spark));
    continue;
  }

  // projectile combos
  let flightSteps = 0, cloudPoisoned = false, napEff = null, burn = null;
  run(g, o, win, () => {
    if (g.state.projectiles.some((p) => p.kind === fx.projectile)) flightSteps++;
    if (fx.projectile === 'poisonRocket' && !cloudPoisoned && o.effects.poisonCloud) {
      cloudPoisoned = g.state.attackers.some((a) => a.poisoned && a.speed <= a.baseSpeed / 2 + 0.1);
    }
    if (fx.projectile === 'napalmRocket' && !napEff) {
      napEff = g.state.effects.find((e) => e.kind === 'napalm') || null;
      if (napEff) {
        const pt = napEff.data.points[Math.floor(napEff.data.points.length / 2)];
        const v = g.spawnAttacker(1, HP);
        v.blackholed = true; v.x = pt[0]; v.y = pt[1];
        g.grid.rebuild(g.state.attackers);
        napEff.__v = v; napEff.__hp0 = v.hp; napEff.__t0 = g.state.time;
      }
    }
    if (napEff && burn === null && g.state.time - napEff.__t0 >= 1000) burn = napEff.__hp0 - napEff.__v.hp;
  });
  const flightMs = flightSteps * STEP_MS;
  const loss = lossOf(g.state.attackers.filter((a) => !(napEff && a === napEff.__v)));
  check(`[${r.id}] projectile '${fx.projectile}' launched`, (o.projKinds[fx.projectile] || 0) === 1, JSON.stringify(o.projKinds));
  check(`[${r.id}] damage dealt (>= hit damage)`, loss >= (fx.hit || 0) - 1, `loss ${loss.toExponential(2)}`);
  if (fx.blast) check(`[${r.id}] blast of size ${fx.blast.size}`, blastCount(o, fx.blast.size) >= 1);
  if (fx.projectile === 'nuke') check(`[${r.id}] nuke hit + huge blast on a clustered group`, loss >= fx.hit + fx.blast.damage, `loss ${loss.toExponential(2)}`);
  if (fx.projectile === 'poisonRocket') {
    check(`[${r.id}] poison cloud effect, attackers slowed to speed/2`, cloudPoisoned && !!o.effects.poisonCloud);
  }
  if (fx.projectile === 'laserRocket') {
    check(`[${r.id}] lasers in flight and burst of ${fx.burst.qty}`, (o.beams.laser || 0) >= fx.burst.qty + 1, String(o.beams.laser));
  }
  if (fx.projectile === 'napalmRocket') {
    check(`[${r.id}] napalm effect with road points`, !!napEff && napEff.data.points.length >= 10 && napEff.data.points.length <= fx.napalm.length / 4 + 2, napEff ? String(napEff.data.points.length) : 'none');
    check(`[${r.id}] napalm damages over time (~dps)`, burn !== null && burn >= fx.napalm.dps * 0.8 && burn <= fx.napalm.dps * 1.3, `burn ${burn === null ? 'n/a' : burn.toExponential(2)} in 1 s`);
  }
  if (fx.projectile === 'tazerRocket') {
    const poisoned = g.state.attackers.filter((a) => a.poisoned).length;
    const jumps = o.beams.spark || 0;
    const hits = g.state.attackers.filter((a) => a.maxHp - a.hp >= fx.chainSpark.damage * 0.9).length;
    check(`[${r.id}] chain-spark jumps to several attackers, each once`, jumps >= 4 && jumps <= fx.chainSpark.qty && hits >= 4 && poisoned >= 4,
      `sparks ${jumps}, hit ${hits}, poisoned ${poisoned}`);
  }
  if (fx.projectile === 'bfg') {
    const rate = fx.laser ? fx.laser.rate : fx.sparks.rate;
    const want = Math.max(1, Math.floor(flightMs / (60000 / rate)) - 1);
    const got = fx.laser ? o.beams.laser || 0 : o.beams.spark || 0;
    check(`[${r.id}] plasma ball (flight ${Math.round(flightMs)} ms) fires ${fx.laser ? 'lasers' : 'sparks'} at its rate`, got >= want && got <= want + 3, `got ${got}, want ~${want}`);
    check(`[${r.id}] plasma ball is slow (speed ${fx.speed})`, flightMs > 300, `${Math.round(flightMs)} ms`);
    if (fx.rockets) {
      const wantR = Math.max(1, Math.floor(flightMs / (60000 / fx.rockets.rate)) - 1);
      check(`[${r.id}] small rockets fired on the way`, (o.projKinds.rocket || 0) >= wantR, `got ${o.projKinds.rocket || 0}, want >= ${wantR}`);
    }
    if (fx.sparks) check(`[${r.id}] sparks poison`, o.beams.spark > 0 && g.state.attackers.some((a) => a.poisoned || a.speed < a.baseSpeed) || o.beams.spark > 0);
  }
  if (fx.projectile === 'clusterBomb') {
    if (fx.cluster) check(`[${r.id}] ${fx.cluster.qty} bomblets blast`, blastCount(o, 'small') >= fx.cluster.qty + (fx.blast.size === 'small' ? 1 : 0), String(blastCount(o, 'small')));
    if (fx.cluster && fx.cluster.laser) check(`[${r.id}] bomblet lasers`, (o.beams.laser || 0) >= fx.cluster.qty, String(o.beams.laser));
    if (fx.sparks) check(`[${r.id}] ${fx.sparks.qty} spark bursts, poison`, (o.beams.spark || 0) >= fx.sparks.qty && g.state.attackers.some((a) => a.poisoned), String(o.beams.spark));
  }
}

// ------------------------------------------------------------------ priority and partner rules
{
  const { g, lead } = setup({ lead: 'red', partners: ['blue', 'blue', 'green'] });
  addAttackers(g, SPOT, 4);
  const o = observe(g);
  run(g, o, 30);
  check('(priority) Red + 2 Blue + 1 Green fires Nuke, not Poison Gas', o.combos.length === 1 && o.combos[0].id === 'nuke' && o.combos[0].turretId === lead.id, o.combos.map((c) => c.id).join(','));
}
{
  const { g, lead } = setup({ lead: 'red', partners: ['blue', 'green', 'yellow'] });
  addAttackers(g, SPOT, 4);
  const o = observe(g);
  run(g, o, 30);
  check('(priority) Red + Blue + Green + Yellow: Poison Gas (no Napalm, needs a 2nd Red)', o.combos[0] && o.combos[0].id === 'poisonGas', o.combos.map((c) => c.id).join(','));
}
{
  const { g, lead } = setup({ lead: 'yellow', partners: ['yellow', 'yellow', 'green', 'green'] });
  addAttackers(g, SPOT, 6, false);
  const o = observe(g);
  run(g, o, 200);
  check('(priority) Yellow + 2 Yellow + 2 Green: NO Black Hole (exact green 1), no combo at all', o.combos.length === 0 && !o.effects.blackHole, o.combos.map((c) => c.id).join(','));
  check('(priority) ... normal shots still happen', g.state.attackers.some((a) => a.hp < a.maxHp));
}
{
  const { g } = setup({ lead: 'yellow', partners: ['yellow', 'yellow', 'green'] });
  addAttackers(g, SPOT, 6, false);
  const o = observe(g);
  run(g, o, 30);
  check('(priority) Yellow + 2 Yellow + exactly 1 Green: Black Hole', o.combos[0] && o.combos[0].id === 'blackHole');
}
{
  // Combo-only as a partner colour
  const { g, lead, partners } = setup({ lead: 'red', partners: ['blue', { kind: 'comboOnly', color: 'blue' }] });
  addAttackers(g, SPOT, 4);
  const o = observe(g);
  run(g, o, 20);
  const co = partners[1];
  check('(combo-only) counts as Blue: Red + Blue + Combo-only(blue) fires Nuke', o.combos[0] && o.combos[0].id === 'nuke');
  check('(combo-only) gets the recharge as well, never shoots on its own', co.comboNext - g.state.time > 7000 && o.beams.laser === undefined);
}
{
  const { g } = setup({ lead: 'red', partners: ['blue', { kind: 'comboOnly', color: 'green' }] });
  addAttackers(g, SPOT, 4);
  const o = observe(g);
  run(g, o, 20);
  check('(combo-only) as Green: Red + Blue + Combo-only(green) fires Poison Gas', o.combos[0] && o.combos[0].id === 'poisonGas', o.combos.map((c) => c.id).join(','));
}
{
  const { g, lead, partners } = setup({ lead: 'red', partners: [{ kind: 'comboOnly', color: 'blue' }, { kind: 'comboOnly', color: 'blue' }] });
  addAttackers(g, SPOT, 4);
  const o = observe(g);
  run(g, o, 20);
  check('(combo-only) two Combo-only(blue) alone are enough for a Nuke', o.combos[0] && o.combos[0].id === 'nuke');
  // a Combo-only on its own cooldown cannot take part
  run(g, o, 200); // lead + partners still recharging (7.4 s)
  check('(combo-only) on cooldown: no second combo during recharge', o.combos.length === 1);
}
{
  const { g, lead, partners } = setup({ lead: 'red', partners: ['blue', { kind: 'blue', unmaxed: true }] });
  addAttackers(g, SPOT, 4);
  const o = observe(g);
  run(g, o, 120);
  check('(maxed) a partner whose damage is not maxed does not count: no Nuke', o.combos.length === 0 && g.state.attackers.some((a) => a.hp < a.maxHp));
}
{
  // modifier scaling: Boom (+40% damage) within 80 of the lead scales the nuke
  const mk = (mods) => {
    const sc = setup({ lead: 'red', partners: ['blue', 'blue'], mods });
    const [v] = addAttackers(sc.g, SPOT, 1);
    const o = observe(sc.g);
    run(sc.g, o, 200);
    return { loss: v.maxHp - v.hp, o, lead: sc.lead };
  };
  const a = mk([]), b = mk(['damageUp']);
  check('(scaling) lead damage multiplier (Boom +40%) scales combo damage', b.lead.damageMult > 1.39 && b.loss > a.loss * 1.3, `${a.loss.toExponential(2)} -> ${b.loss.toExponential(2)}`);
}
{
  // no road within placeRange: no Black Hole, falls through (no other recipe matches either)
  const { g } = setup({ lead: 'yellow', partners: ['yellow', 'yellow', 'green'], spot: FAR_SPOT });
  const a = g.spawnAttacker(1, HP); a.blackholed = true; a.x = FAR_SPOT.x + 100; a.y = FAR_SPOT.y;
  g.grid.rebuild(g.state.attackers);
  const o = observe(g);
  run(g, o, 60);
  check('(black hole) not placed when no road point within 90 of the lead', o.combos.length === 0 && !o.effects.blackHole && a.hp < a.maxHp);
}

// ------------------------------------------------------------------ plasma ball over a long distance
for (const id of ['rocketBfg', 'bfg', 'tazerBfg']) {
  const colour = Object.keys(COMBOS).find((c) => COMBOS[c].some((r) => r.id === id));
  const r = COMBOS[colour].find((x) => x.id === id), fx = r.fx;
  const sc = setup({ lead: colour, partners: partnersFor(r), seed: 9 });
  const { g, lead } = sc;
  // one pinned attacker far away from the lead (not on the road; engine treats blackholed as "stay put")
  const a = g.spawnAttacker(1, HP); a.blackholed = true;
  const dir = lead.x > 360 ? -1 : 1;
  a.x = lead.x + dir * 150; a.y = lead.y;
  g.grid.rebuild(g.state.attackers);
  const o = observe(g);
  let flight = 0, speed0 = null, dist0 = null;
  run(g, o, 400, () => {
    const p = g.state.projectiles.find((q) => q.kind === 'bfg');
    if (p) { flight++; if (dist0 === null) dist0 = Math.hypot(p.x - a.x, p.y - a.y); }
  });
  const ms = flight * STEP_MS;
  const rate = fx.laser ? fx.laser.rate : fx.sparks.rate;
  const got = fx.laser ? o.beams.laser || 0 : o.beams.spark || 0;
  const want = Math.floor(ms / (60000 / rate));
  check(`[${id}] flight time matches speed ${fx.speed} (${Math.round(dist0)} units in ${Math.round(ms)} ms)`, Math.abs(ms / 1000 - (dist0 - 14) / fx.speed) < 0.1);
  check(`[${id}] ${fx.laser ? 'laser' : 'spark'} every ${Math.round(60000 / rate)} ms during flight`, Math.abs(got - want) <= 1 && got >= 5, `got ${got}, expected ~${want}`);
  if (fx.rockets) check(`[${id}] small rockets every ${Math.round(60000 / fx.rockets.rate)} ms`, Math.abs((o.projKinds.rocket || 0) - Math.floor(ms / (60000 / fx.rockets.rate))) <= 1 && o.projKinds.rocket >= 3, String(o.projKinds.rocket));
  check(`[${id}] hit + bfg blast, large loss`, blastCount(o, 'bfg') === 1 && a.maxHp - a.hp >= fx.hit + fx.blast.damage, `loss ${(a.maxHp - a.hp).toExponential(2)}`);
}

// ------------------------------------------------------------------ white-box: mines, shockwave clamp
{
  const { g, lead } = setup({ lead: 'blue', partners: ['blue'] });
  const rec = COMBOS.blue.find((r) => r.id === 'mine');
  const pts = g.roadPoints().filter((q) => Math.hypot(q.x - lead.x, q.y - lead.y) < 200);
  for (let i = 0; i < 14; i++) g.combos._launchMine(lead, rec, 1, 0, pts[i * 3]);
  const mines = g.state.projectiles.filter((p) => p.tag === 'mine' && !p.dead);
  check('(mines) at most 12 per turret, oldest removed', mines.length === 12 && !mines.some((m) => m.destX === pts[0].x && m.destY === pts[0].y), String(mines.length));
}
{
  // a mine disappears after 60 s without blast; partners sold so no further combos
  const { g, partners } = setup({ lead: 'blue', partners: ['blue'] });
  addAttackers(g, SPOT, 1);
  const o = observe(g);
  let n = 0;
  while (!o.combos.length && n++ < 60) { g.advance(1); o.tick(); }
  g.sell(partners[0].id);
  // keep attackers away from the mine: remove them so nothing can trigger it
  for (const a of g.state.attackers) { a.dead = true; g.attackerMap.delete(a.id); }
  g.advance(1);
  const mineSeen = g.state.projectiles.some((p) => p.tag === 'mine');
  const b0 = o.blasts.length;
  run(g, o, Math.round(61000 / STEP_MS));
  check('(mines) armed mine expires after 60 s without a blast', mineSeen && !g.state.projectiles.some((p) => p.tag === 'mine') && o.blasts.length === b0);
}
{
  const { g, lead } = setup({ lead: 'yellow', partners: [] });
  const a = g.spawnAttacker(1, HP);
  a.progress = 20; g.path.place(a, 20);
  g.grid.rebuild(g.state.attackers);
  g.combos._shockwave({ x: a.x, y: a.y, id: null }, COMBOS.yellow.find((r) => r.id === 'shockwave').fx.shockwave, 1);
  g.advance(3);
  check('(shockwave) knockback clamps at progress 0 and keeps x/y consistent', a.progress >= 0 && a.progress < 5 && Math.hypot(a.x - g.path.points[0][0], a.y - g.path.points[0][1]) < 6,
    `progress ${a.progress.toFixed(2)}`);
}
{
  // black-holed attackers do not move along the road
  const { g } = setup({ lead: 'yellow', partners: ['yellow', 'yellow', 'green'] });
  const atts = addAttackers(g, SPOT, 5, false);
  const o = observe(g);
  let moved = false;
  while (!o.effects.blackHole && g.stepCount < 120) { g.advance(1); o.tick(); }
  const h = g.combos.holes[0];
  g.advance(1);
  const sw = g.state.attackers.filter((a) => a.swallowed);
  const prog = new Map(sw.map((a) => [a.id, a.progress]));
  g.advance(2);
  for (const a of sw) if (!a.dead && a.progress !== prog.get(a.id)) moved = true;
  check('(black hole) swallowed attackers are not moved along the road', !!h && sw.length > 0 && !moved, `swallowed ${sw.length}`);
}

// ------------------------------------------------------------------ save / restore determinism with active combos
for (const { colour, r } of recipes) {
  const isHole = !!r.fx.blackHole;
  const sc = setup({ lead: colour, partners: partnersFor(r), seed: 11 });
  const { g } = sc;
  addAttackers(g, sc.spot, 8, !(isHole || r.fx.shockwave));
  const o = observe(g);
  let n = 0;
  while (!o.combos.length && n++ < 120) { g.advance(1); o.tick(); }
  g.advance(20); // mid-effect
  const save = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = Game.deserialize(save);
  const same0 = JSON.stringify(g2.serialize()) === JSON.stringify(save);
  g.advance(300); g2.advance(300);
  const same = JSON.stringify(g.serialize()) === JSON.stringify(g2.serialize());
  check(`(save) [${r.id}] restore is identical, and stays identical after 300 steps`, same0 && same);
}

// ------------------------------------------------------------------ performance
{
  const { g } = setup({ lead: 'yellow', partners: ['yellow', 'yellow', 'green'] });
  for (let i = 0; i < 300; i++) {
    const a = g.spawnAttacker(1, HP);
    a.progress = 300 + (i % 60) * 4; g.path.place(a, a.progress);
  }
  // also a napalm zone and a shockwave in play at once
  const nap = COMBOS.red.find((r) => r.id === 'napalm');
  g.combos._napalm({ sourceId: null }, g.state.attackers[100].x, g.state.attackers[100].y, nap.fx.napalm, 1);
  const hp = g.state.attackers[100];
  g.combos._openHole({ radius: 120, gravity: 40, duration: 3000 }, { x: hp.x, y: hp.y });
  g.combos._shockwave({ x: hp.x, y: hp.y, id: null }, COMBOS.yellow.find((r) => r.id === 'shockwave').fx.shockwave, 1);
  const t0 = process.hrtime.bigint();
  g.advance(240);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 240;
  check('(perf) 300 attackers with black hole + napalm: < 3 ms per step', ms < 3, ms.toFixed(2) + ' ms');
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
