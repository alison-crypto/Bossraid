// The Golem — the first boss. A heavy melee bruiser with three telegraphed
// attacks that escalate across three HP-gated phases:
//   Phase 1 (>66% HP): Slam + Sweep.
//   Phase 2 (<=66%):   adds the rock Volley and chases faster.
//   Phase 3 (<=33%):   shorter wind-ups, double Slam, bigger Volley — enraged.

import { createBoss } from '../entities/boss.js';
import { fromAngle } from '../engine/vec2.js';

// Per-phase pacing multipliers (wind-up scale, rest after an attack, chase mult).
const PACE = [
  { windup: 1.0, rest: 0.95, chase: 1.0 },
  { windup: 0.85, rest: 0.7, chase: 1.3 },
  { windup: 0.68, rest: 0.5, chase: 1.6 },
];

const ATTACKS = {
  // Ground slam centered on the player's current position.
  slam(boss, ctx, opts = {}) {
    const { spawner, player } = ctx;
    const p = PACE[boss.phaseIndex];
    const windup = (opts.windup ?? 0.85) * p.windup;
    const x = player.x;
    const y = player.y;
    spawner.spawnTelegraph({
      shape: { type: 'circle', x, y, radius: 96 },
      windup,
      active: 0.18,
      damage: 26,
      color: '#ff5a4a',
    });
    boss.state.anim = { type: 'slam', t: 0, dur: windup + 0.18 };
    if (!opts.chained) boss.busy(windup + 0.18 + p.rest);
  },

  // Cone sweep in front of the golem, aimed at the player.
  sweep(boss, ctx) {
    const { spawner, player } = ctx;
    const p = PACE[boss.phaseIndex];
    const windup = 0.62 * p.windup;
    const facing = Math.atan2(player.y - boss.y, player.x - boss.x);
    spawner.spawnTelegraph({
      shape: { type: 'cone', x: boss.x, y: boss.y, facing, halfArc: 1.0, radius: 195 },
      windup,
      active: 0.16,
      damage: 22,
    });
    boss.state.anim = { type: 'sweep', t: 0, dur: windup + 0.16 };
    boss.busy(windup + 0.16 + p.rest);
  },

  // Charge, then fire a fan of rocks toward the player.
  volley(boss, ctx) {
    const { spawner, player } = ctx;
    const p = PACE[boss.phaseIndex];
    const windup = 0.7 * p.windup;
    const count = boss.phaseIndex >= 2 ? 9 : 6;
    // Visual-only charge ring on the golem (0 damage).
    spawner.spawnTelegraph({
      shape: { type: 'circle', x: boss.x, y: boss.y, radius: boss.r + 14 },
      windup,
      active: 0.01,
      damage: 0,
      color: '#ffb14a',
    });
    boss.state.anim = { type: 'charge', t: 0, dur: windup };
    boss.schedule(windup, () => {
      const base = Math.atan2(player.y - boss.y, player.x - boss.x);
      const spread = 0.9;
      for (let i = 0; i < count; i++) {
        const a = base - spread / 2 + (spread * i) / (count - 1);
        const v = fromAngle(a, 340);
        spawner.spawnProjectile({
          x: boss.x + Math.cos(a) * (boss.r + 6),
          y: boss.y + Math.sin(a) * (boss.r + 6),
          vx: v.x,
          vy: v.y,
          r: 9,
          damage: 12,
          color: '#ffb14a',
        });
      }
      ctx.effects.shake(6, 0.18);
    });
    boss.busy(windup + 0.45 + p.rest);
  },
};

function weightedPick(pool) {
  const total = pool.reduce((s, e) => s + e.w, 0);
  let roll = Math.random() * total;
  for (const e of pool) {
    roll -= e.w;
    if (roll <= 0) return e.a;
  }
  return pool[pool.length - 1].a;
}

function decide(boss, ctx) {
  const d = boss.distanceTo(ctx.player);
  const phase = boss.phaseIndex;

  const pool = [{ a: 'slam', w: d < 280 ? 3 : 2 }];
  if (d < 215) pool.push({ a: 'sweep', w: 3 });
  if (phase >= 1) pool.push({ a: 'volley', w: d > 190 ? 3.5 : 1.5 });

  // Avoid immediately repeating the previous attack to keep fights varied.
  const filtered = pool.filter((e) => e.a !== boss.state.last) || pool;
  const choice = weightedPick(filtered.length ? filtered : pool);
  boss.state.last = choice;

  ATTACKS[choice](boss, ctx);

  // Enraged: chain a second slam onto the first.
  if (choice === 'slam' && phase >= 2) {
    const p = PACE[phase];
    boss.schedule(0.5, (c) => ATTACKS.slam(boss, c, { windup: 0.7, chained: true }));
    boss.busy(0.5 + 0.7 * p.windup + 0.18 + p.rest);
  }
}

function onUpdate(boss, dt, ctx) {
  // Advance the body-animation clock used by the renderer.
  if (boss.state.anim) {
    boss.state.anim.t += dt;
    if (boss.state.anim.t >= boss.state.anim.dur) boss.state.anim = null;
  }
  // Hold position while committed to an attack; otherwise lumber toward the
  // player but keep a little spacing.
  if (boss.busyTimer > 0) return;
  const d = boss.distanceTo(ctx.player);
  if (d > 95) boss.moveToward(ctx.player, dt, boss.speed * PACE[boss.phaseIndex].chase);
}

// Custom body renderer: a hexagonal rock with a glowing core that pulses while
// charging and lunges forward during a slam/sweep.
function draw(ctx, boss) {
  const anim = boss.state.anim;
  let lunge = 0;
  let glow = 0.4;
  if (anim) {
    const k = anim.t / anim.dur;
    if (anim.type === 'slam' || anim.type === 'sweep') {
      lunge = Math.sin(Math.min(1, k) * Math.PI) * 10;
    } else if (anim.type === 'charge') {
      glow = 0.4 + k * 0.6;
    }
  }

  ctx.save();
  ctx.translate(boss.x, boss.y + lunge * 0.2);
  const flash = boss.hitFlash > 0;

  // Rocky body (hexagon).
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const rr = boss.r + (i % 2 ? -4 : 2);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = flash ? '#ffffff' : boss.color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3a2a44';
  ctx.stroke();

  // Glowing core.
  ctx.fillStyle = `rgba(255,${120 + glow * 60},${60},${glow})`;
  ctx.shadowColor = '#ff8a3a';
  ctx.shadowBlur = 20 * glow;
  ctx.beginPath();
  ctx.arc(0, 0, boss.r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createGolem(x, y) {
  return createBoss({
    name: 'Stone Golem',
    x,
    y,
    r: 48,
    maxHp: 520,
    color: '#8a6a55',
    speed: 64,
    phases: [
      { threshold: 1, name: 'Stone Golem' },
      { threshold: 0.66, name: 'Stone Golem — Cracked' },
      { threshold: 0.33, name: 'Stone Golem — Enraged' },
    ],
    decide,
    onUpdate,
    draw,
  });
}
