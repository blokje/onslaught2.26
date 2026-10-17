import { Game } from './game/Game.js';
import { Renderer } from './render/Renderer.js';
import { App } from './ui/App.js';

const renderer = new Renderer(document.getElementById('game'));
const app = new App(document.getElementById('ui'), {
  createGame: (opts) => new Game(opts),
  restoreGame: (save) => Game.deserialize(save),
  renderer,
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  const game = app.game;
  if (game) game.update(dt);
  renderer.render(dt);
  app.frame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
