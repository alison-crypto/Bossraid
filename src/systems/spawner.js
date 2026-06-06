// Spawns and manages boss hazards: straight-line projectiles and telegraphed
// danger zones (circles and cones). Telegraphs flash during a wind-up, then
// "strike" for a short active window during which they damage the player, then
// fade. This is the core of readable, dodgeable boss attacks.

import { createProjectile } from '../entities/projectile.js';
import { dealDamage } from './combat.js';
import { pointInCircle, pointInArc } from '../engine/collision.js';

export function createSpawner(bounds) {
  const projectiles = [];
  const telegraphs = [];

  function spawnProjectile(opts) {
    projectiles.push(createProjectile(opts));
  }

  // shape: { type:'circle', x, y, radius }
  //      | { type:'cone', x, y, facing, halfArc, radius }
  function spawnTelegraph({ shape, windup = 0.7, active = 0.18, damage = 18, color = '#ff5050' }) {
    telegraphs.push({
      shape,
      windup,
      active,
      damage,
      color,
      time: 0,
      phase: 'windup',
      struck: false,
    });
  }

  function hitsPlayer(shape, player) {
    if (shape.type === 'circle') {
      return pointInCircle(player, { x: shape.x, y: shape.y, r: shape.radius + player.r });
    }
    return pointInArc(
      player,
      { x: shape.x, y: shape.y },
      shape.facing,
      shape.halfArc,
      shape.radius + player.r
    );
  }

  return {
    projectiles,
    telegraphs,
    spawnProjectile,
    spawnTelegraph,

    get busy() {
      return telegraphs.length > 0;
    },

    update(dt, player, effects) {
      // Projectiles.
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.update(dt, bounds);
        if (!p.dead && pointInCircle(player, { x: p.x, y: p.y, r: p.r + player.r })) {
          const dealt = dealDamage(player, p.damage, effects, {
            shake: 6,
            mercyIframes: 0.5,
          });
          if (dealt > 0) {
            effects.burst(p.x, p.y, 10, p.color, { speed: 200 });
            p.dead = true;
          }
        }
        if (p.dead) projectiles.splice(i, 1);
      }

      // Telegraphed zones.
      for (let i = telegraphs.length - 1; i >= 0; i--) {
        const t = telegraphs[i];
        t.time += dt;
        if (t.time < t.windup) {
          t.phase = 'windup';
        } else if (t.time < t.windup + t.active) {
          if (t.phase !== 'active') {
            // Strike just landed: shake + spark.
            effects.shake(8, 0.2);
            const s = t.shape;
            effects.burst(s.x, s.y, 16, t.color, { speed: 220 });
          }
          t.phase = 'active';
          if (!t.struck && t.damage > 0 && hitsPlayer(t.shape, player)) {
            const dealt = dealDamage(player, t.damage, effects, {
              heavy: true,
              mercyIframes: 0.6,
            });
            if (dealt > 0) t.struck = true;
          }
        } else {
          telegraphs.splice(i, 1);
        }
      }
    },

    render(ctx) {
      // Telegraphs under projectiles.
      for (const t of telegraphs) {
        const s = t.shape;
        const active = t.phase === 'active';
        const k = active ? 1 : t.time / t.windup;
        ctx.save();
        if (s.type === 'circle') {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        } else {
          ctx.translate(s.x, s.y);
          ctx.rotate(s.facing);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, s.radius, -s.halfArc, s.halfArc);
          ctx.closePath();
          ctx.rotate(-s.facing);
          ctx.translate(-s.x, -s.y);
        }
        if (active) {
          ctx.fillStyle = 'rgba(255,90,80,0.55)';
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255,80,80,${0.08 + k * 0.22})`;
          ctx.fill();
          ctx.lineWidth = 2 + k * 3;
          ctx.strokeStyle = `rgba(255,120,110,${0.4 + k * 0.5})`;
          ctx.stroke();
        }
        ctx.restore();
      }

      for (const p of projectiles) p.render(ctx);
    },

    clear() {
      projectiles.length = 0;
      telegraphs.length = 0;
    },
  };
}
