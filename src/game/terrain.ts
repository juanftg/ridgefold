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

/** One region is a wide shelf. Interiors stay ≥ 10×10 of one height. */
const REGION = 32;
const PLATEAU_RAMP = 6;
const WATER_R = 11;
const BEACH_R = 12.5;
const SHORE_R = 16.5;
const SUMMIT_R = 6.6;
const MIN_CLIMB = 8;

type RegionKind = "lake" | "flat" | "mountain";

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

function plateauH(noises: Noises, ix: number, iz: number): number {
  const n = 0.5 + 0.5 * fbm(noises.terrace, ix * 0.07 + 2.2, iz * 0.07, 2);
  if (n < 0.33) return 2;
  if (n < 0.8) return 3;
  return 4;
}

function featureKind(ix: number, iz: number, seedNum: number): RegionKind {
  const roll = regionRoll(ix, iz, seedNum);
  if (roll < 0.11) return "lake";
  if (roll > 0.89) return "mountain";
  return "flat";
}

function peakH(ix: number, iz: number, seedNum: number, base: number): number {
  const extra = 3 + Math.round(regionRoll(ix, iz, seedNum ^ 0x9e3779b9) * 2);
  return Math.min(8, Math.max(6, base + extra));
}

function biomeFor(h: number, kind: RegionKind): Biome {
  if (h <= 1) return 0;
  if (h >= 7) return 3;
  if (h >= 5) return kind === "mountain" ? 3 : 2;
  if (h >= 4) return 2;
  return 1;
}

function shelfHeight(
  noises: Noises,
  ix: number,
  iz: number,
  lx: number,
  lz: number,
): number {
  const base = plateauH(noises, ix, iz);
  const nx = ix + (lx < REGION / 2 ? -1 : 1);
  const nz = iz + (lz < REGION / 2 ? -1 : 1);
  const dx = Math.min(lx, REGION - 1 - lx);
  const dz = Math.min(lz, REGION - 1 - lz);
  const nearH = dx < dz ? plateauH(noises, nx, iz) : plateauH(noises, ix, nz);
  const inset = Math.min(dx, dz);
  if (base <= nearH || inset >= PLATEAU_RAMP) return base;
  return Math.max(1, Math.round(nearH + (base - nearH) * (inset / PLATEAU_RAMP)));
}

export function sampleCellAt(noises: Noises, gx: number, gz: number, seedNum = 0): Cell {
  const ix = Math.floor(gx / REGION);
  const iz = Math.floor(gz / REGION);
  const lx = ((gx % REGION) + REGION) % REGION;
  const lz = ((gz % REGION) + REGION) % REGION;
  const land = shelfHeight(noises, ix, iz, lx, lz);
  const kind = featureKind(ix, iz, seedNum);
  const cx = lx + 0.5 - REGION * 0.5;
  const cz = lz + 0.5 - REGION * 0.5;
  const dist = Math.hypot(cx, cz);

  if (kind === "lake") {
    if (dist <= WATER_R) return { h: 0, water: true, biome: 4 };
    if (dist <= BEACH_R) return { h: 1, water: false, biome: 0 };
    if (dist < SHORE_R) {
      const t = (dist - BEACH_R) / (SHORE_R - BEACH_R);
      const h = Math.max(1, Math.round(1 + (land - 1) * t));
      return { h, water: false, biome: biomeFor(h, "flat") };
    }
    return { h: land, water: false, biome: biomeFor(land, "flat") };
  }

  if (kind === "mountain") {
    const peak = peakH(ix, iz, seedNum, land);
    const climbW = Math.max(MIN_CLIMB, peak - land + 1);
    const climbR = SUMMIT_R + climbW;
    if (dist <= SUMMIT_R) {
      return { h: peak, water: false, biome: biomeFor(peak, "mountain") };
    }
    if (dist < climbR) {
      const t = 1 - (dist - SUMMIT_R) / climbW;
      const h = Math.max(land, Math.min(peak, land + Math.round((peak - land) * t)));
      return { h, water: false, biome: biomeFor(h, "mountain") };
    }
    return { h: land, water: false, biome: biomeFor(land, "flat") };
  }

  return { h: land, water: false, biome: biomeFor(land, "flat") };
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
      if (cell.biome === 1 && cell.h >= 2 && cell.h <= 4 && n > 0.988) {
        props.push({
          x: wx + (rng() - 0.5) * 0.25,
          y: top,
          z: wz + (rng() - 0.5) * 0.25,
          kind: "pine",
          scale: 0.75 + rng() * 0.45,
          rot: rng() * Math.PI * 2,
        });
      } else if (cell.biome === 3 && n > 0.96) {
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
  ensureAround(world, 0, 0, REGION * 6);
  const at = (gx: number, gz: number) => {
    if (!isSpawnPad(world, gx, gz)) return null;
    const cell = cellAt(world, gx, gz);
    const [x, z] = gridToWorld(gx, gz);
    return { x, z, h: cell.h };
  };
  for (let r = 0; r <= 8; r++) {
    for (let iz = -r; iz <= r; iz++) {
      for (let ix = -r; ix <= r; ix++) {
        if (Math.max(Math.abs(ix), Math.abs(iz)) !== r) continue;
        if (featureKind(ix, iz, world.seedNum) !== "flat") continue;
        const hit = at(ix * REGION + (REGION >> 1), iz * REGION + (REGION >> 1));
        if (hit) return hit;
      }
    }
  }
  const spiral: [number, number][] = [[0, 0]];
  for (let r = 1; r <= 64; r++) {
    for (let x = -r; x <= r; x++) spiral.push([x, -r], [x, r]);
    for (let z = -r + 1; z <= r - 1; z++) spiral.push([-r, z], [r, z]);
  }
  for (const [gx, gz] of spiral) {
    const hit = at(gx, gz);
    if (hit) return hit;
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
