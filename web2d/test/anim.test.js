import { test } from "node:test";
import assert from "node:assert/strict";
import { frameIndex, clipDuration, clipDone, Animator } from "../src/anim.js";

test("frame 0 at t=0", () => {
  assert.equal(frameIndex(0, 8, 6, true), 0);
});

test("frame advances with time", () => {
  assert.equal(frameIndex(0.13, 8, 6, true), 1); // floor(1.04)
  assert.equal(frameIndex(0.30, 8, 6, true), 2); // floor(2.4)
});

test("looping wraps", () => {
  assert.equal(frameIndex(1.0, 8, 6, true), 2); // floor(8) % 6
});

test("one-shot clamps on the last frame", () => {
  assert.equal(frameIndex(10, 8, 6, false), 5);
});

test("single-frame / zero-fps clips stay at 0", () => {
  assert.equal(frameIndex(5, 8, 1, true), 0);
  assert.equal(frameIndex(5, 0, 6, true), 0);
});

test("clipDuration = frames / fps", () => {
  assert.equal(clipDuration(10, 10), 1);
  assert.equal(clipDuration(8, 4), 0.5);
});

test("clipDone respects loop + duration", () => {
  assert.equal(clipDone(0.4, 10, 10, false), false);
  assert.equal(clipDone(1.0, 10, 10, false), true);
  assert.equal(clipDone(99, 10, 10, true), false); // looping never done
});

test("Animator.play resets time only on a real change", () => {
  const a = new Animator();
  a.play("idle");
  a.tick(0.5);
  a.play("idle"); // same clip — keep playing
  assert.equal(a.t, 0.5);
  a.play("walk"); // changed — reset
  assert.equal(a.t, 0);
  a.tick(0.2);
  a.play("walk", true); // forced restart
  assert.equal(a.t, 0);
});
