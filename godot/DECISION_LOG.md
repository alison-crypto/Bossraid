# Bossraid — Autonomous Build Decision Log

Alison authorized (2026-06-27): *"Get everything done. I will play and give feedback after.
Use your best decision for now and present all the decisions for me after all milestones are done."*

This log records every judgment call made while executing the Floor-1 roadmap autonomously,
for Alison's review. Live game is kept working at every step; visual/pose changes are
self-QA'd with white-room renders (saved for review) and shipped without waiting for sign-off,
per his "I'll play and give feedback after."

---

## Cross-cutting decisions (locked at start)

1. **Renderer → stay `gl_compatibility` (WebGL2/mobile).** Phone support is a hard requirement;
   full GPU trails/glow are unsupported there, so all FX are additive-fake (proven: impact pop,
   charge glow). Revisit only if you ever want a desktop-only build with full FX.
2. **Class scope → Floor 1 is archer-only (Erika).** Melee/kick/block formally parked (code kept,
   not deleted, so it's revivable). Bringing melee to parity is L-effort for content you may never
   select; the archer is the mature, shippable hero.
3. **Jump → removed.** Dead `JUMP` constants with no jump path; Space is the dodge (the archer's
   defining defensive move). Keeping a half-built jump only muddies the control scheme.
4. **Audio → generated placeholder SFX (procedural, CC0-equivalent, committed).** Avoids download/
   licensing risk and gives you something to react to now; the audio *system* is the real
   deliverable. Recommend swapping in curated CC0 packs once you confirm the sound direction.
5. **QA gate (this run only)** → I render pose/anim/aim changes in the white room, verify them
   myself, ship, and save the stills for the final presentation rather than blocking on approval.

---

## Per-milestone decisions

*(appended as each milestone lands)*

### M1 — Combat clarity & hit feedback ✓ (shipped)
- **Screen-shake** added to the camera boom (`_add_shake`, decaying random offset on top of the
  existing aim/rest lerp). Fires on: boss slam/smash/quake **land** (even on a clean dodge — sells
  the weight), taking a hit, parry, stagger-window punish hit, phase-break roar, player death,
  boss kill. Magnitudes tuned per event.
- **Hit-stop** (`_hit_stop`) — brief `Engine.time_scale` dip with a real-time restore timer +
  overlap-guard token. On: hit taken, parry, stagger-punish hit, death, boss kill.
- **Audio layer (NEW system).** `AudioManager.gd` autoload (`Sfx`), round-robin pool of
  AudioStreamPlayers, preloads 9 placeholder SFX. Triggers: bow draw (only past a real draw
  threshold so taps skip it), release, arrow impact, dodge whoosh, deflect/parry ping, boss
  windup, boss slam, hurt, victory.
- **Decision — SFX are procedurally generated placeholders** (`scratchpad/gen_sfx.py`, stdlib
  synth, committed under `audio/sfx/`). Rough but functional and licensing-clean. *Recommend
  swapping for curated CC0 packs once you confirm the sound direction — just drop files with the
  same names into `audio/sfx/`, no code change.*
- **Telegraph color-coding** was already largely present (red danger flash on uninterruptible
  windups, blue dodge ring, white deflect aura, filling slam ring) — left as-is; will revisit
  tinting for dodge-vs-deflect distinction during the M2 pass when the state machine is cleaner.
