# Base for full-screen menu screens (Login / Character Select / Boss Select). Routes a
# touch tap to whatever Control Button it lands on, since mouse-from-touch is off for the
# game and Control buttons otherwise never receive taps on the phone. Desktop mouse still
# works as normal.
class_name UIScreen
extends Control

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		var hit := _btn_at(self, event.position)
		if hit:
			if is_inside_tree():
				get_viewport().set_input_as_handled() # mark handled BEFORE emit (emit may change scene)
			hit.pressed.emit()


func _btn_at(node: Node, pos: Vector2) -> Button:
	for i in range(node.get_child_count() - 1, -1, -1):
		var c := node.get_child(i)
		var r := _btn_at(c, pos)
		if r:
			return r
		if c is Button and (c as Button).visible and (c as Button).get_global_rect().has_point(pos):
			return c
	return null
