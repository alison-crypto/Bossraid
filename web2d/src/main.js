// Canvas rendering + input for Bossraid 2D. All rules live in game.js (unit-
// tested); this is the thin "view" layer: keyboard + on-screen touch controls.

import { createGame, deriveCombat, step, emptyInput, CFG } from "./game.js";
import { statSheet } from "./stats.js";
import { stickVector, knobOffset, pointInCircle } from "./touch.js";
import { Animator, frameIndex, clipDuration } from "./anim.js";
import { loadStrip, drawStrip } from "./sprites.js";
import { uiBegin, uiButton, uiZone, uiHit, panel, dim, label, roundRect } from "./ui.js";
import * as rpg from "./rpg.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
// World/logical size — all gameplay + drawing use these coords. The canvas
// BACKING store is sized to the display's real pixels (high-DPI) so the upscaled
// texture stays crisp instead of being a blurry 960x600 buffer stretched up.
const W = CFG.arenaW, H = CFG.arenaH;

// Display settings (size mode + render quality), persisted.
const DPR_CAP = { auto: () => Math.min(window.devicePixelRatio || 1, 2), "1": () => 1, "2": () => 2 };
function loadSettings() {
  try { return { display: "fit", dpr: "auto", ...JSON.parse(localStorage.getItem("bossraid.settings") || "{}") }; }
  catch (_) { return { display: "fit", dpr: "auto" }; }
}
let settings = loadSettings();
function saveSettings() { try { localStorage.setItem("bossraid.settings", JSON.stringify(settings)); } catch (_) { /* no storage */ } }

// Size the canvas ELEMENT per the chosen display mode (the #wrap flex centers it).
function applyDisplay() {
  const s = canvas.style;
  if (settings.display === "stretch") { s.width = "100vw"; s.height = "100vh"; }
  else if (settings.display === "fit") { s.width = "min(100vw, calc(100vh * 1.6))"; s.height = "min(100vh, calc(100vw / 1.6))"; }
  else { const px = { s960: 960, s1280: 1280, s1600: 1600 }[settings.display] || 960; s.width = px + "px"; s.height = Math.round(px / 1.6) + "px"; }
  resizeCanvas();
}
// Size the BACKING store to real device pixels (per the quality cap) so it stays crisp.
function resizeCanvas() {
  const dpr = (DPR_CAP[settings.dpr] || DPR_CAP.auto)();
  const cssW = canvas.clientWidth || W, cssH = canvas.clientHeight || H;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  ctx.imageSmoothingQuality = "high";
}
applyDisplay();
addEventListener("resize", resizeCanvas);
document.addEventListener("fullscreenchange", resizeCanvas);
document.addEventListener("webkitfullscreenchange", resizeCanvas);

let game = createGame();

// --- scene / flow -----------------------------------------------------------
let scene = "menu"; // menu | charSelect | bossSelect | playing (paused added later)
let selectedChar = "archer";
let selectedBoss = "golem";
const CHARACTERS = [
  { id: "archer", name: "Archer", locked: false, blurb: "Ranged — kite & dodge" },
  { id: "knight", name: "Knight", locked: true, blurb: "Coming soon" },
  { id: "mage", name: "Mage", locked: true, blurb: "Coming soon" },
];
const BOSSES = [
  { id: "golem", name: "Ancient Stone Golem", locked: false, blurb: "3 phases · smash · dash · rocks · quake" },
  { id: "wyrm", name: "Cinder Wyrm", locked: true, blurb: "Coming soon" },
];
let profile = rpg.load();
let rewardGiven = false;
function startFight() {
  game = createGame(rpg.gameOptsFromProfile(profile));
  rewardGiven = false;
  scene = "playing";
}
// Award XP from a finished fight (damage dealt, + bonus on a win) once.
function grantReward() {
  if (rewardGiven) return;
  rewardGiven = true;
  const dealt = game.boss.maxHp - game.boss.hp;
  const xp = Math.round(dealt / 5) + (game.over === "won" ? 150 : 0);
  game._levelsGained = rpg.addXp(profile, xp);
  game._xpGained = xp;
  rpg.save(profile);
}

let pauseTab = "character";
// Re-derive the live player's combat fields after a pause-menu change (spend a
// point / equip gear), preserving current HP and adding any max-HP gain.
function reapplyProfile() {
  const c = deriveCombat(rpg.gameOptsFromProfile(profile));
  const pl = game.player, dHp = c.maxHp - pl.maxHp;
  Object.assign(pl, {
    str: c.str, dex: c.dex, con: c.con, def: c.def, bowDmg: c.bowDmg, speed: c.speed,
    dodgeIframes: c.dodgeIframes, heavyBaseMult: c.heavyBaseMult, rangedVBonus: c.rangedVBonus,
    maxHp: c.maxHp, hp: Math.min(c.maxHp, pl.hp + Math.max(0, dHp)),
  });
  rpg.save(profile);
}

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
  idle:    loadStrip("./assets/golem_idle.png", 6, 8, true),
  walk:    loadStrip("./assets/golem_walk.png", 8, 10, true),
  smash:   loadStrip("./assets/golem_smash.png", 8, 8, false),
  dash:    loadStrip("./assets/golem_dash.png", 6, 7, false),
  bigrock: loadStrip("./assets/golem_bigrock.png", 6, 7, false),
  scatter: loadStrip("./assets/golem_scatter.png", 6, 7, false),
  quake:   loadStrip("./assets/golem_quake.png", 8, 6, false),
  hit:     loadStrip("./assets/golem_hit.png", 4, 16, false),
  death:   loadStrip("./assets/golem_death.png", 6, 9, false),
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

// --- one-shot VFX -----------------------------------------------------------
// Center-anchored effect sprites played once at a point. `add` = additive blend
// (for glows: impact spark, shockwave ring, rune burst). `h` = on-screen size.
const FX = {
  impact:      { strip: loadStrip("./assets/fx_impact.png", 5, 22, false),      h: 90,  add: true },
  dust:        { strip: loadStrip("./assets/fx_dust.png", 6, 16, false),        h: 130, add: false },
  shockwave:   { strip: loadStrip("./assets/fx_shockwave.png", 6, 18, false),   h: 280, add: true },
  rockshatter: { strip: loadStrip("./assets/fx_rockshatter.png", 6, 16, false), h: 120, add: false },
  quakecrack:  { strip: loadStrip("./assets/fx_quakecrack.png", 8, 16, false),  h: 360, add: false },
  runeburst:   { strip: loadStrip("./assets/fx_runeburst.png", 6, 18, false),   h: 90,  add: true },
};
const effects = []; // { name, x, y, t, scale }
function spawnFx(name, x, y, scale = 1) { effects.push({ name, x, y, t: 0, scale }); }
let shakeT = 0; // seconds of screen-shake remaining (earthquake)

// rock props: frame 0 = boulder (big rock + landed obstacle), 1..3 = scatter pellets
const ROCKS = loadStrip("./assets/rocks_set.png", 4, 1, false);
const rockVariant = new WeakMap(); // stable pellet frame per scatter rock
let dashDustT = 0; // throttles the dash dust trail

// Arena floor texture (optional). Falls back to a procedural stone floor so the
// arena always has a ground, even before art is dropped in.
const floorImg = new Image();
let floorOk = false;
floorImg.onload = () => { floorOk = floorImg.naturalWidth > 0; };
floorImg.onerror = () => { floorOk = false; };
floorImg.src = "./assets/arena_floor.png";

function drawFloor() {
  if (floorOk) {
    const tw = floorImg.naturalWidth, th = floorImg.naturalHeight;
    for (let y = -th; y < H + th; y += th) for (let x = -tw; x < W + tw; x += tw) ctx.drawImage(floorImg, x, y);
  } else {
    ctx.fillStyle = "#15140f";
    ctx.fillRect(-24, -24, W + 48, H + 48);
    const T = 84;
    for (let ty = -24; ty < H + 24; ty += T) for (let tx = -24; tx < W + 24; tx += T) {
      const n = (((tx * 73856093) ^ (ty * 19349663)) >>> 0) % 12;
      ctx.fillStyle = `rgb(${26 + n},${24 + n},${19 + n})`;
      ctx.fillRect(tx + 1, ty + 1, T - 2, T - 2);
    }
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.88);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(-24, -24, W + 48, H + 48);
}

// Fire effects off game events (view-only). WeakSets mark rocks/arrows already
// handled so each boulder shatter / charged-shot burst plays exactly once.
let prevBossStateFx = null, prevBossHpFx = null, prevPlayerHpFx = null, prevPhaseFx = null;
const fxSeenRocks = new WeakSet();
const fxSeenArrows = new WeakSet();
function updateFxTriggers(dt) {
  const b = game.boss, p = game.player;
  if (b.state === "strike" && prevBossStateFx !== "strike") {
    if (b.attack === "smash") spawnFx("shockwave", b.slam.x, b.slam.y, 1);
    else if (b.attack === "dash") spawnFx("dust", b.x, b.y + b.r * 0.5, 1.3); // kick-off burst
    else if (b.attack === "scatter") spawnFx("dust", b.x, b.y, 0.7);
    else if (b.attack === "quake") {
      // earthquake hits the whole arena: shake + cracks scattered everywhere
      shakeT = 0.55;
      spawnFx("quakecrack", b.x, b.y + b.r * 0.4, 1.5);
      for (let k = 0; k < 6; k++) {
        spawnFx("quakecrack", 110 + Math.random() * (W - 220), 110 + Math.random() * (H - 220), 0.7 + Math.random() * 0.7);
      }
    }
  }
  prevBossStateFx = b.state;

  // phase-up — the golem breaks a health segment and escalates
  if (prevPhaseFx !== null && b.phase > prevPhaseFx) {
    shakeT = 0.7;
    spawnFx("runeburst", b.x, b.y - b.r, 1.8);
    for (let k = 0; k < 5; k++) spawnFx("dust", b.x + (Math.random() * 140 - 70), b.y + b.r * 0.4, 0.9);
  }
  prevPhaseFx = b.phase;

  // dash dust trail — small puffs at the golem's feet while it charges
  if (b.attack === "dash" && b.state === "strike" && b.dash.active) {
    dashDustT -= dt;
    if (dashDustT <= 0) { spawnFx("dust", b.x - b.dash.dx * 14, b.y + b.r * 0.5, 0.55); dashDustT = 0.04; }
  } else dashDustT = 0;

  if (prevBossHpFx !== null && b.hp < prevBossHpFx && b.hp > 0) {
    spawnFx("impact", b.x + (Math.random() * 40 - 20), b.y + (Math.random() * 30 - 15), 0.9);
  }
  prevBossHpFx = b.hp;
  if (prevPlayerHpFx !== null && p.hp < prevPlayerHpFx && p.hp > 0) spawnFx("dust", p.x, p.y, 0.6); // got hit
  prevPlayerHpFx = p.hp;

  for (const rk of game.rocks) if (rk.landed && !fxSeenRocks.has(rk)) { fxSeenRocks.add(rk); spawnFx("rockshatter", rk.x, rk.y, 1); }
  for (const a of game.arrows) if (a.heavy && !fxSeenArrows.has(a)) { fxSeenArrows.add(a); spawnFx("runeburst", a.x, a.y, 0.7); }
}

function tickEffects(dt) {
  if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
  for (const e of effects) e.t += dt;
  for (let i = effects.length - 1; i >= 0; i--) {
    const st = FX[effects[i].name].strip;
    if (effects[i].t >= clipDuration(st.fps, st.frames)) effects.splice(i, 1);
  }
}

function drawEffects() {
  for (const e of effects) {
    const cfg = FX[e.name], st = cfg.strip;
    const ix = frameIndex(e.t, st.fps, st.frames, false);
    const targetH = cfg.h * e.scale;
    if (cfg.add) ctx.globalCompositeOperation = "lighter";
    drawStrip(ctx, st, ix, e.x, e.y + targetH / 2, targetH, false);
    if (cfg.add) ctx.globalCompositeOperation = "source-over";
  }
}

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
  // Each attack now has its own animation (smash/dash/bigrock/scatter/quake).
  if (b.state === "windup" || b.state === "strike") return b.attack;
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
    x: (e.clientX - r.left) / r.width * W,   // map display -> logical world coords
    y: (e.clientY - r.top) / r.height * H,
  };
}

function onDown(e) {
  e.preventDefault();
  const p = toCanvas(e);
  // menu screens, pause and the game-over overlay are click-driven UI
  if (scene !== "playing" || game.over) { handleUiClick(p.x, p.y); return; }
  // the on-canvas pause button (registered each frame during play)
  if (uiHit(p.x, p.y) === "pauseBtn") { scene = "paused"; return; }
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
// Enter/Space advances the menu screens (click/tap also works).
addEventListener("keydown", (e) => {
  if (scene === "playing" || scene === "paused" || (e.code !== "Enter" && e.code !== "Space")) return;
  if (scene === "menu") scene = "charSelect";
  else if (scene === "charSelect") scene = "bossSelect";
  else if (scene === "bossSelect") startFight();
  e.preventDefault();
});
// Esc / P toggles pause during a fight.
addEventListener("keydown", (e) => {
  if (e.code !== "Escape" && e.code !== "KeyP") return;
  if (scene === "playing" && !game.over) scene = "paused";
  else if (scene === "paused") scene = "playing";
});
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
// --- menu / select screens --------------------------------------------------
function beginScreen() {
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  drawFloor();
  dim(ctx, W, H, 0.6);
  uiBegin();
}

// A selectable roster card (portrait from the character/boss idle art).
function drawCard(item, x, y, w, h, selected, id, strip) {
  ctx.fillStyle = item.locked ? "rgba(16,18,26,0.92)" : "rgba(22,28,40,0.96)";
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = selected ? "rgba(150,200,255,0.95)" : "rgba(150,170,210,0.3)";
  ctx.lineWidth = selected ? 4 : 2; roundRect(ctx, x, y, w, h, 12); ctx.stroke();
  if (strip && strip.ok && !item.locked) {
    drawStrip(ctx, strip, 0, x + w / 2, y + h * 0.74, h * 0.56, false);
  } else {
    ctx.fillStyle = "#2a3140";
    roundRect(ctx, x + w * 0.28, y + h * 0.22, w * 0.44, h * 0.46, 8); ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.fillStyle = item.locked ? "#5a6478" : "#eaf0ff";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText(item.name, x + w / 2, y + h - 44);
  ctx.fillStyle = "#9fb3d6"; ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(item.blurb, x + w / 2, y + h - 20);
  if (item.locked) {
    ctx.fillStyle = "rgba(6,8,12,0.45)"; roundRect(ctx, x, y, w, h, 12); ctx.fill();
    label(ctx, "🔒 LOCKED", x + w / 2, y + h / 2, { size: 18, bold: true, color: "#aebbd6" });
  } else {
    uiZone(id, x, y, w, h);
  }
}

function renderMenu() {
  beginScreen();
  label(ctx, "BOSSRAID", W / 2, 175, { size: 66, bold: true, color: "#eef3ff" });
  label(ctx, "2 D", W / 2, 212, { size: 22, color: "#9fb3d6" });
  uiButton(ctx, "play", "PLAY", W / 2 - 110, 275, 220, 58, { accent: "#345b86" });
  uiButton(ctx, "settings", "Settings", W / 2 - 90, 348, 180, 46);
  label(ctx, TOUCH ? "tap PLAY to begin" : "click PLAY (or press Enter)", W / 2, 430, { size: 14, color: "#7e8aa3" });
}

function renderSettings() {
  beginScreen();
  label(ctx, "SETTINGS", W / 2, 90, { size: 34, bold: true, color: "#eef3ff" });
  label(ctx, "Display size", W / 2, 160, { size: 18, color: "#cfe0ff" });
  const disp = [["fit", "Fit"], ["stretch", "Stretch"], ["s960", "960"], ["s1280", "1280"], ["s1600", "1600"]];
  const dw = 130, dg = 10, dtot = disp.length * dw + (disp.length - 1) * dg, dx0 = (W - dtot) / 2;
  disp.forEach(([id, lbl], i) => uiButton(ctx, "disp_" + id, lbl, dx0 + i * (dw + dg), 180, dw, 46, { active: settings.display === id }));
  label(ctx, "Render quality", W / 2, 280, { size: 18, color: "#cfe0ff" });
  const q = [["auto", "Auto"], ["1", "1×"], ["2", "2×"]];
  const qw = 150, qg = 12, qtot = q.length * qw + (q.length - 1) * qg, qx0 = (W - qtot) / 2;
  q.forEach(([id, lbl], i) => uiButton(ctx, "dpr_" + id, lbl, qx0 + i * (qw + qg), 300, qw, 46, { active: settings.dpr === id }));
  label(ctx, "Fit keeps the aspect (bands on wide screens); Stretch fills edge-to-edge.", W / 2, 380, { size: 13, color: "#93a1bd" });
  uiButton(ctx, "backMenu", "◀ Back", 28, H - 66, 120, 44);
}

function renderCharSelect() {
  beginScreen();
  label(ctx, "SELECT CHARACTER", W / 2, 84, { size: 34, bold: true, color: "#eef3ff" });
  const cw = 210, ch = 300, gap = 28, total = CHARACTERS.length * cw + (CHARACTERS.length - 1) * gap;
  const x0 = (W - total) / 2, y = 120;
  CHARACTERS.forEach((c, i) => drawCard(c, x0 + i * (cw + gap), y, cw, ch, selectedChar === c.id, "char_" + c.id, ARCHER.idle));
  uiButton(ctx, "backMenu", "◀ Back", 28, H - 66, 120, 44);
  uiButton(ctx, "toBoss", "NEXT ▶", W - 28 - 180, H - 66, 180, 50, { accent: "#2f7a4f" });
}

function renderBossSelect() {
  beginScreen();
  label(ctx, "SELECT BOSS", W / 2, 84, { size: 34, bold: true, color: "#eef3ff" });
  const cw = 250, ch = 300, gap = 28, total = BOSSES.length * cw + (BOSSES.length - 1) * gap;
  const x0 = (W - total) / 2, y = 120;
  BOSSES.forEach((b, i) => drawCard(b, x0 + i * (cw + gap), y, cw, ch, selectedBoss === b.id, "boss_" + b.id, GOLEM.idle));
  uiButton(ctx, "backChar", "◀ Back", 28, H - 66, 120, 44);
  uiButton(ctx, "fight", "FIGHT ▶", W - 28 - 200, H - 66, 200, 52, { accent: "#9a3b3b" });
}

function renderScene() {
  if (scene === "menu") renderMenu();
  else if (scene === "charSelect") renderCharSelect();
  else if (scene === "bossSelect") renderBossSelect();
  else if (scene === "settings") renderSettings();
}

// --- pause menu + RPG panels ------------------------------------------------
const PAUSE_TABS = [["character", "Character"], ["stats", "Stats"], ["skills", "Skills"], ["inventory", "Inventory"], ["level", "Level"]];

function renderPause() {
  render(); // the frozen fight underneath
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  dim(ctx, W, H, 0.55);
  uiBegin();
  const px = 110, py = 64, pw = W - 220, ph = H - 128;
  panel(ctx, px, py, pw, ph, "PAUSED");
  const tw = 128, gap = 6, ty = py + 50;
  PAUSE_TABS.forEach(([id, lbl], i) =>
    uiButton(ctx, "tab_" + id, lbl, px + 18 + i * (tw + gap), ty, tw, 38, { active: pauseTab === id, font: 15 }));
  drawPauseTab(px + 24, ty + 60, pw - 48);
  uiButton(ctx, "resume", "Resume", px + pw - 332, py + ph - 56, 150, 42, { accent: "#2f7a4f" });
  uiButton(ctx, "quit", "Quit to Menu", px + pw - 172, py + ph - 56, 154, 42);
}

function drawPauseTab(x, y, w) {
  const p = profile;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  if (pauseTab === "character") {
    if (ARCHER.idle.ok) drawStrip(ctx, ARCHER.idle, 0, x + 90, y + 200, 230, false);
    label(ctx, "Archer", x + 200, y + 30, { size: 26, bold: true, align: "left", color: "#eaf0ff" });
    label(ctx, `Level ${p.level}`, x + 200, y + 62, { size: 18, align: "left", color: "#cfe0ff" });
    const eq = rpg.equippedStats(p);
    const lines = [
      `Bow:   ${rpg.BOWS.find((b) => b.id === p.equip.bow).name}`,
      `Armor: ${rpg.ARMORS.find((a) => a.id === p.equip.armor).name}`,
      `Boots: ${rpg.BOOTS.find((b) => b.id === p.equip.boots).name}`,
      `DEF ${eq.def}   ·   Bow dmg ${eq.bowDmg}`,
    ];
    lines.forEach((t, i) => label(ctx, t, x + 200, y + 104 + i * 30, { size: 16, align: "left", color: "#b9c6df" }));
  } else if (pauseTab === "stats") {
    const s = statSheet(p.str, p.dex, p.con, 50, 0, rpg.equippedStats(p).def, rpg.equippedStats(p).bowDmg);
    const rows = [
      `STR ${s.STR}`, `DEX ${s.DEX}`, `CON ${s.CON}`,
      `Max HP ${s.maxHealth}`, `DEF ${s.effectiveDEF}`,
      `Arrow impact ${s.arrowImpact}`, `Arrow v0 ${s.arrowV0.toFixed(1)}`,
      `Charged ×${s.heavyMult.toFixed(2)}`, `Stamina ${CFG.staminaMax}`,
    ];
    rows.forEach((t, i) => label(ctx, t, x + (i % 2) * (w / 2), y + 24 + Math.floor(i / 2) * 34, { size: 18, align: "left", color: "#dbe6fb" }));
  } else if (pauseTab === "skills") {
    label(ctx, `Skill points: ${p.skillPts}`, x, y, { size: 16, align: "left", color: "#cfe0ff", bold: true });
    rpg.SKILLS.forEach((sk, i) => {
      const ry = y + 28 + i * 64;
      label(ctx, `${sk.name}  (${p.skills[sk.id]}/${rpg.SKILL_MAX})`, x, ry + 18, { size: 18, align: "left", color: "#eaf0ff" });
      label(ctx, sk.desc, x, ry + 40, { size: 13, align: "left", color: "#93a1bd" });
      const can = p.skillPts > 0 && p.skills[sk.id] < rpg.SKILL_MAX;
      uiButton(ctx, "skill_" + sk.id, "+", x + w - 60, ry, 52, 46, { enabled: can, accent: "#345b86" });
    });
  } else if (pauseTab === "inventory") {
    const slots = [["bow", rpg.BOWS], ["armor", rpg.ARMORS], ["boots", rpg.BOOTS]];
    let ry = y;
    slots.forEach(([slot, list]) => {
      label(ctx, slot.toUpperCase(), x, ry + 16, { size: 14, align: "left", color: "#9fb3d6", bold: true });
      list.forEach((it, i) => {
        const bx = x + 90 + i * 180, owned = p.owned.includes(it.id), on = p.equip[slot] === it.id;
        const can = owned && rpg.canEquip(p, it);
        uiButton(ctx, "equip_" + slot + "_" + it.id, it.name.replace(/^.*? /, ""), bx, ry - 6, 170, 40,
          { active: on, enabled: can, font: 13, accent: owned ? "#2a3346" : "#1b2030" });
        if (!owned) label(ctx, "locked", bx + 85, ry + 30, { size: 11, color: "#5a6478" });
        else if (!rpg.canEquip(p, it)) label(ctx, `STR ${it.strReq}`, bx + 85, ry + 30, { size: 11, color: "#c98" });
      });
      ry += 70;
    });
  } else if (pauseTab === "level") {
    label(ctx, `Level ${p.level}`, x, y + 6, { size: 22, bold: true, align: "left", color: "#eaf0ff" });
    label(ctx, `XP ${p.xp} / ${rpg.xpToNext(p.level)}`, x + 160, y + 6, { size: 16, align: "left", color: "#9fb3d6" });
    label(ctx, `Stat points: ${p.statPts}`, x, y + 44, { size: 16, align: "left", color: "#cfe0ff", bold: true });
    [["str", "STR", p.str], ["dex", "DEX", p.dex], ["con", "CON", p.con]].forEach(([k, lbl, v], i) => {
      const ry = y + 70 + i * 56;
      label(ctx, `${lbl}  ${v}`, x, ry + 30, { size: 20, align: "left", color: "#eaf0ff" });
      uiButton(ctx, "stat_" + k, "+", x + 180, ry, 52, 46, { enabled: p.statPts > 0, accent: "#2f7a4f" });
    });
    label(ctx, "CON raises max HP · STR/DEX raise damage", x, y + 70 + 3 * 56 + 6, { size: 13, align: "left", color: "#93a1bd" });
  }
}

// Route a menu/game-over click to its action (regions registered last render).
function handleUiClick(x, y) {
  const id = uiHit(x, y);
  if (!id) return;
  if (scene === "paused") {
    if (id === "resume") scene = "playing";
    else if (id === "quit") scene = "menu";
    else if (id.startsWith("tab_")) pauseTab = id.slice(4);
    else if (id.startsWith("stat_")) { rpg.spendStat(profile, id.slice(5)); reapplyProfile(); }
    else if (id.startsWith("skill_")) { rpg.rankUp(profile, id.slice(6)); reapplyProfile(); }
    else if (id.startsWith("equip_")) { const [, slot, item] = id.split("_"); rpg.equip(profile, slot, item); reapplyProfile(); }
    return;
  }
  if (game.over) {
    if (id === "retry") startFight();
    else if (id === "menu") scene = "menu";
    return;
  }
  if (scene === "settings") {
    if (id === "backMenu") scene = "menu";
    else if (id.startsWith("disp_")) { settings.display = id.slice(5); saveSettings(); applyDisplay(); }
    else if (id.startsWith("dpr_")) { settings.dpr = id.slice(4); saveSettings(); applyDisplay(); }
    return;
  }
  if (scene === "menu" && id === "play") scene = "charSelect";
  else if (scene === "menu" && id === "settings") scene = "settings";
  else if (scene === "charSelect") {
    if (id.startsWith("char_")) selectedChar = id.slice(5);
    else if (id === "toBoss") scene = "bossSelect";
    else if (id === "backMenu") scene = "menu";
  } else if (scene === "bossSelect") {
    if (id.startsWith("boss_")) selectedBoss = id.slice(5);
    else if (id === "fight") startFight();
    else if (id === "backChar") scene = "charSelect";
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (scene === "playing") {
    if (game.over) {
      grantReward();
      if (keys.has("KeyR")) startFight();
    } else {
      step(game, readInput(), dt);
    }
    updateBossAnimSignals(dt); bossAnim.play(bossClip()); bossAnim.tick(dt);
    updatePlayerAnimSignals(dt); playerAnim.play(playerClip()); playerAnim.tick(dt);
    updateFxTriggers(dt); tickEffects(dt);
    render();
  } else if (scene === "paused") {
    renderPause();
  } else {
    renderScene();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- render -----------------------------------------------------------------
function render() {
  const p = game.player, b = game.boss;

  // Map the 960x600 world onto the full-resolution backing store (high-DPI).
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);

  // Screen-shake offset (earthquake). Wrap the whole playfield so the floor,
  // characters and FX shake together; the border + HUD are drawn after restore.
  const sh = shakeT > 0 ? Math.min(1, shakeT / 0.55) : 0;
  const ox = sh ? (Math.random() * 2 - 1) * sh * 13 : 0;
  const oy = sh ? (Math.random() * 2 - 1) * sh * 13 : 0;
  ctx.save();
  ctx.translate(ox, oy);

  drawFloor();

  // smash danger zone — a ground decal AROUND the golem (the ring IS the hitbox).
  // windup: gradient pool + a shrinking inner ring counting down to impact.
  if (b.slam.active) {
    const cx = b.slam.x, cy = b.slam.y, R = CFG.slamR;
    if (b.state === "windup") {
      const k = 1 - b.t / CFG.windup;
      const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
      g.addColorStop(0, `rgba(255,140,70,${0.06 + 0.10 * k})`);
      g.addColorStop(0.75, `rgba(235,80,55,${0.10 + 0.20 * k})`);
      g.addColorStop(1, "rgba(210,50,45,0)");
      ctx.fillStyle = g; circle(cx, cy, R, true, false);
      ctx.strokeStyle = `rgba(255,100,75,${0.5 + 0.4 * k})`; ctx.lineWidth = 3; circle(cx, cy, R, false, true);
      ctx.strokeStyle = `rgba(255,210,150,${0.2 + 0.7 * k})`; ctx.lineWidth = 4; circle(cx, cy, Math.max(2, R * (1 - k)), false, true);
    } else if (b.state === "strike") {
      const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
      g.addColorStop(0, "rgba(255,235,180,0.6)");
      g.addColorStop(1, "rgba(255,150,70,0)");
      ctx.fillStyle = g; circle(cx, cy, R, true, false);
      ctx.strokeStyle = "rgba(255,230,160,0.95)"; ctx.lineWidth = 6; circle(cx, cy, R, false, true);
    }
  }

  // dash-charge telegraph — a tapered danger lane with chevrons sliding along
  // the locked lunge direction.
  if (b.attack === "dash" && b.state === "windup") {
    const k = 1 - b.t / CFG.dashWindup;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.dash.dy, b.dash.dx));
    const L = 250, w = 48;
    const g = ctx.createLinearGradient(0, 0, L, 0);
    g.addColorStop(0, `rgba(255,120,75,${0.12 + 0.28 * k})`);
    g.addColorStop(1, "rgba(255,120,75,0)");
    ctx.fillStyle = g; ctx.fillRect(0, -w / 2, L, w);
    ctx.strokeStyle = `rgba(255,205,150,${0.35 + 0.5 * k})`; ctx.lineWidth = 5; ctx.lineCap = "round";
    const adv = (k * 50) % 56;
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 56 + adv;
      if (x > L - 12) continue;
      ctx.beginPath(); ctx.moveTo(x, -15); ctx.lineTo(x + 16, 0); ctx.lineTo(x, 15); ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.restore();
  }

  // earthquake telegraph — a full-arena red vignette + pulsing border on windup,
  // an orange flash on impact (paired with screen-shake + scattered cracks).
  if (b.attack === "quake") {
    if (b.state === "windup") {
      const k = 1 - b.t / CFG.quakeWindup;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(200,45,35,${0.12 + 0.32 * k})`);
      ctx.fillStyle = g; ctx.fillRect(-24, -24, W + 48, H + 48);
      const pulse = 0.5 + 0.5 * Math.sin(game.t * 22);
      ctx.strokeStyle = `rgba(255,90,65,${(0.25 + 0.5 * k) * (0.5 + 0.5 * pulse)})`;
      ctx.lineWidth = 5 + 18 * k; ctx.strokeRect(14, 14, W - 28, H - 28);
    } else if (b.state === "strike" && b.quake.active) {
      ctx.fillStyle = "rgba(255,150,90,0.22)"; ctx.fillRect(-24, -24, W + 48, H + 48);
    }
  }

  // dash motion streaks — speed lines trailing behind the charging golem
  if (b.attack === "dash" && b.state === "strike" && b.dash.active) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.dash.dy, b.dash.dx));
    ctx.strokeStyle = "rgba(225,215,195,0.3)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const yy = -42 + i * 17;
      const ln = 36 + Math.random() * 46;
      ctx.beginPath(); ctx.moveTo(-b.r, yy); ctx.lineTo(-b.r - ln, yy); ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.restore();
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

  // boss rocks as real stone: boulder (frame 0) for the big rock + landed
  // obstacle, a stable small-rock variant (frames 1–3) for scatter pellets.
  for (const rk of game.rocks) {
    if (rk.landed) {
      ctx.fillStyle = "rgba(0,0,0,0.4)"; // grounded shadow
      ctx.beginPath();
      ctx.ellipse(rk.x, rk.y + rk.r * 0.75, rk.r * 1.3, rk.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    let frame = 0;
    if (!rk.big && !rk.landed) {
      let v = rockVariant.get(rk);
      if (!v) { v = 1 + Math.floor(Math.random() * 3); rockVariant.set(rk, v); }
      frame = v;
    }
    const size = rk.r * (rk.landed ? 3.2 : rk.big ? 2.9 : 2.7);
    const drew = ROCKS.ok && drawStrip(ctx, ROCKS, frame, rk.x, rk.y + size / 2, size, false);
    if (!drew) {
      ctx.fillStyle = rk.landed ? "#6b5c47" : rk.big ? "#7c6b54" : "#8a8170";
      ctx.strokeStyle = "rgba(20,16,12,0.7)";
      ctx.lineWidth = rk.landed ? 4 : 3;
      circle(rk.x, rk.y, rk.r, true, true);
    }
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

  // one-shot VFX, layered over the action
  drawEffects();

  ctx.restore(); // end screen-shake transform

  // arena border (drawn un-shaken, over the playfield)
  ctx.strokeStyle = "#2b3346";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  // HUD bars
  bar(20, 20, 300, 18, p.hp / p.maxHp, "#37d35a", `HP ${Math.ceil(p.hp)}/${p.maxHp}`);
  bar(20, 42, 220, 11, p.stamina / p.staminaMax, "#e6c84f", ""); // stamina
  // level + xp readout
  label(ctx, `LVL ${profile.level}`, 20, 74, { size: 13, align: "left", color: "#cfe0ff", bold: true });
  bar(78, 64, 162, 9, profile.xp / rpg.xpToNext(profile.level), "#7aa2ff", "");
  const bossW = 400, bossX = W - bossW - 20;
  bar(bossX, 20, bossW, 18, b.hp / b.maxHp, "#e7544f", `BOSS ${Math.ceil(b.hp)}/${b.maxHp}`);
  // phase segment dividers (the golem escalates each time a segment empties)
  ctx.strokeStyle = "rgba(10,12,18,0.9)";
  ctx.lineWidth = 2;
  for (let i = 1; i < CFG.phases; i++) {
    const x = bossX + (bossW * i) / CFG.phases;
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, 38); ctx.stroke();
  }

  // on-canvas pause button (touch + mouse); cleared when paused/over
  if (!game.over) {
    uiBegin();
    uiButton(ctx, "pauseBtn", "⏸", bossX - 52, 19, 40, 30, { accent: "rgba(30,36,50,0.8)", font: 16 });
  }

  if (TOUCH) drawControls();
  else {
    ctx.fillStyle = "#9aa3b5";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("WASD move · J shoot · L power shot · Space dodge", 20, H - 16);
  }

  if (game.over) {
    dim(ctx, W, H, 0.6);
    ctx.textAlign = "center";
    ctx.fillStyle = game.over === "won" ? "#7CFC9A" : "#ff7a7a";
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.fillText(game.over === "won" ? "VICTORY" : "DEFEATED", W / 2, H / 2 - 30);
    const lvUp = game._levelsGained ? `  ·  LEVEL UP ×${game._levelsGained}` : "";
    label(ctx, `+${game._xpGained || 0} XP${lvUp}`, W / 2, H / 2 - 2, { size: 18, color: "#cfe0ff" });
    uiBegin();
    uiButton(ctx, "retry", "Retry", W / 2 - 200, H / 2 + 16, 180, 52, { accent: "#2f7a4f" });
    uiButton(ctx, "menu", "Menu", W / 2 + 20, H / 2 + 16, 180, 52);
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
