import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, step, emptyInput, CFG } from "../src/game.js";
import { arrowImpactDamage, incomingDamage } from "../src/stats.js";

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

test("an arrow that reaches the boss deals its kinetic-energy impact (minus DEF)", () => {
  const g = createGame();
  g.player.x = 480; g.player.y = 500; g.player.facing = { x: 0, y: -1 };
  g.boss.x = 480; g.boss.y = 200; g.boss.state = "recover"; g.boss.t = 99; // hold still
  const expected = incomingDamage(arrowImpactDamage(g.player.str, g.player.dex, g.player.bowDmg), CFG.bossDef);
  const before = g.boss.hp;
  step(g, input({ attack: true }), 1 / 60); // fire
  for (let k = 0; k < 60 && g.boss.hp === before; k++) step(g, input(), 1 / 60);
  assert.equal(before - g.boss.hp, expected);
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
  assert.equal(g.player.hp, 100 - CFG.bossDmg);
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

test("attack choice cycles patterns; never smashes at range", () => {
  // Re-trigger the picker repeatedly, pinning the boss so distance is stable.
  const collect = (px, bx, phase) => {
    const g = createGame();
    g.boss.phase = phase;
    g.player.x = px; g.player.y = 300;
    const seen = new Set();
    for (let n = 0; n < 10; n++) {
      g.boss.state = "idle"; g.boss.cd = 0; g.boss.x = bx; g.boss.y = 300;
      step(g, input(), 1 / 60);
      seen.add(g.boss.attack);
    }
    return seen;
  };
  const far = collect(900, 100, 3); // phase 3 exposes the full ranged kit
  assert.ok(!far.has("smash"), "never smashes thin air at range");
  assert.ok(far.size >= 3, "varied ranged/gap-closer patterns");

  const near = collect(480, 480, 1); // boss on top of the player
  assert.ok(near.has("smash"), "smashes when in melee reach");
});

test("dash charge deals contact damage, and i-frames negate it", () => {
  const mk = (invuln) => {
    const g = createGame();
    g.boss.x = 480; g.boss.y = 300; g.player.x = 480; g.player.y = 320;
    g.player.invuln = invuln;
    g.boss.attack = "dash"; g.boss.state = "strike"; g.boss.t = CFG.dashTime;
    g.boss.dash = { dx: 0, dy: 1, active: true, hit: false };
    step(g, input(), 1 / 60);
    return g.player.hp;
  };
  assert.equal(mk(0), 100 - CFG.dashDmg, "contact hurts");
  assert.equal(mk(0.5), 100, "i-frames negate the dash");
});

test("a scatter rock damages the player on contact and is spent", () => {
  const g = createGame();
  g.boss.x = 480; g.boss.y = 300; g.player.x = 480; g.player.y = 320; g.player.invuln = 0;
  g.rocks.push({ x: 480, y: 310, vx: 0, vy: 200, r: CFG.smallRockR, dmg: CFG.smallRockDmg, big: false, hit: false });
  step(g, input(), 1 / 60);
  assert.equal(100 - g.player.hp, CFG.smallRockDmg);
  assert.equal(g.rocks.length, 0, "scatter rock consumed on hit");
});

test("a big rock lands and persists as a solid obstacle", () => {
  const g = createGame();
  g.player.x = 100; g.player.y = 100; g.player.invuln = 99; // out of the way
  g.rocks.push({
    x: 480, y: 300, vx: 0, vy: 0, r: CFG.bigRockR, dmg: CFG.bigRockDmg, big: true,
    tx: 480, ty: 300, travel: 0, landed: false, hit: false,
  });
  step(g, input(), 1 / 60); // travel<=0 -> lands and stays
  assert.equal(g.rocks.length, 1);
  assert.equal(g.rocks[0].landed, true);

  // the player cannot walk through it
  g.player.x = 480 - (CFG.bigRockR + g.player.r) + 6; g.player.y = 300;
  step(g, input({ move: { x: 1, y: 0 } }), 1 / 60); // shove right into the boulder
  const gap = Math.hypot(g.player.x - 480, g.player.y - 300);
  assert.ok(gap >= CFG.bigRockR + g.player.r - 0.5, "player is pushed out of the boulder");
});

test("scatter fires rocks in all directions", () => {
  const g = createGame();
  g.boss.x = 480; g.boss.y = 300; g.player.x = 480; g.player.y = 560;
  g.boss.attack = "scatter"; g.boss.state = "windup"; g.boss.t = 0.01;
  step(g, input(), 0.02); // windup -> strike spawns the volley
  assert.equal(g.rocks.length, CFG.scatterCount);
});

test("earthquake hits arena-wide unless dodged", () => {
  const hit = createGame();
  hit.boss.attack = "quake"; hit.boss.state = "windup"; hit.boss.t = 0.01; hit.player.invuln = 0;
  step(hit, input(), 0.02);
  assert.equal(100 - hit.player.hp, CFG.quakeDmg);

  const safe = createGame();
  safe.boss.attack = "quake"; safe.boss.state = "windup"; safe.boss.t = 0.01; safe.player.invuln = 0.5;
  step(safe, input(), 0.02);
  assert.equal(safe.player.hp, 100, "dodge i-frames avoid the quake");
});

test("a boulder stops the boss dash", () => {
  const g = createGame();
  g.boss.x = 300; g.boss.y = 300; g.player.x = 920; g.player.y = 300; g.player.invuln = 99;
  g.rocks.push({ x: 460, y: 300, vx: 0, vy: 0, r: CFG.bigRockR, dmg: 0, big: true, tx: 460, ty: 300, travel: 0, landed: true, hit: true });
  g.boss.attack = "dash"; g.boss.state = "strike"; g.boss.t = CFG.dashTime;
  g.boss.dash = { dx: 1, dy: 0, active: true, hit: false };
  for (let k = 0; k < 20 && g.boss.state === "strike"; k++) step(g, input(), 1 / 60);
  assert.ok(g.boss.x <= 460 - (CFG.bossR + CFG.bigRockR) + 3, "boss did not charge through the boulder");
});

test("a boulder blocks the boss body while chasing", () => {
  const g = createGame();
  g.boss.x = 300; g.boss.y = 300; g.player.x = 640; g.player.y = 300; g.player.invuln = 99;
  g.rocks.push({ x: 420, y: 300, vx: 0, vy: 0, r: CFG.bigRockR, dmg: 0, big: true, tx: 420, ty: 300, travel: 0, landed: true, hit: true });
  g.boss.state = "idle"; g.boss.cd = 99; // keep chasing, never attack
  for (let k = 0; k < 90; k++) step(g, input(), 1 / 60);
  assert.ok(g.boss.x <= 420 - (CFG.bossR + CFG.bigRockR) + 4, "boss can't walk through the boulder");
});

test("a thrown rock is stopped by a boulder", () => {
  const g = createGame();
  g.player.x = 900; g.player.y = 300; g.player.invuln = 99;
  g.boss.state = "recover"; g.boss.t = 99; // freeze the boss (no new rocks)
  g.rocks.push({ x: 400, y: 300, vx: 0, vy: 0, r: CFG.bigRockR, dmg: 0, big: true, tx: 400, ty: 300, travel: 0, landed: true, hit: true });
  g.rocks.push({ x: 360, y: 300, vx: 300, vy: 0, r: CFG.smallRockR, dmg: CFG.smallRockDmg, big: false, hit: false });
  for (let k = 0; k < 30; k++) step(g, input(), 1 / 60);
  assert.equal(g.rocks.filter((r) => !r.landed).length, 0, "scatter rock blocked by the boulder");
});

test("the golem advances a phase when a health segment is emptied", () => {
  const g = createGame();
  g.player.x = 480; g.player.y = 360; g.player.facing = { x: 0, y: -1 };
  g.boss.x = 480; g.boss.y = 300; g.boss.state = "recover"; g.boss.t = 99;
  g.boss.hp = g.boss.maxHp * (2 / 3) + 10; // one arrow drops it below the 2/3 line
  assert.equal(g.boss.phase, 1);
  step(g, input({ attack: true }), 1 / 60);
  for (let k = 0; k < 60 && g.boss.phase === 1; k++) step(g, input(), 1 / 60);
  assert.equal(g.boss.phase, 2);
});

test("the golem hits harder in later phases", () => {
  const quakeHit = (phase) => {
    const g = createGame();
    g.boss.phase = phase;
    g.boss.attack = "quake"; g.boss.state = "windup"; g.boss.t = 0.01; g.player.invuln = 0;
    step(g, input(), 0.02);
    return 100 - g.player.hp;
  };
  assert.ok(quakeHit(3) > quakeHit(1), "a phase-3 quake hurts more than phase-1");
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
