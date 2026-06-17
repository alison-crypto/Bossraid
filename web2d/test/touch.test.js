import { test } from "node:test";
import assert from "node:assert/strict";
import { stickVector, knobOffset, pointInCircle } from "../src/touch.js";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("resting on the base reads as no input", () => {
  const v = stickVector({ x: 0, y: 0 }, { x: 0, y: 0 }, 50);
  assert.deepEqual(v, { x: 0, y: 0 });
});

test("inside the deadzone reads as no input", () => {
  const v = stickVector({ x: 0, y: 0 }, { x: 5, y: 0 }, 50, 0.18); // dz = 9px
  assert.deepEqual(v, { x: 0, y: 0 });
});

test("full push right -> unit x, magnitude clamped to 1", () => {
  const v = stickVector({ x: 0, y: 0 }, { x: 100, y: 0 }, 50);
  assert.ok(close(v.x, 1));
  assert.ok(close(v.y, 0));
});

test("half push -> half magnitude in that direction", () => {
  const v = stickVector({ x: 0, y: 0 }, { x: 25, y: 0 }, 50);
  assert.ok(close(v.x, 0.5));
});

test("diagonal is a clamped unit vector", () => {
  const v = stickVector({ x: 0, y: 0 }, { x: 100, y: 100 }, 50);
  assert.ok(close(v.x, Math.SQRT1_2, 1e-9));
  assert.ok(close(v.y, Math.SQRT1_2, 1e-9));
  assert.ok(close(Math.hypot(v.x, v.y), 1, 1e-9));
});

test("knobOffset clamps to the radius", () => {
  const o = knobOffset({ x: 0, y: 0 }, { x: 200, y: 0 }, 60);
  assert.ok(close(o.x, 60));
  const inside = knobOffset({ x: 0, y: 0 }, { x: 10, y: 0 }, 60);
  assert.deepEqual(inside, { x: 10, y: 0 });
});

test("pointInCircle hit test", () => {
  assert.equal(pointInCircle(5, 5, 0, 0, 10), true);
  assert.equal(pointInCircle(20, 0, 0, 0, 10), false);
});
