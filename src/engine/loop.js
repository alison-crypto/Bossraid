// Fixed-timestep game loop with interpolated rendering.
//
// `update(dt)` is called zero or more times per frame with a constant `dt`
// (in seconds) so simulation is deterministic and frame-rate independent.
// `render(alpha)` is called once per frame; `alpha` in [0, 1) is the fraction
// of a step elapsed toward the next update, for smooth interpolation.

const STEP = 1 / 60; // fixed simulation step (seconds)
const MAX_FRAME = 0.25; // clamp huge gaps (e.g. tab was backgrounded)

export function createLoop({ update, render }) {
  let rafId = null;
  let last = 0;
  let accumulator = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    const seconds = now / 1000;
    let frameTime = seconds - last;
    last = seconds;
    if (frameTime > MAX_FRAME) frameTime = MAX_FRAME;

    accumulator += frameTime;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }

    render(accumulator / STEP);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now() / 1000;
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    },
    get running() {
      return running;
    },
  };
}

export { STEP };
