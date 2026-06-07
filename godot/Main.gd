# Bossraid — Godot Floor-1 test scene (built in code so the .tscn stays trivial).
#
# Open arena, third-person animated player, a training dummy, and a Floor-1 boss
# (Stone Golem) that chases and does telegraphed ground slams. Player + boss have
# HP and a HUD. See CLAUDE.md for the roadmap.
#
# Controls: WASD move, mouse look (click to capture / Esc release), Shift sprint,
# Space jump, Left-click melee, Right-click ranged.

extends Node3D

const WALK := 4.5
const SPRINT := 8.0
const JUMP := 5.0
const MOUSE_SENS := 0.0025
const CHARACTER := "res://models/Soldier.glb"
const MODEL_FACE_FLIP := true # set false if the character faces backward
const MELEE_RANGE := 2.6
const PROJ_SPEED := 24.0

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
var attack_anim := ""
var attacking := false
var face_flip := true
var weapon: MeshInstance3D
var weapon_attach: BoneAttachment3D
var weapon_scaled := false
var model_facing := 0.0

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
var ranged_cd := 0.0
var projectiles: Array = []

# HUD
var hud_player_fill: ColorRect
var hud_boss_fill: ColorRect
var hud_banner: Label


func _ready() -> void:
	_build_environment()
	_build_ground()
	_build_dummy(dummy_pos)
	_build_boss(boss_pos)
	_build_player(player_spawn)
	_build_hud()


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
	var core := MeshInstance3D.new()
	var sph := SphereMesh.new()
	sph.radius = 0.7
	sph.height = 1.4
	var cm := StandardMaterial3D.new()
	cm.albedo_color = Color(1, 0.5, 0.2)
	cm.emission_enabled = true
	cm.emission = Color(1, 0.4, 0.1)
	cm.emission_energy_multiplier = 2.0
	sph.material = cm
	core.mesh = sph
	core.position = Vector3(0, 2.4, 0)
	boss_root.add_child(core)
	boss_root.position = pos
	add_child(boss_root)

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
	name_label.text = "STONE GOLEM"
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
	if idle_anim == "" and list.size() > 0:
		idle_anim = list[0]
	if run_anim == "":
		run_anim = idle_anim
	# Imported glTF clips don't loop by default — loop only locomotion.
	_set_loop(idle_anim, true)
	_set_loop(run_anim, true)
	_set_loop(attack_anim, false) # one-shot
	anim.animation_finished.connect(_on_anim_finished)
	if idle_anim != "":
		anim.play(idle_anim)
		cur_anim = idle_anim


func _set_loop(anim_name: String, on: bool) -> void:
	if anim_name == "" or not anim.has_animation(anim_name):
		return
	var a := anim.get_animation(anim_name)
	if a:
		a.loop_mode = Animation.LOOP_LINEAR if on else Animation.LOOP_NONE


func _on_anim_finished(finished_name) -> void:
	if String(finished_name) == attack_anim:
		attacking = false
		cur_anim = "" # let _physics_process resume idle/run


func _match_anim(list, keys) -> String:
	for n in list:
		var ln := String(n).to_lower()
		for k in keys:
			if ln.find(k) != -1:
				return n
	return ""


func _attach_weapon() -> void:
	var skels := model.find_children("*", "Skeleton3D", true, false)
	if skels.size() == 0:
		return
	var skel: Skeleton3D = skels[0]
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
	weapon = MeshInstance3D.new()
	var blade := BoxMesh.new()
	blade.size = Vector3(0.06, 0.06, 1.1)
	var bm := StandardMaterial3D.new()
	bm.albedo_color = Color(0.85, 0.9, 1.0)
	bm.metallic = 0.6
	blade.material = bm
	weapon.mesh = blade
	weapon_attach.add_child(weapon)


func _play(anim_name: String) -> void:
	if anim and anim_name != "" and cur_anim != anim_name and anim.has_animation(anim_name):
		anim.play(anim_name, 0.2)
		cur_anim = anim_name


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
		elif event.button_index == MOUSE_BUTTON_LEFT:
			_do_melee()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			_do_ranged()
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

	var speed := SPRINT if Input.is_physical_key_pressed(KEY_SHIFT) else WALK
	player.velocity.x = dir.x * speed
	player.velocity.z = dir.z * speed
	if not player.is_on_floor():
		player.velocity.y -= gravity * delta
	elif Input.is_physical_key_pressed(KEY_SPACE) and not player_dead:
		player.velocity.y = JUMP
	player.move_and_slide()

	if dir.length() > 0.1 and model:
		var target := atan2(dir.x, dir.z) + (PI if face_flip else 0.0)
		model_facing = lerp_angle(model_facing, target, 0.2)
		model.rotation.y = model_facing
	# Locomotion animation (suppressed while an attack animation is playing).
	if not attacking:
		_play(run_anim if dir.length() > 0.1 else idle_anim)

	# Size the held weapon to ~world scale (the hand bone may be heavily scaled).
	if weapon_attach and not weapon_scaled:
		var s: float = weapon_attach.global_transform.basis.get_scale().x
		if s > 0.0001:
			weapon.scale = Vector3.ONE / s
			weapon.position = Vector3(0, 0, 0.55) / s
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
		boss_mat.emission_enabled = true
		boss_mat.emission = Color(0.6, 0.5, 0.4)
	else:
		boss_mat.emission_enabled = false

	match boss_state:
		"idle":
			if dist > 4.0:
				boss_root.global_position += to.normalized() * 2.2 * delta
			boss_cd -= delta
			if boss_cd <= 0.0 and dist < 16.0:
				boss_state = "windup"
				boss_t = 1.1
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
	player_hp = max(0.0, player_hp - dmg)
	player_invuln = 0.7
	if player_hp <= 0.0:
		_player_die()


func _player_die() -> void:
	player_dead = true
	_banner("DEFEATED")
	await get_tree().create_timer(1.6).timeout
	player.global_position = player_spawn
	player.velocity = Vector3.ZERO
	player_hp = PLAYER_MAX
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
	_banner("VICTORY!")
	await get_tree().create_timer(2.5).timeout
	boss_hp = BOSS_MAX
	boss_dead = false
	boss_state = "idle"
	boss_cd = 3.0
	boss_root.global_position = boss_pos
	boss_root.visible = true


# --- Player attacks ---------------------------------------------------------
func _do_melee() -> void:
	if melee_cd > 0.0 or player_dead:
		return
	melee_cd = 0.45
	# Play the attack animation (if the character has one), once.
	if attack_anim != "" and anim:
		attacking = true
		anim.play(attack_anim, 0.1)
		cur_anim = attack_anim
	var aim := -cam_yaw.global_transform.basis.z
	aim.y = 0
	aim = aim.normalized()
	# Dummy
	var td := dummy_pos - player.global_position
	td.y = 0
	if td.length() < MELEE_RANGE + 0.5 and td.normalized().dot(aim) > 0.2:
		_hit_dummy(randi_range(45, 65))
	# Boss (bigger reach because it's large)
	if not boss_dead:
		var tb := boss_root.global_position - player.global_position
		tb.y = 0
		if tb.length() < MELEE_RANGE + 2.2 and td_dot(tb, aim) > 0.0:
			_hit_boss(randi_range(30, 45))


func td_dot(v: Vector3, aim: Vector3) -> float:
	if v.length() < 0.001:
		return 1.0
	return v.normalized().dot(aim)


func _do_ranged() -> void:
	if ranged_cd > 0.0 or player_dead:
		return
	ranged_cd = 0.18
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
	var aim := -cam.global_transform.basis.z
	projectiles.append({"mesh": bolt, "vel": aim.normalized() * PROJ_SPEED, "life": 1.6})


func _update_combat(delta: float) -> void:
	melee_cd = max(0.0, melee_cd - delta)
	ranged_cd = max(0.0, ranged_cd - delta)

	var dcenter := dummy_pos + Vector3(0, 1.0, 0)
	var bcenter := boss_root.global_position + Vector3(0, 2.0, 0) if boss_root else Vector3.ZERO
	for i in range(projectiles.size() - 1, -1, -1):
		var p = projectiles[i]
		p.mesh.position += p.vel * delta
		p.life -= delta
		var done := false
		if p.mesh.position.distance_to(dcenter) < 0.7:
			_hit_dummy(randi_range(25, 38))
			done = true
		elif not boss_dead and p.mesh.position.distance_to(bcenter) < 2.2:
			_hit_boss(randi_range(20, 32))
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


func _update_hud() -> void:
	if hud_player_fill:
		hud_player_fill.size = Vector2(296.0 * (player_hp / PLAYER_MAX), 20)
	if hud_boss_fill:
		hud_boss_fill.size = Vector2(596.0 * (boss_hp / BOSS_MAX), 14)
