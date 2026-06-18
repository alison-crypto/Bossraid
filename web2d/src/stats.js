// Combat & physics formulas — the single source of truth, ported 1:1 from the
// Godot build's CombatMath (keep the two in sync). Pure functions, no DOM/state,
// so combat code, UI previews, balancing tools and tests all share the SAME math.
//
// Core idea: damage is a FORCE term, force = mass x accel, where mass = STR and
// accel = DEX * ACCEL_PER_DEX. Health = CON * STR. Weapons add flat damage; DEF
// subtracts; skills tune multipliers. Ranged uses kinetic energy (1/2 m v^2).

// --- Tunable constants -------------------------------------------------------
export const ACCEL_PER_DEX = 0.01;   // accel per DEX point (force_base = STR*DEX*0.01)
export const HEALTH_K = 1.0;         // Health = CON * STR * HEALTH_K
export const HEAVY_BASE_MULT = 1.5;  // heavy multiplier base (before STR step & skills)
export const HEAVY_STR_STEP = 0.01;  // + this to the heavy mult per full 10 STR
export const DEX_ANIM_PER_PT = 0.01; // seconds shaved off a swing per DEX point
export const SWING_MIN_TIME = 0.15;  // a swing never gets faster than this

// Defence / reactions (base values; skills modify these — see skillMods)
export const DODGE_IFRAMES = 0.5;
export const BLOCK_REDUCTION = 0.2;  // fraction of damage still taken while blocking
export const PARRY_WINDOW = 0.3;     // block within this many seconds of guard = parry
export const KICK_KNOCKBACK = 6.0;

// Ranged (kinetic-energy projectile)
export const AMMO_MASS = 0.1;        // base projectile mass
export const MASS_PER_STR = 0.01;    // + mass per STR (heavier draw = heavier shot)
export const BOW_BASE_V = 10.0;      // base launch speed
export const V_PER_DEX = 0.7;        // + launch speed per DEX point
export const ARROW_DRAG = 0.0006;    // quadratic drag coeff (per-frame: drag*v^2/mass)
export const PROJECTILE_GRAVITY = 9.8;

// Swing playback speeds (multiply the clip; weapon "speed" also multiplies)
export const ATTACK_SPEED = 1.4;
export const HEAVY_SPEED = 1.0;

const r1 = (v) => Math.round(Math.max(1, v)); // round, floored at 1

// --- Health ------------------------------------------------------------------
export function maxHealth(str, con) {
  return Math.max(1, con * str * HEALTH_K);
}
// Back-compat alias (existing call sites use maxHP(con, str) order).
export function maxHP(con, str) {
  return Math.round(maxHealth(str, con));
}

// --- Force term (the heart of melee damage) ----------------------------------
export function forceBase(str, dex) {
  return str * (dex * ACCEL_PER_DEX); // mass * accel
}

// --- Melee damage ------------------------------------------------------------
export function lightDamage(str, dex, weaponDmg) {
  return r1(forceBase(str, dex) + weaponDmg);
}
export function heavyMultiplier(str, baseMult = HEAVY_BASE_MULT) {
  return baseMult + HEAVY_STR_STEP * Math.floor(str / 10);
}
export function heavyDamage(str, dex, weaponDmg, baseMult = HEAVY_BASE_MULT) {
  return r1((forceBase(str, dex) + weaponDmg) * heavyMultiplier(str, baseMult));
}
export function kickDamage(str, dex, bootsDmg, kickScale = 1.0) {
  return r1(forceBase(str, dex) + bootsDmg * kickScale);
}

// --- Ranged — kinetic-energy projectile --------------------------------------
export function arrowMass(str) {
  return AMMO_MASS + str * MASS_PER_STR;
}
export function arrowLaunchSpeed(dex, rangedVBonus = 0) {
  return BOW_BASE_V + dex * V_PER_DEX + rangedVBonus;
}
export function arrowImpactDamage(str, dex, bowDmg, rangedVBonus = 0) {
  // Impact = 1/2 m v^2 + bow_damage (uses launch speed).
  const m = arrowMass(str), v = arrowLaunchSpeed(dex, rangedVBonus);
  return r1(0.5 * m * v * v + bowDmg);
}

// --- Swing timing (DEX speeds you up) ----------------------------------------
export function swingTime(clipLength, playbackSpeed, dex) {
  if (playbackSpeed <= 0) return clipLength;
  return Math.max(SWING_MIN_TIME, clipLength / playbackSpeed - dex * DEX_ANIM_PER_PT);
}

// --- Incoming damage (block / parry / DEF) -----------------------------------
// parry negates everything; else a block multiplies the hit down; THEN DEF subtracts.
export function incomingDamage(raw, defence, blocking = false, timeSinceGuard = 0,
  blockReduction = BLOCK_REDUCTION, parryWindow = PARRY_WINDOW) {
  if (blocking && timeSinceGuard <= parryWindow) return 0; // parry
  let dmg = raw;
  if (blocking) dmg = Math.round(dmg * blockReduction);    // chip damage only
  return Math.max(0, dmg - defence);
}
// Back-compat alias (DEF-only subtraction).
export function damageTaken(raw, def) {
  return incomingDamage(raw, def, false, 0);
}

// --- Skill-rank modifiers ----------------------------------------------------
// Given each skill's rank, return the runtime tunables combat uses.
export function skillMods(heavyRank = 0, kickRank = 0, dodgeRank = 0, blockRank = 0, rangedRank = 0) {
  return {
    heavyBaseMult: HEAVY_BASE_MULT + 0.15 * heavyRank,
    kickScale: 1.0 + 0.25 * kickRank,
    kickKnock: KICK_KNOCKBACK * (1.0 + 0.2 * kickRank),
    dodgeIframes: DODGE_IFRAMES + 0.1 * dodgeRank,
    blockReduction: Math.max(0, BLOCK_REDUCTION - 0.04 * blockRank),
    parryWindow: PARRY_WINDOW + 0.05 * blockRank,
    rangedVBonus: 3.0 * rangedRank,
  };
}

// --- Full stat sheet (calculator / stats panel / balancing) ------------------
export function statSheet(str, dex, con, weaponDmg = 50, bootsDmg = 0, defence = 0, bowDmg = 12) {
  return {
    STR: str, DEX: dex, CON: con,
    maxHealth: Math.round(maxHealth(str, con)),
    forceBase: forceBase(str, dex),
    light: lightDamage(str, dex, weaponDmg),
    heavy: heavyDamage(str, dex, weaponDmg),
    heavyMult: heavyMultiplier(str),
    kick: kickDamage(str, dex, bootsDmg),
    arrowMass: arrowMass(str),
    arrowV0: arrowLaunchSpeed(dex),
    arrowImpact: arrowImpactDamage(str, dex, bowDmg),
    effectiveDEF: defence,
  };
}
