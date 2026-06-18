# Sprite art — drop-in spec

The game loads each animation as **one transparent PNG strip** from this folder.
Drop a file in with the exact name below and it animates automatically; until a
file exists, the character falls back to a placeholder circle (the game still
runs). This covers both the **golem** boss and the **archer** player.

## Format every strip must follow
- **Transparent background** (PNG with alpha). No parchment, labels, or borders.
- **One animation per file**, frames laid **left→right in a single row**.
- **Every frame the same pixel size.** Recommended cell **512 × 512**
  (strip width = 512 × frame-count, height = 512).
- **Consistent anchor & scale:** golem **centered**, **feet on the same baseline**
  in every frame, **same zoom** throughout (don't let it grow/shrink between
  frames — that's what makes a sprite wobble). Leave ~15% padding so raised arms
  / reach poses don't clip.
- View: **3/4 front** (what you already have). The engine flips it horizontally
  to face the player, so draw it facing one way (e.g. screen-right).

## Files the code expects (name · frames · fps)
| File | Frames | FPS | Loop |
|------|-------:|----:|------|
| `golem_idle.png`    | 6 | 8  | yes |
| `golem_walk.png`    | 8 | 10 | yes |
| `golem_smash.png`   | 8 | 8  | no  |
| `golem_dash.png`    | 6 | 7  | no  |
| `golem_bigrock.png` | 6 | 7  | no  |
| `golem_scatter.png` | 6 | 7  | no  |
| `golem_quake.png`   | 8 | 6  | no  |
| `golem_hit.png`     | 4 | 16 | no  |
| `golem_death.png`   | 6 | 9  | no  |
| `archer_idle.png`  | 6 | 8  | yes |
| `archer_walk.png`  | 8 | 11 | yes |
| `archer_shoot.png` | 6 | 16 | no  |
| `archer_hit.png`   | 4 | 16 | no  |
| `archer_death.png` | 6 | 9  | no  |
| `archer_dodge.png` | 6 | 18 | no  |

(Frame counts match the packed strips. FPS is tunable in `src/main.js` →
`GOLEM` / `ARCHER`.)

## How these PNGs are produced
The strips here are **generated**, not hand-placed. The raw ChatGPT art lives in
`web2d/art-src/<name>_*.src.png` (a white-background grid of frames);
`npm run pack-sprites` (see `web2d/tools/pack-sprites.mjs`) keys out the white
background, trims each frame, and repacks them into the uniform 512-tall,
single-row strips above. It packs every character listed in the script's
`CHARACTERS` table (currently `golem` + `archer`). Re-run it whenever the source
art is regenerated.

## Start with just one — the idle proof
Generate **`golem_idle.png`** only: a 6-frame transparent strip, e.g.
**3072 × 512** (six 512×512 cells), golem centered with feet on a shared
baseline. Drop it here, reload the page — the boss should breathe in place. If
idle looks right, the rest of the kit drops in identically.

## Later additions (already in your art kit)
`golem_grab.png` (8) and `golem_runesurge.png` (8) — wire them in `src/main.js`
once the grab attack / enrage phase exist in the sim. The FX sheet (shockwave,
rune burst, ground crack, dust) becomes separate small strips for impacts.
