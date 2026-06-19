import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProfile, addXp, xpToNext, spendStat, rankUp, canEquip, equip,
  equippedStats, gameOptsFromProfile, BOWS, syncUnlocks, unlockedFor,
} from "../src/rpg.js";
import { createGame } from "../src/game.js";
import { arrowImpactDamage } from "../src/stats.js";

test("addXp levels up and grants stat/skill points", () => {
  const p = newProfile(); // level 1
  const gained = addXp(p, xpToNext(1) + xpToNext(2)); // enough for 2 levels
  assert.equal(gained, 2);
  assert.equal(p.level, 3);
  assert.equal(p.statPts, 2);     // +1 per level
  assert.equal(p.skillPts, 1);    // +1 every 2 levels (level 2)
});

test("spending a stat point raises the stat and decrements the pool", () => {
  const p = newProfile(); p.statPts = 1;
  assert.ok(spendStat(p, "str"));
  assert.equal(p.str, 11);
  assert.equal(p.statPts, 0);
  assert.ok(!spendStat(p, "str"), "no points left");
});

test("skills rank up while points remain, capped", () => {
  const p = newProfile(); p.skillPts = 1;
  assert.ok(rankUp(p, "marksmanship"));
  assert.equal(p.skills.marksmanship, 1);
  assert.ok(!rankUp(p, "marksmanship"), "out of skill points");
});

test("equipment is gated by STR requirement and feeds combat opts", () => {
  const p = newProfile(); // str 10
  p.owned.push("runebow");
  assert.ok(!canEquip(p, BOWS.find((b) => b.id === "runebow")), "needs str 14");
  assert.ok(!equip(p, "bow", "runebow"));
  p.owned.push("recurve");
  assert.ok(equip(p, "bow", "recurve"));
  assert.equal(equippedStats(p).bowDmg, 22);
});

test("a new profile owns only the level-1 starter gear", () => {
  const p = newProfile();
  assert.deepEqual([...p.owned].sort(), ["leather", "shortbow", "worn"].sort());
  assert.deepEqual(unlockedFor(1).sort(), ["leather", "shortbow", "worn"].sort());
});

test("leveling up auto-unlocks gear by level (owns it, doesn't equip it)", () => {
  const p = newProfile(); // level 1
  // Reach level 3 — recurve / scale / swift unlock at lvl 3.
  addXp(p, xpToNext(1) + xpToNext(2));
  assert.equal(p.level, 3);
  for (const id of ["recurve", "scale", "swift"]) assert.ok(p.owned.includes(id), `owns ${id}`);
  assert.ok(!p.owned.includes("runebow"), "runebow (lvl 6) still locked at lvl 3");
  // Unlock grants ownership only — the equip stays on the starter bow.
  assert.equal(p.equip.bow, "shortbow");
});

test("an unlocked high-tier item is still STR-gated for equipping", () => {
  const p = newProfile();
  p.level = 6; syncUnlocks(p);           // runebow now owned (lvl 6)
  assert.ok(p.owned.includes("runebow"));
  assert.ok(!equip(p, "bow", "runebow"), "owned but STR 10 < 14");
  p.str = 14;
  assert.ok(equip(p, "bow", "runebow"), "STR 14 meets the requirement");
  assert.equal(equippedStats(p).bowDmg, 34);
});

test("syncUnlocks is idempotent (no duplicate ownership)", () => {
  const p = newProfile();
  const before = p.owned.length;
  assert.equal(syncUnlocks(p), 0);       // nothing new at the same level
  assert.equal(p.owned.length, before);
});

test("a stronger bow makes the archer's arrows hit harder", () => {
  const weak = createGame(gameOptsFromProfile(newProfile()));
  const strongP = newProfile(); strongP.owned.push("recurve"); equip(strongP, "bow", "recurve");
  const strong = createGame(gameOptsFromProfile(strongP));
  const dmg = (g) => arrowImpactDamage(g.player.str, g.player.dex, g.player.bowDmg, g.player.rangedVBonus);
  assert.ok(dmg(strong) > dmg(weak), "recurve out-damages the shortbow");
});
