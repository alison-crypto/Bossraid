# Autoload singleton holding the selected character across scenes.
extends Node

# flip = face the model 180° to match its movement direction (rig-dependent).
# flip = rotate the model 180° so its forward matches movement. Soldier (a
# pre-made glb) faces one way; the FBX→glb-converted Mixamo characters come in
# with the opposite forward axis, so they use flip=false.
# Stats (player's formulas): HP = CON*STR, melee force F = STR*DEX*0.1, DEX also
# speeds swings. def comes from equipment later (0 for now). Tune freely.
var characters := [
	{"name": "Soldier", "file": "res://models/Soldier.glb", "flip": true, "str": 10, "dex": 10, "con": 10},
	{"name": "Vanguard", "file": "res://models/Vanguard.glb", "flip": false, "str": 13, "dex": 8, "con": 11},
	{"name": "Maria", "file": "res://models/Maria.glb", "flip": false, "weapon": false, "str": 10, "dex": 12, "con": 10},
	{"name": "Erika Archer", "file": "res://models/Erika.glb", "flip": false, "str": 8, "dex": 14, "con": 9},
]
var selected := 0

# Weapons. light = combo of merged clip names (cycled per click), heavy = one
# clip. dmg/speed scale damage and swing speed. ranged weapons fire a bolt. The
# held mesh is a placeholder box (len x thick) until real weapon models arrive.
# Available merged clips: Slash, SlashB, Heavy, Stab, Bow.
var weapons := [
	{"name": "Sword", "light": ["Slash", "SlashB"], "heavy": "Heavy", "ranged": false, "dmg": 1.0, "speed": 1.0, "len": 1.1, "thick": 0.06, "color": Color(0.85, 0.9, 1.0)},
	{"name": "Great Sword", "light": ["Heavy", "Slash"], "heavy": "Heavy", "ranged": false, "dmg": 1.7, "speed": 0.8, "len": 1.8, "thick": 0.11, "color": Color(0.8, 0.82, 0.9)},
	{"name": "Dagger", "light": ["Slash", "SlashB"], "heavy": "Stab", "ranged": false, "dmg": 0.55, "speed": 1.5, "len": 0.5, "thick": 0.045, "color": Color(0.9, 0.95, 1.0)},
	{"name": "Spear", "light": ["Stab"], "heavy": "Stab", "ranged": false, "dmg": 1.1, "speed": 1.1, "len": 2.3, "thick": 0.05, "color": Color(0.72, 0.62, 0.5)},
	{"name": "Axe", "light": ["Heavy", "Slash"], "heavy": "Heavy", "ranged": false, "dmg": 1.4, "speed": 0.9, "len": 0.9, "thick": 0.16, "color": Color(0.6, 0.62, 0.66)},
	{"name": "Bow", "light": ["Bow"], "heavy": "Bow", "ranged": true, "dmg": 0.9, "speed": 1.0, "len": 1.0, "thick": 0.05, "color": Color(0.55, 0.38, 0.2)},
]
var weapon := 0


func current() -> Dictionary:
	return characters[clampi(selected, 0, characters.size() - 1)]


func weapon_data() -> Dictionary:
	return weapons[clampi(weapon, 0, weapons.size() - 1)]
