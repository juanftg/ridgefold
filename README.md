# Ridgefold

Isometric 3D wanderer. A seeded fold of hills, mesas, and missing land.

Walk the slopes. Jump ledges that are too steep. Gaps in the fold — ravines and islands that do not touch — stop you unless you can leap them.

## Play

| Input | Action |
| --- | --- |
| WASD / arrows | Move on screen (W is up-screen) |
| Space | Jump — climb a high step or clear a one-tile break |
| Esc / P | Pause |
| Touch | Left stick + Jump |

Each **seed** grows a different fold. Isolated mesas are walk-blockers, not decoration.

## How the land works

- **Hills** — simplex fBm height, quantized into steps. Walk up 1 step; walk down 2.
- **Too high** — a face taller than a walk-step blocks you until you jump (up to 3 steps).
- **Non-contiguous** — canyons and pits are void. Walking into them stops you. A jump can carry you over a short break; falling into the void returns you to last safe ground.

Spawn is flood-filled onto the largest walk-connected region so you are never dropped onto an island of one tile.

## Stack

React + React Three Fiber + three.js. Seeded `simplex-noise` (mulberry32). Grid collision, coyote time, jump buffer. No physics engine — the rules above are the physics.

Game code lives in `src/game/`.

Source: https://github.com/juanftg/ridgefold
