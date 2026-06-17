// Sprite-strip loading + drawing (view layer; uses Image/canvas). A "strip" is a
// single PNG containing `frames` equal cells in one horizontal row, on a
// transparent background. Missing files degrade gracefully (ok stays false), so
// the game still runs before any art is dropped in.

export function loadStrip(src, frames, fps, loop = true) {
  const strip = { src, frames, fps, loop, ok: false, img: new Image() };
  strip.img.onload = () => { strip.ok = strip.img.naturalWidth > 0; };
  strip.img.onerror = () => { strip.ok = false; };
  strip.img.src = src;
  return strip;
}

// Draw frame `index` of `strip` anchored at (cx, footY) — i.e. horizontally
// centered with the sprite's bottom on footY (feet baseline). `targetH` sets the
// on-screen height; width scales to keep aspect. Returns false if not loaded.
export function drawStrip(ctx, strip, index, cx, footY, targetH, flip = false) {
  if (!strip || !strip.ok) return false;
  const fw = strip.img.width / strip.frames;
  const fh = strip.img.height;
  if (fw <= 0 || fh <= 0) return false;
  const scale = targetH / fh;
  const dw = fw * scale, dh = fh * scale;
  const sx = Math.floor(index) * fw;
  ctx.save();
  ctx.translate(cx, footY);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(strip.img, sx, 0, fw, fh, -dw / 2, -dh, dw, dh);
  ctx.restore();
  return true;
}
