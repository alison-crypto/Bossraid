import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, step, emptyInput, CFG } from "../src/game.js";

function input(over = {}) {
  return { ...emptyInput(), ...over, move: over.move ?? { x: 0, y: 0 } };
}

test("new game: derived HP and full boss HP", () => {
  const g = createGame(); // str10 dex12 con10
  assert.equal(g.player.hp, 100);
  assert.equal(g.player.maxHp, 100);
  assert.equal(g.boss.hp, CFG.bossMaxHp);
  assert.equal(g.over, null);
});

test("firing spawns an arrow travelling in the facing direction", () => {
  const g = createGame();
  g.player.facing = { x: 0, y: -1 }; // aiming up
  step(g, input({ attack: true }), 1 / 60);
  assert.equal(g.arrows.length, 1);
  assert.ok(g.arrows[0].vy < 0 && g.arrows[0].vx === 0, "arrow flies up");
});

test("an arrow that reaches the boss damages it for the light amount", () => {
  const g = createGame();
  g.player.x = 480; g.player.y = 500; g.player.facing = { x: 0, y: -1 };
  g.boss.x = 480; g.boss.y = 200; g.boss.state = "recover"; g.boss.t = 99; // hold still
  const before = g.boss.hp;
  step(g, input({ attack: true }), 1 / 60); // fire
  for (let k = 0; k < 60 && g.boss.hp === before; k++) step(g, input(), 1 / 60);
  assert.equal(before - g.boss.hp, 51, "light arrow deals 51");
});

test("firing respects cooldown (one arrow per press window)", () => {
  const g = createGame();
  g.player.facing = { x: 0, y: -1 };
  step(g, input({ attack: true }), 1 / 60);
  assert.equal(g.arrows.length, 1);
  step(g, input({ attack: true }), 1 / 60); // still on cooldown
  assert.equal(g.arrows.length, 1, "second immediate shot is on cooldown");
});

test("an arrow that misses leaves the arena and is culled", () => {
  const g = createGame();
  g.player.x = 480; g.player.y = 300; g.player.facing = { x: 1, y: 0 }; // shoot right, past the boss
  g.boss.x = 480; g.boss.y = 200; g.boss.state = "recover"; g.boss.t = 99;
  step(g, input({ attack: true }), 1 / 60);
  for (let k = 0; k < 120 && g.arrows.length > 0; k++) step(g, input(), 1 / 60);
  assert.equal(g.arrows.length, 0, "arrow culled off-arena");
  assert.equal(g.boss.hp, g.boss.maxHp, "boss never hit");
});

test("boss slam damages a player who stays in the ring", () => {
  const g = createGame();
  g.boss.state = "windup"; g.boss.t = 0.01;
  g.boss.slam = { x: g.player.x, y: g.player.y, active: true };
  g.player.invuln = 0;
  step(g, input(), 0.02); // windup elapses -> strike resolves
  assert.equal(g.player.hp, 100 - 22);
  assert.equal(g.boss.state, "strike");
});

test("dodge i-frames negate the slam", () => {
  const g = createGame();
  g.boss.state = "windup"; g.boss.t = 0.01;
  g.boss.slam = { x: g.player.x, y: g.player.y, active: true };
  g.player.invuln = 0.5; // mid-dodge i-frames
  step(g, input(), 0.02);
  assert.equal(g.player.hp, 100, "no damage while invulnerable");
});

test("stepping out of the ring avoids the slam", () => {
  const g = createGame();
  g.boss.state = "windup"; g.boss.t = 0.01;
  g.boss.slam = { x: 50, y: 50, active: true }; // telegraph far from player
  g.player.x = 900; g.player.y = 550; g.player.invuln = 0;
  step(g, input(), 0.02);
  assert.equal(g.player.hp, 100);
});

test("an arrow that brings boss hp to 0 ends the game as a win", () => {
  const g = createGame();
  g.player.x = 480; g.player.y = 300; g.player.facing = { x: 0, y: -1 };
  g.boss.x = 480; g.boss.y = 200; g.boss.hp = 10; g.boss.state = "recover"; g.boss.t = 99;
  step(g, input({ attack: true }), 1 / 60); // fire
  for (let k = 0; k < 60 && g.over === null; k++) step(g, input(), 1 / 60);
  assert.equal(g.boss.hp, 0);
  assert.equal(g.over, "won");
});

test("player death ends the game as a loss", () => {
  const g = createGame();
  g.player.hp = 10;
  g.boss.state = "windup"; g.boss.t = 0.01;
  g.boss.slam = { x: g.player.x, y: g.player.y, active: true };
  g.player.invuln = 0;
  step(g, input(), 0.02);
  assert.equal(g.player.hp, 0);
  assert.equal(g.over, "lost");
});

test("movement is clamped to the arena", () => {
  const g = createGame();
  g.player.x = 20; g.player.y = 20;
  for (let k = 0; k < 120; k++) step(g, input({ move: { x: -1, y: -1 } }), 1 / 60);
  assert.ok(g.player.x >= g.player.r);
  assert.ok(g.player.y >= g.player.r);
});

test("the game freezes once it is over", () => {
  const g = createGame();
  g.over = "won";
  const snap = JSON.stringify(g);
  step(g, input({ move: { x: 1, y: 0 }, attack: true }), 1 / 60);
  assert.equal(JSON.stringify(g), snap);
});
