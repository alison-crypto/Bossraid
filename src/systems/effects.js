// Visual/feel "juice": screen shake, hit-stop, particles, and damage numbers.
//
// The fight scene owns one Effects instance, feeds it `update(dt)`, applies the
// camera shake offset before drawing the world, and calls `render(ctx)` to draw
// particles + numbers on top.

const TWO_PI = Math.PI * 2;

export function createEffects() {
  let shakeTime = 0;
  let shakeDur = 0;
  let shakeMag = 0;

  let hitStop = 0; // seconds of remaining time-freeze

  const particles = [];
  const numbers = [];

  return {
    // --- Triggers -----------------------------------------------------------
    shake(magnitude, duration = 0.25) {
      // Don't let a small shake stomp a bigger ongoing one.
      if (magnitude >= shakeMag || shakeTime <= 0) {
        shakeMag = magnitude;
        shakeDur = duration;
        shakeTime = duration;
      }
    },

    // Briefly freeze simulation for impact emphasis. Caller decides how the
    // freeze is consumed (see `consumeHitStop`).
    hitStop(seconds) {
      hitStop = Math.max(hitStop, seconds);
    },

    burst(x, y, count, color, opts = {}) {
      const speed = opts.speed ?? 180;
      const spread = opts.spread ?? speed * 0.6;
      const life = opts.life ?? 0.45;
      const size = opts.size ?? 3;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TWO_PI;
        const s = speed + (Math.random() - 0.5) * 2 * spread;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life,
          maxLife: life,
          color,
          size: size + Math.random() * size,
        });
      }
    },

    damageNumber(x, y, amount, opts = {}) {
      numbers.push({
        x: x + (Math.random() - 0.5) * 14,
        y,
        vy: -42,
        life: opts.life ?? 0.8,
        maxLife: opts.life ?? 0.8,
        text: Math.round(amount).toString(),
        color: opts.color ?? '#ffe27a',
        size: opts.size ?? 20,
        crit: opts.crit ?? false,
      });
    },

    // --- State queries ------------------------------------------------------
    get isFrozen() {
      return hitStop > 0;
    },

    // Advance/consume the hit-stop clock by real `dt`. Returns true while the
    // simulation should stay frozen this frame.
    consumeHitStop(dt) {
      if (hitStop > 0) {
        hitStop = Math.max(0, hitStop - dt);
        return true;
      }
      return false;
    },

    // Current camera offset from shake; apply before drawing the world.
    get shakeOffset() {
      if (shakeTime <= 0) return { x: 0, y: 0 };
      const k = shakeTime / shakeDur; // decays 1 -> 0
      const m = shakeMag * k * k;
      return {
        x: (Math.random() - 0.5) * 2 * m,
        y: (Math.random() - 0.5) * 2 * m,
      };
    },

    // --- Lifecycle ----------------------------------------------------------
    update(dt) {
      if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }

      for (let i = numbers.length - 1; i >= 0; i--) {
        const n = numbers[i];
        n.life -= dt;
        if (n.life <= 0) {
          numbers.splice(i, 1);
          continue;
        }
        n.y += n.vy * dt;
        n.vy *= 0.9;
      }
    },

    render(ctx) {
      for (const p of particles) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const n of numbers) {
        const a = Math.max(0, Math.min(1, n.life / n.maxLife));
        const grow = n.crit ? 1 + (1 - a) * 0.5 : 1;
        ctx.globalAlpha = a;
        ctx.font = `bold ${n.size * grow}px 'Trebuchet MS', sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(n.text, n.x, n.y);
        ctx.fillStyle = n.color;
        ctx.fillText(n.text, n.x, n.y);
      }
      ctx.globalAlpha = 1;
    },

    clear() {
      particles.length = 0;
      numbers.length = 0;
      shakeTime = 0;
      hitStop = 0;
    },
  };
}
