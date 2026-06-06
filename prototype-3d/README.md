# 3D Feel Test

A throwaway **third-person 3D prototype** to decide whether the full game should
be built in 3D. It is intentionally **not** gameplay — there's no combat, no HP,
no real boss AI. It exists to answer one question: *does steering a hero around a
3D browser world feel good enough to commit the project to 3D?*

## What it is

- A floating, Aincrad-style stone platform ringed with pillars, in a hazy sky
  with drifting rocks — evoking one "floor" of the castle.
- A boss statue in the middle (echoes the Stone Golem) purely for sense of scale.
- A hero you walk/sprint/jump around, with a follow camera behind them.

## Play it

It runs from a plain link — Three.js loads from a CDN, so there's no install:

```
https://raw.githack.com/alison-crypto/Bossraid/claude/3d-prototype/prototype-3d/index.html
```

Or locally: serve the repo root (`python3 -m http.server`) and open
`/prototype-3d/`.

## Controls

- **Click** the screen to capture the mouse.
- **WASD** — move (relative to the camera)
- **Mouse** — look around
- **Shift** — sprint
- **Space** — jump
- **Esc** — release the mouse

## Why it's separate

This lives in its own folder and depends on a CDN copy of Three.js so it can't
affect the existing 2D game at the repo root. If we decide to go 3D, this becomes
the seed of the real engine; if not, we delete the folder.
