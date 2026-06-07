# Bossraid (Godot) — setup & how to work locally

This is the proper-engine version. It runs on **your PC** (Godot can't run in
Claude's remote sandbox), so the loop is: edit/generate code → run in the Godot
editor → iterate.

## 1. Install Godot 4

- Download **Godot 4.3** (or newer), Standard edition, from
  <https://godotengine.org/download>. It's a single executable — no installer
  needed.

## 2. Get the project

```sh
git clone https://github.com/alison-crypto/Bossraid.git
cd Bossraid
git checkout main        # once this branch is merged
```

## 3. Open & run

1. Launch Godot → **Import** → select `Bossraid/godot/project.godot` → Import &
   Edit.
2. Press **F5** (Run). You'll spawn in an open field as the Soldier, third
   person — **WASD** move, **mouse** look, **Shift** sprint, **Space** jump,
   **Esc** to free the cursor. A training dummy stands a few metres ahead.

If Godot asks to re-import the `.glb` files, let it.

## 4. Use Claude Code locally to keep building

1. Install Claude Code (CLI) on your PC and sign in.
2. In a terminal: `cd Bossraid` then run `claude`.
3. It will read `godot/CLAUDE.md` for the design + roadmap. Ask it for one
   "kernel" at a time, e.g.:
   - "Add a melee attack with an Area3D hitbox that damages the dummy and shows
     a hit reaction."
   - "Wire Erika's Mixamo walk/run animations onto her via retargeting."
   - "Add a character-select scene."
4. **Optional — Godot MCP:** if you want Claude Code to drive the editor
   directly, install a Godot MCP server (e.g. search "Godot MCP" on GitHub) and
   add it to Claude Code. Not required — it can edit the `.gd`/`.tscn` files
   directly and you run them.

## 5. Adding characters / animations

- Drop a Mixamo character `.glb`/`.fbx` into `godot/models/`, then in `Main.gd`
  set `CHARACTER` to it (or build a select screen).
- Download animations from Mixamo as **FBX, "Without skin", 30fps**, import
  them, and retarget onto the character (see `CLAUDE.md` → Asset pipeline).

## Notes

- The old browser prototype lives in `/prototype-3d/` for reference; the Godot
  project is the path forward.
