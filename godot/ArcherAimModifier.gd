# Procedural upper-body aim, applied AFTER the animation poses the skeleton:
#  - small spine pitch toward the target's height,
#  - NECK -> HEAD look that follows the aim, clamped to a human range (no roll, no crank).
# The bow arm is NOT force-aimed here (it would knot the shoulder); the bladed body +
# side-arm pose point the bow at the target. Optional aim_arm re-enables arm IK.
class_name ArcherAimModifier
extends SkeletonModifier3D

var aim_target := Vector3.ZERO
var enabled := false
var blend := 0.0
var aim_arm := false

const SPINE := ["mixamorig_Spine", "mixamorig_Spine1", "mixamorig_Spine2"]
const HEAD := "mixamorig_Head"
const NECK := "mixamorig_Neck"
const HEAD_FACE := Vector3(0, 0, 1)   # face-forward local axis (derived from geometry)
const SPINE_GAIN := 0.9               # lean toward the target's height (1.0 = match elevation)
const SPINE_PITCH_MAX := 0.6          # ~34 deg max lean so extreme targets don't over-bend
const YAW_MAX := 0.95                 # ~55 deg neck+head turn toward the target
const PITCH_MAX := 0.6                # ~34 deg up/down
# arm IK fallback config
const ARM := {"mixamorig_LeftArm": "mixamorig_LeftForeArm", "mixamorig_LeftForeArm": "mixamorig_LeftHand"}

func _process_modification() -> void:
	if not enabled or blend <= 0.001:
		return
	var skel := get_skeleton()
	if skel == null:
		return
	# 1) lift the upper body toward the target's HEIGHT by leaning around the world axis
	# perpendicular to the aim (so it works no matter how bladed the body is — local-axis
	# pitch would just lean her sideways once bladed).
	var cb := skel.find_bone("mixamorig_Spine2")
	if cb >= 0:
		var chest: Vector3 = (skel.global_transform * skel.get_bone_global_pose(cb)).origin
		var d: Vector3 = aim_target - chest
		var horiz: float = Vector2(d.x, d.z).length()
		var elev: float = atan2(d.y, maxf(horiz, 0.05))            # + = target above
		var lean: float = clampf(elev * SPINE_GAIN, -SPINE_PITCH_MAX, SPINE_PITCH_MAX) * blend
		var up: Vector3 = (skel.global_transform.basis.inverse() * Vector3.UP).normalized()
		var aim_h: Vector3 = (skel.global_transform.basis.inverse() * Vector3(d.x, 0, d.z)).normalized()
		var right: Vector3 = aim_h.cross(up).normalized()           # world-horizontal, perpendicular to the aim
		var per := lean / float(SPINE.size())
		for bn in SPINE:
			var bi := skel.find_bone(bn)
			if bi >= 0:
				_prerotate(skel, bi, Quaternion(right, per))
	# 2) (optional) force-aim the bow arm
	if aim_arm:
		for bn in ARM:
			_aim_bone(skel, bn, ARM[bn], aim_target, blend)
	# 3) neck -> head look at the target, clamped, no roll
	_look(skel, aim_target, blend)


# Clamped neck+head turn toward the target: decomposed into yaw (around up) + pitch, so
# the head never rolls/cranks. Split across neck and head so it reads as a glance.
func _look(skel: Skeleton3D, target_world: Vector3, amount: float) -> void:
	var head := skel.find_bone(HEAD)
	var neck := skel.find_bone(NECK)
	if head < 0:
		return
	var hgp := skel.get_bone_global_pose(head)
	var origin: Vector3 = skel.global_transform * hgp.origin
	if (target_world - origin).length() < 0.05:
		return
	var to: Vector3 = (skel.global_transform.basis.inverse() * (target_world - origin)).normalized()
	var cur: Vector3 = (hgp.basis * HEAD_FACE.normalized()).normalized()
	var up: Vector3 = (skel.global_transform.basis.inverse() * Vector3.UP).normalized()
	var cur_h: Vector3 = (cur - up * cur.dot(up))
	var to_h: Vector3 = (to - up * to.dot(up))
	if cur_h.length() < 0.01 or to_h.length() < 0.01:
		return
	cur_h = cur_h.normalized(); to_h = to_h.normalized()
	var yaw: float = clampf(atan2(cur_h.cross(to_h).dot(up), cur_h.dot(to_h)), -YAW_MAX, YAW_MAX)
	var pitch: float = clampf(asin(clampf(to.dot(up), -1, 1)) - asin(clampf(cur.dot(up), -1, 1)), -PITCH_MAX, PITCH_MAX)
	var right: Vector3 = to_h.cross(up).normalized()
	var delta := Quaternion(up, yaw) * Quaternion(right, pitch)
	var part := Quaternion.IDENTITY.slerp(delta, clampf(0.5 * amount, 0.0, 1.0))
	if neck >= 0:
		_prerotate(skel, neck, part)
	_prerotate(skel, head, part)


func _prerotate(skel: Skeleton3D, b: int, delta_skel: Quaternion) -> void:
	var gp := skel.get_bone_global_pose(b)
	var nb := Basis(delta_skel) * gp.basis
	var p := skel.get_bone_parent(b)
	var pb := skel.get_bone_global_pose(p).basis if p >= 0 else Basis.IDENTITY
	skel.set_bone_pose_rotation(b, (pb.inverse() * nb).get_rotation_quaternion().normalized())


func _aim_bone(skel: Skeleton3D, bone_name: String, child_name: String, target_world: Vector3, amount: float) -> void:
	var b := skel.find_bone(bone_name)
	var c := skel.find_bone(child_name)
	if b < 0 or c < 0:
		return
	var fwd_local: Vector3 = skel.get_bone_rest(c).origin
	if fwd_local.length() < 0.0001:
		return
	fwd_local = fwd_local.normalized()
	var bgp := skel.get_bone_global_pose(b)
	var origin_world: Vector3 = skel.global_transform * bgp.origin
	var to_world: Vector3 = target_world - origin_world
	if to_world.length() < 0.05:
		return
	var to_skel: Vector3 = (skel.global_transform.basis.inverse() * to_world).normalized()
	var cur: Vector3 = (bgp.basis * fwd_local).normalized()
	var delta := Quaternion.IDENTITY.slerp(Quaternion(cur, to_skel), clampf(amount, 0.0, 1.0))
	var new_basis := Basis(delta) * bgp.basis
	var parent := skel.get_bone_parent(b)
	var parent_basis := skel.get_bone_global_pose(parent).basis if parent >= 0 else Basis.IDENTITY
	skel.set_bone_pose_rotation(b, (parent_basis.inverse() * new_basis).get_rotation_quaternion().normalized())
