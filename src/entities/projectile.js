// A simple moving projectile. Boss attacks spawn these via the spawner; they
// travel in a straight line and damage the player on contact.

import { vec } from '../engine/vec2.js';

export function createProjectile({ x, y, vx, vy, r = 8, damage = 10, color = '#ff8a5c', life = 4 }) {
  return {
    pos: vec(x, y),
    vel: vec(vx, vy),
    r,
    damage,
    color,
    life,
    dead: false,
    spin: Math.random() * Math.PI,

    get x() {
      return this.pos.x;
    },
    get y() {
      return this.pos.y;
    },

    update(dt, bounds) {
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.spin += dt * 8;
      this.life -= dt;
      const m = this.r + 40;
      if (
        this.life <= 0 ||
        this.pos.x < bounds.x - m ||
        this.pos.x > bounds.x + bounds.w + m ||
        this.pos.y < bounds.y - m ||
        this.pos.y > bounds.y + bounds.h + m
      ) {
        this.dead = true;
      }
    },

    render(ctx) {
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(this.spin);
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  };
}
