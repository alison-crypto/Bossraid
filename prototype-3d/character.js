// Shared parametric avatar builder for Bossraid.
//
// Builds a stylized low-poly humanoid in code, with GENUINE morph targets on
// the head (face shape, jaw) plus parametric placement of facial features and
// body proportions — so the character creator's sliders reshape a real 3D
// character. The same builder is used by the creator (preview) and (later) by
// the game (the in-world hero), so what you make is what you play.

import * as THREE from 'three';

export const HAIR_STYLES = ['short', 'long', 'spiky', 'ponytail', 'bald'];
export const CLASSES = [
  { id: 'swordsman', name: 'Swordsman', weapon: 'sword' },
  { id: 'mage', name: 'Mage', weapon: 'staff' },
  { id: 'archer', name: 'Archer', weapon: 'bow' },
];

export function defaultSpec() {
  return {
    name: 'Hero',
    class: 'swordsman',
    gender: 'male',
    height: 1.0, // 0.9 - 1.12 overall scale
    build: 0.5, // 0 slim .. 1 broad
    headSize: 1.0, // 0.9 - 1.12
    face: {
      long: 0.0, // -1 round .. 1 long (morph)
      jaw: 0.4, // 0 narrow .. 1 wide (morph)
      eyeSize: 1.0, // 0.7 - 1.4
      eyeSpacing: 0.0, // -1 close .. 1 wide
      browHeight: 0.0, // -1 low .. 1 high
      noseLength: 1.0, // 0.7 - 1.4
    },
    skin: '#d8a87f',
    hair: { style: 'short', color: '#3a2a1a' },
    eyes: '#4a6ad0',
    outfit: '#3aa0ff',
  };
}

// --- Head geometry with morph targets (relative deltas) ---------------------
function makeHeadGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 3);
  g.deleteAttribute('uv');
  const pos = g.attributes.position.array;
  const n = pos.length;
  const longDelta = new Float32Array(n);
  const jawDelta = new Float32Array(n);
  for (let i = 0; i < n; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    // "Long face": stretch vertically, narrow horizontally.
    longDelta[i] = -x * 0.16;
    longDelta[i + 1] = y * 0.34;
    longDelta[i + 2] = z * -0.05;
    // "Wide jaw": widen the lower half (y<0), push chin forward.
    const lower = y < 0 ? -y / 0.5 : 0;
    jawDelta[i] = x * 0.42 * lower;
    jawDelta[i + 1] = -0.04 * lower;
    jawDelta[i + 2] = z > 0 ? z * 0.18 * lower : 0;
  }
  g.morphAttributes.position = [
    new THREE.Float32BufferAttribute(longDelta, 3),
    new THREE.Float32BufferAttribute(jawDelta, 3),
  ];
  g.morphTargetsRelative = true;
  g.computeVertexNormals();
  return g;
}

const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);

// --- Build the avatar -------------------------------------------------------
// Returns { group, apply(spec) }. `apply` updates everything live (no rebuild).
export function buildAvatar(spec = defaultSpec()) {
  const group = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const outfitMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 });
  const hairMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const irisMat = new THREE.MeshStandardMaterial({ roughness: 0.3 });
  const browMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });

  // Body (parametric via scaling).
  const torso = new THREE.Mesh(capsule(0.34, 0.5), outfitMat);
  torso.position.y = 1.5;
  const pelvis = new THREE.Mesh(capsule(0.3, 0.18), outfitMat);
  pelvis.position.y = 1.12;

  const armL = new THREE.Mesh(capsule(0.12, 0.62), outfitMat);
  const armR = armL.clone();
  armL.position.set(-0.46, 1.5, 0);
  armR.position.set(0.46, 1.5, 0);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), skinMat);
  const handR = handL.clone();
  handL.position.set(-0.46, 1.12, 0);
  handR.position.set(0.46, 1.12, 0);

  const legL = new THREE.Mesh(capsule(0.15, 0.7), outfitMat);
  const legR = legL.clone();
  legL.position.set(-0.18, 0.55, 0);
  legR.position.set(0.18, 0.55, 0);

  // Head + neck.
  const neck = new THREE.Mesh(capsule(0.12, 0.12), skinMat);
  neck.position.y = 1.86;
  const headPivot = new THREE.Group();
  headPivot.position.y = 2.12;
  const head = new THREE.Mesh(makeHeadGeometry(), skinMat);
  head.morphTargetInfluences = [0, 0];
  headPivot.add(head);

  // Facial features (parented to the head so they scale/rotate with it).
  const eyeL = new THREE.Group();
  const eyeR = new THREE.Group();
  const mkEye = (eg) => {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), eyeWhiteMat);
    white.scale.z = 0.6;
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), irisMat);
    iris.position.z = 0.07;
    eg.add(white, iris);
  };
  mkEye(eyeL);
  mkEye(eyeR);
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), browMat);
  const browR = browL.clone();
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), skinMat);
  nose.rotation.x = Math.PI / 2;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.02), browMat);
  head.add(eyeL, eyeR, browL, browR, nose, mouth);

  // Hair styles (toggle visibility by spec).
  const hair = {};
  hair.short = new THREE.Mesh(new THREE.SphereGeometry(0.54, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.long = new THREE.Group();
  hair.long.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat));
  const longBack = new THREE.Mesh(capsule(0.28, 0.5), hairMat);
  longBack.position.set(0, -0.35, -0.18);
  hair.long.add(longBack);
  hair.spiky = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), hairMat);
    const a = (i / 9) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.28, 0.42, Math.sin(a) * 0.28);
    s.rotation.x = Math.sin(a) * 0.5;
    s.rotation.z = -Math.cos(a) * 0.5;
    hair.spiky.add(s);
  }
  hair.ponytail = new THREE.Group();
  hair.ponytail.add(new THREE.Mesh(new THREE.SphereGeometry(0.54, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat));
  const tail = new THREE.Mesh(capsule(0.13, 0.6), hairMat);
  tail.position.set(0, -0.3, -0.4);
  tail.rotation.x = -0.5;
  hair.ponytail.add(tail);
  hair.bald = new THREE.Group();
  Object.values(hair).forEach((h) => headPivot.add(h));

  // Weapons by class (held in the right hand).
  const weapons = {};
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd8e8, metalness: 0.6, roughness: 0.3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
  weapons.sword = new THREE.Group();
  const swBlade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), steel);
  swBlade.position.y = 0.55;
  weapons.sword.add(swBlade, new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), steel));
  weapons.staff = new THREE.Group();
  const stShaft = new THREE.Mesh(capsule(0.04, 1.3), wood);
  stShaft.position.y = 0.5;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshStandardMaterial({ color: 0x66ddff, emissive: 0x3399cc, emissiveIntensity: 1 }));
  orb.position.y = 1.15;
  weapons.staff.add(stShaft, orb);
  weapons.bow = new THREE.Group();
  const bowArc = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 16, Math.PI * 1.2), wood);
  weapons.bow.add(bowArc);
  Object.values(weapons).forEach((w) => {
    w.position.copy(handR.position);
    w.position.x += 0.12;
    group.add(w);
  });

  group.add(torso, pelvis, armL, armR, handL, handR, legL, legR, neck, headPivot);

  // --- Live update from a spec ---------------------------------------------
  function apply(s) {
    // Colors.
    skinMat.color.set(s.skin);
    outfitMat.color.set(s.outfit);
    hairMat.color.set(s.hair.color);
    irisMat.color.set(s.eyes);

    // Body proportions.
    const broad = 0.85 + s.build * 0.4; // shoulder/limb width factor
    torso.scale.set(broad, 1, broad * 0.8);
    armL.scale.x = armR.scale.x = armL.scale.z = armR.scale.z = 0.85 + s.build * 0.3;
    armL.position.x = -0.4 - s.build * 0.12;
    armR.position.x = 0.4 + s.build * 0.12;
    handL.position.x = armL.position.x;
    handR.position.x = armR.position.x;
    legL.scale.x = legR.scale.x = legL.scale.z = legR.scale.z = 0.9 + s.build * 0.25;

    // Head size + morphs.
    headPivot.scale.setScalar(s.headSize);
    head.morphTargetInfluences[0] = s.face.long; // long face
    head.morphTargetInfluences[1] = s.face.jaw; // wide jaw

    // Facial features.
    const spacing = 0.14 + s.face.eyeSpacing * 0.05;
    const eyeY = 0.05;
    eyeL.position.set(-spacing, eyeY, 0.42);
    eyeR.position.set(spacing, eyeY, 0.42);
    eyeL.scale.setScalar(s.face.eyeSize);
    eyeR.scale.setScalar(s.face.eyeSize);
    browL.position.set(-spacing, 0.16 + s.face.browHeight * 0.05, 0.46);
    browR.position.set(spacing, 0.16 + s.face.browHeight * 0.05, 0.46);
    nose.position.set(0, -0.02, 0.46 + s.face.noseLength * 0.02);
    nose.scale.z = s.face.noseLength;
    mouth.position.set(0, -0.2, 0.45);

    // Hair + weapon visibility.
    HAIR_STYLES.forEach((st) => {
      if (hair[st]) hair[st].visible = st === s.hair.style;
    });
    const cls = CLASSES.find((c) => c.id === s.class) ?? CLASSES[0];
    Object.entries(weapons).forEach(([id, w]) => (w.visible = id === cls.weapon));

    // Overall height.
    group.scale.setScalar(s.height);
  }

  apply(spec);
  return { group, apply };
}
