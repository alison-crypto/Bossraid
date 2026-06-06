// Bossraid — Floor 1 Boss Hall (3D engine test).
//
// A third/first-person prototype styled after the Aincrad Floor 1 boss room:
// an enclosed stone hall with two rows of columns, a green-and-purple knotwork
// floor runner, glowing stained-glass wall panels, and a throne at the far end
// with the boss (the Stone Golem) lit from above.
//
// Aiming is over-the-shoulder, action-MMO style: in third person the camera
// rides a bit above/behind the head and a glowing ground ring shows where a
// skill/attack would land (the center crosshair is used in first person). Low
// blocks are climbable — solid on the sides, but you can jump on top of them.
//
// Still a feel test (no combat). Three.js loads from a CDN so it runs from a
// plain link.

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
scene.add(new THREE.HemisphereLight(0x4a5270, 0x101018, 0.5));

const fill = new THREE.DirectionalLight(0x8090b0, 0.25);
fill.position.set(6, 20, 14);
scene.add(fill);

function ceilingLamp(z, color, intensity) {
  const lamp = new THREE.SpotLight(color, intensity, 70, Math.PI / 4, 0.5, 1.2);
  lamp.position.set(0, WALL_H - 1, z);
  lamp.target.position.set(0, 0, z);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.near = 1;
  lamp.shadow.camera.far = 40;
  scene.add(lamp, lamp.target);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 })
  );
  bulb.position.copy(lamp.position);
  scene.add(bulb);
}
ceilingLamp(2, 0xfff0d0, 7);
ceilingLamp(Z_FAR - 3, 0xffe0c0, 6);

// --- Materials --------------------------------------------------------------
const stone = new THREE.MeshStandardMaterial({ color: 0x2b2d36, roughness: 0.95 });
const darkStone = new THREE.MeshStandardMaterial({ color: 0x1c1e26, roughness: 1 });

// --- Collision data ---------------------------------------------------------
// Two kinds of solids, both height-aware: you're blocked on the sides only when
// your feet are below the solid's top; if you're above it, you stand on it.
const cylinders = []; // { x, z, r, top }
const boxes = []; // { minX, maxX, minZ, maxZ, top }
const STEP = 0.45; // step-up / landing tolerance

function addBoxSolid(cx, cz, sx, sz, top) {
  boxes.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, top });
}

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
}
wall(1, WALL_H, ROOM_L, -ROOM_W / 2, WALL_H / 2, 0);
wall(1, WALL_H, ROOM_L, ROOM_W / 2, WALL_H / 2, 0);
wall(ROOM_W, WALL_H, 1, 0, WALL_H / 2, -ROOM_L / 2);
wall(ROOM_W, WALL_H, 1, 0, WALL_H / 2, ROOM_L / 2);
wall(ROOM_W, 1, ROOM_L, 0, WALL_H, 0, darkStone);

// --- Stained-glass wall panels ----------------------------------------------
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

// --- Columns (tall: block, can't be climbed) --------------------------------
const COL_R = 1.0;
function addColumn(x, z) {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(COL_R, COL_R, 12, 16), stone);
  shaft.position.set(x, 6, z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  scene.add(shaft);
  for (const y of [0.4, 11.6]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 2.6), darkStone);
    cap.position.set(x, y, z);
    cap.castShadow = true;
    scene.add(cap);
  }
  cylinders.push({ x, z, r: COL_R + 0.4, top: 12 });
}
for (let i = 0; i < 7; i++) {
  const z = -12 + i * 5.0;
  addColumn(-8.5, z);
  addColumn(8.5, z);
}

// --- Low cover blocks (climbable: jump on top) ------------------------------
function addCoverBlock(x, z) {
  const h = 1.1;
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.8, h, 2.8), stone);
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  // A lighter cap so the top reads as "standable".
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.12, 2.9),
    new THREE.MeshStandardMaterial({ color: 0x3a3d49, roughness: 0.9 })
  );
  cap.position.set(x, h + 0.06, z);
  scene.add(cap);
  addBoxSolid(x, z, 2.8, 2.8, h);
}
addCoverBlock(-5.5, 7);
addCoverBlock(5.5, 2);
addCoverBlock(-5.5, -3);
addCoverBlock(5.5, -8);

// --- Throne / dais ----------------------------------------------------------
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

// --- Boss (Stone Golem) on the dais -----------------------------------------
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
cylinders.push({ x: 0, z: -17, r: 3.6, top: 8 });

// --- Training dummy (center of the room) ------------------------------------
// A static target to test aim + the placeholder attack against. It never dies:
// its HP regenerates, so you can keep whacking it.
const DUMMY_POS = new THREE.Vector3(0, 0, 2);
const dummy = new THREE.Group();
const dPost = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.24, 2.2, 10),
  new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 })
);
dPost.position.y = 1.1;
dPost.castShadow = true;
dummy.add(dPost);
const dummyMat = new THREE.MeshStandardMaterial({ color: 0xcdb27a, roughness: 0.9 });
const dBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.9, 6, 12), dummyMat);
dBody.position.y = 1.95;
dBody.castShadow = true;
dummy.add(dBody);
const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), dummyMat);
dHead.position.y = 2.85;
dHead.castShadow = true;
dummy.add(dHead);
// Target plate on the chest, facing the entrance.
const plate = new THREE.Mesh(
  new THREE.CircleGeometry(0.5, 28),
  new THREE.MeshStandardMaterial({ map: makeTargetTexture(), transparent: true })
);
plate.position.set(0, 1.95, 0.58);
dummy.add(plate);
dummy.position.copy(DUMMY_POS);
scene.add(dummy);
cylinders.push({ x: DUMMY_POS.x, z: DUMMY_POS.z, r: 0.85, top: 3 });

const dummyState = { max: 600, hp: 600, flash: 0, recoil: 0 };

// Floating HP bar above the dummy (billboarded toward the camera in update).
const DBAR_W = 1.6;
const dummyBar = new THREE.Group();
const dBarBg = new THREE.Mesh(
  new THREE.PlaneGeometry(DBAR_W, 0.2),
  new THREE.MeshBasicMaterial({ color: 0x2a0e0e, depthTest: false })
);
const dBarFill = new THREE.Mesh(
  new THREE.PlaneGeometry(DBAR_W, 0.2),
  new THREE.MeshBasicMaterial({ color: 0x4fd16a, depthTest: false })
);
dBarFill.position.z = 0.001;
dummyBar.add(dBarBg, dBarFill);
dummyBar.position.set(DUMMY_POS.x, 3.5, DUMMY_POS.z);
dummyBar.renderOrder = 5;
scene.add(dummyBar);

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
hero.rotation.y = Math.PI;
scene.add(hero);

// --- Ground aim ring (where a skill/attack would land) ----------------------
const aimRing = new THREE.Group();
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.78, 36),
  new THREE.MeshBasicMaterial({
    color: 0x66ddff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  })
);
ring.rotation.x = -Math.PI / 2;
const ringDot = new THREE.Mesh(
  new THREE.CircleGeometry(0.16, 20),
  new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.6 })
);
ringDot.rotation.x = -Math.PI / 2;
aimRing.add(ring, ringDot);
aimRing.position.y = 0.05;
scene.add(aimRing);

// --- Camera control ---------------------------------------------------------
let yaw = 0;
let pitch = 0.42; // slightly higher default so you see the ground ahead
const SENS = 0.0026;
let camDist = 7.0;
let firstPerson = false;
const SHOULDER = 0.8; // over-the-shoulder lateral offset (3rd person)
const EYE_H = 1.55;

let locked = false;
let dragging = false;
let started = false;

function enter() {
  started = true;
  hint.classList.add('hidden');
  const p = canvas.requestPointerLock?.();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!started) {
    enter();
    dragging = true;
    return;
  }
  dragging = true; // drag-look fallback when pointer lock is unavailable
  mouseFiring = true; // and fire the test attack
});
document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  dragging = false;
  mouseFiring = false;
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!started || (!locked && !dragging)) return;
  yaw -= e.movementX * SENS;
  pitch -= e.movementY * SENS;
  pitch = Math.max(-0.05, Math.min(1.15, pitch));
});
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

// --- Placeholder attack (to test aim against the dummy) ---------------------
// Not the real combat system yet — just a fast bolt fired toward the aim point
// so we can validate aiming + hit feedback. Hold to fire (mouse or F).
let mouseFiring = false;
let attackCd = 0;
let lastAim = { x: DUMMY_POS.x, z: DUMMY_POS.z };
const projectiles = []; // { mesh, vel, life }
const particles = []; // { mesh, vel, life, max }
const floatTexts = []; // { sp, life, max }
const PROJ_SPEED = 40;
const boltGeo = new THREE.SphereGeometry(0.16, 10, 10);
const boltMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });

function doAttack() {
  if (attackCd > 0 || !started) return;
  attackCd = 0.15;
  const from = new THREE.Vector3(hero.position.x, hero.position.y + 1.0, hero.position.z);
  const dir = new THREE.Vector3(lastAim.x - from.x, 0, lastAim.z - from.z);
  if (dir.lengthSq() < 1e-4) return;
  dir.normalize();
  const mesh = new THREE.Mesh(boltGeo, boltMat);
  mesh.position.copy(from);
  scene.add(mesh);
  projectiles.push({ mesh, vel: dir.multiplyScalar(PROJ_SPEED), life: 1.4 });
  spark(from, 4, 0x9fe8ff, 90);
}

function spark(pos, count, color, speed = 140) {
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(boltGeo, mat);
    m.scale.setScalar(0.5);
    m.position.copy(pos);
    const a = Math.random() * Math.PI * 2;
    const up = Math.random() * 0.6 + 0.2;
    m.position.y += 0.2;
    scene.add(m);
    particles.push({
      mesh: m,
      vel: new THREE.Vector3(Math.cos(a) * speed * 0.01 * 6, up * 4, Math.sin(a) * speed * 0.01 * 6),
      life: 0.4,
      max: 0.4,
    });
  }
}

function spawnNumber(pos, val) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.font = "bold 46px 'Trebuchet MS', sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(val, 64, 32);
  g.fillStyle = '#ffe27a';
  g.fillText(val, 64, 32);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false })
  );
  sp.position.copy(pos);
  sp.scale.set(1.5, 0.75, 1);
  scene.add(sp);
  floatTexts.push({ sp, life: 0.8, max: 0.8 });
}

function updateCombat(dt) {
  attackCd = Math.max(0, attackCd - dt);
  if ((mouseFiring || keys.has('KeyF')) && attackCd <= 0) doAttack();

  // Projectiles.
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.life -= dt;
    const px = p.mesh.position.x;
    const pz = p.mesh.position.z;
    const hitDummy = Math.hypot(px - DUMMY_POS.x, pz - DUMMY_POS.z) < 0.85 + 0.16;
    const outOfRoom = Math.abs(px) > HALF_W || pz > Z_NEAR || pz < ROOM_L / -2 + 1;
    if (hitDummy) {
      const dmg = 28 + Math.floor(Math.random() * 12);
      dummyState.hp = Math.max(0, dummyState.hp - dmg);
      dummyState.flash = 0.12;
      dummyState.recoil = 0.18;
      const hp = p.mesh.position.clone();
      spark(hp, 8, 0xffd27a, 160);
      spawnNumber(new THREE.Vector3(DUMMY_POS.x, 2.4, DUMMY_POS.z), dmg);
      if (dummyState.hp <= 0) dummyState.hp = dummyState.max; // refill, never dies
    }
    if (hitDummy || p.life <= 0 || outOfRoom) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }

  // Particles.
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      scene.remove(pt.mesh);
      particles.splice(i, 1);
      continue;
    }
    pt.vel.y -= 20 * dt;
    pt.mesh.position.addScaledVector(pt.vel, dt);
    pt.mesh.scale.setScalar(0.5 * (pt.life / pt.max));
  }

  // Floating damage numbers.
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const ft = floatTexts[i];
    ft.life -= dt;
    if (ft.life <= 0) {
      scene.remove(ft.sp);
      ft.sp.material.map.dispose();
      ft.sp.material.dispose();
      floatTexts.splice(i, 1);
      continue;
    }
    ft.sp.position.y += 1.6 * dt;
    ft.sp.material.opacity = ft.life / ft.max;
  }

  // Dummy: slow HP regen, hit flash, and recoil lean.
  dummyState.hp = Math.min(dummyState.max, dummyState.hp + 22 * dt);
  dummyMat.emissive = dummyMat.emissive || new THREE.Color();
  if (dummyState.flash > 0) {
    dummyState.flash -= dt;
    dummyMat.emissive.setHex(0x886644);
  } else {
    dummyMat.emissive.setHex(0x000000);
  }
  if (dummyState.recoil > 0) dummyState.recoil -= dt;
  dummy.rotation.x = Math.max(0, dummyState.recoil) * 1.2; // tip back when hit

  // Billboard the HP bar toward the camera and scale the fill.
  const frac = dummyState.hp / dummyState.max;
  dBarFill.scale.x = Math.max(0.0001, frac);
  dBarFill.position.x = -(DBAR_W * (1 - frac)) / 2;
  dummyBar.position.set(DUMMY_POS.x, 3.5, DUMMY_POS.z);
  dummyBar.lookAt(camera.position);
}

// --- Movement / collision / jump --------------------------------------------
let vy = 0;
const GRAVITY = -26;
const JUMP_V = 9.5;
const WALK = 7;
const SPRINT = 12.5;
const clock = new THREE.Clock();

const _ray = new THREE.Raycaster();
const _center = new THREE.Vector2(0, 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function resolveCollisions() {
  let hx = hero.position.x;
  let hz = hero.position.z;
  const feet = hero.position.y;

  // Side-blocking (only while feet are below the solid's top).
  for (const c of cylinders) {
    if (feet >= c.top - STEP) continue;
    const dx = hx - c.x;
    const dz = hz - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + HERO_R;
    if (d < min && d > 1e-4) {
      hx = c.x + (dx / d) * min;
      hz = c.z + (dz / d) * min;
    }
  }
  for (const b of boxes) {
    if (feet >= b.top - STEP) continue;
    const cx = clamp(hx, b.minX, b.maxX);
    const cz = clamp(hz, b.minZ, b.maxZ);
    const dx = hx - cx;
    const dz = hz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < HERO_R * HERO_R) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const k = (HERO_R - d) / d;
        hx += dx * k;
        hz += dz * k;
      } else {
        // Center inside the box: eject along the nearest face.
        const l = hx - b.minX;
        const rt = b.maxX - hx;
        const n = hz - b.minZ;
        const f = b.maxZ - hz;
        const m = Math.min(l, rt, n, f);
        if (m === l) hx = b.minX - HERO_R;
        else if (m === rt) hx = b.maxX + HERO_R;
        else if (m === n) hz = b.minZ - HERO_R;
        else hz = b.maxZ + HERO_R;
      }
    }
  }

  // Keep inside the hall.
  hx = clamp(hx, -HALF_W, HALF_W);
  hz = clamp(hz, Z_FAR, Z_NEAR);
  hero.position.x = hx;
  hero.position.z = hz;

  // Support height: the highest solid we're standing over (else floor at 0).
  let groundY = 0;
  for (const c of cylinders) {
    if (Math.hypot(hx - c.x, hz - c.z) <= c.r && feet >= c.top - STEP) {
      groundY = Math.max(groundY, c.top);
    }
  }
  for (const b of boxes) {
    if (hx >= b.minX && hx <= b.maxX && hz >= b.minZ && hz <= b.maxZ && feet >= b.top - STEP) {
      groundY = Math.max(groundY, b.top);
    }
  }
  return groundY;
}

function aimPoint(forward) {
  // Where the camera-center ray meets the floor — that's where attacks land.
  _ray.setFromCamera(_center, camera);
  const o = _ray.ray.origin;
  const d = _ray.ray.direction;
  if (d.y < -1e-4) {
    const t = -o.y / d.y;
    if (t > 0 && t < 200) {
      return {
        x: clamp(o.x + d.x * t, -HALF_W, HALF_W),
        z: clamp(o.z + d.z * t, Z_FAR, Z_NEAR),
      };
    }
  }
  // Looking too flat to hit the floor: project forward from the hero.
  return {
    x: clamp(hero.position.x + forward.x * 12, -HALF_W, HALF_W),
    z: clamp(hero.position.z + forward.z * 12, Z_FAR, Z_NEAR),
  };
}

function update(dt) {
  const cosP = Math.cos(pitch);
  const dir = new THREE.Vector3(cosP * Math.sin(yaw), Math.sin(pitch), cosP * Math.cos(yaw));
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

  const groundY = resolveCollisions();

  // Jump + gravity, landing on whatever we're standing over.
  const onGround = hero.position.y <= groundY + 0.02;
  if (keys.has('Space') && onGround) vy = JUMP_V;
  vy += GRAVITY * dt;
  hero.position.y += vy * dt;
  if (hero.position.y < groundY) {
    hero.position.y = groundY;
    vy = 0;
  }

  // Camera: over-the-shoulder in third person, eyes in first person.
  heroBody.visible = !firstPerson;
  blade.visible = !firstPerson;
  const eye = new THREE.Vector3(hero.position.x, hero.position.y + EYE_H, hero.position.z);
  if (firstPerson) {
    camera.position.copy(eye);
    camera.lookAt(eye.clone().sub(dir));
  } else {
    const anchor = eye.add(right.clone().multiplyScalar(SHOULDER));
    camera.position.copy(anchor).addScaledVector(dir, camDist);
    camera.lookAt(anchor);
  }

  // Aim point (where the camera center meets the floor) drives both the ring
  // and where the test attack fires. Needs the camera matrix refreshed first.
  camera.updateMatrixWorld();
  lastAim = aimPoint(forward);
  if (firstPerson) {
    reticle.style.display = 'block';
    aimRing.visible = false;
  } else {
    reticle.style.display = 'none';
    aimRing.visible = true;
    aimRing.position.set(lastAim.x, 0.05, lastAim.z);
  }

  updateCombat(dt);

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

  g.fillStyle = '#33571f';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#46732f';
  g.fillRect(W * 0.12, H * 0.06, W * 0.76, H * 0.88);

  const cx0 = W * 0.5;
  const top = H * 0.1;
  const bottom = H * 0.9;
  const s = 92;
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
        g.beginPath();
        g.arc(x + s / 2, y + s / 2, r, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
  lattice('#241043', 22);
  lattice('#7a4fc0', 14);
  lattice('#b187e6', 3);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  return tex;
}

// Concentric target rings for the dummy's chest plate.
function makeTargetTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rings = [
    [0.95, '#e8e8e8'],
    [0.72, '#d24b4b'],
    [0.5, '#e8e8e8'],
    [0.28, '#d24b4b'],
    [0.1, '#222'],
  ];
  for (const [r, color] of rings) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(S / 2, S / 2, (S / 2) * r, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(cv);
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
