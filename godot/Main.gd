# Bossraid — Godot Floor-1 test scene (built in code so the .tscn stays trivial).
#
# Open arena, third-person animated player, a training dummy, and a Floor-1 boss
# (Stone Golem) that chases and does telegraphed ground slams. Player + boss have
# HP and a HUD. See CLAUDE.md for the roadmap.
#
# Controls: WASD move, mouse look (click to capture / Esc release), Shift sprint,
# Space jump, Left-click melee, Right-click ranged.

class_name Main
extends Node3D

const WALK := 4.5
const SPRINT := 8.0
const JUMP := 5.0
const MOUSE_SENS := 0.0025
const CHARACTER := "res://models/Soldier.glb"
const MODEL_FACE_FLIP := true # set false if the character faces backward
const MELEE_RANGE := 2.6
# Held-sword placement relative to the right-hand bone. If the blade points the
# wrong way, tune these two (EULER is degrees) — the correct values are
# rig-dependent. Default: stand the blade up out of the fist.
const WEAPON_EULER := Vector3(-90, 0, 0)
const WEAPON_OFFSET := Vector3(0, 0.55, 0)
# Melee pacing: the swing clip plays at ATTACK_SPEED (higher = snappier); you
# can't start another basic attack until it finishes, and the hit lands when the
# swing animation COMPLETES — so it's telegraphed (dodge/block in time) and a
# swing cancelled before the end deals no damage.
const ATTACK_SPEED := 1.4
# Dodge roll (Space): a quick burst in the move/facing direction with i-frames.
const DODGE_SPEED := 11.0
const DODGE_TIME := 0.45
const DODGE_IFRAMES := 0.5
# Heavy attack (right-click): slower, hits harder. Block (hold Q): cuts incoming
# damage; a hit in the first PARRY_WINDOW of a block is fully parried. Kick (F):
# quick poke + knockback. Aim (hold middle-mouse): pulls the camera in to shoot.
const HEAVY_SPEED := 1.0
const BLOCK_REDUCTION := 0.2 # fraction of damage still taken while blocking
const PARRY_WINDOW := 0.3
const KICK_KNOCKBACK := 6.0

# --- RPG stats / damage (owner's physics formulas) ------------------------
# Melee force F = mass*accel, mass = STR, accel = DEX*0.01  ->  base = STR*DEX*0.01.
#   Light  = base + weapon_damage
#   Heavy  = (base + weapon_damage) * (1.5 + 0.01*floor(STR/10))
#   Kick   = base + boots_damage   (ignores weapon; uses boots/equipment)
# DEX also shaves DEX_ANIM_PER_PT seconds off each swing. HP = CON*STR*HEALTH_K.
# DEF (equipment) subtracts directly from incoming damage.
const ACCEL_PER_DEX := 0.01    # acceleration per DEX point (a = DEX*0.01)
const HEAVY_BASE_MULT := 1.5   # heavy multiplier base
const HEAVY_STR_STEP := 0.01   # +this per full 10 STR
const HEALTH_K := 1.0          # Health = CON * STR * HEALTH_K
const DEX_ANIM_PER_PT := 0.01  # seconds removed from a swing per DEX point
# Ranged bow (kinetic-energy arrow): mass from STR, launch speed from DEX, then
# gravity + quadratic drag (drag/mass, so heavier arrows fly farther). Impact
# damage = 0.5*mass*v^2 + bow_damage. Range emerges from v0 and mass.
const AMMO_MASS := 0.1
const MASS_PER_STR := 0.01
const BOW_BASE_V := 10.0
const V_PER_DEX := 0.7
const ARROW_DRAG := 0.0006
const RANGED_CD := 0.4

const PLAYER_MAX := 100.0
const BOSS_MAX := 400.0
const SLAM_RADIUS := 3.6

var player: CharacterBody3D
var model: Node3D
var cam_yaw: Node3D
var cam_pitch: Node3D
var cam: Camera3D
var anim: AnimationPlayer
var yaw := 0.0
var pitch := -0.2
var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)
var cur_anim := ""
var idle_anim := ""
var run_anim := ""
var attack_anim := ""   # first combo swing (outward slash)
var attack_anim2 := ""  # second combo swing (inward slash)
var heavy_anim := ""
var kick_anim := ""
var block_anim := ""
var dodge_anim := ""
var combo_i := 0
var attacking := false
var attack_kind := "light" # "light" | "heavy" | "kick" — drives the damage formula
var dodging := false
var dodge_t := 0.0
var dodge_dir := Vector3.FORWARD
var blocking := false
var block_t := 0.0      # seconds the current block has been held (for parry window)
var aiming := false
var cam_rest := Vector3.ZERO
var face_flip := true
var skel: Skeleton3D
var weapon: MeshInstance3D
var weapon_attach: BoneAttachment3D
var weapon_scaled := false
var weapon_offset := WEAPON_OFFSET
var has_weapon := true # false for characters with a built-in weapon (e.g. Maria)
var model_facing := 0.0

var player_str := 10
var player_dex := 10
var player_con := 10
var player_def := 0 # total = base + equipped armor; subtracts from incoming damage
var player_boots_dmg := 0 # total = base + equipped boots; flat damage on the kick
var player_def_base := 0 # character's innate defence (before equipment)
var player_boots_base := 0 # character's innate kick damage (before equipment)
# Skill-driven combat tunables: base = the consts above; rebuilt from
# GameState.skills ranks by _apply_skill_effects(). Formulas read these vars.
var heavy_mult := HEAVY_BASE_MULT
var kick_scale := 1.0
var kick_knock := KICK_KNOCKBACK
var dodge_iframes := DODGE_IFRAMES
var block_reduction := BLOCK_REDUCTION
var parry_window := PARRY_WINDOW
var ranged_v_bonus := 0.0
var player_max := PLAYER_MAX
var player_hp := PLAYER_MAX
var player_invuln := 0.0
var player_dead := false
var player_spawn := Vector3(0, 0, 6)

# Dummy
var dummy_pos := Vector3(6, 0, -2)
const DUMMY_MAX := 600.0
var dummy_hp := DUMMY_MAX
var dummy_mat: StandardMaterial3D
var dummy_flash := 0.0

# Boss
var boss_root: Node3D
var boss_model: Node3D
var boss_anim: AnimationPlayer
var boss_idle := ""
var boss_walk := ""
var boss_attack := ""
var boss_clip := ""
var boss_mat: StandardMaterial3D
var boss_pos := Vector3(0, 0, -18)
var boss_hp := BOSS_MAX
var boss_state := "idle" # idle | windup | recover
var boss_t := 0.0
var boss_cd := 3.0
var boss_flash := 0.0
var boss_dead := false
var slam_ring: MeshInstance3D
var slam_mat: StandardMaterial3D
var slam_target := Vector3.ZERO

# Attacks
var melee_cd := 0.0
var locked_clip := ""    # the clip the current swing is locked on (hit lands when it finishes)
var anim_lock_t := 0.0   # safety timeout: force-release the swing lock if the finish never fires
var ranged_cd := 0.0
var projectiles: Array = []

# HUD
var hud_player_fill: ColorRect
var hud_boss_fill: ColorRect
var hud_banner: Label
var hud_weapon: Label
var hud_gear: Label
var hud_hint: Label
var menu: GameMenu


func _ready() -> void:
	print("Bossraid build: facing-v3 (idle-facing + per-rig flip + vertical hips)")
	_build_environment()
	_build_ground()
	_build_dummy(dummy_pos)
	_build_boss(boss_pos)
	_build_player(player_spawn)
	_build_hud()
	menu = GameMenu.new()
	menu.main = self
	add_child(menu)


func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.6
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(deg_to_rad(-55), deg_to_rad(40), 0)
	sun.light_energy = 1.3
	sun.shadow_enabled = true
	add_child(sun)


func _build_ground() -> void:
	var body := StaticBody3D.new()
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(200, 200)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.42, 0.49, 0.32)
	plane.material = mat
	mesh.mesh = plane
	body.add_child(mesh)
	var col := CollisionShape3D.new()
	col.shape = WorldBoundaryShape3D.new()
	body.add_child(col)
	add_child(body)


func _build_dummy(pos: Vector3) -> void:
	var d := Node3D.new()
	var dm := MeshInstance3D.new()
	var caps := CapsuleMesh.new()
	caps.radius = 0.42
	caps.height = 1.9
	dummy_mat = StandardMaterial3D.new()
	dummy_mat.albedo_color = Color(0.81, 0.7, 0.48)
	caps.material = dummy_mat
	dm.mesh = caps
	dm.position = Vector3(0, 1.0, 0)
	d.add_child(dm)
	d.position = pos
	add_child(d)


func _build_boss(pos: Vector3) -> void:
	boss_root = Node3D.new()
	add_child(boss_root)
	boss_root.position = pos
	var scene := load("res://models/Pumpkin.glb")
	if scene:
		boss_model = scene.instantiate()
		boss_root.add_child(boss_model)
		# Scale to ~3.4 m (a hulking boss) and stand its feet on the ground.
		AnimUtil.fit_height(boss_model, 3.4)
		# Same converted-axis model as the heroes, so it faces movement with no
		# flip; boss_root already aims it at the player (see _update_boss).
		boss_mat = null # multi-material model: skip the tint flash
		# Idle / walk (chase) / slam-attack clips, retargeted onto the boss rig.
		boss_anim = AnimUtil.find_anim_player(boss_model)
		var bsk := AnimUtil.find_skeleton(boss_model)
		if boss_anim and bsk:
			boss_idle = AnimUtil.merge(boss_anim, bsk, "res://models/anim/idle.glb", "Idle")
			boss_walk = AnimUtil.merge(boss_anim, bsk, "res://models/anim/run.glb", "Walk")
			# In-place overhead smash: all arm/spine rotation, so it reads fully
			# after retarget (a leaping slam loses its punch when root motion is
			# stripped for facing/grounding).
			boss_attack = AnimUtil.merge(boss_anim, bsk, "res://models/anim/smash.glb", "Slam")
			_set_anim_loop(boss_anim, boss_idle, true)
			_set_anim_loop(boss_anim, boss_walk, true)
			_set_anim_loop(boss_anim, boss_attack, false)
			_boss_play(boss_idle)
	else:
		var body := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = 1.5
		cyl.bottom_radius = 2.0
		cyl.height = 4.0
		cyl.radial_segments = 6
		boss_mat = StandardMaterial3D.new()
		boss_mat.albedo_color = Color(0.54, 0.42, 0.33)
		cyl.material = boss_mat
		body.mesh = cyl
		body.position = Vector3(0, 2.0, 0)
		boss_root.add_child(body)

	slam_ring = MeshInstance3D.new()
	var ring := CylinderMesh.new()
	ring.top_radius = SLAM_RADIUS
	ring.bottom_radius = SLAM_RADIUS
	ring.height = 0.08
	ring.radial_segments = 32
	slam_mat = StandardMaterial3D.new()
	slam_mat.albedo_color = Color(1, 0.2, 0.15, 0.4)
	slam_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	slam_mat.emission_enabled = true
	slam_mat.emission = Color(1, 0.2, 0.1)
	ring.material = slam_mat
	slam_ring.mesh = ring
	slam_ring.visible = false
	add_child(slam_ring)


func _build_player(pos: Vector3) -> void:
	player = CharacterBody3D.new()
	player.position = pos
	add_child(player)

	var col := CollisionShape3D.new()
	var shape := CapsuleShape3D.new()
	shape.radius = 0.35
	shape.height = 1.7
	col.shape = shape
	col.position = Vector3(0, 0.85, 0)
	player.add_child(col)

	var entry: Dictionary = GameState.current() # autoload; defaults to first character
	face_flip = entry.get("flip", true)
	has_weapon = entry.get("weapon", true)
	player_str = int(entry.get("str", 10))
	player_dex = int(entry.get("dex", 10))
	player_con = int(entry.get("con", 10))
	player_def_base = int(entry.get("def", 0))
	player_boots_base = int(entry.get("boots", 0))
	_apply_equipment() # sets player_def / player_boots_dmg from base + equipped gear
	_apply_skill_effects() # sets combat tunables from skill ranks
	player_max = max(1.0, float(player_con) * float(player_str) * HEALTH_K)
	player_hp = player_max
	print("Bossraid stats: STR=%d DEX=%d CON=%d DEF=%d (%s) boots=%s -> HP=%.0f force=%.2f (light w/50dmg=%.0f)" % [player_str, player_dex, player_con, player_def, String(GameState.armor_data().get("name", "Cloth")), String(GameState.boots_data().get("name", "Bare Feet")), player_max, _force_base(), _force_base() + 50.0])
	var scene := load(entry.get("file", CHARACTER))
	if scene:
		model = scene.instantiate()
		player.add_child(model)
		_setup_animation()
		_attach_weapon()
	else:
		var fb := MeshInstance3D.new()
		var caps := CapsuleMesh.new()
		caps.radius = 0.35
		caps.height = 1.7
		fb.mesh = caps
		fb.position = Vector3(0, 0.85, 0)
		player.add_child(fb)

	cam_yaw = Node3D.new()
	cam_yaw.position = Vector3(0, 1.55, 0)
	player.add_child(cam_yaw)
	cam_pitch = Node3D.new()
	cam_yaw.add_child(cam_pitch)
	cam = Camera3D.new()
	cam.position = Vector3(0.5, 0, 4.5)
	cam_rest = cam.position
	cam_pitch.add_child(cam)

	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)

	# Player HP (top-left).
	root.add_child(_rect(Color(0, 0, 0, 0.5), Vector2(24, 24), Vector2(300, 24)))
	hud_player_fill = _rect(Color(0.36, 0.85, 0.42), Vector2(26, 26), Vector2(296, 20))
	root.add_child(hud_player_fill)

	# Boss bar (top-center, 1280-wide design).
	var name_label := Label.new()
	name_label.text = "PUMPKIN GOLEM"
	name_label.position = Vector2(340, 18)
	name_label.add_theme_font_size_override("font_size", 18)
	root.add_child(name_label)
	root.add_child(_rect(Color(0, 0, 0, 0.55), Vector2(340, 42), Vector2(600, 18)))
	hud_boss_fill = _rect(Color(0.91, 0.33, 0.31), Vector2(342, 44), Vector2(596, 14))
	root.add_child(hud_boss_fill)

	hud_banner = Label.new()
	hud_banner.set_anchors_preset(Control.PRESET_CENTER)
	hud_banner.add_theme_font_size_override("font_size", 48)
	hud_banner.modulate = Color(1, 1, 1, 0)
	root.add_child(hud_banner)

	# Weapon name (bottom-left). [Tab] cycles, [1-6] pick directly.
	hud_weapon = Label.new()
	hud_weapon.position = Vector2(24, 660)
	hud_weapon.add_theme_font_size_override("font_size", 18)
	root.add_child(hud_weapon)
	_update_weapon_hud()

	# Armor / boots (bottom-left, above the weapon line). [R] / [T] cycle.
	hud_gear = Label.new()
	hud_gear.position = Vector2(24, 636)
	hud_gear.add_theme_font_size_override("font_size", 16)
	root.add_child(hud_gear)
	_update_gear_hud()

	# Window hint (bottom-left, above the gear line).
	hud_hint = Label.new()
	hud_hint.position = Vector2(24, 612)
	hud_hint.add_theme_font_size_override("font_size", 16)
	hud_hint.modulate = Color(0.8, 0.85, 0.95)
	hud_hint.text = "[C] Stats   [I] Inventory   [K] Skills"
	root.add_child(hud_hint)


func _rect(c: Color, pos: Vector2, sz: Vector2) -> ColorRect:
	var r := ColorRect.new()
	r.color = c
	r.position = pos
	r.size = sz
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


func _setup_animation() -> void:
	anim = model.find_child("AnimationPlayer", true, false)
	if anim == null:
		var aps := model.find_children("*", "AnimationPlayer", true, false)
		if aps.size() > 0:
			anim = aps[0]
	if anim == null:
		push_warning("Bossraid: no AnimationPlayer found on character")
		return
	var list := anim.get_animation_list()
	print("Bossraid: character animations = ", list)
	idle_anim = _match_anim(list, ["idle"])
	run_anim = _match_anim(list, ["run", "jog", "walk"])
	attack_anim = _match_anim(list, ["slash", "attack", "punch", "swing", "melee", "stab"])
	# Merge external Mixamo clips, retargeted onto this hero's skeleton. We prefer
	# the character's own idle/run when it has them (e.g. Soldier), and fall back
	# to the merged clips for heroes that ship with only a T-pose (Vanguard/Erika/
	# Maria). The sword Slash always comes from the merged clip so everyone swings.
	skel = AnimUtil.find_skeleton(model)
	if skel:
		var m_idle := AnimUtil.merge(anim, skel, "res://models/anim/idle.glb", "FightIdle")
		var m_run := AnimUtil.merge(anim, skel, "res://models/anim/run.glb", "RunSword")
		var m_slash := AnimUtil.merge(anim, skel, "res://models/anim/slash.glb", "Slash")
		var m_slash2 := AnimUtil.merge(anim, skel, "res://models/anim/inslash.glb", "SlashB")
		heavy_anim = AnimUtil.merge(anim, skel, "res://models/anim/smash.glb", "Heavy")
		kick_anim = AnimUtil.merge(anim, skel, "res://models/anim/kick.glb", "Kick")
		block_anim = AnimUtil.merge(anim, skel, "res://models/anim/block.glb", "Block")
		dodge_anim = AnimUtil.merge(anim, skel, "res://models/anim/dodge.glb", "Dodge")
		# Weapon-specific attack clips (used by the weapon table in GameState).
		AnimUtil.merge(anim, skel, "res://models/anim/stab.glb", "Stab")
		AnimUtil.merge(anim, skel, "res://models/anim/bowshoot.glb", "Bow")
		if idle_anim == "" and m_idle != "":
			idle_anim = m_idle
		if run_anim == "" and m_run != "":
			run_anim = m_run
		if m_slash != "":
			attack_anim = m_slash
		attack_anim2 = m_slash2 if m_slash2 != "" else attack_anim
		print("Bossraid: merged idle=", m_idle, " run=", m_run, " slash=", m_slash, " slashB=", m_slash2, " dodge=", dodge_anim)
	if idle_anim == "" and list.size() > 0:
		idle_anim = list[0]
	if run_anim == "":
		run_anim = idle_anim
	print("Bossraid: using idle=", idle_anim, " run=", run_anim, " attack=", attack_anim)
	# Imported glTF clips don't loop by default — loop only locomotion.
	_set_loop(idle_anim, true)
	_set_loop(run_anim, true)
	_set_loop(attack_anim, false) # one-shot
	_set_loop(attack_anim2, false)
	_set_loop(heavy_anim, false)
	_set_loop(kick_anim, false)
	_set_loop(block_anim, true) # held
	_set_loop(dodge_anim, false)
	_set_loop("Stab", false)
	_set_loop("Bow", false)
	anim.animation_finished.connect(_on_anim_finished)
	if idle_anim != "":
		anim.play(idle_anim)
		cur_anim = idle_anim


func _set_loop(anim_name: String, on: bool) -> void:
	_set_anim_loop(anim, anim_name, on)


func _set_anim_loop(ap: AnimationPlayer, anim_name: String, on: bool) -> void:
	if ap == null or anim_name == "" or not ap.has_animation(anim_name):
		return
	var a := ap.get_animation(anim_name)
	if a:
		a.loop_mode = Animation.LOOP_LINEAR if on else Animation.LOOP_NONE


func _boss_play(anim_name: String) -> void:
	if boss_anim and anim_name != "" and boss_clip != anim_name and boss_anim.has_animation(anim_name):
		boss_anim.play(anim_name, 0.2)
		boss_clip = anim_name


func _on_anim_finished(finished_name) -> void:
	# The hit lands exactly when the swing animation completes — so it's
	# telegraphed (dodge/block have the whole swing to react) and a swing
	# cancelled before the end (locked_clip cleared) never lands.
	if locked_clip != "" and String(finished_name) == locked_clip:
		_apply_melee_hit()
		attacking = false
		locked_clip = ""
		anim_lock_t = 0.0
		cur_anim = "" # let _physics_process resume idle/run


func _match_anim(list, keys) -> String:
	for n in list:
		var ln := String(n).to_lower()
		for k in keys:
			if ln.find(k) != -1:
				return n
	return ""


func _attach_weapon() -> void:
	if not has_weapon:
		return # character already carries its own weapon mesh
	if skel == null:
		skel = AnimUtil.find_skeleton(model)
	if skel == null:
		return
	var hand := -1
	for i in skel.get_bone_count():
		var clean := ""
		for ch in skel.get_bone_name(i).to_lower():
			if ch >= "a" and ch <= "z":
				clean += ch
		if clean.ends_with("righthand") or clean.ends_with("handr"):
			hand = i
			break
	if hand < 0:
		return
	weapon_attach = BoneAttachment3D.new()
	weapon_attach.bone_idx = hand
	skel.add_child(weapon_attach)
	_build_weapon_mesh()


# (Re)build the held weapon mesh from the current weapon's data. A placeholder
# box of len x thick until real weapon models are added.
func _build_weapon_mesh() -> void:
	if weapon_attach == null:
		return
	if weapon and is_instance_valid(weapon):
		weapon.queue_free()
	var w: Dictionary = GameState.weapon_data()
	var length: float = w.get("len", 1.1)
	var thick: float = w.get("thick", 0.06)
	weapon = MeshInstance3D.new()
	var blade := BoxMesh.new()
	blade.size = Vector3(thick, thick, length)
	var bm := StandardMaterial3D.new()
	bm.albedo_color = w.get("color", Color(0.85, 0.9, 1.0))
	bm.metallic = 0.6
	blade.material = bm
	weapon.mesh = blade
	weapon.rotation_degrees = WEAPON_EULER
	weapon_attach.add_child(weapon)
	# Grip at the hand, blade extending out: offset half the length up the stood-up blade.
	weapon_offset = Vector3(0, length * 0.5, 0)
	weapon_scaled = false # re-apply the hand-bone counter-scale next frame


# Switch the active weapon: rebuild the held mesh, reset the combo, update HUD.
func _equip_weapon(i: int) -> void:
	GameState.weapon = clampi(i, 0, GameState.weapons.size() - 1)
	combo_i = 0
	if has_weapon:
		_build_weapon_mesh()
	_update_weapon_hud()


# Switch armor: recompute defence (base + equipped) and refresh the HUD.
func _equip_armor(i: int) -> void:
	GameState.armor = clampi(i, 0, GameState.armors.size() - 1)
	_apply_equipment()


# Switch boots: recompute kick damage (base + equipped) and refresh the HUD.
func _equip_boots(i: int) -> void:
	GameState.boot = clampi(i, 0, GameState.boots.size() - 1)
	_apply_equipment()


# Resolve equipped gear into the live stats the damage formulas read.
func _apply_equipment() -> void:
	player_def = player_def_base + int(GameState.armor_data().get("def", 0))
	player_boots_dmg = player_boots_base + int(GameState.boots_data().get("kick", 0))
	_update_gear_hud()


# --- Menu-driven commands (equip gating, stat edit, consumables, skills) -----
# Equip only if the item is owned (inventory gating). Refresh the menu if open.
func equip_weapon_owned(i: int) -> void:
	if GameState.owns_weapon(i):
		_equip_weapon(i)
		if menu:
			menu.refresh()


func equip_armor_owned(i: int) -> void:
	if GameState.owns_armor(i):
		_equip_armor(i)
		if menu:
			menu.refresh()


func equip_boots_owned(i: int) -> void:
	if GameState.owns_boots(i):
		_equip_boots(i)
		if menu:
			menu.refresh()


# Next owned index in a category, wrapping (for Tab/R/T cycling).
func _cycle_owned(owned: Array, cur: int) -> int:
	if owned.is_empty():
		return cur
	var sorted: Array = owned.duplicate()
	sorted.sort()
	var idx := sorted.find(cur)
	return int(sorted[(idx + 1) % sorted.size()]) if idx >= 0 else int(sorted[0])


# Free stat tuning from the Stats window: clamp >=1, persist, recompute HP.
func _set_stat(stat: String, delta: int) -> void:
	var cur := player_str
	match stat:
		"dex":
			cur = player_dex
		"con":
			cur = player_con
	var nv: int = max(1, cur + delta)
	match stat:
		"str":
			player_str = nv
		"dex":
			player_dex = nv
		"con":
			player_con = nv
	GameState.set_character_stat(stat, nv)
	player_max = max(1.0, float(player_con) * float(player_str) * HEALTH_K)
	player_hp = min(player_hp, player_max)
	_update_hud()
	if menu:
		menu.refresh()


# Use a consumable (e.g. heal). No-op if none left.
func use_consumable(id: String) -> void:
	var heal: int = GameState.use_consumable(id)
	if heal > 0:
		player_hp = min(player_max, player_hp + float(heal))
		_update_hud()
	if menu:
		menu.refresh()


# Spend a skill point to unlock/rank a skill, then reapply its runtime effect.
func skill_upgrade(id: String) -> void:
	if GameState.unlock_or_rank(id):
		_apply_skill_effects()
		if menu:
			menu.refresh()


func _play(anim_name: String) -> void:
	if anim and anim_name != "" and cur_anim != anim_name and anim.has_animation(anim_name):
		anim.play(anim_name, 0.2)
		cur_anim = anim_name


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
		elif event.button_index == MOUSE_BUTTON_LEFT:
			if aiming:
				_do_ranged() # while aiming, left-click shoots
			else:
				_do_melee()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			_do_heavy()
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_SPACE:
		_do_dodge()
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F:
		_do_kick()
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_TAB:
		equip_weapon_owned(_cycle_owned(GameState.owned_weapons, GameState.weapon))
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode >= KEY_1 and event.keycode <= KEY_6:
		equip_weapon_owned(event.keycode - KEY_1)
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_R:
		equip_armor_owned(_cycle_owned(GameState.owned_armors, GameState.armor))
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_T:
		equip_boots_owned(_cycle_owned(GameState.owned_boots, GameState.boot))
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * MOUSE_SENS
		pitch = clamp(pitch - event.relative.y * MOUSE_SENS, -1.2, 0.5)


func _physics_process(delta: float) -> void:
	if not player:
		return
	cam_yaw.rotation.y = yaw
	cam_pitch.rotation.x = pitch
	player_invuln = max(0.0, player_invuln - delta)

	var fwd := -cam_yaw.global_transform.basis.z
	var rgt := cam_yaw.global_transform.basis.x
	fwd.y = 0
	rgt.y = 0
	fwd = fwd.normalized()
	rgt = rgt.normalized()
	var dir := Vector3.ZERO
	if not player_dead:
		if Input.is_physical_key_pressed(KEY_W):
			dir += fwd
		if Input.is_physical_key_pressed(KEY_S):
			dir -= fwd
		if Input.is_physical_key_pressed(KEY_D):
			dir += rgt
		if Input.is_physical_key_pressed(KEY_A):
			dir -= rgt
	dir = dir.normalized()

	# Aim (hold middle-mouse): pull the camera in over the shoulder to shoot.
	aiming = Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE) and not dodging and not player_dead
	cam.position = cam.position.lerp(Vector3(0.6, 0.05, 2.3) if aiming else cam_rest, 0.2)

	# Block (hold Q): raising guard cancels an in-progress swing (active-frames
	# rule). Can't block mid-dodge/aim. block_t feeds the parry window.
	var want_block := Input.is_physical_key_pressed(KEY_Q) and not dodging and not aiming and not player_dead
	if want_block and attacking:
		_cancel_swing()
	if want_block and not blocking:
		block_t = 0.0
	blocking = want_block
	if blocking:
		block_t += delta

	var speed := SPRINT if Input.is_physical_key_pressed(KEY_SHIFT) else WALK
	if blocking:
		speed *= 0.4
	if dodging:
		dodge_t -= delta
		player.velocity.x = dodge_dir.x * DODGE_SPEED
		player.velocity.z = dodge_dir.z * DODGE_SPEED
		if dodge_t <= 0.0:
			dodging = false
	else:
		player.velocity.x = dir.x * speed
		player.velocity.z = dir.z * speed
	if not player.is_on_floor():
		player.velocity.y -= gravity * delta
	player.move_and_slide()

	# Face the model toward movement; when idle, face where the camera looks (so
	# the character keeps its back to the camera instead of snapping to its rest
	# orientation). face_flip aligns the model's forward with this (rig-dependent).
	if model:
		var face_dir := dodge_dir if dodging else (dir if dir.length() > 0.1 else fwd)
		var target := atan2(face_dir.x, face_dir.z) + (PI if face_flip else 0.0)
		model_facing = lerp_angle(model_facing, target, 0.2)
		model.rotation.y = model_facing
	# Animation state: swings/dodge play their own one-shots; otherwise block
	# pose (if holding block) or idle/run locomotion.
	if not attacking and not dodging:
		if blocking and block_anim != "":
			_play(block_anim)
		else:
			_play(run_anim if dir.length() > 0.1 else idle_anim)

	# Size the held weapon to ~world scale (the hand bone may be heavily scaled).
	if weapon_attach and not weapon_scaled:
		var s: float = weapon_attach.global_transform.basis.get_scale().x
		if s > 0.0001:
			weapon.scale = Vector3.ONE / s
			weapon.position = weapon_offset / s
			weapon_scaled = true

	_update_boss(delta)
	_update_combat(delta)
	_update_hud()


# --- Boss -------------------------------------------------------------------
func _update_boss(delta: float) -> void:
	if boss_dead or not boss_root:
		return
	var to := player.global_position - boss_root.global_position
	to.y = 0
	var dist := to.length()
	if dist > 0.2:
		boss_root.rotation.y = atan2(to.x, to.z)

	if boss_flash > 0.0:
		boss_flash = max(0.0, boss_flash - delta)
	if boss_mat:
		boss_mat.emission_enabled = boss_flash > 0.0
		if boss_flash > 0.0:
			boss_mat.emission = Color(0.6, 0.5, 0.4)

	match boss_state:
		"idle":
			if dist > 4.0:
				boss_root.global_position += to.normalized() * 2.2 * delta
				_boss_play(boss_walk)
			else:
				_boss_play(boss_idle)
			boss_cd -= delta
			if boss_cd <= 0.0 and dist < 16.0:
				boss_state = "windup"
				boss_t = 1.1
				_boss_play(boss_attack)
				slam_target = player.global_position
				slam_target.y = 0.05
				slam_ring.global_position = slam_target
				slam_ring.visible = true
		"windup":
			boss_t -= delta
			var k: float = clamp(1.0 - boss_t / 1.1, 0.0, 1.0)
			slam_mat.albedo_color = Color(1, 0.2, 0.15, 0.25 + k * 0.45)
			if boss_t <= 0.0:
				boss_state = "recover"
				boss_t = 0.6
				slam_mat.albedo_color = Color(1, 0.55, 0.2, 0.85)
				var pd := player.global_position - slam_target
				pd.y = 0
				if pd.length() < SLAM_RADIUS + 0.4:
					_damage_player(22)
		"recover":
			boss_t -= delta
			if boss_t <= 0.0:
				boss_state = "idle"
				boss_cd = 2.4
				slam_ring.visible = false


func _damage_player(dmg: int) -> void:
	if player_invuln > 0.0 or player_dead:
		return
	if blocking:
		if block_t <= parry_window:
			# Parry: a hit caught just as you raise guard — fully negated, boss reels.
			boss_flash = 0.25
			player_invuln = 0.4
			return
		dmg = int(round(dmg * block_reduction)) # blocked: chip damage only
	var taken: int = max(0, dmg - player_def) # equipment defence subtracts directly
	player_hp = max(0.0, player_hp - taken)
	player_invuln = 0.7
	if player_hp <= 0.0:
		_player_die()


func _player_die() -> void:
	player_dead = true
	_banner("DEFEATED")
	await get_tree().create_timer(1.6).timeout
	player.global_position = player_spawn
	player.velocity = Vector3.ZERO
	player_hp = player_max
	player_dead = false


func _hit_boss(dmg: int) -> void:
	if boss_dead:
		return
	boss_hp = max(0.0, boss_hp - dmg)
	boss_flash = 0.12
	_spawn_damage(boss_root.global_position + Vector3(0, 4.6, 0), dmg)
	if boss_hp <= 0.0:
		_boss_die()


func _boss_die() -> void:
	boss_dead = true
	boss_root.visible = false
	slam_ring.visible = false
	GameState.grant_boss_reward()
	var drop: Dictionary = GameState.roll_loot()
	_banner("VICTORY!   LOOT: %s   (+%d SP)" % [String(drop.get("name", "?")), GameState.SP_PER_BOSS])
	if menu:
		menu.refresh()
	await get_tree().create_timer(2.5).timeout
	boss_hp = BOSS_MAX
	boss_dead = false
	boss_state = "idle"
	boss_cd = 3.0
	boss_root.global_position = boss_pos
	boss_root.visible = true


# --- Player attacks ---------------------------------------------------------
func _do_melee() -> void:
	# One swing at a time: can't re-attack until the current swing finishes.
	if player_dead or attacking or dodging or blocking or melee_cd > 0.0:
		return
	var w: Dictionary = GameState.weapon_data()
	if w.get("ranged", false):
		_do_ranged()
		return
	# Cycle the weapon's light-attack combo.
	var combo: Array = w.get("light", [attack_anim])
	var clip := String(combo[combo_i % combo.size()])
	combo_i += 1
	attack_kind = "light"
	if clip != "" and anim and anim.has_animation(clip):
		_start_swing(clip, ATTACK_SPEED * float(w.get("speed", 1.0)))
	else:
		# No swing clip: fall back to an instant hit on a fixed cooldown.
		melee_cd = 0.45
		_apply_melee_hit()


# Right-click: a slower, harder strike (weapon's heavy clip, scaled damage).
func _do_heavy() -> void:
	if player_dead or attacking or dodging or blocking or aiming:
		return
	var w: Dictionary = GameState.weapon_data()
	if w.get("ranged", false):
		_do_ranged()
		return
	if not bool(GameState.skills["heavy"]["unlocked"]):
		return # Heavy Strike must be unlocked in the Skills window
	var clip := String(w.get("heavy", heavy_anim))
	if clip == "" or anim == null or not anim.has_animation(clip):
		return
	attack_kind = "heavy"
	_start_swing(clip, HEAVY_SPEED * float(w.get("speed", 1.0)))


# F: a quick kick that pokes (boots damage) and knocks the boss back. A kick can
# cancel an in-progress swing (active-frames rule applies via _cancel_swing).
func _do_kick() -> void:
	if player_dead or dodging or blocking:
		return
	if kick_anim == "" or anim == null or not anim.has_animation(kick_anim):
		return
	if attacking:
		_cancel_swing()
	attack_kind = "kick"
	_start_swing(kick_anim, ATTACK_SPEED)


# Force term: base = mass * accel, mass = STR, accel = DEX * ACCEL_PER_DEX.
func _force_base() -> float:
	return float(player_str) * (float(player_dex) * ACCEL_PER_DEX)


# Melee damage for the current swing (light/heavy/kick) per the owner's formulas.
func _attack_damage() -> int:
	match attack_kind:
		"heavy":
			return _heavy_damage()
		"kick":
			return _kick_damage()
	return _light_damage()


# --- Damage previews (shared by combat AND the menu, so shown == actual) -----
func _light_damage() -> int:
	var base := _force_base()
	var wdmg := float(GameState.weapon_data().get("damage", 0))
	return int(round(max(1.0, base + wdmg)))


func _heavy_damage() -> int:
	var base := _force_base()
	var wdmg := float(GameState.weapon_data().get("damage", 0))
	var mult: float = heavy_mult + HEAVY_STR_STEP * floor(player_str / 10.0)
	return int(round(max(1.0, (base + wdmg) * mult)))


func _kick_damage() -> int:
	return int(round(max(1.0, _force_base() + float(player_boots_dmg) * kick_scale)))


func _arrow_mass() -> float:
	return AMMO_MASS + float(player_str) * MASS_PER_STR


func _arrow_v0() -> float:
	return BOW_BASE_V + float(player_dex) * V_PER_DEX + ranged_v_bonus


func _swing_time(clip: String, speed: float) -> float:
	if anim == null or not anim.has_animation(clip):
		return 0.0
	var clip_len: float = anim.get_animation(clip).length
	var t: float = max(0.15, clip_len / speed - float(player_dex) * DEX_ANIM_PER_PT)
	return t


# Map skill unlock/rank into the runtime combat tunables the formulas read.
func _apply_skill_effects() -> void:
	var sk: Dictionary = GameState.skills
	heavy_mult = HEAVY_BASE_MULT + 0.15 * int(sk["heavy"]["rank"])
	kick_scale = 1.0 + 0.25 * int(sk["kick"]["rank"])
	kick_knock = KICK_KNOCKBACK * (1.0 + 0.2 * int(sk["kick"]["rank"]))
	dodge_iframes = DODGE_IFRAMES + 0.1 * int(sk["dodge"]["rank"])
	block_reduction = max(0.0, BLOCK_REDUCTION - 0.04 * int(sk["block"]["rank"]))
	parry_window = PARRY_WINDOW + 0.05 * int(sk["block"]["rank"])
	ranged_v_bonus = 3.0 * int(sk["ranged"]["rank"])


# Play a one-shot attack clip and schedule its hit at the impact point. DEX
# shortens the swing (faster attacks) by DEX_ANIM_PER_PT seconds per point.
func _start_swing(clip: String, speed: float) -> void:
	attacking = true
	locked_clip = clip
	var clip_len: float = anim.get_animation(clip).length
	var swing: float = _swing_time(clip, speed)
	# Short crossfade in from idle, scaled so a fast swing isn't swallowed by it.
	var blend: float = min(0.1, swing * 0.3)
	anim.play(clip, blend, clip_len / swing)
	cur_anim = clip
	# The hit resolves when the clip finishes (_on_anim_finished); this is the
	# safety net that lands it / releases the lock if that signal is ever missed.
	anim_lock_t = swing + 0.15


# Cancel the current swing (dodge/kick/block/bow). Since the hit only resolves
# when the swing animation finishes, clearing locked_clip here means the cancelled
# swing simply never lands — no damage.
func _cancel_swing() -> void:
	attacking = false
	locked_clip = ""
	anim_lock_t = 0.0


# Quick evade (Space): dash in the move direction (or facing if idle) with a
# short window of invulnerability (i-frames), cancelling any swing.
func _do_dodge() -> void:
	if player_dead or dodging or not player.is_on_floor():
		return
	var fwd := -cam_yaw.global_transform.basis.z
	var rgt := cam_yaw.global_transform.basis.x
	fwd.y = 0
	rgt.y = 0
	fwd = fwd.normalized()
	rgt = rgt.normalized()
	var d := Vector3.ZERO
	if Input.is_physical_key_pressed(KEY_W):
		d += fwd
	if Input.is_physical_key_pressed(KEY_S):
		d -= fwd
	if Input.is_physical_key_pressed(KEY_D):
		d += rgt
	if Input.is_physical_key_pressed(KEY_A):
		d -= rgt
	dodge_dir = d.normalized() if d.length() > 0.1 else fwd
	dodging = true
	dodge_t = DODGE_TIME
	_cancel_swing() # dodge cancels any swing (active-frames rule)
	player_invuln = max(player_invuln, dodge_iframes)
	if dodge_anim != "" and anim and anim.has_animation(dodge_anim):
		anim.play(dodge_anim, 0.05)
		cur_anim = dodge_anim


# Resolve a melee swing's hit (dummy + boss) using the current aim direction.
func _apply_melee_hit() -> void:
	var aim := -cam_yaw.global_transform.basis.z
	aim.y = 0
	aim = aim.normalized()
	var dmg := _attack_damage()
	var td := dummy_pos - player.global_position
	td.y = 0
	if td.length() < MELEE_RANGE + 0.5 and td.normalized().dot(aim) > 0.2:
		_hit_dummy(dmg)
	if not boss_dead:
		var tb := boss_root.global_position - player.global_position
		tb.y = 0
		if tb.length() < MELEE_RANGE + 2.2 and td_dot(tb, aim) > 0.0:
			_hit_boss(dmg)
			if attack_kind == "kick":
				boss_root.global_position += tb.normalized() * kick_knock * 0.2


func td_dot(v: Vector3, aim: Vector3) -> float:
	if v.length() < 0.001:
		return 1.0
	return v.normalized().dot(aim)


func _do_ranged() -> void:
	if ranged_cd > 0.0 or player_dead:
		return
	if attacking:
		_cancel_swing() # a shot cancels an in-progress swing
	ranged_cd = RANGED_CD
	# Arrow physics: mass from STR (draw weight), launch speed from DEX (+ skill).
	var mass := _arrow_mass()
	var v0 := _arrow_v0()
	var bolt := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.12
	sm.height = 0.24
	var bm := StandardMaterial3D.new()
	bm.albedo_color = Color(0.6, 0.9, 1.0)
	bm.emission_enabled = true
	bm.emission = Color(0.6, 0.9, 1.0)
	sm.material = bm
	bolt.mesh = sm
	bolt.position = player.global_position + Vector3(0, 1.2, 0)
	add_child(bolt)
	var aim := -cam.global_transform.basis.z # includes pitch — elevate for distance
	projectiles.append({"mesh": bolt, "vel": aim.normalized() * v0, "mass": mass, "dmg": int(GameState.weapon_data().get("damage", 0)), "life": 4.0})


func _update_combat(delta: float) -> void:
	melee_cd = max(0.0, melee_cd - delta)
	ranged_cd = max(0.0, ranged_cd - delta)

	# The hit resolves on _on_anim_finished (swing complete). Safety net: if that
	# signal is ever missed, land the hit and release once the swing's full
	# duration has elapsed. (A cancelled swing zeroes anim_lock_t, so it's skipped.)
	if attacking and anim_lock_t > 0.0:
		anim_lock_t -= delta
		if anim_lock_t <= 0.0:
			_apply_melee_hit()
			attacking = false
			locked_clip = ""
			cur_anim = ""

	var dcenter := dummy_pos + Vector3(0, 1.0, 0)
	var bcenter := boss_root.global_position + Vector3(0, 2.0, 0) if boss_root else Vector3.ZERO
	for i in range(projectiles.size() - 1, -1, -1):
		var p = projectiles[i]
		# Gravity (arc) + quadratic drag/mass (heavier arrows decelerate less).
		p.vel.y -= gravity * delta
		var spd: float = p.vel.length()
		if spd > 0.01:
			p.vel -= p.vel.normalized() * (ARROW_DRAG * spd * spd / p.mass) * delta
		p.mesh.position += p.vel * delta
		p.life -= delta
		# Kinetic-energy damage at impact: 0.5*m*v^2 + bow damage (far = softer).
		var ke_dmg := int(round(0.5 * p.mass * p.vel.length_squared() + p.dmg))
		var done := false
		if p.mesh.position.distance_to(dcenter) < 0.7:
			_hit_dummy(ke_dmg)
			done = true
		elif not boss_dead and p.mesh.position.distance_to(bcenter) < 2.2:
			_hit_boss(ke_dmg)
			done = true
		if done or p.life <= 0.0 or p.mesh.position.y < 0.0:
			p.mesh.queue_free()
			projectiles.remove_at(i)

	if dummy_flash > 0.0:
		dummy_flash = max(0.0, dummy_flash - delta)
		dummy_mat.emission_enabled = true
		dummy_mat.emission = Color(0.5, 0.4, 0.2)
	else:
		dummy_mat.emission_enabled = false
	dummy_hp = min(DUMMY_MAX, dummy_hp + 25.0 * delta)


func _hit_dummy(dmg: int) -> void:
	dummy_hp = max(0.0, dummy_hp - dmg)
	dummy_flash = 0.12
	if dummy_hp <= 0.0:
		dummy_hp = DUMMY_MAX
	_spawn_damage(dummy_pos + Vector3(0, 2.2, 0), dmg)


func _spawn_damage(pos: Vector3, dmg: int) -> void:
	var label := Label3D.new()
	label.text = str(dmg)
	label.font_size = 64
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.modulate = Color(1.0, 0.9, 0.4)
	label.position = pos
	add_child(label)
	var tw := create_tween()
	tw.tween_property(label, "position:y", pos.y + 1.0, 0.7)
	tw.parallel().tween_property(label, "modulate:a", 0.0, 0.7)
	tw.tween_callback(label.queue_free)


func _banner(text: String) -> void:
	if not hud_banner:
		return
	hud_banner.text = text
	hud_banner.modulate = Color(1, 1, 1, 1)
	var tw := create_tween()
	tw.tween_interval(1.0)
	tw.tween_property(hud_banner, "modulate:a", 0.0, 1.2)


func _update_weapon_hud() -> void:
	if hud_weapon:
		hud_weapon.text = "⚔ %s   [Tab] / [1-6] switch" % String(GameState.weapon_data().get("name", "Sword"))


func _update_gear_hud() -> void:
	if hud_gear:
		var a: Dictionary = GameState.armor_data()
		var b: Dictionary = GameState.boots_data()
		hud_gear.text = "🛡 %s (DEF %d) [R]    🥾 %s (+%d kick) [T]" % [String(a.get("name", "Cloth")), player_def, String(b.get("name", "Bare Feet")), player_boots_dmg]


func _update_hud() -> void:
	if hud_player_fill:
		hud_player_fill.size = Vector2(296.0 * (player_hp / player_max), 20)
	if hud_boss_fill:
		hud_boss_fill.size = Vector2(596.0 * (boss_hp / BOSS_MAX), 14)
