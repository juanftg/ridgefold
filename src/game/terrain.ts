import { createNoise2D } from "simplex-noise";
import { CHUNK_SIZE, HEIGHT_UNIT, TILE } from "./constants";
import { hashSeed, mulberry32 } from "./rng";

export type Biome = 0 | 1 | 2 | 3 | 4;

export type Cell = {
  h: number;
  water: boolean;
  biome: Biome;
};

export type Prop = {
  x: number;
  y: number;
  z: number;
  kind: "pine" | "rock";
  scale: number;
  rot: number;
};

type Noise2 = (x: number, y: number) => number;

type Noises = {
  elev: Noise2;
  warp: Noise2;
  canyon: Noise2;
  pit: Noise2;
  moist: Noise2;
};

export type Chunk = {
  cx: number;
  cz: number;
  cells: Cell[];
  props: Prop[];
};

export type World = {
  seed: string;
  seedNum: number;
  chunks: Map<string, Chunk>;
  noises: Noises;
  spawnX: number;
  spawnZ: number;
  spawnH: number;
};

export function chunkKey(cx: number, cz: number): string {
  return `${cx}:${cz}`;
}

export function worldToGrid(x: number, z: number): [number, number] {
  return [Math.floor(x), Math.floor(z)];
}

export function gridToWorld(gx: number, gz: number): [number, number] {
  return [gx + 0.5 * TILE, gz + 0.5 * TILE];
}

export function tileTop(cell: Cell): number {
  return cell.water ? 0 : cell.h * HEIGHT_UNIT;
}

function fbm(noise: Noise2, x: number, z: number, octaves = 5): number {
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

function makeNoises(seedNum: number): Noises {
  return {
    elev: createNoise2D(mulberry32(seedNum)),
    warp: createNoise2D(mulberry32(seedNum ^ 0x9e3779b9)),
    canyon: createNoise2D(mulberry32(seedNum ^ 0x85ebca6b)),
    pit: createNoise2D(mulberry32(seedNum ^ 0xc2b2ae35)),
    moist: createNoise2D(mulberry32(seedNum ^ 0x27d4eb2f)),
  };
}

export function sampleCellAt(noises: Noises, gx: number, gz: number): Cell {
  const nx = gx * 0.021;
  const nz = gz * 0.021;
  const wx = nx + 0.18 * noises.warp(nx * 3.1, nz * 3.1);
  const wz = nz + 0.18 * noises.warp(nx * 3.1 + 40, nz * 3.1 + 11);

  let e = 0.5 + 0.5 * fbm(noises.elev, wx * 3.4, wz * 3.4, 5);
  e = Math.pow(Math.max(0, Math.min(1, e)), 1.18);
  const h = Math.max(0, Math.round(e * 9));
  const canyon = Math.abs(noises.canyon(wx * 2.55, wz * 2.55));
  const pits = noises.pit(gx * 0.112, gz * 0.112);
  const moist = 0.5 + 0.5 * fbm(noises.moist, nx * 4.2, nz * 4.2, 3);

  let water = false;
  if (canyon < 0.078 && h < 8) water = true;
  if (pits < -0.5 && h < 6) water = true;
  if (h === 0 && moist > 0.48) water = true;
  if (h <= 1 && moist > 0.72) water = true;

  if (water) return { h: 0, water: true, biome: 4 };

  let biome: Biome = 1;
  if (h >= 7) biome = moist > 0.45 ? 2 : 3;
  else if (h >= 4) biome = moist > 0.55 ? 2 : 1;
  else if (h <= 1) biome = 0;
  else biome = moist < 0.35 ? 0 : 1;

  return { h, water: false, biome };
}

function scatterChunkProps(seedNum: number, cx: number, cz: number, cells: Cell[]): Prop[] {
  const rng = mulberry32(seedNum ^ ((cx * 73856093) ^ (cz * 19349663)));
  const props: Prop[] = [];
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const cell = cells[lz * CHUNK_SIZE + lx]!;
      if (cell.water) continue;
      const gx = cx * CHUNK_SIZE + lx;
      const gz = cz * CHUNK_SIZE + lz;
      const [wx, wz] = gridToWorld(gx, gz);
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

export function ensureChunk(world: World, cx: number, cz: number): Chunk {
  const key = chunkKey(cx, cz);
  const hit = world.chunks.get(key);
  if (hit) return hit;
  const cells: Cell[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const gx = cx * CHUNK_SIZE + lx;
      const gz = cz * CHUNK_SIZE + lz;
      cells[lz * CHUNK_SIZE + lx] = sampleCellAt(world.noises, gx, gz);
    }
  }
  const chunk: Chunk = {
    cx,
    cz,
    cells,
    props: scatterChunkProps(world.seedNum, cx, cz, cells),
  };
  world.chunks.set(key, chunk);
  return chunk;
}

export function cellAt(world: World, gx: number, gz: number): Cell {
  const cx = Math.floor(gx / CHUNK_SIZE);
  const cz = Math.floor(gz / CHUNK_SIZE);
  const chunk = ensureChunk(world, cx, cz);
  const lx = gx - cx * CHUNK_SIZE;
  const lz = gz - cz * CHUNK_SIZE;
  return chunk.cells[lz * CHUNK_SIZE + lx]!;
}

export function ensureAround(world: World, x: number, z: number, radius: number) {
  const [gx, gz] = worldToGrid(x, z);
  const c0x = Math.floor((gx - radius) / CHUNK_SIZE);
  const c1x = Math.floor((gx + radius) / CHUNK_SIZE);
  const c0z = Math.floor((gz - radius) / CHUNK_SIZE);
  const c1z = Math.floor((gz + radius) / CHUNK_SIZE);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) ensureChunk(world, cx, cz);
  }
}

export function pruneChunks(world: World, x: number, z: number, keep = 4) {
  const [gx, gz] = worldToGrid(x, z);
  const pcx = Math.floor(gx / CHUNK_SIZE);
  const pcz = Math.floor(gz / CHUNK_SIZE);
  for (const [key, chunk] of world.chunks) {
    if (Math.abs(chunk.cx - pcx) > keep || Math.abs(chunk.cz - pcz) > keep) {
      world.chunks.delete(key);
    }
  }
}

function findSpawn(world: World): { x: number; z: number; h: number } {
  ensureAround(world, 0, 0, 40);
  const spiral: [number, number][] = [[0, 0]];
  for (let r = 1; r <= 36; r++) {
    for (let x = -r; x <= r; x++) {
      spiral.push([x, -r], [x, r]);
    }
    for (let z = -r + 1; z <= r - 1; z++) {
      spiral.push([-r, z], [r, z]);
    }
  }
  for (const [gx, gz] of spiral) {
    const cell = cellAt(world, gx, gz);
    if (!cell.water && cell.h >= 2 && cell.h <= 5) {
      const [x, z] = gridToWorld(gx, gz);
      return { x, z, h: cell.h };
    }
  }
  return { x: 0.5, z: 0.5, h: 2 };
}

export function generateWorld(seed: string): World {
  const s = seed.trim() || "ridge-mist";
  const seedNum = hashSeed(s);
  const world: World = {
    seed: s,
    seedNum,
    chunks: new Map(),
    noises: makeNoises(seedNum),
    spawnX: 0.5,
    spawnZ: 0.5,
    spawnH: 2,
  };
  const spawn = findSpawn(world);
  world.spawnX = spawn.x;
  world.spawnZ = spawn.z;
  world.spawnH = spawn.h;
  return world;
}

export function scatterPropsNear(world: World, x: number, z: number, view: number): Prop[] {
  ensureAround(world, x, z, view + 2);
  const [gx, gz] = worldToGrid(x, z);
  const c0x = Math.floor((gx - view) / CHUNK_SIZE);
  const c1x = Math.floor((gx + view) / CHUNK_SIZE);
  const c0z = Math.floor((gz - view) / CHUNK_SIZE);
  const c1z = Math.floor((gz + view) / CHUNK_SIZE);
  const out: Prop[] = [];
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const chunk = world.chunks.get(chunkKey(cx, cz));
      if (!chunk) continue;
      for (const p of chunk.props) {
        if (Math.abs(p.x - x) <= view && Math.abs(p.z - z) <= view) out.push(p);
      }
    }
  }
  return out;
}
