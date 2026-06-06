# Bossraid — 3D Roadmap (SAO / Aincrad-style)

The long-term vision: a Sword Art Online–inspired action RPG built as a
**floating castle of floors**, each floor its own map, monsters, dungeon, and
boss. We grow it **one floor at a time** so an impossibly-large "MMO" becomes a
stack of small, shippable pieces.

This is a patient personal project. The plan below is deliberately
incremental — every step is a thing you can actually play.

## Decisions locked

- **3D, in the browser, with Three.js.** Validated with the feel-test prototype
  (`prototype-3d/`). Runs from a plain link, no install.
- **Floor-as-module architecture.** Each floor is self-contained content
  (map + monsters + labyrinth + boss) loaded on demand. The engine is built
  once; floors are added over time.
- **Logic separate from rendering.** Game state (combat, stats, monsters, floor
  progress) is kept independent of how it's drawn/controlled, so multiplayer can
  later move the simulation to a server without a rewrite.

## How the existing work maps in

- The original 2D game's **Stone Golem** and **Hollow Wraith** become **floor
  bosses** (Floor 1 and Floor 2). Their attack patterns/phases carry over.
- A **Town of Beginnings** hub with **Teleport Gates** links unlocked floors.
- Beating a floor boss unlocks the next floor's gate — the SAO progression loop.

## Rollout phases (all host-able on a home PC)

1. **Offline** — single-player in the browser, saves locally. *(No server.)*
2. **Home LAN** — a small game server on your PC; another device on your WiFi
   connects via your PC's local IP. *(You + your wife.)*
3. **Invited friends** — same server exposed through a secure tunnel
   (Cloudflare Tunnel / ngrok). *(No risky router config.)*
4. **More people** — heavier server + a database for accounts/characters.

The key enabler is the "logic separate from rendering" rule above: we build the
simulation so it can run authoritatively on a server when we reach phase 2.

## Build steps (near-term, in order)

- [x] **0. 3D feel test** — third-person walk-around prototype.
- [x] **1. Boss-hall room** — Aincrad Floor 1 styling (columns, knotwork floor,
      stained-glass panels, throne), + aim indicator, first/third-person toggle,
      and collision.
- [ ] **2. Character creation** — name + appearance (body color, build) and a
      starting class/loadout; persisted locally. Applied to the hero model.
- [ ] **3. Combat core in 3D** — light/heavy attacks along the aim direction,
      dodge/dash, health/stamina, hit feedback. Port the 2D combat math.
- [ ] **4. Floor 1 boss fight** — the Golem comes alive on the dais with
      telegraphed attacks; win/lose; the gate to Floor 2 unlocks.
- [ ] **5. Floor structure** — entrance → a short labyrinth → the boss hall,
      with a few basic monsters along the way.
- [ ] **6. Town of Beginnings + Teleport Gate** — a safe hub and fast-travel
      between unlocked floors; floor-select.
- [ ] **7. RPG systems** — XP/levels, simple loot and gear, an inventory.
- [ ] **8. Floor 2 (Wraith)** — prove the floor-module pipeline with a second,
      distinct floor + boss.
- [ ] **9. Multiplayer prototype (LAN)** — move the simulation server-side;
      two players share a floor. *(Rollout phase 2.)*

## Notes / open questions for later

- **Art:** placeholder primitives for now; swap in models (e.g. free low-poly
  packs, Mixamo animations) once systems are proven.
- **Save format:** start with `localStorage`; move to a small database at
  rollout phase 4.
- **Networking model:** authoritative server with client prediction is the goal;
  scope the first LAN prototype to a handful of players, not "massive".
