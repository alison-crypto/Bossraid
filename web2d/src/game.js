// Headless game simulation for Bossraid 2D — a top-down boss arena.
// Logic is kept separate from rendering/input (see main.js for the canvas layer)
// so the whole simulation is deterministic and unit-testable: feed `step` a
// state, an input, and a dt, and assert on the result. This mirrors the project
// principle "logic separate from rendering" (see docs/ROADMAP.md).

import { maxHP, lightDamage, heavyDamage, damageTaken } from "./stats.js";

export const CFG = {
  arenaW: 960, arenaH: 600,
  // Player
  playerR: 14, playerSpeed: 220, attackCd: 0.35, meleeRange: 70,
  dodgeSpeed: 560, dodgeTime: 0.22, dodgeIframes: 0.30, hitInvuln: 0.6,
  // Boss (telegraphed slam: chase -> windup -> strike -> recover). The slam is a
  // melee smash centered ON the golem (matches the animation), so slamR is how
  // far the shockwave around it reaches — not a ranged AoE at the player.
  bossR: 40, bossSpeed: 95, bossMaxHp: 600,
  slamR: 130, windup: 1.0, strike: 0.15, recover: 0.6, bossCd: 1.6, bossDmg: 22,
};

// --- tiny vector helpers ----------------------------------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function unit(v) {
  const l = len(v);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}

export function emptyInput() {
  return { move: { x: 0, y: 0 }, attack: false, heavy: false, dodge: false };
}

export function createGame(opts = {}) {
  const str = opts.str ?? 10, dex = opts.dex ?? 12, con = opts.con ?? 10;
  const def = opts.def ?? 0, weaponDmg = opts.weaponDmg ?? 50;
  const hp = maxHP(con, str);
  return {
    t: 0,
    over: null, // null | "won" | "lost"
    player: {
      x: CFG.arenaW * 0.5, y: CFG.arenaH * 0.72, r: CFG.playerR,
      str, dex, con, def, weaponDmg,
      hp, maxHp: hp,
      facing: { x: 0, y: -1 },
      invuln: 0, attackCd: 0,
      dodge: { t: 0, dir: { x: 0, y: 0 } },
      lastHit: 0,
    },
    boss: {
      x: CFG.arenaW * 0.5, y: CFG.arenaH * 0.28, r: CFG.bossR,
      hp: CFG.bossMaxHp, maxHp: CFG.bossMaxHp,
      state: "idle", t: 0, cd: CFG.bossCd,
      slam: { x: 0, y: 0, active: false },
      lastHit: 0,
    },
  };
}

// Advance the simulation by dt seconds. Mutates and returns `s`.
export function step(s, input, dt) {
  if (s.over) return s;
  const i = input || emptyInput();
  const p = s.player, b = s.boss;
  s.t += dt;

  // Timers
  p.invuln = Math.max(0, p.invuln - dt);
  p.attackCd = Math.max(0, p.attackCd - dt);

  // Dodge start (dash with i-frames) — direction from input, else current facing.
  if (i.dodge && p.dodge.t <= 0) {
    const d = (i.move.x || i.move.y) ? unit(i.move) : p.facing;
    p.dodge.t = CFG.dodgeTime;
    p.dodge.dir = d;
    p.invuln = Math.max(p.invuln, CFG.dodgeIframes);
  }

  // Movement (dodging overrides steering)
  let vx = 0, vy = 0;
  if (p.dodge.t > 0) {
    p.dodge.t = Math.max(0, p.dodge.t - dt);
    vx = p.dodge.dir.x * CFG.dodgeSpeed;
    vy = p.dodge.dir.y * CFG.dodgeSpeed;
  } else {
    const m = unit(i.move);
    if (m.x || m.y) p.facing = m;
    vx = m.x * CFG.playerSpeed;
    vy = m.y * CFG.playerSpeed;
  }
  p.x = clamp(p.x + vx * dt, p.r, CFG.arenaW - p.r);
  p.y = clamp(p.y + vy * dt, p.r, CFG.arenaH - p.r);

  // Attack (light or heavy) — front arc, within range.
  if ((i.attack || i.heavy) && p.attackCd <= 0 && p.dodge.t <= 0) {
    p.attackCd = CFG.attackCd;
    const to = sub(b, p);
    if (len(to) <= CFG.meleeRange + b.r && dot(p.facing, unit(to)) >= 0) {
      const dmg = i.heavy
        ? heavyDamage(p.str, p.dex, p.weaponDmg)
        : lightDamage(p.str, p.dex, p.weaponDmg);
      b.hp = Math.max(0, b.hp - dmg);
      b.lastHit = dmg;
      if (b.hp <= 0) s.over = "won";
    }
  }

  _bossUpdate(s, dt);
  return s;
}

function _bossUpdate(s, dt) {
  const p = s.player, b = s.boss;
  const to = sub(p, b);
  const d = len(to);

  switch (b.state) {
    case "idle": {
      if (d > CFG.meleeRange) {
        const u = unit(to);
        b.x += u.x * CFG.bossSpeed * dt;
        b.y += u.y * CFG.bossSpeed * dt;
      }
      b.cd -= dt;
      // Smash only once the player is actually within the shockwave reach, so
      // the golem closes in first instead of slamming at empty air.
      if (b.cd <= 0 && d <= CFG.slamR) {
        b.state = "windup";
        b.t = CFG.windup;
        b.slam = { x: b.x, y: b.y, active: true }; // centered on the golem itself
      }
      break;
    }
    case "windup": {
      b.t -= dt;
      if (b.t <= 0) {
        b.state = "strike";
        b.t = CFG.strike;
        // Resolve the slam: did the player leave the ring (or dodge/i-frame it)?
        if (dist(p, b.slam) <= CFG.slamR && p.invuln <= 0) {
          const dmg = damageTaken(CFG.bossDmg, p.def);
          p.hp = Math.max(0, p.hp - dmg);
          p.lastHit = dmg;
          p.invuln = CFG.hitInvuln;
          if (p.hp <= 0) s.over = "lost";
        }
      }
      break;
    }
    case "strike": {
      b.t -= dt;
      if (b.t <= 0) { b.state = "recover"; b.t = CFG.recover; b.slam.active = false; }
      break;
    }
    case "recover": {
      b.t -= dt;
      if (b.t <= 0) { b.state = "idle"; b.cd = CFG.bossCd; }
      break;
    }
  }
}
