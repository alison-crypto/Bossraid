// Pure sprite-animation timing. No DOM — unit-testable. A "clip" is N frames
// played at `fps`; looping clips wrap, one-shots clamp on the last frame.

export function frameIndex(elapsed, fps, frames, loop = true) {
  if (frames <= 1 || fps <= 0) return 0;
  const i = Math.floor(elapsed * fps);
  if (loop) return ((i % frames) + frames) % frames;
  return Math.max(0, Math.min(i, frames - 1));
}

export function clipDuration(fps, frames) {
  return fps > 0 ? frames / fps : 0;
}

// A one-shot clip is "done" once its full duration has elapsed (looping: never).
export function clipDone(elapsed, fps, frames, loop = false) {
  if (loop) return false;
  return elapsed >= clipDuration(fps, frames);
}

// Tracks the current clip name + elapsed time. Frame/fps/loop come from the
// sheet config at draw time, so this stays data-free and testable.
export class Animator {
  constructor() { this.clip = null; this.t = 0; }

  // Switch clips (restarts time). Re-playing the same clip is a no-op unless
  // `restart` is set — so holding a state doesn't reset its animation.
  play(clip, restart = false) {
    if (this.clip !== clip || restart) { this.clip = clip; this.t = 0; }
  }

  tick(dt) { this.t += dt; }
}
