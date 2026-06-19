// Headless game simulation for Bossraid 2D — a top-down boss arena.
// Logic is kept separate from rendering/input (see main.js for the canvas layer)
// so the whole simulation is deterministic and unit-testable: feed `step` a
// state, an input, and a dt, and assert on the result. This mirrors the project
// principle "logic separate from rendering" (see docs/ROADMAP.md).

import { maxHP, arrowImpactDamage, heavyMultiplier, incomingDamage, skillMods } from "./stats.js";

// Resolve the player's combat fields from raw opts (stats + equipment + skill
// ranks). Single source so createGame and live (pause-menu) re-apply agree.
export function deriveCombat(opts = {}) {
  const str = opts.str ?? 10, dex = opts.dex ?? 12, con = opts.con ?? 10;
  const sk = opts.skills || {};
  const mods = skillMods(sk.heavy || 0, 0, sk.dodge || 0, 0, sk.ranged || 0);
  return {
    str, dex, con,
    def: opts.def ?? 0, bowDmg: opts.bowDmg ?? 12, weaponDmg: opts.weaponDmg ?? 50,
    speed: CFG.playerSpeed + (opts.speedBonus || 0),
    dodgeIframes: mods.dodgeIframes,
    heavyBaseMult: mods.heavyBaseMult,
    rangedVBonus: mods.rangedVBonus,
    maxHp: maxHP(con, str),
  };
}

export const CFG = {
  // Large arena (~3× the old field) for roaming; the view camera follows the
  // player and stays zoomed in, so you only ever see a window of it at a time.
  arenaW: 3840, arenaH: 2400,
  // Player (archer): shoots arrows in the facing direction. Light = quick shot,
  // heavy = a slower, stronger charged shot. meleeRange is kept as the boss's
  // chase-stop distance, not a player reach.
  playerR: 14, playerSpeed: 220, meleeRange: 70,
  attackCd: 0.35, heavyAttackCd: 0.7, arrowSpeed: 720, arrowR: 6,
  dodgeSpeed: 560, dodgeTime: 0.22, dodgeIframes: 0.30, hitInvuln: 0.6,
  // Stamina: actions drain it at their own rate; it recharges fast while idle
  // and slowly while walking (which costs a tiny trickle). Shoot/dodge/power
  // pause regen briefly and are gated when there isn't enough.
  staminaMax: 120, staRegen: 28, staRegenWalk: 9, staRegenDelay: 0.5,
  staMove: 2, staShoot: 8, staHeavy: 20, staDodge: 18,
  // Boss. Every attack runs chase -> windup (telegraph) -> strike (active) ->
  // recover, and any hit is negated while the player is invulnerable. The golem
  // has 3 health-bar segments (phases): depleting one staggers it briefly, then
  // it gets faster, hits harder and changes its attack rotation.
  bossR: 40, bossSpeed: 165, bossMaxHp: 1200, bossCd: 1.5, bossDef: 6,
  phases: 3, phaseStagger: 0.85,
  // 1) smash — melee shockwave ring centered on the golem (used in close range).
  slamR: 130, windup: 0.9, strike: 0.15, recover: 0.55, bossDmg: 26,
  // 2) dash charge — lunge along a locked line; contact damage (i-frame it).
  dashWindup: 0.55, dashSpeed: 820, dashTime: 0.3, dashRecover: 0.6, dashDmg: 30,
  // 3) big rock — one heavy projectile thrown at the player.
  bigRockWindup: 0.7, bigRockSpeed: 400, bigRockR: 26, bigRockDmg: 28, rockRecover: 0.5,
  // 4) scatter — 6 small rocks fired radially in all directions.
  scatterWindup: 0.8, scatterCount: 6, smallRockSpeed: 330, smallRockR: 12, smallRockDmg: 15, scatterRecover: 0.65,
  // 5) earthquake — arena-wide; only a dodge-roll's i-frames avoid it.
  quakeWindup: 1.1, quakeActive: 0.3, quakeRecover: 0.9, quakeDmg: 34,
  // Phase 2+: a scatter pellet that strikes a boulder DETONATES, dealing AoE
  // damage in a radius (the boulders become live minefields).
  rockExplodeR: 120, rockExplodeDmg: 22, boomTime: 0.35,
  // Phase 3: every boulder RISES as a tiny golem that chases the player and
  // deals contact damage; arrows kill them (no DEF). New big rocks landing in
  // phase 3 stand up as minions instead of resting as boulders.
  minionR: 16, minionHp: 40, minionSpeed: 130, minionDmg: 14, minionTouchCd: 0.8,

  // ===== Ability kit (Archer; data-driven so other classes slot in) =========
  // 3rd attack — Spread Shot: a fan of arrows.
  spreadCount: 3, spreadArc: 0.5, staSpread: 14,
  // Passive — Eagle Eye: arrows gain up to +eagleMax damage the farther they
  // have flown (rewards kiting on the big arena).
  eagleRange: 900, eagleMax: 0.6,
  // 3 skills (seconds of cooldown + their params).
  cdVolley: 6, volleyCount: 5, volleyArc: 0.10,
  cdExplosive: 9, explosiveR: 170, explosiveDmg: 70,
  cdPierce: 8, pierceMult: 2.6,
  // Defence — light-class "Deflect": a brief i-frame window that bounces the
  // golem's rocks back as damaging projectiles. (Heavy classes block+parry.)
  cdDeflect: 5, deflectTime: 0.4, deflectR: 230, reflectSpeed: 780, reflectDmg: 36,
  // Special — Arrow Storm: gated by BOTH a meter (fills in combat) AND a CD.
  cdSpecial: 16, specialGainHit: 0.05, specialGainTaken: 0.08, stormCount: 20,
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
  return {
    move: { x: 0, y: 0 }, aim: null,
    attack1: false, attack2: false, attack3: false,
    skill1: false, skill2: false, skill3: false,
    dash: false, defend: false, special: false,
    // legacy aliases (older callers/tests): attack=attack1, heavy=attack2, dodge=dash
    attack: false, heavy: false, dodge: false,
  };
}

export function createGame(opts = {}) {
  const c = deriveCombat(opts);
  const hp = c.maxHp;
  return {
    t: 0,
    over: null, // null | "won" | "lost"
    player: {
      x: CFG.arenaW * 0.5, y: CFG.arenaH * 0.5 + 260, r: CFG.playerR,
      str: c.str, dex: c.dex, con: c.con, def: c.def, weaponDmg: c.weaponDmg, bowDmg: c.bowDmg,
      speed: c.speed, dodgeIframes: c.dodgeIframes, heavyBaseMult: c.heavyBaseMult, rangedVBonus: c.rangedVBonus,
      hp, maxHp: hp,
      stamina: CFG.staminaMax, staminaMax: CFG.staminaMax, staRegenT: 0,
      facing: { x: 0, y: -1 },
      invuln: 0, attackCd: 0,
      dodge: { t: 0, dir: { x: 0, y: 0 } },
      lastHit: 0,
      // ability state: per-skill cooldowns, the special meter (0..1) and the
      // active deflect window.
      cd: { volley: 0, explosive: 0, pierce: 0, deflect: 0, special: 0 },
      special: 0, deflectT: 0,
      // view hint: the last ability performed + when (for one-shot animations).
      act: "", actAt: -1,
    },
    boss: {
      x: CFG.arenaW * 0.5, y: CFG.arenaH * 0.5 - 260, r: CFG.bossR,
      hp: CFG.bossMaxHp, maxHp: CFG.bossMaxHp,
      state: "idle", t: 0, cd: CFG.bossCd,
      phase: 1, // 1..CFG.phases; rises as health-bar segments are depleted
      attack: "smash", atkCycle: 0, // which pattern is running; cycles the ranged ones
      slam: { x: 0, y: 0, active: false },
      dash: { dx: 0, dy: 0, active: false, hit: false },
      quake: { active: false },
      lastHit: 0,
    },
    arrows: [], // in-flight player arrows: { x, y, vx, vy, dmg, heavy }
    rocks: [],  // in-flight boss rocks:   { x, y, vx, vy, r, dmg, big }
    minions: [], // phase-3 tiny golems:   { x, y, r, hp, touchCd }
    booms: [],   // transient explosions (FX + already-applied AoE): { x, y, r, t, maxT }
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
  p.staRegenT = Math.max(0, p.staRegenT - dt);
  p.deflectT = Math.max(0, p.deflectT - dt);
  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);

  // Logical actions (new names) with backward-compatible aliases.
  const a1 = i.attack1 || i.attack, a2 = i.attack2 || i.heavy, a3 = i.attack3;
  const wantDash = i.dash || i.dodge;
  const aiming = i.aim && (i.aim.x || i.aim.y);
  if (aiming) p.facing = unit(i.aim); // controller right-stick aim

  // Dodge start (dash with i-frames) — costs stamina, gated when too low.
  if (wantDash && p.dodge.t <= 0 && p.stamina >= CFG.staDodge) {
    const d = (i.move.x || i.move.y) ? unit(i.move) : p.facing;
    p.dodge.t = CFG.dodgeTime;
    p.dodge.dir = d;
    p.invuln = Math.max(p.invuln, p.dodgeIframes);
    p.stamina -= CFG.staDodge;
    p.staRegenT = CFG.staRegenDelay;
  }

  // Movement (dodging overrides steering)
  let vx = 0, vy = 0, moving = false;
  if (p.dodge.t > 0) {
    p.dodge.t = Math.max(0, p.dodge.t - dt);
    vx = p.dodge.dir.x * CFG.dodgeSpeed;
    vy = p.dodge.dir.y * CFG.dodgeSpeed;
  } else {
    const m = unit(i.move);
    if (m.x || m.y) {
      if (!aiming) p.facing = m; // movement steers facing unless the stick aims
      moving = true;
      p.stamina -= CFG.staMove * dt; // tiny trickle; does NOT pause regen
    }
    vx = m.x * p.speed;
    vy = m.y * p.speed;
  }
  p.x = clamp(p.x + vx * dt, p.r, CFG.arenaW - p.r);
  p.y = clamp(p.y + vy * dt, p.r, CFG.arenaH - p.r);

  // ===== Abilities =========================================================
  const fa = Math.atan2(p.facing.y, p.facing.x); // facing angle
  const act = (n) => { p.act = n; p.actAt = s.t; }; // flag a one-shot for the view

  // 3 attacks (stamina-gated; share the attack cooldown so one fires at a time).
  // Priority when several are held: power > spread > quick.
  if (p.attackCd <= 0 && p.dodge.t <= 0) {
    if (a2 && p.stamina >= CFG.staHeavy) { // Power Shot (charged)
      _spawnArrow(s, fa, { mult: heavyMultiplier(p.str, p.heavyBaseMult), heavy: true });
      p.attackCd = CFG.heavyAttackCd; p.stamina -= CFG.staHeavy; p.staRegenT = CFG.staRegenDelay; act("power");
    } else if (a3 && p.stamina >= CFG.staSpread) { // Spread Shot (fan)
      const n = CFG.spreadCount, stepA = CFG.spreadArc / Math.max(1, n - 1);
      for (let k = 0; k < n; k++) _spawnArrow(s, fa + (k - (n - 1) / 2) * stepA, {});
      p.attackCd = CFG.heavyAttackCd * 0.8; p.stamina -= CFG.staSpread; p.staRegenT = CFG.staRegenDelay; act("spread");
    } else if (a1 && p.stamina >= CFG.staShoot) { // Quick Shot
      _spawnArrow(s, fa, {});
      p.attackCd = CFG.attackCd; p.stamina -= CFG.staShoot; p.staRegenT = CFG.staRegenDelay; act("quick");
    }
  }

  // 3 skills (cooldown-gated; the caller edge-triggers these).
  if (i.skill1 && p.cd.volley <= 0) { // Volley — a forward burst of arrows
    const n = CFG.volleyCount;
    for (let k = 0; k < n; k++) _spawnArrow(s, fa + (k - (n - 1) / 2) * CFG.volleyArc, { mult: 0.7 });
    p.cd.volley = CFG.cdVolley; act("volley");
  }
  if (i.skill2 && p.cd.explosive <= 0) { // Explosive Arrow — AoE on impact
    _spawnArrow(s, fa, { explosive: true, mult: 0.8, speed: CFG.arrowSpeed * 0.9 });
    p.cd.explosive = CFG.cdExplosive; act("explosive");
  }
  if (i.skill3 && p.cd.pierce <= 0) { // Piercing Bolt — rips minions, big boss hit
    _spawnArrow(s, fa, { pierce: true, mult: CFG.pierceMult, speed: CFG.arrowSpeed * 1.3 });
    p.cd.pierce = CFG.cdPierce; act("pierce");
  }

  // Defence (Deflect): brief i-frames; bounces nearby rocks back at the golem.
  if (i.defend && p.cd.deflect <= 0) {
    p.deflectT = CFG.deflectTime;
    p.invuln = Math.max(p.invuln, CFG.deflectTime);
    p.cd.deflect = CFG.cdDeflect; act("deflect");
  }

  // Special — Arrow Storm. Needs a FULL meter AND the cooldown ready.
  if (i.special && p.special >= 1 && p.cd.special <= 0) {
    const n = CFG.stormCount, arc = Math.PI * 0.9;
    for (let k = 0; k < n; k++) _spawnArrow(s, fa + (k / Math.max(1, n - 1) - 0.5) * arc, { mult: 0.9 });
    p.special = 0; p.cd.special = CFG.cdSpecial; act("arrowstorm");
  }

  // Stamina regen — fast while idle, slow while walking (after the post-action pause).
  if (p.staRegenT <= 0) {
    const rate = moving ? CFG.staRegenWalk : CFG.staRegen;
    p.stamina = Math.min(p.staminaMax, p.stamina + rate * dt);
  }
  p.stamina = Math.max(0, p.stamina);

  _arrowsUpdate(s, dt);
  _bossUpdate(s, dt);
  _rocksUpdate(s, dt);
  _minionsUpdate(s, dt);
  _boomsUpdate(s, dt);
  return s;
}

// Per-phase escalation: each depleted health segment makes the golem faster,
// hit harder, and telegraph for less time.
const _speedMult = (b) => 1 + 0.28 * (b.phase - 1);
const _cdMult = (b) => 1 - 0.16 * (b.phase - 1);
const _winMult = (b) => 1 - 0.12 * (b.phase - 1);
const _dmgMult = (b) => 1 + 0.22 * (b.phase - 1);

// After the boss takes damage, bump its phase when a health segment is emptied
// and stagger it briefly to telegraph the escalation.
function _bossPhaseCheck(s) {
  const b = s.boss;
  const frac = b.hp / b.maxHp;
  const phase = frac > 2 / 3 ? 1 : frac > 1 / 3 ? 2 : 3;
  if (phase > b.phase && b.hp > 0) {
    b.phase = phase;
    b.state = "recover"; b.t = CFG.phaseStagger; b.cd = 0; // brief stagger
    b.slam.active = false; b.dash.active = false; b.quake.active = false;
    if (phase >= 3) _raiseMinions(s); // boulders stand up and give chase
  }
}

// Phase 3 onset: every landed boulder becomes a tiny golem that hunts the
// player. In-flight rocks are left alone (they convert when/if they land).
function _raiseMinions(s) {
  const remaining = [];
  for (const rk of s.rocks) {
    if (rk.landed) s.minions.push({ x: rk.x, y: rk.y, r: CFG.minionR, hp: CFG.minionHp, touchCd: 0 });
    else remaining.push(rk);
  }
  s.rocks = remaining;
}

// A scatter pellet detonating on a boulder: spawn an FX/AoE boom and damage the
// player if caught in the blast (i-frames still save them, via _hitPlayer).
function _explodeAt(s, x, y) {
  s.booms.push({ x, y, r: CFG.rockExplodeR, t: CFG.boomTime, maxT: CFG.boomTime });
  if (dist(s.player, { x, y }) <= CFG.rockExplodeR + s.player.r) _hitPlayer(s, CFG.rockExplodeDmg);
}

// Spawn one player arrow from the archer toward angle `ang`. opts: mult (damage
// ×), heavy, explosive, pierce, speed. Records spawn point for the Eagle-Eye
// passive (distance-scaled damage, applied at impact).
function _spawnArrow(s, ang, opts = {}) {
  const p = s.player;
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  if (Math.abs(dir.x) < 1e-9) dir.x = 0; // snap axis-aligned shots (avoid fp dust)
  if (Math.abs(dir.y) < 1e-9) dir.y = 0;
  const base = arrowImpactDamage(p.str, p.dex, p.bowDmg, p.rangedVBonus);
  const speed = opts.speed || CFG.arrowSpeed;
  s.arrows.push({
    x: p.x + dir.x * p.r, y: p.y + dir.y * p.r, sx: p.x, sy: p.y,
    vx: dir.x * speed, vy: dir.y * speed,
    dmg: Math.round(base * (opts.mult || 1)),
    heavy: !!opts.heavy, explosive: !!opts.explosive, pierce: !!opts.pierce,
  });
}

// Apply player damage to the golem: DEF subtracts, the special meter ticks up,
// phase escalation + win are resolved. Single path for arrows, explosions and
// reflected rocks.
function _damageBoss(s, raw) {
  const b = s.boss;
  if (b.hp <= 0) return;
  const dmg = incomingDamage(raw, CFG.bossDef);
  b.hp = Math.max(0, b.hp - dmg);
  b.lastHit = dmg;
  s.player.special = Math.min(1, s.player.special + CFG.specialGainHit);
  if (b.hp <= 0) s.over = "won"; else _bossPhaseCheck(s);
}

// An explosive arrow detonating: AoE that damages the golem and any minions
// (player-friendly boom — flagged so the view can tint it differently).
function _explodeFriendly(s, x, y) {
  s.booms.push({ x, y, r: CFG.explosiveR, t: CFG.boomTime, maxT: CFG.boomTime, friendly: true });
  if (s.boss.hp > 0 && dist(s.boss, { x, y }) <= CFG.explosiveR + s.boss.r) _damageBoss(s, CFG.explosiveDmg);
  for (const m of s.minions) if (dist(m, { x, y }) <= CFG.explosiveR + m.r) m.hp -= CFG.explosiveDmg;
  s.minions = s.minions.filter((m) => m.hp > 0);
}

// Advance the tiny golems: chase the player, deal contact damage on a cooldown.
function _minionsUpdate(s, dt) {
  const p = s.player;
  for (const m of s.minions) {
    m.touchCd = Math.max(0, m.touchCd - dt);
    const u = unit(sub(p, m));
    m.x = clamp(m.x + u.x * CFG.minionSpeed * dt, m.r, CFG.arenaW - m.r);
    m.y = clamp(m.y + u.y * CFG.minionSpeed * dt, m.r, CFG.arenaH - m.r);
    if (m.touchCd <= 0 && dist(m, p) <= m.r + p.r) { _hitPlayer(s, CFG.minionDmg); m.touchCd = CFG.minionTouchCd; }
  }
}

// Tick down explosion markers (purely transient — the damage already landed).
function _boomsUpdate(s, dt) {
  for (const bm of s.booms) bm.t -= dt;
  s.booms = s.booms.filter((bm) => bm.t > 0);
}

// Apply an incoming boss hit to the player (negated entirely by i-frames). All
// five attack patterns funnel through here, scaled by the boss's phase, so dodge
// timing beats any of them.
function _hitPlayer(s, raw) {
  const p = s.player;
  if (p.invuln > 0) return;
  const dmg = incomingDamage(Math.round(raw * _dmgMult(s.boss)), p.def);
  p.hp = Math.max(0, p.hp - dmg);
  p.lastHit = dmg;
  p.invuln = CFG.hitInvuln;
  p.special = Math.min(1, p.special + CFG.specialGainTaken); // taking hits builds the special
  if (p.hp <= 0) s.over = "lost";
}

// Push an entity {x,y,r} out of a landed boulder so it acts as a solid obstacle.
// Returns true if it was overlapping. Used for the player AND the golem.
function _resolveObstacle(ent, rk) {
  const dx = ent.x - rk.x, dy = ent.y - rk.y;
  const d = Math.hypot(dx, dy), min = rk.r + ent.r;
  if (d < min && d > 1e-6) {
    ent.x = clamp(rk.x + (dx / d) * min, ent.r, CFG.arenaW - ent.r);
    ent.y = clamp(rk.y + (dy / d) * min, ent.r, CFG.arenaH - ent.r);
    return true;
  }
  return false;
}

// Resolve an entity against every landed boulder; true if it touched any.
function _collideBoulders(s, ent) {
  let hit = false;
  for (const rk of s.rocks) if (rk.landed && _resolveObstacle(ent, rk)) hit = true;
  return hit;
}

// Advance boss rocks. A big rock flies to its target, deals impact damage in
// passing, then LANDS and persists as a solid obstacle. Small scatter rocks
// damage on contact and are culled when they leave the arena.
function _rocksUpdate(s, dt) {
  const p = s.player;
  const kept = [];
  for (const rk of s.rocks) {
    if (rk.landed) { _resolveObstacle(p, rk); kept.push(rk); continue; } // permanent boulder

    rk.x += rk.vx * dt;
    rk.y += rk.vy * dt;

    // Reflected (player-deflected) rocks fly at the golem and damage IT.
    if (rk.reflected) {
      if (s.boss.hp > 0 && dist(rk, s.boss) <= rk.r + s.boss.r) { _damageBoss(s, rk.dmg); continue; }
      const mm = 40;
      if (rk.x < -mm || rk.x > CFG.arenaW + mm || rk.y < -mm || rk.y > CFG.arenaH + mm) continue;
      kept.push(rk); continue;
    }
    // Deflect window: an incoming rock near the archer is bounced back at the boss.
    if (p.deflectT > 0 && dist(rk, p) <= CFG.deflectR) {
      const u = unit(sub(s.boss, p));
      rk.vx = u.x * CFG.reflectSpeed; rk.vy = u.y * CFG.reflectSpeed;
      rk.reflected = true; rk.dmg = CFG.reflectDmg; rk.hit = false; rk.big = false;
      kept.push(rk); continue;
    }
    if (!rk.hit && dist(rk, p) <= rk.r + p.r) { rk.hit = true; _hitPlayer(s, rk.dmg); }

    // a flying rock meets an existing boulder: the big rock lands against it; a
    // scatter pellet is spent — but from phase 2 on, the pellet DETONATES.
    if (s.rocks.some((o) => o !== rk && o.landed && dist(rk, o) <= rk.r + o.r)) {
      if (rk.big) { rk.vx = 0; rk.vy = 0; rk.landed = true; kept.push(rk); }
      else if (s.boss.phase >= 2) _explodeAt(s, rk.x, rk.y);
      continue;
    }

    if (rk.big) {
      rk.travel -= Math.hypot(rk.vx, rk.vy) * dt;
      if (rk.travel <= 0) {
        rk.x = rk.tx; rk.y = rk.ty; rk.vx = 0; rk.vy = 0; rk.landed = true;
        // In phase 3 a freshly-landed boulder stands straight up as a minion.
        if (s.boss.phase >= 3) { s.minions.push({ x: rk.x, y: rk.y, r: CFG.minionR, hp: CFG.minionHp, touchCd: 0 }); continue; }
      }
      kept.push(rk); // big rocks land in-arena; never culled
      continue;
    }
    if (rk.hit) continue; // small rock spent on impact
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
    // Eagle-Eye passive: arrows hit harder the farther they have flown.
    const travel = Math.hypot(a.x - a.sx, a.y - a.sy);
    const eagle = 1 + Math.min(CFG.eagleMax, (travel / CFG.eagleRange) * CFG.eagleMax);
    const dealt = Math.round(a.dmg * eagle);
    // tiny golems are squishy (no DEF). Piercing bolts rip through them.
    let hitMinion = false;
    for (const m of s.minions) {
      if (m.hp > 0 && dist(a, m) <= m.r + CFG.arrowR) { m.hp -= dealt; hitMinion = true; if (!a.pierce) break; }
    }
    if (s.minions.some((m) => m.hp <= 0)) s.minions = s.minions.filter((m) => m.hp > 0);
    if (hitMinion && !a.pierce) { if (a.explosive) _explodeFriendly(s, a.x, a.y); continue; }
    if (b.hp > 0 && dist(a, b) <= b.r + CFG.arrowR) {
      _damageBoss(s, dealt); // DEF, special meter, phase + win handled inside
      if (a.explosive) _explodeFriendly(s, a.x, a.y);
      continue; // arrow consumed on the boss (even piercing — there's one golem)
    }
    // landed boulders block shots (cover for the golem)
    if (s.rocks.some((rk) => rk.landed && dist(a, rk) <= rk.r + CFG.arrowR)) {
      if (a.explosive) _explodeFriendly(s, a.x, a.y);
      continue;
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
  // Rotation shifts per phase: p1 leans melee, p3 leans fast AoE.
  const seqs = {
    1: ["dash", "smash", "bigrock", "smash"],
    2: ["dash", "smash", "scatter", "bigrock", "quake"],
    3: ["quake", "dash", "scatter", "smash", "bigrock", "dash"],
  };
  const seq = seqs[b.phase] || seqs[1];
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
  b.t *= _winMult(b); // later phases telegraph for less time
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
      // Lobbed at the player's current spot; it lands there and stays as a
      // solid boulder obstacle (travel = distance it covers before landing).
      s.rocks.push({
        x: b.x, y: b.y, vx: u.x * CFG.bigRockSpeed, vy: u.y * CFG.bigRockSpeed,
        r: CFG.bigRockR, dmg: CFG.bigRockDmg, big: true,
        tx: p.x, ty: p.y, travel: dist(b, p), landed: false, hit: false,
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
    const ds = CFG.dashSpeed * _speedMult(b);
    b.x = clamp(b.x + b.dash.dx * ds * dt, b.r, CFG.arenaW - b.r);
    b.y = clamp(b.y + b.dash.dy * ds * dt, b.r, CFG.arenaH - b.r);
    if (!b.dash.hit && dist(p, b) <= b.r + p.r) { b.dash.hit = true; _hitPlayer(s, CFG.dashDmg); }
    // a boulder stops the charge dead (b.t=0 -> recover next frame)
    if (_collideBoulders(s, b)) { b.dash.active = false; b.t = 0; }
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
        const u = unit(sub(p, b)), sp = CFG.bossSpeed * _speedMult(b);
        b.x += u.x * sp * dt;
        b.y += u.y * sp * dt;
        _collideBoulders(s, b); // can't walk through its own boulders
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
      if (b.t <= 0) { b.state = "idle"; b.cd = CFG.bossCd * _cdMult(b); }
      break;
    }
  }
}
