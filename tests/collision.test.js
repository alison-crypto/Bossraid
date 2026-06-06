import { describe, it, expect } from 'vitest';
import {
  circleHitsCircle,
  aabbHitsAabb,
  circleHitsAabb,
  pointInCircle,
  pointInArc,
  circleInArc,
} from '../src/engine/collision.js';

describe('collision', () => {
  it('detects circle/circle overlap', () => {
    expect(circleHitsCircle({ x: 0, y: 0, r: 5 }, { x: 8, y: 0, r: 5 })).toBe(true);
    expect(circleHitsCircle({ x: 0, y: 0, r: 5 }, { x: 11, y: 0, r: 5 })).toBe(false);
  });

  it('detects AABB overlap', () => {
    expect(
      aabbHitsAabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })
    ).toBe(true);
    expect(
      aabbHitsAabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })
    ).toBe(false);
  });

  it('detects circle/AABB overlap including corner cases', () => {
    expect(circleHitsAabb({ x: 15, y: 5, r: 6 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(
      true
    );
    expect(circleHitsAabb({ x: 30, y: 30, r: 4 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(
      false
    );
  });

  it('tests point in circle', () => {
    expect(pointInCircle({ x: 1, y: 1 }, { x: 0, y: 0, r: 2 })).toBe(true);
    expect(pointInCircle({ x: 3, y: 0 }, { x: 0, y: 0, r: 2 })).toBe(false);
  });

  it('tests point in an arc/sector', () => {
    const c = { x: 0, y: 0 };
    // Arc facing +x (angle 0), half-width 45deg, radius 10.
    expect(pointInArc({ x: 5, y: 0 }, c, 0, Math.PI / 4, 10)).toBe(true);
    // Behind the arc.
    expect(pointInArc({ x: -5, y: 0 }, c, 0, Math.PI / 4, 10)).toBe(false);
    // In direction but out of range.
    expect(pointInArc({ x: 20, y: 0 }, c, 0, Math.PI / 4, 10)).toBe(false);
    // Just outside the angular width.
    expect(pointInArc({ x: 1, y: 5 }, c, 0, Math.PI / 4, 10)).toBe(false);
  });

  it('handles arc wrap-around at the +/-PI seam', () => {
    const c = { x: 0, y: 0 };
    // Arc facing +PI (toward -x). A point straight left should be inside.
    expect(pointInArc({ x: -5, y: 0 }, c, Math.PI, Math.PI / 6, 10)).toBe(true);
  });

  it('circleInArc accounts for target radius at the edge', () => {
    const c = { x: 0, y: 0 };
    // Center slightly outside the angular edge, but a fat target still clips it.
    const target = { x: 6, y: 4, r: 4 };
    expect(circleInArc(target, c, 0, Math.PI / 6, 12)).toBe(true);
  });
});
