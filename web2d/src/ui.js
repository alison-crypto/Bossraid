// Tiny canvas immediate-mode UI: draw buttons/cards/panels and hit-test clicks.
// Coordinates are the game's 960x600 LOGICAL space (the render transform scales
// to device pixels), and pointer input is mapped to logical coords by toCanvas,
// so clicks line up at any display size. Reused by the menu, pause tabs and
// settings.

let hots = []; // clickable regions registered this frame: { x, y, w, h, id }

export function uiBegin() { hots = []; }

// Register a clickable region without drawing anything (e.g. a whole card).
export function uiZone(id, x, y, w, h) { hots.push({ x, y, w, h, id }); }

export function uiHit(px, py) {
  for (let i = hots.length - 1; i >= 0; i--) {
    const b = hots[i];
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id;
  }
  return null;
}

export function roundRect(ctx, x, y, w, h, r = 8) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A clickable button. Registers its hot region (when enabled) under `id`.
export function uiButton(ctx, id, label, x, y, w, h, opts = {}) {
  const { active = false, enabled = true, accent = "#2a3346", font = 20 } = opts;
  ctx.fillStyle = !enabled ? "#171b28" : active ? "#345b86" : accent;
  roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = active ? "rgba(150,200,255,0.9)" : "rgba(180,200,230,0.32)";
  ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, 8); ctx.stroke();
  ctx.fillStyle = enabled ? "#e7eefc" : "#566";
  ctx.font = `bold ${font}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textBaseline = "alphabetic";
  if (enabled) hots.push({ x, y, w, h, id });
}

// A framed panel with an optional title. Not clickable.
export function panel(ctx, x, y, w, h, title) {
  ctx.fillStyle = "rgba(14,18,28,0.94)";
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = "rgba(150,170,210,0.35)";
  ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, 12); ctx.stroke();
  if (title) {
    ctx.fillStyle = "#cfe0ff";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(title, x + 18, y + 30);
  }
}

// Dim the whole logical area (overlay backdrop for menus/pause).
export function dim(ctx, W, H, alpha = 0.6) {
  ctx.fillStyle = `rgba(4,6,11,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

// Centered text helper.
export function label(ctx, text, x, y, { size = 18, color = "#cfd6e4", align = "center", bold = false } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? "bold " : ""}${size}px system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}
