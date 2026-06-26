extends Node3D

# White-room QA harness for the arrow impact FX. Mirrors Main._impact_fx exactly
# (flash + spark burst) and captures PNG stills at a few moments after the hit so
# the effect can be eyeballed. Run with the desktop GL binary (NOT --headless, which
# can't render real pixels):
#   Godot_v4.6-stable_win64.exe --path . --resolution 960x720 res://tools/fx_preview.tscn
const OUT := "user://fx"
var n := 0
var fired := false


func _ready() -> void:
	# dim room: additive glow FX only read against a dark background
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.10, 0.12, 0.17)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.30, 0.32, 0.40)
	env.ambient_light_energy = 1.0
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var key := DirectionalLight3D.new()
	key.rotation = Vector3(deg_to_rad(-40), deg_to_rad(30), 0)
	key.light_energy = 0.8
	add_child(key)

	var ground := MeshInstance3D.new()
	var pm := PlaneMesh.new(); pm.size = Vector2(20, 20); ground.mesh = pm
	var gm := StandardMaterial3D.new(); gm.albedo_color = Color(0.16, 0.18, 0.24)
	ground.material_override = gm
	add_child(ground)

	# a dummy-ish post so the impact has context
	var post := MeshInstance3D.new()
	var bm := BoxMesh.new(); bm.size = Vector3(0.5, 2.0, 0.5); post.mesh = bm
	var pmat := StandardMaterial3D.new(); pmat.albedo_color = Color(0.5, 0.55, 0.65)
	post.material_override = pmat
	post.position = Vector3(0, 1.0, 0)
	add_child(post)

	var cam := Camera3D.new()
	cam.position = Vector3(2.6, 1.6, 3.4)
	add_child(cam)
	cam.look_at(Vector3(0, 1.1, 0), Vector3.UP)

	RenderingServer.frame_post_draw.connect(_grab)


func _impact_fx(pos: Vector3, power: float) -> void:
	var p: float = clampf(power, 1.0, 2.8)
	var s := MeshInstance3D.new()
	var sm := SphereMesh.new(); sm.radius = 0.13; sm.height = 0.26; s.mesh = sm
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.albedo_color = Color(1.0, 0.86, 0.55, 1.0)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	s.material_override = mat; add_child(s); s.global_position = pos
	var tw := create_tween(); tw.set_parallel(true)
	tw.tween_property(s, "scale", Vector3.ONE * (1.8 + p), 0.18)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.18)
	tw.chain().tween_callback(s.queue_free)
	var shards := int(7 + p * 3)
	for k in shards:
		var ang := TAU * (float(k) + randf() * 0.6) / float(shards)
		var dir := Vector3(cos(ang), 0.55 + randf() * 1.0, sin(ang)).normalized()
		var sh := MeshInstance3D.new()
		var shm := SphereMesh.new(); shm.radius = 0.035; shm.height = 0.07; sh.mesh = shm
		var smat := StandardMaterial3D.new()
		smat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		smat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		smat.albedo_color = Color(1.0, 0.80, 0.42, 1.0)
		smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		sh.material_override = smat; add_child(sh); sh.global_position = pos
		var dist := (0.45 + randf() * 0.5) * p
		var dur := 0.22 + randf() * 0.12
		var t2 := create_tween(); t2.set_parallel(true)
		t2.tween_property(sh, "global_position", pos + dir * dist + Vector3.DOWN * 0.12, dur).set_ease(Tween.EASE_OUT)
		t2.tween_property(sh, "scale", Vector3.ONE * 0.4, dur)
		t2.tween_property(smat, "albedo_color:a", 0.0, dur)
		t2.chain().tween_callback(sh.queue_free)


func _grab() -> void:
	n += 1
	if n == 3:
		_impact_fx(Vector3(-0.85, 1.15, 0.26), 1.0)  # normal shot (left)
		_impact_fx(Vector3(0.85, 1.15, 0.26), 2.6)   # charged shot (right, bigger)
	# capture a few moments into the effect
	if n in [6, 10, 16, 24]:
		var img := get_viewport().get_texture().get_image()
		img.save_png(OUT + "_%02d.png" % n)
	if n >= 26:
		get_tree().quit()
