// Bossraid — Floor 1 Boss Hall (3D engine test).
//
// A third/first-person prototype styled after the Aincrad Floor 1 boss room:
// an enclosed stone hall with two rows of columns, a green-and-purple knotwork
// floor runner, glowing stained-glass wall panels, and a throne at the far end
// with the boss (the Stone Golem) lit from above.
//
// Aiming is FPS-style: a center crosshair in both first and third person, and
// attacks fire where the crosshair points (in 3D). Left = melee sword swing,
// right = ranged bolt. Collision comes only from real solids (walls, columns,
// dais, throne, boss) — all open floor is walkable, and low blocks/the dais are
// climbable (solid on the sides, stand on top).
//
// Still a feel test. Three.js loads from a CDN so it runs from a plain link.

import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { selectedCharacter } from './characters.js';

const canvas = document.getElementById('c');
const hint = document.getElementById('hint');
const reticle = document.getElementById('reticle');

// --- Arena dimensions (open test map, real-world metres) --------------------
const HALF_W = 45; // open play area half-extent
const Z_MIN = -45;
const Z_MAX = 45;

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb6d8); // open sky
scene.fog = new THREE.Fog(0x9fb6d8, 70, 170);

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);

// --- Lighting (open daylight) -----------------------------------------------
scene.add(new THREE.HemisphereLight(0xbfd4f2, 0x586043, 1.0));
const sun = new THREE.DirectionalLight(0xfff2da, 2.0);
sun.position.set(24, 44, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

// --- Collision data (height-aware solids) -----------------------------------
const cylinders = []; // { x, z, r, top }
const boxes = []; // { minX, maxX, minZ, maxZ, top }
const STEP = 0.45;
function addBoxSolid(cx, cz, sx, sz, top) {
  boxes.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, top });
}

// --- Open ground + reference grid -------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ color: 0x6f7d52, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(160, 80, 0x3a4660, 0x32384a);
grid.position.y = 0.02;
scene.add(grid);

// A ring of tall stone pillars as landmarks (so movement reads + something to
// collide with).
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.9 });
function addPillar(x, z) {
  const h = 9;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, h, 14), pillarMat);
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  cylinders.push({ x, z, r: 1.2, top: h });
}
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  addPillar(Math.cos(a) * 22, Math.sin(a) * 22);
}

// --- Training dummy (sized to match the hero) -------------------------------
const DUMMY_POS = new THREE.Vector3(0, 0, -5);
const DUMMY_R = 0.55;
const dummy = new THREE.Group();
const dummyMat = new THREE.MeshStandardMaterial({ color: 0xcdb27a, roughness: 0.9 });
const dBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.95, 6, 12), dummyMat);
dBody.position.y = 1.05;
dBody.castShadow = true;
dummy.add(dBody);
const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), dummyMat);
dHead.position.y = 1.92;
dHead.castShadow = true;
dummy.add(dHead);
const dStand = new THREE.Mesh(
  new THREE.CylinderGeometry(0.1, 0.14, 0.5, 10),
  new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 })
);
dStand.position.y = 0.25;
dummy.add(dStand);
const plate = new THREE.Mesh(
  new THREE.CircleGeometry(0.42, 28),
  new THREE.MeshStandardMaterial({ map: makeTargetTexture(), transparent: true })
);
plate.position.set(0, 1.2, 0.45);
dummy.add(plate);
dummy.position.copy(DUMMY_POS);
scene.add(dummy);
cylinders.push({ x: DUMMY_POS.x, z: DUMMY_POS.z, r: DUMMY_R, top: 2 });

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
dummyBar.renderOrder = 5;
scene.add(dummyBar);
dummyBar.traverse((o) => (o.userData.noAim = true));

// --- Hero (with a sword on a pivot for the melee swing) ---------------------
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

const bladeMat = new THREE.MeshStandardMaterial({ color: 0xdfe9ff, metalness: 0.5, roughness: 0.3 });
const swordPivot = new THREE.Group();
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.5), bladeMat);
blade.position.set(0, 0.95, 0.78);
blade.castShadow = true;
const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.09), bladeMat);
guard.position.set(0, 0.95, 0.12);
swordPivot.add(blade, guard);
swordPivot.rotation.set(0, 0.5, 0); // rest pose: held to the side
hero.add(swordPivot);

hero.position.set(0, 0, 3);
hero.rotation.y = Math.PI;
scene.add(hero);
hero.traverse((o) => (o.userData.noAim = true)); // don't aim at ourselves

// --- Realistic hero model ---------------------------------------------------
// If the player created a Ready Player Me avatar (saved by the avatar page) we
// load THAT as the hero and animate it with RPM-compatible idle/run clips.
// Otherwise we fall back to the bundled Soldier.glb (with its own animations).
const MODEL_YAW_OFFSET = Math.PI; // flip if the model faces backward
let heroModel = null;
let heroNaturalHeight = 1;
let handBone = null; // right-hand bone the weapon is parented to (if found)
const _ws = new THREE.Vector3();
let mixer = null;
// Animation controller: locomotion (idle/run) + a one-shot attack overlay.
const anim = { idle: null, run: null, attack: null, current: null, attacking: false };

// Re-apply the live-tunable scale + facing to the loaded model.
// Measure a model's true size. For rigged characters the mesh bounding box is
// unreliable (it reflects the bind geometry, not the posed/scaled skeleton), so
// we measure the SKELETON's bones — consistent across any humanoid rig. Falls
// back to the mesh box for non-skinned models.
const _bp = new THREE.Vector3();
function modelBounds(model) {
  model.updateWorldMatrix(true, true);
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let bones = 0;
  model.traverse((o) => {
    if (o.isBone) {
      o.getWorldPosition(_bp);
      min.min(_bp);
      max.max(_bp);
      bones++;
    }
  });
  if (bones < 3 || !Number.isFinite(min.y)) {
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty() || !Number.isFinite(box.min.y)) return null;
    box.min.copy(box.min);
    box.max.copy(box.max);
    return { height: box.max.y - box.min.y, minY: box.min.y, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2 };
  }
  return { height: max.y - min.y, minY: min.y, cx: (min.x + max.x) / 2, cz: (min.z + max.z) / 2 };
}

function rescaleHero() {
  if (!heroModel) return;
  heroModel.scale.setScalar(tune.scale / heroNaturalHeight);
  heroModel.rotation.y = (tune.yaw * Math.PI) / 180;
  const b = modelBounds(heroModel);
  if (b) {
    // Center on the hero and stand feet on the floor (hero.position.y).
    heroModel.position.x -= b.cx - hero.position.x;
    heroModel.position.z -= b.cz - hero.position.z;
    heroModel.position.y -= b.minY - hero.position.y;
  }
}

function setupHeroModel(sceneRoot) {
  heroModel = sceneRoot;
  heroModel.traverse((o) => {
    o.userData.noAim = true;
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  heroModel.scale.setScalar(1);
  hero.add(heroModel);
  const b = modelBounds(heroModel);
  heroNaturalHeight = b && b.height > 0.01 ? b.height : 1.8; // skeleton-based
  rescaleHero();
  heroBody.visible = false; // hide the capsule
  mixer = new THREE.AnimationMixer(heroModel);

  // Standard weapon attach: parent the sword to the right-hand bone so it's
  // held and rides the arm through every animation (works for any humanoid rig
  // with a standard hand-bone name). Falls back to body-attached if not found.
  handBone =
    heroModel.getObjectByName('mixamorigRightHand') ||
    heroModel.getObjectByName('RightHand') ||
    heroModel.getObjectByName('mixamorig:RightHand') ||
    heroModel.getObjectByName('Hand_R') ||
    heroModel.getObjectByName('hand_r') ||
    null;
  if (handBone) handBone.add(swordPivot); // reparent from hero into the hand
}

// Build the action set from a model's embedded clips (idle / run|walk /
// attack — punch|slash|attack|melee). The attack plays once and then hands
// back to locomotion via the mixer 'finished' event.
// A clip is only usable if it actually animates (has tracks + real duration).
// Mixamo character exports often carry a 1-frame pose clip we must ignore.
function usableClips(clips) {
  return (clips || []).filter((c) => c.tracks.length > 0 && c.duration > 0.05);
}

function buildActions(clips, fallback) {
  if (!mixer) return;
  let pool = usableClips(clips);
  if (!pool.length) pool = usableClips(fallback); // borrow shared Mixamo locomotion
  const find = (re) => pool.find((a) => re.test(a.name));
  const idleClip = find(/idle/i) || pool[0];
  const runClip = find(/run|walk|jog/i) || idleClip;
  const attackClip = find(/punch|slash|attack|melee|sword|stab|swing/i);
  anim.idle = idleClip ? mixer.clipAction(idleClip) : null;
  anim.run = runClip ? mixer.clipAction(runClip) : null;
  anim.attack = attackClip ? mixer.clipAction(attackClip) : null;
  if (anim.attack) {
    anim.attack.setLoop(THREE.LoopOnce, 1);
    anim.attack.clampWhenFinished = true;
  }
  if (anim.idle) {
    anim.idle.play();
    anim.current = anim.idle;
  }
  mixer.addEventListener('finished', (e) => {
    if (anim.attack && e.action === anim.attack) {
      anim.attacking = false;
      if (anim.current) {
        anim.current.reset().setEffectiveWeight(1).play();
        anim.current.crossFadeFrom(anim.attack, 0.15, false);
      }
    }
  });
}

// Load the selected character (from the select screen) with its animations.
// Falls back to the Soldier if a model fails to load.
function loadCharacter(file) {
  new GLTFLoader().load(
    `./models/${file}`,
    (gltf) => {
      setupHeroModel(gltf.scene);
      if (usableClips(gltf.animations).length) {
        buildActions(gltf.animations);
      } else {
        // No animation in the model (common for Mixamo character-only exports):
        // borrow Soldier's idle/run (same Mixamo rig retargets by bone name).
        new GLTFLoader().load(
          './models/Soldier.glb',
          (s) => buildActions(gltf.animations, s.animations),
          undefined,
          () => buildActions(gltf.animations)
        );
      }
    },
    undefined,
    () => {
      if (file !== 'Soldier.glb') loadCharacter('Soldier.glb');
    }
  );
}
loadCharacter(selectedCharacter().file);

// Crossfade between idle and run (skipped while an attack overlay is playing).
function setLocomotion(moving) {
  if (!mixer || anim.attacking) return;
  const to = moving ? anim.run : anim.idle;
  if (!to || anim.current === to) return;
  to.reset();
  to.enabled = true;
  to.setEffectiveWeight(1);
  if (anim.current) to.crossFadeFrom(anim.current, 0.2, false);
  to.play();
  anim.current = to;
}

// Trigger the one-shot attack animation (if the model has one).
function playAttackAnim() {
  if (!mixer || !anim.attack || anim.attacking) return;
  anim.attacking = true;
  anim.attack.reset();
  anim.attack.setEffectiveWeight(1);
  anim.attack.play();
  if (anim.current) anim.attack.crossFadeFrom(anim.current, 0.1, false);
}

// --- Tunable parameters (live-editable via the on-screen panel) -------------
// Persisted to localStorage so your adjustments survive a reload.
const TUNE_KEY = 'bossraid.tune.v3'; // v3: open arena, real-scale character + camera
const tune = Object.assign(
  { scale: 1.75, camDist: 5.5, eyeH: 1.6, shoulder: 0.6, fov: 70, yaw: 180,
    wpx: 0, wpy: 0, wpz: 0.05, wrx: 0, wry: 0, wscale: 1.6 },
  (() => {
    try {
      return JSON.parse(localStorage.getItem(TUNE_KEY) || '{}');
    } catch {
      return {};
    }
  })()
);
// Character size + weapon placement are now standardized in code (auto-fit to
// every character via the skeleton + hand bone), so force the standards and
// ignore any older per-character values that may be saved.
Object.assign(tune, { scale: 1.75, wpx: 0, wpy: 0, wpz: 0.05, wrx: 0, wry: 0, wscale: 1.6 });
function saveTune() {
  try {
    localStorage.setItem(TUNE_KEY, JSON.stringify(tune));
  } catch {
    /* ignore */
  }
}

// --- Camera control ---------------------------------------------------------
let yaw = 0;
let pitch = 0.42;
const SENS = 0.0026;
let camDist = tune.camDist;
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

// Input: left = melee, right = ranged. Left also drag-looks when pointer lock
// is unavailable; F / R are keyboard equivalents.
let leftHeld = false;
let rightHeld = false;
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousedown', (e) => {
  // Clicks on the UI panels must not enter the game / re-lock the mouse, so the
  // Tune sliders are usable after pressing Esc.
  if (e.target.closest && e.target.closest('#tune, #hud')) return;
  if (!started) {
    if (e.button === 0) enter();
    return;
  }
  // Mouse not captured (e.g. after pressing Esc): a click re-captures it.
  // (Browsers enforce a ~1s cooldown after Esc, so a second click may be
  // needed; drag-look works in the meantime.)
  if (!locked) {
    if (e.button === 0) {
      const p = canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      dragging = true; // fallback if pointer lock is unavailable
    }
    return;
  }
  // Captured: left = melee, right = ranged.
  if (e.button === 0) leftHeld = true;
  else if (e.button === 2) rightHeld = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    leftHeld = false;
    dragging = false;
  } else if (e.button === 2) {
    rightHeld = false;
  }
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!started || (!locked && !dragging)) return;
  yaw -= e.movementX * SENS;
  pitch += e.movementY * SENS; // mouse up -> look up (non-inverted)
  pitch = Math.max(-0.7, Math.min(1.2, pitch)); // allow aiming well above the head
});
addEventListener(
  'wheel',
  (e) => {
    if (!started) return;
    camDist = Math.max(0, Math.min(18, camDist + Math.sign(e.deltaY) * 0.8));
    firstPerson = camDist < 1.2;
    tune.camDist = camDist;
    saveTune();
    syncTunerInputs();
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

// --- Attacks (placeholder, to test aim/melee against the dummy) -------------
let meleeCd = 0;
let meleeT = 0; // swing animation timer
let rangedCd = 0;
const lastForward = new THREE.Vector3(0, 0, -1);
const projectiles = [];
const particles = [];
const floatTexts = [];
const MELEE_DUR = 0.32;
const MELEE_CD = 0.45;
const MELEE_RANGE = 2.6;
const RANGED_CD = 0.16;
const PROJ_SPEED = 44;
const boltGeo = new THREE.SphereGeometry(0.22, 12, 12);
const boltMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });

function hitDummy(dmg, at) {
  dummyState.hp = Math.max(0, dummyState.hp - dmg);
  dummyState.flash = 0.12;
  dummyState.recoil = 0.18;
  spark(at, 9, 0xffd27a, 170);
  spawnNumber(new THREE.Vector3(DUMMY_POS.x, 2.4, DUMMY_POS.z), dmg);
  if (dummyState.hp <= 0) dummyState.hp = dummyState.max; // never dies, refills
}

function doMelee() {
  if (meleeCd > 0 || !started) return;
  meleeCd = MELEE_CD;
  meleeT = MELEE_DUR;
  playAttackAnim(); // body attack animation (if the model has one)
  // Face where we're aiming so the swing reads correctly.
  hero.rotation.y = Math.atan2(lastForward.x, lastForward.z);
  const dx = DUMMY_POS.x - hero.position.x;
  const dz = DUMMY_POS.z - hero.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < MELEE_RANGE + DUMMY_R) {
    const dot = (dx / dist) * lastForward.x + (dz / dist) * lastForward.z;
    if (dot > 0.2) {
      // within ~78° of aim
      hitDummy(48 + Math.floor(Math.random() * 18), new THREE.Vector3(DUMMY_POS.x, 1.1, DUMMY_POS.z));
    }
  }
}

// Where the crosshair actually points in the world: the nearest real surface
// the camera-center ray hits (dummy, walls, floor...), else a far point.
function computeAimTarget() {
  _ray.setFromCamera(_center, camera);
  const hits = _ray.intersectObjects(scene.children, true);
  for (const h of hits) {
    if (h.object.userData.noAim || h.distance < 0.4) continue;
    return h.point;
  }
  return _ray.ray.origin.clone().addScaledVector(_ray.ray.direction, 40);
}

function doRanged() {
  if (rangedCd > 0 || !started) return;
  rangedCd = RANGED_CD;
  const target = computeAimTarget();
  // Launch from roughly chest height, scaled to the character.
  const from = new THREE.Vector3(
    hero.position.x,
    hero.position.y + tune.scale * 0.65,
    hero.position.z
  );
  const vel = target.sub(from).normalize().multiplyScalar(PROJ_SPEED);
  const mesh = new THREE.Mesh(boltGeo, boltMat);
  mesh.position.copy(from);
  mesh.userData.noAim = true;
  scene.add(mesh);
  projectiles.push({ mesh, vel, life: 1.4 });
  spark(from, 3, 0x9fe8ff, 80);
}

function spark(pos, count, color, speed = 140) {
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(boltGeo, mat);
    m.scale.setScalar(0.5);
    m.position.copy(pos);
    m.position.y += 0.2;
    m.userData.noAim = true;
    const a = Math.random() * Math.PI * 2;
    const up = Math.random() * 0.6 + 0.2;
    scene.add(m);
    particles.push({
      mesh: m,
      vel: new THREE.Vector3(Math.cos(a) * speed * 0.06, up * 4, Math.sin(a) * speed * 0.06),
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
  sp.userData.noAim = true;
  scene.add(sp);
  floatTexts.push({ sp, life: 0.8, max: 0.8 });
}

function updateCombat(dt) {
  meleeCd = Math.max(0, meleeCd - dt);
  rangedCd = Math.max(0, rangedCd - dt);
  if ((leftHeld || keys.has('KeyF')) && meleeCd <= 0) doMelee();
  if ((rightHeld || keys.has('KeyR')) && rangedCd <= 0) doRanged();

  // Sword swing animation.
  if (meleeT > 0) {
    meleeT = Math.max(0, meleeT - dt);
    const p = 1 - meleeT / MELEE_DUR; // 0 -> 1
    swordPivot.rotation.y = 1.1 - p * 2.4; // sweep right to left
    swordPivot.rotation.x = -Math.sin(p * Math.PI) * 0.7; // chop down + back up
  } else {
    swordPivot.rotation.set(tune.wrx, tune.wry, 0); // rest pose (dev-tunable)
  }

  // Projectiles (3D).
  const dpos = new THREE.Vector3(DUMMY_POS.x, 1.1, DUMMY_POS.z);
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.life -= dt;
    const pos = p.mesh.position;
    const hit = pos.distanceTo(dpos) < DUMMY_R + 0.2;
    const out =
      Math.abs(pos.x) > HALF_W ||
      pos.z > Z_MAX ||
      pos.z < Z_MIN ||
      pos.y < 0.05 ||
      pos.y > 30;
    if (hit) hitDummy(26 + Math.floor(Math.random() * 12), pos.clone());
    if (hit || p.life <= 0 || out) {
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

  // Dummy: slow HP regen, hit flash, recoil lean, billboard HP bar.
  dummyState.hp = Math.min(dummyState.max, dummyState.hp + 22 * dt);
  if (dummyState.flash > 0) {
    dummyState.flash -= dt;
    dummyMat.emissive.setHex(0x886644);
  } else {
    dummyMat.emissive.setHex(0x000000);
  }
  if (dummyState.recoil > 0) dummyState.recoil -= dt;
  dummy.rotation.x = Math.max(0, dummyState.recoil) * 1.2;

  const frac = dummyState.hp / dummyState.max;
  dBarFill.scale.x = Math.max(0.0001, frac);
  dBarFill.position.x = -(DBAR_W * (1 - frac)) / 2;
  dummyBar.position.set(DUMMY_POS.x, 2.5, DUMMY_POS.z);
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

  // Walls only — all open floor is walkable.
  hx = clamp(hx, -HALF_W, HALF_W);
  hz = clamp(hz, Z_MIN, Z_MAX);
  hero.position.x = hx;
  hero.position.z = hz;

  // Support height: highest solid we're standing over (else floor at 0).
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

function update(dt) {
  const cosP = Math.cos(pitch);
  const dir = new THREE.Vector3(cosP * Math.sin(yaw), Math.sin(pitch), cosP * Math.cos(yaw));
  const forward = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  lastForward.copy(forward);

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
    if (meleeT <= 0) {
      const targetYaw = Math.atan2(move.x, move.z);
      hero.rotation.y = lerpAngle(hero.rotation.y, targetYaw, 0.2);
    }
  }

  const groundY = resolveCollisions();

  const onGround = hero.position.y <= groundY + 0.02;
  if (keys.has('Space') && onGround) vy = JUMP_V;
  vy += GRAVITY * dt;
  hero.position.y += vy * dt;
  if (hero.position.y < groundY) {
    hero.position.y = groundY;
    vy = 0;
  }

  // Drive the model's idle/run animation from movement.
  if (mixer) {
    setLocomotion(move.lengthSq() > 0 && hero.position.y <= groundY + 0.05);
    mixer.update(dt);
  }
  // Keep the held sword a consistent world size regardless of the hand bone's
  // (animated) scale.
  if (handBone) {
    handBone.getWorldScale(_ws);
    const inv = _ws.x ? 1 / _ws.x : 1;
    swordPivot.scale.setScalar(tune.wscale * 0.5 * inv);
  }

  // Camera: over-the-shoulder in third person, eyes in first person.
  // Hide the body in first person; keep the sword visible (FPS weapon view).
  if (heroModel) {
    heroBody.visible = false;
    heroModel.visible = !firstPerson;
  } else {
    heroBody.visible = !firstPerson;
  }
  const eye = new THREE.Vector3(hero.position.x, hero.position.y + tune.eyeH, hero.position.z);
  if (firstPerson) {
    camera.position.copy(eye);
    camera.lookAt(eye.clone().sub(dir));
  } else {
    const anchor = eye.add(right.clone().multiplyScalar(tune.shoulder));
    camera.position.copy(anchor).addScaledVector(dir, camDist);
    camera.lookAt(anchor);
  }
  camera.updateMatrixWorld();

  updateCombat(dt);
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

// --- Live tuning panel ------------------------------------------------------
// Lets you dial in character scale + camera live and read the values back, so
// adjustments are exact (no guessing). Values persist in localStorage.
// Camera-only now — character size + weapon are auto-fit per character.
const tunerInputs = {
  camDist: document.getElementById('t-cam'),
  eyeH: document.getElementById('t-eye'),
  shoulder: document.getElementById('t-shoulder'),
  fov: document.getElementById('t-fov'),
  yaw: document.getElementById('t-yaw'),
};
const tunerReadout = document.getElementById('t-readout');

function applyTune() {
  camDist = tune.camDist;
  camera.fov = tune.fov;
  camera.updateProjectionMatrix();
  rescaleHero();
  // Sword: positioned via the weapon dev-sliders. When held in the hand bone
  // its scale is set per-frame (to counter the bone's scale); otherwise scale
  // it with the character here.
  swordPivot.position.set(tune.wpx, tune.wpy, tune.wpz);
  if (!handBone) swordPivot.scale.setScalar(tune.scale * tune.wscale);
}
function updateReadout() {
  if (!tunerReadout) return;
  tunerReadout.textContent =
    `cam ${(+tune.camDist).toFixed(1)} · eye ${(+tune.eyeH).toFixed(2)} · ` +
    `shoulder ${(+tune.shoulder).toFixed(2)} · fov ${Math.round(tune.fov)} · ` +
    `yaw ${Math.round(tune.yaw)}`;
}
function syncTunerInputs() {
  for (const k in tunerInputs) {
    if (tunerInputs[k]) tunerInputs[k].value = tune[k];
  }
  updateReadout();
}
function setupTuner() {
  for (const k in tunerInputs) {
    const el = tunerInputs[k];
    if (!el) continue;
    el.addEventListener('input', () => {
      tune[k] = parseFloat(el.value);
      applyTune();
      saveTune();
      updateReadout();
    });
  }
  const copy = document.getElementById('t-copy');
  if (copy)
    copy.addEventListener('click', () => {
      const text = tunerReadout ? tunerReadout.textContent : '';
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
      copy.textContent = 'Copied!';
      setTimeout(() => (copy.textContent = 'Copy values'), 1200);
    });
  const reset = document.getElementById('t-reset');
  if (reset)
    reset.addEventListener('click', () => {
      Object.assign(tune, { scale: 1.75, camDist: 5.5, eyeH: 1.6, shoulder: 0.6, fov: 70, yaw: 180 });
      applyTune();
      saveTune();
      syncTunerInputs();
    });
  const toggle = document.getElementById('t-toggle');
  const panel = document.getElementById('tune');
  if (toggle && panel)
    toggle.addEventListener('click', () => panel.classList.toggle('collapsed'));
  syncTunerInputs();
  applyTune();
}
setupTuner();

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  renderer.render(scene, camera);
});
