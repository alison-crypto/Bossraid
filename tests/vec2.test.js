import { describe, it, expect } from 'vitest';
import {
  add,
  sub,
  scale,
  dot,
  len,
  lenSq,
  dist,
  normalize,
  clampLen,
  fromAngle,
  angle,
  lerp,
  clamp,
} from '../src/engine/vec2.js';

describe('vec2', () => {
  it('adds and subtracts componentwise', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: -1 })).toEqual({ x: 4, y: 1 });
    expect(sub({ x: 5, y: 5 }, { x: 2, y: 1 })).toEqual({ x: 3, y: 4 });
  });

  it('scales and dots', () => {
    expect(scale({ x: 2, y: -3 }, 2)).toEqual({ x: 4, y: -6 });
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
    expect(dot({ x: 2, y: 3 }, { x: 4, y: 5 })).toBe(23);
  });

  it('computes lengths and distance', () => {
    expect(len({ x: 3, y: 4 })).toBe(5);
    expect(lenSq({ x: 3, y: 4 })).toBe(25);
    expect(dist({ x: 0, y: 0 }, { x: 0, y: 7 })).toBe(7);
  });

  it('normalizes to unit length and leaves zero untouched', () => {
    const n = normalize({ x: 0, y: 10 });
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(1);
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('clampLen caps magnitude but preserves shorter vectors', () => {
    expect(len(clampLen({ x: 10, y: 0 }, 4))).toBeCloseTo(4);
    expect(clampLen({ x: 1, y: 0 }, 4)).toEqual({ x: 1, y: 0 });
  });

  it('round-trips angle <-> fromAngle', () => {
    const v = fromAngle(Math.PI / 2, 3);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(3);
    expect(angle({ x: 1, y: 1 })).toBeCloseTo(Math.PI / 4);
  });

  it('lerps and clamps scalars', () => {
    expect(lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-2, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
