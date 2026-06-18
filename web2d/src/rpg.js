// RPG progression: stats, equipment, skills, XP/leveling — pure data + logic,
// persisted to localStorage. Reads combat formulas from stats.js so equipment
// and skill ranks feed the same CombatMath the fight uses.
import { skillMods } from "./stats.js";

// --- catalogs ----------------------------------------------------------------
export const BOWS = [
  { id: "shortbow", name: "Worn Shortbow", bowDmg: 12, strReq: 6 },
  { id: "recurve", name: "Hunter's Recurve", bowDmg: 22, strReq: 10 },
  { id: "runebow", name: "Rune Longbow", bowDmg: 34, strReq: 14 },
];
export const ARMORS = [
  { id: "leather", name: "Leather Vest", def: 4, strReq: 0 },
  { id: "scale", name: "Scale Mail", def: 8, strReq: 9 },
  { id: "plate", name: "Temple Plate", def: 12, strReq: 13 },
];
export const BOOTS = [
  { id: "worn", name: "Worn Boots", def: 1, speed: 0, strReq: 0 },
  { id: "swift", name: "Swift Boots", def: 2, speed: 22, strReq: 0 },
];
// Skill -> which CombatMath skillMods lever it pulls.
export const SKILLS = [
  { id: "marksmanship", name: "Marksmanship", mod: "ranged", desc: "+arrow velocity → more impact" },
  { id: "evasion", name: "Evasion", mod: "dodge", desc: "+dodge i-frames" },
  { id: "powershot", name: "Power Shot", mod: "heavy", desc: "+charged-shot multiplier" },
];
export const SKILL_MAX = 5;

const byId = (list, id) => list.find((x) => x.id === id) || list[0];

export function newProfile() {
  return {
    level: 1, xp: 0, statPts: 0, skillPts: 0,
    str: 10, dex: 12, con: 10,
    skills: { marksmanship: 0, evasion: 0, powershot: 0 },
    owned: ["shortbow", "leather", "worn"],
    equip: { bow: "shortbow", armor: "leather", boots: "worn" },
  };
}

// --- leveling ----------------------------------------------------------------
export const xpToNext = (level) => 100 * level; // XP from level L to L+1

// Add XP; level up (loops), granting +1 stat point/level and +1 skill point/2
// levels. Mutates and returns the number of levels gained.
export function addXp(p, amount) {
  p.xp += Math.max(0, Math.round(amount));
  let gained = 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++; gained++;
    p.statPts += 1;
    if (p.level % 2 === 0) p.skillPts += 1;
  }
  return gained;
}

export function spendStat(p, key) { // "str" | "dex" | "con"
  if (p.statPts <= 0 || !(key in { str: 1, dex: 1, con: 1 })) return false;
  p[key] += 1; p.statPts -= 1; return true;
}
export function rankUp(p, skillId) {
  if (p.skillPts <= 0 || (p.skills[skillId] ?? 0) >= SKILL_MAX) return false;
  p.skills[skillId] += 1; p.skillPts -= 1; return true;
}
export function canEquip(p, item) { return p.str >= (item.strReq || 0); }
export function equip(p, slot, id) { // slot: "bow"|"armor"|"boots"
  const list = slot === "bow" ? BOWS : slot === "armor" ? ARMORS : BOOTS;
  const item = byId(list, id);
  if (!p.owned.includes(id) || !canEquip(p, item)) return false;
  p.equip[slot] = id; return true;
}

// --- derive the createGame() opts from a profile -----------------------------
export function equippedStats(p) {
  const bow = byId(BOWS, p.equip.bow), armor = byId(ARMORS, p.equip.armor), boots = byId(BOOTS, p.equip.boots);
  return { bowDmg: bow.bowDmg, def: armor.def + boots.def, speedBonus: boots.speed };
}
export function gameOptsFromProfile(p) {
  const eq = equippedStats(p);
  return {
    str: p.str, dex: p.dex, con: p.con,
    def: eq.def, bowDmg: eq.bowDmg, speedBonus: eq.speedBonus,
    skills: { heavy: p.skills.powershot, dodge: p.skills.evasion, ranged: p.skills.marksmanship },
  };
}
// Resolved skill tunables (for previews/UI).
export function profileMods(p) {
  return skillMods(p.skills.powershot, 0, p.skills.evasion, 0, p.skills.marksmanship);
}

// --- persistence -------------------------------------------------------------
const KEY = "bossraid.profile";
export function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) { /* no storage */ }
}
export function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return newProfile();
    return { ...newProfile(), ...JSON.parse(s) }; // merge so new fields get defaults
  } catch (_) { return newProfile(); }
}
