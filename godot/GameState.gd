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


func current() -> Dictionary:
	return characters[clampi(selected, 0, characters.size() - 1)]
