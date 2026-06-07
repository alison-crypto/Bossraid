# Bossraid — Godot starter scene (built in code so the .tscn stays trivial).
#
# Spawns: open ground, sky/sun, a training dummy, and a third-person player
# that loads an animated glTF character (Soldier.glb) with idle/run. This is the
# clean base to grow the real game on — see CLAUDE.md for the roadmap.
#
# Controls: WASD move, mouse look (click to capture / Esc to release),
# Shift sprint, Space jump.

extends Node3D

const WALK := 4.5
const SPRINT := 8.0
const JUMP := 5.0
const MOUSE_SENS := 0.0025
const CHARACTER := "res://models/Soldier.glb" # swap to Erika.glb etc.

var player: CharacterBody3D
var model: Node3D
var cam_pivot: Node3D
var spring: SpringArm3D
var anim: AnimationPlayer
var yaw := 0.0
var pitch := -0.25
var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)
var cur_anim := ""

func _ready() -> void:
	_build_environment()
	_build_ground()
	_build_dummy(Vector3(0, 0, -5))
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
	var shape := WorldBoundaryShape3D.new() # infinite floor at y=0
	col.shape = shape
	body.add_child(col)
	add_child(body)

	var grid := _grid_mesh(160, 2.0)
	add_child(grid)

func _grid_mesh(size: float, step: float) -> MeshInstance3D:
	var im := ImmediateMesh.new()
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.25, 0.3, 0.4, 0.5)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	im.surface_begin(Mesh.PRIMITIVE_LINES, mat)
	var h := size / 2.0
	var x := -h
	while x <= h:
		im.surface_add_vertex(Vector3(x, 0.02, -h))
		im.surface_add_vertex(Vector3(x, 0.02, h))
		im.surface_add_vertex(Vector3(-h, 0.02, x))
		im.surface_add_vertex(Vector3(h, 0.02, x))
		x += step
	im.surface_end()
	var mi := MeshInstance3D.new()
	mi.mesh = im
	return mi

func _build_dummy(pos: Vector3) -> void:
	var d := Node3D.new()
	var body := MeshInstance3D.new()
	var caps := CapsuleMesh.new()
	caps.radius = 0.42
	caps.height = 1.9
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.81, 0.7, 0.48)
	caps.material = mat
	body.mesh = caps
	body.position = Vector3(0, 1.0, 0)
	d.add_child(body)
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

	# Visual character (animated glTF) with a capsule fallback.
	var scene := load(CHARACTER)
	if scene:
		model = scene.instantiate()
		player.add_child(model)
		anim = model.find_child("AnimationPlayer", true, false)
		if anim:
			_play("Idle")
	else:
		var fallback := MeshInstance3D.new()
		var caps := CapsuleMesh.new()
		caps.radius = 0.35
		caps.height = 1.7
		fallback.mesh = caps
		fallback.position = Vector3(0, 0.85, 0)
		player.add_child(fallback)

	# Camera rig: a yaw pivot (mouse-controlled) holding a spring arm + camera.
	cam_pivot = Node3D.new()
	cam_pivot.position = Vector3(0, 1.5, 0)
	player.add_child(cam_pivot)
	spring = SpringArm3D.new()
	spring.spring_length = 4.5
	cam_pivot.add_child(spring)
	var cam := Camera3D.new()
	spring.add_child(cam)

	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)

func _play(name: String) -> void:
	if anim and cur_anim != name and anim.has_animation(name):
		anim.play(name, 0.2)
		cur_anim = name

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * MOUSE_SENS
		pitch = clamp(pitch - event.relative.y * MOUSE_SENS, -1.2, 0.4)

func _physics_process(delta: float) -> void:
	if not player:
		return
	cam_pivot.rotation.y = yaw
	spring.rotation.x = pitch

	var ix := (1.0 if Input.is_key_pressed(KEY_D) else 0.0) - (1.0 if Input.is_key_pressed(KEY_A) else 0.0)
	var iz := (1.0 if Input.is_key_pressed(KEY_S) else 0.0) - (1.0 if Input.is_key_pressed(KEY_W) else 0.0)
	var dir := (cam_pivot.global_transform.basis * Vector3(ix, 0, iz))
	dir.y = 0
	dir = dir.normalized()

	var speed := SPRINT if Input.is_key_pressed(KEY_SHIFT) else WALK
	player.velocity.x = dir.x * speed
	player.velocity.z = dir.z * speed

	if not player.is_on_floor():
		player.velocity.y -= gravity * delta
	elif Input.is_key_pressed(KEY_SPACE):
		player.velocity.y = JUMP

	player.move_and_slide()

	# Face + animate the model.
	if dir.length() > 0.1:
		if model:
			var target := atan2(dir.x, dir.z)
			model.rotation.y = lerp_angle(model.rotation.y, target, 0.2)
		_play("Run")
	else:
		_play("Idle")
