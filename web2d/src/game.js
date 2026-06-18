// Headless game simulation for Bossraid 2D — a top-down boss arena.
// Logic is kept separate from rendering/input (see main.js for the canvas layer)
// so the whole simulation is deterministic and unit-testable: feed `step` a
// state, an input, and a dt, and assert on the result. This mirrors the project
// principle "logic separate from rendering" (see docs/ROADMAP.md).

import { maxHP, lightDamage, heavyDamage, damageTaken } from "./stats.js";

export const CFG = {
  arenaW: 960, arenaH: 600,
  // Player (archer): shoots arrows in the facing direction. Light = quick shot,
  // heavy = a slower, stronger charged shot. meleeRange is kept as the boss's
  // chase-stop distance, not a player reach.
  playerR: 14, playerSpeed: 220, meleeRange: 70,
  attackCd: 0.35, heavyAttackCd: 0.7, arrowSpeed: 720, arrowR: 6,
  dodgeSpeed: 560, dodgeTime: 0.22, dodgeIframes: 0.30, hitInvuln: 0.6,
  // Boss. Every attack runs chase -> windup (telegraph) -> strike (active) ->
  // recover, and any hit is negated while the player is invulnerable — so a
  // well-timed dodge i-frames all five patterns. The golem is fast and
  // relentless so a ranged archer can't trivially kite it. bossCd is the gap
  // between attacks.
  bossR: 40, bossSpeed: 165, bossMaxHp: 600, bossCd: 1.5,
  // 1) smash — melee shockwave ring centered on the golem (used in close range).
  slamR: 130, windup: 0.9, strike: 0.15, recover: 0.55, bossDmg: 22,
  // 2) dash charge — lunge along a locked line; contact damage (i-frame it).
  dashWindup: 0.55, dashSpeed: 820, dashTime: 0.3, dashRecover: 0.6, dashDmg: 26,
  // 3) big rock — one heavy projectile thrown at the player.
  bigRockWindup: 0.7, bigRockSpeed: 400, bigRockR: 26, bigRockDmg: 24, rockRecover: 0.5,
  // 4) scatter — 6 small rocks fired radially in all directions.
  scatterWindup: 0.8, scatterCount: 6, smallRockSpeed: 330, smallRockR: 12, smallRockDmg: 13, scatterRecover: 0.65,
  // 5) earthquake — arena-wide; only a dodge-roll's i-frames avoid it.
  quakeWindup: 1.1, quakeActive: 0.3, quakeRecover: 0.9, quakeDmg: 28,
};

// --- tiny vector helpers ----------------------------------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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
      attack: "smash", atkCycle: 0, // which pattern is running; cycles the ranged ones
      slam: { x: 0, y: 0, active: false },
      dash: { dx: 0, dy: 0, active: false, hit: false },
      quake: { active: false },
      lastHit: 0,
    },
    arrows: [], // in-flight player arrows: { x, y, vx, vy, dmg, heavy }
    rocks: [],  // in-flight boss rocks:   { x, y, vx, vy, r, dmg, big }
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

  // Attack — fire an arrow in the facing direction. Heavy = a stronger, slower
  // charged shot; light = a quick shot. Can't fire mid-dodge.
  if ((i.attack || i.heavy) && p.attackCd <= 0 && p.dodge.t <= 0) {
    const heavy = !!i.heavy; // heavy wins if both are held
    const dir = unit(p.facing);
    const dmg = heavy
      ? heavyDamage(p.str, p.dex, p.weaponDmg)
      : lightDamage(p.str, p.dex, p.weaponDmg);
    s.arrows.push({
      x: p.x + dir.x * p.r, y: p.y + dir.y * p.r,
      vx: dir.x * CFG.arrowSpeed, vy: dir.y * CFG.arrowSpeed,
      dmg, heavy,
    });
    p.attackCd = heavy ? CFG.heavyAttackCd : CFG.attackCd;
  }

  _arrowsUpdate(s, dt);
  _bossUpdate(s, dt);
  _rocksUpdate(s, dt);
  return s;
}

// Apply an incoming boss hit to the player (negated entirely by i-frames). All
// five attack patterns funnel through here so dodge timing beats any of them.
function _hitPlayer(s, raw) {
  const p = s.player;
  if (p.invuln > 0) return;
  const dmg = damageTaken(raw, p.def);
  p.hp = Math.max(0, p.hp - dmg);
  p.lastHit = dmg;
  p.invuln = CFG.hitInvuln;
  if (p.hp <= 0) s.over = "lost";
}

// Advance boss rocks (big + scatter), damage the player on contact, cull strays.
function _rocksUpdate(s, dt) {
  const p = s.player;
  const kept = [];
  for (const rk of s.rocks) {
    rk.x += rk.vx * dt;
    rk.y += rk.vy * dt;
    if (dist(rk, p) <= rk.r + p.r) { _hitPlayer(s, rk.dmg); continue; }
    const m = 30;
    if (rk.x < -m || rk.x > CFG.arenaW + m || rk.y < -m || rk.y > CFG.arenaH + m) continue;
    kept.push(rk);
  }
  s.rocks = kept;
}

// Advance arrows, resolve boss hits, and cull anything that leaves the arena.
function _arrowsUpdate(s, dt) {
  const b = s.boss;
  const kept = [];
  for (const a of s.arrows) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (b.hp > 0 && dist(a, b) <= b.r + CFG.arrowR) {
      b.hp = Math.max(0, b.hp - a.dmg);
      b.lastHit = a.dmg;
      if (b.hp <= 0) s.over = "won";
      continue; // arrow consumed on hit
    }
    const m = 24;
    if (a.x < -m || a.x > CFG.arenaW + m || a.y < -m || a.y > CFG.arenaH + m) continue;
    kept.push(a);
  }
  s.arrows = kept;
}

// Rotate through all five patterns in a fixed, learnable order. Smash needs the
// player in melee reach, so when it comes up at range the golem dashes in
// instead (and smashes next time) — that way the ranged kit still cycles
// regularly instead of being starved by a golem that's always closing in.
function _chooseAttack(b, d) {
  const seq = ["dash", "smash", "bigrock", "scatter", "quake"];
  const a = seq[b.atkCycle++ % seq.length];
  return a === "smash" && d > CFG.slamR ? "dash" : a;
}

// Begin an attack: enter windup and set up its telegraph data.
function _bossBeginAttack(s, d) {
  const p = s.player, b = s.boss;
  b.attack = _chooseAttack(b, d);
  b.state = "windup";
  switch (b.attack) {
    case "smash":
      b.t = CFG.windup;
      b.slam = { x: b.x, y: b.y, active: true }; // ring centered on the golem
      break;
    case "dash": {
      b.t = CFG.dashWindup;
      const u = unit(sub(p, b)); // lock the lunge direction now
      b.dash = { dx: u.x, dy: u.y, active: false, hit: false };
      break;
    }
    case "bigrock":  b.t = CFG.bigRockWindup; break;
    case "scatter":  b.t = CFG.scatterWindup; break;
    case "quake":    b.t = CFG.quakeWindup; b.quake = { active: false }; break;
  }
}

// Windup -> strike: spawn projectiles / resolve instantaneous hits.
function _bossActivate(s) {
  const p = s.player, b = s.boss;
  b.state = "strike";
  switch (b.attack) {
    case "smash":
      b.t = CFG.strike;
      if (dist(p, b.slam) <= CFG.slamR) _hitPlayer(s, CFG.bossDmg);
      break;
    case "dash":
      b.t = CFG.dashTime;
      b.dash.active = true; b.dash.hit = false;
      break;
    case "bigrock": {
      b.t = 0.12; // brief throw pose; the rock lives in s.rocks
      const u = unit(sub(p, b));
      s.rocks.push({
        x: b.x, y: b.y, vx: u.x * CFG.bigRockSpeed, vy: u.y * CFG.bigRockSpeed,
        r: CFG.bigRockR, dmg: CFG.bigRockDmg, big: true,
      });
      break;
    }
    case "scatter": {
      b.t = 0.12;
      for (let k = 0; k < CFG.scatterCount; k++) {
        const a = (k / CFG.scatterCount) * Math.PI * 2;
        s.rocks.push({
          x: b.x, y: b.y, vx: Math.cos(a) * CFG.smallRockSpeed, vy: Math.sin(a) * CFG.smallRockSpeed,
          r: CFG.smallRockR, dmg: CFG.smallRockDmg, big: false,
        });
      }
      break;
    }
    case "quake":
      b.t = CFG.quakeActive;
      b.quake.active = true;
      _hitPlayer(s, CFG.quakeDmg); // arena-wide: only i-frames avoid it
      break;
  }
}

// Per-frame behavior while an attack is "active" (currently only the dash moves
// the golem and deals contact damage once).
function _bossStrikeTick(s, dt) {
  const p = s.player, b = s.boss;
  if (b.attack === "dash" && b.dash.active) {
    b.x = clamp(b.x + b.dash.dx * CFG.dashSpeed * dt, b.r, CFG.arenaW - b.r);
    b.y = clamp(b.y + b.dash.dy * CFG.dashSpeed * dt, b.r, CFG.arenaH - b.r);
    if (!b.dash.hit && dist(p, b) <= b.r + p.r) { b.dash.hit = true; _hitPlayer(s, CFG.dashDmg); }
  }
}

function _recoverFor(attack) {
  switch (attack) {
    case "dash":    return CFG.dashRecover;
    case "bigrock": return CFG.rockRecover;
    case "scatter": return CFG.scatterRecover;
    case "quake":   return CFG.quakeRecover;
    default:        return CFG.recover;
  }
}

function _bossUpdate(s, dt) {
  const p = s.player, b = s.boss;
  const d = len(sub(p, b));

  switch (b.state) {
    case "idle": {
      if (d > CFG.meleeRange) {
        const u = unit(sub(p, b));
        b.x += u.x * CFG.bossSpeed * dt;
        b.y += u.y * CFG.bossSpeed * dt;
      }
      b.cd -= dt;
      if (b.cd <= 0) _bossBeginAttack(s, d);
      break;
    }
    case "windup": {
      b.t -= dt;
      if (b.t <= 0) _bossActivate(s);
      break;
    }
    case "strike": {
      _bossStrikeTick(s, dt);
      b.t -= dt;
      if (b.t <= 0) {
        b.state = "recover";
        b.t = _recoverFor(b.attack);
        b.slam.active = false; b.dash.active = false; b.quake.active = false;
      }
      break;
    }
    case "recover": {
      b.t -= dt;
      if (b.t <= 0) { b.state = "idle"; b.cd = CFG.bossCd; }
      break;
    }
  }
}
