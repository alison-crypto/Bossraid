# Login / title screen (Milestone E). Pick a player profile -> Character Select.
# Built in code (no .tscn theme), same style as the other screens. Touch taps routed
# by UIScreen so the profile button works on the phone.
extends UIScreen

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var bg := ColorRect.new()
	bg.color = Color(0.05, 0.06, 0.09)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var center := VBoxContainer.new()
	center.set_anchors_preset(Control.PRESET_CENTER)
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_theme_constant_override("separation", 18)
	# anchor-center then nudge up; size to content
	center.position = Vector2(-220, -220)
	center.custom_minimum_size = Vector2(440, 0)
	add_child(center)

	var title := Label.new()
	title.text = "BOSSRAID"
	title.add_theme_font_size_override("font_size", 72)
	title.modulate = Color(1.0, 0.84, 0.42)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.add_child(title)

	var sub := Label.new()
	sub.text = "AINCRAD  ·  FLOOR 1"
	sub.add_theme_font_size_override("font_size", 22)
	sub.modulate = Color(0.6, 0.78, 0.95)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.add_child(sub)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 40)
	center.add_child(spacer)

	var pick := Label.new()
	pick.text = "Select profile"
	pick.add_theme_font_size_override("font_size", 16)
	pick.modulate = Color(0.7, 0.72, 0.8)
	pick.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.add_child(pick)

	var alison := Button.new()
	alison.text = "👤   Alison"
	alison.custom_minimum_size = Vector2(440, 76)
	alison.focus_mode = Control.FOCUS_NONE
	alison.add_theme_font_size_override("font_size", 30)
	alison.pressed.connect(_login.bind("Alison"))
	center.add_child(alison)

	var guest := Button.new()
	guest.text = "+  New profile"
	guest.custom_minimum_size = Vector2(440, 52)
	guest.focus_mode = Control.FOCUS_NONE
	guest.modulate = Color(1, 1, 1, 0.6)
	guest.add_theme_font_size_override("font_size", 20)
	guest.pressed.connect(_login.bind("Player"))
	center.add_child(guest)


func _login(user: String) -> void:
	GameState.user = user
	get_tree().change_scene_to_file("res://Select.tscn")
