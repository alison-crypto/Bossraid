# Bossraid 2D

A lightweight, browser-based 2D take on Bossraid — a top-down boss arena. Built
for the cloud workflow: the game **logic is separate from rendering**, so it runs
under Node's test runner (no engine needed to verify behaviour), while the canvas
view layer stays thin. Same damage math as the Godot build.

This lives alongside (not instead of) the 3D Godot project in `godot/` — the 3D
build is developed locally; this 2D one is the for-fun cloud track.

## Run it

ES modules need to be served over HTTP (not `file://`). From this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

(or any static server: `npx serve`, VS Code "Live Server", etc.)

## Controls

- **WASD / arrows** — move
- **J** — light attack (front arc, in range)
- **L** — heavy attack (slower windup baked into cooldown; bigger hit)
- **Space** — dodge (dash + i-frames)
- **R** — restart after VICTORY / DEFEATED

The boss telegraphs a ground slam (red ring grows during wind-up). Step out of the
ring **or** dodge through it; standing in it when it lands hurts.

## Test the logic

```bash
npm test          # == node --test
```

Covers the stat/damage formulas and the simulation: hit detection (range + front
arc), attack cooldown, the slam (hit / dodge i-frames / step-out), win & loss,
arena clamping, and freeze-on-game-over.

## Layout

- `src/stats.js` — pure RPG formulas (force, HP, light/heavy, DEF). Ported from Godot.
- `src/game.js` — headless simulation: `createGame()` + `step(state, input, dt)`.
- `src/main.js` — canvas rendering + keyboard input + the game loop (the view).
- `test/` — `node --test` suites for `stats` and `game`.

## Why this split

Keeping the simulation pure (no DOM, deterministic given `state, input, dt`) means
it's unit-testable headlessly and could later run authoritatively on a server for
multiplayer — the same principle the 3D roadmap calls out.
