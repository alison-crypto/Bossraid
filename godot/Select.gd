# Character-select screen. Shows a live 3D preview of the highlighted character
# playing a boxing/fight-idle clip (so they aren't standing in a T-pose), with a
# button per character. Picking one stores it in GameState and loads the arena.
extends Control

var viewport: SubViewport
var preview_world: Node3D
var preview_char: Node3D
var preview_anim: AnimationPlayer
var name_label: Label
var buttons: Array = []
var highlight := 0


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var bg := ColorRect.new()
	bg.color = Color(0.07, 0.08, 0.12)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	_build_preview()

	var title := Label.new()
	title.text = "Choose your Character"
	title.add_theme_font_size_override("font_size", 34)
	title.position = Vector2(60, 40)
	add_child(title)

	name_label = Label.new()
	name_label.add_theme_font_size_override("font_size", 26)
	name_label.modulate = Color(1, 0.86, 0.5)
	name_label.position = Vector2(60, 110)
	add_child(name_label)

	# Buttons stacked on the right.
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 14)
	vb.position = Vector2(820, 200)
	add_child(vb)
	for i in GameState.characters.size():
		var c: Dictionary = GameState.characters[i]
		var b := Button.new()
		b.text = c.name
		b.custom_minimum_size = Vector2(320, 52)
		b.focus_mode = Control.FOCUS_NONE
		b.mouse_entered.connect(_show_character.bind(i))
		b.pressed.connect(_on_pick.bind(i))
		vb.add_child(b)
		buttons.append(b)

	var start := Button.new()
	start.text = "▶  Enter Aincrad"
	start.custom_minimum_size = Vector2(320, 60)
	start.focus_mode = Control.FOCUS_NONE
	start.pressed.connect(func(): _on_pick(highlight))
	vb.add_child(start)

	var hint := Label.new()
	hint.text = "WASD move · mouse look · L-click melee · R-click ranged"
	hint.modulate = Color(1, 1, 1, 0.6)
	hint.position = Vector2(60, 660)
	add_child(hint)

	_show_character(clampi(GameState.selected, 0, GameState.characters.size() - 1))


func _build_preview() -> void:
	var svc := SubViewportContainer.new()
	svc.stretch = true
	svc.position = Vector2(120, 150)
	svc.custom_minimum_size = Vector2(560, 540)
	svc.size = Vector2(560, 540)
	svc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(svc)

	viewport = SubViewport.new()
	viewport.own_world_3d = true
	viewport.transparent_bg = true
	viewport.size = Vector2i(560, 540)
	svc.add_child(viewport)

	preview_world = Node3D.new()
	viewport.add_child(preview_world)

	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.09, 0.10, 0.15)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.6, 0.62, 0.7)
	env.ambient_light_energy = 1.0
	var we := WorldEnvironment.new()
	we.environment = env
	preview_world.add_child(we)

	var key := DirectionalLight3D.new()
	key.rotation = Vector3(deg_to_rad(-35), deg_to_rad(35), 0)
	key.light_energy = 1.4
	preview_world.add_child(key)

	var cam := Camera3D.new()
	cam.position = Vector3(0, 1.0, 3.0)
	cam.rotation.x = deg_to_rad(-6)
	preview_world.add_child(cam)


func _show_character(i: int) -> void:
	highlight = i
	var entry: Dictionary = GameState.characters[i]
	name_label.text = String(entry.get("name", ""))

	if preview_char and is_instance_valid(preview_char):
		preview_char.queue_free()
	preview_char = null
	preview_anim = null

	var scene = load(entry.get("file", ""))
	if scene == null:
		return
	preview_char = scene.instantiate()
	preview_world.add_child(preview_char)
	AnimUtil.fit_height(preview_char, 1.7)

	preview_anim = AnimUtil.find_anim_player(preview_char)
	var sk := AnimUtil.find_skeleton(preview_char)
	if preview_anim and sk:
		var box := AnimUtil.merge(preview_anim, sk, "res://models/anim/boxing.glb", "Boxing")
		if box != "":
			var a := preview_anim.get_animation(box)
			if a:
				a.loop_mode = Animation.LOOP_LINEAR
			preview_anim.play(box)
		else:
			_play_first_idle()


func _play_first_idle() -> void:
	if preview_anim == null:
		return
	var list := preview_anim.get_animation_list()
	for n in list:
		if String(n).to_lower().find("idle") != -1:
			preview_anim.play(n)
			return
	if list.size() > 0:
		preview_anim.play(list[0])


func _process(delta: float) -> void:
	# Slow turntable so the character is shown off from all sides.
	if preview_char and is_instance_valid(preview_char):
		preview_char.rotation.y += delta * 0.5


func _on_pick(i: int) -> void:
	GameState.selected = i
	get_tree().change_scene_to_file("res://Main.tscn")
