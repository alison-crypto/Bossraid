// Canvas rendering + input for Bossraid 2D. All rules live in game.js (unit-
// tested); this is the thin "view" layer: keyboard + on-screen touch controls.

import { createGame, step, emptyInput, CFG } from "./game.js";
import { stickVector, knobOffset, pointInCircle } from "./touch.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = CFG.arenaW;
canvas.height = CFG.arenaH;
const W = canvas.width, H = canvas.height;

let game = createGame();

const TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

// --- on-screen controls (canvas coords) ------------------------------------
const STICK = { hintX: 120, hintY: H - 120, R: 78, knobR: 36 };
const BTN = [
  { role: "attack", label: "⚔", cx: W - 100, cy: H - 100, r: 50, color: "#3aa0ff" },
  { role: "heavy",  label: "⚡", cx: W - 210, cy: H - 150, r: 36, color: "#c8893f" },
  { role: "dodge",  label: "»", cx: W - 112, cy: H - 218, r: 36, color: "#5ad1a0" },
];

const stick = { active: false, id: null, base: { x: 0, y: 0 }, cur: { x: 0, y: 0 } };
const pointers = new Map(); // pointerId -> { role }

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

function onDown(e) {
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
    stick.cur = toCanvas(e);
    e.preventDefault();
  }
}

function onUp(e) {
  const rec = pointers.get(e.pointerId);
  if (rec) {
    if (rec.role === "stick") { stick.active = false; stick.id = null; }
    pointers.delete(e.pointerId);
    e.preventDefault();
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

  // slam telegraph
  if (b.slam.active) {
    if (b.state === "windup") {
      const k = 1 - b.t / CFG.windup;
      ctx.fillStyle = `rgba(230,60,50,${0.12 + 0.35 * k})`;
      ctx.strokeStyle = `rgba(255,90,70,${0.5 + 0.5 * k})`;
    } else {
      ctx.fillStyle = "rgba(255,140,60,0.85)";
      ctx.strokeStyle = "rgba(255,180,90,1)";
    }
    ctx.lineWidth = 3;
    circle(b.slam.x, b.slam.y, CFG.slamR, true, true);
  }

  // boss
  ctx.fillStyle = { idle: "#6f7787", windup: "#c2553f", strike: "#ff9c44", recover: "#555b69" }[b.state];
  circle(b.x, b.y, b.r, true, false);
  ctx.fillStyle = "#0c0e14";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GOLEM", b.x, b.y + 6);

  // player
  const inv = p.invuln > 0 && Math.floor(game.t * 30) % 2 === 0;
  ctx.fillStyle = inv ? "#9fd0ff" : "#3aa0ff";
  circle(p.x, p.y, p.r, true, false);
  ctx.strokeStyle = "#dff0ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + p.facing.x * (p.r + 10), p.y + p.facing.y * (p.r + 10));
  ctx.stroke();

  // HUD bars
  bar(20, 20, 300, 18, p.hp / p.maxHp, "#37d35a", `HP ${Math.ceil(p.hp)}/${p.maxHp}`);
  bar(W - 420, 20, 400, 18, b.hp / b.maxHp, "#e7544f", `BOSS ${Math.ceil(b.hp)}/${b.maxHp}`);

  if (TOUCH) drawControls();
  else {
    ctx.fillStyle = "#9aa3b5";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("WASD move · J attack · L heavy · Space dodge", 20, H - 16);
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
