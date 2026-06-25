# Bossraid Floor-1 Polish — Evidence-Backed Milestone Roadmap

*Godot 4.6, 3D archer-vs-golem action-RPG. Refining the A–F draft against real research (Godot docs + LoL/Wild Rift UI references). Every technique is tied to a finding/source and to one of Alison's specific complaints. UI ideas borrowed from LoL/Wild Rift's (excellent) interface, adapted to our action-RPG — not the MOBA gameplay.*

---

## How the research reshaped the draft

| Draft assumption | Research verdict | Change |
|---|---|---|
| Hand-rolled `_archer_anim` calling `anim.play()` one clip at a time | **Wrong approach.** AnimationTree is the engine-blessed way to blend/layer/transition; once an AnimationPlayer is bound to a tree, direct `play()` calls "will not function as expected." | **Replace** with a layered `AnimationNodeBlendTree`. Fixes "anims wrong per-state" AND "shoots sideways while moving." |
| Custom `AnimUtil` copying rotation tracks only | **Wrong/fragile.** Mixamo needs import-time `BoneMap` + `SkeletonProfileHumanoid` (Rename Bones / Overwrite Axis / Fix Silhouette). Rotation-only copy ignores the rest-pose/scale mismatch that causes the deformed golem. | **Replace** with the built-in retarget pipeline. Fixes the "deformed golem." |
| Arrows auto-aim with a slight arc; camera auto-faces boss; movement camera-relative | **Half-right.** Straight-shot is correct + simpler. But camera-locked movement is *why dodge feels glued.* | **Keep** straight arrows; **split** aim-lock from movement so dodge uses the joystick vector. |
| Bow = static bone-attached mesh | **Confirmed pattern.** Bone+IK+string-bone rig is the production approach; constraints don't export, so bake or blend a 0–1 pullback in-engine. | **Keep direction, add rig.** |
| Renderer: `gl_compatibility` for web | **Blocker for FX.** Particle **trails and glow are unsupported/reduced on Compatibility**. | **DECISION needed** before Milestone C: Forward+/Mobile for full FX vs `gl_compatibility` for max device support. |
| Touch UI = raw `_input` hit-test, fraction-anchored buttons | **Brittle.** Build HUD as `CanvasLayer` + anchored `Control`; use `TouchScreenButton` for multitouch; drive everything through **named InputMap actions**, never raw keys. | **Refactor** onto actions + anchored Controls — the prerequisite for Mobile/PC/Controller modes + remap. |

**Net:** the draft's *ordering* was roughly right, but A's anim system and B's retarget must switch from hand-rolled code to engine systems, and a hidden prerequisite (action-based input + a renderer decision) must come first. So: a **new Milestone 0**, and the bow string-pull merged into the archer milestone (the string follows the *draw* the archer controls).

---

## Milestone 0 — Input & rendering foundation *(NEW — prerequisite)* · **Effort: M**

- **Action-based input:** define every gameplay input as a **named action** in Project Settings → Input Map; bind keyboard + mouse + joypad to each; query via `Input.is_action_pressed/just_pressed`, `Input.get_vector()` (stick/WASD parity), `Input.get_action_strength()`.
- **Why it matters:** "Mobile/PC/Controller modes + key remapping" become nearly free once code reads actions instead of raw keys (remap = `action_erase_events` + `action_add_event`). The current raw `_input` hit-test can't support this.
- **`InputDeviceManager` autoload:** classify each event (key/mouse → kbm; joypad → pad; touch → touch), store last-used, emit `device_changed` so prompt glyphs swap.
- **Renderer decision (now):** skill FX (trails + glow) need Forward+/Mobile. If web must stay `gl_compatibility`, FX shrinks to HDR-glow + emissive flashes (no ribbon trails). Decide before Milestone C.
- **Persistence:** Godot doesn't save InputMap changes — serialize to `ConfigFile` and re-apply on startup.

---

## Milestone A — Archer combat feel *(anim system, aim, dodge, lock toggle, bow flex)* · **Effort: L**

The heart of "nail mechanics first." Absorbs the bow-flex work (string tracks the draw).

- **A1 — AnimationTree (M):** `AnimationNodeBlendTree` in series: `[Locomotion StateMachine (BlendSpace2D)] → [Blend2 "AimLayer" bone-filtered] → [OneShot Shoot] → [OneShot Hit]`. DodgeRoll = a root-motion state. **Delete all `anim.play()` calls.** Bone-filtered upper-body blend = **aim while running** + fixes "shoots sideways." Drive from `_physics_process`.
- **A2 — Bow-hand aims + straight arrows (M):** `LookAtModifier3D` (4.4+) on the aim bone → a `Marker3D` placed on the locked target each frame; arrow fires `dir = (target - muzzle).normalized() * speed`, `arrow.look_at(target)`. **Drop the arc.** Bone-aim, visual arrow, and hit-resolution all use the SAME target position.
- **A3 — Lock/unlock + target arrows (S–M):** a `Targeting` script over an `Area3D` lock-zone + `enemies` Group: `acquire_nearest()`, `cycle(±1)` by screen-angle. Locked → reticle on boss, camera tracks; unlocked → free aim. Boss portrait + outline = the lock indicator (Wild Rift "target lock filtering").
- **A4 — Dodge in JOYSTICK direction (S):** decouple **movement basis from aim/camera lock** — movement comes straight from `Input.get_vector()`. Dodge-roll = **root motion** (distance authored in the clip → no slide): `velocity = basis * get_root_motion_position() / delta` → `move_and_slide()`.
- **A5 — Bow flex + string pull (M–L, Blender+Godot):** Blender armature — grip bone, 2–3 bone limb chains, a **string bone** (string mesh weighted to it); limbs bend via IK + Limit-Distance to the string bone. Constraints don't export → **bake** the draw (Visual Keying), "Export Deformation Bones Only." In Godot: drive a 0–1 `pullback` via `BlendSpace1D` from GDScript during the draw. (Bones+IK, not shape keys.)

---

## Milestone B — Golem boss *(deformation fix, distinct anims, textures)* · **Effort: M–L**

- **B1 — Fix the melted/low golem (M):** root cause = **rest-pose / transform mismatch** (Mixamo armature 0.01 / mesh 100 + 90° X), not weights per se. Blender: `Ctrl+A` Apply All Transforms; import with Automatic Bone Orientation (or import anim as DAE to dodge the orientation bug); if rest pose wrong → set true T-pose → Apply Pose as Rest → re-bind. Godot: re-import with `BoneMap` + `SkeletonProfileHumanoid`, Rest Fixer → Apply Node Transform + **Overwrite Axis** + Fix Silhouette. **Caveat:** a non-humanoid golem won't map cleanly to the humanoid profile — hand-map/exclude extra bones; if auto-rig changed proportions, **re-skin** rather than chase import settings. (Worst-documented path → prototype first.)
- **B2 — Distinct attack anims (M):** golem gets its own `AnimationTree` StateMachine (Idle/Walk/Slam/Throw/Stagger), `travel()`-driven from the boss AI, phase-gated. Stagger-punish reads as a `Stagger` state.
- **B3 — Texture rocks/boulders/mini-golem (S–M, art):** straightforward material work; pair with B1's material language. HDR-emissive accents only if Forward+/Mobile.

---

## Milestone C — Skill & weapon FX · **Effort: M** *(renderer-gated)*

- Each effect = poolable scene = `GPUParticles3D` + `ParticleProcessMaterial` + a **Draw-Pass mesh** (3D renders nothing without one). Bursts: `one_shot`, `explosiveness=1`, trigger with **`restart()` not `emitting=true`**.
- Trails: enable BOTH `trail_enabled` on the node AND `use_particle_trails` on the mesh material; `RibbonTrailMesh` for arrows. **Forward+/Mobile only.**
- Glow: HDR emissive (`emission_energy_multiplier > 1`) + one `WorldEnvironment` glow pass.
- Arrow Storm: pool many raining arrow scenes (each with its own hit), staggered spawns, shared one-shot impact burst, ground AoE telegraph decal that fades in first.

---

## Milestone D — UI & control modes *(Mobile/PC/Controller, remap, minimap, menu)* · **Effort: L**

Built on Milestone 0's action layer. HUD = `CanvasLayer` over a `Control` root; each cluster its own scene anchored to a corner.

**Mobile HUD — Wild Rift style (landscape, thumbs-on-edges):**
- Bottom-LEFT: movement-only virtual joystick (never overlaps aim).
- Bottom-RIGHT combat cluster: large **FIRE hub** as apex, arc of special-arrow buttons (spread/volley/explosive/pierce) around it, Arrow Storm outboard, dodge/deflect nearest the resting thumb, radial cooldown sweeps. `TouchScreenButton` for true multitouch (move+aim+fire at once).
- Bow tap-vs-drag: **tap** = quick auto-aimed shot; **drag-out** from FIRE = aim with a trajectory line, release to fire (reserve for power/aimed shots).
- Boss-lock toggle + L/R target arrows near the cluster; boss portrait top-center as the lock indicator.
- TOP-LEFT minimap; TOP-RIGHT boss HP + phase pips + menu (☰); in-world HP/stamina under Erika's feet.
- Separation rule: keep utility (potion/recall) away from FIRE/ultimate (anti-fat-finger).

**PC HUD — LoL PC style (one bottom strip, center clear):**
- Bottom-CENTER ability bar (`HBoxContainer`): one slot per arrow type + Arrow Storm + utilities; each with icon, key glyph, radial cooldown.
- Bottom-LEFT portrait + HP/stamina + consumables + level/XP; Bottom-RIGHT minimap (flippable); Top-RIGHT boss HP + menu.
- Keys (remappable defaults): Q/W/E/R abilities, D/F utilities, B recall, P menu, Tab stats, Space center. Default to **quick-cast**.
- Controller variant: radial ability ring, face buttons + bumpers/triggers, right-stick soft lock-on, in-world ground indicators.

**Shared:** remap screen (listen → de-dupe → `action_*_event` → persist); **minimap** = hand-drawn Control radar (blips at `(obj.pos - player.pos)*scale`, using X/Z); menu button → pause overlay (inventory/skills/controls/stats).

---

## Milestone E — Game flow *(Login → Character Select → Boss Select)* · **Effort: M**

- One `GameState` autoload holds `selected_character`, `selected_boss`, run state across scenes.
- `change_scene_to_file()` (or `change_scene_to_packed` to preload the arena); `reload_current_scene()` to retry.
- Login = user select (Alison) → Character Select (full-screen: roster panel + `GridContainer` of portraits + `SubViewport` 3D preview + Lock In) → Boss Select (same grid) → gameplay reads both in `_ready()`.
- Optional loadout sub-screen with a "Recommended" one-click default.

---

## Milestone F — Floor-1 map rebuild · **Effort: M**

- Do last, once combat (A) + boss (B) are stable, so the arena is tuned to real movement/dodge distances and hazard placement. Mostly level art + collision + nav; reuse the minimap X/Z projection to validate sightlines.

---

## Highest-RISK items + de-risk prototypes (do these spikes first)

1. **Golem Blender deformation fix (B1) — HIGHEST.** Non-humanoid rig on a humanoid profile is the worst-documented path. *Prototype:* one clip end-to-end (Apply Transforms → BoneMap/exclude extra bones → Overwrite Axis → import → play frame-by-frame). Gate: "fixable via import" vs "must re-skin."
2. **AnimationTree migration (A1) — HIGH.** *Prototype:* throwaway Erika scene proving run-and-shoot-forward (BlendSpace2D + filtered AimLayer + Shoot OneShot) before deleting `_archer_anim`.
3. **Bow string rig (A5) + root-motion dodge (A4) — MED-HIGH.** Root-motion apply-math is community-sourced, not in official docs. *Prototype:* rig one bow (animate only the string bone, bake, export, prove 0–1 pullback in Godot); verify the root-motion math against Godot's official 3D demo before shipping.

---

## Recommended BUILD ORDER

1. **Milestone 0** — action-based input + InputDeviceManager + renderer decision.
2. **Three de-risk spikes** (golem retarget, AnimationTree run-and-shoot, bow-string + root-motion).
3. **Milestone A** — archer combat feel (A1→A5).
4. **Milestone B** — golem (B1 first, gated on its spike → B2 → B3).
5. **Milestone D** — UI/control modes + minimap + menu.
6. **Milestone C** — skill FX (after the renderer call).
7. **Milestone E** — login → character/boss select.
8. **Milestone F** — map rebuild.

**Very first concrete step:** in Project Settings → Input Map, define the named actions the game already uses informally (`move` pair, `quick_shot`, `power_shot`, `dodge`, `deflect`, `arrow_storm`, `lock_toggle`, `target_next`, `target_prev`, `menu`), bound to keyboard + joypad + (via `TouchScreenButton`) touch, then refactor the raw-`_input` handler and `_archer_anim` to read actions. That refactor is the foundation under control-modes, remap, and the AnimationTree work.
