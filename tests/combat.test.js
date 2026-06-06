import { describe, it, expect } from 'vitest';
import {
  dealDamage,
  resolveMeleeHit,
  bodiesOverlap,
  tickCombatTimers,
} from '../src/systems/combat.js';

const makeEntity = (over = {}) => ({
  x: 0,
  y: 0,
  r: 14,
  hp: 100,
  maxHp: 100,
  invuln: 0,
  ...over,
});

describe('combat', () => {
  it('reduces hp by the damage amount', () => {
    const e = makeEntity();
    const dealt = dealDamage(e, 30, null);
    expect(dealt).toBe(30);
    expect(e.hp).toBe(70);
  });

  it('clamps hp at 0 and marks dead', () => {
    const e = makeEntity({ hp: 10 });
    dealDamage(e, 999, null);
    expect(e.hp).toBe(0);
    expect(e.dead).toBe(true);
  });

  it('blocks damage while invulnerable', () => {
    const e = makeEntity({ invuln: 0.5 });
    expect(dealDamage(e, 30, null)).toBe(0);
    expect(e.hp).toBe(100);
  });

  it('does not damage an already-dead entity', () => {
    const e = makeEntity({ hp: 0, dead: true });
    expect(dealDamage(e, 30, null)).toBe(0);
  });

  it('applies mercy i-frames when requested', () => {
    const e = makeEntity();
    dealDamage(e, 5, null, { mercyIframes: 0.6 });
    expect(e.invuln).toBeCloseTo(0.6);
    // A second immediate hit is blocked by the mercy window.
    expect(dealDamage(e, 5, null)).toBe(0);
  });

  it('resolves a melee swing that lands in the arc', () => {
    const target = makeEntity({ x: 40, y: 0, r: 10 });
    const swing = {
      x: 0,
      y: 0,
      facing: 0,
      halfArc: Math.PI / 4,
      radius: 60,
      damage: 25,
    };
    expect(resolveMeleeHit(swing, target, null)).toBe(25);
    expect(target.hp).toBe(75);
  });

  it('misses a melee swing outside the arc', () => {
    const target = makeEntity({ x: -40, y: 0, r: 10 });
    const swing = { x: 0, y: 0, facing: 0, halfArc: Math.PI / 4, radius: 60, damage: 25 };
    expect(resolveMeleeHit(swing, target, null)).toBe(0);
    expect(target.hp).toBe(100);
  });

  it('detects body overlap', () => {
    expect(bodiesOverlap({ x: 0, y: 0, r: 10 }, { x: 15, y: 0, r: 10 })).toBe(true);
    expect(bodiesOverlap({ x: 0, y: 0, r: 10 }, { x: 30, y: 0, r: 10 })).toBe(false);
  });

  it('ticks down i-frame and hit-flash timers without going negative', () => {
    const e = makeEntity({ invuln: 0.1, hitFlash: 0.1 });
    tickCombatTimers(e, 0.25);
    expect(e.invuln).toBe(0);
    expect(e.hitFlash).toBe(0);
  });
});
