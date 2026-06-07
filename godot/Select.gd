# Character-select screen: a button per character. Picking one stores it in
# GameState and loads the arena (Main.tscn).
extends Control


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var bg := ColorRect.new()
	bg.color = Color(0.07, 0.08, 0.12)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var vb := VBoxContainer.new()
	vb.set_anchors_preset(Control.PRESET_CENTER)
	vb.add_theme_constant_override("separation", 14)
	add_child(vb)

	var title := Label.new()
	title.text = "Choose your Character"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 34)
	vb.add_child(title)

	for i in GameState.characters.size():
		var c: Dictionary = GameState.characters[i]
		var b := Button.new()
		b.text = c.name
		b.custom_minimum_size = Vector2(280, 48)
		b.pressed.connect(_on_pick.bind(i))
		vb.add_child(b)

	var hint := Label.new()
	hint.text = "Then: WASD move · mouse look · L-click melee · R-click ranged"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.modulate = Color(1, 1, 1, 0.6)
	vb.add_child(hint)


func _on_pick(i: int) -> void:
	GameState.selected = i
	get_tree().change_scene_to_file("res://Main.tscn")
