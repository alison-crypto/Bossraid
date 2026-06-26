extends Node3D
# QA: render the archer dodge clips as frame sequences (white room) so we can see whether
# each is the proper roll and pick/fix the in-game dodge.
const DIR := "C:/bossraid-render/dodge/"
func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(DIR)
	get_window().size = Vector2i(1100, 1100)
	var env := WorldEnvironment.new(); var e := Environment.new()
	e.background_mode = Environment.BG_COLOR; e.background_color = Color(0.9,0.91,0.93)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; e.ambient_light_color = Color(0.85,0.86,0.9); e.ambient_light_energy = 1.1
	env.environment = e; add_child(env)
	var key := DirectionalLight3D.new(); key.rotation_degrees = Vector3(-50,-40,0); key.light_energy = 1.4; add_child(key)
	var fl := MeshInstance3D.new(); var pl := PlaneMesh.new(); pl.size = Vector2(12,12); fl.mesh = pl
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.8,0.81,0.84); fl.material_override = fm; add_child(fl)
	var model: Node3D = load("res://models/erika_bow_final.glb").instantiate(); add_child(model)
	var skel: Skeleton3D = model.find_children("*", "Skeleton3D", true, false)[0]
	var ap := AnimationPlayer.new(); model.add_child(ap); ap.root_node = ap.get_path_to(model)
	model.rotation.y = PI
	var cam := Camera3D.new(); add_child(cam); cam.current = true; cam.fov = 40
	cam.position = Vector3(2.6, 1.6, 2.6); cam.look_at(Vector3(0, 0.7, 0), Vector3.UP) # 3/4
	for clip in ["roll", "dodge_left", "dodge_right", "dodge_back"]:
		# merge with keep_root_rot=true (same as in-game) so the tumble is included
		var nm := AnimUtil.merge(ap, skel, "res://models/anim/archer/%s.fbx" % clip, "C_" + clip, true)
		if nm == "":
			print(clip, ": merge fail"); continue
		var ln: float = ap.get_animation(nm).length
		for i in 6:
			var frac := 0.1 + i * 0.16
			ap.play(nm); ap.seek(ln * frac, true)
			for _j in 3: await get_tree().process_frame
			get_viewport().get_texture().get_image().save_png(DIR + "%s_%d.png" % [clip, i])
		print(clip, " len=", ln)
	print("dodge_preview done")
	get_tree().quit()
