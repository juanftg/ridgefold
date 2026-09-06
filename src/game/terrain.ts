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
  terrace: Noise2;
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

/** Region spacing. Interiors stay ≥ 10×10 of one height. */
const REGION = 24;

type RegionKind = "lake" | "flat" | "mountain";

type Region = {
  kind: RegionKind;
  h: number;
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

function fbm(noise: Noise2, x: number, z: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function makeNoises(seedNum: number): Noises {
  return {
    terrace: createNoise2D(mulberry32(seedNum ^ 0x27d4eb2f)),
  };
}

function regionRoll(ix: number, iz: number, salt: number): number {
  let h = Math.imul(ix | 0, 0x45d9f3b) ^ Math.imul(iz | 0, 0x27d4eb2f) ^ salt;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function regionAt(noises: Noises, seedNum: number, ix: number, iz: number): Region {
  const roll = regionRoll(ix, iz, seedNum);
  const terr = 0.5 + 0.5 * fbm(noises.terrace, ix * 0.075 + 4.1, iz * 0.075, 2);
  if (roll < 0.15) return { kind: "lake", h: 0 };
  if (roll > 0.84) {
    const peak = 6 + Math.round(terr * 2);
    return { kind: "mountain", h: peak };
  }
  const h = terr < 0.5 ? 2 : terr < 0.82 ? 3 : 4;
  return { kind: "flat", h };
}

function landH(r: Region): number {
  return r.kind === "lake" ? 1 : r.h;
}

function biomeFor(h: number, kind: RegionKind): Biome {
  if (h <= 1) return 0;
  if (h >= 7) return 3;
  if (h >= 5) return kind === "mountain" ? 3 : 2;
  if (h >= 4) return 2;
  return 1;
}

export function sampleCellAt(noises: Noises, gx: number, gz: number, seedNum = 0): Cell {
  const ix = Math.floor(gx / REGION);
  const iz = Math.floor(gz / REGION);
  const lx = ((gx % REGION) + REGION) % REGION;
  const lz = ((gz % REGION) + REGION) % REGION;
  const r = regionAt(noises, seedNum, ix, iz);
  const rx = regionAt(noises, seedNum, ix + (lx < REGION / 2 ? -1 : 1), iz);
  const rz = regionAt(noises, seedNum, ix, iz + (lz < REGION / 2 ? -1 : 1));
  const dx = Math.min(lx, REGION - 1 - lx);
  const dz = Math.min(lz, REGION - 1 - lz);
  const inset = Math.min(dx, dz);
  const near = dx < dz ? rx : rz;
  const shore = landH(near);

  if (r.kind === "lake") {
    if (dx >= 2 && dz >= 2) return { h: 0, water: true, biome: 4 };
    if (inset >= 1) return { h: 1, water: false, biome: 0 };
    const h = Math.max(1, Math.round((1 + shore) * 0.5));
    return { h, water: false, biome: biomeFor(h, "flat") };
  }

  const ramp = r.kind === "mountain" ? 7 : 4;
  if (inset >= ramp) {
    return { h: r.h, water: false, biome: biomeFor(r.h, r.kind) };
  }

  const t = 1 - inset / ramp;
  const h = Math.max(1, Math.min(9, Math.round(r.h + (shore - r.h) * t * 0.5)));
  return { h, water: false, biome: biomeFor(h, r.kind) };
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
      if (cell.biome === 1 && cell.h >= 2 && cell.h <= 4 && n > 0.978) {
        props.push({
          x: wx + (rng() - 0.5) * 0.25,
          y: top,
          z: wz + (rng() - 0.5) * 0.25,
          kind: "pine",
          scale: 0.75 + rng() * 0.45,
          rot: rng() * Math.PI * 2,
        });
      } else if (cell.biome === 3 && n > 0.95) {
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
      cells[lz * CHUNK_SIZE + lx] = sampleCellAt(world.noises, gx, gz, world.seedNum);
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

function isSpawnPad(world: World, gx: number, gz: number): boolean {
  const c = cellAt(world, gx, gz);
  if (c.water || c.h < 2 || c.h > 4) return false;
  for (let dz = -5; dz <= 5; dz++) {
    for (let dx = -5; dx <= 5; dx++) {
      const n = cellAt(world, gx + dx, gz + dz);
      if (n.water || n.h !== c.h) return false;
    }
  }
  return true;
}

function findSpawn(world: World): { x: number; z: number; h: number } {
  ensureAround(world, 0, 0, 56);
  const spiral: [number, number][] = [[0, 0]];
  for (let r = 1; r <= 48; r++) {
    for (let x = -r; x <= r; x++) {
      spiral.push([x, -r], [x, r]);
    }
    for (let z = -r + 1; z <= r - 1; z++) {
      spiral.push([-r, z], [r, z]);
    }
  }
  for (const [gx, gz] of spiral) {
    if (isSpawnPad(world, gx, gz)) {
      const cell = cellAt(world, gx, gz);
      const [x, z] = gridToWorld(gx, gz);
      return { x, z, h: cell.h };
    }
  }
  for (const [gx, gz] of spiral) {
    const cell = cellAt(world, gx, gz);
    if (!cell.water && cell.h >= 2 && cell.h <= 4) {
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
