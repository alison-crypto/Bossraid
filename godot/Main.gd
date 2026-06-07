# Bossraid — Godot starter scene (built in code so the .tscn stays trivial).
#
# Open arena + third-person player (animated glTF) + a training dummy you can
# hit with melee (left click) and ranged (right click). See CLAUDE.md.
#
# Controls: WASD move, mouse look (click to capture / Esc to release),
# Shift sprint, Space jump, Left-click melee, Right-click ranged.

extends Node3D

const WALK := 4.5
const SPRINT := 8.0
const JUMP := 5.0
const MOUSE_SENS := 0.0025
const CHARACTER := "res://models/Soldier.glb"
const MODEL_FACE_FLIP := true # set false if the character faces backward
const MELEE_RANGE := 2.6
const PROJ_SPEED := 24.0

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
var model_facing := 0.0

# Dummy
var dummy_pos := Vector3(0, 0, -5)
const DUMMY_MAX := 600.0
var dummy_hp := DUMMY_MAX
var dummy_mesh: MeshInstance3D
var dummy_mat: StandardMaterial3D
var dummy_flash := 0.0

# Attacks
var melee_cd := 0.0
var ranged_cd := 0.0
var projectiles: Array = [] # [{mesh, vel, life}]


func _ready() -> void:
	_build_environment()
	_build_ground()
	_build_dummy(dummy_pos)
	_build_player(Vector3(0, 0, 3))


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
	col.shape = WorldBoundaryShape3D.new() # infinite floor at y=0
	body.add_child(col)
	add_child(body)


func _build_dummy(pos: Vector3) -> void:
	var d := Node3D.new()
	dummy_mesh = MeshInstance3D.new()
	var caps := CapsuleMesh.new()
	caps.radius = 0.42
	caps.height = 1.9
	dummy_mat = StandardMaterial3D.new()
	dummy_mat.albedo_color = Color(0.81, 0.7, 0.48)
	caps.material = dummy_mat
	dummy_mesh.mesh = caps
	dummy_mesh.position = Vector3(0, 1.0, 0)
	d.add_child(dummy_mesh)
	d.position = pos
	add_child(d)


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

	var scene := load(CHARACTER)
	if scene:
		model = scene.instantiate()
		player.add_child(model)
		anim = model.find_child("AnimationPlayer", true, false)
		if anim:
			_play("Idle")
	else:
		var fb := MeshInstance3D.new()
		var caps := CapsuleMesh.new()
		caps.radius = 0.35
		caps.height = 1.7
		fb.mesh = caps
		fb.position = Vector3(0, 0.85, 0)
		player.add_child(fb)

	# Manual camera rig: yaw pivot -> pitch pivot -> camera placed BEHIND (+Z).
	cam_yaw = Node3D.new()
	cam_yaw.position = Vector3(0, 1.55, 0)
	player.add_child(cam_yaw)
	cam_pitch = Node3D.new()
	cam_yaw.add_child(cam_pitch)
	cam = Camera3D.new()
	cam.position = Vector3(0.5, 0, 4.5) # behind + slight shoulder
	cam_pitch.add_child(cam)

	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)


func _play(anim_name: String) -> void:
	if anim and cur_anim != anim_name and anim.has_animation(anim_name):
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

	# Camera-relative movement (layout-independent physical keys).
	var fwd := -cam_yaw.global_transform.basis.z
	var rgt := cam_yaw.global_transform.basis.x
	fwd.y = 0
	rgt.y = 0
	fwd = fwd.normalized()
	rgt = rgt.normalized()
	var dir := Vector3.ZERO
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
	elif Input.is_physical_key_pressed(KEY_SPACE):
		player.velocity.y = JUMP
	player.move_and_slide()

	# Face + animate.
	if dir.length() > 0.1:
		if model:
			var target := atan2(dir.x, dir.z) + (PI if MODEL_FACE_FLIP else 0.0)
			model_facing = lerp_angle(model_facing, target, 0.2)
			model.rotation.y = model_facing
		_play("Run")
	else:
		_play("Idle")

	_update_combat(delta)


# --- Combat -----------------------------------------------------------------
func _do_melee() -> void:
	if melee_cd > 0.0:
		return
	melee_cd = 0.45
	var to := dummy_pos - player.global_position
	to.y = 0
	var d := to.length()
	if d < MELEE_RANGE + 0.5:
		var aim := -cam_yaw.global_transform.basis.z
		aim.y = 0
		if to.normalized().dot(aim.normalized()) > 0.2:
			_hit_dummy(randi_range(45, 65))


func _do_ranged() -> void:
	if ranged_cd > 0.0:
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
	var from := player.global_position + Vector3(0, 1.2, 0)
	bolt.position = from
	add_child(bolt)
	var aim := -cam.global_transform.basis.z # full 3D aim (where you look)
	projectiles.append({"mesh": bolt, "vel": aim.normalized() * PROJ_SPEED, "life": 1.5})


func _update_combat(delta: float) -> void:
	melee_cd = max(0.0, melee_cd - delta)
	ranged_cd = max(0.0, ranged_cd - delta)

	var dcenter := dummy_pos + Vector3(0, 1.0, 0)
	for i in range(projectiles.size() - 1, -1, -1):
		var p = projectiles[i]
		p.mesh.position += p.vel * delta
		p.life -= delta
		var hit: bool = p.mesh.position.distance_to(dcenter) < 0.7
		if hit:
			_hit_dummy(randi_range(25, 38))
		if hit or p.life <= 0.0 or p.mesh.position.y < 0.0:
			p.mesh.queue_free()
			projectiles.remove_at(i)

	# Dummy hit flash + HP regen.
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
