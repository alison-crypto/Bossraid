// Base class for bosses. Handles the shared machinery — HP, HP-gated phase
// transitions, a small timed-callback scheduler for choreographing multi-step
// attacks, movement helpers, hit flashing, and a default render — so concrete
// bosses (golem.js, wraith.js) only describe their attack patterns.
//
// A concrete boss supplies a `decide(boss, ctx)` function. It is called when
// the boss is idle (no action in progress); it should kick off an attack by
// scheduling telegraphs/projectiles and calling `boss.busy(seconds)` to reserve
// time for the whole sequence. `ctx = { player, spawner, effects, bounds }`.

import { vec, sub, normalize, dist } from '../engine/vec2.js';
import { tickCombatTimers } from '../systems/combat.js';

export function createBoss(config) {
  const phases = config.phases ?? [{ threshold: 1, name: config.name }];

  return {
    name: config.name,
    pos: vec(config.x, config.y),
    r: config.r ?? 46,
    color: config.color ?? '#b06ad0',
    maxHp: config.maxHp,
    hp: config.maxHp,
    speed: config.speed ?? 70,

    hitFlash: 0,
    invuln: 0,
    dead: false,

    phases,
    phaseIndex: 0,
    decide: config.decide,
    draw: config.draw, // optional custom body renderer(ctx, boss)

    // Scheduling / pacing.
    busyTimer: 0,
    _timers: [],
    // Per-boss scratch space for attack state machines.
    state: {},
    intro: 0.8, // brief grace period before the boss starts attacking

    get x() {
      return this.pos.x;
    },
    get y() {
      return this.pos.y;
    },
    get hpFraction() {
      return this.hp / this.maxHp;
    },
    get phaseName() {
      return this.phases[this.phaseIndex]?.name ?? this.name;
    },

    // Reserve `seconds` before the next decision (the current attack's length).
    busy(seconds) {
      this.busyTimer = Math.max(this.busyTimer, seconds);
    },

    // Run `fn(ctx)` after `delay` seconds (driven by simulation time).
    schedule(delay, fn) {
      this._timers.push({ t: delay, fn });
    },

    // Move toward a point at `speed` px/s, capped so we don't overshoot.
    moveToward(target, dt, speed = this.speed) {
      const d = sub(target, this.pos);
      const dst = Math.hypot(d.x, d.y);
      if (dst < 1) return;
      const step = Math.min(dst, speed * dt);
      const n = normalize(d);
      this.pos.x += n.x * step;
      this.pos.y += n.y * step;
    },

    distanceTo(p) {
      return dist(this.pos, p);
    },

    updatePhase(effects) {
      // Advance to the deepest phase whose threshold we've dropped below.
      let next = this.phaseIndex;
      for (let i = this.phaseIndex + 1; i < this.phases.length; i++) {
        if (this.hpFraction <= this.phases[i].threshold) next = i;
      }
      if (next !== this.phaseIndex) {
        this.phaseIndex = next;
        this.invuln = 0.6; // brief armor during the transition flourish
        if (effects) {
          effects.shake(14, 0.5);
          effects.burst(this.x, this.y, 30, this.color, { speed: 260, life: 0.6 });
        }
        if (config.onPhase) config.onPhase(this, this.phaseIndex);
      }
    },

    update(dt, ctx) {
      if (this.dead) return;
      tickCombatTimers(this, dt);
      this.updatePhase(ctx.effects);

      if (this.intro > 0) {
        this.intro -= dt;
      }

      // Continuous per-frame behavior (e.g. slow chasing), runs even mid-attack.
      if (config.onUpdate) config.onUpdate(this, dt, ctx);

      // Fire any due scheduled callbacks.
      for (let i = this._timers.length - 1; i >= 0; i--) {
        const timer = this._timers[i];
        timer.t -= dt;
        if (timer.t <= 0) {
          this._timers.splice(i, 1);
          timer.fn(ctx);
        }
      }

      if (this.busyTimer > 0) this.busyTimer -= dt;

      // Idle and past the intro → choose the next action.
      if (this.intro <= 0 && this.busyTimer <= 0 && this.decide) {
        this.decide(this, ctx);
      }
    },

    render(ctx) {
      if (this.dead) return;
      ctx.save();
      if (this.invuln > 0) {
        ctx.globalAlpha = 0.7 + Math.sin(performance.now() / 40) * 0.15;
      }
      if (this.draw) {
        this.draw(ctx, this);
      } else {
        ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}
