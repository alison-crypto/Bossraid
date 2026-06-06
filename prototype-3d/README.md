# Floor 1 — Boss Hall (3D engine test)

A 3D prototype styled after the **Aincrad Floor 1 boss room** from Sword Art
Online: an enclosed stone hall with two rows of columns, a green-and-purple
knotwork floor runner, glowing stained-glass wall panels, and a throne at the
far end with the boss (the Stone Golem) lit from above.

It's a **feel test** (combat proper comes later), but it now includes:

- **Third- and first-person camera** with a toggle, over-the-shoulder framing.
- **FPS-style aiming:** a center crosshair in both views; attacks fire where the
  crosshair points (in 3D).
- **Melee + ranged:** left-click swings the sword (close range), right-click
  fires a bolt. F / R are keyboard equivalents.
- **Collision from real solids only:** all open floor is walkable; walls, columns,
  throne and boss block. Low blocks and the dais are climbable (stand on top).
- A **training dummy** in the center with hit feedback (flash, sparks, floating
  damage numbers, regenerating HP bar) to test attacks against.

## Play it (no install)

Three.js loads from a CDN, so it runs from a plain link:

```
https://raw.githack.com/alison-crypto/Bossraid/main/prototype-3d/index.html
```

Or locally: serve the repo root (`python3 -m http.server`) and open
`/prototype-3d/`.

## Controls

- **Click** to capture the mouse.
- **WASD** — move (relative to the camera)
- **Mouse** — aim (crosshair); **click-drag** looks if pointer lock is unavailable
- **Left-click / F** — melee sword swing
- **Right-click / R** — ranged bolt
- **V** — toggle first / third person
- **Mouse wheel** — zoom (all the way in → first person)
- **Shift** — sprint
- **Space** — jump
- **Esc** — release the mouse

## Status

This is the seed of the real 3D engine (see `../docs/ROADMAP.md`). The geometry
is placeholder primitives + a procedural floor texture; art, combat, and the
rest of the room (the labyrinth leading here, the town hub) come in later steps.
