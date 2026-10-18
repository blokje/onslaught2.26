import { Game } from './game/Game.ts';
import { Renderer } from './render/Renderer.ts';
import { App } from './ui/App.ts';

let renderer: Renderer | null = null;
let app: App | null = null;
try {
  renderer = new Renderer(document.getElementById('game')!);
} catch (e) {
  console.error(e);
  const ui = document.getElementById('ui');
  if (ui) {
    const msg = document.createElement('div');
    msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:#eee;font:16px sans-serif;';
    msg.textContent = 'WebGL is required to play OnSlaught2.26, but it is not available in this browser. Try another browser or enable hardware acceleration.';
    ui.appendChild(msg);
  }
}

if (renderer) {
  app = new App(document.getElementById('ui')!, {
    createGame: (opts) => new Game({ seed: (Math.random() * 0x100000000) >>> 0, ...opts }),
    restoreGame: (save) => Game.deserialize(save),
    renderer,
  });

  // narrowed copies: the closure below runs later, where TS no longer knows these are set
  const theApp: App = app;
  const theRenderer: Renderer = renderer;
  let last = performance.now();
  const seenErrors = new Set<string>();
  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    try {
      const dt = Math.min(now - last, 100);
      last = now;
      const game = theApp.game;
      if (game) game.update(dt);
      theRenderer.render(dt);
      theApp.frame(dt);
    } catch (e) {
      const key = String((e as Error | null)?.message || e);
      if (!seenErrors.has(key)) { seenErrors.add(key); console.error(e); }
      const g = theApp.game;
      if (g && !g.state.paused) { try { g.setPaused(true); } catch (e2) { /* ignore */ } }
    }
  };
  requestAnimationFrame(frame);
}
