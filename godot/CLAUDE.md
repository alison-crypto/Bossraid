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

## Current state (this scaffold)

- `project.godot`, `Main.tscn` (trivial: a Node3D running `Main.gd`).
- `Main.gd` builds, in code: sky + sun, an open ground (infinite floor
  collision) + reference grid, a training **dummy**, and a **third-person
  player** (`CharacterBody3D`) that loads an animated glTF character
  (`models/Soldier.glb`) with idle/run, mouse-look spring-arm camera, WASD +
  sprint + jump.
- `models/Soldier.glb` (rigged, has Idle/Run/Walk) and `models/Erika.glb` (a
  Mixamo character; **no animation baked in** — needs retargeted clips).

## Conventions

- Godot 4.3+, GDScript. Keep scenes simple; prefer small reusable scenes
  (`Player.tscn`, `World.tscn`, etc.) as the project grows — the all-in-code
  `Main.gd` is just a starting point; feel free to refactor into proper scenes.
- One system at a time. Test in the editor (F5) after each change.
- Real-world scale (metres): characters ~1.8 m.

## Asset pipeline (characters + animations)

- **Characters/animations come from Mixamo** (free). Godot imports `.glb`
  natively; `.fbx` imports too (Godot 4 has an FBX importer, or convert to glB).
- A Mixamo *character* export (T-Pose) has the mesh + skeleton but no motion.
  Download **animations** separately ("Without skin" / "No Character", FBX,
  30fps) — they share the Mixamo skeleton (`mixamorig:*` bones), so they
  **retarget** onto any Mixamo character.
- In Godot: import the animation files, then either use Godot's animation
  retargeting (Import dock → "Retarget" / bone map) or copy the `Animation`
  resources onto the character's `AnimationPlayer`. An `AnimationTree` +
  state machine is the proper way to drive locomotion + attacks.
- Erika needs her walk/run/attack clips wired this way (her own file has none).

## Roadmap (suggested order)

1. **Player controller polish** — gravity/jump feel, sprint, camera collision
   (SpringArm already helps), maybe a proper `Player.tscn`.
2. **Combat** — melee + ranged with hitboxes (Area3D), damage to the dummy,
   hit feedback. Drive attack animations via an `AnimationTree`.
3. **Character select** — pick a character; load + retarget its animations.
4. **Floor 1** — a real map (terrain/props), a few monsters, a labyrinth, and a
   floor boss with telegraphed attacks (port the Golem/Wraith designs).
5. **Progression** — beat boss → unlock next floor; a hub/teleport.
6. **Later** — RPG systems, then networking for co-op.

## Do / don't

- Do keep it runnable after every change; commit small.
- Don't pull assets from commercial games (copyright). Use Mixamo / CC0 /
  store-bought / commissioned.
