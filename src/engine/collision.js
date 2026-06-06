// Collision primitives used by combat and movement.
//
// Shapes are plain objects:
//   circle: { x, y, r }
//   AABB:   { x, y, w, h }   (x,y = top-left corner)

export function circleHitsCircle(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.r + b.r;
  return dx * dx + dy * dy <= rr * rr;
}

export function aabbHitsAabb(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// Closest point on an AABB to a point, then circle test.
export function circleHitsAabb(c, box) {
  const nx = Math.max(box.x, Math.min(c.x, box.x + box.w));
  const ny = Math.max(box.y, Math.min(c.y, box.y + box.h));
  const dx = c.x - nx;
  const dy = c.y - ny;
  return dx * dx + dy * dy <= c.r * c.r;
}

// Is point `p` ({x,y}) inside a circle?
export function pointInCircle(p, c) {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return dx * dx + dy * dy <= c.r * c.r;
}

// Is point `p` within a circular *arc/sector* centered at `c`?
// `facing` is the center angle of the arc (radians); `halfArc` is half its
// angular width (radians); points beyond `radius` are excluded.
export function pointInArc(p, c, facing, halfArc, radius) {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dSq = dx * dx + dy * dy;
  if (dSq > radius * radius) return false;
  const ang = Math.atan2(dy, dx);
  let delta = ang - facing;
  // Normalize to [-PI, PI].
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= halfArc;
}

// Circle-vs-arc test: true if any part of circle `target` overlaps the sector.
// Approximated by testing the target's center against an arc expanded by the
// target radius (good enough for telegraphed melee swings).
export function circleInArc(target, c, facing, halfArc, radius) {
  return pointInArc(
    target,
    c,
    facing,
    halfArc + Math.atan2(target.r, Math.max(1, radius)),
    radius + target.r
  );
}
