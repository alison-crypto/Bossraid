import { test } from "node:test";
import assert from "node:assert/strict";
import {
  forceBase, maxHP, lightDamage, heavyDamage, damageTaken,
} from "../src/stats.js";

test("forceBase = STR * DEX * 0.01", () => {
  assert.ok(Math.abs(forceBase(10, 12) - 1.2) < 1e-9);
});

test("maxHP = CON * STR", () => {
  assert.equal(maxHP(10, 10), 100);
  assert.equal(maxHP(9, 8), 72);
  assert.equal(maxHP(0, 0), 1); // floored at 1
});

test("light damage = round(forceBase + weaponDmg)", () => {
  assert.equal(lightDamage(10, 12, 50), 51); // 1.2 + 50 -> 51
});

test("heavy damage scales by 1.5 + 0.01*floor(STR/10)", () => {
  // (1.2 + 50) * (1.5 + 0.01*1) = 51.2 * 1.51 = 77.31 -> 77
  assert.equal(heavyDamage(10, 12, 50), 77);
});

test("DEF subtracts directly, floored at 0", () => {
  assert.equal(damageTaken(22, 16), 6);
  assert.equal(damageTaken(10, 16), 0);
});
