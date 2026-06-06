# Bossraid — Game Plan

A browser-based, single-player **boss-raid** action game. You control a hero and
fight a sequence of large boss enemies with telegraphed attack patterns. No build
step required to play — pure HTML5 Canvas + vanilla JS so it runs by opening
`index.html` (or via a tiny static server).

## Goals
- Fun, readable boss fights with clear attack telegraphs and dodge windows.
- Zero-dependency core so it runs anywhere; optional tooling for tests/lint only.
- Clean, modular code that's easy to extend with new bosses and abilities.

## Tech stack
- **Rendering / loop:** HTML5 Canvas 2D, `requestAnimationFrame` game loop.
- **Language:** Vanilla ES modules (`<script type="module">`). No framework.
- **Tooling (dev only):** Vite for local dev server + bundling, Vitest for unit
  tests, ESLint + Prettier. None required to *play* the shipped build.
- **Assets:** Start with primitive shapes / programmatic art; swap in sprites later.

## Project structure
```
/
├── index.html
├── src/
│   ├── main.js            # bootstrap, canvas setup, scene manager, game loop
│   ├── engine/
│   │   ├── loop.js        # fixed-timestep update + interpolated render
│   │   ├── input.js       # keyboard/mouse state
│   │   ├── vec2.js        # vector math helpers
│   │   └── collision.js   # AABB / circle / arc collision
│   ├── entities/
│   │   ├── player.js
│   │   ├── boss.js        # base Boss class
│   │   └── projectile.js
│   ├── bosses/
│   │   ├── index.js       # boss registry
│   │   ├── golem.js       # first boss: attack patterns/phases
│   │   └── wraith.js      # second boss
│   ├── systems/
│   │   ├── combat.js      # damage, hit detection, i-frames
│   │   ├── spawner.js     # projectiles / telegraphs
│   │   ├── effects.js     # hit-stop, screen shake, particles, damage numbers
│   │   ├── scores.js      # local fastest-clear tracking
│   │   └── ui.js          # health bars, boss name, hints
│   └── scenes/
│       ├── menu.js
│       ├── fight.js
│       └── result.js      # win/lose screen
├── tests/                 # Vitest unit tests
└── PLAN.md
```

## Core mechanics
- **Player:** WASD/arrows to move, dash (i-frames on cooldown), light attack,
  heavy attack. Health + stamina bars.
- **Boss:** Large HP pool, multiple **phases** that unlock new attacks as HP drops
  (e.g. <66%, <33%). Attacks are **telegraphed** (wind-up flash/zone) so they're
  dodgeable.
- **Combat feel:** hit-stop on impact, screen shake on heavy hits, damage numbers.
- **Win/lose:** boss HP → 0 = victory; player HP → 0 = defeat. Retry button.

---

## Phases

### Phase 0 — Scaffold ✅
- Init repo: `package.json`, Vite, ESLint/Prettier, Vitest config.
- `index.html` + `src/main.js` that opens a canvas and clears it each frame.
- Fixed-timestep game loop in `engine/loop.js`.
- **Done:** the loop drives an animated canvas at a stable, frame-rate-independent step.

### Phase 1 — Player movement & input ✅
- `engine/input.js` (key/mouse state), `entities/player.js` (move + dash w/ i-frames).
- `engine/vec2.js` helpers. Player rendered as a shape; dash cooldown shown.
- **Done:** smooth move + dash around the arena.

### Phase 2 — Combat foundation ✅
- `engine/collision.js`, `systems/combat.js` (damage, hitboxes, i-frames).
- Player light/heavy attacks with telegraphed arc hitboxes; damage numbers.
- **Done:** attacks register hits and show damage numbers + HP loss (covered by tests).

### Phase 3 — First boss (Golem) ✅
- `entities/boss.js` base class; `bosses/golem.js` with three telegraphed attacks
  (slam, sweep, projectile volley) and HP-gated phase transitions.
- `systems/spawner.js` for projectiles/telegraph zones.
- **Done:** a full, winnable/losable fight against the Golem.

### Phase 4 — UI & game flow ✅
- `systems/ui.js`: player HP/stamina, boss HP bar + name + phase notches, hints.
- `scenes/menu.js`, `scenes/fight.js`, `scenes/result.js` (win/lose + retry).
- **Done:** Menu → Fight → Result loop is complete and replayable.

### Phase 5 — Juice & polish ✅
- `systems/effects.js`: hit-stop, screen shake, particle hits, dash afterimage,
  damage numbers. Difficulty pacing per phase on the Golem.
- **Done:** impacts have weight; the fight *feels* good.

### Phase 6 — Second boss + extensibility ✅
- `bosses/wraith.js` proves the `Boss` base class generalizes (kiting caster,
  novas/lances/blinks). Data-driven boss-select on the menu via `bosses/index.js`.
- **Done:** two distinct bosses are selectable and beatable.

## Stretch goals
- [x] Local fastest-clear tracking (`systems/scores.js`, shown on menu/result).
- [ ] Multiple player abilities / loadouts; upgrade between fights.
- [ ] Mobile/touch controls; gamepad support.
- [ ] Sprite art + animations; music + SFX.

## Testing & quality
- Unit tests (Vitest) for `vec2`, `collision`, and `combat` damage math.
- ESLint + Prettier clean.
