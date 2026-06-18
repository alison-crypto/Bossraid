# Dual-wield combat — implementation plan

Owner's design: per-hand weapon/shield/bow slots; **handedness is emergent from
stats**, not classes. A weapon can be one-handed only if `STR >= str_req`;
otherwise it's forced two-handed. A lone weapon (empty off-hand) is gripped
two-handed for power. Enough STR → dual-wield two heavy weapons as one-handers.

Inputs: **LMB = left-hand light, RMB = right-hand light, Alt+LMB / Alt+RMB =
left/right heavy.** Kick (F), block (Q), dodge (Space) unchanged.

## Done (foundation — safe, in `main`, game runnable)

- `GameState.weapons[]` gained `weight`, `str_req`, `type`, `mesh` (real model in
  `models/weapons/`). Added `shields[]` and per-hand `hands = {right, left}`.
- `GameState.resolve_grip(str)` → `{right, left: "one_handed"|"two_handed"|
  "empty", two_handed: bool, dual: bool}`. The whole stat-gated rule set.
- Real weapon meshes converted to glb in `models/weapons/` (sword1/2, dagger,
  axe_small/double, bow, shield, mace, hammer, staff, arrows). Untextured — the
  pack's textures are in `golem_work/new_assets/weapons_fbx/` for a later pass.
- All gear owned (`owned_*` = every index) so switching works in-game.

## Remaining phases (need visual iteration — do with the owner present)

1. **Input remap (InputMap actions).** Replace hard-coded mouse-button checks in
   `Main._unhandled_input` / combat with actions: `attack_left`, `attack_right`,
   `heavy_left`, `heavy_right` (LMB/RMB + Alt modifier). Enables remapping later.
2. **Per-hand attack routing.** `_do_melee`/`_do_heavy` take a `hand` arg; read
   `GameState.hands[hand]` → that weapon's clip + damage. Damage per hand =
   `base + weapon_dmg[hand]`, heavy `× (heavy_mult + ...)`. Feed `weight` into the
   force/mass term and swing-speed. Two-handed grip uses the 2H clip set + power
   bonus; dual uses 1H clips.
3. **AnimationTree + upper-body bone-mask layering.** The big one. Replace the
   hand-rolled `_play()` swaps with `AnimationTree` + `AnimationNodeStateMachine`
   (idle ↔ run) and an **upper-body bone-mask** layer so each arm plays its own
   attack independently/simultaneously. Clips: `sword1h_*`, `sword2h_*`,
   `dagger_*`, `bow_*` (already in `models/anim/`). Left-hand attacks may need
   mirrored clips (generate in Blender) until the mask layering is solid.
4. **Weapon visuals.** Attach the `mesh` from `GameState.weapons`/`shields` to the
   correct hand bone via `BoneAttachment3D` (replace placeholder boxes in
   `_attach_weapon`). Needs per-weapon offset/rotation/scale tuning (visual).
5. **Inventory UI (`GameMenu`).** Per-hand equip/unequip: click a weapon → choose
   hand; shield restricted to left; 2H auto-fills both; show resolved grip +
   per-hand damage from `resolve_grip`.

## Notes
- Keep it runnable + test (F5) after each phase. Headless smoke test:
  `godot --headless --path godot res://Main.tscn --quit-after 200`.
- Warrior character (Meshy) is staged at `golem_work/Warrior.glb` (468k tris,
  static) — needs decimate→Mixamo→glb before it's a playable second character.
