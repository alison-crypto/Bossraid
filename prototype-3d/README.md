# Floor 1 — Boss Hall (3D engine test)

A 3D prototype styled after the **Aincrad Floor 1 boss room** from Sword Art
Online: an enclosed stone hall with two rows of columns, a green-and-purple
knotwork floor runner, glowing stained-glass wall panels, and a throne at the
far end with the boss (the Stone Golem) lit from above.

It's still a **feel test** — no combat yet — but it now includes the pieces we
decided to validate before going all-in on 3D:

- **Third- and first-person camera** with a toggle.
- An **aim crosshair** + a ground **aim arrow** showing the attack direction.
- **Solid collision** against the columns, walls, and boss.

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
- **Mouse** — look (or **click-drag** if the cursor stays visible)
- **V** — toggle first / third person
- **Mouse wheel** — zoom (all the way in → first person)
- **Shift** — sprint
- **Space** — jump
- **Esc** — release the mouse

## Status

This is the seed of the real 3D engine (see `../docs/ROADMAP.md`). The geometry
is placeholder primitives + a procedural floor texture; art, combat, and the
rest of the room (the labyrinth leading here, the town hub) come in later steps.
