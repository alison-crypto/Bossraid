# Bossraid — Animation & Asset Inventory

Catalog of the Mixamo/asset library Alison downloaded, and the curated sets we use
in the game. The renderer loads **FBX directly** (three.js `FBXLoader`, no Blender /
glb conversion needed — see `web2d/tools/render-3d/render.html`), so any FBX below
can be used as-is.

## Where everything lives

| Location | What | Count |
|---|---|---|
| `G:\My Drive\Alison Private\Game\Animations\Combat` | Mixamo combat anims (bow, melee, locomotion, deaths, reactions) | 606 FBX |
| `G:\My Drive\Alison Private\Game\Animations\Adventure` | Adventure anims (climb, swim, idle variations, guns) | 385 FBX |
| `G:\My Drive\Alison Private\Game\Animations\Fantasy` | Fantasy anims (greatsword, spell, monster) | 180 FBX |
| `G:\My Drive\Alison Private\Game\1.Texture\2. Animation` | Earlier loose anim downloads | 53 FBX |
| `G:\My Drive\Alison Private\Game\1.Texture\1.Character` | `Erika Archer (1).fbx`, `Erika Archer With Bow Arrow.fbx` | — |
| `G:\My Drive\Alison Private\Game\2.Models` | Weapons (MedievalWeapons1), props, FreeStylized environment | — |
| `Bossraid/godot/models` | In-game GLBs: Erika, Golem, Maria, Pumpkin, Soldier, Vanguard + weapons | — |
| `Bossraid/godot/models/anim` | 33 legacy GLB anims (melee-heavy: sword1h/2h, dagger, + bow_draw/bow_shoot) | 33 GLB |

> The bow archer's proper clips were ALWAYS here (`Combat/Standing Aim *`). The
> `godot/models/anim` GLB set is melee-focused and is for future Knight/Mage classes.

## Curated ARCHER set (Erika) — game action → source clip

All from `Game/Animations/Combat/`. Bow is a **separate hip-locked attachment**
(swappable at runtime), so these are body-only and the bow rides them.

| Game action | Source FBX |
|---|---|
| idle (relaxed) | `Standing Idle.fbx` |
| idle (combat/aim) | `Standing Aim Idle 01.fbx` |
| move forward | `Standing Aim Walk Forward.fbx` |
| move back | `Standing Aim Walk Back.fbx` |
| strafe left / right | `Standing Aim Walk Left.fbx` / `Standing Aim Walk Right.fbx` |
| sprint | `Standing Run Forward.fbx` |
| draw (attack windup) | `Standing Draw Arrow.fbx` |
| shoot / release | `Standing Aim Recoil.fbx` |
| charge / power (hold) | `Standing Aim Overdraw.fbx` |
| dodge (4-dir) | `Standing Dodge Forward/Back/Left/Right.fbx` |
| roll | `Dive Roll.fbx` |
| hit reaction | `Hit Reaction.fbx` |
| death | `Standing Death Forward 01.fbx` |
| equip / disarm bow | `Standing Equip Bow.fbx` / `Standing Disarm Bow.fbx` |

Ability poses (volley / explosive / pierce / arrow-storm special) reuse
draw/recoil/overdraw with distinct in-game FX.

## Render recipe (current, verified)
Side view `cam {yaw:78, pitch:10, dist:2.5, targetY:0.55, fov:22}`; bow
`{lock:true, scale:0.62, rot:[0,0,0]}` (hip-relative orientation: string→her face,
curved wood→target); FBX `.position` tracks scaled cm→m (×0.01); all clips
normalized to face the same direction (mirror in the gif encoder where needed).

## Other classes (future)
- **Knight / melee:** `godot/models/anim` sword1h_* / sword2h_* / dagger_* / block /
  slash / stab / smash, plus `Combat/` has hundreds more (combos, blocks, parries).
- **Boss (Golem):** `orc_idle/orc_walk/orc_slam`, plus `Fantasy/` monster anims.
