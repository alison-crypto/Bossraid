# Autoload singleton holding the selected character across scenes.
extends Node

# flip = face the model 180° to match its movement direction (rig-dependent).
# flip = rotate the model 180° so its forward matches movement. Soldier (a
# pre-made glb) faces one way; the FBX→glb-converted Mixamo characters come in
# with the opposite forward axis, so they use flip=false.
# Stats (player's formulas): HP = CON*STR, melee force F = STR*DEX*0.1, DEX also
# speeds swings. def/boots come from equipment (see armors/boots below). Tune freely.
var characters := [
	{"name": "Soldier", "file": "res://models/Soldier.glb", "flip": true, "str": 10, "dex": 10, "con": 10},
	{"name": "Vanguard", "file": "res://models/Vanguard.glb", "flip": false, "str": 13, "dex": 8, "con": 11},
	{"name": "Maria", "file": "res://models/Maria.glb", "flip": false, "weapon": false, "str": 10, "dex": 12, "con": 10},
	{"name": "Erika Archer", "file": "res://models/erika_bow_final.glb", "flip": false, "weapon": false, "default_weapon": 5, "str": 8, "dex": 14, "con": 9},
]
var selected := 3 # default to Erika Archer (the built-out hero) for direct launch
var user := "Alison" # logged-in profile (set on the Login screen)

# Weapons. light = combo of merged clip names (cycled per click), heavy = one
# clip. damage = flat weapon damage added to the force term. speed scales swing
# speed. ranged weapons fire an arrow (kinetic-energy projectile). The held mesh
# is a placeholder box (len x thick) until real weapon models arrive.
# Available merged clips: Slash, SlashB, Heavy, Stab, Bow.
# weight + str_req drive the dual-wield grip rules (see resolve_grip): a weapon
# can be wielded one-handed only if STR >= str_req; otherwise it's forced
# two-handed. `mesh` is the real weapon model (models/weapons/), replacing the
# placeholder box when weapon visuals are wired. `type` groups movesets.
var weapons := [
	{"name": "Sword", "light": ["Slash", "SlashB"], "heavy": "Heavy", "ranged": false, "damage": 50, "speed": 1.0, "len": 1.1, "thick": 0.06, "color": Color(0.85, 0.9, 1.0), "weight": 6, "str_req": 8, "type": "sword", "mesh": "res://models/weapons/sword1.glb"},
	{"name": "Great Sword", "light": ["Heavy", "Slash"], "heavy": "Heavy", "ranged": false, "damage": 80, "speed": 0.8, "len": 1.8, "thick": 0.11, "color": Color(0.8, 0.82, 0.9), "weight": 16, "str_req": 20, "type": "sword", "mesh": "res://models/weapons/sword2.glb"},
	{"name": "Dagger", "light": ["Slash", "SlashB"], "heavy": "Stab", "ranged": false, "damage": 25, "speed": 1.5, "len": 0.5, "thick": 0.045, "color": Color(0.9, 0.95, 1.0), "weight": 2, "str_req": 4, "type": "dagger", "mesh": "res://models/weapons/dagger.glb"},
	{"name": "Spear", "light": ["Stab"], "heavy": "Stab", "ranged": false, "damage": 55, "speed": 1.1, "len": 2.3, "thick": 0.05, "color": Color(0.72, 0.62, 0.5), "weight": 9, "str_req": 12, "type": "polearm", "mesh": "res://models/weapons/staff.glb"},
	{"name": "Axe", "light": ["Heavy", "Slash"], "heavy": "Heavy", "ranged": false, "damage": 70, "speed": 0.9, "len": 0.9, "thick": 0.16, "color": Color(0.6, 0.62, 0.66), "weight": 11, "str_req": 14, "type": "axe", "mesh": "res://models/weapons/axe_small.glb"},
	{"name": "Bow", "light": ["Bow"], "heavy": "Bow", "ranged": true, "damage": 12, "speed": 1.0, "len": 1.0, "thick": 0.05, "color": Color(0.55, 0.38, 0.2), "weight": 5, "str_req": 7, "type": "bow", "mesh": "res://models/weapons/bow.glb"},
]
var weapon := 0

# Shields (off-hand). def adds to DEF; block multiplies incoming damage when
# guarding (lower = better). Worn in the LEFT hand only. Cycle/equip via UI.
var shields := [
	{"name": "Buckler", "def": 6, "block": 0.5, "weight": 3, "str_req": 5, "mesh": "res://models/weapons/shield.glb"},
	{"name": "Kite Shield", "def": 12, "block": 0.4, "weight": 8, "str_req": 11, "mesh": "res://models/weapons/shield.glb"},
]

# Per-hand loadout for dual-wield. Each hand: {"kind": "weapon"|"shield"|"empty",
# "idx": int}. `weapon` above stays the active right-hand weapon for the current
# (single-weapon) combat code; the per-hand system layers on top of it.
var hands := {
	"right": {"kind": "weapon", "idx": 0},
	"left": {"kind": "empty", "idx": -1},
}

# Armor (equipment). def subtracts directly from incoming damage, after any
# block/parry reduction. Stat-only for now (no mesh). Cycle in-game with [R].
var armors := [
	{"name": "Cloth", "def": 0},
	{"name": "Leather", "def": 4},
	{"name": "Chainmail", "def": 9},
	{"name": "Plate", "def": 16},
]
var armor := 0

# Boots/greaves. kick = flat damage added to the kick attack (which ignores the
# weapon and uses boots instead). Cycle in-game with [T].
var boots := [
	{"name": "Bare Feet", "kick": 0},
	{"name": "Leather Boots", "kick": 10},
	{"name": "Steel Greaves", "kick": 22},
]
var boot := 0

# --- Progression / inventory ------------------------------------------------
# Owned gear: indices into the weapons/armors/boots tables. You can only equip
# what you own; boss-kill loot expands these. Starting kit: one of each (basics).
var owned_weapons := [0, 1, 2, 3, 4, 5]   # all weapons (Sword..Bow)
var owned_armors := [0, 1, 2, 3]          # all armor (Cloth..Plate)
var owned_boots := [0, 1, 2]              # all boots (Bare Feet..Steel Greaves)

# Consumables (distinct from equipment): id -> {name, qty, heal}.
var consumables := {
	"health_potion": {"name": "Health Potion", "qty": 10, "heal": 40},
}

# Progression: a flat skill-point reward per boss kill (no XP curve yet).
var level := 1
var skill_points := 0
const SP_PER_BOSS := 2

# Skills: an ability is usable when unlocked; rank (0..max_rank) improves its
# tied formula (applied in Main._apply_skill_effects). "light" is always-on and
# reference-only (max_rank 0); "heavy" starts locked.
var skills := {
	"light":  {"name": "Light Combo", "key": "LMB", "desc": "Weapon light-attack combo.", "unlocked": true, "rank": 0, "max_rank": 0, "cost": 0},
	"heavy":  {"name": "Heavy Strike", "key": "RMB", "desc": "Slow, hard hit. +0.15 mult / rank.", "unlocked": false, "rank": 0, "max_rank": 3, "cost": 1},
	"kick":   {"name": "Kick", "key": "F", "desc": "Boots damage + knockback. Scales / rank.", "unlocked": true, "rank": 0, "max_rank": 3, "cost": 1},
	"dodge":  {"name": "Dodge Roll", "key": "Space", "desc": "Dash with i-frames. Longer / rank.", "unlocked": true, "rank": 0, "max_rank": 3, "cost": 1},
	"block":  {"name": "Block / Parry", "key": "Q", "desc": "Reduce incoming damage. Better / rank.", "unlocked": true, "rank": 0, "max_rank": 3, "cost": 1},
	"ranged": {"name": "Bow Shot", "key": "MMB", "desc": "Kinetic arrow. Faster launch / rank.", "unlocked": true, "rank": 0, "max_rank": 3, "cost": 1},
	# Archer ability ranks (applied in Main via _archer_rank). Cheap, deep investment.
	"spread":    {"name": "Spread Shot", "key": "1", "desc": "+1 arrow per rank.", "unlocked": true, "rank": 0, "max_rank": 4, "cost": 1, "req_level": 1},
	"volley":    {"name": "Volley", "key": "2", "desc": "+1 arrow & faster cooldown / rank.", "unlocked": true, "rank": 0, "max_rank": 4, "cost": 1, "req_level": 2},
	"explosive": {"name": "Explosive Arrow", "key": "3", "desc": "+blast radius & damage / rank.", "unlocked": true, "rank": 0, "max_rank": 4, "cost": 1, "req_level": 3},
	"pierce":    {"name": "Piercing Bolt", "key": "4", "desc": "+damage / rank.", "unlocked": true, "rank": 0, "max_rank": 4, "cost": 1, "req_level": 4},
	"deflect":   {"name": "Deflect", "key": "Q", "desc": "Longer i-frame window / rank.", "unlocked": true, "rank": 0, "max_rank": 3, "cost": 1, "req_level": 2},
	"storm":     {"name": "Arrow Storm", "key": "X", "desc": "+arrows & faster meter / rank.", "unlocked": true, "rank": 0, "max_rank": 3, "cost": 1, "req_level": 5},
}

# Per-floor mastery: clears[floor] -> count; grants a small floor-local damage buff.
var floor_clears := {}
const SAVE_PATH := "user://bossraid_save.json"

# Rank of an archer ability (0 if unknown). Main reads this to scale abilities.
func skill_rank(id: String) -> int:
	return int(skills[id]["rank"]) if skills.has(id) else 0

func floor_mastery(floor_id: int) -> int:
	return int(floor_clears.get(floor_id, 0))

func add_floor_clear(floor_id: int) -> void:
	floor_clears[floor_id] = floor_mastery(floor_id) + 1
	save()

# Free respec: refund every spent point and zero the ranks (C9's anti-frustration
# lever — experiment freely).
func respec() -> void:
	for id in skills:
		var s: Dictionary = skills[id]
		if int(s["cost"]) > 0:
			skill_points += int(s["rank"]) * int(s["cost"])
			s["rank"] = 0
	save()

# A skill can only be ranked if the player meets its level requirement.
func level_ok(id: String) -> bool:
	return level >= int(skills.get(id, {}).get("req_level", 1))


func save() -> void:
	var ranks := {}
	for id in skills:
		ranks[id] = int(skills[id]["rank"])
	var data := {
		"level": level, "skill_points": skill_points, "ranks": ranks,
		"owned_weapons": owned_weapons, "owned_armors": owned_armors, "owned_boots": owned_boots,
		"weapon": weapon, "armor": armor, "boot": boot, "floor_clears": floor_clears,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data)); f.close()


func load_save() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if not f: return
	var txt := f.get_as_text(); f.close()
	var data = JSON.parse_string(txt)
	if typeof(data) != TYPE_DICTIONARY: return
	level = int(data.get("level", level))
	skill_points = int(data.get("skill_points", skill_points))
	var ranks: Dictionary = data.get("ranks", {})
	for id in ranks:
		if skills.has(id):
			skills[id]["rank"] = clampi(int(ranks[id]), 0, int(skills[id]["max_rank"]))
	owned_weapons = data.get("owned_weapons", owned_weapons)
	owned_armors = data.get("owned_armors", owned_armors)
	owned_boots = data.get("owned_boots", owned_boots)
	floor_clears = data.get("floor_clears", {})


func current() -> Dictionary:
	return characters[clampi(selected, 0, characters.size() - 1)]


func weapon_data() -> Dictionary:
	return weapons[clampi(weapon, 0, weapons.size() - 1)]


func armor_data() -> Dictionary:
	return armors[clampi(armor, 0, armors.size() - 1)]


func boots_data() -> Dictionary:
	return boots[clampi(boot, 0, boots.size() - 1)]


# --- Inventory / progression helpers ----------------------------------------
func owns_weapon(i: int) -> bool:
	return owned_weapons.has(i)


func owns_armor(i: int) -> bool:
	return owned_armors.has(i)


func owns_boots(i: int) -> bool:
	return owned_boots.has(i)


# Dual-wield grip resolver (stat-gated design). Given STR, decide how each hand
# is gripped from the current `hands` loadout:
#   empty hand                          -> "empty"
#   shield (off-hand)                   -> "one_handed"
#   weapon with STR >= str_req, other
#       hand also armed                 -> "one_handed"  (true dual-wield)
#   weapon with empty off-hand          -> "two_handed"  (grip alone for power)
#   weapon with STR < str_req           -> "two_handed"  (too heavy to one-hand)
# Returns {"right","left": grip, "two_handed": bool, "dual": bool}.
func resolve_grip(str_stat: int) -> Dictionary:
	var r: Dictionary = hands["right"]
	var l: Dictionary = hands["left"]
	var r_weap: bool = r.get("kind", "empty") == "weapon"
	var l_weap: bool = l.get("kind", "empty") == "weapon"
	var r_req: int = int(weapons[int(r.get("idx", 0))].get("str_req", 0)) if r_weap else 0
	var l_req: int = int(weapons[int(l.get("idx", 0))].get("str_req", 0)) if l_weap else 0
	var r_heavy: bool = r_weap and str_stat < r_req
	var l_heavy: bool = l_weap and str_stat < l_req
	var both_armed: bool = r_weap and l_weap
	var two_handed: bool = (r_weap and (r_heavy or not l_weap)) or (l_weap and (l_heavy or not r_weap))
	var grip := {"right": "empty", "left": "empty", "two_handed": two_handed, "dual": both_armed and not two_handed}
	if r.get("kind", "empty") == "shield":
		grip["right"] = "one_handed"
	elif r_weap:
		grip["right"] = "two_handed" if two_handed else "one_handed"
	if l.get("kind", "empty") == "shield":
		grip["left"] = "one_handed"
	elif l_weap:
		grip["left"] = "two_handed" if two_handed else "one_handed"
	return grip


func add_gear(kind: String, idx: int) -> void:
	match kind:
		"weapon":
			if not owned_weapons.has(idx):
				owned_weapons.append(idx)
		"armor":
			if not owned_armors.has(idx):
				owned_armors.append(idx)
		"boots":
			if not owned_boots.has(idx):
				owned_boots.append(idx)


func gear_name(kind: String, idx: int) -> String:
	match kind:
		"weapon":
			return String(weapons[clampi(idx, 0, weapons.size() - 1)].get("name", "?"))
		"armor":
			return String(armors[clampi(idx, 0, armors.size() - 1)].get("name", "?"))
		"boots":
			return String(boots[clampi(idx, 0, boots.size() - 1)].get("name", "?"))
	return "?"


func add_consumable(id: String, n: int) -> void:
	if consumables.has(id):
		consumables[id]["qty"] = int(consumables[id]["qty"]) + n


# Consume one charge; returns the heal amount if used, else 0.
func use_consumable(id: String) -> int:
	if consumables.has(id) and int(consumables[id]["qty"]) > 0:
		consumables[id]["qty"] = int(consumables[id]["qty"]) - 1
		return int(consumables[id].get("heal", 0))
	return 0


# Can the player unlock (if locked) or rank up (if not maxed) this skill?
func _ready() -> void:
	load_save()


func can_afford(id: String) -> bool:
	if not skills.has(id):
		return false
	if not level_ok(id):
		return false
	var s: Dictionary = skills[id]
	if not bool(s["unlocked"]):
		return skill_points >= int(s["cost"])
	if int(s["rank"]) < int(s["max_rank"]):
		return skill_points >= int(s["cost"])
	return false


# Spend points to unlock a locked skill, or rank up an unlocked one.
func unlock_or_rank(id: String) -> bool:
	if not can_afford(id):
		return false
	var s: Dictionary = skills[id]
	skill_points -= int(s["cost"])
	if not bool(s["unlocked"]):
		s["unlocked"] = true
	else:
		s["rank"] = int(s["rank"]) + 1
	save()
	return true


func grant_boss_reward() -> void:
	level += 1
	skill_points += SP_PER_BOSS
	save()


# ~60% chance to drop an unowned gear piece; otherwise a Health Potion.
func roll_loot() -> Dictionary:
	var pools := [["weapon", weapons.size(), owned_weapons], ["armor", armors.size(), owned_armors], ["boots", boots.size(), owned_boots]]
	pools.shuffle()
	for p in pools:
		var owned: Array = p[2]
		var unowned: Array = []
		for i in range(int(p[1])):
			if not owned.has(i):
				unowned.append(i)
		if unowned.size() > 0 and randf() < 0.6:
			var idx: int = unowned[randi() % unowned.size()]
			add_gear(String(p[0]), idx)
			return {"kind": String(p[0]), "index": idx, "name": gear_name(String(p[0]), idx)}
	add_consumable("health_potion", 1)
	return {"kind": "consumable", "id": "health_potion", "name": "Health Potion"}


# Persist a stat edit into the active character (survives respawn/scene reload).
func set_character_stat(field: String, value: int) -> void:
	characters[clampi(selected, 0, characters.size() - 1)][field] = value
