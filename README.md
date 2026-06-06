# Bossraid

A browser-based, single-player **boss-raid** action game. Control a hero and
fight large bosses with telegraphed attack patterns and dodge windows. Pure
HTML5 Canvas + vanilla ES modules — **no build step required to play**.

## Play

The game is plain static files. Either:

- **Open directly:** open `index.html` in a modern browser. (Local high-score
  persistence may be disabled under `file://` in some browsers; everything else
  works.)
- **Tiny static server (recommended):**
  ```sh
  npx serve .       # or: python3 -m http.server
  ```
- **Dev server (hot reload):**
  ```sh
  npm install
  npm run dev
  ```

## Controls

| Action          | Keys                |
| --------------- | ------------------- |
| Move            | `WASD` / Arrow keys |
| Dash (i-frames) | `Space` / `Shift`   |
| Light attack    | `J` / Left-click    |
| Heavy attack    | `K` / Right-click   |
| Aim             | Mouse               |
| Pause           | `Esc` / `P`         |

Attacks are aimed toward the mouse. Bosses **telegraph** their attacks (a
flashing zone) before they strike — watch for the wind-up and dash through it.

## Bosses

- **Stone Golem** — a grounded bruiser: ground slams, cone sweeps, rock volleys.
- **Hollow Wraith** — an evasive caster: bullet novas, aimed lances, and blinks.

Both have three HP-gated phases that unlock new attacks and ramp aggression.

## Development

```sh
npm install
npm run dev       # Vite dev server
npm test          # Vitest unit tests
npm run lint      # ESLint
npm run format    # Prettier
npm run build     # Production bundle into dist/
```

See [PLAN.md](./PLAN.md) for the design and phase breakdown.

## Project structure

```
src/
  main.js            bootstrap, canvas, scene manager, game loop
  engine/            loop, input, vec2 math, collision primitives
  entities/          player, boss base class, projectile
  bosses/            golem, wraith, + registry (index.js)
  systems/           combat, spawner (telegraphs/projectiles), ui, effects, scores
  scenes/            menu, fight, result
tests/               Vitest unit tests (vec2, collision, combat)
```
