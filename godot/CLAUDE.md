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
- **Floor-1 boss (Stone Golem):** faces/chases the player, telegraphed ground
  slam (red ring wind-up → strike, damages player if inside), idle/windup/
  recover state machine; boss HP, takes player damage; VICTORY/DEFEATED banner;
  boss + player respawn.
- **HUD** (CanvasLayer): player HP bar, boss HP bar + name, banner.
- Models: `Soldier.glb` (rigged + Idle/Run/Walk) and `Erika.glb` (Mixamo char,
  **no animation baked in** — needs retargeted clips).

> Note: written without running Godot in the sandbox — expect small fixes on
> first run. Keep it runnable; fix parse/runtime errors before adding more.

## Next steps (suggested order)

1. **Verify + polish** the boss fight feel (slam timing/telegraph clarity,
   damage values, camera).
2. **Refactor** the monolith `Main.gd` into scenes: `Player.tscn`, `Boss.tscn`,
   `World.tscn`, a `HUD` — cleaner as it grows.
3. **Erika + animations** — retarget Mixamo clips (idle/run/slash) onto Erika
   (the `Longbow Locomotion Pack` is in the Drive folder), then a character
   select.
4. **Real Floor 1** — a proper map (terrain/props), a few wandering monsters, a
   short labyrinth leading to the boss arena.
5. **Progression** — beat boss → unlock next floor; a hub/teleport. Then RPG
   systems, later networking.

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

## Do / don't

- Do keep it runnable after every change; commit small.
- Don't pull assets from commercial games (copyright). Use Mixamo / CC0 /
  store-bought / commissioned.
