// Bossraid — 3D feel test.
//
// A throwaway third-person prototype to answer one question: does controlling a
// hero in a 3D browser scene feel good? No gameplay — just movement, a follow
// camera, and an Aincrad-style floating platform with a boss statue for scale.
// Uses Three.js loaded from a CDN, so it still runs from a plain link.

import * as THREE from 'three';

const canvas = document.getElementById('c');
const hint = document.getElementById('hint');

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e8); // hazy sky
scene.fog = new THREE.Fog(0x9fc4e8, 60, 170);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

// --- Lighting ---------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x46506a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
sun.position.set(28, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

// --- The floating platform (one "floor" of the castle) ----------------------
const PLATFORM_R = 26;

const platform = new THREE.Mesh(
  new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R - 2.5, 3, 64),
  new THREE.MeshStandardMaterial({ color: 0x6b7387, roughness: 0.95 })
);
platform.position.y = -1.5;
platform.receiveShadow = true;
scene.add(platform);

// Inlaid floor disc with a subtle grid so motion reads clearly.
const floorTex = makeGridTexture();
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(PLATFORM_R - 0.4, 64),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, color: 0x8a93ab })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.01;
floor.receiveShadow = true;
scene.add(floor);

// Ring of pillars around the rim — strong parallax + a sense of scale.
const pillarGeo = new THREE.CylinderGeometry(0.9, 1.1, 9, 12);
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x556, roughness: 0.9 });
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2;
  const p = new THREE.Mesh(pillarGeo, pillarMat);
  p.position.set(Math.cos(a) * (PLATFORM_R - 2), 4.5, Math.sin(a) * (PLATFORM_R - 2));
  p.castShadow = true;
  p.receiveShadow = true;
  scene.add(p);
}

// A drifting backdrop of smaller floating rocks, for the sky-castle vibe.
const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a6075, roughness: 1 });
const rocks = [];
for (let i = 0; i < 18; i++) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + Math.random() * 4), rockMat);
  const a = Math.random() * Math.PI * 2;
  const dist = 60 + Math.random() * 70;
  r.position.set(Math.cos(a) * dist, -10 + Math.random() * 40, Math.sin(a) * dist);
  scene.add(r);
  rocks.push({ mesh: r, spin: (Math.random() - 0.5) * 0.3 });
}

// --- Boss statue (echoes the Golem) for scale -------------------------------
const boss = new THREE.Group();
const bossBody = new THREE.Mesh(
  new THREE.CylinderGeometry(3.4, 4.2, 8, 6),
  new THREE.MeshStandardMaterial({ color: 0x8a6a55, roughness: 0.85, flatShading: true })
);
bossBody.position.y = 4;
bossBody.castShadow = true;
boss.add(bossBody);
const bossCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.4, 0),
  new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff5a1a, emissiveIntensity: 1.4 })
);
bossCore.position.y = 4.5;
boss.add(bossCore);
boss.position.set(0, 0, -8);
scene.add(boss);

// --- Hero -------------------------------------------------------------------
const hero = new THREE.Group();
const HERO_R = 0.45;
const HERO_H = 1.05;
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(HERO_R, HERO_H, 6, 14),
  new THREE.MeshStandardMaterial({ color: 0x3aa0ff, roughness: 0.5, metalness: 0.1 })
);
body.position.y = HERO_R + HERO_H / 2;
body.castShadow = true;
hero.add(body);
// A little "blade" so facing direction is obvious.
const blade = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.12, 1.4),
  new THREE.MeshStandardMaterial({ color: 0xdfe9ff, metalness: 0.4, roughness: 0.3 })
);
blade.position.set(0.45, 0.9, 0.4);
hero.add(blade);
hero.position.set(0, 0, 9);
scene.add(hero);

// --- Camera control (third-person follow) -----------------------------------
let yaw = Math.PI; // look toward the boss at the center
let pitch = 0.32;
const SENS = 0.0026;
const camDist = 7.2;

let locked = false;
let dragging = false;
let started = false;

// Enter on a press ANYWHERE. (The hint overlay sits above the canvas, so a
// canvas-only click listener never fired — that was the "stuck on Click to
// enter" bug.) We try to capture the mouse for free-look, but fall back to
// click-drag below if the browser blocks pointer lock.
function enter() {
  started = true;
  hint.classList.add('hidden');
  const p = canvas.requestPointerLock?.();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

document.addEventListener('mousedown', () => {
  enter();
  dragging = true;
});
document.addEventListener('mouseup', () => {
  dragging = false;
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});

// Mouse-capture gives free-look; click-drag is the fallback so the camera
// always turns even when pointer lock is unavailable or released with Esc.
document.addEventListener('mousemove', (e) => {
  if (!started || (!locked && !dragging)) return;
  yaw -= e.movementX * SENS;
  pitch -= e.movementY * SENS;
  pitch = Math.max(-0.2, Math.min(1.1, pitch)); // clamp so we don't flip over
});

// --- Input ------------------------------------------------------------------
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));

// --- Movement / jump state --------------------------------------------------
let vy = 0;
const GRAVITY = -26;
const JUMP_V = 9;
const WALK = 7;
const SPRINT = 12.5;

const clock = new THREE.Clock();

function update(dt) {
  // Camera offset direction from yaw/pitch.
  const cosP = Math.cos(pitch);
  const dir = new THREE.Vector3(cosP * Math.sin(yaw), Math.sin(pitch), cosP * Math.cos(yaw));

  // Horizontal forward/right derived from the camera, so WASD is view-relative.
  const forward = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const move = new THREE.Vector3();
  if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
  if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
  if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);

  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT : WALK;
  if (move.lengthSq() > 0) {
    move.normalize();
    hero.position.x += move.x * speed * dt;
    hero.position.z += move.z * speed * dt;
    // Face travel direction, smoothly.
    const targetYaw = Math.atan2(move.x, move.z);
    hero.rotation.y = lerpAngle(hero.rotation.y, targetYaw, 0.2);
  }

  // Keep the hero on the platform.
  const d = Math.hypot(hero.position.x, hero.position.z);
  if (d > PLATFORM_R - 1.5) {
    const k = (PLATFORM_R - 1.5) / d;
    hero.position.x *= k;
    hero.position.z *= k;
  }

  // Jump + gravity.
  if (keys.has('Space') && hero.position.y <= 0.001) vy = JUMP_V;
  vy += GRAVITY * dt;
  hero.position.y += vy * dt;
  if (hero.position.y < 0) {
    hero.position.y = 0;
    vy = 0;
  }

  // Place the camera behind/above the hero and look at its head.
  const head = new THREE.Vector3(hero.position.x, hero.position.y + 1.4, hero.position.z);
  camera.position.copy(head).addScaledVector(dir, camDist);
  camera.lookAt(head);

  // Idle life: pulse the boss core, drift the background rocks.
  bossCore.rotation.y += dt * 0.6;
  bossCore.material.emissiveIntensity = 1.1 + Math.sin(performance.now() / 350) * 0.4;
  for (const r of rocks) {
    r.mesh.rotation.y += r.spin * dt;
    r.mesh.position.y += Math.sin(performance.now() / 1000 + r.mesh.position.x) * dt * 0.3;
  }
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function makeGridTexture() {
  const s = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#7a839c';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(40,46,64,0.55)';
  g.lineWidth = 2;
  const cells = 8;
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * s;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, s);
    g.moveTo(0, p);
    g.lineTo(s, p);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = 4;
  return tex;
}

// --- Resize + loop ----------------------------------------------------------
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  renderer.render(scene, camera);
});
