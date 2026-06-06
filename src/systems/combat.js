// Combat resolution: damage application, i-frame checks, and hit feedback.
//
// Entities participating in combat expose at least:
//   { x, y, r, hp, maxHp, invuln?: number, dead?: boolean }
// `invuln` (seconds remaining) blocks all incoming damage — used for dash
// i-frames and post-hit mercy windows.

import { circleHitsCircle, circleInArc } from '../engine/collision.js';

// Apply `amount` damage to `target`. Returns the damage actually dealt (0 if
// the target was invulnerable or already dead). Handles damage numbers,
// particles, hit-stop, and screen shake through the shared effects system.
export function dealDamage(target, amount, effects, opts = {}) {
  if (target.dead || target.hp <= 0) return 0;
  if (target.invuln && target.invuln > 0) return 0;

  const dmg = Math.max(0, amount);
  target.hp = Math.max(0, target.hp - dmg);

  // Brief flash + optional mercy i-frames so a single overlap can't multi-hit.
  target.hitFlash = 0.12;
  if (opts.mercyIframes) target.invuln = Math.max(target.invuln ?? 0, opts.mercyIframes);

  if (effects) {
    const color = opts.color ?? (opts.crit ? '#ff7a7a' : '#ffe27a');
    effects.damageNumber(target.x, target.y - target.r, dmg, {
      crit: opts.crit,
      color,
      size: opts.crit ? 26 : 20,
    });
    effects.burst(target.x, target.y, opts.crit ? 14 : 8, color, {
      speed: opts.heavy ? 240 : 150,
    });
    if (opts.heavy) {
      effects.hitStop(0.07);
      effects.shake(10, 0.25);
    } else if (opts.shake) {
      effects.shake(opts.shake, 0.15);
    }
  }

  if (target.hp <= 0) target.dead = true;
  return dmg;
}

// Resolve a melee swing (a circular sector / arc) against a single target.
// `swing` = { x, y, facing, halfArc, radius, damage, heavy?, crit? }.
export function resolveMeleeHit(swing, target, effects) {
  if (target.dead) return 0;
  const hit = circleInArc(
    { x: target.x, y: target.y, r: target.r },
    { x: swing.x, y: swing.y },
    swing.facing,
    swing.halfArc,
    swing.radius
  );
  if (!hit) return 0;
  return dealDamage(target, swing.damage, effects, {
    heavy: swing.heavy,
    crit: swing.crit,
    mercyIframes: 0, // single-target swing resolves once per activation already
  });
}

// Circle-vs-circle overlap test for projectile / body collisions.
export function bodiesOverlap(a, b) {
  return circleHitsCircle(
    { x: a.x, y: a.y, r: a.r },
    { x: b.x, y: b.y, r: b.r }
  );
}

// Tick down timers shared by combat entities (i-frames, hit flash).
export function tickCombatTimers(entity, dt) {
  if (entity.invuln && entity.invuln > 0) {
    entity.invuln = Math.max(0, entity.invuln - dt);
  }
  if (entity.hitFlash && entity.hitFlash > 0) {
    entity.hitFlash = Math.max(0, entity.hitFlash - dt);
  }
}
