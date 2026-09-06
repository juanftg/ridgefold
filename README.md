# Ridgefold

Endless isometric wanderer. Hills never run out. Lakes sit at the floor of the land — wade them, do not fall through.

## Run it

Node.js 20+. If you already cloned:

```bash
cd ridgefold
git fetch
git reset --hard origin/main
rm -rf node_modules package-lock.json
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

| Input | Action |
| --- | --- |
| WASD / arrows | Move on screen (W is up-screen, even after you turn) |
| Space | Jump up ledges |
| F | Throw a rock — a hit sends hunters running |
| Q / E (or drag) | Rotate the camera |
| Scroll | Zoom |
| Esc / P | Pause |
| Touch | Stick + turn buttons + Jump + Rock |

## How the land works

- **Endless** — chunks generate around you as you walk. There is no map edge.
- **Lakes** — former holes are water at floor height. You wade; you never fall through.
- **Ledges** — walk up 1 step. Jump to climb higher faces.
- **Camera** — follows you with look-ahead. Q/E or drag to orbit. Scroll to zoom.
- **Wanderer** — pick female or male on the title. Hair, jacket, and gait change.
- **Stillness** — stand still too long and the fold sends worse: boar, bear, moose, a fuse that craters the land, then something older. Each hits harder.
- **Fuse** — it swells, explodes, and drops a crater (water if it hits the floor). A rock can scare it off before it blows.
- **Hunters** — wolves bite for one; the still-hunt hits harder. Ten hits and you drop. A rock (F) scares them off; jumping does not hurt them.

## Stack

React + Vite + Canvas 2D. Seeded `simplex-noise`. Game code lives in `src/game/`.
