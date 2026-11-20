// Interactive tutorial: a pure step machine (no DOM, tested in Node). The App feeds it game events and a context each
// tick; the Hud draws the current step in the coach card. It never sends game commands itself: the player does.
import { TURRETS } from '../data/turrets.ts';
import type { GameState, TurretState } from '../types.ts';
import type { KeyAction } from './keymap.ts';
import { t, tx } from './i18n.ts';

/** What a step can look at. `events` holds the event names seen since the step started. */
export interface TutorialCtx {
  state: GameState;
  events: ReadonlySet<string>;
  /** Kinds built since the step started. */
  built: readonly string[];
  /** Active tab of the turret panel, or null. */
  tab: string | null;
  /** True once the Combo Codex was opened since the step started. */
  codexOpened: boolean;
}

export interface TutorialStep {
  id: string;
  title: string;
  /** Text with the player's current keys (`key('upDamage')` -> "Q"). */
  text: (key: (a: KeyAction) => string) => string;
  /** CSS selector of the element to highlight, if any. */
  target?: string;
  /** Finished when this returns true; steps without it need the Next button. */
  done?: (c: TutorialCtx) => boolean;
}

const defaultTarget = (t: TurretState): string => TURRETS[t.kind]?.target || 'near';

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'welcome', title: tx('Welcome'),
    text: () => t('Attackers drive along the road to your base. Each one that gets through costs a life. Build turrets beside the road to stop them. No wave comes until you send it, so take your time.') },
  { id: 'build', title: tx('Build a Cannon'), target: '.os-rack .os-slot:first-child',
    text: () => t('Press 1 (or click the Cannon in the rack below), then click a free spot next to the road.'),
    done: (c) => c.built.includes('blue') },
  { id: 'wave', title: tx('Send a wave'), target: '.os-wave-box .os-btn.primary',
    text: (k) => t('The top bar shows the incoming wave. Press {send} or click Send wave to start it. After this first one, waves come by themselves; sending one early pays a small bonus.', { send: k('sendWave') }),
    done: (c) => c.events.has('wave') },
  { id: 'upgrade', title: tx('Upgrade it'), target: '.os-side',
    text: (k) => t('Click your Cannon to select it, then press {dmg} for damage, {rng} for range or {rate} for rate. Hover a row in the Upgrades tab to preview the gain.', { dmg: k('upDamage'), rng: k('upRange'), rate: k('upRate') }),
    done: (c) => c.events.has('upgrade') },
  { id: 'target', title: tx('Choose a target'), target: '.os-side',
    text: (k) => t('Each turret picks a target: nearest by default. With the turret selected, press {target} to try another mode, such as furthest along the road or strongest.', { target: k('target') }),
    done: (c) => c.state.turrets.some((t) => t.category === 'weapon' && t.targetMode !== defaultTarget(t)) },
  { id: 'second', title: tx('Mix your turrets'), target: '.os-rack',
    text: () => t('Build a second turret, for example a Laser (2) or a Rocket (3). Different turrets do different jobs, and their colours matter for combos.'),
    done: (c) => c.state.turrets.length >= 2 && c.built.length > 0 },
  { id: 'combos', title: tx('Combos'), target: '#os-tab-combos',
    text: (k) => t('Turrets with fully upgraded damage that stand close together fire a combo: a nuke, cluster bombs, a black hole and more. The colours decide which one. The Combos tab shows what a turret can do; {codex} opens the Combo Codex with every recipe.', { codex: k('codex') }) },
  { id: 'done', title: tx('You are ready'),
    text: (k) => t('That is the basics. Press ? for all controls (you can change them there), {codex} for the Combo Codex, and How to play in the menu explains the rest. From now on waves come by themselves. Good luck holding the line!', { codex: k('codex') }) },
];

/** Tutorial progress. `observe` collects events, `check` advances automatic steps, Next/Back/Skip are the buttons. */
export class Tutorial {
  index = 0;
  over = false;
  events = new Set<string>();
  built: string[] = [];
  codexOpened = false;

  get step(): TutorialStep { return TUTORIAL_STEPS[this.index]; }
  get count(): number { return TUTORIAL_STEPS.length; }

  /** Record a game event (name and, for builds, the kind). */
  observe(name: string, kind?: string): void {
    this.events.add(name);
    if (name === 'build' && kind) this.built.push(kind);
  }

  /** Advance when the current step's goal is met. Returns true if the step changed. */
  check(c: Omit<TutorialCtx, 'events' | 'built' | 'codexOpened'>): boolean {
    if (this.over) return false;
    const s = this.step;
    if (!s.done || !s.done({ ...c, events: this.events, built: this.built, codexOpened: this.codexOpened })) return false;
    this.go(this.index + 1);
    return true;
  }

  /** Next button: manual steps only (automatic steps finish by doing them). The last step ends the tutorial. */
  next(): void {
    if (this.over || this.step.done) return;
    if (this.index >= this.count - 1) { this.over = true; return; }
    this.go(this.index + 1);
  }

  back(): void { if (!this.over && this.index > 0) this.go(this.index - 1); }
  skip(): void { this.over = true; }

  go(i: number): void {
    this.index = Math.max(0, Math.min(this.count - 1, i));
    this.events = new Set();
    this.built = [];
    this.codexOpened = false;
  }
}
