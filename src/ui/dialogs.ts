// Content builders for modal dialogs: settings, how to play, high scores, game over, in-game menu.
import { h } from './dom.ts';
import { MAPS } from '../data/maps.ts';
import { DIFFICULTIES, MODES } from '../data/rules.ts';
import { formatNum } from './format.ts';
import { TURRETS, FREAKOUT } from '../data/turrets.ts';
import * as storage from './storage.ts';
import type { App, GameOverInfo, RunReport, ScoreHighlight } from './App.ts';
import { iconSvg } from './icons.ts';
import { KEY_ACTIONS, FIXED_KEYS, RESERVED_CODES, keyLabel, rebind, resolveBindings } from './keymap.ts';
import type { KeyAction } from './keymap.ts';
import { PAD_HELP } from './gamepad.ts';

const kbd = (t: string): HTMLElement => h('span', { class: 'os-kbd' }, t);

// ---------------- Settings ----------------
export function buildSettings(app: App): HTMLElement {
  const s = app.settings;
  const vol = h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(s.volume * 100), 'aria-label': 'Master volume' });
  vol.addEventListener('input', () => app.updateSettings({ volume: Number(vol.value) / 100 }));
  vol.addEventListener('change', () => app.audio.play('click'));
  const busSlider = (key: 'sfxVolume' | 'uiVolume' | 'musicVolume', label: string): HTMLInputElement => {
    const el = h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(s[key] * 100), 'aria-label': label });
    el.addEventListener('input', () => app.updateSettings({ [key]: Number(el.value) / 100 } as Partial<storage.Settings>)); // key is one of the two bus volumes
    el.addEventListener('change', () => { if (key !== 'musicVolume') app.audio.play(key === 'uiVolume' ? 'click' : 'shot_cannon'); });
    return el;
  };
  const mute = h('input', { type: 'checkbox' });
  mute.checked = !!s.muted;
  mute.addEventListener('change', () => app.updateSettings({ muted: mute.checked }));
  const wave = h('input', { type: 'number', min: 0, max: 300, step: 1, value: s.waveInterval || 0 });
  wave.addEventListener('change', () => {
    const v = Math.max(0, Math.min(300, Math.round(Number(wave.value) || 0)));
    wave.value = String(v);
    app.updateSettings({ waveInterval: v });
  });
  const check = (key: 'snap' | 'unlockAll' | 'showFps' | 'autoPause' | 'autoSend' | 'undo' | 'colorSymbols' | 'highContrast' | 'reduceMotion' | 'hints' | 'screenShake'): HTMLInputElement => {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!s[key];
    c.addEventListener('change', () => app.updateSettings({ [key]: c.checked } as Partial<storage.Settings>)); // key is one of the boolean settings above
    return c;
  };
  const field = (label: string, sub: string | null, control: HTMLElement): HTMLElement => h(control && control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'checkbox' ? 'label' : 'div', { class: 'os-field' }, h('div', { class: 'os-lab' }, label, sub ? h('small', null, sub) : null), control);

  const scale = h('input', { type: 'range', min: storage.UI_SCALE.min, max: storage.UI_SCALE.max, step: storage.UI_SCALE.step, value: s.uiScale, 'aria-label': 'Interface size' });
  const scaleTxt = h('span', { class: 'os-hint' }, Math.round(s.uiScale * 100) + '%');
  scale.addEventListener('input', () => { const v = storage.clampScale(Number(scale.value)); scaleTxt.textContent = Math.round(v * 100) + '%'; app.updateSettings({ uiScale: v }); });
  const resetTipsBtn = h('button', { class: 'os-btn small', type: 'button' }, 'Reset tips');
  resetTipsBtn.addEventListener('click', () => { app.resetTips(); resetTipsBtn.textContent = 'Tips reset'; });
  const tutBtn = h('button', { class: 'os-btn small', type: 'button' }, 'Replay tutorial');
  tutBtn.addEventListener('click', () => app.startTutorial());
  const keysBtn = h('button', { class: 'os-btn small', type: 'button' }, 'Keys...');
  keysBtn.addEventListener('click', () => app.openKeys());

  let resetStep = 0;
  const resetBtn = h('button', { class: 'os-btn danger small', type: 'button' }, 'Reset progress');
  resetBtn.addEventListener('click', () => {
    if (resetStep === 0) {
      resetStep = 1;
      resetBtn.textContent = 'Really reset? Click again';
      setTimeout(() => { resetStep = 0; resetBtn.textContent = 'Reset progress'; }, 4000);
    } else {
      resetStep = 0;
      app.resetProgress();
      resetBtn.textContent = 'Progress reset';
    }
  });

  return h('div', null,
    field('Master volume', null, h('div', { style: 'display:flex;align-items:center;gap:.6em' }, vol)),
    field('Game effects volume', 'Shots, explosions, combos, alarms.', busSlider('sfxVolume', 'Game effects volume')),
    field('Music volume', 'Synthesized music that follows the pressure of the game. 0 turns it off.', busSlider('musicVolume', 'Music volume')),
    field('Interface volume', 'Clicks, build, upgrade, sell, errors.', busSlider('uiVolume', 'Interface volume')),
    field('Mute', null, mute),
    field('Wave interval (seconds)', '0 = difficulty default. Applies to new games.', wave),
    field('Snap to grid', 'Snaps placement to a 22 unit grid.', check('snap')),
    field('Unlock all', 'All turrets, difficulties and modes. Applies to new games.', check('unlockAll')),
    field('Show FPS counter', null, check('showFps')),
    field('Pause when tab is hidden', 'Resumes automatically when you come back.', check('autoPause')),
    field('Auto-send waves', 'Sends the next wave (with the early bonus) as soon as the field is clear, from wave 1 on.', check('autoSend')),
    field('Relaxed: undo', 'U takes back your last build or upgrade with a full refund, until that turret fires. High scores of such games get a U mark.', check('undo')),
    field('Controls', 'See and change the keyboard keys (also the ? key).', keysBtn),
    field('Tutorial', 'Play the interactive tutorial again on the How to Play map.', tutBtn),
    field('Tips', 'Short tips the first time something happens (a leak, your first combo, a new unlock).', check('hints')),
    field('Seen tips', 'Show every tip again.', resetTipsBtn),
    h('h3', { class: 'os-set-h' }, 'Accessibility'),
    field('Interface size', 'Scales all text, panels and buttons.', h('div', { style: 'display:flex;align-items:center;gap:.6em' }, scale, scaleTxt)),
    field('High contrast', 'Solid panels, brighter text and stronger outlines.', check('highContrast')),
    field('Screen shake', 'The view shakes a little on big explosions. Always off with Reduce motion.', check('screenShake')),
    field('Reduce motion and flashes', 'No blinking, pulsing or shaking; dimmer explosions. Starts on when your system asks for less motion.', check('reduceMotion')),
    field('Colour shapes on the map', 'Each turret shows the shape of its combo colour: red triangle, green circle, blue square, yellow diamond.', check('colorSymbols')),
    field('Saved progress', 'Unlocks, high scores, the autosave, Combo Codex counts and achievements.', resetBtn));
}

// ---------------- Controls (? key): overview and rebinding ----------------
export function buildKeys(app: App): HTMLElement {
  const root = h('div', { class: 'os-help os-keys-dlg' });
  let waiting: KeyAction | null = null;
  let note = '';
  const render = (): void => {
    const bind = resolveBindings(app.settings.keys);
    const groups = new Map<string, HTMLElement>();
    for (const a of KEY_ACTIONS) {
      let g = groups.get(a.group);
      if (!g) { g = h('div', { class: 'os-keys' }); groups.set(a.group, g); }
      const isWaiting = waiting === a.id;
      const btn = h('button', { class: 'os-btn small os-keybtn' + (isWaiting ? ' is-on' : ''), type: 'button', title: 'Click, then press the new key' },
        isWaiting ? 'Press a key...' : keyLabel(bind[a.id]));
      btn.addEventListener('click', () => { waiting = isWaiting ? null : a.id; note = ''; capture(); render(); });
      g.append(btn, h('span', null, a.label + (a.code !== bind[a.id] ? ' (default ' + keyLabel(a.code) + ')' : '')));
    }
    const fixed = h('div', { class: 'os-keys' }, ...FIXED_KEYS.flatMap(([k, t]) => [kbd(k), h('span', null, t)]));
    const reset = h('button', { class: 'os-btn small', type: 'button' }, 'Reset all keys');
    reset.disabled = Object.keys(app.settings.keys).length === 0;
    reset.addEventListener('click', () => { waiting = null; note = 'Keys reset to the defaults.'; capture(); app.updateSettings({ keys: {} }); render(); });
    const kids: HTMLElement[] = [h('p', { class: 'os-hint' }, 'Click a key to change it, then press the new key (Esc cancels). Taking a key that is already used swaps the two.')];
    for (const [name, g] of groups) kids.push(h('h3', null, name), g);
    const pad = h('div', { class: 'os-keys' }, ...PAD_HELP.flatMap(([k, t]) => [kbd(k), h('span', null, t)]));
    kids.push(h('h3', null, 'Fixed'), fixed, h('h3', null, 'Gamepad'), pad, h('div', { class: 'os-keys-foot' }, reset, h('span', { class: 'os-hint' }, note)));
    root.replaceChildren(...kids);
  };
  /** Route the next keydown here while a row waits for its new key. */
  const capture = (): void => {
    app.keyCapture = waiting == null ? null : (e: KeyboardEvent) => {
      const action = waiting!;
      waiting = null;
      app.keyCapture = null;
      if (e.code === 'Escape') note = '';
      else if (!e.code || RESERVED_CODES.has(e.code)) note = keyLabel(e.code || e.key) + ' is reserved, pick another key.';
      else {
        app.updateSettings({ keys: rebind(app.settings.keys, action, e.code) });
        note = KEY_ACTIONS.find((a) => a.id === action)!.label.split(' (')[0] + ': ' + keyLabel(e.code) + '.';
      }
      render();
    };
  };
  render();
  return root;
}

// ---------------- How to play ----------------
export function buildHelp(app: App): HTMLElement {
  // generated from the keymap, so it always shows the player's current keys
  const bind = resolveBindings(app.settings.keys);
  const keys = h('div', { class: 'os-keys' },
    ...KEY_ACTIONS.flatMap((a) => [kbd(keyLabel(bind[a.id])), h('span', null, a.label)]),
    ...FIXED_KEYS.flatMap(([k, t]) => [kbd(k), h('span', null, t)]));
  return h('div', { class: 'os-help' },
    h('h3', null, 'Goal'),
    h('p', null, 'Waves of vehicles drive along the road toward your base. Every one that gets through costs a life. Spend cash on turrets, upgrade them, and stop the waves for as long as you can. Your score is total kills multiplied by total cash spent.'),
    h('h3', null, 'Turrets'),
    h('ul', null,
      h('li', null, 'Cannon (blue): cheap, fast shells, short reach.'),
      h('li', null, 'Laser (green): instant beam. If it kills an attacker, the leftover energy goes on through the next attackers in a straight line. Lasers near each other link up and pass beams along, each link adding extra damage.'),
      h('li', null, 'Rocket (red): homing rockets with the longest reach. Upgraded ones can keep rockets circling overhead.'),
      h('li', null, 'Tazer (yellow): its sparks slow attackers down. Great for buying other turrets more time.'),
      h('li', null, 'Cannons and Tazers with ' + TURRETS.blue.freakout!.damage + ' damage and ' + TURRETS.blue.freakout!.rate +
        ' rate upgrades sometimes freak out: a ' + FREAKOUT.warn / 1000 + ' s warning, then ' + FREAKOUT.length / 1000 + ' s of x' +
        (1 + FREAKOUT.damageMult) + ' damage and x' + (1 + FREAKOUT.rateMult) + ' fire rate.')),
    h('h3', null, 'Upgrades and modifiers'),
    h('p', null, 'Each turret has three upgrade ladders: damage, range and rate. Later steps cost a lot but pay off. Modifier turrets (Ranger, Boom, SpeedEx, RangerEx, Speed, BigBang, BigBangEx) do not shoot. They boost every turret whose centre lies inside their influence circle, and their effects stack. Some trade one stat for another.'),
    h('h3', null, 'Unlocks'),
    h('p', null, 'The four basic turrets are ready from the start. Modifiers and the extra weapons (Targeter, Sniper, Fusion, Railgun, Combo-only) unlock as your kill count grows during a game. Extreme difficulty unlocks after wave 100 on Medium, and Sandbox after wave 50 on any difficulty.'),
    h('h3', null, 'Combos'),
    h('p', null, 'When turrets with fully upgraded damage stand close together (within 70 units), the one that fires first leads and the others join in. The mix of colours decides the result (each colour also has a shape: red triangle, green circle, blue square, yellow diamond): nukes, cluster bombs, landmines, plasma balls, a black hole and more. Partners go on cooldown, so combos trade steady fire for one big hit. Press ' + keyLabel(bind.combo) + ' to see who is in range of the selected turret.'),
    h('h3', null, 'Targeting'),
    h('p', null, 'Turrets pick the nearest attacker by default. Change that per turret (nearest, furthest along the road, weakest, strongest, slowest, fastest), lock onto a target, restrict the firing cone, or order every turret in reach to focus on one attacker. A Targeter lends its position and range to the turret you join to it.'),
    h('h3', null, 'Controls'),
    keys);
}

// ---------------- High scores ----------------
export function buildScores(app: App, highlight?: ScoreHighlight): HTMLElement {
  const sel: Record<'mapId' | 'difficulty' | 'mode', string> = {
    mapId: highlight?.mapId || app.settings.lastMap || MAPS[0].id,
    difficulty: highlight?.difficulty || app.settings.lastDifficulty || 'medium',
    mode: highlight?.mode || app.settings.lastMode || 'normal',
  };
  const mkSelect = (opts: string[][], key: 'mapId' | 'difficulty' | 'mode'): HTMLSelectElement => {
    const el = h('select', null, ...opts.map(([v, t]) => h('option', { value: v }, t)));
    el.value = sel[key];
    el.addEventListener('change', () => { sel[key] = el.value; render(); });
    return el;
  };
  const maps = mkSelect(MAPS.map((m) => [m.id, m.name]), 'mapId');
  const diffs = mkSelect(Object.entries(DIFFICULTIES).map(([k, d]) => [k, d.name]), 'difficulty');
  const modes = mkSelect(Object.entries(MODES).map(([k, m]) => [k, m.name]), 'mode');
  const body = h('div');
  function render() {
    const list = storage.getScores(sel.mapId, sel.difficulty, sel.mode);
    if (!list.length) { body.replaceChildren(h('div', { class: 'os-empty' }, 'No scores yet for this combination.')); return; }
    const t = h('table', { class: 'os-table' },
      h('tr', null, ...['#', 'Score', 'Kills', 'Wave', 'Date'].map((x) => h('th', null, x))),
      ...list.map((e, i) => {
        const me = highlight && highlight.rank === i + 1 && highlight.mapId === sel.mapId && highlight.difficulty === sel.difficulty && highlight.mode === sel.mode;
        let date = '';
        try { date = new Date(e.date).toLocaleDateString(); } catch (err) { /* ignore */ }
        const score = h('td', null, formatNum(e.score), e.undo ? h('span', { class: 'os-undo-mark', title: 'This game used undo (relaxed rule)' }, ' U') : null);
        return h('tr', { class: me ? 'me' : '' }, h('td', null, i + 1), score, h('td', null, formatNum(e.kills)), h('td', null, e.wave), h('td', null, date));
      }));
    body.replaceChildren(t);
  }
  render();
  return h('div', null,
    h('div', { style: 'display:flex;gap:.5em;flex-wrap:wrap;margin-bottom:.6em' }, maps, diffs, modes), body);
}

// ---------------- Game over ----------------
export function buildGameOver(info: GameOverInfo): HTMLElement {
  const map = MAPS.find((m) => m.id === info.mapId);
  const rankText = info.rank > 0
    ? `New high score: rank ${info.rank} on ${map ? map.name : info.mapId}, ${DIFFICULTIES[info.difficulty]?.name || info.difficulty}${info.mode === 'sandbox' ? ' (Sandbox)' : ''}.`
    : (info.score > 0 ? 'Not in the top 10 for this map and difficulty.' : '');
  return h('div', null,
    h('div', { class: 'os-big-stats' },
      h('div', null, h('b', null, formatNum(info.score)), h('span', null, 'Score')),
      h('div', null, h('b', null, formatNum(info.kills)), h('span', null, 'Kills')),
      h('div', null, h('b', null, info.wave), h('span', null, 'Wave'))),
    h('p', { class: 'os-hint', style: 'text-align:center;font-size:.95em;margin:.7em 0 0' }, rankText),
    info.daily ? h('p', { class: 'os-hint', style: 'text-align:center;font-size:.95em;margin:.3em 0 0' },
      `Daily challenge ${info.daily.key}: ` + (info.daily.rank > 0 ? `rank ${info.daily.rank} of your runs today.` : 'not in your top 10 today.')) : null,
    info.report ? buildRunReport(info.report) : null);
}

/** Inline SVG sparkline of `values` (numbers only, so the markup is safe), scaled to its own maximum. */
function sparkline(values: number[], color: string): string {
  const W = 240, H = 44, pad = 3;
  const max = Math.max(1e-9, ...values);
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n > 1 ? pad + (i / (n - 1)) * (W - 2 * pad) : W / 2;
    const y = H - pad - (Math.max(0, v) / max) * (H - 2 * pad);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  const area = `${pad},${H - pad} ${pts.join(' ')} ${n > 1 ? W - pad : W / 2},${H - pad}`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`
    + `<polygon points="${area}" fill="${color}" fill-opacity="0.18"/>`
    + `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/** End-of-run report: per-wave charts, damage totals and the turrets that did the most damage. */
function buildRunReport(r: RunReport): HTMLElement {
  const hist = r.history;
  const charts = h('div', { class: 'os-report-charts' });
  if (hist.length >= 2) {
    const dmgPerWave = hist.map((x, i) => (i + 1 < hist.length ? hist[i + 1].damage : r.damageTotal) - x.damage);
    const rows: [string, number[], string, string][] = [
      ['Cash at wave start', hist.map((x) => x.cash), '#ffe08a', '$' + formatNum(Math.max(...hist.map((x) => x.cash))) + ' max'],
      ['Lives', hist.map((x) => x.lives), '#ff9d8f', hist[hist.length - 1].lives + ' at the last wave'],
      ['Damage per wave', dmgPerWave, '#b6e35a', formatNum(Math.max(...dmgPerWave)) + ' max'],
    ];
    for (const [label, values, color, note] of rows) {
      charts.append(h('div', { class: 'os-report-chart' },
        h('div', { class: 'os-report-l' }, h('span', null, label), h('b', null, note)),
        h('div', { class: 'os-spark', html: sparkline(values, color) })));
    }
  }
  const mins = Math.floor(r.time / 60000), secs = Math.floor((r.time % 60000) / 1000);
  const totals = h('div', { class: 'os-chips', style: 'justify-content:center' },
    h('span', { class: 'os-chip' }, 'Damage dealt: ' + formatNum(r.damageTotal)),
    h('span', { class: 'os-chip' }, 'Combos fired: ' + formatNum(r.combos)),
    h('span', { class: 'os-chip' }, `Game time: ${mins}:${String(secs).padStart(2, '0')}`));
  const top = r.top.length
    ? h('table', { class: 'os-table os-report-top' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Top turrets'), h('th', null, 'Damage'), h('th', null, 'Share'), h('th', null, 'Kills'))),
      h('tbody', null, ...r.top.map((t, i) => h('tr', i === 0 ? { class: 'mvp' } : null,
        h('td', null, h('span', { class: 'os-ico', html: iconSvg(t.kind) })),
        h('td', null, (TURRETS[t.kind] ? TURRETS[t.kind].name : t.kind) + (i === 0 ? ' (MVP)' : '')),
        h('td', null, formatNum(t.damage)),
        h('td', null, r.damageTotal > 0 ? Math.round((t.damage / r.damageTotal) * 100) + '%' : '-'),
        h('td', null, formatNum(t.kills))))))
    : null;
  return h('div', { class: 'os-report' }, totals, charts, top);
}
