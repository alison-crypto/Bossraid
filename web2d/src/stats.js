// Pure RPG stat/damage formulas — ported from the Godot build so the 2D game
// uses the same math. No DOM, no rendering: fully unit-testable.

export const ACCEL_PER_DEX = 0.01;   // accel per DEX point (a = DEX * 0.01)
export const HEALTH_K = 1.0;          // HP = CON * STR * HEALTH_K
export const HEAVY_BASE_MULT = 1.5;   // heavy multiplier base
export const HEAVY_STR_STEP = 0.01;   // + per full 10 STR

// Force term: base = mass * accel, mass = STR, accel = DEX * ACCEL_PER_DEX.
export function forceBase(str, dex) {
  return str * (dex * ACCEL_PER_DEX);
}

export function maxHP(con, str) {
  return Math.max(1, Math.round(con * str * HEALTH_K));
}

// Light attack: base force + flat weapon damage.
export function lightDamage(str, dex, weaponDmg) {
  return Math.max(1, Math.round(forceBase(str, dex) + weaponDmg));
}

// Heavy attack: the whole light result, scaled by the STR-stepped multiplier.
export function heavyDamage(str, dex, weaponDmg) {
  const mult = HEAVY_BASE_MULT + HEAVY_STR_STEP * Math.floor(str / 10);
  return Math.max(1, Math.round((forceBase(str, dex) + weaponDmg) * mult));
}

// DEF subtracts directly from incoming damage (after any block/parry).
export function damageTaken(raw, def) {
  return Math.max(0, raw - def);
}
