// Bossraid — Floor 1 Boss Hall (3D engine test).
//
// A third/first-person prototype styled after the Aincrad Floor 1 boss room:
// an enclosed stone hall with two rows of columns, a green-and-purple knotwork
// floor runner, glowing stained-glass wall panels, and a throne at the far end
// with the boss (the Stone Golem) lit from above.
//
// Still a feel test — no combat — but now with the pieces requested from the
// last round: an aim crosshair + ground aim arrow, a first/third-person toggle
// (V / mouse wheel), and solid collision against the columns, walls and boss.
//
// Three.js loads from a CDN so this still runs from a plain link.

import * as THREE from 'three';

const canvas = document.getElementById('c');
const hint = document.getElementById('hint');
const reticle = document.getElementById('reticle');

// --- Room dimensions --------------------------------------------------------
const HALF_W = 12; // playable half-width in X
const Z_NEAR = 20; // entrance end (+Z)
const Z_FAR = -14; // front edge of the dais (player stops here)
const WALL_H = 15;
const ROOM_W = 26; // visual wall span
const ROOM_L = 46;

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0b12);
scene.fog = new THREE.Fog(0x0a0b12, 22, 64);

const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 500);

// --- Lighting ---------------------------------------------------------------
// Low ambient so the hall stays moody; the drama comes from the hanging lights.
scene.add(new THREE.HemisphereLight(0x4a5270, 0x101018, 0.5));

const fill = new THREE.DirectionalLight(0x8090b0, 0.25);
fill.position.set(6, 20, 14);
scene.add(fill);

// Hanging fixture over the center of the hall (the bright light in the photo).
function ceilingLamp(z, color, intensity) {
  const lamp = new THREE.SpotLight(color, intensity, 70, Math.PI / 4, 0.5, 1.2);
  lamp.position.set(0, WALL_H - 1, z);
  lamp.target.position.set(0, 0, z);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.near = 1;
  lamp.shadow.camera.far = 40;
  scene.add(lamp, lamp.target);
  // Visible glowing bulb.
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 })
  );
  bulb.position.copy(lamp.position);
  scene.add(bulb);
}
ceilingLamp(2, 0xfff0d0, 7); // main hall light
ceilingLamp(Z_FAR - 3, 0xffe0c0, 6); // throne light

// --- Materials --------------------------------------------------------------
const stone = new THREE.MeshStandardMaterial({ color: 0x2b2d36, roughness: 0.95 });
const darkStone = new THREE.MeshStandardMaterial({ color: 0x1c1e26, roughness: 1 });

// --- Floor (green base + purple knotwork runner) ----------------------------
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM_W, ROOM_L),
  new THREE.MeshStandardMaterial({ map: makeKnotTexture(), roughness: 0.85 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- Walls + ceiling --------------------------------------------------------
function wall(w, h, d, x, y, z, mat = stone) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.castShadow = true;
  scene.add(m);
  return m;
}
wall(1, WALL_H, ROOM_L, -ROOM_W / 2, WALL_H / 2, 0); // left
wall(1, WALL_H, ROOM_L, ROOM_W / 2, WALL_H / 2, 0); // right
wall(ROOM_W, WALL_H, 1, 0, WALL_H / 2, -ROOM_L / 2); // far (behind throne)
wall(ROOM_W, WALL_H, 1, 0, WALL_H / 2, ROOM_L / 2); // near (entrance)
wall(ROOM_W, 1, ROOM_L, 0, WALL_H, 0, darkStone); // ceiling

// --- Stained-glass wall panels (the colorful glow in the photo) -------------
const panelColors = [0xff4d8d, 0x4dd0ff, 0x8aff5a, 0xffc14d, 0xb060ff, 0xff6a4d];
function addPanels(xFace, faceInwardY) {
  for (let i = 0; i < 7; i++) {
    const z = -16 + i * 5.3;
    const c = panelColors[(i + (xFace < 0 ? 0 : 3)) % panelColors.length];
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 6),
      new THREE.MeshStandardMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.7,
        roughness: 0.4,
        side: THREE.DoubleSide,
      })
    );
    panel.position.set(xFace, 7.5, z);
    panel.rotation.y = faceInwardY;
    scene.add(panel);
  }
}
addPanels(-ROOM_W / 2 + 0.55, Math.PI / 2);
addPanels(ROOM_W / 2 - 0.55, -Math.PI / 2);

// --- Columns (two flanking rows) + collision data ---------------------------
const COL_R = 1.0;
const obstacles = []; // { x, z, r } solid cylinders for collision

function addColumn(x, z) {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(COL_R, COL_R, 12, 16), stone);
  shaft.position.set(x, 6, z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  scene.add(shaft);
  // Base + capital blocks.
  for (const y of [0.4, 11.6]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 2.6), darkStone);
    cap.position.set(x, y, z);
    cap.castShadow = true;
    scene.add(cap);
  }
  obstacles.push({ x, z, r: COL_R + 0.4 });
}
for (let i = 0; i < 7; i++) {
  const z = -12 + i * 5.0;
  addColumn(-8.5, z);
  addColumn(8.5, z);
}

// --- Throne / dais at the far end -------------------------------------------
const dais = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 7), stone);
dais.position.set(0, 0.6, -18.5);
dais.receiveShadow = true;
dais.castShadow = true;
scene.add(dais);

const throneBack = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 1.2), darkStone);
throneBack.position.set(0, 4.5, -21);
throneBack.castShadow = true;
scene.add(throneBack);
const throneSeat = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 3), darkStone);
throneSeat.position.set(0, 2, -19.5);
throneSeat.castShadow = true;
scene.add(throneSeat);

// --- Boss (the Stone Golem) on the dais -------------------------------------
const boss = new THREE.Group();
const bossBody = new THREE.Mesh(
  new THREE.CylinderGeometry(2.6, 3.4, 6.5, 6),
  new THREE.MeshStandardMaterial({ color: 0x8a6a55, roughness: 0.85, flatShading: true })
);
bossBody.position.y = 3.25;
bossBody.castShadow = true;
boss.add(bossBody);
const bossCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.1, 0),
  new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff5a1a, emissiveIntensity: 1.4 })
);
bossCore.position.y = 3.6;
boss.add(bossCore);
boss.position.set(0, 1.2, -17);
scene.add(boss);
obstacles.push({ x: 0, z: -17, r: 3.6 }); // can't walk through the golem

// --- Hero -------------------------------------------------------------------
const hero = new THREE.Group();
const HERO_R = 0.45;
const HERO_H = 1.05;
const heroBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(HERO_R, HERO_H, 6, 14),
  new THREE.MeshStandardMaterial({ color: 0x3aa0ff, roughness: 0.5, metalness: 0.1 })
);
heroBody.position.y = HERO_R + HERO_H / 2;
heroBody.castShadow = true;
hero.add(heroBody);
const blade = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.12, 1.4),
  new THREE.MeshStandardMaterial({ color: 0xdfe9ff, metalness: 0.4, roughness: 0.3 })
);
blade.position.set(0.45, 0.9, 0.4);
hero.add(blade);
hero.position.set(0, 0, 16);
hero.rotation.y = Math.PI; // face the throne (-Z)
scene.add(hero);

// --- Aim arrow (ground indicator for attack direction) ----------------------
const aimArrow = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0.12, 0),
  3.6,
  0x66ddff,
  0.8,
  0.5
);
scene.add(aimArrow);

// --- Camera control: first/third person -------------------------------------
let yaw = 0; // 0 → camera behind hero, looking toward the throne (-Z)
let pitch = 0.32;
const SENS = 0.0026;
let camDist = 7.0;
let firstPerson = false;

let locked = false;
let dragging = false;
let started = false;

function enter() {
  started = true;
  hint.classList.add('hidden');
  reticle.style.display = 'block';
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
document.addEventListener('mousemove', (e) => {
  if (!started || (!locked && !dragging)) return;
  yaw -= e.movementX * SENS;
  pitch -= e.movementY * SENS;
  pitch = Math.max(-0.25, Math.min(1.1, pitch));
});
// Wheel zooms; zooming all the way in flips to first person.
addEventListener(
  'wheel',
  (e) => {
    if (!started) return;
    camDist = Math.max(0, Math.min(11, camDist + Math.sign(e.deltaY) * 0.8));
    firstPerson = camDist < 1.2;
    e.preventDefault();
  },
  { passive: false }
);

// --- Keyboard ---------------------------------------------------------------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyV') {
    firstPerson = !firstPerson;
    if (!firstPerson && camDist < 1.2) camDist = 7.0;
  }
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));

// --- Movement / jump --------------------------------------------------------
let vy = 0;
const GRAVITY = -26;
const JUMP_V = 9;
const WALK = 7;
const SPRINT = 12.5;
const clock = new THREE.Clock();

function update(dt) {
  const cosP = Math.cos(pitch);
  const dir = new THREE.Vector3(cosP * Math.sin(yaw), Math.sin(pitch), cosP * Math.cos(yaw));

  // View-relative horizontal axes.
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
    const targetYaw = Math.atan2(move.x, move.z);
    hero.rotation.y = lerpAngle(hero.rotation.y, targetYaw, 0.2);
  }

  // Collision: push out of solid columns / boss, then clamp to the walls.
  for (const o of obstacles) {
    const dx = hero.position.x - o.x;
    const dz = hero.position.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + HERO_R;
    if (d < min && d > 0.0001) {
      const k = min / d;
      hero.position.x = o.x + dx * k;
      hero.position.z = o.z + dz * k;
    }
  }
  hero.position.x = Math.max(-HALF_W, Math.min(HALF_W, hero.position.x));
  hero.position.z = Math.max(Z_FAR, Math.min(Z_NEAR, hero.position.z));

  // Jump + gravity.
  if (keys.has('Space') && hero.position.y <= 0.001) vy = JUMP_V;
  vy += GRAVITY * dt;
  hero.position.y += vy * dt;
  if (hero.position.y < 0) {
    hero.position.y = 0;
    vy = 0;
  }

  // Aim arrow follows the camera-forward heading (where attacks will fire).
  aimArrow.position.set(hero.position.x, 0.12, hero.position.z);
  aimArrow.setDirection(forward);
  aimArrow.visible = !firstPerson;

  // Camera placement.
  heroBody.visible = !firstPerson;
  blade.visible = !firstPerson;
  const eye = new THREE.Vector3(hero.position.x, hero.position.y + 1.45, hero.position.z);
  if (firstPerson) {
    camera.position.copy(eye);
    camera.lookAt(eye.clone().sub(dir));
  } else {
    camera.position.copy(eye).addScaledVector(dir, camDist);
    camera.lookAt(eye);
  }

  // Idle life on the boss.
  bossCore.rotation.y += dt * 0.6;
  bossCore.material.emissiveIntensity = 1.1 + Math.sin(performance.now() / 350) * 0.4;
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// --- Procedural floor texture: green field + purple knotwork runner ---------
function makeKnotTexture() {
  const W = 560;
  const H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');

  // Green field with a darker border.
  g.fillStyle = '#33571f';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#46732f';
  g.fillRect(W * 0.12, H * 0.06, W * 0.76, H * 0.88); // inner runner

  // Interlocking purple circles form a knotwork lattice. Three passes
  // (shadow / body / highlight) fake the over-under weave.
  const cx0 = W * 0.5;
  const top = H * 0.1;
  const bottom = H * 0.9;
  const s = 92; // lattice spacing
  const r = s * 0.62;

  function lattice(strokeStyle, lineWidth) {
    g.strokeStyle = strokeStyle;
    g.lineWidth = lineWidth;
    for (let y = top; y <= bottom; y += s) {
      for (let col = -1; col <= 1; col++) {
        const x = cx0 + col * s;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.stroke();
        // Offset row for the interlace.
        g.beginPath();
        g.arc(x + s / 2, y + s / 2, r, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
  lattice('#241043', 22); // shadow
  lattice('#7a4fc0', 14); // purple body
  lattice('#b187e6', 3); // highlight

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
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
