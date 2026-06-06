// Registry of selectable bosses. Adding a new boss is just one entry here plus
// its factory module — the menu and fight scene are data-driven from this list.

import { createGolem } from './golem.js';
import { createWraith } from './wraith.js';

export const BOSSES = [
  {
    id: 'golem',
    name: 'Stone Golem',
    blurb: 'A grounded bruiser. Slams, sweeps, and rock volleys. A fair first fight.',
    color: '#8a6a55',
    difficulty: 'Normal',
    create: createGolem,
  },
  {
    id: 'wraith',
    name: 'Hollow Wraith',
    blurb: 'An evasive caster that blinks and floods the arena with bullets.',
    color: '#6a4fa0',
    difficulty: 'Hard',
    create: createWraith,
  },
];

export function getBoss(id) {
  return BOSSES.find((b) => b.id === id) ?? BOSSES[0];
}
