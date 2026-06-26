extends Node3D
# Aim-pose QA harness (Alison's approval gate): render Erika aiming at a ball in a white
# room, high-res, from several angles, so pose/aim/rig changes can be approved BEFORE a PR.
# Run: Godot --path godot res://tools/aim_preview.tscn   (windowed, not --headless, so the
# viewport renders). PNGs land in C:/bossraid-render/aim_preview/. Edit BALL/AIM_CLIP/BLADE.
const DIR := "C:/bossraid-render/aim_preview/"
const AIM_CLIP := "res://models/anim/archer/idle_aim.fbx"
const BALL := Vector3(0, 2.4, -3.6)   # target: in front (-Z), above head height
const BLADE_DEG := -84.0              # body bladed off the aim line (archer stance)
func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(DIR)
	get_window().size = Vector2i(1100, 1100)
	var env := WorldEnvironment.new(); var e := Environment.new()
	e.background_mode = Environment.BG_COLOR; e.background_color = Color(0.9, 0.91, 0.93)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; e.ambient_light_color = Color(0.85,0.86,0.9); e.ambient_light_energy = 1.1
	env.environment = e; add_child(env)
	var key := DirectionalLight3D.new(); key.rotation_degrees = Vector3(-50,-40,0); key.light_energy = 1.4; add_child(key)
	var fl := MeshInstance3D.new(); var pl := PlaneMesh.new(); pl.size = Vector2(12,12); fl.mesh = pl
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.8,0.81,0.84); fl.material_override = fm; add_child(fl)
	var model: Node3D = load("res://models/erika_bow_final.glb").instantiate(); add_child(model)
	var skel: Skeleton3D = model.find_children("*", "Skeleton3D", true, false)[0]
	var ap := AnimationPlayer.new(); model.add_child(ap); ap.root_node = ap.get_path_to(model)
	var nm := AnimUtil.merge(ap, skel, AIM_CLIP, "Aim")
	var ball := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius=0.28; sm.height=0.56; ball.mesh=sm
	var bm := StandardMaterial3D.new(); bm.albedo_color=Color(0.9,0.12,0.12); bm.emission_enabled=true; bm.emission=Color(0.9,0.12,0.12); ball.material_override=bm
	add_child(ball); ball.global_position = BALL
	var mod := ArcherAimModifier.new(); skel.add_child(mod); mod.enabled=true; mod.blend=1.0; mod.aim_arm=false; mod.aim_target = BALL
	ap.play(nm); ap.seek(0.6, true); ap.pause()
	model.rotation.y = PI + deg_to_rad(BLADE_DEG)
	for _i in 6: await get_tree().process_frame
	var cam := Camera3D.new(); add_child(cam); cam.current = true
	var hp: Vector3 = skel.global_transform * skel.get_bone_global_pose(skel.find_bone("mixamorig_Head")).origin
	var views := {
		"side":   [42, Vector3(-5.2,1.7,-1.7), Vector3(0,1.6,-1.7)],
		"top":    [40, Vector3(0,6.5,-1.7), Vector3(0,0,-1.7)],
		"front34":[36, Vector3(-2.4,1.8,1.6), Vector3(0.1,1.45,-0.6)],
		"head":   [28, hp + Vector3(-1.5,0.1,1.0), hp + Vector3(0,-0.05,-0.5)],
	}
	for k in views:
		cam.fov = views[k][0]; cam.position = views[k][1]
		cam.look_at(views[k][2], Vector3(0,0,-1) if k == "top" else Vector3.UP)
		for _i in 3: await get_tree().process_frame
		get_viewport().get_texture().get_image().save_png(DIR + str(k) + ".png")
	print("aim_preview done")
	get_tree().quit()
