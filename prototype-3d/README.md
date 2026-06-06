# Floor 1 — Boss Hall (3D engine test)

A 3D prototype styled after the **Aincrad Floor 1 boss room** from Sword Art
Online: an enclosed stone hall with two rows of columns, a green-and-purple
knotwork floor runner, glowing stained-glass wall panels, and a throne at the
far end with the boss (the Stone Golem) lit from above.

It's a **feel test** (combat proper comes later), but it now includes:

- **Third- and first-person camera** with a toggle, over-the-shoulder framing.
- **Over-the-shoulder aiming:** a ground target ring shows where a skill/attack
  lands in third person; a center crosshair is used in first person.
- **Height-aware collision:** columns/walls are solid; low blocks are climbable
  (solid on the sides, but you can jump on top).
- A **training dummy** in the center with a placeholder bolt attack + hit feedback
  (flash, sparks, floating damage numbers, regenerating HP bar) to test aim.

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
- **Mouse** — look / aim (or **click-drag** if the cursor stays visible)
- **Click / hold F** — attack (fires toward the aim point)
- **V** — toggle first / third person
- **Mouse wheel** — zoom (all the way in → first person)
- **Shift** — sprint
- **Space** — jump
- **Esc** — release the mouse

## Status

This is the seed of the real 3D engine (see `../docs/ROADMAP.md`). The geometry
is placeholder primitives + a procedural floor texture; art, combat, and the
rest of the room (the labyrinth leading here, the town hub) come in later steps.
