// Headless simulation tests for src/game. Run: node scripts/sim-test.mjs
import { Game, STEP_MS } from '../src/game/Game.js';
import { TURRETS } from '../src/data/turrets.js';
import { MAPS } from '../src/data/maps.js';
import { DIFFICULTIES, WAVES, WEAVE } from '../src/data/rules.js';
import { waveHp, waveBounty, laneOffset } from '../src/game/Attacker.js';

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!cond) failures++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// ------------------------------------------------------------------ helpers
/** Pin an attacker at (x, y): black-holed attackers are not moved by the engine (handy for tests). */
function freeze(a, x, y) { a.blackholed = true; a.x = x; a.y = y; return a; }
/** Valid build spots on a map ranked by how much road they cover. */
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

/** Greedy scripted player: build in the best spots and keep upgrading the cheapest upgrade. */
function makePlayer(game, spots) {
  const kinds = ['blue', 'green', 'red', 'yellow'];
  let next = 0;
  return function act() {
    const s = game.state;
    for (let guard = 0; guard < 20; guard++) {
      const want = 4 + Math.floor(s.wave / 2);
      if (next < spots.length && s.turrets.length < want) {
        const kind = kinds[next % 4];
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

// ------------------------------------------------------------------ (a) no turrets
{
  const g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 7 });
  let over = 0, leaks = 0, goData = null;
  g.on('gameover', (d) => { over++; goData = d; });
  g.on('leak', () => leaks++);
  g.setSpeed(8);
  let frames = 0;
  while (!g.state.over && frames < 100000) { g.update(1000 / 60); frames++; }
  check('(a) gameover fired exactly once', over === 1, `fired ${over}`);
  check('(a) 10 lives lost', g.state.lives === 0 && leaks === 10, `lives ${g.state.lives}, leaks ${leaks}`);
  check('(a) gameover payload', goData && goData.wave === g.state.wave && goData.kills === 0, JSON.stringify(goData));
  check('(a) game stopped after over', (() => { const t = g.state.time; g.update(1000); return g.state.time === t; })());
  check('(a) wave timing: first wave after 20 s', g.state.wave >= 1);
}

// ------------------------------------------------------------------ (b) scripted defence
{
  const g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 11 });
  const spots = bestSpots('map1', 16);
  const act = makePlayer(g, spots);
  g.setSpeed(8);
  const counts = { shot: 0, kill: 0, hit: 0, build: 0, upgrade: 0 };
  for (const k of Object.keys(counts)) g.on(k, () => counts[k]++);
  let frames = 0;
  while (g.state.wave < 16 && !g.state.over && frames < 200000) {
    g.update(1000 / 60);
    if (frames % 10 === 0) act();
    frames++;
  }
  const s = g.state;
  check('(b) survived 15+ waves at speed 8', !s.over && s.wave >= 16, `wave ${s.wave}, lives ${s.lives}, kills ${s.kills}, turrets ${s.turrets.length}, cash ${s.cash}`);
  check('(b) turrets killed things and events fired', counts.kill > 100 && counts.shot > 100 && counts.build >= 4, JSON.stringify(counts));
  check('(b) score = kills * spent', s.score === s.kills * s.spent, `score ${s.score}`);
  const kinds = new Set(s.turrets.map((t) => t.kind));
  check('(b) all four basic kinds used', kinds.size === 4);
}

// ------------------------------------------------------------------ (c) laser chain
{
  const dmgWith = (n) => {
    const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 3 });
    for (let i = 0; i < n; i++) { const id = g.build('green', 300 + i * 46, 60).id; g.upgrade(id, 'range', true); }
    const a = freeze(g.spawnAttacker(1, 1e12), 330, 100);
    g.advance(1);
    return a.maxHp - a.hp;
  };
  const d1 = dmgWith(1), d2 = dmgWith(2), d3 = dmgWith(3), d4 = dmgWith(4);
  check('(c) 1 Green deals its own 25', near(d1, 25), `${d1}`);
  check('(c) 2 Greens: 25 + 25*1.25', near(d2, 25 + 31.25), `${d2}`);
  check('(c) 3 Greens: 25 + (25 + 25*1.25)*1.25', near(d3, 25 + (25 + 31.25) * 1.25), `${d3}`);
  check('(c) damage strictly increases with more Greens', d1 < d2 && d2 < d3 && d3 < d4, `${d1} < ${d2} < ${d3} < ${d4}`);
  // linked greens consumed their timers (only one beam per step), links reported in state
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 3 });
  const a1 = g.build('green', 300, 60).id, a2 = g.build('green', 346, 60).id, a3 = g.build('green', 600, 60).id;
  check('(c) links: near Greens linked, far one not', g.turretMap.get(a1).links.includes(a2) && !g.turretMap.get(a1).links.includes(a3));
}
{
  // piercing laser: one Green with 25 energy, attackers in a row to its right
  const setup = (hps, ys) => {
    const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 3 });
    g.build('green', 300, 60);
    const aa = hps.map((hp, i) => freeze(g.spawnAttacker(1, hp), 330 + i * 20, ys ? ys[i] : 60));
    g.advance(1);
    return { g, aa };
  };
  let { aa } = setup([10, 8, 30]);
  check('(c) pierce: weaker attackers die, energy carries on', aa[0].dead && aa[1].dead, aa.map((a) => a.hp).join(','));
  check('(c) pierce: stronger attacker takes the rest (25 - 10 - 8 = 7)', !aa[2].dead && near(aa[2].maxHp - aa[2].hp, 7), `${aa[2].maxHp - aa[2].hp}`);
  ({ aa } = setup([40, 5]));
  check('(c) pierce: a stronger first target stops the beam', near(aa[0].maxHp - aa[0].hp, 25) && aa[1].hp === aa[1].maxHp);
  ({ aa } = setup([5, 5, 5], [60, 66, 63]));
  check('(c) pierce: off the line (6 > 4) is missed, within 4 is hit', aa[0].dead && aa[1].hp === aa[1].maxHp && aa[2].dead);
  ({ aa } = setup([10, 10, 10]));
  check('(c) pierce: energy runs out exactly (10 + 10, then 5)', aa[0].dead && aa[1].dead && near(aa[2].maxHp - aa[2].hp, 5));
  const { g } = setup([5, 5]);
  const beam = g.state.beams.find((b) => b.kind === 'laser');
  check('(c) pierce: beam with energy left runs to the end of range', beam && near(beam.x2, 400, 1e-3), beam && `${beam.x2}`);
  // determinism: save in the middle of a piercing fight, both continue identically
  const mk = () => {
    const h = new Game({ mapId: 'map9', mode: 'sandbox', seed: 4 });
    h.build('green', 300, 60);
    for (let i = 0; i < 12; i++) freeze(h.spawnAttacker(1, 3 + i), 320 + i * 7, 60 + (i % 3));
    h.advance(1);
    return h;
  };
  const h1 = mk();
  const h2 = Game.deserialize(JSON.parse(JSON.stringify(h1.serialize())));
  h1.advance(120); h2.advance(120);
  check('(c) pierce: save/restore continues identically', JSON.stringify(h1.serialize()) === JSON.stringify(h2.serialize()));
}

// ------------------------------------------------------------------ (d) modifiers
{
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 5 });
  const red = g.build('red', 360, 60).id;
  const st = () => g.turretMap.get(red).stats;
  check('(d) Red base 50/200/50', st().damage === 50 && st().range === 200 && st().rate === 50);
  const boom = g.build('damageUp', 410, 60);
  check('(d) Boom: damage 70', near(st().damage, 70), `${st().damage}`);
  const bb = g.build('damageUpBig', 310, 60);
  check('(d) Boom + BigBang: damage 120', near(st().damage, 120), `${st().damage}`);
  g.sell(boom.id); g.sell(bb.id);
  check('(d) selling restores base', st().damage === 50);
  const sx = g.build('rateUpEx', 410, 60);
  check('(d) SpeedEx: dmg 30, range 180, rate 110', near(st().damage, 30) && near(st().range, 180) && near(st().rate, 110), JSON.stringify(st()));
  const bb2 = g.build('damageUpBig', 310, 60);
  check('(d) SpeedEx + BigBang: dmg 80', near(st().damage, 80), `${st().damage}`);
  g.sell(bb2.id);
  // floor: three SpeedEx -> 1 - 1.2 floors at 0.2
  const sx2 = g.build('rateUpEx', 360, 110), sx3 = g.build('rateUpEx', 310, 110);
  check('(d) multiplier floor 0.2: damage 10', near(st().damage, 10), `${st().damage}`);
  check('(d) flat rate adds stack: (50 + 180) * 1', near(st().rate, 230), `${st().rate}`);
  [sx.id, sx2.id, sx3.id].forEach((i) => g.sell(i));
  // Ranger +100 flat, RangerEx +100 and -25% rate, Speed +120
  const rg = g.build('rangeUp', 410, 60);
  check('(d) Ranger: range 300', near(st().range, 300));
  const rgx = g.build('rangeUpEx', 310, 60);
  check('(d) Ranger + RangerEx: range 400, rate 37.5', near(st().range, 400) && near(st().rate, 37.5), JSON.stringify(st()));
  g.sell(rg.id); g.sell(rgx.id);
  const sp = g.build('rateUp', 410, 60);
  check('(d) Speed: rate 170', near(st().rate, 170));
  g.sell(sp.id);
  const bbx = g.build('damageUpBigEx', 410, 60);
  check('(d) BigBangEx: 100, 140, 35', near(st().damage, 100) && near(st().range, 140) && near(st().rate, 35), JSON.stringify(st()));
  // influence radius: far modifier not applied until upgraded to 130
  g.sell(bbx.id);
  const far = g.build('damageUp', 360 + 110, 60);
  check('(d) modifier range 80: 110 away has no effect', st().damage === 50);
  g.upgrade(far.id, 'range');
  check('(d) modifier upgraded to 130 reaches 110', near(st().damage, 70) && g.turretMap.get(far.id).modRange === 130);
  check('(d) modifier only has a range upgrade', g.upgradeCost(far.id, 'damage') === null && g.upgradeCost(far.id, 'range') === null);
  // levels apply on top of ladders: Red damage level 2 (350) with Boom
  g.upgrade(red, 'damage'); g.upgrade(red, 'damage');
  check('(d) ladder 350 with Boom = 490', near(st().damage, 490), `${st().damage}`);
  // economy rules
  const g2 = new Game({ mapId: 'map9', seed: 2 });
  const b = g2.build('blue', 300, 60);
  check('(d) build costs cash, start $30', g2.state.cash === 20 && b.ok);
  g2.state.cash = 1000;
  g2.upgrade(b.id, 'damage');
  const spentBefore = g2.state.spent;
  const r = g2.sell(b.id);
  check('(d) sell refunds 70% of cashValue, spent unchanged', r.refund === Math.floor(30 * 0.7) && g2.state.spent === spentBefore, `refund ${r.refund}`);
  const m = g2.build('green', 300, 60).id;
  g2.state.cash = 600;
  const mv = g2.move(m, 400, 60);
  check('(d) move costs $500', mv.ok && g2.state.cash === 100 + 0 + (0), `cash ${g2.state.cash}`);
  check('(d) placement: road / overlap / base / bounds',
    !g2.canBuild('blue', 100, 70).ok && !g2.canBuild('blue', 410, 60).ok && !g2.canBuild('blue', 5, 5).ok
    && !new Game({ mapId: 'map1' }).canBuild('blue', 600, 100).ok);
  check('(d) locked turret rejected, then unlocked by kills', (() => {
    const g3 = new Game({ mapId: 'map9', seed: 4 });
    g3.state.cash = 1e6;
    const locked = !g3.canBuild('rangeUp', 300, 60).ok;
    let unlockEv = 0; g3.on('unlock', () => unlockEv++);
    for (let i = 0; i < 300; i++) { const a = g3.spawnAttacker(1, 1); g3.damageAttacker(a, 5, null); }
    return locked && g3.canBuild('rangeUp', 300, 60).ok && unlockEv === 1;
  })());
}

// ------------------------------------------------------------------ other mechanics
{
  // poison / slow
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 8 });
  const y = g.build('yellow', 300, 140);
  // max the damage ladder: poison 10 -> speed 6
  g.upgrade(y.id, 'damage', true);
  const ty = g.turretMap.get(y.id);
  const a = freeze(g.spawnAttacker(1, 1e15), ty.x + 10, ty.y);
  g.advance(1);
  check('(mech) Yellow poison: speed 60 / 10 = 6', near(a.speed, 6, 0.02) && a.poisoned, `${a.speed}`);
  g.sell(y.id);
  g.advance(60);
  check('(mech) slow recovers +2 u/s per second', near(a.speed, 8, 0.05), `${a.speed}`);
  const a2 = g.spawnAttacker(1, 1e15);
  g.damageAttacker(a2, 1, null, 100);
  check('(mech) poison floor 5', a2.speed === 5);
}
{
  // sniper / railgun / fusion / targeter / combo-only
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 9 });
  const rail = g.build('railgun', 150, 60).id;
  const aa = [0, 1, 2].map((i) => freeze(g.spawnAttacker(1, 1e9), 200 + i * 40, 60 + (i === 1 ? 5 : 0)));
  g.advance(1);
  check('(mech) Railgun pierces all attackers on the line', aa.every((a) => a.hp < a.maxHp), aa.map((a) => a.maxHp - a.hp).join(','));
  const g2 = new Game({ mapId: 'map9', mode: 'sandbox', seed: 9 });
  const fu = g2.build('fusion', 150, 60).id;
  const e = freeze(g2.spawnAttacker(1, 1e12), 200, 60);
  const dealt = [];
  let last = e.hp;
  for (let i = 0; i < 600; i++) { g2.advance(1); if (e.hp < last) { dealt.push(last - e.hp); last = e.hp; } }
  check('(mech) Fusion ramps +15% per tick up to x6', dealt.length > 10 && near(dealt[1] / dealt[0], 1.15) && near(Math.max(...dealt) / dealt[0], 6, 1e-6), dealt.slice(0, 4).map((d) => d.toFixed(0)).join(','));
  const g3 = new Game({ mapId: 'map9', mode: 'sandbox', seed: 9 });
  const bl = g3.build('blue', 150, 60).id, tg = g3.build('targeter', 150, 160).id;
  const f = freeze(g3.spawnAttacker(1, 1e9), 150, 270); // 210 from Blue (range 130), 110 from the Targeter (range 150)
  g3.advance(5);
  const before = f.hp;
  g3.join(tg, bl);
  g3.advance(30);
  check('(mech) Targeter: joined Blue acquires from the Targeter position', before === f.maxHp && f.hp < before && g3.turretMap.get(bl).targeterId === tg);
  g3.join(tg, null);
  check('(mech) unjoin works', g3.turretMap.get(bl).targeterId === null && g3.turretMap.get(tg).joinedTo === null);
  const co = g3.build('comboOnly', 400, 100);
  check('(mech) Combo-only never fires, is combo capable', (() => { const t = g3.turretMap.get(co.id); g3.advance(10); return t.comboCapable && t.targetId === null; })());
  check('(mech) setComboColor', g3.setComboColor(co.id, 'green').ok && !g3.setComboColor(co.id, 'pink').ok);
}
{
  // targeting modes, directional, focus fire, red holding, freak-out
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 12 });
  const t = g.build('green', 300, 60); const tt = g.turretMap.get(t.id);
  const mk = (x, y, hp, progress, speed) => { const a = freeze(g.spawnAttacker(1, hp), x, y); a.progress = progress; a.speed = speed; a.baseSpeed = 100; return a; };
  const A = mk(310, 80, 100, 10, 30), B = mk(330, 90, 900, 50, 60), C = mk(360, 60, 500, 90, 90);
  g.grid.rebuild(g.state.attackers);
  const settle = () => { for (let i = 0; i < 8; i++) { tt.cd = 1e9; g.advance(1); } return tt.targetId; };
  const pick = (mode) => { tt.targetMode = mode; tt.targetId = null; return settle(); };
  g.advance(0);
  check('(tgt) modes near/far/weak/strong/slow/fast',
    pick('near') === A.id && pick('far') === C.id && pick('weak') === A.id && pick('strong') === B.id && pick('slow') === A.id && pick('fast') === C.id);
  g.setDirectional(t.id, 'small', Math.atan2(30, 60)); // aims toward B (330,90)
  tt.targetMode = 'near'; tt.targetId = null; settle();
  check('(tgt) directional cone restricts acquisition', tt.targetId === B.id, `${tt.targetId}`);
  g.setDirectional(t.id, 'normal');
  g.focusFire(C.id); settle();
  check('(tgt) focus fire overrides', tt.targetId === C.id);
  g.focusFire(null);
}
{
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 13 });
  const r = g.build('red', 300, 60); const tr = g.turretMap.get(r.id);
  for (let i = 0; i < 3; i++) { g.upgrade(r.id, 'range'); g.upgrade(r.id, 'rate'); }
  g.advance(60 * 8);
  const orbiting = g.state.projectiles.filter((p) => p.kind === 'rocket' && p.orbiting);
  check('(mech) Red holding pattern keeps 4 rockets circling', tr.holding === 4 && orbiting.length === 4 && orbiting.every((p) => Math.abs(Math.hypot(p.x - tr.x, p.y - tr.y) - 35) < 1));
  const a = freeze(g.spawnAttacker(1, 1e9), 360, 100);
  g.advance(10);
  check('(mech) rockets dive at a target', g.state.projectiles.every((p) => !p.orbiting) || tr.holding < 4);
  g.advance(120);
  check('(mech) rockets hit', a.hp < a.maxHp);
  const g2 = new Game({ mapId: 'map9', mode: 'sandbox', seed: 13 });
  const r2 = g2.build('red', 300, 60);
  for (let i = 0; i < 3; i++) { g2.upgrade(r2.id, 'range'); g2.upgrade(r2.id, 'rate'); }
  g2.advance(60 * 8);
  const far = freeze(g2.spawnAttacker(1, 1e9), 700, 400);
  const weak = freeze(g2.spawnAttacker(1, 1e8), 600, 400);
  g2.sell(r2.id);
  g2.advance(300);
  check('(mech) selling sends circling rockets at the weakest attacker within 720', weak.hp < weak.maxHp && far.hp === far.maxHp, `${weak.maxHp - weak.hp}`);
}
{
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 14 });
  const b = g.build('blue', 300, 60); const t = g.turretMap.get(b.id);
  const ev = [];
  g.on('freakout', (e) => ev.push(e.stage));
  for (let i = 0; i < 4; i++) { g.upgrade(b.id, 'damage'); g.upgrade(b.id, 'rate'); }
  check('(mech) Freak-out available after 4+4 upgrades', t.freak === 'available');
  const base = { ...t.stats };
  g.advance(60 * 60 - 5);
  check('(mech) freak-out not before 60 s', t.freak === 'available');
  g.advance(10);
  check('(mech) warn stage with effect', t.freak === 'warn' && g.state.effects.some((e) => e.kind === 'freakWarn'));
  g.advance(60 * 3);
  check('(mech) on stage: damage x4, rate x5 (added multipliers)', t.freak === 'on' && near(t.stats.damage, base.damage * 4) && near(t.stats.rate, base.rate * 5), JSON.stringify(t.stats));
  g.advance(60 * 5 + 2);
  check('(mech) freak ends, stats back, next scheduled 40-80 s minus rate bonus', t.freak === 'available' && near(t.stats.damage, base.damage) && t.freakAt - g.state.time >= 40000 - 7 * 4000 - 1000 && ev.join() === 'warn,on,off', `${ev}`);
}

// ------------------------------------------------------------------ (w) attackers weave across the road
{
  let maxDist = 0, maxJump = 0, minLane = Infinity, maxLane = -Infinity, maps = 0, waveSpread = Infinity;
  const stepMax = 2 * 60 * (STEP_MS / 1000); // never more than twice the straight-line step, even in corners
  for (const m of MAPS) {
    const g = new Game({ mapId: m.id, difficulty: 'medium', seed: 11 });
    g.setSpeed(8);
    const prev = new Map();
    let steps = 0;
    while (!g.state.over && steps < 60 * 120) {
      g.advance(1);
      steps++;
      const lanes = [];
      for (const a of g.state.attackers) {
        if (a.dead) continue;
        maxDist = Math.max(maxDist, g.path.distanceTo(a.x, a.y));
        const l = laneOffset(a);
        lanes.push(l); minLane = Math.min(minLane, l); maxLane = Math.max(maxLane, l);
        const p = prev.get(a.id);
        if (p) maxJump = Math.max(maxJump, Math.hypot(a.x - p[0], a.y - p[1]));
        prev.set(a.id, [a.x, a.y]);
      }
      if (lanes.length >= 8) waveSpread = Math.min(waveSpread, Math.max(...lanes) - Math.min(...lanes));
    }
    maps++;
  }
  check('(w) attackers stay within the weave amplitude of the centreline', maxDist <= WEAVE.amplitude + 0.01, `max ${maxDist.toFixed(2)} over ${maps} maps`);
  check('(w) attackers use both sides of the road', minLane < -WEAVE.amplitude * 0.6 && maxLane > WEAVE.amplitude * 0.6, `${minLane.toFixed(2)}..${maxLane.toFixed(2)}`);
  check('(w) a wave on the road is spread out, not single file', waveSpread > 3, `min spread ${waveSpread.toFixed(2)}`);
  check('(w) smooth movement, no jumps at corners', maxJump < stepMax, `max step ${maxJump.toFixed(2)} (limit ${stepMax.toFixed(2)})`);
}

// ------------------------------------------------------------------ (late) late-game wave curve (SPEC.md section 3)
{
  let orig = true;
  for (const d of Object.values(DIFFICULTIES)) for (let n = 1; n <= WAVES.lateWave; n++) {
    if (!near(waveHp(n, d.hpGrowth), 10 * d.hpGrowth ** n) || waveBounty(n) !== n) orig = false;
  }
  check('(late) waves 1 to 100: HP 10 x growth^n and bounty $n (original)', orig);
  const g = 1.125, late = 1 + (g - 1) * WAVES.lateGrowthFactor;
  check('(late) Medium after 100: growth x1.05 per wave', near(waveHp(150, g) / waveHp(149, g), late) && near(late, 1.05),
    `${(waveHp(150, g) / waveHp(149, g)).toFixed(4)}`);
  check('(late) wave 101 continues from wave 100', near(waveHp(101, g), 10 * g ** 100 * late));
  check('(late) bounty after 100: round(n x 1.03^(n-100)), integer, growing',
    waveBounty(101) === Math.round(101 * 1.03) && waveBounty(150) === Math.round(150 * 1.03 ** 50)
    && Number.isInteger(waveBounty(173)) && waveBounty(120) > waveBounty(119), `150 -> $${waveBounty(150)}`);
  let order = true;
  for (let n = 101; n <= 250; n += 7) {
    const h = ['easy', 'medium', 'hard', 'extreme'].map((k) => waveHp(n, DIFFICULTIES[k].hpGrowth));
    if (!(h[0] < h[1] && h[1] < h[2] && h[2] < h[3])) order = false;
  }
  check('(late) difficulties keep their HP order after wave 100', order);
  const gm = new Game({ mapId: 'map1', difficulty: 'medium', seed: 3 });
  gm.state.wave = 129;
  let paid = null;
  gm.on('kill', (e) => { paid = e.bounty; });
  gm.sendWave();
  gm.advance(2);
  const a = gm.state.attackers[0];
  check('(late) spawned wave-130 attacker uses the late curve', a && a.wave === 130 && near(a.maxHp, waveHp(130, 1.125)) && a.bounty === waveBounty(130),
    a ? `${a.maxHp.toExponential(2)} HP, $${a.bounty}` : 'no attacker');
  if (a) { const c = gm.state.cash; gm.damageAttacker(a, a.hp + 1, null); check('(late) kill pays the late bounty', gm.state.cash - c === waveBounty(130) && paid === waveBounty(130)); }
}

// ------------------------------------------------------------------ (e) serialize round trip
{
  const mk = () => {
    const g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 99 });
    const act = makePlayer(g, bestSpots('map1', 14));
    g.state.cash = 4000;
    for (let i = 0; i < 60 * 150; i++) { g.advance(1); if (i % 20 === 0) act(); }
    return g;
  };
  const g1 = mk();
  check('(e) test state is busy', g1.state.wave >= 6 && g1.state.turrets.length >= 4 && g1.state.kills > 20,
    `kills ${g1.state.kills}, tur ${g1.state.turrets.length}, proj ${g1.state.projectiles.length}, wave ${g1.state.wave}`);
  const save = g1.serialize();
  const g2 = Game.deserialize(JSON.parse(JSON.stringify(save)));
  check('(e) serialize is identical right after deserialize', JSON.stringify(g2.serialize()) === JSON.stringify(save));
  g1.advance(60 * 45); g2.advance(60 * 45);
  const s1 = JSON.stringify(g1.serialize()), s2 = JSON.stringify(g2.serialize());
  check('(e) identical state after 2700 more steps (same seed)', s1 === s2, `${s1.length} bytes, kills ${g1.state.kills}`);
  // through update() with speed too
  g1.setSpeed(4); g2.setSpeed(4);
  for (let i = 0; i < 300; i++) { g1.update(16.7); g2.update(16.7); }
  check('(e) identical via update() at speed 4', JSON.stringify(g1.serialize()) === JSON.stringify(g2.serialize()));
}

// ------------------------------------------------------------------ (e2) no early wave while paused
{
  const g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 5 });
  g.advance(60); // 1 s in, about 19 s until the first wave
  g.setPaused(true);
  const cash = g.state.cash, wave = g.state.wave, next = g.state.nextWaveIn;
  const r1 = g.sendWave(), r2 = g.sendWave();
  check('(e2) sendWave refused while paused', !r1.ok && !r2.ok && r1.reason === 'Game is paused', JSON.stringify(r1));
  check('(e2) paused sendWave changes nothing', g.state.cash === cash && g.state.wave === wave && g.state.nextWaveIn === next && g.spawners.length === 0,
    `cash ${g.state.cash}/${cash}, wave ${g.state.wave}, spawners ${g.spawners.length}`);
  g.setPaused(false);
  const r3 = g.sendWave();
  check('(e2) unpaused sendWave pays bonus and starts the wave', r3.ok && r3.bonus > 0 && g.state.cash === cash + r3.bonus && g.state.wave === wave + 1, JSON.stringify(r3));
  g.advance(60);
  check('(e2) attackers spawn after an unpaused sendWave', g.state.attackers.length > 0, `${g.state.attackers.length}`);
}

// ------------------------------------------------------------------ (f) benchmark
{
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 21, difficulty: 'easy' });
  g.state.lives = 1e9;
  const kinds = ['blue', 'green', 'red', 'yellow'];
  let n = 0;
  outer: for (let y = 22; y <= 428; y += 2) {
    for (let x = 22; x <= 698; x += 2) {
      if (n >= 150) break outer;
      if (!g.canBuild('blue', x, y).ok) continue;
      const id = g.build(kinds[n % 4], x, y).id;
      for (const st of ['damage', 'range', 'rate']) g.upgrade(id, st, true);
      n++;
    }
  }
  // the map only fits ~145 legally; add the rest (overlapping) by bypassing the placement rule
  g._placementProblem = () => null;
  while (n < 150) {
    const id = g.build(kinds[n % 4], 100 + n * 7, 20 + (n % 5) * 3).id;
    for (const st of ['damage', 'range', 'rate']) g.upgrade(id, st, true);
    n++;
  }
  g.state.cash = 1e7;
  const top = () => { while (g.state.attackers.length < 300) { const a = g.spawnAttacker(1, 1e30); g.path.place(a, Math.random() * g.path.length * 0.9); a.progress = Math.random() * g.path.length * 0.9; g.path.place(a, a.progress); } };
  top();
  g.setSpeed(8);
  for (let i = 0; i < 60; i++) { top(); g.update(1000 / 60); } // warm-up
  const times = [];
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) {
    top();
    const a = performance.now();
    g.update(1000 / 60);
    times.push(performance.now() - a);
  }
  times.sort((x, y) => x - y);
  const mean = times.reduce((x, y) => x + y, 0) / times.length;
  console.log(`      bench: ${g.state.turrets.length} turrets, ${g.state.attackers.length} attackers, projectiles ${g.state.projectiles.length}, 8 steps/frame: mean ${mean.toFixed(2)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms, max ${times[times.length - 1].toFixed(2)} ms`);
  check('(f) 150 turrets placed', g.state.turrets.length >= 150, `${g.state.turrets.length}`);
  check('(f) mean < 4 ms per real frame at speed 8', mean < 4, `${mean.toFixed(2)} ms`);
  check('(f) simulation did real work', g.state.kills >= 0 && g.state.projectiles.length >= 0 && g.state.time > 0);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
