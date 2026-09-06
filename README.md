# Ridgefold

Isometric wanderer. A seeded fold of hills, mesas, and missing land.

Walk the slopes. Jump ledges that are too steep. Gaps in the fold stop you unless you can leap them.

## Run it

You need **Node.js 20+** ([nodejs.org](https://nodejs.org)).

If this folder already exists, reset to the latest (old Tailwind/PostCSS files will break Vite):

```bash
cd /Users/jtiscareno/node/ridgefold
git fetch
git reset --hard origin/main
rm -rf node_modules package-lock.json
npm install
npm run dev
```

Fresh clone:

```bash
git clone https://github.com/juanftg/ridgefold.git
cd ridgefold
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

| Input | Action |
| --- | --- |
| WASD / arrows | Move on screen (W is up-screen) |
| Space | Jump — climb a high step or clear a one-tile break |
| Esc / P | Pause |
| Touch | Left stick + Jump |

## Stack

React + Vite + Canvas 2D. No Tailwind. Game code lives in `src/game/`.
