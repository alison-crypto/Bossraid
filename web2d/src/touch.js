// Pure helpers for the on-screen touch controls. Kept DOM-free so the joystick
// math is unit-testable; the event wiring + drawing lives in main.js.

// Map a drag (base -> current) to a movement vector. Direction is normalized;
// magnitude ramps 0..1 up to `radius`, and anything inside the deadzone reads as
// no input (so a resting thumb doesn't drift).
export function stickVector(base, cur, radius, deadzone = 0.18) {
  const dx = cur.x - base.x, dy = cur.y - base.y;
  const dist = Math.hypot(dx, dy);
  if (dist < radius * deadzone || dist < 1e-6) return { x: 0, y: 0 };
  const mag = Math.min(1, dist / radius);
  return { x: (dx / dist) * mag, y: (dy / dist) * mag };
}

// Clamp the knob's visual offset from the base to within `radius` (for drawing).
export function knobOffset(base, cur, radius) {
  const dx = cur.x - base.x, dy = cur.y - base.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= radius) return { x: dx, y: dy };
  return { x: (dx / dist) * radius, y: (dy / dist) * radius };
}

export function pointInCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) <= r;
}
