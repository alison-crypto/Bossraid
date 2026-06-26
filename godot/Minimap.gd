# Top-right radar (Milestone D). Hand-drawn Control: player fixed at centre, world blips
# placed at (obj - player) on the X/Z plane, scaled into the dial. North-up (world-aligned)
# with a small heading wedge for the player's facing. Main calls set_radar() each frame.
class_name Minimap
extends Control

var player_pos := Vector3.ZERO
var forward := Vector3.FORWARD     # player/camera forward (world), for the heading wedge
var blips: Array = []              # [{pos: Vector3, color: Color, r: float}]
var world_radius := 26.0           # metres from the player shown to the dial edge

func set_radar(ppos: Vector3, fwd: Vector3, b: Array) -> void:
	player_pos = ppos
	if fwd.length() > 0.01:
		forward = fwd.normalized()
	blips = b
	queue_redraw()

func _draw() -> void:
	var c := size * 0.5
	var rad := minf(size.x, size.y) * 0.5 - 2.0
	draw_circle(c, rad, Color(0.05, 0.07, 0.10, 0.62))           # dial
	draw_arc(c, rad, 0.0, TAU, 56, Color(0.45, 0.65, 0.9, 0.55), 2.0)  # rim
	# heading wedge (where the player is looking)
	var hdir := Vector2(forward.x, forward.z)
	if hdir.length() > 0.01:
		hdir = hdir.normalized()
		var perp := Vector2(-hdir.y, hdir.x)
		var tip := c + hdir * (rad * 0.9)
		draw_colored_polygon(PackedVector2Array([c + perp * 7.0, c - perp * 7.0, tip]), Color(0.4, 0.9, 0.5, 0.22))
	# blips (clamped to the rim so off-radar targets show on the edge)
	for b in blips:
		var rel: Vector3 = b.pos - player_pos
		var v := Vector2(rel.x, rel.z) / world_radius * rad
		if v.length() > rad - 4.0:
			v = v.normalized() * (rad - 4.0)
		draw_circle(c + v, float(b.get("r", 5.0)), b.color)
	# player at centre
	draw_circle(c, 5.0, Color(0.45, 0.95, 0.55))
	draw_arc(c, 5.0, 0.0, TAU, 16, Color(0, 0, 0, 0.6), 1.5)
