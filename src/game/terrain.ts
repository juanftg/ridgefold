import { createNoise2D } from "simplex-noise";
import { HEIGHT_UNIT, MAP_SIZE, TILE, WALK_STEP } from "./constants";
import { hashSeed, mulberry32 } from "./rng";

export type Biome = 0 | 1 | 2 | 3;

export type Cell = {
  h: number;
  solid: boolean;
  biome: Biome;
};

export type World = {
  size: number;
  cells: Cell[];
  spawnX: number;
  spawnZ: number;
  spawnH: number;
  seed: string;
};

function fbm(
  noise: (x: number, y: number) => number,
  x: number,
  z: number,
  octaves = 5,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

function inBounds(x: number, z: number, size: number): boolean {
  return x >= 0 && z >= 0 && x < size && z < size;
}

export function cellAt(world: World, gx: number, gz: number): Cell | null {
  if (!inBounds(gx, gz, world.size)) return null;
  return world.cells[gz * world.size + gx]!;
}

export function worldToGrid(x: number, z: number, size: number): [number, number] {
  const origin = size / 2;
  return [Math.floor(x + origin), Math.floor(z + origin)];
}

export function gridToWorld(gx: number, gz: number, size: number): [number, number] {
  const origin = size / 2;
  return [gx - origin + 0.5 * TILE, gz - origin + 0.5 * TILE];
}

export function tileTop(cell: Cell): number {
  return cell.h * HEIGHT_UNIT;
}

function generateOnce(seed: string, size: number): World {
  const seedNum = hashSeed(seed);
  const elevNoise = createNoise2D(mulberry32(seedNum));
  const warpNoise = createNoise2D(mulberry32(seedNum ^ 0x9e3779b9));
  const canyonNoise = createNoise2D(mulberry32(seedNum ^ 0x85ebca6b));
  const pitNoise = createNoise2D(mulberry32(seedNum ^ 0xc2b2ae35));
  const moistNoise = createNoise2D(mulberry32(seedNum ^ 0x27d4eb2f));

  const cells: Cell[] = new Array(size * size);

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const nz = (z + 0.5) / size;
      const wx = nx + 0.18 * warpNoise(nx * 3.1, nz * 3.1);
      const wz = nz + 0.18 * warpNoise(nx * 3.1 + 40, nz * 3.1 + 11);

      let e = 0.5 + 0.5 * fbm(elevNoise, wx * 3.4, wz * 3.4, 5);
      e = Math.pow(Math.max(0, Math.min(1, e)), 1.22);

      const dx = nx - 0.5;
      const dz = nz - 0.5;
      const r = Math.hypot(dx, dz) * 2;
      e *= 1 - Math.pow(Math.min(1, r * 0.82), 2) * 0.22;

      const h = Math.max(0, Math.round(e * 9));
      const canyon = Math.abs(canyonNoise(wx * 2.55, wz * 2.55));
      const pits = pitNoise(nx * 5.4, nz * 5.4);
      const moist = 0.5 + 0.5 * fbm(moistNoise, nx * 4.2, nz * 4.2, 3);

      let solid = true;
      if (canyon < 0.075 && h < 8) solid = false;
      if (pits < -0.52 && h < 6) solid = false;
      if (r > 0.93) solid = false;
      if (h === 0 && moist > 0.62 && r > 0.35) solid = false;

      let biome: Biome = 1;
      if (h >= 7) biome = moist > 0.45 ? 2 : 3;
      else if (h >= 4) biome = moist > 0.55 ? 2 : 1;
      else if (h <= 1) biome = 0;
      else biome = moist < 0.35 ? 0 : 1;

      cells[z * size + x] = { h: solid ? h : 0, solid, biome };
    }
  }

  const largest = largestComponent(cells, size);
  let spawnGx = Math.floor(size / 2);
  let spawnGz = Math.floor(size / 2);
  if (largest.length > 0) {
    let sx = 0;
    let sz = 0;
    for (const i of largest) {
      sx += i % size;
      sz += Math.floor(i / size);
    }
    sx /= largest.length;
    sz /= largest.length;
    let best = largest[0]!;
    let bestD = Infinity;
    for (const i of largest) {
      const gx = i % size;
      const gz = Math.floor(i / size);
      const d = (gx - sx) ** 2 + (gz - sz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    spawnGx = best % size;
    spawnGz = Math.floor(best / size);
  }

  const spawnCell = cells[spawnGz * size + spawnGx]!;
  const [spawnX, spawnZ] = gridToWorld(spawnGx, spawnGz, size);

  return {
    size,
    cells,
    spawnX,
    spawnZ,
    spawnH: spawnCell.solid ? spawnCell.h : 2,
    seed,
  };
}

function largestComponent(cells: Cell[], size: number): number[] {
  const seen = new Uint8Array(size * size);
  let best: number[] = [];
  const dirs = [1, 0, -1, 0, 1];

  for (let start = 0; start < cells.length; start++) {
    if (seen[start] || !cells[start]!.solid) continue;
    const stack = [start];
    const region: number[] = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const x = i % size;
      const z = Math.floor(i / size);
      const h = cells[i]!.h;
      for (let d = 0; d < 4; d++) {
        const nx = x + dirs[d]!;
        const nz = z + dirs[d + 1]!;
        if (!inBounds(nx, nz, size)) continue;
        const ni = nz * size + nx;
        if (seen[ni] || !cells[ni]!.solid) continue;
        if (Math.abs(cells[ni]!.h - h) > WALK_STEP) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    if (region.length > best.length) best = region;
  }
  return best;
}

export function generateWorld(seed: string, size = MAP_SIZE): World {
  let s = seed.trim() || "ridge-mist-1000";
  for (let attempt = 0; attempt < 14; attempt++) {
    const world = generateOnce(attempt === 0 ? s : `${s}#${attempt}`, size);
    const [gx, gz] = worldToGrid(world.spawnX, world.spawnZ, size);
    const spawn = cellAt(world, gx, gz);
    const walkable = countWalkableFromSpawn(world);
    if (spawn?.solid && walkable >= 48) return world;
  }
  return generateOnce(s, size);
}

function countWalkableFromSpawn(world: World): number {
  const [sx, sz] = worldToGrid(world.spawnX, world.spawnZ, world.size);
  const start = cellAt(world, sx, sz);
  if (!start?.solid) return 0;
  const seen = new Set<number>();
  const stack = [sz * world.size + sx];
  seen.add(stack[0]!);
  const dirs = [1, 0, -1, 0, 1];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % world.size;
    const z = Math.floor(i / world.size);
    const h = world.cells[i]!.h;
    for (let d = 0; d < 4; d++) {
      const nx = x + dirs[d]!;
      const nz = z + dirs[d + 1]!;
      if (!inBounds(nx, nz, world.size)) continue;
      const ni = nz * world.size + nx;
      if (seen.has(ni) || !world.cells[ni]!.solid) continue;
      if (Math.abs(world.cells[ni]!.h - h) > WALK_STEP) continue;
      seen.add(ni);
      stack.push(ni);
    }
  }
  return seen.size;
}

export type Prop = {
  x: number;
  y: number;
  z: number;
  kind: "pine" | "rock";
  scale: number;
  rot: number;
};

export function scatterProps(world: World): Prop[] {
  const rng = mulberry32(hashSeed(world.seed) ^ 0xa5a5a5a5);
  const props: Prop[] = [];
  for (let z = 0; z < world.size; z++) {
    for (let x = 0; x < world.size; x++) {
      const cell = world.cells[z * world.size + x]!;
      if (!cell.solid) continue;
      const [wx, wz] = gridToWorld(x, z, world.size);
      const top = tileTop(cell);
      const n = rng();
      if (cell.biome >= 1 && cell.h >= 2 && cell.h <= 6 && n > 0.965) {
        props.push({
          x: wx + (rng() - 0.5) * 0.25,
          y: top,
          z: wz + (rng() - 0.5) * 0.25,
          kind: "pine",
          scale: 0.75 + rng() * 0.45,
          rot: rng() * Math.PI * 2,
        });
      } else if (cell.biome === 3 && n > 0.94) {
        props.push({
          x: wx + (rng() - 0.5) * 0.3,
          y: top,
          z: wz + (rng() - 0.5) * 0.3,
          kind: "rock",
          scale: 0.18 + rng() * 0.22,
          rot: rng() * Math.PI * 2,
        });
      }
    }
  }
  return props;
}
