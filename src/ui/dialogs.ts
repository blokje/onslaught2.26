// Content builders for modal dialogs: settings, how to play, high scores, game over, in-game menu.
import { h } from './dom.ts';
import { MAPS } from '../data/maps.ts';
import { DIFFICULTIES, MODES } from '../data/rules.ts';
import { formatNum } from './format.ts';
import { TURRETS, FREAKOUT } from '../data/turrets.ts';
import * as storage from './storage.ts';
import type { App, GameOverInfo, ScoreHighlight } from './App.ts';

const kbd = (t: string): HTMLElement => h('span', { class: 'os-kbd' }, t);

// ---------------- Settings ----------------
export function buildSettings(app: App): HTMLElement {
  const s = app.settings;
  const vol = h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(s.volume * 100), 'aria-label': 'Master volume' });
  vol.addEventListener('input', () => app.updateSettings({ volume: Number(vol.value) / 100 }));
  vol.addEventListener('change', () => app.audio.play('click'));
  const mute = h('input', { type: 'checkbox' });
  mute.checked = !!s.muted;
  mute.addEventListener('change', () => app.updateSettings({ muted: mute.checked }));
  const wave = h('input', { type: 'number', min: 0, max: 300, step: 1, value: s.waveInterval || 0 });
  wave.addEventListener('change', () => {
    const v = Math.max(0, Math.min(300, Math.round(Number(wave.value) || 0)));
    wave.value = String(v);
    app.updateSettings({ waveInterval: v });
  });
  const check = (key: 'snap' | 'unlockAll' | 'showFps' | 'autoPause'): HTMLInputElement => {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!s[key];
    c.addEventListener('change', () => app.updateSettings({ [key]: c.checked } as Partial<storage.Settings>)); // key is one of the four boolean settings
    return c;
  };
  const field = (label: string, sub: string | null, control: HTMLElement): HTMLElement => h(control && control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'checkbox' ? 'label' : 'div', { class: 'os-field' }, h('div', { class: 'os-lab' }, label, sub ? h('small', null, sub) : null), control);

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
    field('Mute', null, mute),
    field('Wave interval (seconds)', '0 = difficulty default. Applies to new games.', wave),
    field('Snap to grid', 'Snaps placement to a 22 unit grid.', check('snap')),
    field('Unlock all', 'All turrets, difficulties and modes. Applies to new games.', check('unlockAll')),
    field('Show FPS counter', null, check('showFps')),
    field('Pause when tab is hidden', 'Resumes automatically when you come back.', check('autoPause')),
    field('Saved progress', 'Unlocks, high scores and the autosave.', resetBtn));
}

// ---------------- How to play ----------------
export function buildHelp(): HTMLElement {
  const row = (k: string, text: string): HTMLElement[] => [kbd(k), h('span', null, text)];
  const keys = h('div', { class: 'os-keys' },
    row('1-8', 'Pick a turret (hold Shift for the second row of eight)'),
    row('Click', 'Build, select a turret, or pick a target'),
    row('Shift+Click', 'Build and stay in build mode'),
    row('Esc / Right', 'Cancel the current action'),
    row('Q W E', 'Upgrade damage, range, rate (Shift = as far as you can afford)'),
    row('S', 'Sell the selected turret for 70%'),
    row('M', 'Move it ($500), then click the new spot'),
    row('T', 'Cycle targeting mode'),
    row('L', 'Lock onto the current target'),
    row('F', 'Focus fire: press, then click an attacker'),
    row('D / Shift+D', 'Cycle the firing cone / aim the cone at the cursor'),
    row('J', 'Targeter: join to a turret'),
    row('X', 'Combo-only: cycle its colour'),
    row('R / C', 'Range rings / combo partners display'),
    row('Space', 'Send the next wave early (earns a bonus)'),
    row('P / I / G', 'Pause / info panel / settings'),
    row('Drag panel header', 'Move the turret panel, double-click or double-tap to put it back'),
    row('Left, Right', 'Walk along the build rack, B or Enter builds at the cursor'),
    row('Wheel, drag', 'Zoom, and pan with the right or middle button'));
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
    h('p', null, 'When turrets with fully upgraded damage stand close together (within 70 units), the one that fires first leads and the others join in. The mix of colours decides the result: nukes, cluster bombs, landmines, plasma balls, a black hole and more. Partners go on cooldown, so combos trade steady fire for one big hit. Press C to see who is in range of the selected turret.'),
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
        return h('tr', { class: me ? 'me' : '' }, h('td', null, i + 1), h('td', null, formatNum(e.score)), h('td', null, formatNum(e.kills)), h('td', null, e.wave), h('td', null, date));
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
    h('p', { class: 'os-hint', style: 'text-align:center;font-size:.95em;margin:.7em 0 0' }, rankText));
}
