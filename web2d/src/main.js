// Canvas rendering + input for Bossraid 2D. All rules live in game.js (unit-
// tested); this is the thin "view" layer: keyboard + on-screen touch controls.

import { createGame, step, emptyInput, CFG } from "./game.js";
import { stickVector, knobOffset, pointInCircle } from "./touch.js";
import { Animator, frameIndex, clipDuration } from "./anim.js";
import { loadStrip, drawStrip } from "./sprites.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = CFG.arenaW;
canvas.height = CFG.arenaH;
const W = canvas.width, H = canvas.height;

let game = createGame();

const TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

// Belt-and-suspenders against the page moving on mobile: block document-level
// touch scrolling/bounce (iOS ignores touch-action for the page scroll).
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

// Fullscreen toggle button (⛶). Works on Android/desktop; iOS Safari can't
// fullscreen a page (only <video>), but the locked layout already fills it.
const fsBtn = document.getElementById("fs");
function isFs() { return document.fullscreenElement || document.webkitFullscreenElement; }
function toggleFullscreen() {
  try {
    if (!isFs()) {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { const r = req.call(el); if (r && r.catch) r.catch(() => {}); }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  } catch (_) { /* not allowed here — fine */ }
}
if (fsBtn) {
  fsBtn.addEventListener("click", toggleFullscreen);
  const sync = () => { fsBtn.textContent = isFs() ? "⊠" : "⛶"; };
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
}

// --- on-screen controls (canvas coords) ------------------------------------
const STICK = { hintX: 120, hintY: H - 120, R: 78, knobR: 36 };
const BTN = [
  { role: "attack", label: "⚔", cx: W - 100, cy: H - 100, r: 50, color: "#3aa0ff" },
  { role: "heavy",  label: "⚡", cx: W - 210, cy: H - 150, r: 36, color: "#c8893f" },
  { role: "dodge",  label: "»", cx: W - 112, cy: H - 218, r: 36, color: "#5ad1a0" },
];

const stick = { active: false, id: null, base: { x: 0, y: 0 }, cur: { x: 0, y: 0 } };
const pointers = new Map(); // pointerId -> { role }

// --- boss sprite sheet (drop-in art) ---------------------------------------
// Each clip is ONE transparent PNG strip in web2d/assets/ (see assets/README).
// Missing files fall back to the placeholder circle, so the game runs today.
const BOSS_DISPLAY_H = 190; // on-screen height of the golem in px
const GOLEM = {
  idle:  loadStrip("./assets/golem_idle.png", 6, 8, true),
  walk:  loadStrip("./assets/golem_walk.png", 8, 10, true),
  slam:  loadStrip("./assets/golem_slam.png", 10, 14, false),
  hit:   loadStrip("./assets/golem_hit.png", 4, 16, false),
  death: loadStrip("./assets/golem_death.png", 6, 9, false),
};
const bossAnim = new Animator();

// --- player (archer) sprite sheet ------------------------------------------
// Same drop-in scheme as the boss. Missing files fall back to the placeholder.
const PLAYER_DISPLAY_H = 96; // on-screen height of the archer in px
const ARCHER = {
  idle:  loadStrip("./assets/archer_idle.png",  6, 8,  true),
  walk:  loadStrip("./assets/archer_walk.png",  8, 11, true),
  shoot: loadStrip("./assets/archer_shoot.png", 6, 16, false),
  hit:   loadStrip("./assets/archer_hit.png",   4, 16, false),
  death: loadStrip("./assets/archer_death.png", 6, 9,  false),
  dodge: loadStrip("./assets/archer_dodge.png", 6, 18, false),
};
const playerAnim = new Animator();

// View-only signals the sim doesn't expose directly: a brief flinch when the
// boss takes damage, and whether it moved this frame (it chases in "idle").
let bossHitT = 0;       // seconds left on the hit-react flinch
let prevBossHp = null;
let prevBossPos = null;
let bossMoving = false;

function updateBossAnimSignals(dt) {
  const b = game.boss;
  if (prevBossHp !== null && b.hp < prevBossHp && b.hp > 0) {
    bossHitT = clipDuration(GOLEM.hit.fps, GOLEM.hit.frames);
  }
  prevBossHp = b.hp;
  bossHitT = Math.max(0, bossHitT - dt);
  const moved = prevBossPos ? Math.hypot(b.x - prevBossPos.x, b.y - prevBossPos.y) : 0;
  bossMoving = moved > 0.5; // chasing the player (idle-state movement)
  prevBossPos = { x: b.x, y: b.y };
}

// Map the boss sim state -> an animation clip.
// Priority: death > slam (attack) > hit flinch > walk (chasing) > idle.
function bossClip() {
  const b = game.boss;
  if (game.over === "won") return "death";
  if (b.state === "windup" || b.state === "strike") {
    // Placeholder mapping until per-attack art exists: the dash reads as a run,
    // the rest share the slam pose. (Regenerating golem art is the next step.)
    return b.attack === "dash" ? "walk" : "slam";
  }
  if (bossHitT > 0) return "hit";
  if (b.state === "idle" && bossMoving) return "walk";
  return "idle";
}

// View-only signals for the player: a brief shoot animation when an arrow is
// fired, a flinch when damaged, and whether the player moved this frame.
let playerShootT = 0;
let playerHitT = 0;
let prevPlayerHp = null;
let prevArrowCount = 0;
let prevPlayerPos = null;
let playerMoving = false;

function updatePlayerAnimSignals(dt) {
  const p = game.player;
  if (game.arrows.length > prevArrowCount) {
    playerShootT = clipDuration(ARCHER.shoot.fps, ARCHER.shoot.frames);
  }
  prevArrowCount = game.arrows.length;
  if (prevPlayerHp !== null && p.hp < prevPlayerHp && p.hp > 0) {
    playerHitT = clipDuration(ARCHER.hit.fps, ARCHER.hit.frames);
  }
  prevPlayerHp = p.hp;
  playerShootT = Math.max(0, playerShootT - dt);
  playerHitT = Math.max(0, playerHitT - dt);
  const moved = prevPlayerPos ? Math.hypot(p.x - prevPlayerPos.x, p.y - prevPlayerPos.y) : 0;
  playerMoving = moved > 0.5;
  prevPlayerPos = { x: p.x, y: p.y };
}

// Map player state -> clip. Priority: death > dodge > shoot > hit > walk > idle.
function playerClip() {
  const p = game.player;
  if (game.over === "lost") return "death";
  if (p.dodge.t > 0) return "dodge";
  if (playerShootT > 0) return "shoot";
  if (playerHitT > 0) return "hit";
  if (playerMoving) return "walk";
  return "idle";
}

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

function onDown(e) {
  e.preventDefault();
  const p = toCanvas(e);
  // buttons first (right side)
  for (const b of BTN) {
    if (pointInCircle(p.x, p.y, b.cx, b.cy, b.r)) {
      pointers.set(e.pointerId, { role: b.role });
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
  }
  // otherwise the left side drives the stick (floating: anchored where you touch)
  if (p.x < W * 0.55 && !stick.active) {
    stick.active = true;
    stick.id = e.pointerId;
    stick.base = { x: p.x, y: p.y };
    stick.cur = { x: p.x, y: p.y };
    pointers.set(e.pointerId, { role: "stick" });
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
}

function onMove(e) {
  if (stick.active && e.pointerId === stick.id) {
    e.preventDefault();
    stick.cur = toCanvas(e);
  }
}

function onUp(e) {
  const rec = pointers.get(e.pointerId);
  if (rec) {
    e.preventDefault();
    if (rec.role === "stick") { stick.active = false; stick.id = null; }
    pointers.delete(e.pointerId);
  }
}

canvas.addEventListener("pointerdown", onDown);
canvas.addEventListener("pointermove", onMove);
canvas.addEventListener("pointerup", onUp);
canvas.addEventListener("pointercancel", onUp);

// --- keyboard ---------------------------------------------------------------
const keys = new Set();
const REMAP = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
addEventListener("keydown", (e) => { keys.add(e.code); if (REMAP[e.code]) e.preventDefault(); });
addEventListener("keyup", (e) => keys.delete(e.code));

function readInput() {
  const i = emptyInput();
  // keyboard
  if (keys.has("KeyW") || keys.has("ArrowUp")) i.move.y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) i.move.y += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) i.move.x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) i.move.x += 1;
  if (keys.has("KeyJ")) i.attack = true;
  if (keys.has("KeyL")) i.heavy = true;
  if (keys.has("Space")) i.dodge = true;
  // touch stick (overrides move when engaged)
  if (stick.active) {
    const v = stickVector(stick.base, stick.cur, STICK.R, 0.18);
    if (v.x || v.y) { i.move.x = v.x; i.move.y = v.y; }
  }
  // touch buttons
  for (const rec of pointers.values()) {
    if (rec.role === "attack") i.attack = true;
    else if (rec.role === "heavy") i.heavy = true;
    else if (rec.role === "dodge") i.dodge = true;
  }
  return i;
}

const pressed = (role) => {
  for (const rec of pointers.values()) if (rec.role === role) return true;
  return false;
};

// --- loop -------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // restart: R on keyboard, or tap the attack button on the game-over screen
  if (game.over && (keys.has("KeyR") || pressed("attack"))) game = createGame();
  if (!game.over) step(game, readInput(), dt);

  updateBossAnimSignals(dt);
  bossAnim.play(bossClip());
  bossAnim.tick(dt);

  updatePlayerAnimSignals(dt);
  playerAnim.play(playerClip());
  playerAnim.tick(dt);

  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- render -----------------------------------------------------------------
function render() {
  const p = game.player, b = game.boss;

  ctx.fillStyle = "#11141c";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#2b3346";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  // slam danger zone — a ring on the ground AROUND the golem that matches the
  // smash animation. The ring IS the hitbox: windup charges it red, the strike
  // flashes it. Drawn before the boss so it reads as on the ground beneath it.
  if (b.slam.active) {
    const cx = b.slam.x, cy = b.slam.y, R = CFG.slamR;
    if (b.state === "windup") {
      const k = 1 - b.t / CFG.windup; // 0 -> 1 as the smash charges
      ctx.fillStyle = `rgba(230,60,50,${0.05 + 0.16 * k})`;
      circle(cx, cy, R, true, false);
      ctx.strokeStyle = `rgba(255,90,70,${0.45 + 0.55 * k})`;
      ctx.lineWidth = 3 + 4 * k;
      ctx.setLineDash([16, 12]);
      circle(cx, cy, R, false, true);
      ctx.setLineDash([]);
    } else if (b.state === "strike") {
      ctx.fillStyle = "rgba(255,150,70,0.5)";
      circle(cx, cy, R, true, false);
      ctx.strokeStyle = "rgba(255,220,140,1)";
      ctx.lineWidth = 7;
      circle(cx, cy, R, false, true);
    }
  }

  // dash-charge telegraph — a lane showing the locked lunge direction.
  if (b.attack === "dash" && b.state === "windup") {
    const k = 1 - b.t / CFG.dashWindup;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.dash.dy, b.dash.dx));
    ctx.fillStyle = `rgba(255,90,70,${0.10 + 0.28 * k})`;
    ctx.fillRect(0, -24, 240, 48);
    ctx.restore();
  }

  // earthquake telegraph — pulsing red border on windup, full flash on impact.
  if (b.attack === "quake") {
    if (b.state === "windup") {
      const k = 1 - b.t / CFG.quakeWindup;
      ctx.strokeStyle = `rgba(255,80,60,${0.25 + 0.6 * k})`;
      ctx.lineWidth = 6 + 26 * k;
      ctx.strokeRect(10, 10, W - 20, H - 20);
    } else if (b.state === "strike" && b.quake.active) {
      ctx.fillStyle = "rgba(255,120,70,0.4)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  // boss — animated sprite if its art is loaded, else the placeholder circle
  const clip = GOLEM[bossAnim.clip];
  const idx = clip ? frameIndex(bossAnim.t, clip.fps, clip.frames, clip.loop) : 0;
  const drewBoss = clip ? drawStrip(ctx, clip, idx, b.x, b.y + b.r, BOSS_DISPLAY_H, p.x < b.x) : false;
  if (!drewBoss) {
    ctx.fillStyle = { idle: "#6f7787", windup: "#c2553f", strike: "#ff9c44", recover: "#555b69" }[b.state];
    circle(b.x, b.y, b.r, true, false);
    ctx.fillStyle = "#0c0e14";
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GOLEM", b.x, b.y + 6);
  }

  // boss rocks: scatter pellets, the flying big rock, and landed boulders that
  // persist as solid obstacles.
  for (const rk of game.rocks) {
    if (rk.landed) {
      ctx.fillStyle = "rgba(0,0,0,0.35)"; // grounded shadow
      ctx.beginPath();
      ctx.ellipse(rk.x, rk.y + rk.r * 0.7, rk.r * 1.1, rk.r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rk.landed ? "#6b5c47" : rk.big ? "#7c6b54" : "#8a8170";
    ctx.strokeStyle = "rgba(20,16,12,0.7)";
    ctx.lineWidth = rk.landed ? 4 : 3;
    circle(rk.x, rk.y, rk.r, true, true);
  }

  // arrows in flight (drawn under the characters)
  for (const a of game.arrows) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(a.vy, a.vx));
    ctx.strokeStyle = a.heavy ? "#ffd27a" : "#e8eefc";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = a.heavy ? 4 : 3;
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -4); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // player (archer) — animated sprite if loaded, else the placeholder circle.
  // Flicker while invulnerable (after a hit / mid-dodge i-frames).
  const flicker = p.invuln > 0 && Math.floor(game.t * 30) % 2 === 0;
  const pclip = ARCHER[playerAnim.clip];
  const pidx = pclip ? frameIndex(playerAnim.t, pclip.fps, pclip.frames, pclip.loop) : 0;
  ctx.globalAlpha = flicker ? 0.45 : 1;
  const drewPlayer = pclip
    ? drawStrip(ctx, pclip, pidx, p.x, p.y + p.r, PLAYER_DISPLAY_H, p.facing.x < 0)
    : false;
  ctx.globalAlpha = 1;
  if (!drewPlayer) {
    ctx.fillStyle = flicker ? "#9fd0ff" : "#3aa0ff";
    circle(p.x, p.y, p.r, true, false);
    ctx.strokeStyle = "#dff0ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.facing.x * (p.r + 10), p.y + p.facing.y * (p.r + 10));
    ctx.stroke();
  }

  // HUD bars
  bar(20, 20, 300, 18, p.hp / p.maxHp, "#37d35a", `HP ${Math.ceil(p.hp)}/${p.maxHp}`);
  bar(W - 420, 20, 400, 18, b.hp / b.maxHp, "#e7544f", `BOSS ${Math.ceil(b.hp)}/${b.maxHp}`);

  if (TOUCH) drawControls();
  else {
    ctx.fillStyle = "#9aa3b5";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("WASD move · J shoot · L power shot · Space dodge", 20, H - 16);
  }

  if (game.over) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = game.over === "won" ? "#7CFC9A" : "#ff7a7a";
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.fillText(game.over === "won" ? "VICTORY" : "DEFEATED", W / 2, H / 2);
    ctx.fillStyle = "#cfd6e4";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText(TOUCH ? "tap ⚔ to fight again" : "press R to fight again", W / 2, H / 2 + 40);
  }
}

function drawControls() {
  // joystick
  const base = stick.active ? stick.base : { x: STICK.hintX, y: STICK.hintY };
  ctx.globalAlpha = stick.active ? 0.9 : 0.4;
  ctx.fillStyle = "rgba(40,48,66,0.5)";
  ctx.strokeStyle = "rgba(180,200,230,0.6)";
  ctx.lineWidth = 3;
  circle(base.x, base.y, STICK.R, true, true);
  const off = stick.active ? knobOffset(stick.base, stick.cur, STICK.R) : { x: 0, y: 0 };
  ctx.fillStyle = "rgba(150,200,255,0.85)";
  circle(base.x + off.x, base.y + off.y, STICK.knobR, true, false);
  ctx.globalAlpha = 1;

  // buttons
  for (const btn of BTN) {
    const on = pressed(btn.role);
    ctx.globalAlpha = on ? 0.95 : 0.55;
    ctx.fillStyle = btn.color;
    circle(btn.cx, btn.cy, btn.r, true, false);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0b0e14";
    ctx.font = `bold ${Math.round(btn.r * 0.8)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(btn.label, btn.cx, btn.cy + 2);
    ctx.textBaseline = "alphabetic";
  }
}

function circle(x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function bar(x, y, w, h, frac, color, label) {
  frac = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * frac, h);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x + 6, y + h - 4);
}
