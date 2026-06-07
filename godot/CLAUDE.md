# Bossraid — Godot project guide (read me first)

This file orients an AI coding assistant (Claude Code) working on the Godot
version of Bossraid. Read it before making changes.

## Vision

A Sword Art Online / Aincrad–style action RPG, built **one floor at a time**.
A floating castle of floors; each floor = its own map + monsters + a labyrinth +
a floor boss. Beat the boss → unlock the next floor. Long-term goals (later,
optional): local co-op → tunnel to friends → more players. It's a personal
project; build in small, testable steps.

Full background + the earlier web prototype's learnings: see the repo root
(`PLAN.md`, `docs/ROADMAP.md`, `docs/CHARACTER_CREATION.md`).

## Why Godot

The project started as a browser Three.js prototype (`/prototype-3d/`). It
proved the feel and the SAO floor design but hit limits handling rigged
characters, animation state, and scale. We moved to **Godot 4** for proper
animation, physics, scene tooling, and room to grow.

## Current state

Everything is built in code in `Main.gd` (the `.tscn` is just a Node3D running
it). Implemented so far:

- Open ground (infinite floor) + sky/sun.
- **Third-person player** (`CharacterBody3D`) loading an animated glTF
  (`models/Soldier.glb`, Idle/Run), manual behind-the-player camera (yaw→pitch→
  camera), layout-independent WASD + sprint + jump, model faces movement
  (`MODEL_FACE_FLIP`).
- **Combat:** left-click melee (range + front-arc), right-click ranged bolt;
  floating `Label3D` damage numbers.
- **Training dummy** (HP + regen) for practice.
- **Floor-1 boss (Pumpkin Golem):** the `Pumpkinhulk` model scaled to ~3.4 m;
  faces/chases the player, telegraphed ground slam (red ring wind-up → strike,
  damages player if inside), idle/windup/recover state machine; boss HP, takes
  player damage; VICTORY/DEFEATED banner; boss + player respawn.
- **HUD** (CanvasLayer): player HP bar, boss HP bar + name, banner.
- **Character select** (`Select.tscn`/`Select.gd`, the main scene): a live 3D
  preview of the highlighted hero playing a boxing clip on a slow turntable (so
  they aren't in a T-pose) + a button per character. Picks store into the
  `GameState` autoload and load the arena.
- **Animation retargeting** (`AnimUtil.gd`): merges a single Mixamo clip from an
  external `.glb` onto a character's `AnimationPlayer` by copying its **rotation**
  tracks onto the target skeleton (works across any Mixamo `mixamorig:*` rig).
  Used for the sword **Slash** (melee attack) and the select-screen **Boxing**.
- Models: `Soldier.glb` (Idle/Run/Walk), `Vanguard.glb`, `Erika.glb` — all share
  the Mixamo skeleton. Extra clips live in `models/anim/` (`slash.glb`,
  `boxing.glb`); add more there and merge them via `AnimUtil`.

> Note: written without running Godot in the sandbox — expect small fixes on
> first run. Keep it runnable; fix parse/runtime errors before adding more.

## Next steps (suggested order)

1. **Verify + polish** the boss fight feel (slam timing/telegraph clarity,
   damage values, camera).
2. **Refactor** the monolith `Main.gd` into scenes: `Player.tscn`, `Boss.tscn`,
   `World.tscn`, a `HUD` — cleaner as it grows.
3. **AnimationTree state machine** — replace the hand-rolled `_play()` swapping
   in `Main.gd` with an `AnimationTree` + `AnimationNodeStateMachine` (idle ↔
   run ↔ attack), the documented way to blend locomotion + attacks. This also
   lets us bring back root motion (we currently drop the hips rotation; see the
   retargeting notes below).
4. **Real Floor 1** — a proper map (terrain/props), a few wandering monsters, a
   short labyrinth leading to the boss arena.
5. **Progression** — beat boss → unlock next floor; a hub/teleport. Then RPG
   systems, later networking (Godot high-level multiplayer / `ENetMultiplayerPeer`).

## Conventions

- Godot 4.6, GDScript. Indentation is **tabs** (never spaces) — a space-indented
  line is a parse error. Verify with `grep -cP '^ +\S' file.gd` (must be 0).
- Keep scenes simple; prefer small reusable scenes (`Player.tscn`, `World.tscn`)
  as the project grows — the all-in-code `Main.gd` is just a starting point.
- One system at a time. Keep it runnable; test in the editor (F5) after each
  change. (The cloud assistant can't run Godot — the human tests and reports.)
- Real-world scale (metres): characters ~1.8 m. Use `AnimUtil.fit_height()`.

## Asset pipeline (characters + animations)

- **Characters/animations come from Mixamo** (free). Godot imports `.glb`
  natively; `.fbx` imports too. We convert FBX→glb headless with `FBX2glTF`.
- A Mixamo *character* export (T-Pose) has mesh + skeleton but no motion.
  Download **animations** separately ("Without skin", FBX, 30fps) — they share
  the Mixamo skeleton (`mixamorig:*` bones) and **retarget** onto any character.
- Assets live in `models/` (characters) and `models/anim/` (clip-only glbs).

## Godot 4 reference (curated — what this project actually uses)

Grounded in the official docs (https://docs.godotengine.org/en/stable/). Fetch
the specific page when you need exact API; the high-value areas for us:

### Animation
- **`AnimationPlayer`** holds clips in **`AnimationLibrary`** resources (the
  default library is named `""`). Key API: `get_animation_list()`,
  `get_animation(name)`, `play(name, blend)`, `animation_finished` signal,
  `get_animation_library("")`, `add_animation_library(name, lib)`.
- **`Animation`** = tracks + keys. Godot 4 skeletons use **separate**
  `TYPE_POSITION_3D` / `TYPE_ROTATION_3D` / `TYPE_SCALE_3D` tracks per bone
  (no combined transform track). Track path for a bone is `SkeletonNode:BoneName`
  (`path.get_concatenated_subnames()` → the bone name).
- **Loop**: `animation.loop_mode = Animation.LOOP_LINEAR` (clips don't loop on
  import). Loop locomotion; one-shot attacks (`LOOP_NONE`).
- **Next step:** drive states with **`AnimationTree`** +
  **`AnimationNodeStateMachine`** instead of manual `play()` swaps.

### Skeleton retargeting (important — the "proper" way vs. ours)
- **Names get mangled on import.** Godot sanitizes: `mixamo.com` → `mixamo_com`,
  and the `mixamorig:` bone prefix/colon is stored inconsistently between files.
  So an exact `Skeleton3D.find_bone("mixamorig:Hips")` can fail — match by a
  **normalized** name (see `AnimUtil._norm`: drop `mixamorig`, strip punctuation/
  case).
- **Our approach (`AnimUtil.merge`, headless):** load a clip glb, copy its
  rotation (+scale) tracks onto the target `Skeleton3D` by normalized bone name,
  add the result to the target `AnimationPlayer`. We **skip the root/hips
  rotation** so the clip can't override gameplay-driven facing (otherwise the
  body faces backward). Positions are skipped (bone-length dependent).
- **The official editor way (preferred once someone can use the editor):**
  Import dock → select the `Skeleton3D` → create a **`BoneMap`** with
  **`SkeletonProfileHumanoid`** → enable **Rest Fixer → "Overwrite Axis"** (the
  key option for cross-character sharing) and "Fix Silhouette". This normalizes
  every rig's bone rests so clips share cleanly — no per-track copying, and root
  motion works. Relevant classes: `BoneMap`, `SkeletonProfile`,
  `SkeletonProfileHumanoid`. Do this in the editor (the cloud assistant can't).

### Other areas we'll reach for
- **`CharacterBody3D`**: `velocity`, `move_and_slide()`, `is_on_floor()`;
  gravity from `ProjectSettings` `physics/3d/default_gravity`.
- **Monsters/pathing:** `NavigationRegion3D` + `NavigationAgent3D`.
- **Networking (later LAN/co-op):** high-level multiplayer —
  `MultiplayerSpawner`, `MultiplayerSynchronizer`, `ENetMultiplayerPeer`.

## Do / don't

- Do keep it runnable after every change; commit small. Tabs, not spaces.
- It's the owner's private prototype — use whatever assets they supply. Prefer
  legit sources (Mixamo / CC0 / store-bought) and don't commit obvious
  commercial-game rips. (Note: the Free Fire "Hipster" glb is unrigged — no
  skeleton/animations — so it can't be driven like the Mixamo characters.)
