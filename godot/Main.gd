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

# --- archer ability kit (ported from web2d) ---------------------------------
const STAMINA_MAX := 120.0
const STA_REGEN := 30.0
const STA_REGEN_DELAY := 0.5
const STA_QUICK := 8.0
const STA_POWER := 24.0
const STA_SPREAD := 14.0
const POWER_MULT := 1.9       # power-shot damage multiplier
const SPREAD_COUNT := 3
const SPREAD_ARC := 0.5       # radians, total horizontal fan
const VOLLEY_COUNT := 5
const VOLLEY_ARC := 0.10
const CD_VOLLEY := 6.0
const CD_EXPLOSIVE := 9.0
const EXPLOSIVE_R := 3.4      # AoE radius in metres
const EXPLOSIVE_DMG := 160
const CD_PIERCE := 8.0
const PIERCE_MULT := 2.6
const CD_DEFLECT := 5.0
const DEFLECT_TIME := 0.45
const CD_STORM := 16.0
const STORM_COUNT := 18
const SPECIAL_GAIN_HIT := 0.04
const SPECIAL_GAIN_TAKEN := 0.08

const PLAYER_MAX := 100.0
const BOSS_MAX := 8000.0
const SLAM_RADIUS := 3.6

# --- boss (3-phase Stone Golem) attack tuning -------------------------------
const BOSS_BASE_CD := 2.2     # seconds between attacks (shrinks with phase)
const PHASE_STAGGER := 0.9    # stagger/roar on a phase transition
const SMASH_R := 5.0
const SMASH_DMG := 16
const SLAM_DMG := 14
const QUAKE_R := 16.0         # arena-wide, phase 2+ (only a dodge's i-frames avoid)
const QUAKE_DMG := 18
const DASH_SPEED := 15.0
const DASH_TIME := 0.42
const DASH_DMG := 16
const SCATTER_COUNT := 6
const SCATTER_SPEED := 12.0
const SCATTER_DMG := 9

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
var bowdraw_anim := "" # drawn-bow aim pose (played while aiming with a bow)
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
# Archer (Erika) animation state. When `is_archer`, the player uses the dedicated
# 3D-rendered archer clip set + state machine instead of the generic melee one.
var is_archer := false
var aim_mod: ArcherAimModifier # upper-body pitch so the bow tracks the target's height
var nock_arrow: Node3D   # arrow drawn on the bow while aiming (points at the target)
var nock_hide_t := 0.0   # briefly hide the nocked arrow right after a shot (it "left")
var rhand_bone := -1     # right (draw) hand bone = the nock anchor
const AIM_HOLD_T := 0.52 # frame of the draw clip where the bow points dead at the target
var a_idle := ""
var a_aim := ""        # held aim/draw pose (draw clip frozen at AIM_HOLD_T)
var a_run := ""
var a_walk := ""
var a_walk_back := ""  # aiming + moving backward
var a_strafe_l := ""
var a_strafe_r := ""
var a_shoot := ""      # release one-shot
var a_roll := ""       # dodge (forward/roll)
var a_dodge_l := ""    # dodge left
var a_dodge_r := ""    # dodge right
var a_dodge_b := ""    # dodge back
var a_hit := ""        # flinch one-shot
var a_death := ""
var shoot_t := 0.0     # seconds left on the shoot one-shot
var player_hit_t := 0.0 # seconds left on the hit flinch
# archer ability runtime: stamina, special meter (0..1), per-skill cooldowns
var stamina := STAMINA_MAX
var sta_regen_t := 0.0
var special := 0.0
var deflect_t := 0.0
var cd_volley := 0.0
var cd_explosive := 0.0
var cd_pierce := 0.0
var cd_deflect := 0.0
var cd_storm := 0.0
# touch controls (web/mobile): left virtual joystick to move, drag elsewhere to look,
# on-screen buttons for actions. Additive to keyboard/mouse so desktop still works.
var touch_enabled := false
var touch_move := Vector2.ZERO  # -1..1 per axis from the joystick
var joy_active := false
var joy_knob: Control
var joy_base: Control
var touch_buttons: Array = []   # [{ frac: Rect2 (0..1 of screen), cb: Callable }]
var touch_roles := {}           # touch index -> "joy" | "btn"
var blocking := false
var block_t := 0.0      # seconds the current block has been held (for parry window)
var aiming := false
var cam_rest := Vector3.ZERO
var face_flip := true
var skel: Skeleton3D
var weapon: Node3D # held weapon: real model (wrapper Node3D) or placeholder box (MeshInstance3D)
var bow_node: Node3D # baked bow mesh on the hand (archer) -> arrow spawn origin
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
var boss_attack := ""    # base slam (orc_slam)
var boss_smash := ""     # close-range AoE pound
var boss_quake := ""     # arena-wide quake (phase 2+)
var boss_charge := ""    # dash/leap toward player
var boss_swipe := ""     # scatter-rock swing
var boss_roar := ""      # phase-transition roar
var boss_clip := ""
var boss_skel: Skeleton3D
var boss_mat: StandardMaterial3D
var boss_pos := Vector3(0, 0, -18)
var boss_hp := BOSS_MAX
var boss_state := "idle" # idle | windup | strike | dash | recover
var boss_t := 0.0
var boss_cd := 3.0
var boss_flash := 0.0
var boss_dead := false
var boss_phase := 1      # 1..3, rises as health thirds deplete
var boss_kind := ""      # current attack pattern
var boss_windup := 1.0   # current telegraph duration (for the ring fill)
var boss_tele_center := Vector3.ZERO
var boss_tele_r := 1.0
var dash_vec := Vector3.ZERO
var dash_hit := false
var boss_rocks: Array = [] # scatter projectiles: { mesh, vel, life, dmg }
var slam_ring: MeshInstance3D
var slam_mat: StandardMaterial3D
var slam_target := Vector3.ZERO

# --- run scoring (C9-style graded clears) ---
var run_t := 0.0          # seconds of active fight
var run_dmg := 0.0        # total damage taken this run
var run_dodges := 0       # dodges used
var run_deflect_ok := 0   # hits negated by a deflect
var run_scored := false   # results already shown for this kill
var current_floor := 0    # which SAO floor we're on (mastery buff is per-floor)
# --- target lock (Milestone A): aim/face/shoot at the locked enemy, not the camera ---
var aim_locked := true     # locked-on -> face + shoot the target; unlocked -> free aim
var locked_target: Node3D  # the enemy we're locked onto (the boss for now)
var aim_look: LookAtModifier3D # IK that pitches the spine toward the target (elevation)
# --- difficulty ladder + floor loop (Milestone 3) ---
var difficulty := 0       # 0 Normal .. 3 Master
var pre_run := true       # showing the floor/difficulty select; boss is paused
var boss_max := BOSS_MAX  # current boss HP cap (scales with difficulty)
var boss_stagger_t := 0.0 # bonus-damage window during a phase-transition roar
var hazard_t := 0.0       # falling-rock hazard timer (Hard+)
const DIFF_NAMES := ["NORMAL", "HARD", "EXPERT", "MASTER"]
const DIFF_HP := [1.0, 1.4, 1.9, 2.5]
const DIFF_DMG := [1.0, 1.3, 1.7, 2.2]
const DIFF_WIN := [1.0, 0.85, 0.72, 0.6] # telegraph windup multiplier (faster = harder)
var results_layer: CanvasLayer
var result_buttons: Array = [] # results-screen tap targets: [{frac, cb}]
var last_res := {}
var last_loot: Array = []
var boss_warn: ColorRect  # red screen flash on un-interruptible boss windups
var dodge_aura: MeshInstance3D   # blue i-frame aura
var deflect_aura: MeshInstance3D # white deflect aura

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
var hud_stamina_fill: ColorRect
var hud_special_fill: ColorRect
var hud_cd: Label
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
	_show_floor_select() # Milestone 3: pick difficulty before the fight starts


func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_tex = load("res://env/sky.png")
	if sky_tex:
		var pano := PanoramaSkyMaterial.new()
		pano.panorama = sky_tex
		sky.sky_material = pano
	else:
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
	var alb = load("res://env/ground_albedo.png")
	if alb:
		mat.albedo_texture = alb
		mat.uv1_scale = Vector3(40, 40, 1) # tile across the 200 m plane (~5 m tiles)
		var gn = load("res://env/ground_normal.png")
		if gn:
			mat.normal_enabled = true
			mat.normal_texture = gn
		var gr = load("res://env/ground_rough.png")
		if gr:
			mat.roughness_texture = gr
	else:
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
	# Boss = PumpkinHulk: a clean Mixamo-rigged brute (the golem's rest skeleton is
	# degenerate -> deforms; parked for a re-rig). Pumpkin self-textures and has a
	# proper rest, so no golem texture/scale hacks — _scale_boss_to/_ground_boss use
	# the skeleton (robust on any rig). The boss MECHANICS are model-agnostic.
	var scene := load("res://models/Pumpkin.glb")
	if scene:
		boss_model = scene.instantiate()
		boss_root.add_child(boss_model)
		boss_mat = null # multi-material model: skip the tint flash
		boss_anim = AnimUtil.find_anim_player(boss_model)
		var bsk := AnimUtil.find_skeleton(boss_model)
		if boss_anim and bsk:
			boss_skel = bsk
			# Retarget the orc clips (idle/walk/slam) onto the golem. The earlier
			# "collapse" was the 172x scale runaway on the broken textured glb, NOT
			# the retarget itself; on this good-skeleton glb it should stand AND
			# animate visibly (the native baked idle barely moves).
			boss_idle = AnimUtil.merge(boss_anim, bsk, "res://models/anim/orc_idle.glb", "Idle")
			boss_walk = AnimUtil.merge(boss_anim, bsk, "res://models/anim/orc_walk.glb", "Walk")
			boss_attack = AnimUtil.merge(boss_anim, bsk, "res://models/anim/orc_slam.glb", "Slam")
			# Phase-3 distinct attack clips (humanoid clips retarget onto the golem rig).
			boss_smash = AnimUtil.merge(boss_anim, bsk, "res://models/anim/boss/smash.fbx", "BSmash")
			boss_quake = AnimUtil.merge(boss_anim, bsk, "res://models/anim/boss/quake.fbx", "BQuake")
			boss_charge = AnimUtil.merge(boss_anim, bsk, "res://models/anim/boss/charge.fbx", "BCharge")
			boss_swipe = AnimUtil.merge(boss_anim, bsk, "res://models/anim/boss/swipe.fbx", "BSwipe")
			boss_roar = AnimUtil.merge(boss_anim, bsk, "res://models/anim/boss/roar.fbx", "BRoar")
			_set_anim_loop(boss_anim, boss_idle, true)
			_set_anim_loop(boss_anim, boss_walk, true)
			for bn in [boss_attack, boss_smash, boss_quake, boss_charge, boss_swipe, boss_roar]:
				_set_anim_loop(boss_anim, bn, false)
			_boss_play(boss_idle)
			boss_anim.advance(0.0)
			_scale_boss_to(4.0)
			_ground_boss()
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
	if entry.has("default_weapon"):
		GameState.weapon = clampi(int(entry["default_weapon"]), 0, GameState.weapons.size() - 1)
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
		bow_node = model.find_child("A1_Bow", true, false) # baked archer bow (if any)
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

	# Capture the mouse for native desktop look. On web/mobile we use drag-to-look +
	# on-screen buttons instead, so don't grab the pointer (it breaks touch).
	if not (OS.has_feature("web") or OS.has_feature("mobile")):
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)

	# Defensive auras: a translucent capsule that flashes during i-frame windows so
	# the player can READ their defense (blue = dodge i-frames, white = deflect).
	dodge_aura = _make_dodge_ring() # flat ground ring, not a body-shell bubble
	deflect_aura = _make_aura(Color(1.0, 1.0, 1.0))
	player.add_child(dodge_aura)
	player.add_child(deflect_aura)


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)

	# Danger flash: a red full-screen tint that pulses during un-interruptible boss
	# windups (added first so it sits behind the rest of the HUD).
	boss_warn = ColorRect.new()
	boss_warn.set_anchors_preset(Control.PRESET_FULL_RECT)
	boss_warn.color = Color(1, 0.1, 0.1, 0.0)
	boss_warn.mouse_filter = Control.MOUSE_FILTER_IGNORE
	boss_warn.visible = false
	root.add_child(boss_warn)

	# Player HP (top-left).
	root.add_child(_rect(Color(0, 0, 0, 0.5), Vector2(24, 24), Vector2(300, 24)))
	hud_player_fill = _rect(Color(0.36, 0.85, 0.42), Vector2(26, 26), Vector2(296, 20))
	root.add_child(hud_player_fill)

	# Archer: stamina (yellow) + Arrow-Storm meter (cyan) under the HP bar.
	if is_archer:
		root.add_child(_rect(Color(0, 0, 0, 0.5), Vector2(24, 52), Vector2(220, 12)))
		hud_stamina_fill = _rect(Color(0.95, 0.82, 0.30), Vector2(26, 54), Vector2(216, 8))
		root.add_child(hud_stamina_fill)
		root.add_child(_rect(Color(0, 0, 0, 0.5), Vector2(24, 68), Vector2(220, 10)))
		hud_special_fill = _rect(Color(0.40, 0.85, 1.0), Vector2(26, 70), Vector2(0, 6))
		root.add_child(hud_special_fill)
		hud_cd = Label.new()
		hud_cd.position = Vector2(24, 82)
		hud_cd.add_theme_font_size_override("font_size", 13)
		hud_cd.modulate = Color(0.85, 0.9, 1.0)
		root.add_child(hud_cd)

	# Boss bar (top-center, 1280-wide design).
	var name_label := Label.new()
	name_label.text = "THE BRUTE"
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
	hud_hint.text = "LMB Shot  RMB Power  MMB Aim  1 Spread  2 Volley  3 Explosive  4 Pierce  Q Deflect  X Storm  Space Dodge" if is_archer else "[C] Stats   [I] Inventory   [K] Skills"
	root.add_child(hud_hint)

	# On web/mobile, add the on-screen touch controls (additive to keyboard/mouse).
	if OS.has_feature("web") or OS.has_feature("mobile"):
		touch_enabled = true
		hud_hint.visible = false
		_build_touch_ui(root)


# On-screen controls for touch devices: a left virtual joystick (move) + action
# buttons (right). Aiming is automatic toward the boss, so no camera control is
# needed — clean two-thumb play. All positions are screen FRACTIONS, so the layout
# scales to any device and the hit-test matches the visuals exactly.
func _build_touch_ui(root: Control) -> void:
	# joystick base + knob (bottom-left), anchored ~18% across, ~75% down
	joy_base = Panel.new()
	joy_base.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	joy_base.position = Vector2(60, -260); joy_base.size = Vector2(220, 220)
	joy_base.modulate = Color(1, 1, 1, 0.45)
	joy_base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(joy_base)
	joy_knob = Panel.new()
	joy_knob.size = Vector2(92, 92); joy_knob.position = Vector2(64, 64)
	joy_knob.modulate = Color(0.7, 0.85, 1.0, 0.7)
	joy_knob.mouse_filter = Control.MOUSE_FILTER_IGNORE
	joy_base.add_child(joy_knob)

	# action buttons (right side), by screen fraction. Archer kit, else basic.
	if is_archer:
		_touch_btn(root, "SHOOT", Rect2(0.84, 0.74, 0.14, 0.18), func(): _do_ranged())
		_touch_btn(root, "POWER", Rect2(0.69, 0.80, 0.12, 0.12), func(): _shot_power())
		_touch_btn(root, "DODGE", Rect2(0.69, 0.66, 0.12, 0.12), func(): _do_dodge())
		_touch_btn(root, "SPREAD", Rect2(0.86, 0.58, 0.12, 0.11), func(): _shot_spread())
		_touch_btn(root, "VOLLEY", Rect2(0.73, 0.52, 0.12, 0.11), func(): _skill_volley())
		_touch_btn(root, "EXPL", Rect2(0.86, 0.45, 0.12, 0.11), func(): _skill_explosive())
		_touch_btn(root, "STORM", Rect2(0.73, 0.39, 0.12, 0.11), func(): _special_storm())
		# target lock toggle + cycle (top-center, near the boss bar)
		_touch_btn(root, "LOCK", Rect2(0.45, 0.10, 0.10, 0.08), func(): _toggle_lock())
		_touch_btn(root, "<", Rect2(0.40, 0.10, 0.045, 0.08), func(): _cycle_target(-1))
		_touch_btn(root, ">", Rect2(0.555, 0.10, 0.045, 0.08), func(): _cycle_target(1))
	else:
		_touch_btn(root, "ATTACK", Rect2(0.84, 0.74, 0.14, 0.18), func(): _do_melee())
		_touch_btn(root, "DODGE", Rect2(0.69, 0.74, 0.12, 0.14), func(): _do_dodge())


func _touch_btn(root: Control, label: String, frac: Rect2, cb: Callable) -> void:
	var b := Panel.new()
	b.anchor_left = frac.position.x; b.anchor_top = frac.position.y
	b.anchor_right = frac.position.x + frac.size.x; b.anchor_bottom = frac.position.y + frac.size.y
	b.offset_left = 0; b.offset_top = 0; b.offset_right = 0; b.offset_bottom = 0
	b.modulate = Color(1, 1, 1, 0.5)
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var lab := Label.new()
	lab.text = label; lab.set_anchors_preset(Control.PRESET_FULL_RECT)
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", 24)
	b.add_child(lab)
	root.add_child(b)
	touch_buttons.append({"frac": frac, "cb": cb})


# Raw multitouch: each touch is the joystick (left side) or a button tap. Aiming is
# automatic, so there's no look control to conflict with — both thumbs work at once.
func _input(event: InputEvent) -> void:
	# Results screen up: hit-test its fraction-anchored buttons (Control buttons don't
	# get touch taps since mouse-from-touch emulation is off for the game controls).
	if results_layer and event is InputEventScreenTouch and event.pressed:
		var rf: Vector2 = event.position / get_viewport().get_visible_rect().size
		for b in result_buttons:
			if (b.frac as Rect2).has_point(rf):
				(b.cb as Callable).call(); return
		return
	if not touch_enabled:
		return
	var vp := get_viewport().get_visible_rect().size
	if event is InputEventScreenTouch:
		var f: Vector2 = event.position / vp
		if event.pressed:
			for b in touch_buttons:
				if (b.frac as Rect2).has_point(f):
					touch_roles[event.index] = "btn"; (b.cb as Callable).call(); return
			if f.x < 0.42 and f.y > 0.35: # left-ish lower region = move stick
				touch_roles[event.index] = "joy"; joy_active = true; _joy_set(event.position, vp)
		else:
			if touch_roles.get(event.index, "") == "joy":
				joy_active = false; touch_move = Vector2.ZERO
				if joy_knob and joy_base: joy_knob.position = joy_base.size * 0.5 - joy_knob.size * 0.5
			touch_roles.erase(event.index)
	elif event is InputEventScreenDrag:
		if touch_roles.get(event.index, "") == "joy":
			_joy_set(event.position, vp)


func _joy_set(screen_pos: Vector2, vp: Vector2) -> void:
	var center := joy_base.global_position + joy_base.size * 0.5
	var rad := vp.x * 0.11
	var d := screen_pos - center
	if d.length() > rad: d = d.normalized() * rad
	touch_move = d / rad
	if joy_knob and joy_base:
		joy_knob.position = joy_base.size * 0.5 + (touch_move * (joy_base.size.x * 0.5 - joy_knob.size.x * 0.5)) - joy_knob.size * 0.5


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
		# Character ships without animations (e.g. Erika is just a rigged T-pose +
		# bow). Create a player so we can retarget external Mixamo clips onto it.
		anim = AnimationPlayer.new()
		model.add_child(anim)
		anim.root_node = anim.get_path_to(model)
		print("Bossraid: created AnimationPlayer for clip-less character")
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
		bowdraw_anim = AnimUtil.merge(anim, skel, "res://models/anim/bow_draw.glb", "BowDraw")
		if idle_anim == "" and m_idle != "":
			idle_anim = m_idle
		if run_anim == "" and m_run != "":
			run_anim = m_run
		if m_slash != "":
			attack_anim = m_slash
		attack_anim2 = m_slash2 if m_slash2 != "" else attack_anim
		print("Bossraid: merged idle=", m_idle, " run=", m_run, " slash=", m_slash, " slashB=", m_slash2, " dodge=", dodge_anim)
	# Archer (Erika): wire the dedicated 3D-rendered archer clip set. These drive a
	# bespoke state machine (_archer_anim) — idle/aim/locomotion/strafe/shoot/roll.
	is_archer = bow_node != null
	if is_archer and skel:
		const AD := "res://models/anim/archer/"
		a_idle      = AnimUtil.merge(anim, skel, AD + "idle.fbx", "AIdle")
		# Aim hold = the DRAW clip held at its forward-aim frame (AIM_HOLD_T). idle_aim
		# holds the bow ~90 deg to the SIDE (the "shoots sideways" bug); the draw motion
		# passes through a dead-on forward aim mid-clip (fore-arm ~0 deg to target) before
		# settling sideways, so we freeze it there instead of looping it.
		a_aim       = AnimUtil.merge(anim, skel, AD + "draw.fbx", "AAim")
		a_run       = AnimUtil.merge(anim, skel, AD + "run.fbx", "ARun")
		a_walk      = AnimUtil.merge(anim, skel, AD + "walk.fbx", "AWalk")
		a_walk_back = AnimUtil.merge(anim, skel, AD + "walk_back.fbx", "AWalkBack")
		a_strafe_l  = AnimUtil.merge(anim, skel, AD + "strafe_left.fbx", "AStrafeL")
		a_strafe_r  = AnimUtil.merge(anim, skel, AD + "strafe_right.fbx", "AStrafeR")
		a_shoot     = AnimUtil.merge(anim, skel, AD + "shoot.fbx", "AShoot")
		# Dodge clips KEEP the hips rotation (true) so the roll actually tumbles/leans
		# instead of playing as an upright flail (the tumble lives in the root bone).
		a_roll      = AnimUtil.merge(anim, skel, AD + "roll.fbx", "ARoll", true)
		a_dodge_l   = AnimUtil.merge(anim, skel, AD + "dodge_left.fbx", "ADodgeL", true)
		a_dodge_r   = AnimUtil.merge(anim, skel, AD + "dodge_right.fbx", "ADodgeR", true)
		a_dodge_b   = AnimUtil.merge(anim, skel, AD + "dodge_back.fbx", "ADodgeB", true)
		a_hit       = AnimUtil.merge(anim, skel, AD + "hit.fbx", "AHit")
		a_death     = AnimUtil.merge(anim, skel, AD + "death.fbx", "ADeath")
		for n in [a_idle, a_run, a_walk, a_walk_back, a_strafe_l, a_strafe_r]:
			_set_loop(n, true)
		# a_aim (draw) is HELD at the forward-aim frame, not looped (see _hold_aim).
		for n in [a_aim, a_shoot, a_roll, a_dodge_l, a_dodge_r, a_dodge_b, a_hit, a_death]:
			_set_loop(n, false)
		# route the generic hooks to archer clips so shared systems just work
		idle_anim = a_idle if a_idle != "" else idle_anim
		run_anim = a_run if a_run != "" else run_anim
		dodge_anim = a_roll if a_roll != "" else dodge_anim
		bowdraw_anim = a_aim if a_aim != "" else bowdraw_anim
		# Upper-body 3D aim: pitches the spine after the anim so the bow tracks the
		# target's height (the bow holds level otherwise -> misses airborne/tall bosses).
		aim_mod = ArcherAimModifier.new()
		skel.add_child(aim_mod)
		# A drawn arrow on the bow while aiming: nocked at the draw hand, pointing at the
		# target so the bow's "front" visibly lines up on the boss (the two match).
		rhand_bone = skel.find_bone("mixamorig_RightHand")
		var na = load("res://models/weapons/arrow1.glb")
		if na:
			nock_arrow = na.instantiate()
			add_child(nock_arrow)
			var asz: Vector3 = _aabb_of(nock_arrow).size
			var along: float = max(asz.x, max(asz.y, asz.z))
			if along > 0.0:
				nock_arrow.scale = Vector3.ONE * (0.85 / along)
			nock_arrow.visible = false
		print("Bossraid: archer clips idle=", a_idle, " aim=", a_aim, " run=", a_run, " shoot=", a_shoot, " roll=", a_roll)
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
	_set_loop(bowdraw_anim, true) # held aim pose
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


# Combined local-space AABB of all MeshInstance3Ds under `node`.
func _aabb_of(node: Node3D) -> AABB:
	var has := false
	var result := AABB()
	var inv := node.global_transform.affine_inverse()
	for mi in node.find_children("*", "MeshInstance3D", true, false):
		var m: MeshInstance3D = mi
		if m.mesh == null:
			continue
		var a: AABB = (inv * m.global_transform) * m.mesh.get_aabb()
		result = a if not has else result.merge(a)
		has = true
	return result


# (Re)build the held weapon mesh. Uses the real weapon model (GameState
# weapons[].mesh) auto-fitted to the hand; falls back to a placeholder box.
func _build_weapon_mesh() -> void:
	if weapon_attach == null:
		return
	if weapon and is_instance_valid(weapon):
		weapon.queue_free()
	var w: Dictionary = GameState.weapon_data()
	var length: float = w.get("len", 1.1)
	var mesh_path: String = String(w.get("mesh", ""))
	var scene = load(mesh_path) if (mesh_path != "" and ResourceLoader.exists(mesh_path)) else null
	if scene:
		# Make the real model occupy the placeholder box's known-good hold: align its
		# longest axis to +Z (the box's blade axis), then the wrapper's WEAPON_EULER
		# points it up out of the hand and the offset stands it up — exactly like the
		# box. Scaled so the long axis = `len`, centered like the box.
		weapon = Node3D.new()
		weapon.rotation_degrees = WEAPON_EULER
		weapon_attach.add_child(weapon)
		var inst: Node3D = scene.instantiate()
		weapon.add_child(inst)
		var sz: Vector3 = _aabb_of(inst).size
		var longest: float = max(sz.x, max(sz.y, sz.z))
		if sz.y >= sz.x and sz.y >= sz.z:
			inst.rotation_degrees = Vector3(90, 0, 0)  # Y (blade) -> +Z
		elif sz.x >= sz.y and sz.x >= sz.z:
			inst.rotation_degrees = Vector3(0, 90, 0)  # X -> +Z
		# (Z already longest -> no rotation)
		inst.scale = Vector3.ONE * (length / longest if longest > 0.0 else 1.0)
		var a2: AABB = _aabb_of(weapon) # inst AABB in wrapper space (after rot+scale)
		inst.position -= (a2.position + a2.size * 0.5) # center on the wrapper origin
		weapon_offset = Vector3(0, length * 0.5, 0)
		weapon_scaled = false
	else:
		# Placeholder box (len x thick) when no model is available.
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
		weapon_offset = Vector3(0, length * 0.5, 0)
		weapon_scaled = false


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


# Archer state machine. Priority: death > flinch > shoot one-shot > aim (strafe/
# back/hold) > locomotion (run/walk) > idle. (dodge/roll is handled by the dodge
# system playing dodge_anim.)
func _archer_anim(dir: Vector3, fwd: Vector3, rgt: Vector3) -> void:
	if player_dead:
		_play(a_death); return
	if player_hit_t > 0.0 and a_hit != "":
		_play(a_hit); return
	var moving := dir.length() > 0.1
	# Shoot pose only when standing — while moving, keep the locomotion/strafe cycle
	# (the bow is already drawn there) so the legs don't freeze and slide.
	if not moving and shoot_t > 0.0 and a_shoot != "":
		_play(a_shoot); return
	if aiming:
		if moving:
			var fdot := dir.dot(fwd)
			var rdot := dir.dot(rgt)
			if absf(rdot) > absf(fdot) + 0.15 and (a_strafe_l != "" or a_strafe_r != ""):
				_play(a_strafe_r if rdot > 0.0 else a_strafe_l)
			elif fdot < -0.2 and a_walk_back != "":
				_play(a_walk_back)
			elif a_walk != "":
				_play(a_walk) # forward + aiming: walk cycle (legs move, no slide)
			else:
				_hold_aim()
		else:
			_hold_aim() # standing: hold the bow drawn + pointed at the target
	elif moving:
		var sprint := Input.is_physical_key_pressed(KEY_SHIFT)
		_play(a_run if (sprint and a_run != "") else (a_walk if a_walk != "" else a_run))
	else:
		_play(a_idle)


# Hold the bow drawn and pointed at the target. The draw clip animates rest -> a
# dead-on forward aim (~AIM_HOLD_T) -> a lazy sideways rest; we play it once (so it
# raises the bow) then freeze on the forward-aim frame instead of looping past it.
func _hold_aim() -> void:
	if a_aim == "":
		return
	if cur_anim != a_aim:
		anim.play(a_aim, 0.18)
		cur_anim = a_aim
	if anim.current_animation == a_aim and anim.current_animation_position > AIM_HOLD_T:
		anim.seek(AIM_HOLD_T, true)


func _unhandled_input(event: InputEvent) -> void:
	# Touch uses the on-screen buttons (handled in _input); skip action triggers here.
	if touch_enabled:
		return
	# Desktop: a click while the pointer is free re-captures it (doesn't fire).
	if event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
		return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * MOUSE_SENS
		pitch = clamp(pitch - event.relative.y * MOUSE_SENS, -1.2, 0.5)

	# Combat via named actions (keyboard + mouse + gamepad).
	if not player_dead:
		if event.is_action_pressed("quick_shot"):
			if is_archer or aiming: _do_ranged()
			else: _do_melee()
		elif event.is_action_pressed("power_shot"):
			_shot_power() if is_archer else _do_heavy()
		elif event.is_action_pressed("dodge"):
			_do_dodge()
		elif is_archer and event.is_action_pressed("deflect"):
			_skill_deflect()
		elif is_archer and event.is_action_pressed("ab_spread"):
			_shot_spread()
		elif is_archer and event.is_action_pressed("ab_volley"):
			_skill_volley()
		elif is_archer and event.is_action_pressed("ab_explosive"):
			_skill_explosive()
		elif is_archer and event.is_action_pressed("ab_pierce"):
			_skill_pierce()
		elif is_archer and event.is_action_pressed("arrow_storm"):
			_special_storm()
		elif event.is_action_pressed("aim_lock"):
			_toggle_lock()
		elif event.is_action_pressed("target_next"):
			_cycle_target(1)
		elif event.is_action_pressed("target_prev"):
			_cycle_target(-1)

	# Non-archer legacy (kick / gear cycle) — not core to the archer build.
	if not is_archer and event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F: _do_kick()
		elif event.keycode == KEY_TAB: equip_weapon_owned(_cycle_owned(GameState.owned_weapons, GameState.weapon))
		elif event.keycode >= KEY_1 and event.keycode <= KEY_6: equip_weapon_owned(event.keycode - KEY_1)
		elif event.keycode == KEY_R: equip_armor_owned(_cycle_owned(GameState.owned_armors, GameState.armor))
		elif event.keycode == KEY_T: equip_boots_owned(_cycle_owned(GameState.owned_boots, GameState.boot))


func _physics_process(delta: float) -> void:
	if not player:
		return
	# Locked on: orbit the camera to keep the target in view (both touch + desktop),
	# so movement strafes around it. Unlocked = free look (desktop mouse / no auto).
	if aim_locked and not player_dead and _target_valid():
		var tb := locked_target.global_position - player.global_position; tb.y = 0
		if tb.length() > 0.5:
			# Track the target tightly so it stays centred and the bow lines up on it.
			# Snap near-instantly when standing still (rock-solid aim); ease while moving
			# so strafing around the boss doesn't whip the camera.
			var moving_now := touch_move.length() > 0.15 or Input.get_vector("move_left", "move_right", "move_up", "move_down").length() > 0.15
			var rate := (0.30 if touch_enabled else 0.35) if moving_now else 0.6
			yaw = lerp_angle(yaw, atan2(tb.x, tb.z) + PI, rate)
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
		# Keyboard (WASD) + gamepad left stick via the named action vector.
		var mv := Input.get_vector("move_left", "move_right", "move_up", "move_down")
		dir += rgt * mv.x - fwd * mv.y
		if touch_move.length() > 0.15: # virtual joystick (web/mobile)
			dir += rgt * touch_move.x - fwd * touch_move.y
	dir = dir.normalized()

	# Aim: hold middle-mouse (desktop) or always while on touch (auto-aim) — keeps the
	# bow drawn and the camera pulled in.
	aiming = (Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE) or touch_enabled) and not dodging and not player_dead
	# Aim cam sits over the LEFT shoulder (-X): the bow is held in the left hand, so a
	# right-shoulder cam pushed it off the target; left-shoulder lines the bow up on it.
	cam.position = cam.position.lerp(Vector3(-0.7, 0.1, 2.3) if aiming else cam_rest, 0.2)

	# Block (hold Q): raising guard cancels an in-progress swing (active-frames
	# rule). Can't block mid-dodge/aim. block_t feeds the parry window.
	var want_block := Input.is_physical_key_pressed(KEY_Q) and not dodging and not aiming and not player_dead and not is_archer
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
		var face_dir: Vector3
		if dodging:
			face_dir = dodge_dir # dodge rolls toward the joystick direction
		elif is_archer and aim_locked and _target_valid():
			# locked on: always face the target so the bow points at it (any platform)
			var tb := locked_target.global_position - player.global_position; tb.y = 0
			face_dir = tb.normalized() if tb.length() > 0.3 else fwd
		elif is_archer and aiming:
			face_dir = fwd # desktop free-aim: face the camera direction
		elif dir.length() > 0.1:
			face_dir = dir
		else:
			face_dir = fwd
		var target := atan2(face_dir.x, face_dir.z) + (PI if face_flip else 0.0)
		# Snap harder when locked on so the bow stays pointed at the target; softer
		# otherwise so free movement turns read smoothly.
		var face_rate := 0.5 if (is_archer and aim_locked and not dodging and _target_valid()) else 0.25
		model_facing = lerp_angle(model_facing, target, face_rate)
		model.rotation.y = model_facing
	# Upper-body 3D aim: pitch the spine so the bow tracks the target's height. Only
	# while actively aiming a locked target; eases in/out so it doesn't pop.
	if aim_mod:
		var want_aim := is_archer and aim_locked and aiming and not dodging and not player_dead and _target_valid()
		aim_mod.enabled = want_aim or aim_mod.blend > 0.001
		if want_aim:
			aim_mod.aim_target = _aim_target_pos()
		aim_mod.blend = move_toward(aim_mod.blend, 1.0 if want_aim else 0.0, delta * 6.0)
		# Nocked arrow: tail at the draw hand, tip pointing at the target (the shot line).
		nock_hide_t = maxf(0.0, nock_hide_t - delta)
		if nock_arrow:
			var show_nock := want_aim and nock_hide_t <= 0.0 and rhand_bone >= 0 and skel
			nock_arrow.visible = show_nock
			if show_nock:
				var tail: Vector3 = (skel.global_transform * skel.get_bone_global_pose(rhand_bone)).origin
				var ndir: Vector3 = (_aim_target_pos() - tail)
				if ndir.length() > 0.05:
					ndir = ndir.normalized()
					nock_arrow.global_position = tail + ndir * 0.42
					nock_arrow.look_at(nock_arrow.global_position - ndir, Vector3.UP)
	# Animation state: swings/dodge play their own one-shots; otherwise the archer
	# uses its dedicated state machine, else block pose / idle-run locomotion.
	if not attacking and not dodging:
		if is_archer:
			_archer_anim(dir, fwd, rgt)
		elif aiming and bowdraw_anim != "" and GameState.weapon_data().get("ranged", false):
			_play(bowdraw_anim) # draw/hold the bow while aiming
		elif blocking and block_anim != "":
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

	if not boss_dead and not player_dead and not pre_run:
		run_t += delta
	_update_auras()
	_update_boss(delta)
	_update_hazard(delta)
	_update_combat(delta)
	_update_hud()


# --- Boss -------------------------------------------------------------------
# Apply per-surface PBR to the golem IN-ENGINE (textures in models/golem_tex/),
# rather than baking them into the glb via Blender — the Blender round-trip
# damages the rig and flattens the baked animation. Maps each glb material-slot
# name to its texture set.
func _texture_golem(golem: Node3D) -> void:
	var keys := {
		"Corpo": "corpo", "Chifres": "chifres", "Garras": "garras",
		"PedrasPeito": "peito", "Pedras Costas": "costas",
		"DenteCima": "dentecima", "DenteBaixo": "dentebaixo", "NewMat01": "ombro",
	}
	for mi in golem.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = mi.mesh
		if mesh == null:
			continue
		for si in mesh.get_surface_count():
			var src := mesh.surface_get_material(si)
			var mname: String = src.resource_name if src else ""
			var mat := StandardMaterial3D.new()
			if mname == "Gold":
				mat.albedo_color = Color(0.83, 0.66, 0.22)
				mat.metallic = 1.0
				mat.roughness = 0.35
			elif keys.has(mname):
				var key: String = keys[mname]
				var alb := _gtex(key, "albedo")
				if alb:
					mat.albedo_texture = alb
				var nrm := _gtex(key, "normal")
				if nrm:
					mat.normal_enabled = true
					mat.normal_texture = nrm
				var rgh := _gtex(key, "rough")
				if rgh:
					mat.roughness_texture = rgh
			else:
				mat.albedo_color = Color(0.55, 0.55, 0.55)
			mi.set_surface_override_material(si, mat)


func _gtex(key: String, kind: String) -> Texture2D:
	var p := "res://models/golem_tex/%s_%s.png" % [key, kind]
	return load(p) if ResourceLoader.exists(p) else null


# Scale the boss to ~target_h metres, measured from its ANIMATED pose. This glb's
# REST skeleton is degenerate (Blender's texture re-export collapsed the bind
# pose to ~0), so AnimUtil.fit_height's rest measure divides into a ~172x runaway.
# The played pose carries the true size. Pad (1.18) accounts for the mesh
# silhouette extending past the outermost bones.
func _scale_boss_to(target_h: float) -> void:
	if not boss_skel or not boss_model:
		return
	boss_model.scale = Vector3.ONE
	boss_anim.advance(0.0)
	var lo := INF
	var hi := -INF
	for bi in boss_skel.get_bone_count():
		var wy: float = (boss_skel.global_transform * boss_skel.get_bone_global_pose(bi)).origin.y
		lo = min(lo, wy)
		hi = max(hi, wy)
	var span: float = hi - lo
	if span <= 0.0:
		return
	var s: float = target_h / (span * 1.18)
	boss_model.scale = Vector3(s, s, s)


# Plant the boss: shift boss_root.y once so the lowest bone in the idle pose
# sits on y=0. Called ONCE at build — the native idle keeps the feet planted, so
# a stable one-time offset is correct. (Re-grounding every frame made it shake/
# float, because a walk cycle constantly changes which bone is lowest.)
func _ground_boss() -> void:
	if not boss_skel or not boss_root:
		return
	var low_y := INF
	for bi in boss_skel.get_bone_count():
		var wy: float = (boss_skel.global_transform * boss_skel.get_bone_global_pose(bi)).origin.y
		low_y = min(low_y, wy)
	if low_y != INF:
		boss_root.position.y -= low_y


func _update_boss(delta: float) -> void:
	if boss_dead or not boss_root or pre_run:
		return
	boss_stagger_t = max(0.0, boss_stagger_t - delta)
	_boss_phase_check()
	var to := player.global_position - boss_root.global_position
	to.y = 0
	var dist := to.length()
	if dist > 0.2 and boss_state != "dash":
		boss_root.rotation.y = atan2(to.x, to.z)

	if boss_flash > 0.0:
		boss_flash = max(0.0, boss_flash - delta)
	if boss_mat:
		boss_mat.emission_enabled = boss_flash > 0.0
		if boss_flash > 0.0:
			boss_mat.emission = Color(0.6, 0.5, 0.4)

	var spd_mult := 1.0 + 0.28 * (boss_phase - 1)
	var dmg_mult := (1.0 + 0.22 * (boss_phase - 1)) * float(DIFF_DMG[difficulty])
	match boss_state:
		"idle":
			if dist > 4.5:
				boss_root.global_position += to.normalized() * (2.2 * spd_mult) * delta
				_boss_play(boss_walk)
			else:
				_boss_play(boss_idle)
			boss_cd -= delta
			if boss_cd <= 0.0 and dist < 24.0:
				_boss_choose(dist)
		"windup":
			boss_t -= delta
			var k: float = clamp(1.0 - boss_t / max(0.01, boss_windup), 0.0, 1.0)
			slam_mat.albedo_color = Color(1, 0.3 - 0.12 * k, 0.12, 0.22 + k * 0.55)
			if boss_t <= 0.0:
				_boss_strike(dmg_mult)
		"dash":
			boss_t -= delta
			boss_root.global_position += dash_vec * delta
			if not dash_hit:
				var d2 := player.global_position - boss_root.global_position
				d2.y = 0
				if d2.length() < 2.7:
					_damage_player(int(round(DASH_DMG * dmg_mult)))
					dash_hit = true
			if boss_t <= 0.0:
				boss_state = "recover"; boss_t = 0.6; slam_ring.visible = false
		"recover":
			boss_t -= delta
			if boss_t <= 0.0:
				boss_state = "idle"
				boss_cd = BOSS_BASE_CD * (1.0 - 0.16 * (boss_phase - 1))
				slam_ring.visible = false
	_update_rocks(delta)


# Bump the phase when a health third empties: stagger, roar, escalate.
func _boss_phase_check() -> void:
	var frac := boss_hp / boss_max
	var ph := 1 if frac > 2.0 / 3.0 else (2 if frac > 1.0 / 3.0 else 3)
	if ph > boss_phase and boss_hp > 0.0:
		boss_phase = ph
		boss_state = "recover"; boss_t = PHASE_STAGGER; boss_cd = 0.0
		boss_stagger_t = PHASE_STAGGER + 0.8 # punish window: boss takes bonus damage
		slam_ring.visible = false
		if boss_roar != "":
			_boss_play(boss_roar)
		_banner("PHASE %d — STAGGER!" % ph)


# Pick an attack by range + phase, set its telegraph + windup + clip.
func _boss_choose(dist: float) -> void:
	var r := randf()
	var kind := "slam"
	if dist < 6.0:
		kind = "smash"
	elif dist > 14.0:
		kind = "scatter" if r < 0.6 else "slam"
	else:
		kind = "charge" if r < 0.5 else "slam"
	if boss_phase >= 2 and r > 0.82:
		kind = "quake"
	boss_kind = kind
	var wm := (1.0 - 0.12 * (boss_phase - 1)) * float(DIFF_WIN[difficulty]) # harder = faster telegraphs
	match kind:
		"smash":
			boss_windup = 0.85 * wm; _telegraph(boss_root.global_position, SMASH_R)
			_boss_play(boss_smash if boss_smash != "" else boss_attack)
		"slam":
			boss_windup = 1.0 * wm
			var t := player.global_position; t.y = 0.05
			_telegraph(t, SLAM_RADIUS); _boss_play(boss_attack)
		"charge":
			boss_windup = 0.55 * wm; _telegraph(boss_root.global_position, 2.4)
			_boss_play(boss_charge if boss_charge != "" else boss_attack)
		"scatter":
			boss_windup = 0.8 * wm; _telegraph(boss_root.global_position, 3.0)
			_boss_play(boss_swipe if boss_swipe != "" else boss_attack)
		"quake":
			boss_windup = 1.15 * wm; _telegraph(boss_root.global_position, QUAKE_R)
			_boss_play(boss_quake if boss_quake != "" else boss_attack)
	boss_state = "windup"; boss_t = boss_windup


func _telegraph(center: Vector3, radius: float) -> void:
	boss_tele_center = center; boss_tele_r = radius
	slam_ring.global_position = Vector3(center.x, 0.05, center.z)
	slam_ring.scale = Vector3(radius / SLAM_RADIUS, 1.0, radius / SLAM_RADIUS)
	slam_mat.albedo_color = Color(1, 0.3, 0.12, 0.25)
	slam_ring.visible = true


func _player_within(center: Vector3, r: float) -> bool:
	var d := player.global_position - center; d.y = 0
	return d.length() < r + 0.4


# Resolve the active pattern's effect.
func _boss_strike(dmg_mult: float) -> void:
	slam_mat.albedo_color = Color(1, 0.55, 0.2, 0.85)
	match boss_kind:
		"smash":
			if _player_within(boss_root.global_position, SMASH_R):
				_damage_player(int(round(SMASH_DMG * dmg_mult)))
			_spawn_shock(boss_root.global_position, SMASH_R)
			boss_state = "recover"; boss_t = 0.55
		"slam":
			if _player_within(boss_tele_center, SLAM_RADIUS):
				_damage_player(int(round(SLAM_DMG * dmg_mult)))
			boss_state = "recover"; boss_t = 0.55
		"quake":
			_damage_player(int(round(QUAKE_DMG * dmg_mult))) # i-frames (dodge) skip it
			_spawn_shock(boss_root.global_position, QUAKE_R)
			boss_state = "recover"; boss_t = 0.9
		"charge":
			var to := player.global_position - boss_root.global_position; to.y = 0
			dash_vec = to.normalized() * (DASH_SPEED * (1.0 + 0.28 * (boss_phase - 1)))
			dash_hit = false
			boss_state = "dash"; boss_t = DASH_TIME; slam_ring.visible = false
		"scatter":
			_spawn_scatter(int(round(SCATTER_DMG * dmg_mult)))
			boss_state = "recover"; boss_t = 0.6


# A quick expanding ground ring (dust) — pure visual for smash/quake impacts.
func _spawn_shock(center: Vector3, radius: float) -> void:
	var s := MeshInstance3D.new()
	var cyl := CylinderMesh.new(); cyl.top_radius = 0.5; cyl.bottom_radius = 0.5; cyl.height = 0.1; cyl.radial_segments = 32
	s.mesh = cyl
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.85, 0.75, 0.55, 0.6); mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true; mat.emission = Color(0.8, 0.6, 0.3)
	s.material_override = mat; add_child(s); s.global_position = Vector3(center.x, 0.06, center.z)
	var tw := create_tween(); tw.set_parallel(true)
	tw.tween_property(s, "scale", Vector3(radius / 0.5, 1.0, radius / 0.5), 0.35)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.35)
	tw.chain().tween_callback(s.queue_free)


# Scatter: fling rocks radially from the boss; they arc and hit the player.
func _spawn_scatter(dmg: int) -> void:
	var origin := boss_root.global_position + Vector3(0, 2.0, 0)
	for k in SCATTER_COUNT:
		var ang := TAU * float(k) / float(SCATTER_COUNT)
		var dir := Vector3(cos(ang), 0, sin(ang))
		var rock := MeshInstance3D.new()
		var sm := SphereMesh.new(); sm.radius = 0.35; sm.height = 0.7; rock.mesh = sm
		var mat := StandardMaterial3D.new(); mat.albedo_color = Color(0.4, 0.36, 0.32); rock.material_override = mat
		add_child(rock); rock.global_position = origin
		boss_rocks.append({"mesh": rock, "vel": dir * SCATTER_SPEED + Vector3.UP * 4.5, "life": 3.0, "dmg": dmg})


func _update_rocks(delta: float) -> void:
	for i in range(boss_rocks.size() - 1, -1, -1):
		var rk = boss_rocks[i]
		rk.vel.y -= gravity * delta
		rk.mesh.global_position += rk.vel * delta
		rk.life -= delta
		var done := false
		if (player.global_position - rk.mesh.global_position).length() < 1.0:
			_damage_player(rk.dmg); done = true
		if done or rk.life <= 0.0 or rk.mesh.global_position.y < 0.0:
			rk.mesh.queue_free(); boss_rocks.remove_at(i)


func _damage_player(dmg: int) -> void:
	if player_invuln > 0.0 or player_dead:
		if deflect_t > 0.0:
			run_deflect_ok += 1 # a hit landed inside the deflect window -> negated
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
	run_dmg += taken # track for the run grade
	player_invuln = 0.7
	if is_archer:
		special = min(1.0, special + SPECIAL_GAIN_TAKEN) # taking hits also builds the meter
	if player_hp <= 0.0:
		_player_die()
	elif is_archer and a_hit != "" and anim and anim.has_animation(a_hit):
		player_hit_t = minf(0.5, anim.get_animation(a_hit).length) # brief flinch


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
	# Per-floor mastery: +5% damage per prior clear of this floor (C9 proficiency).
	dmg = int(round(dmg * (1.0 + 0.05 * GameState.floor_mastery(current_floor))))
	# Stagger punish window (during a phase-transition roar): bonus damage.
	if boss_stagger_t > 0.0:
		dmg = int(round(dmg * 1.6))
		boss_flash = 0.2
	boss_hp = max(0.0, boss_hp - dmg)
	boss_flash = 0.12
	_spawn_damage(boss_root.global_position + Vector3(0, 4.6, 0), dmg)
	if is_archer:
		special = min(1.0, special + SPECIAL_GAIN_HIT * (1.0 + 0.15 * GameState.skill_rank("storm")))
	if boss_hp <= 0.0:
		_boss_die()


# Grade a clear from how cleanly it was won. Returns {grade, keys, score}.
func _grade_run() -> Dictionary:
	var dmg_frac: float = run_dmg / max(1.0, player_max)   # total damage taken / max HP
	var time_pen: float = clampf((run_t - 35.0) / 60.0, 0.0, 1.0) # over ~35s starts costing
	var score: float = clampf(100.0 - dmg_frac * 70.0 - time_pen * 35.0 + float(run_deflect_ok) * 4.0, 0.0, 100.0)
	var grade := "BAD"; var keys := 1
	if run_dmg <= 0.0: grade = "PERFECT"; keys = 4
	elif score >= 80.0: grade = "EXCELLENT"; keys = 3
	elif score >= 55.0: grade = "GOOD"; keys = 2
	elif score >= 30.0: grade = "NORMAL"; keys = 1
	else: grade = "BAD"; keys = 1
	return {"grade": grade, "keys": keys, "score": int(score)}


func _boss_die() -> void:
	if run_scored:
		return
	run_scored = true
	boss_dead = true
	boss_root.visible = false
	slam_ring.visible = false
	GameState.grant_boss_reward()
	GameState.add_floor_clear(current_floor) # per-floor mastery + autosave
	var res := _grade_run()
	# Better play -> more loot keys -> more rolls.
	var loot := []
	for i in int(res.keys):
		loot.append(String(GameState.roll_loot().get("name", "?")))
	if menu:
		menu.refresh()
	last_res = res; last_loot = loot
	_show_results(res, loot)


func _continue_run() -> void:
	# After a clear, reset and return to the floor/difficulty select (lets the player
	# bump difficulty as they get stronger — the C9-style replay loop).
	boss_dead = false; boss_state = "idle"; boss_phase = 1
	boss_root.global_position = boss_pos; boss_root.visible = true
	run_t = 0.0; run_dmg = 0.0; run_dodges = 0; run_deflect_ok = 0; run_scored = false
	player_hp = player_max; special = 0.0; boss_stagger_t = 0.0
	_show_floor_select()


# C9-style results screen: grade + run stats + loot, then a touch-friendly UPGRADE
# panel (spend SP on archer-skill ranks, free respec) and CONTINUE. Buttons are
# fraction-anchored so the raw-input tap hit-test (in _input) matches the visuals.
func _show_results(res: Dictionary, loot: Array) -> void:
	if results_layer:
		results_layer.queue_free()
	result_buttons = []
	results_layer = CanvasLayer.new(); results_layer.layer = 20
	add_child(results_layer)
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT); dim.color = Color(0, 0, 0, 0.72)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	results_layer.add_child(dim)
	var grade_col := {"PERFECT": Color(1, 0.85, 0.3), "EXCELLENT": Color(0.5, 1, 0.6), "GOOD": Color(0.5, 0.85, 1), "NORMAL": Color(0.85, 0.85, 0.9), "BAD": Color(0.9, 0.5, 0.4)}
	_res_label(res.grade, 0.5, 0.10, 60, grade_col.get(res.grade, Color.WHITE))
	_res_label("Time %.0fs   ·   Damage %d   ·   Deflects %d   ·   %d Keys" % [run_t, int(run_dmg), run_deflect_ok, int(res.keys)], 0.5, 0.22, 20, Color(0.9, 0.9, 0.95))
	_res_label("Loot: " + (", ".join(loot) if loot.size() > 0 else "—"), 0.5, 0.28, 18, Color(1, 0.9, 0.6))
	_res_label("Lv %d   ·   Floor mastery x%d   ·   Skill Points: %d" % [GameState.level, GameState.floor_mastery(current_floor), GameState.skill_points], 0.5, 0.34, 20, Color(0.6, 0.95, 1))
	# upgrade grid (2 cols x 3 rows)
	var ids := ["spread", "volley", "explosive", "pierce", "deflect", "storm"]
	for i in ids.size():
		var id: String = ids[i]
		var col := i % 2; var row := i / 2
		var fx := 0.30 + col * 0.28
		var fy := 0.42 + row * 0.11
		var s: Dictionary = GameState.skills[id]
		var maxed: bool = int(s["rank"]) >= int(s["max_rank"])
		var lockd: bool = not GameState.level_ok(id)
		var label := "%s  Lv%d/%d" % [String(s["name"]), int(s["rank"]), int(s["max_rank"])]
		if lockd: label = "%s  (Lv%d)" % [String(s["name"]), int(s["req_level"])]
		elif not maxed: label += "  [+]"
		var can := GameState.can_afford(id) and not maxed
		_res_button(label, Rect2(fx, fy, 0.26, 0.09), (func(): _upgrade(id)) if can else Callable(), can)
	# respec + continue
	_res_button("RESPEC (free)", Rect2(0.30, 0.77, 0.26, 0.08), func(): _respec(), GameState.skill_points >= 0)
	_res_button("CONTINUE", Rect2(0.58, 0.77, 0.26, 0.08), func(): _continue_run(), true)


func _res_label(text: String, fx: float, fy: float, size: int, col: Color) -> void:
	var l := Label.new()
	l.text = text; l.add_theme_font_size_override("font_size", size); l.modulate = col
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.anchor_left = fx - 0.45; l.anchor_right = fx + 0.45; l.anchor_top = fy; l.anchor_bottom = fy
	l.offset_left = 0; l.offset_right = 0; l.offset_top = -22; l.offset_bottom = 22
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	results_layer.add_child(l)


func _res_button(label: String, frac: Rect2, cb: Callable, enabled: bool) -> void:
	var p := Panel.new()
	p.anchor_left = frac.position.x; p.anchor_top = frac.position.y
	p.anchor_right = frac.position.x + frac.size.x; p.anchor_bottom = frac.position.y + frac.size.y
	p.offset_left = 0; p.offset_top = 0; p.offset_right = 0; p.offset_bottom = 0
	p.modulate = Color(1, 1, 1, 0.85) if enabled else Color(0.5, 0.5, 0.55, 0.6)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := Label.new(); l.text = label; l.set_anchors_preset(Control.PRESET_FULL_RECT)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", 20)
	p.add_child(l); results_layer.add_child(p)
	if enabled and cb.is_valid():
		result_buttons.append({"frac": frac, "cb": cb})


func _upgrade(id: String) -> void:
	if GameState.unlock_or_rank(id):
		_show_results(last_res, last_loot) # refresh the panel with new ranks/SP


func _respec() -> void:
	GameState.respec()
	_show_results(last_res, last_loot)


# Floor entrance / difficulty select (Milestone 3). The boss is paused (pre_run)
# until a difficulty is chosen — this formalizes the floor session loop.
func _show_floor_select() -> void:
	pre_run = true
	if results_layer:
		results_layer.queue_free()
	result_buttons = []
	results_layer = CanvasLayer.new(); results_layer.layer = 20; add_child(results_layer)
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT); dim.color = Color(0, 0, 0, 0.72)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE; results_layer.add_child(dim)
	_res_label("FLOOR 1", 0.5, 0.14, 54, Color(1, 0.9, 0.5))
	_res_label("THE BRUTE", 0.5, 0.24, 30, Color(0.9, 0.9, 0.95))
	_res_label("Lv %d   ·   Floor mastery x%d   ·   SP %d   —   choose difficulty" % [GameState.level, GameState.floor_mastery(current_floor), GameState.skill_points], 0.5, 0.33, 19, Color(0.6, 0.95, 1))
	for i in DIFF_NAMES.size():
		var d := i
		var fy := 0.42 + i * 0.115
		_res_button("%s    (boss HP x%.1f · dmg x%.1f)" % [DIFF_NAMES[i], DIFF_HP[i], DIFF_DMG[i]], Rect2(0.32, fy, 0.36, 0.095), func(): _start_floor(d), true)


func _start_floor(d: int) -> void:
	difficulty = clampi(d, 0, DIFF_NAMES.size() - 1)
	boss_max = BOSS_MAX * float(DIFF_HP[difficulty])
	if results_layer:
		results_layer.queue_free(); results_layer = null
	result_buttons = []
	pre_run = false
	boss_hp = boss_max; boss_dead = false; boss_state = "idle"; boss_phase = 1; boss_cd = 2.5
	boss_root.global_position = boss_pos; boss_root.visible = true
	run_t = 0.0; run_dmg = 0.0; run_dodges = 0; run_deflect_ok = 0; run_scored = false
	player_hp = player_max; special = 0.0; boss_stagger_t = 0.0; hazard_t = 3.5
	locked_target = boss_root; aim_locked = true # lock onto the boss
	_banner("%s" % DIFF_NAMES[difficulty])


# Falling-rock hazard (Hard+): a telegraphed shadow, then a rock drops for AoE.
func _update_hazard(delta: float) -> void:
	if difficulty < 1 or pre_run or boss_dead or player_dead:
		return
	hazard_t -= delta
	if hazard_t <= 0.0:
		hazard_t = 4.2 - difficulty * 0.7
		_spawn_falling_rock(player.global_position)


func _spawn_falling_rock(pos: Vector3) -> void:
	pos.y = 0.0
	var sh := MeshInstance3D.new()
	var c := CylinderMesh.new(); c.top_radius = 1.7; c.bottom_radius = 1.7; c.height = 0.05; c.radial_segments = 24
	sh.mesh = c
	var sm := StandardMaterial3D.new(); sm.albedo_color = Color(0.85, 0.1, 0.1, 0.4)
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; sm.emission_enabled = true; sm.emission = Color(0.8, 0.1, 0.1)
	sh.material_override = sm; add_child(sh); sh.global_position = pos + Vector3(0, 0.06, 0)
	var rock := MeshInstance3D.new()
	var s2 := SphereMesh.new(); s2.radius = 0.8; s2.height = 1.6; rock.mesh = s2
	var rm := StandardMaterial3D.new(); rm.albedo_color = Color(0.4, 0.36, 0.32); rock.material_override = rm
	add_child(rock); rock.global_position = pos + Vector3(0, 13, 0)
	var tw := create_tween()
	tw.tween_property(rock, "global_position", pos + Vector3(0, 0.8, 0), 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_callback(_rock_land.bind(pos, sh, rock))


func _rock_land(pos: Vector3, sh: Node, rock: Node) -> void:
	if not player_dead and (player.global_position - pos).length() < 1.9:
		_damage_player(int(round(14 * float(DIFF_DMG[difficulty]))))
	_spawn_shock(pos, 1.9)
	if is_instance_valid(sh): sh.queue_free()
	if is_instance_valid(rock): rock.queue_free()


# A translucent unshaded capsule used as a readable i-frame aura on the player.
func _make_aura(c: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var cap := CapsuleMesh.new(); cap.radius = 0.55; cap.height = 1.9
	m.mesh = cap; m.position = Vector3(0, 0.95, 0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(c.r, c.g, c.b, 0.25)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true; mat.emission = c
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.material_override = mat; m.visible = false
	return m


# Dodge i-frame read: a flat glowing ring at the feet (a dash sweep), NOT a body
# bubble — reads as "dodging" without the odd shell around the character.
func _make_dodge_ring() -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var t := TorusMesh.new(); t.inner_radius = 0.5; t.outer_radius = 0.92; t.rings = 28; t.ring_segments = 18
	m.mesh = t; m.position = Vector3(0, 0.06, 0) # TorusMesh is Y-aligned -> already lies flat on the ground
	var mat := StandardMaterial3D.new()
	# Alpha-blended saturated cyan (NOT additive — additive washes out on the bright
	# sandy floor). Cyan contrasts the orange ground so the i-frame read stays clear.
	mat.albedo_color = Color(0.15, 0.9, 1.0, 0.9)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true; mat.emission = Color(0.2, 0.8, 1.0); mat.emission_energy_multiplier = 1.6
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.material_override = mat; m.visible = false
	return m


# Toggle the defensive auras + the boss-windup danger flash each frame.
func _update_auras() -> void:
	if dodge_aura: dodge_aura.visible = dodging
	if deflect_aura: deflect_aura.visible = deflect_t > 0.0
	if boss_warn:
		var warn := (not boss_dead) and boss_state == "windup"
		boss_warn.visible = warn
		if warn:
			boss_warn.color = Color(1.0, 0.1, 0.1, 0.10 + 0.10 * absf(sin(run_t * 14.0)))


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
	var mv := Input.get_vector("move_left", "move_right", "move_up", "move_down") # keyboard+stick
	d += rgt * mv.x - fwd * mv.y
	if touch_move.length() > 0.15: # joystick direction on touch
		d += rgt * touch_move.x - fwd * touch_move.y
	dodge_dir = d.normalized() if d.length() > 0.1 else fwd
	run_dodges += 1
	dodging = true
	dodge_t = DODGE_TIME
	_cancel_swing() # dodge cancels any swing (active-frames rule)
	player_invuln = max(player_invuln, dodge_iframes)
	# Pick a directional dodge clip and play it FAST enough to actually read within
	# the short dodge window (the long roll otherwise only shows its standing wind-up
	# -> looks like a slide). Direction is relative to where the character faces.
	var clip := dodge_anim
	if is_archer:
		var f := dodge_dir.dot(fwd)
		var r := dodge_dir.dot(rgt)
		if absf(r) > absf(f) and (a_strafe_l != "" or a_strafe_r != ""):
			clip = a_dodge_r if r > 0.0 else a_dodge_l
		elif f < -0.2 and a_dodge_b != "":
			clip = a_dodge_b
		else:
			clip = a_roll
	if clip != "" and anim and anim.has_animation(clip):
		var ln: float = anim.get_animation(clip).length
		var spd: float = clampf(ln / (DODGE_TIME * 0.92), 1.0, 8.0) # play the FULL roll within the dodge window (don't cut it short)
		anim.play(clip, 0.05, spd)
		cur_anim = clip


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


func _play_shoot() -> void:
	if is_archer and a_shoot != "" and anim and anim.has_animation(a_shoot):
		shoot_t = anim.get_animation(a_shoot).length


# Spawn one arrow. yaw_off fans it around world-up (spread/volley); mult scales the
# impact damage; speed_mult scales launch speed; explosive/pierce tag its behaviour.
func _fire_arrow(yaw_off: float, mult: float, speed_mult: float, explosive: bool, pierce: bool) -> void:
	nock_hide_t = 0.18 # the nocked arrow just flew off -> hide it, re-nock shortly after
	var mass := _arrow_mass()
	var v0 := _arrow_v0() * speed_mult
	var bolt: Node3D
	var arrow_scene = load("res://models/weapons/arrow1.glb")
	if arrow_scene:
		bolt = arrow_scene.instantiate()
		add_child(bolt)
		var asz: Vector3 = _aabb_of(bolt).size # tiny source; scale long axis to ~0.8 m
		var along: float = max(asz.x, max(asz.y, asz.z))
		if along > 0.0:
			bolt.scale = Vector3.ONE * (0.8 / along)
	else:
		var ms := MeshInstance3D.new()
		var sm := SphereMesh.new(); sm.radius = 0.12; sm.height = 0.24
		ms.mesh = sm; bolt = ms; add_child(bolt)
	# spawn from the BOW (archer) so the arrow leaves the hand, not the body
	if bow_node and is_instance_valid(bow_node):
		bolt.global_position = bow_node.global_position
	else:
		bolt.position = player.global_position + Vector3(0, 1.2, 0)
	# Aim: when locked on, fire STRAIGHT at the target (any platform); otherwise the
	# camera forward. No arc — arrows shoot straight at where we're aiming.
	var base_aim := -cam.global_transform.basis.z
	if aim_locked and _target_valid():
		base_aim = (_aim_target_pos() - bolt.global_position)
	var aim := base_aim.normalized().rotated(Vector3.UP, yaw_off)
	projectiles.append({"mesh": bolt, "vel": aim * v0, "mass": mass,
		"dmg": int(GameState.weapon_data().get("damage", 0)), "mult": mult,
		"life": 4.0, "explosive": explosive, "pierce": pierce, "hits": []})


func _target_valid() -> bool:
	return locked_target != null and is_instance_valid(locked_target) and not boss_dead


# Where we aim/face on the locked target (chest height).
func _aim_target_pos() -> Vector3:
	if not _target_valid():
		return player.global_position - cam.global_transform.basis.z
	# Aim at the boss's CHEST bone, not root+2: the bone moves with the animation, so
	# the bow + arrow track the boss when it leaps/slams (the root stays grounded).
	if boss_skel:
		var cb := boss_skel.find_bone("mixamorig_Spine2")
		if cb < 0:
			cb = boss_skel.find_bone("mixamorig_Spine1")
		if cb < 0:
			cb = boss_skel.find_bone("mixamorig_Spine")
		if cb >= 0:
			return (boss_skel.global_transform * boss_skel.get_bone_global_pose(cb)).origin
	return locked_target.global_position + Vector3(0, 2.0, 0)


func _toggle_lock() -> void:
	aim_locked = not aim_locked


# Cycle targets (only the boss exists now; the system is ready for multiple enemies).
func _cycle_target(_dir: int) -> void:
	if boss_root and not boss_dead:
		locked_target = boss_root; aim_locked = true


# Quick shot (LMB).
func _do_ranged() -> void:
	if ranged_cd > 0.0 or player_dead:
		return
	if is_archer and stamina < STA_QUICK:
		return
	if attacking:
		_cancel_swing() # a shot cancels an in-progress swing
	ranged_cd = RANGED_CD
	_play_shoot()
	if is_archer:
		stamina -= STA_QUICK; sta_regen_t = STA_REGEN_DELAY
	_fire_arrow(0.0, 1.0, 1.0, false, false)


# Power shot — heavier, faster single arrow (RMB).
func _shot_power() -> void:
	if ranged_cd > 0.0 or player_dead or stamina < STA_POWER:
		return
	ranged_cd = RANGED_CD * 1.7; _play_shoot()
	stamina -= STA_POWER; sta_regen_t = STA_REGEN_DELAY
	_fire_arrow(0.0, POWER_MULT, 1.12, false, false)


# Spread — 3-arrow horizontal fan (key 1).
func _shot_spread() -> void:
	if ranged_cd > 0.0 or player_dead or stamina < STA_SPREAD:
		return
	ranged_cd = RANGED_CD * 1.3; _play_shoot()
	stamina -= STA_SPREAD; sta_regen_t = STA_REGEN_DELAY
	var n := SPREAD_COUNT + GameState.skill_rank("spread") # +1 arrow / rank
	var step := SPREAD_ARC / float(max(1, n - 1))
	for k in n:
		_fire_arrow((k - (n - 1) / 2.0) * step, 1.0, 1.0, false, false)


# Volley — 5-arrow burst on a cooldown (key 2).
func _skill_volley() -> void:
	if cd_volley > 0.0 or player_dead:
		return
	var vr := GameState.skill_rank("volley")
	cd_volley = CD_VOLLEY * (1.0 - 0.1 * vr); _play_shoot()
	var n := VOLLEY_COUNT + vr
	for k in n:
		_fire_arrow((k - (n - 1) / 2.0) * VOLLEY_ARC, 0.7, 1.0, false, false)


# Explosive arrow — AoE on impact (key 3).
func _skill_explosive() -> void:
	if cd_explosive > 0.0 or player_dead:
		return
	cd_explosive = CD_EXPLOSIVE; _play_shoot()
	_fire_arrow(0.0, 0.8, 0.9, true, false)


# Piercing bolt — fast, high damage, passes through (key 4).
func _skill_pierce() -> void:
	if cd_pierce > 0.0 or player_dead:
		return
	cd_pierce = CD_PIERCE; _play_shoot()
	_fire_arrow(0.0, PIERCE_MULT + 0.3 * GameState.skill_rank("pierce"), 1.3, false, true)


# Deflect — brief reflect window + i-frames (Q).
func _skill_deflect() -> void:
	if cd_deflect > 0.0 or player_dead:
		return
	var dt := DEFLECT_TIME + 0.05 * GameState.skill_rank("deflect")
	cd_deflect = CD_DEFLECT; deflect_t = dt
	player_invuln = max(player_invuln, dt)


# Arrow Storm — needs a full special meter (X).
func _special_storm() -> void:
	if cd_storm > 0.0 or special < 1.0 or player_dead:
		return
	cd_storm = CD_STORM; special = 0.0; _play_shoot()
	var n := STORM_COUNT + 2 * GameState.skill_rank("storm")
	for k in n:
		_fire_arrow((k - (n - 1) / 2.0) * 0.06, 1.0, 1.0 + 0.015 * k, false, false)


# Archer ability hotkeys. Returns true if the key was an ability (so input routing
# knows it was handled). 1 spread · 2 volley · 3 explosive · 4 pierce · Q deflect ·
# X arrow storm. (LMB quick, RMB power, Space dodge are handled elsewhere.)
func _archer_key(kc: int) -> bool:
	match kc:
		KEY_1: _shot_spread(); return true
		KEY_2: _skill_volley(); return true
		KEY_3: _skill_explosive(); return true
		KEY_4: _skill_pierce(); return true
		KEY_Q: _skill_deflect(); return true
		KEY_X: _special_storm(); return true
	return false


# AoE blast: damage targets near `pos` + a quick expanding flash. Scales with the
# Explosive Arrow skill rank.
func _explode(pos: Vector3) -> void:
	var er := GameState.skill_rank("explosive")
	var rad := EXPLOSIVE_R + 0.4 * er
	var dmg := int(round(EXPLOSIVE_DMG * (1.0 + 0.25 * er)))
	if not boss_dead and boss_root and boss_root.global_position.distance_to(pos) < rad + 1.5:
		_hit_boss(dmg)
	if dummy_pos.distance_to(pos) < rad:
		_hit_dummy(dmg)
	var s := MeshInstance3D.new()
	var sm := SphereMesh.new(); sm.radius = 0.35; sm.height = 0.7; s.mesh = sm
	var mat := StandardMaterial3D.new()
	mat.emission_enabled = true; mat.emission = Color(1.0, 0.6, 0.2)
	mat.albedo_color = Color(1.0, 0.6, 0.2, 0.7)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	s.material_override = mat; add_child(s); s.global_position = pos
	var tw := create_tween(); tw.set_parallel(true)
	tw.tween_property(s, "scale", Vector3.ONE * (rad / 0.35), 0.3)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.3)
	tw.chain().tween_callback(s.queue_free)


func _update_combat(delta: float) -> void:
	melee_cd = max(0.0, melee_cd - delta)
	ranged_cd = max(0.0, ranged_cd - delta)
	shoot_t = max(0.0, shoot_t - delta)       # archer release one-shot timer
	player_hit_t = max(0.0, player_hit_t - delta) # archer flinch timer
	if is_archer:
		sta_regen_t = max(0.0, sta_regen_t - delta)
		if sta_regen_t <= 0.0:
			stamina = min(STAMINA_MAX, stamina + STA_REGEN * delta)
		cd_volley = max(0.0, cd_volley - delta)
		cd_explosive = max(0.0, cd_explosive - delta)
		cd_pierce = max(0.0, cd_pierce - delta)
		cd_deflect = max(0.0, cd_deflect - delta)
		cd_storm = max(0.0, cd_storm - delta)
		deflect_t = max(0.0, deflect_t - delta)

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
		# Point the arrow along its flight (shaft is +Z, so aim -Z backward).
		if p.vel.length() > 0.1:
			var up: Vector3 = Vector3.UP if absf(p.vel.normalized().y) < 0.99 else Vector3.FORWARD
			p.mesh.look_at(p.mesh.global_position - p.vel, up)
		p.life -= delta
		# Kinetic-energy damage at impact: (0.5*m*v^2 + bow damage) * ability mult.
		var ke_dmg := int(round((0.5 * p.mass * p.vel.length_squared() + p.dmg) * float(p.get("mult", 1.0))))
		var done := false
		# pierce arrows pass through (one hit per target, tracked in p.hits); explosive
		# arrows detonate an AoE; plain arrows stop on first hit.
		if p.mesh.position.distance_to(dcenter) < 0.7 and not ("dummy" in p.hits):
			_hit_dummy(ke_dmg); p.hits.append("dummy")
			if p.explosive: _explode(p.mesh.position); done = true
			elif not p.pierce: done = true
		elif not boss_dead and p.mesh.position.distance_to(bcenter) < 2.2 and not ("boss" in p.hits):
			_hit_boss(ke_dmg); p.hits.append("boss")
			if p.explosive: _explode(p.mesh.position); done = true
			elif not p.pierce: done = true
		if not done and p.explosive and p.mesh.position.y < 0.0:
			_explode(p.mesh.position); done = true
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
		hud_boss_fill.size = Vector2(596.0 * (boss_hp / max(1.0, boss_max)), 14)
	if is_archer:
		if hud_stamina_fill:
			hud_stamina_fill.size = Vector2(216.0 * clampf(stamina / STAMINA_MAX, 0.0, 1.0), 8)
		if hud_special_fill:
			hud_special_fill.size = Vector2(216.0 * clampf(special, 0.0, 1.0), 6)
			hud_special_fill.color = Color(1.0, 0.85, 0.3) if special >= 1.0 else Color(0.40, 0.85, 1.0)
		if hud_cd:
			var parts := []
			if cd_volley > 0.0: parts.append("Volley %.0f" % ceil(cd_volley))
			if cd_explosive > 0.0: parts.append("Expl %.0f" % ceil(cd_explosive))
			if cd_pierce > 0.0: parts.append("Pierce %.0f" % ceil(cd_pierce))
			if cd_deflect > 0.0: parts.append("Deflect %.0f" % ceil(cd_deflect))
			if cd_storm > 0.0: parts.append("Storm %.0f" % ceil(cd_storm))
			hud_cd.text = "   ".join(parts)
