extends Node
# Milestone 0: action-based input foundation. Registers every gameplay input as a
# named InputMap action (keyboard + gamepad defaults), supports runtime remapping
# persisted to user://, and tracks the last-used device family so the UI can swap
# prompts and pick a control layout (Mobile / PC / Controller). Autoload as "Controls".

signal device_changed(device: String) # "kbm" | "pad" | "touch"
signal bindings_changed

const CFG_PATH := "user://controls.cfg"

# action -> default events. move_* form the locomotion vector (Input.get_vector).
# Each entry: { keys:[physical keycodes], mouse:[button idx], pad:[joy button idx],
#   axis:[[axis, dir]] }. Touch is driven by on-screen controls, not bound here.
const DEFAULTS := {
	"move_up":      {"keys": [KEY_W], "axis": [[JOY_AXIS_LEFT_Y, -1.0]]},
	"move_down":    {"keys": [KEY_S], "axis": [[JOY_AXIS_LEFT_Y, 1.0]]},
	"move_left":    {"keys": [KEY_A], "axis": [[JOY_AXIS_LEFT_X, -1.0]]},
	"move_right":   {"keys": [KEY_D], "axis": [[JOY_AXIS_LEFT_X, 1.0]]},
	"quick_shot":   {"keys": [KEY_J], "mouse": [MOUSE_BUTTON_LEFT], "axis": [[JOY_AXIS_TRIGGER_RIGHT, 1.0]]},
	"power_shot":   {"keys": [KEY_K], "mouse": [MOUSE_BUTTON_RIGHT], "pad": [JOY_BUTTON_RIGHT_SHOULDER]},
	"dodge":        {"keys": [KEY_SPACE], "pad": [JOY_BUTTON_A]},
	"deflect":      {"keys": [KEY_Q], "pad": [JOY_BUTTON_B]},
	"ab_spread":    {"keys": [KEY_1], "pad": [JOY_BUTTON_X]},
	"ab_volley":    {"keys": [KEY_2], "pad": [JOY_BUTTON_Y]},
	"ab_explosive": {"keys": [KEY_3], "pad": [JOY_BUTTON_DPAD_LEFT]},
	"ab_pierce":    {"keys": [KEY_4], "pad": [JOY_BUTTON_DPAD_RIGHT]},
	"arrow_storm":  {"keys": [KEY_X], "axis": [[JOY_AXIS_TRIGGER_LEFT, 1.0]]},
	"aim_lock":     {"keys": [KEY_TAB], "pad": [JOY_BUTTON_LEFT_SHOULDER]},
	"target_next":  {"keys": [KEY_E], "pad": [JOY_BUTTON_DPAD_UP]},
	"target_prev":  {"keys": [KEY_R], "pad": [JOY_BUTTON_DPAD_DOWN]},
	"menu":         {"keys": [KEY_P, KEY_ESCAPE], "pad": [JOY_BUTTON_START]},
}

var last_device := "kbm"


func _ready() -> void:
	_register_defaults()
	_load_overrides()
	process_mode = Node.PROCESS_MODE_ALWAYS


# (Re)create every action from DEFAULTS unless it already exists in the project.
func _register_defaults() -> void:
	for action in DEFAULTS:
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.5)
		_apply_default_events(action)


func _apply_default_events(action: String) -> void:
	InputMap.action_erase_events(action)
	var d: Dictionary = DEFAULTS[action]
	for kc in d.get("keys", []):
		var e := InputEventKey.new(); e.physical_keycode = kc
		InputMap.action_add_event(action, e)
	for mb in d.get("mouse", []):
		var e := InputEventMouseButton.new(); e.button_index = mb
		InputMap.action_add_event(action, e)
	for pb in d.get("pad", []):
		var e := InputEventJoypadButton.new(); e.button_index = pb
		InputMap.action_add_event(action, e)
	for ax in d.get("axis", []):
		var e := InputEventJoypadMotion.new(); e.axis = ax[0]; e.axis_value = ax[1]
		InputMap.action_add_event(action, e)


func reset_defaults() -> void:
	for action in DEFAULTS:
		_apply_default_events(action)
	save_overrides()
	bindings_changed.emit()


# Rebind: replace the keyboard/mouse OR the pad binding of an action with one event.
func rebind(action: String, event: InputEvent, family: String) -> void:
	if not InputMap.has_action(action):
		return
	for e in InputMap.action_get_events(action):
		var is_pad := e is InputEventJoypadButton or e is InputEventJoypadMotion
		if (family == "pad") == is_pad:
			InputMap.action_erase_event(action, e)
	InputMap.action_add_event(action, event)
	save_overrides()
	bindings_changed.emit()


func first_event_text(action: String, family: String) -> String:
	if not InputMap.has_action(action):
		return "?"
	for e in InputMap.action_get_events(action):
		var is_pad := e is InputEventJoypadButton or e is InputEventJoypadMotion
		if (family == "pad") == is_pad:
			return e.as_text()
	return "—"


func save_overrides() -> void:
	var cfg := ConfigFile.new()
	for action in DEFAULTS:
		var arr := []
		for e in InputMap.action_get_events(action):
			arr.append(var_to_str(e))
		cfg.set_value("bindings", action, arr)
	cfg.save(CFG_PATH)


func _load_overrides() -> void:
	if not FileAccess.file_exists(CFG_PATH):
		return
	var cfg := ConfigFile.new()
	if cfg.load(CFG_PATH) != OK:
		return
	for action in DEFAULTS:
		if not cfg.has_section_key("bindings", action):
			continue
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.5)
		InputMap.action_erase_events(action)
		for s in cfg.get_value("bindings", action, []):
			var e = str_to_var(s)
			if e is InputEvent:
				InputMap.action_add_event(action, e)


# Track the last-used input family so the HUD can swap prompts / default layout.
func _input(event: InputEvent) -> void:
	var fam := ""
	if event is InputEventKey or event is InputEventMouseButton or event is InputEventMouseMotion:
		fam = "kbm"
	elif event is InputEventJoypadButton or event is InputEventJoypadMotion:
		fam = "pad"
	elif event is InputEventScreenTouch or event is InputEventScreenDrag:
		fam = "touch"
	if fam != "" and fam != last_device:
		last_device = fam
		device_changed.emit(fam)
