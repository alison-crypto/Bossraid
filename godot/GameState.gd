# Autoload singleton holding the selected character across scenes.
extends Node

# flip = face the model 180° to match its movement direction (rig-dependent).
# flip = rotate the model 180° so its forward matches movement. Soldier (a
# pre-made glb) faces one way; the FBX→glb-converted Mixamo characters come in
# with the opposite forward axis, so they use flip=false.
var characters := [
	{"name": "Soldier", "file": "res://models/Soldier.glb", "flip": true},
	{"name": "Vanguard", "file": "res://models/Vanguard.glb", "flip": false},
	{"name": "Maria", "file": "res://models/Maria.glb", "flip": false, "weapon": false},
	{"name": "Erika Archer", "file": "res://models/Erika.glb", "flip": false},
]
var selected := 0


func current() -> Dictionary:
	return characters[clampi(selected, 0, characters.size() - 1)]
