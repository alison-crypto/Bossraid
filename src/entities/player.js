// The player-controlled hero: movement, dash with i-frames, and light/heavy
// melee attacks with telegraphed wind-ups. The entity is self-contained — it
// reads input and produces an `activeSwing` that the fight scene resolves
// against the boss via the combat system.

import { vec, normalize, fromAngle, clamp } from '../engine/vec2.js';
import { tickCombatTimers } from '../systems/combat.js';

const SPEED = 250; // walk speed (px/s)
const RADIUS = 14;

const DASH_SPEED = 760;
const DASH_TIME = 0.16; // seconds of dash movement
const DASH_IFRAMES = 0.22; // invulnerability window (>= dash time)
const DASH_COOLDOWN = 0.55;
const DASH_COST = 25;

const STAMINA_MAX = 100;
const STAMINA_REGEN = 38; // per second
const STAMINA_REGEN_DELAY = 0.4; // pause after spending

// Attack archetypes. Times are in seconds for each phase of the swing.
const ATTACKS = {
  light: {
    windup: 0.07,
    active: 0.1,
    recover: 0.16,
    damage: 9,
    halfArc: 0.95,
    range: 62,
    cost: 10,
    heavy: false,
  },
  heavy: {
    windup: 0.26,
    active: 0.12,
    recover: 0.32,
    damage: 24,
    halfArc: 0.7,
    range: 84,
    cost: 30,
    heavy: true,
  },
};

export function createPlayer(x, y) {
  return {
    pos: vec(x, y),
    vel: vec(0, 0),
    r: RADIUS,
    get x() {
      return this.pos.x;
    },
    get y() {
      return this.pos.y;
    },

    maxHp: 100,
    hp: 100,
    maxStamina: STAMINA_MAX,
    stamina: STAMINA_MAX,
    staminaDelay: 0,

    facing: 0, // radians, toward the mouse
    invuln: 0,
    hitFlash: 0,
    dead: false,

    dashTimer: 0,
    dashCooldown: 0,
    dashDir: vec(1, 0),

    // Active attack: { def, type, phase, time, hasHit, swingId } or null.
    attack: null,
    swingId: 0,
    // Set while an attack's active window is live (consumed by the scene).
    activeSwing: null,

    get isDashing() {
      return this.dashTimer > 0;
    },
    get dashReady() {
      return this.dashCooldown <= 0;
    },

    update(dt, input, bounds) {
      if (this.dead) return;
      tickCombatTimers(this, dt);

      if (this.dashCooldown > 0) this.dashCooldown -= dt;
      if (this.staminaDelay > 0) this.staminaDelay -= dt;
      else if (this.stamina < this.maxStamina) {
        this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * dt);
      }

      // Aim toward the mouse cursor.
      this.facing = Math.atan2(input.mouse.y - this.pos.y, input.mouse.x - this.pos.x);

      // Movement intent from WASD / arrows.
      const move = vec(
        (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0),
        (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0)
      );
      const dir = normalize(move);

      // --- Dash -------------------------------------------------------------
      if (
        input.wasPressed('dash') &&
        this.dashCooldown <= 0 &&
        this.stamina >= DASH_COST &&
        !this.isDashing
      ) {
        // Dash toward movement intent, else toward the cursor.
        this.dashDir = move.x === 0 && move.y === 0 ? fromAngle(this.facing) : dir;
        this.dashTimer = DASH_TIME;
        this.dashCooldown = DASH_COOLDOWN;
        this.invuln = Math.max(this.invuln, DASH_IFRAMES);
        this.spendStamina(DASH_COST);
        this.attack = null; // dashing cancels a wind-up
        this.activeSwing = null;
      }

      // --- Attacks ----------------------------------------------------------
      if (!this.isDashing && !this.attack) {
        const wantLight = input.wasPressed('light') || input.mousePressed('left');
        const wantHeavy = input.wasPressed('heavy') || input.mousePressed('right');
        if (wantHeavy && this.stamina >= ATTACKS.heavy.cost) {
          this.startAttack('heavy');
        } else if (wantLight && this.stamina >= ATTACKS.light.cost) {
          this.startAttack('light');
        }
      }
      this.updateAttack(dt);

      // --- Apply velocity ---------------------------------------------------
      if (this.isDashing) {
        this.dashTimer -= dt;
        this.vel = { x: this.dashDir.x * DASH_SPEED, y: this.dashDir.y * DASH_SPEED };
      } else {
        // Attacking roots the hero a little for weighty feel.
        const slow = this.attack ? 0.35 : 1;
        this.vel = { x: dir.x * SPEED * slow, y: dir.y * SPEED * slow };
      }

      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;

      // Keep inside the arena.
      this.pos.x = clamp(this.pos.x, bounds.x + this.r, bounds.x + bounds.w - this.r);
      this.pos.y = clamp(this.pos.y, bounds.y + this.r, bounds.y + bounds.h - this.r);
    },

    spendStamina(amount) {
      this.stamina = Math.max(0, this.stamina - amount);
      this.staminaDelay = STAMINA_REGEN_DELAY;
    },

    startAttack(type) {
      const def = ATTACKS[type];
      this.spendStamina(def.cost);
      this.swingId += 1;
      this.attack = { def, type, phase: 'windup', time: 0, hasHit: false };
    },

    updateAttack(dt) {
      this.activeSwing = null;
      const a = this.attack;
      if (!a) return;
      a.time += dt;
      const { windup, active, recover } = a.def;
      if (a.time < windup) {
        a.phase = 'windup';
      } else if (a.time < windup + active) {
        a.phase = 'active';
        // Expose the live swing once per attack so the scene can resolve it.
        if (!a.hasHit) {
          this.activeSwing = {
            x: this.pos.x,
            y: this.pos.y,
            facing: this.facing,
            halfArc: a.def.halfArc,
            radius: a.def.range,
            damage: a.def.damage,
            heavy: a.def.heavy,
            crit: a.def.heavy,
            swingId: this.swingId,
          };
        }
      } else if (a.time < windup + active + recover) {
        a.phase = 'recover';
      } else {
        this.attack = null;
      }
    },

    // Called by the scene after a swing connects, to prevent multi-hits.
    markSwingResolved() {
      if (this.attack) this.attack.hasHit = true;
    },

    render(ctx) {
      const { x, y } = this.pos;

      // Dash afterimage trail.
      if (this.isDashing) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#7fd0ff';
        for (let i = 1; i <= 3; i++) {
          const t = i * 0.04;
          ctx.beginPath();
          ctx.arc(x - this.vel.x * t, y - this.vel.y * t, this.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Attack telegraph / swing arc.
      if (this.attack) {
        const a = this.attack;
        const live = a.phase === 'active';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.facing);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, a.def.range, -a.def.halfArc, a.def.halfArc);
        ctx.closePath();
        if (live) {
          ctx.fillStyle = a.def.heavy ? 'rgba(255,150,90,0.5)' : 'rgba(255,255,255,0.32)';
        } else {
          // Wind-up: faint, pulsing telegraph.
          const k = a.time / a.def.windup;
          ctx.fillStyle = a.def.heavy
            ? `rgba(255,120,60,${0.1 + k * 0.18})`
            : `rgba(220,220,255,${0.06 + k * 0.12})`;
        }
        ctx.fill();
        ctx.restore();
      }

      // Body.
      const flash = this.hitFlash > 0;
      ctx.fillStyle = flash ? '#ffffff' : this.invuln > 0 ? '#9fe0ff' : '#5ec8ff';
      ctx.beginPath();
      ctx.arc(x, y, this.r, 0, Math.PI * 2);
      ctx.fill();

      // Facing indicator.
      const tip = fromAngle(this.facing, this.r + 6);
      ctx.strokeStyle = '#0a0b11';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + tip.x, y + tip.y);
      ctx.stroke();
    },
  };
}
