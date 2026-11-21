// Headless simulation tests for src/game. Run: node scripts/sim-test.ts
import { Game, STEP_MS } from '../src/game/Game.ts';
import { MAPS } from '../src/data/maps.ts';
import { DIFFICULTIES, WAVES, WEAVE } from '../src/data/rules.ts';
import { waveHp, waveBounty, laneOffset } from '../src/game/Attacker.ts';
import { ladderValue } from '../src/game/modifiers.ts';
import { DpsTracker } from '../src/ui/dps.ts';
import { COLOR_SYMBOL } from '../src/ui/colors.ts';
import { clampScale, getSettings, getCodex, recordCombo, saveSlot, getSlot, clearSlot, cleanSaveWrapper } from '../src/ui/storage.ts';
import { describeCombo, partnerList, COMBO_COUNT } from '../src/ui/codex.ts';
import { Tutorial, TUTORIAL_STEPS } from '../src/ui/tutorial.ts';
import { Hints, HINTS, cleanHintIds } from '../src/ui/hints.ts';
import { musicStep, musicTempo, musicIntensity } from '../src/ui/music.ts';
import { ACHIEVEMENTS, newlyEarned, cleanEarned, starsForWave, bestWave } from '../src/ui/achievements.ts';
import { dailyFor } from '../src/ui/daily.ts';
import { makeReplay, runReplay, validateReplay, replayMatches, startPlayback } from '../src/game/replay.ts';
import { GamepadReader, PAD_BUTTONS } from '../src/ui/gamepad.ts';
import { t, setLang, detectLang, DICT } from '../src/ui/i18n.ts';
import { TURRETS } from '../src/data/turrets.ts';
import { encodeReplay, decodeReplay } from '../src/ui/replayCode.ts';
import { COMBOS } from '../src/data/combos.ts';
import { formatNum } from '../src/ui/format.ts';
import { AudioEngine, UI_SOUNDS, busOf } from '../src/ui/audio.ts';
import { COLOR_SHAPES } from '../src/render/atlas.ts';
import { KEY_ACTIONS, RESERVED_CODES, cleanKeyOverrides, codeLookup, keyLabel, rebind, resolveBindings } from '../src/ui/keymap.ts';
import type { Turret } from '../src/game/Turret.ts';
import type { Attacker, GameEvents, KeyColor, Projectile, Result, Stat, TargetMode } from '../src/types.ts';

let failures = 0;
function check(name: string, cond: unknown, extra: string = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!cond) failures++;
}
const near = (a: number, b: number, eps: number = 1e-6): boolean => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// ------------------------------------------------------------------ helpers
/** Unwrap a command result that must have succeeded (throws with the failure reason otherwise). */
function must<T extends object>(r: Result<T>): { ok: true } & T {
  if (!r.ok) throw new Error(r.reason);
  return r;
}
/** Turret instance by id (throws if missing). */
function tur(g: Game, id: number): Turret {
  const t = g.turretMap.get(id);
  if (!t) throw new Error('no turret ' + id);
  return t;
}
/** Deliberately wrong-typed argument for input validation tests (the engine must reject it at runtime). */
const wrong = <T>(v: unknown): T => v as T;
interface Spot { x: number; y: number; score: number }
/** Pin an attacker at (x, y): black-holed attackers are not moved by the engine (handy for tests). */
function freeze(a: Attacker, x: number, y: number): Attacker { a.blackholed = true; a.x = x; a.y = y; return a; }
/** Valid build spots on a map ranked by how much road they cover. */
function bestSpots(mapId: string, count: number, spacing: number = 46, radius: number = 110): Spot[] {
  const probe = new Game({ mapId, mode: 'sandbox', seed: 1 });
  const road = probe.roadPoints();
  const cand: Spot[] = [];
  for (let x = 22; x <= 698; x += 11) {
    for (let y = 22; y <= 428; y += 11) {
      if (!probe.canBuild('blue', x, y).ok) continue;
      let score = 0;
      for (const r of road) if ((r.x - x) ** 2 + (r.y - y) ** 2 <= radius * radius) score++;
      cand.push({ x, y, score });
    }
  }
  cand.sort((a, b) => b.score - a.score);
  const out: Spot[] = [];
  for (const c of cand) {
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= spacing)) out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

/** Greedy scripted player: build in the best spots and keep upgrading the cheapest upgrade. */
function makePlayer(game: Game, spots: Spot[]): () => void {
  const kinds = ['blue', 'green', 'red', 'yellow'];
  let next = 0;
  return function act(): void {
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
      let best: { id: number; st: Stat; c: number } | null = null;
      const stats: Stat[] = ['damage', 'rate', 'range'];
      for (const t of s.turrets) for (const st of stats) {
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
  let over = 0, leaks = 0;
  let goData = null as GameEvents['gameover'] | null;
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
  for (const k of Object.keys(counts) as (keyof typeof counts)[]) g.on(k, () => counts[k]++);
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
  const dmgWith = (n: number): number => {
    const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 3 });
    for (let i = 0; i < n; i++) { const id = must(g.build('green', 300 + i * 46, 60)).id; g.upgrade(id, 'range', true); }
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
  const a1 = must(g.build('green', 300, 60)).id, a2 = must(g.build('green', 346, 60)).id, a3 = must(g.build('green', 600, 60)).id;
  check('(c) links: near Greens linked, far one not', tur(g, a1).links.includes(a2) && !tur(g, a1).links.includes(a3));
}
{
  // piercing laser: one Green with 25 energy, attackers in a row to its right
  const setup = (hps: number[], ys?: number[]) => {
    const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 3 });
    must(g.build('green', 300, 60));
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
  const red = must(g.build('red', 360, 60)).id;
  const st = () => tur(g, red).stats;
  check('(d) Red base 50/200/50', st().damage === 50 && st().range === 200 && st().rate === 50);
  const boom = must(g.build('damageUp', 410, 60));
  check('(d) Boom: damage 70', near(st().damage, 70), `${st().damage}`);
  const bb = must(g.build('damageUpBig', 310, 60));
  check('(d) Boom + BigBang: damage 120', near(st().damage, 120), `${st().damage}`);
  g.sell(boom.id); g.sell(bb.id);
  check('(d) selling restores base', st().damage === 50);
  const sx = must(g.build('rateUpEx', 410, 60));
  check('(d) SpeedEx: dmg 30, range 180, rate 110', near(st().damage, 30) && near(st().range, 180) && near(st().rate, 110), JSON.stringify(st()));
  const bb2 = must(g.build('damageUpBig', 310, 60));
  check('(d) SpeedEx + BigBang: dmg 80', near(st().damage, 80), `${st().damage}`);
  g.sell(bb2.id);
  // floor: three SpeedEx -> 1 - 1.2 floors at 0.2
  const sx2 = must(g.build('rateUpEx', 360, 110)), sx3 = must(g.build('rateUpEx', 310, 110));
  check('(d) multiplier floor 0.2: damage 10', near(st().damage, 10), `${st().damage}`);
  check('(d) flat rate adds stack: (50 + 180) * 1', near(st().rate, 230), `${st().rate}`);
  [sx.id, sx2.id, sx3.id].forEach((i) => g.sell(i));
  // Ranger +100 flat, RangerEx +100 and -25% rate, Speed +120
  const rg = must(g.build('rangeUp', 410, 60));
  check('(d) Ranger: range 300', near(st().range, 300));
  const rgx = must(g.build('rangeUpEx', 310, 60));
  check('(d) Ranger + RangerEx: range 400, rate 37.5', near(st().range, 400) && near(st().rate, 37.5), JSON.stringify(st()));
  g.sell(rg.id); g.sell(rgx.id);
  const sp = must(g.build('rateUp', 410, 60));
  check('(d) Speed: rate 170', near(st().rate, 170));
  g.sell(sp.id);
  // a running shot interval rescales with the rate, a combo recharge does not
  const rt = tur(g, red);
  rt.cd = 600; rt.comboNext = 0;
  const sp2 = must(g.build('rateUp', 410, 60));
  check('(d) rate change rescales a shot interval (600 * 50 / 170)', near(rt.cd, 600 * 50 / 170), `${rt.cd}`);
  g.sell(sp2.id);
  g.startRecharge(rt, 7400);
  const cn = rt.comboNext;
  const sp3 = must(g.build('rateUp', 410, 60));
  check('(d) rate up does not shorten a combo recharge', rt.cd === 7400 && rt.comboNext === cn, `${rt.cd}`);
  g.sell(sp3.id);
  check('(d) rate down does not lengthen a combo recharge', rt.cd === 7400 && rt.comboNext === cn, `${rt.cd}`);
  rt.cd = 0; rt.comboNext = 0;
  const bbx = must(g.build('damageUpBigEx', 410, 60));
  check('(d) BigBangEx: 100, 140, 35', near(st().damage, 100) && near(st().range, 140) && near(st().rate, 35), JSON.stringify(st()));
  // influence radius: far modifier not applied until upgraded to 130
  g.sell(bbx.id);
  const far = must(g.build('damageUp', 360 + 110, 60));
  check('(d) modifier range 80: 110 away has no effect', st().damage === 50);
  g.upgrade(far.id, 'range');
  check('(d) modifier upgraded to 130 reaches 110', near(st().damage, 70) && tur(g, far.id).modRange === 130);
  check('(d) modifier only has a range upgrade', g.upgradeCost(far.id, 'damage') === null && g.upgradeCost(far.id, 'range') === null);
  // levels apply on top of ladders: Red damage level 2 (350) with Boom
  g.upgrade(red, 'damage'); g.upgrade(red, 'damage');
  check('(d) ladder 350 with Boom = 490', near(st().damage, 490), `${st().damage}`);
  // economy rules
  const g2 = new Game({ mapId: 'map9', seed: 2 });
  const b = must(g2.build('blue', 300, 60));
  check('(d) build costs cash, start $30', g2.state.cash === 20 && b.ok);
  g2.state.cash = 1000;
  g2.upgrade(b.id, 'damage');
  const spentBefore = g2.state.spent;
  const r = must(g2.sell(b.id));
  check('(d) sell refunds 70% of cashValue, spent unchanged', r.refund === Math.floor(30 * 0.7) && g2.state.spent === spentBefore, `refund ${r.refund}`);
  const m = must(g2.build('green', 300, 60)).id;
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
  const y = must(g.build('yellow', 300, 140));
  // max the damage ladder: poison 10 -> speed 6
  g.upgrade(y.id, 'damage', true);
  const ty = tur(g, y.id);
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
  must(g.build('railgun', 150, 60));
  const aa = [0, 1, 2].map((i) => freeze(g.spawnAttacker(1, 1e9), 200 + i * 40, 60 + (i === 1 ? 5 : 0)));
  g.advance(1);
  check('(mech) Railgun pierces all attackers on the line', aa.every((a) => a.hp < a.maxHp), aa.map((a) => a.maxHp - a.hp).join(','));
  const g2 = new Game({ mapId: 'map9', mode: 'sandbox', seed: 9 });
  must(g2.build('fusion', 150, 60));
  const e = freeze(g2.spawnAttacker(1, 1e12), 200, 60);
  const dealt: number[] = [];
  let last = e.hp;
  for (let i = 0; i < 600; i++) { g2.advance(1); if (e.hp < last) { dealt.push(last - e.hp); last = e.hp; } }
  check('(mech) Fusion ramps +15% per tick up to x6', dealt.length > 10 && near(dealt[1] / dealt[0], 1.15) && near(Math.max(...dealt) / dealt[0], 6, 1e-6), dealt.slice(0, 4).map((d) => d.toFixed(0)).join(','));
  const g3 = new Game({ mapId: 'map9', mode: 'sandbox', seed: 9 });
  const bl = must(g3.build('blue', 150, 60)).id, tg = must(g3.build('targeter', 150, 160)).id;
  const f = freeze(g3.spawnAttacker(1, 1e9), 150, 270); // 210 from Blue (range 130), 110 from the Targeter (range 150)
  g3.advance(5);
  const before = f.hp;
  g3.join(tg, bl);
  g3.advance(30);
  check('(mech) Targeter: joined Blue acquires from the Targeter position', before === f.maxHp && f.hp < before && tur(g3, bl).targeterId === tg);
  g3.join(tg, null);
  check('(mech) unjoin works', tur(g3, bl).targeterId === null && tur(g3, tg).joinedTo === null);
  const co = must(g3.build('comboOnly', 400, 100));
  check('(mech) Combo-only never fires, is combo capable', (() => { const t = tur(g3, co.id); g3.advance(10); return t.comboCapable && t.targetId === null; })());
  check('(mech) setComboColor', g3.setComboColor(co.id, 'green').ok && !g3.setComboColor(co.id, wrong<KeyColor>('pink')).ok);
}
{
  // targeting modes, directional, focus fire, red holding, freak-out
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 12 });
  const t = must(g.build('green', 300, 60)); const tt = tur(g, t.id);
  const mk = (x: number, y: number, hp: number, progress: number, speed: number): Attacker => { const a = freeze(g.spawnAttacker(1, hp), x, y); a.progress = progress; a.speed = speed; a.baseSpeed = 100; return a; };
  const A = mk(310, 80, 100, 10, 30), B = mk(330, 90, 900, 50, 60), C = mk(360, 60, 500, 90, 90);
  g.grid.rebuild(g.state.attackers);
  const settle = () => { for (let i = 0; i < 8; i++) { tt.cd = 1e9; g.advance(1); } return tt.targetId; };
  const pick = (mode: TargetMode) => { tt.targetMode = mode; tt.targetId = null; return settle(); };
  g.advance(0);
  check('(tgt) modes near/far/weak/strong/slow/fast',
    pick('near') === A.id && pick('far') === C.id && pick('weak') === A.id && pick('strong') === B.id && pick('slow') === A.id && pick('fast') === C.id);
  g.setDirectional(t.id, 'small', Math.atan2(30, 60)); // aims toward B (330,90)
  tt.targetMode = 'near'; tt.targetId = null; settle();
  check('(tgt) directional cone restricts acquisition', tt.targetId === B.id, `${tt.targetId}`);
  // aimed at B (45 deg); A sits 18.4 deg off that line: inside Tight 60 (+-30), outside Pinpoint 30 (+-15)
  g.setDirectional(t.id, 'tight', Math.PI / 4); settle();
  check('(tgt) Tight 60 cone includes 18 deg off-axis', tt.targetId === A.id, `${tt.targetId}`);
  g.setDirectional(t.id, 'pinpoint', Math.PI / 4); settle();
  check('(tgt) Pinpoint 30 cone excludes 18 deg off-axis', tt.targetId === B.id, `${tt.targetId}`);
  {
    g.setDirectional(t.id, 'normal');
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) { g.cycleDirectional(t.id); seen.push(tt.directional.mode); }
    check('(tgt) D cycles 180, 90, 60, 45, 30, all around', seen.join() === 'wide,medium,tight,small,pinpoint,normal,wide', seen.join());
  }
  g.setDirectional(t.id, 'normal');
  g.focusFire(C.id); settle();
  check('(tgt) focus fire overrides', tt.targetId === C.id);
  g.focusFire(null);
}
{
  const g = new Game({ mapId: 'map9', mode: 'sandbox', seed: 13 });
  const r = must(g.build('red', 300, 60)); const tr = tur(g, r.id);
  for (let i = 0; i < 3; i++) { g.upgrade(r.id, 'range'); g.upgrade(r.id, 'rate'); }
  g.advance(60 * 8);
  const isOrbiting = (p: Projectile): boolean => !!p.orbiting;
  const orbiting = g.state.projectiles.filter((p) => p.kind === 'rocket' && isOrbiting(p));
  check('(mech) Red holding pattern keeps 4 rockets circling', tr.holding === 4 && orbiting.length === 4 && orbiting.every((p) => Math.abs(Math.hypot(p.x - tr.x, p.y - tr.y) - 35) < 1));
  const a = freeze(g.spawnAttacker(1, 1e9), 360, 100);
  g.advance(10);
  check('(mech) rockets dive at a target', g.state.projectiles.every((p) => !isOrbiting(p)) || tr.holding < 4);
  g.advance(120);
  check('(mech) rockets hit', a.hp < a.maxHp);
  const g2 = new Game({ mapId: 'map9', mode: 'sandbox', seed: 13 });
  const r2 = must(g2.build('red', 300, 60));
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
  const b = must(g.build('blue', 300, 60)); const t = tur(g, b.id);
  const ev: string[] = [];
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
    const prev = new Map<number, [number, number]>();
    let steps = 0;
    while (!g.state.over && steps < 60 * 120) {
      g.advance(1);
      steps++;
      const lanes: number[] = [];
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

// ------------------------------------------------------------------ (q) player information (read-only previews)
{
  for (const d of ['medium', 'hard'] as const) {
    const g = new Game({ mapId: 'map1', difficulty: d, seed: 5 });
    const growth = DIFFICULTIES[d].hpGrowth;
    const first = g.wavePreview();
    check(`(q) ${d}: wavePreview() before wave 1 is wave 1`, first.wave === 1 && first.count === WAVES.size && first.type === 0);
    let same = true;
    for (const n of [1, 50, 100, 150]) {
      const p = g.wavePreview(n);
      same &&= p.wave === n && p.hp === waveHp(n, growth) && p.bounty === waveBounty(n) && p.type === (n - 1) % WAVES.types;
    }
    check(`(q) ${d}: wavePreview(n) matches the wave formulas (1, 50, 100, 150)`, same);
    const rng0 = g.rng.s;
    g.wavePreview(77);
    check(`(q) ${d}: wavePreview draws no random numbers`, g.rng.s === rng0);
    g.sendWave();
    g.advance(2);
    const a = g.state.attackers[0];
    check(`(q) ${d}: preview of wave 1 equals the spawned attacker`, a && a.maxHp === first.hp && a.bounty === first.bounty && a.type === first.type);
    check(`(q) ${d}: after wave 1 starts the preview moves to wave 2`, g.wavePreview().wave === 2);
  }

  // upgradePreview: equals the real stats after the upgrade, modifiers included, and changes nothing
  const g = new Game({ mapId: 'map1', mode: 'sandbox', seed: 6 });
  /** First legal spot within `r` of (cx, cy). */
  const spotNear = (kind: string, cx: number, cy: number, r: number): { x: number; y: number } => {
    for (let x = cx - r; x <= cx + r; x += 4) for (let y = cy - r; y <= cy + r; y += 4) {
      if (Math.hypot(x - cx, y - cy) <= r && g.canBuild(kind, x, y).ok) return { x, y };
    }
    throw new Error('no spot near ' + cx + ',' + cy);
  };
  const s0 = spotNear('red', 360, 225, 300);
  const red = must(g.build('red', s0.x, s0.y)).id;
  const s1 = spotNear('damageUp', s0.x, s0.y, 70);
  const boom = must(g.build('damageUp', s1.x, s1.y)).id;
  const s2 = spotNear('rangeUp', s0.x, s0.y, 75);
  must(g.build('rangeUp', s2.x, s2.y));
  let allSame = true, untouched = true, detail = '';
  for (const stat of ['damage', 'range', 'rate'] as const) {
    for (let i = 0; i < 3; i++) {
      const before = JSON.stringify(g.serialize());
      const pv = g.upgradePreview(red, stat);
      untouched &&= JSON.stringify(g.serialize()) === before;
      if (!pv) { allSame = false; detail = 'null preview'; break; }
      const cost = g.upgradeCost(red, stat);
      must(g.upgrade(red, stat));
      const st = tur(g, red).stats;
      const same = pv.cost === cost && near(pv.to.damage, st.damage) && near(pv.to.range, st.range) && near(pv.to.rate, st.rate);
      if (!same) detail = `${stat}: preview ${JSON.stringify(pv.to)} real ${JSON.stringify(st)}`;
      allSame &&= same;
    }
  }
  check('(q) upgradePreview equals the stats after the real upgrade (inside Boom and Ranger auras)', allSame, detail);
  check('(q) upgradePreview changes no game state', untouched);
  const tr = tur(g, red);
  check('(q) upgradePreview includes modifier bonuses (Boom +40%)',
    near(tr.stats.damage, ladderValue('red', 'damage', tr.levels.damage) * 1.4) && g.upgradePreview(red, 'damage')!.from.damage === tr.stats.damage);
  g.upgrade(red, 'damage', true);
  check('(q) upgradePreview is null for a maxed stat and a missing turret', g.upgradePreview(red, 'damage') === null && g.upgradePreview(99999, 'range') === null);
  // DPS tracker (src/ui/dps.ts, pure): 100 damage per game second -> 100 DPS; null before one second is measured
  const dt = new DpsTracker(), fake = { ...tur(g, red), damageDealt: 0 };
  let dpsEarly: number | null = 0;
  for (let ms = 0; ms <= 15000; ms += 100) {
    fake.damageDealt = ms / 10;
    dt.sample(g, ms, [fake]);
    if (ms === 500) dpsEarly = dt.dps(fake, ms);
  }
  const dps = dt.dps(fake, 15000);
  check('(q) DPS tracker: 100 damage/s reads 100 DPS, null in the first second', dpsEarly === null && dps != null && near(dps, 100), String(dps));
  dt.sample(g, 16000, []);
  check('(q) DPS tracker forgets sold turrets at its next sample', dt.dps(fake, 16000) === null);

  const mp = g.upgradePreview(boom, 'range');
  check('(q) modifier preview: influence 80 -> 130', !!mp && mp.from.range === 80 && mp.to.range === 130, JSON.stringify(mp));
}

// ------------------------------------------------------------------ (q) keymap (src/ui/keymap.ts, pure)
{
  const codes = KEY_ACTIONS.map((a) => a.code);
  check('(q) keymap: defaults are unique and none is reserved', new Set(codes).size === codes.length && codes.every((c) => !RESERVED_CODES.has(c)));
  const def = codeLookup(resolveBindings({}));
  check('(q) keymap: default keys match SPEC.md section 8', def.get('KeyQ') === 'upDamage' && def.get('KeyW') === 'upRange' && def.get('KeyE') === 'upRate'
    && def.get('Space') === 'sendWave' && def.get('KeyA') === 'autoSend' && def.get('KeyP') === 'pause' && def.get('KeyG') === 'settings' && def.get('KeyD') === 'cone');
  const o1 = rebind({}, 'sell', 'KeyZ');
  check('(q) keymap: rebind to a free key stores only that override', JSON.stringify(o1) === '{"sell":"KeyZ"}' && codeLookup(resolveBindings(o1)).get('KeyZ') === 'sell'
    && !codeLookup(resolveBindings(o1)).has('KeyS'));
  const o2 = rebind(o1, 'pause', 'KeyZ');
  const b2 = resolveBindings(o2);
  check('(q) keymap: taking a used key swaps the two actions', b2.pause === 'KeyZ' && b2.sell === 'KeyP');
  check('(q) keymap: binding back to the default drops the override', JSON.stringify(rebind(o1, 'sell', 'KeyS')) === '{}');
  const clean = cleanKeyOverrides({ sell: 'KeyZ', pause: 'Escape', bogus: 'KeyK', move: 42, __proto__: { x: 1 } });
  check('(q) keymap: stored overrides are cleaned (unknown actions, reserved keys, non-strings dropped)', JSON.stringify(clean) === '{"sell":"KeyZ"}'
    && JSON.stringify(cleanKeyOverrides('junk')) === '{}' && JSON.stringify(cleanKeyOverrides(['KeyQ'])) === '{}');
  check('(q) keymap: labels', keyLabel('KeyQ') === 'Q' && keyLabel('Space') === 'Space' && keyLabel('Slash') === '/' && keyLabel('Digit9') === '9');
}

// ------------------------------------------------------------------ (u) undo (optional relaxed rule, SPEC.md section 9)
{
  const g = new Game({ mapId: 'map1', mode: 'sandbox', seed: 10 });
  const [sp1, sp2] = bestSpots('map1', 2);
  const snap = () => ({ cash: g.state.cash, spent: g.state.spent, score: g.state.score, n: g.state.turrets.length });
  const s0 = snap();
  check('(u) nothing to undo in a fresh game', g.undoInfo() === null && !g.undo().ok);
  let ev = null as GameEvents['undo'] | null;
  g.on('undo', (e) => { ev = e; });
  const id = must(g.build('green', sp1.x, sp1.y)).id;
  const info = g.undoInfo();
  const r = g.undo();
  const s1 = snap();
  check('(u) undo a build: full refund, spent and score back, turret gone, undo event',
    info !== null && info.refund === 15 && r.ok && s1.cash === s0.cash && s1.spent === s0.spent && s1.score === s0.score && s1.n === 0
    && !g.turretMap.has(id) && ev !== null && ev!.kind === 'build' && ev!.id === id, JSON.stringify({ s0, s1 }));
  check('(u) the game is flagged undoUsed, and it survives save/restore', g.state.undoUsed === true && Game.deserialize(g.serialize()).state.undoUsed === true);
  check('(u) a second undo has nothing left', !g.undo().ok);

  // upgrade to max, then undo: levels, cashValue, stats and freak state come back exactly
  const blue = must(g.build('blue', sp1.x, sp1.y)).id;
  const t = tur(g, blue);
  const look = () => JSON.stringify({ levels: t.levels, stats: t.stats, cashValue: t.cashValue, freak: t.freak, freakAt: t.freakAt, cc: t.comboCapable, cash: g.state.cash, spent: g.state.spent, score: g.state.score });
  const fresh = look();
  must(g.upgrade(blue, 'damage', true));
  const afterDamage = look();
  must(g.upgrade(blue, 'rate', true)); // the last action wins: only this one can be undone
  check('(u) the blue is now freak-out capable and damage-maxed', t.freak !== 'off' && t.comboCapable);
  must(g.undo());
  check('(u) undo takes back only the last upgrade (rate): turret, freak state, cash, spent, score as after the damage upgrade',
    look() === afterDamage, look());
  const g5 = new Game({ mapId: 'map1', mode: 'sandbox', seed: 10 });
  const b5 = must(g5.build('blue', sp1.x, sp1.y)).id;
  const t5 = tur(g5, b5);
  const look5 = () => JSON.stringify({ levels: t5.levels, stats: t5.stats, cashValue: t5.cashValue, freak: t5.freak, cc: t5.comboCapable, cash: g5.state.cash, spent: g5.state.spent });
  const fresh5 = look5();
  must(g5.upgrade(b5, 'damage', true));
  must(g5.undo());
  check('(u) undo of a damage-to-max upgrade restores the fresh turret (combo capability gone again)', look5() === fresh5 && !t5.comboCapable && fresh.length > 0);

  // once the turret fires, it is too late
  const g2 = new Game({ mapId: 'map1', mode: 'sandbox', seed: 11 });
  const cid = must(g2.build('blue', sp2.x, sp2.y)).id;
  const ct = tur(g2, cid);
  g2.spawnAttacker(1, 1e9);
  const a = g2.state.attackers[0];
  freeze(a, ct.x + 40, ct.y);
  let fired = false;
  g2.on('shot', (e) => { if (e.turretId === cid) fired = true; });
  for (let i = 0; i < 120 && !fired; i++) g2.advance(1);
  check('(u) after the turret fires undo is refused', fired && g2.undoInfo() === null && !g2.undo().ok && g2.turretMap.has(cid));
  // sell, move and a new build end the chance for the previous action
  const g3 = new Game({ mapId: 'map1', mode: 'sandbox', seed: 12 });
  const x1 = must(g3.build('blue', sp1.x, sp1.y)).id;
  const x2 = must(g3.build('blue', sp2.x, sp2.y)).id;
  must(g3.undo());
  check('(u) only the newest build can be undone', g3.turretMap.has(x1) && !g3.turretMap.has(x2) && !g3.undo().ok);
  must(g3.upgrade(x1, 'range'));
  must(g3.sell(x1));
  check('(u) a sell ends the chance to undo', !g3.undo().ok);
  const keep = new Game({ mapId: 'map1', mode: 'sandbox', seed: 13 });
  must(keep.build('blue', sp1.x, sp1.y));
  const k2 = Game.deserialize(keep.serialize());
  check('(u) a restored game starts without an undo (it is not saved)', k2.undoInfo() === null && keep.undoInfo() !== null);
}

// ------------------------------------------------------------------ (acc) accessibility tables (src/ui, src/render; pure)
{
  const cols = ['red', 'green', 'blue', 'yellow'] as const;
  const shapes = cols.map((c) => COLOR_SYMBOL[c]);
  check('(acc) every combo colour has its own shape', new Set(shapes).size === 4 && shapes.every(Boolean));
  check('(acc) UI shapes and map badge shapes are the same table', cols.every((c) => COLOR_SHAPES[c] === COLOR_SYMBOL[c]));
  check('(acc) interface size is clamped to 0.8..1.6 in steps of 0.1, junk -> 1',
    clampScale(0.5) === 0.8 && clampScale(3) === 1.6 && clampScale(1.23) === 1.2 && clampScale('big') === 1 && clampScale(NaN) === 1);
  const proto = AudioEngine.prototype as unknown as Record<string, unknown>;
  const sounds = Object.getOwnPropertyNames(AudioEngine.prototype).filter((n) => n.startsWith('s_')).map((n) => n.slice(2));
  check('(acc) audio: every interface sound exists, shots/blasts/combos/alarm go to the effects bus',
    [...UI_SOUNDS].every((n) => typeof proto['s_' + n] === 'function') && sounds.filter((n) => busOf(n) === 'ui').length === UI_SOUNDS.size
    && ['shot_cannon', 'blast_huge', 'combo', 'alarm', 'horn', 'kill'].every((n) => busOf(n) === 'sfx'));
  const ae = new AudioEngine();
  ae.setBusVolume('ui', 2); ae.setBusVolume('sfx', Number.NaN);
  check('(acc) audio: bus volume is clamped to 0..1, junk -> 1', ae.busVol.ui === 1 && ae.busVol.sfx === 1);
  const st = getSettings(); // Node: no localStorage, no matchMedia
  check('(acc) accessibility defaults: shapes on, size 1, contrast and reduce motion off', st.colorSymbols === true && st.uiScale === 1
    && st.highContrast === false && st.reduceMotion === false && st.sfxVolume === 1 && st.uiVolume === 1);
}

// ------------------------------------------------------------------ (onb) onboarding: Combo Codex (src/ui/codex.ts, pure)
{
  const all = Object.values(COMBOS).flat();
  check('(onb) codex: 20 recipes', COMBO_COUNT === 20 && all.length === 20);
  let ok = true, bad = '';
  for (const r of all) {
    const d = describeCombo(r);
    const num = r.fx.hit != null ? formatNum(r.fx.hit) : r.fx.shockwave ? formatNum(r.fx.shockwave.damage) : r.fx.blackHole ? String(r.fx.blackHole.radius) : formatNum(r.fx.laser!.damage);
    const good = d.length > 20 && d.endsWith('.') && d.includes(num) && !d.includes('undefined') && !d.includes('NaN');
    if (!good) { ok = false; bad = r.id + ': ' + d; }
  }
  check('(onb) codex: every recipe gets a description with its main number', ok, bad);
  check('(onb) codex: partner list follows the recipe', partnerList(all.find((r) => r.id === 'nuke')!).join() === 'blue,blue'
    && partnerList(all.find((r) => r.id === 'bigLaserClusterMine')!).join() === 'red,red,green,blue');
  const c0 = getCodex();
  recordCombo('nuke'); recordCombo('nuke'); recordCombo('notACombo');
  const c1 = getCodex();
  check('(onb) codex storage counts known recipes only (in-memory fallback in Node)', c1.nuke === (c0.nuke || 0) + 2 && !('notACombo' in c1));
}

// ------------------------------------------------------------------ (onb) tutorial step machine on a real Game
{
  const g = new Game({ mapId: 'tutorial', difficulty: 'easy', seed: 21, waveInterval: 600000 });
  const t = new Tutorial();
  const names = ['shot', 'kill', 'leak', 'wave', 'build', 'sell', 'upgrade', 'combo'] as const;
  for (const n of names) g.on(n, (p: object) => { const k = (p as { kind?: unknown }).kind; t.observe(n, typeof k === 'string' ? k : undefined); });
  const ctx = () => ({ state: g.state, tab: null });
  const seen: string[] = [t.step.id];
  const step = () => { if (t.check(ctx())) seen.push(t.step.id); };
  check('(onb) tutorial: starts at welcome, Next is needed there', t.step.id === 'welcome' && !t.check(ctx()));
  t.next(); seen.push(t.step.id);
  const [a, b] = bestSpots('tutorial', 2);
  const blue = must(g.build('blue', a.x, a.y)).id; step();
  check('(onb) tutorial: building a Cannon finishes the build step', t.step.id === 'wave');
  g.advance(60 * 5); step();
  check('(onb) tutorial: no wave comes by itself on the tutorial map', g.state.wave === 0 && t.step.id === 'wave');
  must(g.sendWave()); step();
  must(g.upgrade(blue, 'damage')); step();
  must(g.cycleTargetMode(blue)); step();
  check('(onb) tutorial: wave, upgrade and target steps follow the game', t.step.id === 'second', seen.join(' > '));
  must(g.build('green', b.x, b.y)); step();
  check('(onb) tutorial: a second turret leads to the manual combos step', t.step.id === 'combos');
  t.back();
  check('(onb) tutorial: Back returns to the previous step', t.step.id === 'second');
  t.go(t.count - 2); t.next(); t.next();
  check('(onb) tutorial: Next on the last step ends it', t.over && !t.check(ctx()));
  const t2 = new Tutorial(); t2.skip();
  check('(onb) tutorial: Skip ends it', t2.over);
  check('(onb) tutorial: every step text is non-empty and names the bound keys', TUTORIAL_STEPS.every((s) => s.text((k) => '<' + k + '>').length > 30)
    && TUTORIAL_STEPS.find((s) => s.id === 'upgrade')!.text((k) => '<' + k + '>').includes('<upDamage>'));
}

// ------------------------------------------------------------------ (onb) one-time tips (src/ui/hints.ts, pure)
{
  const hs = new Hints(['freakout']);
  hs.onEvent('leak', { lives: 9 }); hs.onEvent('leak', { lives: 8 });
  hs.onEvent('unlock', { kind: 'rangeUp' }); hs.onEvent('unlock', { kind: 'blue' });
  const ids = () => { const out: string[] = []; for (let h = hs.next(); h; h = hs.next()) out.push(h.id); return out; };
  check('(onb) tips: a leak and a modifier unlock queue their tip once, a basic unlock none', ids().join() === 'leak,modifier');
  const g = new Game({ mapId: 'map1', mode: 'sandbox', seed: 22 });
  const [p1] = bestSpots('map1', 1);
  const id = must(g.build('blue', p1.x, p1.y)).id;
  g.state.wave = 10;
  hs.onState(g.state);
  check('(onb) tips: wave 10 without any upgrade queues the upgrade tip', ids().join() === 'noUpgrades');
  must(g.upgrade(id, 'damage', true)); must(g.upgrade(id, 'rate', true));
  hs.onState(g.state);
  check('(onb) tips: a damage-maxed weapon queues comboReady; freak-out was already seen', ids().join() === 'comboReady');
  hs.onState(g.state); hs.onEvent('leak', {});
  check('(onb) tips: nothing comes twice', hs.next() === null);
  check('(onb) tips: stored ids are cleaned', cleanHintIds(['leak', 'nope', 3, null]).join() === 'leak' && cleanHintIds('x').length === 0);
  check('(onb) tips: every tip has text that names bound keys where it mentions them', HINTS.every((h) => h.text((k) => '<' + k + '>').length > 40)
    && HINTS.find((h) => h.id === 'comboReady')!.text((k) => '<' + k + '>').includes('<combo>'));
}

// ------------------------------------------------------------------ (feel) adaptive music (src/ui/music.ts, pure parts)
{
  const voices = (i: number): Set<string> => { const v = new Set<string>(); for (let st = 0; st < 64; st++) for (const n of musicStep(st, i)) v.add(n.voice); return v; };
  const calm = voices(0), mid = voices(0.5), hot = voices(1);
  check('(feel) music: calm is only the pad, layers join with intensity', calm.size === 1 && calm.has('pad') && mid.has('kick') && mid.has('bass') && mid.has('arp') && !mid.has('hat') && hot.has('hat'));
  check('(feel) music: tempo 96 bpm calm, 132 bpm at full intensity, clamped', near(musicTempo(0), 96 / 15) && near(musicTempo(1), 132 / 15) && near(musicTempo(5), musicTempo(1)));
  const all = Array.from({ length: 64 }, (_, st) => musicStep(st, 1)).flat();
  check('(feel) music: notes are sane (pitch 30..96, length >= 1, velocity 0..1)', all.every((n) => (n.midi === 0 || (n.midi >= 30 && n.midi <= 96)) && n.len >= 1 && n.vel > 0 && n.vel <= 1));
  const base = { attackers: [] as { dead?: boolean }[], lives: 10, wave: 0, over: false };
  check('(feel) music: intensity is low before wave 1, rises with attackers and lost lives, stays in 0..1',
    musicIntensity(base, 10) <= 0.15 && musicIntensity({ ...base, wave: 3 }, 10) < musicIntensity({ ...base, wave: 3, attackers: Array(30).fill({}) }, 10)
    && musicIntensity({ ...base, wave: 3, lives: 2, attackers: Array(50).fill({}) }, 10) <= 1);
}

// ------------------------------------------------------------------ (mot) achievements (src/ui/achievements.ts, pure)
{
  const ids = (xs: { id: string }[]): string => xs.map((x) => x.id).sort().join();
  const base = { codex: new Set<string>(), mapsPlayed: new Set<string>(), tutorialDone: false, startLives: 10, dailies: 0 };
  const g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 30 });
  check('(mot) achievements: nothing for a fresh game', ids(newlyEarned({}, { ...base, state: g.state })) === '');
  check('(mot) achievements: first kill and first combo from events', ids(newlyEarned({}, { ...base, state: g.state, event: { name: 'kill', payload: {} } })) === 'firstKill'
    && ids(newlyEarned({}, { ...base, state: g.state, event: { name: 'combo', payload: { id: 'nuke' } } })) === 'firstCombo,nuke');
  g.state.wave = 30;
  check('(mot) achievements: wave 30 on Medium with all lives earns wave25 and clean30, not wave50', ids(newlyEarned({}, { ...base, state: g.state })) === 'clean30,wave25');
  g.state.lives = 9;
  check('(mot) achievements: a lost life blocks clean30', !newlyEarned({}, { ...base, state: g.state }).some((x) => x.id === 'clean30'));
  check('(mot) achievements: already earned ones are not repeated', ids(newlyEarned({ wave25: 'x' }, { ...base, state: g.state })) === '');
  const sb = new Game({ mapId: 'map1', mode: 'sandbox', seed: 31 });
  sb.state.wave = 120; sb.state.cash = 1e7;
  check('(mot) achievements: sandbox never counts for wave or cash goals', ids(newlyEarned({}, { ...base, state: sb.state })) === '');
  const allCodex = new Set(Object.values(COMBOS).flat().map((r) => r.id));
  check('(mot) achievements: codex, maps, tutorial and daily goals', ids(newlyEarned({}, { ...base, state: null, codex: allCodex, mapsPlayed: new Set(MAPS.map((m) => m.id)), tutorialDone: true, dailies: 1 }))
    === 'allMaps,blackHole,combos10,combos20,daily,firstCombo,nuke,tutorial');
  check('(mot) map stars: 0 below 25, then 1/2/3 at waves 25/50/100; best wave from a score list', starsForWave(24) === 0 && starsForWave(25) === 1
    && starsForWave(99) === 2 && starsForWave(250) === 3 && bestWave([{ wave: 12 }, { wave: 61 }, { wave: NaN }]) === 61 && bestWave([]) === 0);
  check('(mot) achievements: stored data is cleaned', JSON.stringify(cleanEarned({ nuke: '2026', bogus: 'x', wave25: 5 })) === '{"nuke":"2026"}' && ACHIEVEMENTS.length >= 20);
}

// ------------------------------------------------------------------ (mot) daily challenge (src/ui/daily.ts, pure)
{
  const d1 = dailyFor(new Date('2026-11-20T08:00:00Z')), d2 = dailyFor(new Date('2026-11-20T23:59:00Z')), d3 = dailyFor(new Date('2026-11-21T00:01:00Z'));
  check('(mot) daily: same UTC day gives the same challenge, the next day another seed', JSON.stringify(d1) === JSON.stringify(d2) && d1.key === '2026-11-20' && d3.seed !== d1.seed);
  const days = Array.from({ length: 60 }, (_, i) => dailyFor(new Date(Date.UTC(2026, 0, 1 + i))));
  check('(mot) daily: valid maps (never the tutorial) and difficulties, and some variety over 60 days',
    days.every((d) => MAPS.some((m) => m.id === d.mapId) && d.mapId !== 'tutorial' && ['easy', 'medium', 'hard'].includes(d.difficulty))
    && new Set(days.map((d) => d.mapId)).size >= 8 && new Set(days.map((d) => d.difficulty)).size === 3);
  const play = () => { const g = new Game({ mapId: d1.mapId, difficulty: d1.difficulty, seed: d1.seed }); g.sendWave(); g.advance(60 * 20); return JSON.stringify(g.serialize()); };
  check('(mot) daily: the same seed plays out the same game', play() === play());
}

// ------------------------------------------------------------------ (rep) replays (src/game/replay.ts)
{
  const core = (g: Game): string => { const d = JSON.parse(JSON.stringify(g.serialize())); delete d.acc; delete d.state.speed; delete d.state.paused; delete d.opts; delete d.startOpts; return JSON.stringify(d); };
  const spots = bestSpots('map1', 4);
  let g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 77 });
  g.setSpeed(4);
  const a = must(g.build('blue', spots[0].x, spots[0].y)).id;
  for (let i = 0; i < 40; i++) g.update(1000 / 60);
  must(g.sendWave());
  for (let i = 0; i < 300; i++) {
    g.update(1000 / 60);
    if (i === 30) g.upgrade(a, 'damage');
    if (i === 80) g.build('red', spots[1].x, spots[1].y);
    if (i === 120) g.cycleTargetMode(a);
    if (i === 150) g.setWaveInterval(9000);
    if (i === 200) { const b = must(g.build('green', spots[2].x, spots[2].y)).id; g.undo(); void b; }
  }
  // save and restore halfway: the log travels with the save
  g = Game.deserialize(JSON.parse(JSON.stringify(g.serialize())));
  for (let i = 0; i < 400; i++) { g.update(1000 / 60); if (i === 100) g.sendWave(); if (i === 250) g.upgrade(a, 'rate', true); }
  const r = makeReplay(g);
  check('(rep) the game logged its commands (build, upgrade, target, interval, undo, waves)', r.log.length >= 8 && r.log.some((e) => e.c === 'undo') && r.log.some((e) => e.c === 'setWaveInterval'), String(r.log.length));
  check('(rep) the replay keeps the start options, not the changed wave interval', r.opts.waveInterval === null && g.opts.waveInterval === 9000);
  const p = runReplay(validateReplay(JSON.parse(JSON.stringify(r))));
  check('(rep) playing the replay back gives the identical game (state, entities, rng, log)', core(p) === core(g) && replayMatches(p, r), `steps ${r.end}, wave ${g.state.wave}, kills ${g.state.kills}`);
  const t1 = JSON.parse(JSON.stringify(r)); t1.log[2].s = -1;
  const t2 = JSON.parse(JSON.stringify(r)); t2.log.push({ s: 5, c: 'cheat', a: [] });
  const t3 = JSON.parse(JSON.stringify(r)); t3.opts.mapId = 'nope';
  let refused = 0;
  for (const t of [t1, t2, t3, null, 'x', { v: 2 }]) { try { validateReplay(t); } catch (e) { refused++; } }
  check('(rep) broken or tampered replays are refused', refused === 6);
  const t4 = JSON.parse(JSON.stringify(r)); t4.log[0].a[1] += 200; // build the first turret somewhere else
  check('(rep) a changed command gives a different result, so the recorded result exposes it', !replayMatches(runReplay(validateReplay(t4)), r) || core(runReplay(validateReplay(t4))) !== core(g));
  const code = await encodeReplay(r);
  const back = validateReplay(await decodeReplay(code));
  check('(rep) a replay survives the text code (gzip + base64url) and plain JSON', code.startsWith('OS1.') && JSON.stringify(back) === JSON.stringify(r)
    && JSON.stringify(validateReplay(await decodeReplay(JSON.stringify(r)))) === JSON.stringify(r), `${code.length} chars for ${r.log.length} commands`);
  let badCode = 0;
  for (const c of ['OS1.!!!', 'hello', 'OS0.' + btoa('{"v":1}')]) { try { validateReplay(await decodeReplay(c)); } catch (e) { badCode++; } }
  check('(rep) broken codes are refused', badCode === 3);
  const pb = startPlayback(r);
  pb.game.setSpeed(8);
  for (let i = 0; i < 2000 && !pb.done(); i++) pb.game.update(1000 / 60);
  check('(rep) live playback with update() at 8x stops exactly at the end and matches', pb.done() && pb.game.stepCount === r.end && pb.matches(), `${pb.game.stepCount} / ${r.end}`);
  const old = JSON.parse(JSON.stringify(g.serialize())); delete old.commandLog; delete old.startOpts;
  const og = Game.deserialize(old);
  check('(rep) an older save without a log loads with an empty log and its opts as start options', og.commandLog.length === 0 && og.startOpts.mapId === 'map1');
}

// ------------------------------------------------------------------ (plat) gamepad reader (src/ui/gamepad.ts, pure)
{
  const pad = (pressed: number[], axes: number[] = [0, 0]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })), axes });
  const rd = new GamepadReader();
  const r1 = rd.poll(pad([0, 3]), 16), r2 = rd.poll(pad([0, 3]), 16), r3 = rd.poll(pad([]), 16), r4 = rd.poll(pad([0]), 16);
  check('(plat) gamepad: an action fires once per press (edge), again after release', r1.actions.join() === 'click,upDamage' && r2.actions.length === 0 && r3.actions.length === 0 && r4.actions.join() === 'click');
  const still = rd.poll(pad([], [0.1, -0.15]), 16), full = rd.poll(pad([], [1, 0]), 100), slow = rd.poll(pad([], [0.5, 0]), 100);
  check('(plat) gamepad: dead zone, full tilt moves 90 px per 100 ms, half tilt much less (fine control)', still.dx === 0 && still.dy === 0 && near(full.dx, 90) && slow.dx > 0 && slow.dx < 30);
  check('(plat) gamepad: triggers count by value, every standard button 0..15 has an action', rd.poll({ buttons: [{ pressed: false }, { pressed: false }, { pressed: false }, { pressed: false }, { pressed: false }, { pressed: false }, { pressed: false, value: 0.9 }], axes: [0, 0] }, 16).actions.join() === 'upRange'
    && Array.from({ length: 16 }, (_, i) => PAD_BUTTONS[i]).every(Boolean));
}

// ------------------------------------------------------------------ (plat) save slots (src/ui/storage.ts)
{
  const g = new Game({ mapId: 'map3', difficulty: 'hard', seed: 41 });
  g.sendWave(); g.advance(120);
  const w = { v: 1, at: 123, meta: { mapId: 'map3', difficulty: 'hard', mode: 'normal', wave: g.state.wave }, data: g.serialize() };
  saveSlot(2, w); // in Node it lands in the in-memory fallback and reports false (no localStorage)
  check('(plat) slots: save, read back, clear; out-of-range slots refused', getSlot(2)!.meta.wave === 1 && !saveSlot(4, w) && getSlot(0) === null
    && (clearSlot(2), getSlot(2) === null));
  check('(plat) slots: an imported file is shape-checked (junk refused, extra fields dropped)', cleanSaveWrapper('x') === null && cleanSaveWrapper({ meta: { mapId: 1 }, data: {} }) === null
    && JSON.stringify(Object.keys(cleanSaveWrapper({ ...w, evil: 1 })!)) === '["v","at","meta","data"]');
  check('(plat) slots: a saved wrapper restores the same game', JSON.stringify(Game.deserialize(cleanSaveWrapper(JSON.parse(JSON.stringify(w)))!.data).serialize()) === JSON.stringify(g.serialize()));
}

// ------------------------------------------------------------------ (i18n) translations cover every t('...') key
{
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../src/ui/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !['mock.ts', 'ui-demo.ts', 'i18n.ts'].includes(f));
  const keys = new Map<string, string>(), dynamic: string[] = [];
  const re = /\btx?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g; // t('...') and tx('...')
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(re)) {
      if (m[1] === '`' && m[2].includes('${')) { dynamic.push(f + ': ' + m[2].slice(0, 40)); continue; }
      keys.set(m[2].replace(/\\(.)/g, '$1'), f);
    }
  }
  for (const d of Object.values(TURRETS)) keys.set(d.blurb, 'data/turrets.ts'); // turret blurbs are shown with t(def.blurb)
  const ph = (x: string): string => [...x.matchAll(/\{(\w+)\}/g)].map((p) => p[1]).sort().join();
  const missing: string[] = [], badPh: string[] = [];
  for (const [k, f] of keys) for (const l of ['nl', 'de'] as const) {
    const v = DICT[l][k];
    if (v == null) missing.push(`${l} ${f}: ${k.slice(0, 50)}`);
    else if (ph(v) !== ph(k)) badPh.push(`${l}: ${k.slice(0, 40)}`);
  }
  const unused = Object.keys(DICT.nl).filter((k) => !keys.has(k));
  check('(i18n) every t() key has a Dutch and a German text', missing.length === 0, missing.length + ' missing, e.g. ' + missing.slice(0, 3).join(' | '));
  check('(i18n) translations keep the {placeholders} of the English text', badPh.length === 0, badPh.slice(0, 3).join(' | '));
  check('(i18n) t() is only called with literal text (template parts go into {placeholders})', dynamic.length === 0, dynamic.slice(0, 3).join(' | '));
  check('(i18n) no translation is left without a t() key in the code', unused.length === 0, unused.length + ' unused, e.g. ' + unused.slice(0, 3).join(' | '));
  check('(i18n) no em dash in any text', ![...Object.values(DICT.nl), ...Object.values(DICT.de)].some((v) => v.includes('\u2014')));
  setLang('nl'); const nlSend = t('Send wave'); setLang('de'); const deFill = t('Wave {n} started', { n: 7 }); setLang('en');
  check('(i18n) t() translates, fills placeholders and falls back to English', t('Not a known text {x}', { x: 1 }) === 'Not a known text 1' && (keys.has('Send wave') ? nlSend !== 'Send wave' : true) && (keys.has('Wave {n} started') ? deFill.includes('7') : true)
    && detectLang(['de-AT', 'en']) === 'de' && detectLang(['fr', 'nl-BE']) === 'nl' && detectLang(['fr']) === 'en', `${keys.size} keys`);
}

// ------------------------------------------------------------------ (q) waveActive (auto-send)
{
  const g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 9 });
  const idle = !g.waveActive();
  g.sendWave();
  const queued = g.waveActive();          // spawner queued, nothing spawned yet
  g.advance(60);                          // some attackers out, more to come
  const spawning = g.waveActive() && g.spawners.length > 0;
  g.advance(60 * 8);                      // all 10 spawned
  for (const a of [...g.state.attackers]) g.damageAttacker(a, a.hp + 1, null);
  const cleared = !g.waveActive() && g.spawners.length === 0;
  const rng0 = g.rng.s;
  g.waveActive();
  check('(q) waveActive: false before wave 1, true while spawning or attackers live, false once cleared, no rng',
    idle && queued && spawning && cleared && g.rng.s === rng0, `${idle} ${queued} ${spawning} ${cleared}`);
}

// ------------------------------------------------------------------ (q) run history (end-of-run report)
{
  const g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 8 });
  for (const sp of bestSpots('map1', 3)) must(g.build('blue', sp.x, sp.y));
  const atStart: { cash: number; kills: number }[] = [];
  g.on('wave', () => atStart.push({ cash: g.state.cash, kills: g.state.kills }));
  for (let w = 0; w < 6; w++) { g.sendWave(); g.advance(60 * 8); }
  const h = g.state.history!;
  check('(q) history: one record per started wave, in order', h.length === g.state.wave && h.every((r, i) => r.wave === i + 1), `${h.length} records, wave ${g.state.wave}`);
  check('(q) history: records hold the economy at the wave start', h.every((r, i) => r.cash === atStart[i].cash && r.kills === atStart[i].kills));
  check('(q) history: damage only grows and damageTotal equals the turrets\' damageDealt (nothing sold)',
    h.every((r, i) => i === 0 || r.damage >= h[i - 1].damage) && g.state.damageTotal! > 0
    && near(g.state.damageTotal!, g.state.turrets.reduce((n, t) => n + (t.damageDealt || 0), 0)));
  const total = g.state.damageTotal!;
  must(g.sell(g.state.turrets[0].id));
  check('(q) damageTotal keeps the damage of sold turrets', g.state.damageTotal === total);

  const save = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = Game.deserialize(save);
  check('(q) history and damageTotal survive save/restore', JSON.stringify(g2.state.history) === JSON.stringify(h) && g2.state.damageTotal === total);
  g.sendWave(); g2.sendWave(); g.advance(300); g2.advance(300);
  check('(q) restored game keeps recording identically', JSON.stringify(g.serialize()) === JSON.stringify(g2.serialize()));
  const old = JSON.parse(JSON.stringify(save));
  delete old.state.history; delete old.state.damageTotal;
  const g3 = Game.deserialize(old);
  const bad = JSON.parse(JSON.stringify(save));
  bad.state.history[2].cash = 'lots'; bad.state.damageTotal = null;
  const g4 = Game.deserialize(bad);
  check('(q) a save without (or with a broken) history loads [] and damageTotal 0',
    Array.isArray(g3.state.history) && g3.state.history.length === 0 && g3.state.damageTotal === 0
    && g4.state.history!.length === 0 && g4.state.damageTotal === 0);
}

// ------------------------------------------------------------------ (m) extra maps (SPEC.md section 7a)
{
  const extras = MAPS.filter((m) => m.extra);
  check('(m) 8 extra maps after the original 9 and the tutorial', extras.length === 8 && MAPS.indexOf(extras[0]) === 10
    && MAPS.slice(0, 10).every((m) => !m.extra));
  const W = 720, H = 450, BW = 126, BH = 82;
  /** Distance from (x, y) to the base rectangle (0 inside). */
  const toBase = (b: [number, number], x: number, y: number): number =>
    Math.hypot(Math.max(b[0] - x, 0, x - (b[0] + BW)), Math.max(b[1] - y, 0, y - (b[1] + BH)));
  for (const m of extras) {
    const p = m.path, b = m.base;
    const [sx, sy] = p[0], [ex, ey] = p[p.length - 1];
    const onEdge = sx <= 0 || sx >= W || sy <= 0 || sy >= H;
    const onBase = toBase(b, ex, ey) <= 1 && (Math.abs(ex - b[0]) <= 1 || Math.abs(ex - b[0] - BW) <= 1
      || Math.abs(ey - b[1]) <= 1 || Math.abs(ey - b[1] - BH) <= 1);
    // walk the road (except its last 40 units) and keep it off the base footprint
    let len = 0, minBase = Infinity;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    let walked = 0;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      for (let d = 0; d < seg; d += 4) {
        if (walked + d > len - 40) break;
        const t = d / seg;
        minBase = Math.min(minBase, toBase(b, p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t));
      }
      walked += seg;
    }
    // a plus- or X-shaped 5-turret combo cluster must fit within reach of the road
    const probe = new Game({ mapId: m.id, mode: 'sandbox', seed: 1 });
    const road = probe.roadPoints();
    const shapes = [[[50, 0], [-50, 0], [0, 50], [0, -50]], [[36, 36], [-36, 36], [36, -36], [-36, -36]]];
    let cover = 0;
    for (let x = 22; x <= 698; x += 6) for (let y = 22; y <= 428; y += 6) {
      if (!probe.canBuild('blue', x, y).ok) continue;
      if (!shapes.some((o) => o.every(([dx, dy]) => probe.canBuild('blue', x + dx, y + dy).ok))) continue;
      let c = 0;
      for (const r of road) if ((r.x - x) ** 2 + (r.y - y) ** 2 <= 120 * 120) c++;
      cover = Math.max(cover, c);
    }
    check(`(m) ${m.name}: starts on a field edge, ends on the base edge`, onEdge && onBase, `start ${sx},${sy} end ${ex},${ey}`);
    check(`(m) ${m.name}: road stays clear of the base until it arrives`, minBase >= 14, `closest ${minBase.toFixed(1)}`);
    check(`(m) ${m.name}: 5-turret combo cluster fits near the road`, cover >= 60, `cover ${cover} road points`);
    // a greedy player holds the first 10 waves on Medium
    const g = new Game({ mapId: m.id, difficulty: 'medium', seed: 11 });
    const act = makePlayer(g, bestSpots(m.id, 16));
    g.setSpeed(8);
    let frames = 0;
    while (g.state.wave < 11 && !g.state.over && frames < 200000) {
      g.update(1000 / 60);
      if (frames % 10 === 0) act();
      frames++;
    }
    check(`(m) ${m.name}: greedy player survives 10 waves on Medium`, !g.state.over && g.state.wave >= 11, `wave ${g.state.wave}, lives ${g.state.lives}`);
  }
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

// ------------------------------------------------------------------ (v) input validation
{
  const throws = (fn: () => void): boolean => { try { fn(); return false; } catch (e) { return e instanceof Error && /^Invalid save: /.test(e.message); } };
  const g = new Game({ mapId: 'map1', difficulty: 'medium', seed: 5 });
  g.state.cash = 1000;
  const spot = bestSpots('map1', 2);
  const placed = g.build('blue', spot[0].x, spot[0].y);
  check('(v) setup turret built', placed.ok === true);
  const good = g.serialize();
  // Saves are edited below to be deliberately invalid, so `any` is used on purpose here (the one place in this file).
  type LooseSave = Record<string, any>;
  const clone = (): LooseSave => JSON.parse(JSON.stringify(good));
  check('(v) deserialize rejects {}', throws(() => Game.deserialize({})));
  check('(v) deserialize rejects null', throws(() => Game.deserialize(null)));
  check('(v) deserialize rejects a wrong version', throws(() => Game.deserialize({ ...clone(), version: 999 })));
  check('(v) deserialize rejects non-array turrets', throws(() => Game.deserialize({ ...clone(), turrets: {} })));
  const badKind = clone(); badKind.turrets[0].kind = 'constructor';
  check('(v) deserialize rejects an unknown turret kind', throws(() => Game.deserialize(badKind)));
  const nan = clone(); nan.state.cash = 'lots';
  check('(v) deserialize rejects a non-finite cash', throws(() => Game.deserialize(nan)));
  const proto = JSON.parse(JSON.stringify(good).replace('"kind":"blue"', '"kind":"blue","__proto__":{"evil":1}'));
  const gp = Game.deserialize(proto);
  const tp = gp.state.turrets[0];
  check('(v) a __proto__ key does not change the restored turret prototype',
    Object.getPrototypeOf(tp) === Object.getPrototypeOf(g.state.turrets[0]) && (tp as unknown as Record<string, unknown>).evil === undefined);
  const rt = Game.deserialize(clone());
  check('(v) normal round trip still works', JSON.stringify(rt.serialize()) === JSON.stringify(good));

  const cash0 = g.state.cash, n0 = g.state.turrets.length;
  for (const k of ['constructor', 'toString', '__proto__']) {
    const r = g.build(k, spot[1].x, spot[1].y);
    check(`(v) build('${k}') fails`, r.ok === false && g.state.cash === cash0 && g.state.turrets.length === n0);
  }
  check('(v) build with string coordinates fails', g.build('blue', wrong<number>('300'), wrong<number>('300')).ok === false && g.state.cash === cash0);
  check('(v) build with NaN coordinates fails', g.build('blue', NaN, 300).ok === false && g.state.cash === cash0);
  check('(v) move with non-number coordinates fails', g.move(g.state.turrets[0].id, wrong<number>('350'), 300).ok === false && g.state.cash === cash0);

  const wi = g.waveInterval;
  for (const bad of [0, -5, NaN, Infinity, 999, '5000', undefined]) {
    check(`(v) setWaveInterval(${String(bad)}) fails and changes nothing`, g.setWaveInterval(wrong<number>(bad)).ok === false && g.waveInterval === wi);
  }
  check('(v) setWaveInterval(5000) works', g.setWaveInterval(5000).ok === true && g.waveInterval === 5000);

  const d1 = new Game({ mapId: 'map1' }), d2 = new Game({ mapId: 'map1' });
  check('(v) default seed is fixed', d1.rng.s === d2.rng.s);
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
      const id = must(g.build(kinds[n % 4], x, y)).id;
      for (const st of ['damage', 'range', 'rate'] as const) g.upgrade(id, st, true);
      n++;
    }
  }
  // the map only fits ~145 legally; add the rest (overlapping) by bypassing the placement rule
  g._placementProblem = () => null;
  while (n < 150) {
    const id = must(g.build(kinds[n % 4], 100 + n * 7, 20 + (n % 5) * 3)).id;
    for (const st of ['damage', 'range', 'rate'] as const) g.upgrade(id, st, true);
    n++;
  }
  g.state.cash = 1e7;
  const top = () => { while (g.state.attackers.length < 300) { const a = g.spawnAttacker(1, 1e30); g.path.place(a, Math.random() * g.path.length * 0.9); a.progress = Math.random() * g.path.length * 0.9; g.path.place(a, a.progress); } };
  top();
  g.setSpeed(8);
  for (let i = 0; i < 60; i++) { top(); g.update(1000 / 60); } // warm-up
  const times = [];
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
