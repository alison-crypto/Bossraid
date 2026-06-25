# Bossraid Tech Reference — Godot 4.6 + Blender (verified from docs/forums)

> Scope: Godot 4.6 stable, Blender 4.x, headless bpy via socket server.
> **[OFFICIAL]** = vendor docs · **[COMMUNITY]** = forum/issue/practice · **[VERSION-RISK]** = may shift across point releases.

---

## 1) Godot AnimationTree — archer build, entirely in code

`AnimationTree` extends `AnimationMixer`. It owns no clips: `anim_player` → an AnimationPlayer, `tree_root` → a tree of `AnimationNode` resources. Build by `.new()`-ing resources + wiring; poke at runtime only via string paths `parameters/<node>/<prop>` with `tree.get()/set()`.

> **[DOCS TRAP]** `active`, `callback_mode_process`, `advance()`, `root_motion_track` live on **AnimationMixer**, not AnimationTree. 3.x `process_callback` deprecated → `callback_mode_process`.

Key nodes: `AnimationNodeBlendTree` (`add_node`, `connect_node(input,index,output)`, default `"output"`), `AnimationNodeBlendSpace2D` (`add_blend_point(node,pos)`, `auto_triangles`, `min_space/max_space`; runtime `parameters/<n>/blend_position:Vector2`), `AnimationNodeBlend2` (`filter_enabled`, `set_filter_path(path,true)`; runtime `blend_amount:0..1`), `AnimationNodeOneShot` (FIRE via `set("parameters/<n>/request", AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)`; read `.../active`; `mix_mode` BLEND/ADD, `fadein/out_time`, `filter_enabled`), `AnimationNodeAnimation` (`.animation`), `AnimationNodeStateMachinePlayback.travel(name)` (case-sensitive).

### Canonical archer wiring (Locomotion → upper-body Aim → Shoot → Hit → output)
```gdscript
extends CharacterBody3D
@onready var ap: AnimationPlayer = $AnimationPlayer
@onready var tree: AnimationTree = $AnimationTree
func _make_clip(c: StringName) -> AnimationNodeAnimation:
    var n := AnimationNodeAnimation.new(); n.animation = c; return n
func _ready() -> void:
    var loco := AnimationNodeBlendSpace2D.new()
    loco.auto_triangles = true; loco.min_space = Vector2(-1,-1); loco.max_space = Vector2(1,1)
    loco.add_blend_point(_make_clip("idle"), Vector2(0,0))
    loco.add_blend_point(_make_clip("walk_fwd"), Vector2(0,1))
    loco.add_blend_point(_make_clip("walk_back"), Vector2(0,-1))
    loco.add_blend_point(_make_clip("strafe_left"), Vector2(-1,0))
    loco.add_blend_point(_make_clip("strafe_right"), Vector2(1,0))
    # + 4 diagonals at ±0.7
    var aim := AnimationNodeBlend2.new(); aim.filter_enabled = true
    for b in ["Spine","Spine1","Chest","Neck","Head","Shoulder_L","UpperArm_L","LowerArm_L","Hand_L","Shoulder_R","UpperArm_R","LowerArm_R","Hand_R"]:
        aim.set_filter_path(NodePath("Armature/Skeleton3D:%s" % b), true)
    var shoot := AnimationNodeOneShot.new(); shoot.filter_enabled = true
    shoot.fadein_time = 0.05; shoot.fadeout_time = 0.20
    for b in ["Spine","Chest","Shoulder_R","UpperArm_R","LowerArm_R","Hand_R","Shoulder_L","Hand_L"]:
        shoot.set_filter_path(NodePath("Armature/Skeleton3D:%s" % b), true)
    var hit := AnimationNodeOneShot.new(); hit.fadein_time = 0.05; hit.fadeout_time = 0.25
    var bt := AnimationNodeBlendTree.new()
    bt.add_node("Locomotion", loco); bt.add_node("AimPose", _make_clip("aim_pose")); bt.add_node("AimLayer", aim)
    bt.add_node("ShootClip", _make_clip("shoot")); bt.add_node("Shoot", shoot)
    bt.add_node("HitClip", _make_clip("hit_react")); bt.add_node("Hit", hit)
    bt.connect_node("AimLayer",0,"Locomotion"); bt.connect_node("AimLayer",1,"AimPose")
    bt.connect_node("Shoot",0,"AimLayer"); bt.connect_node("Shoot",1,"ShootClip")
    bt.connect_node("Hit",0,"Shoot"); bt.connect_node("Hit",1,"HitClip")
    bt.connect_node("output",0,"Hit")
    tree.tree_root = bt; tree.anim_player = tree.get_path_to(ap)
    tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS
    tree.active = true   # LAST
func _physics_process(_d):
    tree.set("parameters/Locomotion/blend_position", Vector2(Input.get_axis("move_left","move_right"), Input.get_axis("move_back","move_fwd")))
    tree.set("parameters/AimLayer/blend_amount", 1.0 if Input.is_action_pressed("aim") else 0.0)
    if Input.is_action_just_pressed("fire"):
        tree.set("parameters/Shoot/request", AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)
```
**Pitfalls:** set `active=true` LAST (grab playback handles after); `travel()` no-ops on case-mismatch / no connecting transition / non-looping state (use OneShots for shoot/hit, not states); filter paths are exact track paths + need `filter_enabled`; OneShot `request` consumed in one frame (fire once, poll `.../active`); use PHYSICS callback.
**For Bossraid:** delete the hand-rolled `_archer_anim`; one `_ready()` builds the whole rig; dodge = root-motion clip through the same tree (§3).

---

## 2) Mixamo import + retarget (BoneMap)

`BoneMap` (`.profile`, `set/get_skeleton_bone_name`), `SkeletonProfileHumanoid` (56 bones), `RetargetModifier3D` (4.3+, non-destructive runtime alt to baking rests).

Import-dock Retarget: **Bone Renamer→Rename Bones** (strip `mixamorig:`); **Rest Fixer→Apply Node Transform** (bakes the ~0.01 FBX scale), **Overwrite Axis** (unifies rests so clips are shareable — *destructive*, official warns it can wreck a meaningful external rest), **Fix Silhouette**, **Normalize Position Tracks**.

**Recipe:** import character As Scene; clip FBX As Animation Library. Assign BoneMap(Humanoid) to Skeleton3D; **hand-verify every bone** (green = assigned, not correct). Enable Rename Bones + Apply Node Transform + Overwrite Axis; save BoneMap `.tres`; apply the SAME map+settings to character AND every clip. Non-humanoid extras: don't enable Remove Unmapped Bones.
**Pitfalls:** cleanest scale fix = export glTF from Blender with transforms applied (scale 1.0); mismatched Rest-Fixer settings between model+clips → twisted anim; use ufbx path not legacy FBX2glTF.

---

## 3) IK aiming + root motion

**Aim a bone — `LookAtModifier3D` (4.4+, in 4.6):** add as a **direct child of Skeleton3D**; rotates ONE bone (not a chain). Props: `bone_name`, `forward_axis` (PLUS_X..MINUS_Z; default PLUS_Z), `primary_rotation_axis`, `target_node` (a `Marker3D`), `use_angle_limitation`, `influence` (0..1, <1 to blend). Mostly zero-script:
```gdscript
# Skeleton3D > LookAtModifier3D: bone_name="mixamorig_RightHand", forward_axis=PLUS_Z, target_node="../AimTarget"
func _process(_d): $AimTarget.global_position = locked_enemy.global_position  # bone follows
```
Arrow fires STRAIGHT from a fixed muzzle Marker3D: `dir=(target-muzzle).normalized(); vel=dir*speed; arrow.look_at(target)`. (`SkeletonIK3D` for a true two-bone *reach* is DEPRECATED but present in 4.6.)

**Root motion → CharacterBody3D** (set `root_motion_track`, PHYSICS callback):
```gdscript
func _physics_process(delta):
    set_quaternion(get_quaternion() * tree.get_root_motion_rotation())
    var rm := tree.get_root_motion_position()
    var acc := tree.get_root_motion_rotation_accumulator()
    var hv := (acc.inverse() * get_quaternion()) * rm / delta   # m/s, body-relative
    velocity.x = hv.x; velocity.z = hv.z
    velocity.y = 0.0 if is_on_floor() else velocity.y - GRAVITY*delta
    move_and_slide()
```
**Pitfalls:** LookAtModifier overrides (not blends) — lower influence; wrong `forward_axis` = points wrong way (Mixamo vs Blender bake differ); divide root-motion pos by delta; the `acc.inverse()*quat` correction prevents sideways drift; `RootMotionView` is editor-only.
**For Bossraid:** bow-hand aim = zero-script LookAtModifier on the locked-target Marker3D (fixes "shoots sideways", arrows straight); dodge = root-motion clip (kills the slide).

---

## 4) Web renderer — HARD CONSTRAINT (corrects the earlier plan)

**Godot's web platform can ONLY use the Compatibility (WebGL 2.0) renderer.** Forward+ and Mobile are RenderingDevice (Vulkan/D3D12/Metal) → **no web backend**; selecting them changes nothing on web. **WebGPU is not supported by Godot** in any official build (the webgpu fork is community/unmerged). So we **cannot** ship Forward+/Mobile on phones — the earlier "switch to Forward+/Mobile for FX" is not possible.

**Particle/FX reality on web (Compatibility):**
| Feature | Web |
|---|---|
| CPUParticles2D/3D, GPUParticles2D | ✅ |
| GPUParticles3D **trails** (RibbonTrailMesh), `emit_particle()` | ❌ Forward+/Mobile only |
| WorldEnvironment **glow/bloom** | ❌ not in the OpenGL backend |

**So skill FX must be authored as additive 2D sprites + CPUParticles + a fake-glow shader — not 3D particle trails/bloom.** Lock the renderer to Compatibility; test in real iOS Safari + Android Chrome (both WebGL2).

---

## 5) Blender rest-pose fix + RIGID rock skinning (golem)

**Fix a degenerate rest WITHOUT losing weights — order matters (bake mesh FIRST):**
```python
# (pose the armature into the wanted rest first)
bpy.ops.object.modifier_apply(modifier="Armature")   # bake deform, KEEPS vertex groups (mesh active, OBJECT mode)
# armature active, POSE mode:
bpy.ops.pose.armature_apply(selected=False)          # new rest = current pose
# OBJECT mode:
mod = mesh.modifiers.new("Armature","ARMATURE"); mod.object = arm   # re-add
```
**RIGID skinning of a decimated rock (binary 1.0 weights — the part my first attempt missed):** smooth auto-weights (`ARMATURE_AUTO` / `weight_from_bones AUTOMATIC`) bleed across chunk seams → the blob. Instead: parent with **empty groups** (`parent_set(type='ARMATURE_NAME')`), then per chunk in Edit mode select its verts, set the bone's group active, `tool_settings.vertex_group_weight=1.0`, `vertex_group_assign()`. Or `data_transfer(VGROUP_WEIGHTS)` from a hi-res source then clean/re-flood to binary.
**Pitfalls:** apply pose-as-rest WITHOUT baking first = distorted mesh; applying a modifier keeps weights (only the modifier is lost → re-add); auto-heat fails on decimated/non-manifold topology; ops are mode-sensitive (§7).
**For Bossraid:** the golem IS fixable — rest-pose repair + **rigid per-chunk weights** (not the smooth auto-weights I used). Uncertain on a decimated sculpt (needs separable chunks), so it's a later proper attempt; Pumpkin is the clean now-boss.

---

## 6) Bow string-pull rig + glTF export for Godot

Rig: deform bones (limb upper/lower per side, riser, string, nock) + control `draw_ctrl`; **IK** on limb tips (Chain Length 2 to flex), **Limit Distance** (On Surface) on the nock to keep the string taut to the draw hand. Animate rest→full-draw→release.
> **[CRITICAL]** glTF exports **no constraints** — you MUST **pre-bake**. `bpy.ops.nla.bake(..., visual_keying=True, clear_constraints=True, bake_types={'POSE'})` on a **duplicate** (destructive). Then export glb: +Y Up, Apply Modifiers (+Triangulate), **Use Rest Position Armature ON**, **Export Deformation Bones only ON**, **Always Sample Animations ON, Sampling Rate 1**.
**Pitfalls:** no pre-bake → draw/string don't move in Godot; keep Use-Rest-Position ON (else current frame = rest → broken bind); apply all transforms first; def-bones-only drops control bones only AFTER baking.
**For Bossraid:** the bow becomes a normal AnimationPlayer clip (0→1 draw) triggered on the Shoot OneShot.

---

## 7) Headless bpy context-override patterns

Many `bpy.ops` read `bpy.context` (window/screen/area/region, active_object, selected_objects, mode). Use `bpy.context.temp_override(window=, screen=, area=, region=, active_object=, selected_objects=)`. **[CRITICAL]** `wm.read_homefile()`/`open_mainfile()` destroy+recreate windowing → cached handles dangle (`"Context object has no attribute object"`, `"Expected a Screen not a Screen"`). **Re-fetch the UI tuple after every file load.** Keep `region∈area∈screen∈window`.

Robust helper:
```python
def get_view3d_context(area_type='VIEW_3D', region_type='WINDOW'):
    wm=bpy.context.window_manager
    for win in getattr(wm,'windows',[]):
        scr=win.screen
        if not scr: continue
        for area in ([a for a in scr.areas if a.type==area_type] or list(scr.areas)):
            regs=[r for r in area.regions if r.type==region_type]
            return win, area, (regs[0] if regs else (area.regions[0] if area.regions else None))
    return (list(wm.windows)[0] if wm.windows else None), None, None

def run_op(op, *, active=None, selected=None, need_ui=True, extra=None, **kw):
    vl=bpy.context.view_layer
    if active is not None or selected is not None:
        for o in vl.objects: o.select_set(False)
        for o in (selected or []): o.select_set(True)
        if active: active.select_set(True); vl.objects.active=active
    ovr=bpy.context.copy()
    if active is not None: ovr['active_object']=active; ovr['object']=active
    if selected is not None: ovr['selected_objects']=list(selected); ovr['selected_editable_objects']=list(selected)
    if extra: ovr.update(extra)
    if need_ui:
        w,a,r=get_view3d_context()
        if w: ovr['window']=w; ovr['screen']=w.screen
        if a: ovr['area']=a
        if r: ovr['region']=r
    with bpy.context.temp_override(**ovr):
        return op(**kw)
```
Per-op override keys: `mode_set`→active/object(+window); `modifier_apply`→active/object/selected(OBJECT mode); `parent_set(ARMATURE_AUTO)`→active=armature, selected=[meshes,armature]; `pose.armature_apply`→active=armature(+POSE first); `import_scene.gltf`→scene/view_layer; `render.render`→window (or set `scene.render.*` then `render(write_still=True)`).
Prefer `bpy.data` (no context): `col.objects.link`, `obj.modifiers.new`, `child.parent=p; child.matrix_parent_inverse=p.matrix_world.inverted()`, `view_layer.objects.active=`, `obj.select_set()`. Call `view_layer.update()` before reading `matrix_world`/evaluated mesh.
