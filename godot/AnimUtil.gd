# Shared helpers for merging external Mixamo animation clips onto a character,
# and for measuring/fitting a model. Mixamo clips (downloaded "without skin")
# share the `mixamorig:*` skeleton, so copying their bone *rotations* (and scales)
# onto any Mixamo character retargets the motion. Positions are skipped (they
# depend on each character's bone lengths and would displace/stretch the rig),
# and bones are matched by a normalized name so import-time name mangling
# (mixamorig prefix / colon) doesn't break the match.
class_name AnimUtil
extends RefCounted


# Load the first animation from an external .glb and add it to `target_anim`'s
# default library as `new_name`, remapped onto `target_skel`. Returns the added
# clip name, or "" on failure.
static func merge(target_anim: AnimationPlayer, target_skel: Skeleton3D, glb_path: String, new_name: String) -> String:
	if target_anim == null or target_skel == null:
		return ""
	var scene = load(glb_path)
	if scene == null:
		return ""
	var inst: Node = scene.instantiate()
	var src: AnimationPlayer = find_anim_player(inst)
	if src == null:
		inst.queue_free()
		return ""
	var list := src.get_animation_list()
	if list.is_empty():
		inst.queue_free()
		return ""
	var source_anim: Animation = src.get_animation(list[0])

	# Relative path from the target AnimationPlayer's root node to its skeleton.
	var root_node := target_anim.get_node(target_anim.root_node)
	var skel_rel := String(root_node.get_path_to(target_skel))

	# Map normalized bone name -> bone name on the target skeleton. Normalizing
	# (drop "mixamorig", strip punctuation/case) makes matching robust to how
	# Godot stores the `mixamorig:` prefix/colon differently per imported file.
	var bone_by_key := {}
	for bi in target_skel.get_bone_count():
		bone_by_key[_norm(target_skel.get_bone_name(bi))] = target_skel.get_bone_name(bi)

	var out := Animation.new()
	out.length = source_anim.length
	var added := 0
	var skipped_type := 0
	var skipped_bone := 0
	var sample_src := ""
	for ti in source_anim.get_track_count():
		var ttype := source_anim.track_get_type(ti)
		# Copy rotations (the retargetable part) and scales; skip positions so a
		# different rig's bone lengths can't displace/stretch the character.
		if ttype != Animation.TYPE_ROTATION_3D and ttype != Animation.TYPE_SCALE_3D:
			skipped_type += 1
			continue
		var raw := String(source_anim.track_get_path(ti).get_concatenated_subnames())
		if raw == "":
			var p := source_anim.track_get_path(ti)
			if p.get_name_count() > 0:
				raw = String(p.get_name(p.get_name_count() - 1))
		if sample_src == "":
			sample_src = raw
		var key := _norm(raw)
		if not bone_by_key.has(key):
			skipped_bone += 1
			continue
		var nt := out.add_track(ttype)
		out.track_set_path(nt, NodePath(skel_rel + ":" + bone_by_key[key]))
		for ki in source_anim.track_get_key_count(ti):
			if ttype == Animation.TYPE_ROTATION_3D:
				out.rotation_track_insert_key(nt, source_anim.track_get_key_time(ti, ki), source_anim.track_get_key_value(ti, ki))
			else:
				out.scale_track_insert_key(nt, source_anim.track_get_key_time(ti, ki), source_anim.track_get_key_value(ti, ki))
		added += 1
	inst.queue_free()
	var sample_tgt: String = target_skel.get_bone_name(0) if target_skel.get_bone_count() > 0 else "?"
	print("AnimUtil.merge ", glb_path.get_file(), " -> ", new_name, ": added=", added,
		" skip_type=", skipped_type, " skip_bone=", skipped_bone,
		" src_bone='", sample_src, "' tgt_bone='", sample_tgt, "'")
	if added == 0:
		return ""

	var lib := target_anim.get_animation_library("")
	if lib == null:
		lib = AnimationLibrary.new()
		target_anim.add_animation_library("", lib)
	if lib.has_animation(new_name):
		lib.remove_animation(new_name)
	lib.add_animation(new_name, out)
	return new_name


# Normalize a bone name for matching: lowercase, drop the "mixamorig" prefix,
# and keep only letters/digits (so "mixamorig:LeftArm", "mixamorig_LeftArm" and
# "LeftArm" all collapse to "leftarm").
static func _norm(n: String) -> String:
	var s := n.to_lower().replace("mixamorig", "")
	var out := ""
	for c in s:
		if (c >= "a" and c <= "z") or (c >= "0" and c <= "9"):
			out += c
	return out


static func find_anim_player(root: Node) -> AnimationPlayer:
	var ap = root.find_child("AnimationPlayer", true, false)
	if ap == null:
		var aps := root.find_children("*", "AnimationPlayer", true, false)
		if aps.size() > 0:
			ap = aps[0]
	return ap


static func find_skeleton(root: Node) -> Skeleton3D:
	var skels := root.find_children("*", "Skeleton3D", true, false)
	return skels[0] if skels.size() > 0 else null


# Combined mesh bounding box of a model, in the model's local space.
# Returns {height, min_y, cx, cz} or null if it has no meshes.
static func bounds(model: Node3D):
	var has := false
	var mn := Vector3(INF, INF, INF)
	var mx := Vector3(-INF, -INF, -INF)
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		var m: MeshInstance3D = mi
		if m.mesh == null:
			continue
		var aabb := m.mesh.get_aabb()
		var xf := model.global_transform.affine_inverse() * m.global_transform
		for c in 8:
			var corner := aabb.position + Vector3(
				aabb.size.x if (c & 1) else 0.0,
				aabb.size.y if (c & 2) else 0.0,
				aabb.size.z if (c & 4) else 0.0)
			var p := xf * corner
			mn = mn.min(p)
			mx = mx.max(p)
			has = true
	if not has:
		return null
	return {"height": mx.y - mn.y, "min_y": mn.y, "cx": (mn.x + mx.x) * 0.5, "cz": (mn.z + mx.z) * 0.5}


# Scale a model to `target_h` metres and stand its feet on y = 0.
static func fit_height(model: Node3D, target_h: float) -> void:
	model.scale = Vector3.ONE
	var b = bounds(model)
	if b == null or b.height <= 0.0:
		return
	var s: float = target_h / b.height
	model.scale = Vector3(s, s, s)
	# bounds() reports model-local (unscaled) extents; convert feet offset by s.
	model.position.y -= b.min_y * s
