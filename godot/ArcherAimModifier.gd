# Upper-body aim: after the animation poses the skeleton, pitch the spine chain so the
# bow tracks `aim_target` in elevation (up/down), distributed across 3 spine bones so no
# single bone over-bends (which is what knots up a single-bone LookAt). Optional fixed
# yaw twist brings the left-held bow onto the aim line. Verified: local X is the pitch
# axis, negative = aim up.
class_name ArcherAimModifier
extends SkeletonModifier3D

var spine_bones: PackedStringArray = ["mixamorig_Spine", "mixamorig_Spine1", "mixamorig_Spine2"]
var chest_bone := "mixamorig_Spine2"   # elevation is measured from here
var aim_target := Vector3.ZERO          # world-space point to aim at
var enabled := false
var blend := 0.0                        # 0..1 ease in/out
var max_pitch := deg_to_rad(70.0)
var pitch_gain := 1.35                   # draw pose's bow starts angled down; over-drive so high targets read
var yaw_offset := 0.0                    # radians twist to centre the bow (0 = off)

func _process_modification() -> void:
	if not enabled or blend <= 0.001:
		return
	var skel := get_skeleton()
	if skel == null:
		return
	var cb := skel.find_bone(chest_bone)
	if cb < 0:
		return
	var chest: Vector3 = (skel.global_transform * skel.get_bone_global_pose(cb)).origin
	var to_t: Vector3 = aim_target - chest
	var horiz: float = Vector2(to_t.x, to_t.z).length()
	var elev: float = atan2(to_t.y, maxf(horiz, 0.05))
	var pitch: float = clampf(-elev * pitch_gain, -max_pitch, max_pitch) # neg = aim up (local X)
	var n := spine_bones.size()
	if n == 0:
		return
	var pp := (pitch / float(n)) * blend
	var yy := (yaw_offset / float(n)) * blend
	for bn in spine_bones:
		var bi := skel.find_bone(bn)
		if bi < 0:
			continue
		var q := skel.get_bone_pose_rotation(bi)
		q = q * Quaternion(Vector3(1, 0, 0), pp) * Quaternion(Vector3(0, 1, 0), yy)
		skel.set_bone_pose_rotation(bi, q.normalized())
