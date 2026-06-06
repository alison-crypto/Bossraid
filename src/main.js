// Bootstrap: set up the canvas + input, run the fixed-timestep loop, and host a
// tiny scene manager that drives Menu → Fight → Result.

import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createMenuScene } from './scenes/menu.js';
import { createFightScene } from './scenes/fight.js';
import { createResultScene } from './scenes/result.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);

let current = null;

const game = {
  canvas,
  ctx,
  input,
  width: canvas.width,
  height: canvas.height,

  setScene(scene) {
    if (current && current.exit) current.exit();
    current = scene;
    if (current.enter) current.enter();
  },

  goMenu(index = 0) {
    this.setScene(createMenuScene(this, index));
  },
  goFight(bossId) {
    this.setScene(createFightScene(this, bossId));
  },
  goResult(result) {
    this.setScene(createResultScene(this, result));
  },
};

const loop = createLoop({
  update(dt) {
    if (current && current.update) current.update(dt, input);
    // Clear per-frame input edges after each fixed step so a single key press
    // can't be consumed by multiple sub-steps in one rendered frame.
    input.endFrame();
  },
  render(alpha) {
    if (current && current.render) current.render(ctx, alpha);
  },
});

// Pause the loop when the tab is hidden to avoid a huge catch-up on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.stop();
  else loop.start();
});

game.goMenu();
loop.start();
