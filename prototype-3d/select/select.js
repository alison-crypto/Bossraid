// Character-select: a rotating 3D preview + a list of characters. Saves the
// pick so the hall loads it as the hero.

import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTERS, CHARACTER_KEY, selectedCharacter } from '../characters.js';

let currentId = selectedCharacter().id;

// --- Scene / studio lighting ------------------------------------------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10131e);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x202028, 0.7));
const key = new THREE.DirectionalLight(0xfff2dc, 1.5);
key.position.set(4, 8, 6);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x6aa0ff, 0.7);
rim.position.set(-5, 4, -6);
scene.add(rim);

const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(1.3, 1.4, 0.2, 40),
  new THREE.MeshStandardMaterial({ color: 0x2a3046, roughness: 0.8 })
);
disc.position.y = -0.1;
disc.receiveShadow = true;
scene.add(disc);

// --- Preview model ----------------------------------------------------------
const turntable = new THREE.Group();
scene.add(turntable);
const loader = new GLTFLoader();
let mixer = null;
let current = null;

function loadPreview(file) {
  if (current) {
    turntable.remove(current);
    current = null;
  }
  mixer = null;
  loader.load(`../models/${file}`, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    turntable.add(model);
    // Normalize to ~1.8 tall and stand centered on the disc. Update matrices
    // first so models with nested transforms (Sketchfab/FBX exports) measure right.
    model.updateWorldMatrix(true, true);
    let box = new THREE.Box3().setFromObject(model);
    model.scale.multiplyScalar(1.8 / (box.max.y - box.min.y || 1));
    model.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(model);
    const c = new THREE.Vector3();
    box.getCenter(c);
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    current = model;
    const idle = gltf.animations.find((a) => /idle/i.test(a.name)) || gltf.animations[0];
    if (idle) {
      mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(idle).play();
    }
  });
}

// --- Character list UI ------------------------------------------------------
const clist = document.getElementById('clist');
function renderList() {
  clist.innerHTML = '';
  for (const c of CHARACTERS) {
    const card = document.createElement('div');
    card.className = 'card' + (c.id === currentId ? ' active' : '');
    card.innerHTML = `<div class="name">${c.name}</div><div class="meta">${c.file}</div>`;
    card.addEventListener('click', () => {
      currentId = c.id;
      renderList();
      loadPreview(c.file);
    });
    clist.appendChild(card);
  }
}
renderList();
loadPreview(selectedCharacter().file);

document.getElementById('enter').addEventListener('click', () => {
  try {
    localStorage.setItem(CHARACTER_KEY, currentId);
  } catch {
    /* ignore */
  }
  window.location.href = '../index.html';
});

// --- Orbit (drag) + idle spin ----------------------------------------------
let camYaw = 0.4;
let camPitch = 0.05;
let dragging = false;
let lastUser = 0;
canvas.addEventListener('mousedown', () => {
  dragging = true;
  lastUser = performance.now();
});
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camYaw -= e.movementX * 0.01;
  camPitch = Math.max(-0.4, Math.min(0.8, camPitch - e.movementY * 0.008));
  lastUser = performance.now();
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  if (!dragging && performance.now() - lastUser > 2500) turntable.rotation.y += dt * 0.5;
  const focus = new THREE.Vector3(0, 1.4, 0);
  const cp = Math.cos(camPitch);
  camera.position.set(
    Math.sin(camYaw) * cp * 5,
    focus.y + Math.sin(camPitch) * 5,
    Math.cos(camYaw) * cp * 5
  );
  camera.lookAt(focus);
  renderer.render(scene, camera);
});
