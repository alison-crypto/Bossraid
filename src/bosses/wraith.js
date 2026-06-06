// The Wraith — the second boss. Where the Golem is a grounded bruiser, the
// Wraith is an evasive caster that kites the player and leans on ranged
// bullet-patterns, proving the `Boss` base class generalizes to a very
// different playstyle. Phases escalate pattern density and add blink-spam.
//   Phase 1 (>60% HP): Nova + Lance.
//   Phase 2 (<=60%):   adds Blink reposition, faster casts.
//   Phase 3 (<=30%):   double-ring Nova, frequent blinks — frantic.

import { createBoss } from '../entities/boss.js';
import { fromAngle, clamp } from '../engine/vec2.js';

const PACE = [
  { windup: 1.0, rest: 0.85 },
  { windup: 0.82, rest: 0.6 },
  { windup: 0.65, rest: 0.42 },
];

const ATTACKS = {
  // Expanding ring of projectiles in all directions.
  nova(boss, ctx) {
    const { spawner } = ctx;
    const phase = boss.phaseIndex;
    const p = PACE[phase];
    const windup = 0.6 * p.windup;
    const count = phase >= 2 ? 18 : phase >= 1 ? 14 : 11;
    spawner.spawnTelegraph({
      shape: { type: 'circle', x: boss.x, y: boss.y, radius: boss.r + 12 },
      windup,
      active: 0.01,
      damage: 0,
      color: '#7ad0ff',
    });
    boss.state.anim = { type: 'charge', t: 0, dur: windup };
    boss.schedule(windup, () => {
      const off = Math.random() * Math.PI;
      const rings = phase >= 2 ? 2 : 1;
      for (let ring = 0; ring < rings; ring++) {
        for (let i = 0; i < count; i++) {
          const a = off + (Math.PI * 2 * i) / count + ring * (Math.PI / count);
          const v = fromAngle(a, 200 + ring * 60);
          spawner.spawnProjectile({
            x: boss.x,
            y: boss.y,
            vx: v.x,
            vy: v.y,
            r: 8,
            damage: 11,
            color: '#7ad0ff',
          });
        }
      }
      ctx.effects.shake(5, 0.16);
    });
    boss.busy(windup + 0.4 + p.rest);
  },

  // Fast, narrow lance aimed at the player — high damage, tight dodge window.
  lance(boss, ctx) {
    const { spawner, player } = ctx;
    const p = PACE[boss.phaseIndex];
    const windup = 0.5 * p.windup;
    const facing = Math.atan2(player.y - boss.y, player.x - boss.x);
    spawner.spawnTelegraph({
      shape: { type: 'cone', x: boss.x, y: boss.y, facing, halfArc: 0.22, radius: 520 },
      windup,
      active: 0.14,
      damage: 28,
      color: '#c08aff',
    });
    boss.state.anim = { type: 'cast', t: 0, dur: windup + 0.14 };
    boss.busy(windup + 0.14 + p.rest);
  },

  // Vanish and reappear at distance, then spit a small aimed burst.
  blink(boss, ctx) {
    const { effects, bounds, player } = ctx;
    boss.state.anim = { type: 'blink', t: 0, dur: 0.5 };
    effects.burst(boss.x, boss.y, 20, '#c08aff', { speed: 220, life: 0.5 });
    boss.invuln = 0.5;
    boss.schedule(0.22, (c) => {
      // Reappear on the far side of the arena from the player.
      const fx = player.x < bounds.x + bounds.w / 2 ? 0.78 : 0.22;
      const fy = player.y < bounds.y + bounds.h / 2 ? 0.78 : 0.22;
      boss.pos.x = clamp(bounds.x + bounds.w * fx, bounds.x + boss.r, bounds.x + bounds.w - boss.r);
      boss.pos.y = clamp(bounds.y + bounds.h * fy, bounds.y + boss.r, bounds.y + bounds.h - boss.r);
      c.effects.burst(boss.x, boss.y, 20, '#c08aff', { speed: 220, life: 0.5 });
      const base = Math.atan2(player.y - boss.y, player.x - boss.x);
      for (let i = -1; i <= 1; i++) {
        const v = fromAngle(base + i * 0.25, 320);
        c.spawner.spawnProjectile({
          x: boss.x,
          y: boss.y,
          vx: v.x,
          vy: v.y,
          r: 8,
          damage: 12,
          color: '#c08aff',
        });
      }
    });
    boss.busy(0.5 + PACE[boss.phaseIndex].rest);
  },
};

function decide(boss, ctx) {
  const phase = boss.phaseIndex;
  const d = boss.distanceTo(ctx.player);
  const pool = [
    { a: 'nova', w: d < 240 ? 3.5 : 1.5 },
    { a: 'lance', w: 2.5 },
  ];
  if (phase >= 1) pool.push({ a: 'blink', w: d < 160 ? 3 : 1 });

  const filtered = pool.filter((e) => e.a !== boss.state.last);
  const usable = filtered.length ? filtered : pool;
  const total = usable.reduce((s, e) => s + e.w, 0);
  let roll = Math.random() * total;
  let choice = usable[usable.length - 1].a;
  for (const e of usable) {
    roll -= e.w;
    if (roll <= 0) {
      choice = e.a;
      break;
    }
  }
  boss.state.last = choice;
  ATTACKS[choice](boss, ctx);
}

function onUpdate(boss, dt, ctx) {
  if (boss.state.anim) {
    boss.state.anim.t += dt;
    if (boss.state.anim.t >= boss.state.anim.dur) boss.state.anim = null;
  }
  if (boss.busyTimer > 0) return;
  // Kite: keep distance from the player.
  const d = boss.distanceTo(ctx.player);
  if (d < 220) {
    const ax = Math.atan2(boss.y - ctx.player.y, boss.x - ctx.player.x);
    boss.pos.x += Math.cos(ax) * boss.speed * dt;
    boss.pos.y += Math.sin(ax) * boss.speed * dt;
    boss.pos.x = clamp(boss.pos.x, ctx.bounds.x + boss.r, ctx.bounds.x + ctx.bounds.w - boss.r);
    boss.pos.y = clamp(boss.pos.y, ctx.bounds.y + boss.r, ctx.bounds.y + ctx.bounds.h - boss.r);
  }
}

function draw(ctx, boss) {
  const anim = boss.state.anim;
  let glow = 0.5;
  let scale = 1;
  if (anim) {
    const k = anim.t / anim.dur;
    if (anim.type === 'charge' || anim.type === 'cast') glow = 0.5 + k * 0.5;
    if (anim.type === 'blink') scale = Math.abs(Math.cos(k * Math.PI)); // shrink/grow
  }
  const flash = boss.hitFlash > 0;

  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.scale(scale, scale);

  // Wispy outer aura.
  ctx.fillStyle = `rgba(150,110,220,${0.25 * glow})`;
  ctx.beginPath();
  ctx.arc(0, 0, boss.r + 8, 0, Math.PI * 2);
  ctx.fill();

  // Diamond body.
  ctx.beginPath();
  ctx.moveTo(0, -boss.r);
  ctx.lineTo(boss.r * 0.8, 0);
  ctx.lineTo(0, boss.r);
  ctx.lineTo(-boss.r * 0.8, 0);
  ctx.closePath();
  ctx.fillStyle = flash ? '#ffffff' : boss.color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#e2c8ff';
  ctx.stroke();

  // Core eye.
  ctx.fillStyle = `rgba(220,180,255,${0.6 + glow * 0.4})`;
  ctx.shadowColor = '#c08aff';
  ctx.shadowBlur = 18 * glow;
  ctx.beginPath();
  ctx.arc(0, 0, boss.r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createWraith(x, y) {
  return createBoss({
    name: 'Hollow Wraith',
    x,
    y,
    r: 38,
    maxHp: 440,
    color: '#6a4fa0',
    speed: 120,
    phases: [
      { threshold: 1, name: 'Hollow Wraith' },
      { threshold: 0.6, name: 'Hollow Wraith — Unbound' },
      { threshold: 0.3, name: 'Hollow Wraith — Frenzied' },
    ],
    decide,
    onUpdate,
    draw,
  });
}
