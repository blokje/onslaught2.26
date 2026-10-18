import { App } from './App.ts';
import { createMockGame, restoreMockGame, MockRenderer } from './mock.ts';

const renderer = new MockRenderer(document.getElementById('game')!);
const app = new App(document.getElementById('ui')!, {
  createGame: (opts) => createMockGame(opts),
  restoreGame: (save) => restoreMockGame(save),
  renderer,
});
// handy in the console: app.game.cheat(1e6, 2000) gives cash and kills (unlocks turrets)
Object.assign(window, { app, renderer });

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(now - last, 100);
  last = now;
  if (app.game) app.game.update(dt);
  renderer.render(dt);
  app.frame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
