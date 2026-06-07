// Selectable characters. Add a model: drop a rigged .glb in models/ and add an
// entry here — the select screen and the hall pick it up automatically.
// Models should have embedded idle/run (or walk) animations.
export const CHARACTERS = [
  { id: 'erika', name: 'Erika Archer', file: 'Erika.glb' },
  { id: 'soldier', name: 'Soldier', file: 'Soldier.glb' },
  { id: 'robot', name: 'Robot', file: 'RobotExpressive.glb' },
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
