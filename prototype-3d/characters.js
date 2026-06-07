// Selectable characters. Add a model: drop a rigged .glb in models/ and add an
// entry here — the select screen and the hall pick it up automatically.
// Models should have embedded idle/run (or walk) animations.
// modelYaw: degrees to rotate the model so it faces its movement direction
// (rigs differ: Mixamo characters face one way, the Robot the other).
export const CHARACTERS = [
  { id: 'erika', name: 'Erika Archer', file: 'Erika.glb', modelYaw: 180 },
  { id: 'soldier', name: 'Soldier', file: 'Soldier.glb', modelYaw: 180 },
  { id: 'robot', name: 'Robot', file: 'RobotExpressive.glb', modelYaw: 0 },
];

export const CHARACTER_KEY = 'bossraid.character.modelId';

export function selectedCharacter() {
  let id = null;
  try {
    id = localStorage.getItem(CHARACTER_KEY);
  } catch {
    /* ignore */
  }
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
