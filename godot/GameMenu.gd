# In-game RPG windows: Stats (free tuning), Inventory (owned items + equip +
# consumables), Skills (reference + unlock/rank tree). Built in code, same style
# as the HUD/Select screen (no .tscn, no Theme). Opening a window pauses the game
# and frees the mouse; this CanvasLayer is PROCESS_MODE_ALWAYS so it keeps running
# (and handling input) while the rest of the game is paused.
class_name GameMenu
extends CanvasLayer

var main: Main # back-reference to the game (typed; Main + GameMenu cross-reference)

var root: Control
var panel: Panel
var title: Label
var content: VBoxContainer
var open_window := "" # "" closed, else "stats" / "inv" / "skills"


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 10 # above the HUD
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)

	var backdrop := ColorRect.new()
	backdrop.color = Color(0, 0, 0, 0.55)
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_STOP # don't pass clicks to the world
	root.add_child(backdrop)

	panel = Panel.new()
	panel.position = Vector2(190, 80)
	panel.size = Vector2(900, 560)
	root.add_child(panel)

	title = _label("", 28)
	title.position = Vector2(24, 14)
	panel.add_child(title)

	var closeb := _button("✕  (Esc)", close)
	closeb.position = Vector2(760, 14)
	closeb.size = Vector2(120, 36)
	panel.add_child(closeb)

	content = VBoxContainer.new()
	content.position = Vector2(24, 64)
	content.add_theme_constant_override("separation", 8)
	panel.add_child(content)


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match event.keycode:
		KEY_C:
			toggle("stats")
			get_viewport().set_input_as_handled()
		KEY_I:
			toggle("inv")
			get_viewport().set_input_as_handled()
		KEY_K:
			toggle("skills")
			get_viewport().set_input_as_handled()
		KEY_ESCAPE:
			if open_window != "":
				close()
				get_viewport().set_input_as_handled()


func toggle(which: String) -> void:
	if open_window == which:
		close()
	else:
		open(which)


func open(which: String) -> void:
	open_window = which
	title.text = String({"stats": "Stats", "inv": "Inventory", "skills": "Skills"}.get(which, ""))
	root.visible = true
	get_tree().paused = true
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	refresh()


func close() -> void:
	open_window = ""
	root.visible = false
	get_tree().paused = false
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)


# Rebuild the open window's content (cheap; called on every mutation).
func refresh() -> void:
	if not root.visible or content == null:
		return
	for c in content.get_children():
		content.remove_child(c)
		c.queue_free()
	match open_window:
		"stats":
			_build_stats()
		"inv":
			_build_inventory()
		"skills":
			_build_skills()


# --- Stats window -----------------------------------------------------------
func _build_stats() -> void:
	for s in [["str", "STR", main.player_str], ["dex", "DEX", main.player_dex], ["con", "CON", main.player_con]]:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		var name_lbl := _label(String(s[1]), 22)
		name_lbl.custom_minimum_size = Vector2(64, 0)
		row.add_child(name_lbl)
		row.add_child(_button("  −  ", Callable(main, "_set_stat").bind(String(s[0]), -1)))
		var v := _label(str(s[2]), 22)
		v.custom_minimum_size = Vector2(56, 0)
		v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		row.add_child(v)
		row.add_child(_button("  +  ", Callable(main, "_set_stat").bind(String(s[0]), 1)))
		content.add_child(row)

	content.add_child(_label("", 8))
	var heavy_txt := "locked" if not bool(GameState.skills["heavy"]["unlocked"]) else str(main._heavy_damage())
	for ln in [
		"Max HP: %d" % int(main.player_max),
		"Force base: %.2f" % main._force_base(),
		"Light: %d    Heavy: %s    Kick: %d" % [main._light_damage(), heavy_txt, main._kick_damage()],
		"Arrow:  mass %.2f   launch %.1f m/s" % [main._arrow_mass(), main._arrow_v0()],
		"DEF: %d" % main.player_def,
	]:
		content.add_child(_label(String(ln), 18))


# --- Inventory window -------------------------------------------------------
func _build_inventory() -> void:
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 48)

	var c1 := VBoxContainer.new()
	var ch: Dictionary = GameState.current()
	c1.add_child(_label("Character", 20))
	c1.add_child(_label(String(ch.get("name", "?")), 18))
	c1.add_child(_label("STR %d   DEX %d   CON %d" % [main.player_str, main.player_dex, main.player_con], 16))
	c1.add_child(_label("HP %d    DEF %d" % [int(main.player_max), main.player_def], 16))
	cols.add_child(c1)

	var c2 := VBoxContainer.new()
	c2.add_child(_label("Equipped", 20))
	c2.add_child(_label("⚔ %s" % String(GameState.weapon_data().get("name", "-")), 16))
	c2.add_child(_label("🛡 %s (DEF %d)" % [String(GameState.armor_data().get("name", "-")), int(GameState.armor_data().get("def", 0))], 16))
	c2.add_child(_label("🥾 %s (+%d kick)" % [String(GameState.boots_data().get("name", "-")), int(GameState.boots_data().get("kick", 0))], 16))
	cols.add_child(c2)

	var c3 := VBoxContainer.new()
	c3.add_child(_label("Owned — click to equip", 20))
	for i in GameState.owned_weapons:
		c3.add_child(_button("⚔ %s" % String(GameState.weapons[int(i)].get("name", "?")), Callable(main, "equip_weapon_owned").bind(int(i))))
	for i in GameState.owned_armors:
		c3.add_child(_button("🛡 %s" % String(GameState.armors[int(i)].get("name", "?")), Callable(main, "equip_armor_owned").bind(int(i))))
	for i in GameState.owned_boots:
		c3.add_child(_button("🥾 %s" % String(GameState.boots[int(i)].get("name", "?")), Callable(main, "equip_boots_owned").bind(int(i))))
	cols.add_child(c3)

	content.add_child(cols)
	content.add_child(_label("", 8))
	content.add_child(_label("Items", 20))
	for id in GameState.consumables:
		var item: Dictionary = GameState.consumables[id]
		var qty := int(item.get("qty", 0))
		var b := _button("%s   x%d    (Use)" % [String(item.get("name", "?")), qty], Callable(main, "use_consumable").bind(String(id)))
		b.disabled = qty <= 0
		content.add_child(b)


# --- Skills window ----------------------------------------------------------
func _build_skills() -> void:
	content.add_child(_label("Level %d          Skill Points: %d" % [GameState.level, GameState.skill_points], 20))
	content.add_child(_label("", 6))
	for id in ["light", "heavy", "kick", "dodge", "block", "ranged"]:
		var s: Dictionary = GameState.skills[id]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		var state := ""
		if not bool(s["unlocked"]):
			state = "LOCKED"
		elif int(s["max_rank"]) == 0:
			state = "—"
		else:
			state = "Rank %d/%d" % [int(s["rank"]), int(s["max_rank"])]
		var info := "%s  [%s]   %s   (%s)" % [String(s["name"]), String(s["key"]), String(s["desc"]), state]
		var lbl := _label(info, 16)
		lbl.custom_minimum_size = Vector2(700, 0)
		row.add_child(lbl)
		if int(s["max_rank"]) > 0:
			var verb := "Unlock" if not bool(s["unlocked"]) else "+"
			var btn := _button("%s (%d SP)" % [verb, int(s["cost"])], Callable(main, "skill_upgrade").bind(String(id)))
			btn.disabled = not GameState.can_afford(String(id))
			row.add_child(btn)
		content.add_child(row)


# --- UI helpers (mirror Select.gd) ------------------------------------------
func _label(text: String, size: int) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	return l


func _button(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(cb)
	return b
