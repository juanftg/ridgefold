# Ridgefold

Isometric wanderer. A seeded fold of hills, mesas, and missing land.

Walk the slopes. Jump ledges that are too steep. Gaps in the fold — ravines and islands that do not touch — stop you unless you can leap them.

## Run it on your machine

You need **Node.js 20+** ([nodejs.org](https://nodejs.org)).

```bash
git clone https://github.com/juanftg/ridgefold.git
cd ridgefold
npm install
npm run dev
```

If you already cloned it and `npm run dev` failed on Tailwind native bindings:

```bash
cd ridgefold
git pull
rm -rf node_modules package-lock.json
npm install
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`). Open that in your browser.

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

React + Vite + Canvas 2D isometric renderer. Seeded `simplex-noise` (mulberry32). Grid collision, coyote time, jump buffer. Game code lives in `src/game/`.
