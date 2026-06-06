// Character creator: a UI panel of sliders/pickers driving a live 3D preview of
// the parametric avatar. Saves the spec to localStorage so the hall/game can
// build the same character.

import * as THREE from 'three';
import { buildAvatar, defaultSpec, HAIR_STYLES, CLASSES } from '../character.js';

const SAVE_KEY = 'bossraid.character.v1';

// --- Load existing or default spec ------------------------------------------
function loadSpec() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && s.face) return { ...defaultSpec(), ...s, face: { ...defaultSpec().face, ...s.face } };
  } catch {
    /* ignore */
  }
  return defaultSpec();
}
const spec = loadSpec();

// --- 3D preview -------------------------------------------------------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10131e);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

// Studio lighting: key + fill + rim.
scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x202028, 0.6));
const key = new THREE.DirectionalLight(0xfff2dc, 1.6);
key.position.set(4, 8, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 30;
scene.add(key);
const rim = new THREE.DirectionalLight(0x6aa0ff, 0.8);
rim.position.set(-5, 4, -6);
scene.add(rim);

// Pedestal.
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(1.4, 1.5, 0.2, 40),
  new THREE.MeshStandardMaterial({ color: 0x2a3046, roughness: 0.8 })
);
disc.position.y = -0.1;
disc.receiveShadow = true;
scene.add(disc);

const avatar = buildAvatar(spec);
avatar.group.traverse((o) => {
  if (o.isMesh) o.castShadow = true;
});

// Turntable group so the model spins around its own vertical axis.
const turntable = new THREE.Group();
scene.add(turntable);
turntable.add(avatar.group);

// --- Camera orbit (drag to rotate, wheel to zoom, idle auto-spin) -----------
let camYaw = 0.5;
let camPitch = 0.05;
let camDist = 6;
let dragging = false;
let autoSpin = true;
let lastUser = 0;

canvas.addEventListener('mousedown', () => {
  dragging = true;
  autoSpin = false;
  lastUser = performance.now();
});
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camYaw -= e.movementX * 0.01;
  camPitch = Math.max(-0.5, Math.min(0.9, camPitch - e.movementY * 0.008));
  lastUser = performance.now();
});
canvas.addEventListener(
  'wheel',
  (e) => {
    camDist = Math.max(3, Math.min(11, camDist + Math.sign(e.deltaY) * 0.5));
    e.preventDefault();
  },
  { passive: false }
);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (!dragging && performance.now() - lastUser > 2500) autoSpin = true;
  if (autoSpin) turntable.rotation.y += dt * 0.5;
  const focus = new THREE.Vector3(0, 1.45, 0);
  const cp = Math.cos(camPitch);
  camera.position.set(
    focus.x + Math.sin(camYaw) * cp * camDist,
    focus.y + Math.sin(camPitch) * camDist,
    focus.z + Math.cos(camYaw) * cp * camDist
  );
  camera.lookAt(focus);
  renderer.render(scene, camera);
});

// --- Build the control panel from a declarative schema ----------------------
const controls = document.getElementById('controls');

function group(title) {
  const g = document.createElement('div');
  g.className = 'group';
  g.innerHTML = `<h2>${title}</h2>`;
  controls.appendChild(g);
  return g;
}
function row(parent, labelText) {
  const r = document.createElement('div');
  r.className = 'row';
  const l = document.createElement('label');
  l.textContent = labelText;
  r.appendChild(l);
  parent.appendChild(r);
  return r;
}
// `get`/`set` read & write the (possibly nested) spec value.
function slider(parent, label, get, set, min, max, step = 0.01) {
  const r = row(parent, label);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = get();
  input.addEventListener('input', () => {
    set(parseFloat(input.value));
    avatar.apply(spec);
  });
  r.appendChild(input);
  return input;
}
function color(parent, label, get, set) {
  const r = row(parent, label);
  const input = document.createElement('input');
  input.type = 'color';
  input.value = get();
  input.addEventListener('input', () => {
    set(input.value);
    avatar.apply(spec);
  });
  r.appendChild(input);
  return input;
}
function select(parent, label, options, get, set) {
  const r = row(parent, label);
  const sel = document.createElement('select');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
  sel.value = get();
  sel.addEventListener('change', () => {
    set(sel.value);
    avatar.apply(spec);
  });
  r.appendChild(sel);
  return sel;
}
function textInput(parent, label, get, set) {
  const r = row(parent, label);
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 16;
  input.value = get();
  input.addEventListener('input', () => set(input.value));
  r.appendChild(input);
  return input;
}

// Keep references so Randomize can refresh the widgets.
const widgets = [];
function track(w, get) {
  widgets.push({ w, get });
  return w;
}

const gIdentity = group('Identity');
track(
  textInput(gIdentity, 'Name', () => spec.name, (v) => (spec.name = v)),
  () => spec.name
);
track(
  select(
    gIdentity,
    'Class',
    CLASSES.map((c) => ({ value: c.id, label: c.name })),
    () => spec.class,
    (v) => (spec.class = v)
  ),
  () => spec.class
);
track(
  select(
    gIdentity,
    'Gender',
    [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
    () => spec.gender,
    (v) => (spec.gender = v)
  ),
  () => spec.gender
);

const gBody = group('Body');
track(slider(gBody, 'Height', () => spec.height, (v) => (spec.height = v), 0.9, 1.12), () => spec.height);
track(slider(gBody, 'Build', () => spec.build, (v) => (spec.build = v), 0, 1), () => spec.build);
track(slider(gBody, 'Head size', () => spec.headSize, (v) => (spec.headSize = v), 0.9, 1.12), () => spec.headSize);

const gFace = group('Face');
const F = spec.face;
track(slider(gFace, 'Face shape', () => F.long, (v) => (F.long = v), -1, 1), () => F.long);
track(slider(gFace, 'Jaw width', () => F.jaw, (v) => (F.jaw = v), 0, 1), () => F.jaw);
track(slider(gFace, 'Eye size', () => F.eyeSize, (v) => (F.eyeSize = v), 0.7, 1.4), () => F.eyeSize);
track(slider(gFace, 'Eye spacing', () => F.eyeSpacing, (v) => (F.eyeSpacing = v), -1, 1), () => F.eyeSpacing);
track(slider(gFace, 'Brow height', () => F.browHeight, (v) => (F.browHeight = v), -1, 1), () => F.browHeight);
track(slider(gFace, 'Nose length', () => F.noseLength, (v) => (F.noseLength = v), 0.7, 1.4), () => F.noseLength);

const gLook = group('Colors & hair');
track(
  select(
    gLook,
    'Hair style',
    HAIR_STYLES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })),
    () => spec.hair.style,
    (v) => (spec.hair.style = v)
  ),
  () => spec.hair.style
);
track(color(gLook, 'Hair color', () => spec.hair.color, (v) => (spec.hair.color = v)), () => spec.hair.color);
track(color(gLook, 'Skin', () => spec.skin, (v) => (spec.skin = v)), () => spec.skin);
track(color(gLook, 'Eyes', () => spec.eyes, (v) => (spec.eyes = v)), () => spec.eyes);
track(color(gLook, 'Outfit', () => spec.outfit, (v) => (spec.outfit = v)), () => spec.outfit);

// --- Randomize + Save -------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randHex = () =>
  '#' +
  Math.floor(rand(0.2, 1) * 0xffffff)
    .toString(16)
    .padStart(6, '0');

document.getElementById('randomize').addEventListener('click', () => {
  spec.class = pick(CLASSES).id;
  spec.gender = pick(['male', 'female']);
  spec.height = rand(0.9, 1.12);
  spec.build = Math.random();
  spec.headSize = rand(0.92, 1.1);
  spec.face = {
    long: rand(-1, 1),
    jaw: Math.random(),
    eyeSize: rand(0.8, 1.3),
    eyeSpacing: rand(-1, 1),
    browHeight: rand(-1, 1),
    noseLength: rand(0.8, 1.3),
  };
  spec.hair = { style: pick(HAIR_STYLES), color: randHex() };
  spec.skin = pick(['#f1c9a5', '#d8a87f', '#a9745a', '#7a4f38', '#caa07a']);
  spec.eyes = pick(['#4a6ad0', '#3a8a5a', '#7a4a2a', '#555', '#7a3aa0']);
  spec.outfit = randHex();
  avatar.apply(spec);
  refreshWidgets();
});

function refreshWidgets() {
  for (const { w, get } of widgets) w.value = get();
}

document.getElementById('enter').addEventListener('click', () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(spec));
  } catch {
    /* storage may be unavailable under file:// */
  }
  window.location.href = '../index.html';
});
