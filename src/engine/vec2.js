// Minimal 2D vector helpers. Vectors are plain `{ x, y }` objects so they are
// cheap to create and trivial to serialize. Functions are pure unless noted.

export const vec = (x = 0, y = 0) => ({ x, y });

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });

export const dot = (a, b) => a.x * b.x + a.y * b.y;

export const lenSq = (a) => a.x * a.x + a.y * a.y;
export const len = (a) => Math.hypot(a.x, a.y);

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const distSq = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

// Returns a unit-length copy of `a`. The zero vector is returned unchanged.
export const normalize = (a) => {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

// Clamp the magnitude of `a` to at most `max`.
export const clampLen = (a, max) => {
  const l = len(a);
  return l > max && l > 0 ? scale(a, max / l) : { x: a.x, y: a.y };
};

export const fromAngle = (rad, length = 1) => ({
  x: Math.cos(rad) * length,
  y: Math.sin(rad) * length,
});

export const angle = (a) => Math.atan2(a.y, a.x);

// Linear interpolation between two vectors. `t` is typically in [0, 1].
export const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
