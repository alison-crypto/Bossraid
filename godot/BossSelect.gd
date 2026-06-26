# Boss Select (Milestone E). Floor 1 has one boss (THE BRUTE). A card + Enter -> arena
# (Main then offers difficulty). Back -> Character Select. Touch routed by UIScreen.
extends UIScreen

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var bg := ColorRect.new()
	bg.color = Color(0.06, 0.06, 0.09)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var title := Label.new()
	title.text = "BOSS SELECT"
	title.add_theme_font_size_override("font_size", 34)
	title.position = Vector2(60, 40)
	add_child(title)

	var floor_lbl := Label.new()
	floor_lbl.text = "AINCRAD  ·  FLOOR 1"
	floor_lbl.add_theme_font_size_override("font_size", 18)
	floor_lbl.modulate = Color(0.6, 0.78, 0.95)
	floor_lbl.position = Vector2(62, 84)
	add_child(floor_lbl)

	# Boss card (centred panel)
	var card := Panel.new()
	card.position = Vector2(340, 150)
	card.size = Vector2(600, 420)
	add_child(card)

	var bossname := Label.new()
	bossname.text = "THE BRUTE"
	bossname.add_theme_font_size_override("font_size", 52)
	bossname.modulate = Color(0.95, 0.5, 0.42)
	bossname.position = Vector2(40, 34)
	card.add_child(bossname)

	var tag := Label.new()
	tag.text = "PumpkinHulk  ·  Floor-1 Guardian"
	tag.add_theme_font_size_override("font_size", 20)
	tag.modulate = Color(0.8, 0.82, 0.9)
	tag.position = Vector2(42, 104)
	card.add_child(tag)

	var desc := Label.new()
	desc.text = "A towering horned brute. Telegraphed ground slams, hurled\nboulders, and a charge. Roll through the slam, punish the\nstagger, and keep the bow on him.\n\nChoose your difficulty after you enter."
	desc.add_theme_font_size_override("font_size", 18)
	desc.modulate = Color(0.78, 0.8, 0.86)
	desc.position = Vector2(42, 160)
	card.add_child(desc)

	# Enter / Back
	var enter := Button.new()
	enter.text = "▶  ENTER ARENA"
	enter.custom_minimum_size = Vector2(300, 64)
	enter.size = Vector2(300, 64)
	enter.position = Vector2(150, 320)
	enter.focus_mode = Control.FOCUS_NONE
	enter.add_theme_font_size_override("font_size", 26)
	enter.pressed.connect(func(): get_tree().change_scene_to_file("res://Main.tscn"))
	card.add_child(enter)

	var back := Button.new()
	back.text = "◀  Back"
	back.custom_minimum_size = Vector2(160, 48)
	back.size = Vector2(160, 48)
	back.position = Vector2(60, 600)
	back.focus_mode = Control.FOCUS_NONE
	back.add_theme_font_size_override("font_size", 20)
	back.pressed.connect(func(): get_tree().change_scene_to_file("res://Select.tscn"))
	add_child(back)
