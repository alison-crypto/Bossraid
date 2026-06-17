// Canvas rendering + input for Bossraid 2D. This is the thin "view" layer — all
// the rules live in game.js (which is unit-tested). Kept deliberately simple.

import { createGame, step, emptyInput, CFG } from "./game.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = CFG.arenaW;
canvas.height = CFG.arenaH;

let game = createGame();

// --- input ------------------------------------------------------------------
const keys = new Set();
const DOWN = (e) => { keys.add(e.code); if (REMAP[e.code]) e.preventDefault(); };
const UP = (e) => keys.delete(e.code);
const REMAP = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
addEventListener("keydown", DOWN);
addEventListener("keyup", UP);

function readInput() {
  const i = emptyInput();
  if (keys.has("KeyW") || keys.has("ArrowUp")) i.move.y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) i.move.y += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) i.move.x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) i.move.x += 1;
  i.attack = keys.has("KeyJ");
  i.heavy = keys.has("KeyL");
  i.dodge = keys.has("Space");
  return i;
}

// --- loop -------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.over && keys.has("KeyR")) game = createGame();
  if (!game.over) step(game, readInput(), dt);

  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- render -----------------------------------------------------------------
function render() {
  const p = game.player, b = game.boss;

  ctx.fillStyle = "#11141c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // arena border
  ctx.strokeStyle = "#2b3346";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  // slam telegraph
  if (b.slam.active) {
    if (b.state === "windup") {
      const k = 1 - b.t / CFG.windup; // 0 -> 1 as it winds up
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
  const bossColor = { idle: "#6f7787", windup: "#c2553f", strike: "#ff9c44", recover: "#555b69" }[b.state];
  ctx.fillStyle = bossColor;
  circle(b.x, b.y, b.r, true, false);
  ctx.fillStyle = "#0c0e14";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GOLEM", b.x, b.y + 6);

  // player (blink while invulnerable)
  const inv = p.invuln > 0 && Math.floor(game.t * 30) % 2 === 0;
  ctx.fillStyle = inv ? "#9fd0ff" : "#3aa0ff";
  circle(p.x, p.y, p.r, true, false);
  // facing tick
  ctx.strokeStyle = "#dff0ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + p.facing.x * (p.r + 10), p.y + p.facing.y * (p.r + 10));
  ctx.stroke();

  // HUD
  bar(20, 20, 300, 18, p.hp / p.maxHp, "#37d35a", `HP ${Math.ceil(p.hp)}/${p.maxHp}`);
  bar(canvas.width - 420, 20, 400, 18, b.hp / b.maxHp, "#e7544f", `BOSS ${Math.ceil(b.hp)}/${b.maxHp}`);

  ctx.fillStyle = "#9aa3b5";
  ctx.font = "14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("WASD move · J attack · L heavy · Space dodge", 20, canvas.height - 16);

  if (game.over) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = game.over === "won" ? "#7CFC9A" : "#ff7a7a";
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.fillText(game.over === "won" ? "VICTORY" : "DEFEATED", canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = "#cfd6e4";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("press R to fight again", canvas.width / 2, canvas.height / 2 + 40);
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
