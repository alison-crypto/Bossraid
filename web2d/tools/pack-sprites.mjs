// Sprite-strip packer: turns the raw ChatGPT golem strips (in ../art-src/) into
// clean, game-ready strips in ../assets/ that the engine's drawStrip() can slice
// evenly. Each source is an even grid of frames (1 or 2 rows); we split the grid,
// trim every frame to its alpha bounding box, then rescale all frames by ONE
// shared scale and repack them left->right into uniform CELL x CELL cells —
// horizontally centered with feet on a shared baseline, so the boss doesn't
// wobble or grow between frames. Re-runnable; pure JS (pngjs), no native deps.
//
//   node tools/pack-sprites.mjs            # pack everything
//
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, "..", "art-src");
const OUT_DIR = join(HERE, "..", "assets");

const CELL = 512;            // output cell size (px)
const ALPHA_MIN = 24;        // alpha <= this counts as empty when trimming
const FIT_W = CELL * 0.98;   // widest frame may use almost the full cell width
const FIT_H = CELL * 0.86;   // tallest frame fits this (leaves head/foot padding)
const FOOT_MARGIN = Math.round(CELL * 0.06); // gap below feet baseline

// prefix -> its clips. cols = frames / rows; frame order is row-major (top row
// left->right, then next row), matching how the sheets read. Each clip reads
// art-src/<prefix>_<name>.src.png and writes assets/<prefix>_<name>.png.
const CHARACTERS = [
  {
    prefix: "golem",
    jobs: [
      { name: "idle",    frames: 6, rows: 1 },
      { name: "walk",    frames: 8, rows: 1 },
      { name: "smash",   frames: 8, rows: 1 },
      { name: "dash",    frames: 6, rows: 1 },
      { name: "bigrock", frames: 6, rows: 1 },
      { name: "scatter", frames: 6, rows: 1, even: true },
      { name: "quake",   frames: 8, rows: 1 },
      { name: "hit",     frames: 4, rows: 1 },
      { name: "death",   frames: 6, rows: 1 },
    ],
  },
  {
    prefix: "archer",
    jobs: [
      { name: "idle",  frames: 6, rows: 1 },
      { name: "walk",  frames: 8, rows: 1 },
      { name: "shoot", frames: 6, rows: 1 },
      { name: "hit",   frames: 4, rows: 1 },
      { name: "death", frames: 6, rows: 1 },
      { name: "dodge", frames: 6, rows: 1 },
    ],
  },
  {
    // VFX: even-split (debris bridges gaps), centered (effects expand from the
    // middle, not feet-on-floor). impact/runeburst are glows on near-black, so
    // they use the "dark" key; the rest are on white.
    prefix: "fx",
    jobs: [
      { name: "impact",      frames: 5, rows: 1, even: true, anchor: "center", key: "dark" },
      { name: "dust",        frames: 6, rows: 1, even: true, anchor: "center" },
      { name: "shockwave",   frames: 6, rows: 1, even: true, anchor: "center" },
      { name: "rockshatter", frames: 6, rows: 1, even: true, anchor: "center" },
      { name: "quakecrack",  frames: 8, rows: 1, even: true, anchor: "center" },
      { name: "runeburst",   frames: 6, rows: 1, even: true, anchor: "center", key: "dark" },
    ],
  },
];

const idx = (w, x, y) => (y * w + x) * 4;

// The raw strips are RGB on an opaque near-white background (no real alpha).
// Add an alpha channel by keying out white-ish pixels: a pixel goes transparent
// only if it's both bright AND near-neutral (low saturation), so the golem's
// blue runes, colored glow and tan dust all survive while the white field
// (including the pockets between the legs / under the arms) is removed. The
// dark-stone golem has no large neutral-white areas, so a global key beats a
// border flood-fill here (which leaves enclosed white pockets opaque).
// Downscaling later (premultiplied) feathers the hard edge into a clean outline.
function keyOutBackground(png, mode = "white") {
  const { data } = png;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (mode === "dark") {
      // Glow FX on a near-black field: alpha ramps with brightness so the black
      // drops out and bright cores stay solid — keeps soft edges for additive draw.
      data[i + 3] = mx <= 24 ? 0 : mx >= 96 ? 255 : Math.round(((mx - 24) / 72) * 255);
    } else {
      data[i + 3] = mn >= 222 && mx - mn <= 22 ? 0 : 255;
    }
  }
}

// Tight alpha bounding box of source pixels inside [x0,x1) x [y0,y1).
function bbox(png, x0, y0, x1, y1) {
  const { width, data } = png;
  let minX = x1, minY = y1, maxX = x0 - 1, maxY = y0 - 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[idx(width, x, y) + 3] > ALPHA_MIN) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null; // empty cell
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Find the x-ranges of `cols` frames within a horizontal row band [y0,y1).
// AI strips aren't always on a perfectly even grid, so split by the gaps between
// content instead: take the content runs and keep the largest (cols-1) gaps as
// the frame separators (this bridges internal gaps like the space between the
// legs). If content is fused across the row (e.g. slam debris spanning frames)
// we can't find enough gaps, so fall back to an even split.
function rowFrameBounds(png, y0, y1, cols, even = false) {
  const { width, data } = png;
  const evenSplit = () => {
    const cw = width / cols, out = [];
    for (let c = 0; c < cols; c++) out.push([Math.round(c * cw), Math.round((c + 1) * cw) - 1]);
    return out;
  };
  // Some sheets (e.g. flung-rock debris) bridge the gaps between frames and fool
  // gap detection, so allow forcing the plain even grid.
  if (even) return evenSplit();
  const has = new Array(width).fill(false);
  for (let x = 0; x < width; x++) {
    for (let y = y0; y < y1; y++) {
      if (data[idx(width, x, y) + 3] > ALPHA_MIN) { has[x] = true; break; }
    }
  }
  let runs = [], s = -1;
  for (let x = 0; x < width; x++) {
    if (has[x]) { if (s < 0) s = x; }
    else if (s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  if (s >= 0) runs.push([s, width - 1]);
  runs = runs.filter((r) => r[1] - r[0] + 1 >= 10); // drop stray specks
  if (runs.length < cols) return evenSplit();

  const gaps = [];
  for (let i = 1; i < runs.length; i++) gaps.push({ i, size: runs[i][0] - runs[i - 1][1] });
  const splitAt = new Set(
    gaps.slice().sort((a, b) => b.size - a.size).slice(0, cols - 1).map((g) => g.i)
  );
  const groups = [];
  let cur = [runs[0][0], runs[0][1]];
  for (let i = 1; i < runs.length; i++) {
    if (splitAt.has(i)) { groups.push(cur); cur = [runs[i][0], runs[i][1]]; }
    else cur[1] = runs[i][1];
  }
  groups.push(cur);
  return groups.length === cols ? groups : evenSplit();
}

// Bilinear sample of `png` at fractional (fx, fy) using premultiplied alpha
// (avoids dark fringes around the transparent edges). Returns [r,g,b,a].
function sample(png, fx, fy, out) {
  const { width, height, data } = png;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
  let pr = 0, pg = 0, pb = 0, pa = 0;
  const corners = [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty],
  ];
  for (const [cx, cy, wgt] of corners) {
    const i = idx(width, cx, cy);
    const a = data[i + 3];
    pr += data[i] * a * wgt;
    pg += data[i + 1] * a * wgt;
    pb += data[i + 2] * a * wgt;
    pa += a * wgt;
  }
  out[3] = Math.round(pa);
  if (pa > 0) {
    out[0] = Math.round(pr / pa);
    out[1] = Math.round(pg / pa);
    out[2] = Math.round(pb / pa);
  } else {
    out[0] = out[1] = out[2] = 0;
  }
  return out;
}

function packOne(prefix, job) {
  const src = PNG.sync.read(readFileSync(join(SRC_DIR, `${prefix}_${job.name}.src.png`)));
  keyOutBackground(src, job.key); // RGB bg -> transparent before trimming
  const cols = job.frames / job.rows;
  if (!Number.isInteger(cols)) throw new Error(`${job.name}: frames/rows not integer`);
  const cellH = src.height / job.rows;

  // 1) segment each row into frames by content gaps, then trim every frame to
  //    its alpha bbox (fall back to the segment rect if a cell is empty).
  const frames = [];
  for (let r = 0; r < job.rows; r++) {
    const y0 = Math.round(r * cellH), y1 = Math.round((r + 1) * cellH);
    for (const [x0, x1] of rowFrameBounds(src, y0, y1, cols, job.even)) {
      const bb = bbox(src, x0, y0, x1 + 1, y1) || { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 };
      frames.push(bb);
    }
  }

  // 2) one shared scale so every frame keeps its relative size and fits the cell.
  const maxW = Math.max(...frames.map((f) => f.w));
  const maxH = Math.max(...frames.map((f) => f.h));
  const scale = Math.min(FIT_W / maxW, FIT_H / maxH);

  // 3) repack into one CELL-tall strip. Characters sit feet-on-baseline; FX are
  //    centered in the cell (they expand outward from the middle).
  const out = new PNG({ width: CELL * job.frames, height: CELL });
  const baseline = CELL - FOOT_MARGIN;
  const px = [0, 0, 0, 0];
  frames.forEach((f, fi) => {
    const sw = Math.max(1, Math.round(f.w * scale));
    const sh = Math.max(1, Math.round(f.h * scale));
    const originX = fi * CELL + Math.round((CELL - sw) / 2);
    const originY = job.anchor === "center" ? Math.round((CELL - sh) / 2) : baseline - sh;
    for (let ty = 0; ty < sh; ty++) {
      for (let tx = 0; tx < sw; tx++) {
        const fx = f.x + (tx + 0.5) / scale - 0.5;
        const fy = f.y + (ty + 0.5) / scale - 0.5;
        sample(src, fx, fy, px);
        const o = idx(out.width, originX + tx, originY + ty);
        out.data[o] = px[0];
        out.data[o + 1] = px[1];
        out.data[o + 2] = px[2];
        out.data[o + 3] = px[3];
      }
    }
  });

  const outPath = join(OUT_DIR, `${prefix}_${job.name}.png`);
  writeFileSync(outPath, PNG.sync.write(out));
  const boxes = frames.map((f) => `${f.w}x${f.h}`).join(", ");
  console.log(
    `${prefix}_${job.name}.png  ${out.width}x${out.height}  (${job.frames} frames, ` +
    `scale ${scale.toFixed(3)})\n    src cells: ${boxes}`
  );
}

for (const { prefix, jobs } of CHARACTERS) for (const job of jobs) packOne(prefix, job);
console.log("done.");
