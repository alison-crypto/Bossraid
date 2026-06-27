extends Node
# Lightweight SFX manager (autoload "Sfx"). Preloads the placeholder combat WAVs and
# plays them through a small round-robin pool of non-positional AudioStreamPlayers so
# sounds can overlap. Placeholder synth audio for now — swap the files in audio/sfx/
# for curated CC0 packs later without touching call sites.

const DIR := "res://audio/sfx/"
const NAMES := [
	"bow_draw", "bow_release", "arrow_impact", "dodge_whoosh", "deflect_ping",
	"boss_windup", "boss_slam", "hurt", "victory",
]
const POOL := 10

var _streams := {}
var _players: Array[AudioStreamPlayer] = []
var _next := 0


func _ready() -> void:
	for nm in NAMES:
		var s = load(DIR + nm + ".wav")
		if s:
			_streams[nm] = s
	for i in POOL:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)


# Play a named SFX. vol_db trims level; pitch_var adds ±random pitch for variety.
func play(name: String, vol_db := 0.0, pitch_var := 0.0) -> void:
	var s = _streams.get(name)
	if s == null:
		return
	var p := _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = s
	p.volume_db = vol_db
	p.pitch_scale = 1.0 + randf_range(-pitch_var, pitch_var)
	p.play()
