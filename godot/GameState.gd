# Autoload singleton holding the selected character across scenes.
extends Node

# flip = face the model 180° to match its movement direction (rig-dependent).
var characters := [
	{"name": "Soldier", "file": "res://models/Soldier.glb", "flip": true},
	{"name": "Vanguard", "file": "res://models/Vanguard.glb", "flip": true},
	{"name": "Erika Archer", "file": "res://models/Erika.glb", "flip": true},
]
var selected := 0


func current() -> Dictionary:
	return characters[clampi(selected, 0, characters.size() - 1)]
