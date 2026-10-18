import { Renderer } from './Renderer.ts';
import { createDemoGame } from './demo.ts';
import { BUILD_ORDER } from '../data/turrets.ts';
import type { DemoGame } from './demo.ts';
import type { Overlay } from '../types.ts';

declare global {
  interface Window { renderer: Renderer; demo: () => DemoGame }
}

const params = new URLSearchParams(location.search);
let mapIndex = Number(params.get('map') || 0);
const renderer = new Renderer(document.getElementById('game')!); // the demo page always has #game
let game: DemoGame = createDemoGame({ mapIndex });
renderer.setGame(game);
window.renderer = renderer; window.demo = () => game;

const overlay: Overlay = { ghost: null, selectedId: null, hoverId: null, showRanges: 'selected', showCombo: false, joinFromId: null };
let stressOn = false, ghostIdx = -1, lastMouse = { x: 0, y: 0 }, showFps = true, fps = 60;
const push = () => renderer.setOverlay(overlay);

const canvas = renderer.canvas;
canvas.addEventListener('pointermove', (e) => {
  lastMouse = { x: e.clientX, y: e.clientY };
  const w = renderer.screenToWorld(e.clientX, e.clientY);
  overlay.hoverId = game.turretAt(w.x, w.y);
  if (overlay.ghost) { overlay.ghost.x = w.x; overlay.ghost.y = w.y; overlay.ghost.valid = !!(Math.floor(w.x / 22 + w.y / 22) % 2); }
  push();
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const w = renderer.screenToWorld(e.clientX, e.clientY);
  overlay.selectedId = game.turretAt(w.x, w.y);
  push();
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'r') overlay.showRanges = overlay.showRanges === 'all' ? 'selected' : 'all';
  else if (k === 'c') overlay.showCombo = !overlay.showCombo;
  else if (k === 'g') {
    if (overlay.ghost) overlay.ghost = null;
    else { ghostIdx = 0; const w = renderer.screenToWorld(lastMouse.x, lastMouse.y); overlay.ghost = { kind: BUILD_ORDER[0], x: w.x, y: w.y, valid: true }; }
  }
  else if (k === 'tab' && overlay.ghost) { e.preventDefault(); ghostIdx = (ghostIdx + 1) % BUILD_ORDER.length; overlay.ghost.kind = BUILD_ORDER[ghostIdx]; }
  else if (k === 'j') overlay.joinFromId = overlay.joinFromId ? null : overlay.selectedId;
  else if (k === 'p') game.togglePause();
  else if (k === 'x') { stressOn = !stressOn; game.setStress(stressOn); }
  else if (k === 'f') showFps = !showFps;
  else if (k === '0') renderer.resetView();
  else if (k >= '1' && k <= '8') game.setSpeed([1, 2, 4, 8][(Number(k) - 1) % 4]);
  else if (k === 'm') { mapIndex = (mapIndex + 1) % 10; game = createDemoGame({ mapIndex }); renderer.setGame(game); overlay.selectedId = null; stressOn = false; }
  push();
});

const hud = document.getElementById('hud')!; // the demo page always has #hud
let last = performance.now(), acc = 0, frames = 0;
function frame(now: number): void {
  const dt = Math.min(now - last, 100); last = now;
  game.update(dt);
  renderer.render(dt);
  acc += dt; frames++;
  if (acc >= 500) { fps = Math.round(frames * 1000 / acc); acc = 0; frames = 0; }
  const st = game.state;
  hud.style.display = showFps ? '' : 'none';
  hud.textContent = `fps ${fps}  map ${st.map.name}  attackers ${st.attackers.length}  turrets ${st.turrets.length}  proj ${st.projectiles.length}  beams ${st.beams.length}  fx ${st.effects.length}  zoom ${renderer.getZoom().toFixed(2)}\n` +
    `wheel zoom | right/middle drag pan | click select | R ranges | C combo | G ghost (Tab kind) | J join | P pause | 1-4 speed | X stress | M next map | 0 reset | F hud`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
