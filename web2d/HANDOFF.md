# Bossraid 2D — Project Handoff / "Resume Here"

> **New Claude session / new account? Start here.** This file is the durable
> memory of the build (chat history does not transfer between accounts; the repo
> does). Read it, then continue. Develop on a `claude/...` branch → PR → `main`.

## What this is
A browser, single-player **boss-raid action RPG** in `web2d/` — pure HTML5
canvas + vanilla ES modules, **no build step**. You play a ranged **archer** vs a
3-phase **Ancient Stone Golem**. Logic is separated from rendering so the sim is
deterministic and unit-tested.

- **Live:** https://alison-crypto.github.io/Bossraid/ (GitHub Pages)
- **Repo:** `alison-crypto/Bossraid` — game lives in `web2d/`
- **Deploy:** merge to `main` → `.github/workflows/pages.yml` publishes `web2d/`
  to Pages automatically (~1 min). Pages source = "GitHub Actions" (already on).
- **Tests:** `cd web2d && npm test` (node:test) — currently **50 passing**.
- **Run locally:** `cd web2d && python3 -m http.server 8000` → open localhost.
- **Controls:** WASD move · J shoot · L power shot · Space dodge · Esc/P pause.

## Architecture (reuse, don't rebuild)
| File | Responsibility |
|---|---|
| `web2d/src/stats.js` | **Canonical `CombatMath`** (ported 1:1 from the Godot build) — the single source of truth: `maxHealth`, `forceBase`, `lightDamage`/`heavyDamage`/`heavyMultiplier`, kinetic-energy ranged (`arrowMass`/`arrowLaunchSpeed`/`arrowImpactDamage`), `incomingDamage` (block/parry/DEF), `swingTime`, `skillMods`, `statSheet`. **All combat/UI reads from here.** |
| `web2d/src/game.js` | Headless, deterministic **sim**. `CFG` = ALL tuning. `createGame(opts)`, `step(s,input,dt)`. `deriveCombat(opts)` turns stats+equipment+skill ranks into the player's combat fields. Boss state machine (idle→windup→strike→recover), 5 attacks, **3 phases**, stamina, boulders-as-obstacles. **No DOM.** Unit-tested. |
| `web2d/src/main.js` | Canvas **view + input + scene machine** (menu / charSelect / bossSelect / playing / paused / settings), animation drivers (`bossClip`/`playerClip`), **FX layer** (`spawnFx`/`updateFxTriggers`), telegraphs, HUD, hi-DPI render (`resizeCanvas`, `setTransform`), display settings. |
| `web2d/src/ui.js` | Tiny canvas immediate-mode UI: `uiButton`/`uiZone`/`uiHit`/`panel`/`label` (logical-coord hit-testing). Used by menu, pause, settings. |
| `web2d/src/rpg.js` | **Profile** (stats, skill ranks, owned/equipped), equipment catalogs (bows/armor/boots), skills, **XP/leveling**, `gameOptsFromProfile`, `localStorage` save/load. |
| `web2d/src/sprites.js` | `loadStrip` / `drawStrip` (feet-anchored, flip). Missing art → graceful fallback. |
| `web2d/src/anim.js` | `Animator`, `frameIndex`, `clipDuration` (loop wraps, one-shots clamp). |
| `web2d/src/touch.js` | Joystick/button math for touch. |
| `web2d/tools/pack-sprites.mjs` | **Sprite packer** (pngjs). `CHARACTERS` table → reads `art-src/<prefix>_<clip>.src.png`, keys out bg, trims, repacks to uniform 512 strips in `assets/`. Key modes: `white` (default), `dark` (glow/additive), `flood` (border flood-fill for opaque props); `anchor:"center"` for FX/props; `even` split. |
| `web2d/art-src/` → `web2d/assets/` | Raw source art → packed strips. `npm run pack-sprites` regenerates. |

### Principles
- **Sim/view split**; keep `game.js` DOM-free and tested.
- **`stats.js` is the source of truth** — never hardcode damage; call CombatMath.
- Canvas UI (no DOM widgets); render in 960×600 **logical** coords, backing store
  is hi-DPI (crisp). Pointer mapped logical via `toCanvas`.
- Ship **small PRs**, tests green, merge to `main` (auto-deploys).

## Gameplay systems (current)
- **Archer (player):** ranged kinetic-energy arrows (`arrowImpactDamage`); `J`
  light, `L` charged (×`heavyMultiplier`). Dodge-roll = i-frames. Sprites:
  idle/walk/shoot/hit/death/dodge.
- **Golem (boss):** 5 attacks — **smash** (ground ring), **dash** (lunge, i-frame
  it), **big rock** (lands as a permanent **boulder obstacle** that blocks the
  player, arrows, AND the golem's own dash/rocks), **scatter** (6 pellets),
  **earthquake** (whole-arena, dodge the flash). **3 phases**: each depleted
  health-bar segment → brief stagger, then faster + harder + new attack rotation.
- **Stamina:** every action drains it (move 2/s, shoot 8, power 20, dodge 18);
  recharges fast idle (28/s), slowly while walking (9/s); gates actions when low.
- **RPG:** XP from damage (+win bonus) → levels → stat points (STR/DEX/CON) +
  skill points; equip bows/armor/boots (STR-gated); skills Marksmanship/Evasion/
  Power Shot. Managed in the **pause menu** tabs. Persists to `localStorage`.
- **FX:** impact, dust, shockwave, rock-shatter, quake-cracks, rune-burst +
  procedural telegraphs, screen-shake, stone floor.

## Tuning knobs
**`CFG` in `web2d/src/game.js`** (current values):
- Player: `playerSpeed 220`, `attackCd 0.35`, `heavyAttackCd 0.7`, `arrowSpeed 720`,
  `dodgeSpeed 560`, `dodgeTime 0.22`, `hitInvuln 0.6`.
- Stamina: `staminaMax 120`, `staRegen 28`, `staRegenWalk 9`, `staRegenDelay 0.5`,
  `staMove 2`, `staShoot 8`, `staHeavy 20`, `staDodge 18`.
- Boss: `bossMaxHp 1200`, `bossSpeed 165`, `bossCd 1.5`, `bossDef 6`, `phases 3`,
  `phaseStagger 0.85`. Attacks: smash `slamR 130`/`windup 0.9`/`bossDmg 26`; dash
  `dashSpeed 820`/`dashDmg 30`; big rock `bigRockR 26`/`bigRockDmg 28`; scatter
  `scatterCount 6`/`smallRockDmg 15`; quake `quakeWindup 1.1`/`quakeDmg 34`.
- Phase scaling (in `game.js`): per phase +28% speed, −16% cooldown, −12% windup,
  +22% damage.

**`web2d/src/rpg.js`:** bows (12/22/34, str 6/10/14), armor (def 4/8/12), boots
(def 1/2, +speed), skills (cap rank 5), `xpToNext = 100 × level`, default stats
STR 10 / DEX 12 / CON 10.

## Adding art (pipeline)
1. Generate sheets (single row, one anim per file). Put raw PNGs in
   `web2d/art-src/<prefix>_<clip>.src.png`.
2. Add a `CHARACTERS` entry / clip in `tools/pack-sprites.mjs` (frames, rows,
   `key`, `anchor`, `even`). FX on dark bg → `key:"dark"`; opaque props on dark →
   `key:"flood"`; characters on white → default.
3. `cd web2d && npm run pack-sprites` → strips land in `assets/`. Wire in
   `main.js` (`loadStrip` + clip mapping).
- ChatGPT art comes as RGB (baked bg, not true alpha); the packer's keys handle
  it. Owner usually drops art in a shared Google Drive folder; pull via `curl`
  `https://drive.google.com/uc?export=download&id=<id>` (Drive MCP `search_files`
  to list a folder by `parentId`).

## Changelog (PRs on `main`)
#50 golem art + Pages hosting · #51 (base) · #52 coherent slam · #53 archer ranged
combat · #54 golem 5-attack kit + boulders · #55 bespoke golem anims · #56 VFX
layer · #57 telegraphs/whole-map quake/floor/rock sprites · #59 floor+rock art,
boulders block boss, dash FX · #60 fill-screen canvas · #61 hi-DPI crisp render ·
#62 adopt CombatMath · #63 3-phase golem · #64 stamina · #65 menu+select · #66 RPG
core (equip/skills/XP) · #67 pause + RPG panels · #68 display options · #69 stamina
retune · #71 gear unlocks by level (owns by level, equips by STR; inventory shows
the unlock level) · #72 bigger arena (1280×800), golem phase-2 pellets detonate on
boulders (AoE), phase-3 boulders rise as chasing minions (arrow-killable); mobile
fullscreen via dvh sizing + PWA manifest (iOS Add-to-Home-Screen hint) · #73 2.5D
view (Settings toggle, default on): tilted perspective floor + upright billboard
sprites with drop-shadows. View-only — sim untouched; `vX/vY/vScale` helpers are
the identity in 2D so one render path serves both. Aiming is movement-based so no
screen↔world cursor mapping was needed. · #74 2.5D polish + follow-camera: WORLD
enlarged to 3840×2400 (≈3×) with a camera locked on the archer (`camX/camY`,
`CAM.zoom*`); viewport decoupled to a fixed 1280×800 (`W/H`); `vX/vY/vScale` now
pan+zoom around the camera (perspective in 2.5D, flat in 2D); textured stone floor
that scrolls/recedes under the camera (scanline-sampled in 2.5D, world-tiled in
2D); depth-sorted billboards (far→near); bloom/glow pass + emissive golem aura &
minion eyes; off-screen GOLEM direction chevron. Combatants now spawn near each
other so the fight starts engaged on the big map. · #75 ability kit + unified
input. Every character now has a slot kit: **3 attacks** (Quick/Power/Spread),
**3 skills** (Volley/Explosive/Pierce, cooldown-gated via `player.cd`), a
**passive** (Eagle-Eye: distance-scaled arrow damage), a **dash**, a **defence**
(class-typed — light = Deflect reflects rocks back; heavy classes will block+parry),
and a **special** (Arrow Storm, gated by BOTH a meter that fills in combat AND a
cooldown). `step()` input contract expanded (attack1-3/skill1-3/dash/defend/
special/aim) with legacy `attack/heavy/dodge` aliases kept so tests pass. Unified
`readInput()` merges **keyboard + Xbox gamepad (Gamepad API) + on-screen touch**
with edge-triggering; gamepad also drives menus. HUD adds a special-meter bar,
per-skill cooldown sweeps on the touch buttons, and a keyboard/controller ability
readout. 68 unit tests (7 new for the kit).
  - **Xbox map:** LS move · RS aim · RT Quick · RB Power · LB Spread · X Volley ·
    Y Explosive · B Pierce · LT Deflect · A Dash · Dpad-Up/R3 Special · Start pause.
  - **Keyboard:** WASD · J/K/L attacks · U/I/O skills · Space dash · Shift deflect ·
    E special · Esc/P pause.
· #76 polish/bugfix pass: (1) fixed the joystick sticking in a corner after a
retry — `resetInput()` clears stick/pointers/keys on startFight + quit; (2) visible
arena **walls** — the floor is clipped to the arena polygon and everything beyond
is a stone wall band + lit boundary (no more invisible barrier); (3) a clear
top-centre **☰ Menu** button opening the full pause menu; (4) bigger touch buttons
pulled in from the corners + larger joystick; (5) a **loading screen** (waits on
all sprite/texture images via `img.complete`, 6s cap) so nothing pops in. Also
fixed the 2.5D floor's scrolling seam (scanline sampler no longer reads past the
tile edge).

## Backlog / next ideas
- **Unlock** Knight/Mage characters + Cinder Wyrm boss (currently `locked:true` in
  `main.js` `CHARACTERS`/`BOSSES`) — needs their kits + art.
- More equipment/skills; richer skill tree; balance pass (boss is intentionally
  tough — see CFG).
- Optional: melee/kick & block/parry (CombatMath already supports them).
- 4K art deferred (no visible gain at current display sizes; hi-DPI already maxes
  sharpness).

## Migrating to a new Claude account
- The **code is yours via GitHub** — independent of any Claude plan. Keep the
  GitHub account & repo.
- On the new account: open Claude Code, **connect `alison-crypto/Bossraid`**, say
  *"read web2d/HANDOFF.md and continue."*
- Chat history can't transfer; the full session transcript is saved at
  `web2d/docs/SESSION_LOG.md` (in this repo) and backed up to Google Drive
  (link emailed to the owner).
