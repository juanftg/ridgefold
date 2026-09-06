import {
  BLAST_DAMAGE,
  BLAST_RADIUS,
  CHUNK_SIZE,
  COIN_MAGNET_R,
  COIN_PICKUP_R,
  FUSE_RANGE,
  FUSE_TIME,
  GRAVITY,
  HARE_FLEE_R,
  HEIGHT_UNIT,
  IDLE_FIRST,
  IDLE_GAP,
  MAX_ATK_LV,
  MAX_SCYTHE_LV,
  MAX_SPEED_LV,
  PLAYER_IFRAME,
  PLAYER_RADIUS,
  ROCK_SPEED,
  SHOP_COST,
  WALK_STEP,
  WAVE_FIRST,
  WAVE_GAP,
  WAVE_LIVE_CAP,
  WOLF_AGGRO_R,
} from "./constants";
import { mulberry32 } from "./rng";
import type { Player } from "./sim";
import { cellAt, chunkKey, deformCrater, tileTop, worldToGrid, type World } from "./terrain";

export type MobKind = "hare" | "wolf" | "boar" | "bear" | "moose" | "fuse" | "cthulhu";
export type BuyKind = "speed" | "attack" | "scythe";
export type RockKind = "shot" | "orbit" | "scythe";
export type March = "free" | "seek" | "wall" | "orbit";

export const IDLE_HUNT: MobKind[] = ["boar", "bear", "moose", "fuse", "cthulhu"];

export const MOB_DAMAGE: Record<MobKind, number> = {
  hare: 0,
  wolf: 1,
  boar: 2,
  bear: 3,
  moose: 4,
  fuse: 0,
  cthulhu: 5,
};

export const ATK_NAME = [
  "pebble",
  "heavier",
  "twin",
  "fan",
  "orbit",
  "homing",
  "storm",
  "tempest",
  "cataclysm",
] as const;

export const SCYTHE_NAME = [
  "none",
  "crescent",
  "twin reap",
  "wider",
  "triune",
  "harvest",
  "vortex",
  "reaper",
  "eclipse",
] as const;

const DROP: Record<MobKind, { chance: number; min: number; max: number }> = {
  hare: { chance: 0.42, min: 4, max: 8 },
  wolf: { chance: 0.72, min: 8, max: 14 },
  boar: { chance: 0.8, min: 12, max: 18 },
  bear: { chance: 0.9, min: 16, max: 24 },
  moose: { chance: 0.92, min: 20, max: 28 },
  fuse: { chance: 0.78, min: 14, max: 22 },
  cthulhu: { chance: 1, min: 32, max: 48 },
};

type KindStats = {
  hp: number;
  radius: number;
  aggressive: boolean;
  walk: number;
  chase: number;
  flee: number;
  aggro: number;
};

const STATS: Record<MobKind, KindStats> = {
  hare: { hp: 2, radius: 0.22, aggressive: false, walk: 2.35, chase: 2.35, flee: 4.55, aggro: 0 },
  wolf: { hp: 3, radius: 0.34, aggressive: true, walk: 2.05, chase: 3.85, flee: 5.35, aggro: WOLF_AGGRO_R },
  boar: { hp: 4, radius: 0.38, aggressive: true, walk: 2.15, chase: 4.15, flee: 4.4, aggro: 9.2 },
  bear: { hp: 6, radius: 0.5, aggressive: true, walk: 1.8, chase: 3.35, flee: 3.5, aggro: 10.4 },
  moose: { hp: 7, radius: 0.54, aggressive: true, walk: 2.35, chase: 3.95, flee: 4.05, aggro: 12.2 },
  fuse: { hp: 3, radius: 0.32, aggressive: true, walk: 1.85, chase: 2.82, flee: 4.9, aggro: 9.4 },
  cthulhu: { hp: 12, radius: 0.74, aggressive: true, walk: 1.48, chase: 2.7, flee: 2.15, aggro: 16.5 },
};

export type AttackStats = {
  dmg: number;
  count: number;
  cooldown: number;
  speed: number;
  scale: number;
  pierce: number;
  homing: boolean;
  auto: boolean;
  orbits: number;
  spread: number;
};

export function attackStats(lv: number): AttackStats {
  const n = Math.max(0, Math.min(MAX_ATK_LV, lv));
  return {
    dmg: n >= 5 ? 3 : n >= 1 ? 2 : 1,
    count: n >= 5 ? 3 : n >= 2 ? 2 : 1,
    cooldown: Math.max(0.16, 0.48 - n * 0.04),
    speed: ROCK_SPEED + n * 1.15,
    scale: 1 + Math.min(1.35, n * 0.18),
    pierce: n >= 6 ? 2 : n >= 4 ? 1 : 0,
    homing: n >= 5,
    auto: true,
    orbits: n >= 7 ? 4 : n >= 6 ? 3 : n >= 4 ? 2 : 0,
    spread: n >= 5 ? 0.32 : n >= 2 ? 0.2 : 0,
  };
}

export type ScytheStats = {
  blades: number;
  radius: number;
  spin: number;
  dmg: number;
  scale: number;
};

export function scytheStats(lv: number): ScytheStats {
  const n = Math.max(0, Math.min(MAX_SCYTHE_LV, lv));
  if (n <= 0) return { blades: 0, radius: 0, spin: 0, dmg: 0, scale: 1 };
  return {
    blades: n >= 7 ? 5 : n >= 6 ? 4 : n >= 4 ? 3 : n >= 2 ? 2 : 1,
    radius: 1.55 + n * 0.16,
    spin: 2.15 + n * 0.28,
    dmg: n >= 7 ? 4 : n >= 5 ? 3 : n >= 3 ? 2 : 2,
    scale: 0.95 + n * 0.12,
  };
}

export type Mob = {
  id: number;
  kind: MobKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  radius: number;
  walkPhase: number;
  facing: number;
  hurtT: number;
  fleeT: number;
  fuseT: number;
  alive: boolean;
  aggressive: boolean;
  thinkT: number;
  wishX: number;
  wishZ: number;
  cx: number;
  cz: number;
  march: March;
  orbitA: number;
  orbitR: number;
  marchSp: number;
};

export type Rock = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  alive: boolean;
  age: number;
  dmg: number;
  scale: number;
  pierce: number;
  homing: boolean;
  kind: RockKind;
  orbitA: number;
  orbitR: number;
  hits: number[];
};

export type Coin = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  value: number;
  age: number;
  alive: boolean;
};

export type MobField = {
  mobs: Mob[];
  rocks: Rock[];
  coins: Coin[];
  nextId: number;
  spawned: Set<string>;
  idleT: number;
  idleWave: number;
  waveT: number;
  waveN: number;
};

export type MobEvents = {
  playerDamage: number;
  hits: number;
  kills: number;
  coins: number;
  explosions: { x: number; z: number }[];
};

export function createMobField(): MobField {
  return {
    mobs: [],
    rocks: [],
    coins: [],
    nextId: 1,
    spawned: new Set(),
    idleT: 0,
    idleWave: 0,
    waveT: 0,
    waveN: 0,
  };
}

function sampleTop(world: World, x: number, z: number) {
  const [gx, gz] = worldToGrid(x, z);
  return cellAt(world, gx, gz);
}

function blocked(world: World, x: number, z: number, feetY: number, radius: number): boolean {
  const offs: [number, number][] = [
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ];
  const maxRise = WALK_STEP * HEIGHT_UNIT;
  for (const [ox, oz] of offs) {
    const cell = sampleTop(world, x + ox, z + oz);
    if (tileTop(cell) - feetY > maxRise + 0.04) return true;
  }
  return false;
}

export function spawnMobAt(
  field: MobField,
  world: World,
  kind: MobKind,
  x: number,
  z: number,
  extra?: { march?: March; marchSp?: number; orbitA?: number; orbitR?: number },
): Mob {
  const cell = sampleTop(world, x, z);
  const st = STATS[kind];
  const [gx, gz] = worldToGrid(x, z);
  const mob: Mob = {
    id: field.nextId++,
    kind,
    x,
    y: tileTop(cell),
    z,
    vx: 0,
    vz: 0,
    yaw: 0,
    hp: st.hp,
    maxHp: st.hp,
    radius: st.radius,
    walkPhase: 0,
    facing: 0,
    hurtT: 0,
    fleeT: 0,
    fuseT: 0,
    alive: true,
    aggressive: st.aggressive,
    thinkT: 0.2,
    wishX: 0,
    wishZ: 0,
    cx: Math.floor(gx / CHUNK_SIZE),
    cz: Math.floor(gz / CHUNK_SIZE),
    march: extra?.march ?? "free",
    orbitA: extra?.orbitA ?? 0,
    orbitR: extra?.orbitR ?? 0,
    marchSp: extra?.marchSp ?? 1.12,
  };
  field.mobs.push(mob);
  return mob;
}

function pickLandInChunk(world: World, cx: number, cz: number, rng: () => number): [number, number] | null {
  for (let n = 0; n < 10; n++) {
    const lx = Math.floor(rng() * CHUNK_SIZE);
    const lz = Math.floor(rng() * CHUNK_SIZE);
    const gx = cx * CHUNK_SIZE + lx;
    const gz = cz * CHUNK_SIZE + lz;
    const cell = cellAt(world, gx, gz);
    if (cell.water || cell.h < 1) continue;
    return [gx + 0.5, gz + 0.5];
  }
  return null;
}

function pickLandNear(world: World, x: number, z: number, dist: number, ang: number): [number, number] {
  for (let i = 0; i < 8; i++) {
    const a = ang + i * 0.7;
    const px = x + Math.cos(a) * dist;
    const pz = z + Math.sin(a) * dist;
    const cell = sampleTop(world, px, pz);
    if (!cell.water && cell.h >= 1) return [px, pz];
  }
  return [x + Math.cos(ang) * dist, z + Math.sin(ang) * dist];
}

export function ensureMobsAround(world: World, field: MobField, x: number, z: number, radius: number) {
  const [gx, gz] = worldToGrid(x, z);
  const c0x = Math.floor((gx - radius) / CHUNK_SIZE);
  const c1x = Math.floor((gx + radius) / CHUNK_SIZE);
  const c0z = Math.floor((gz - radius) / CHUNK_SIZE);
  const c1z = Math.floor((gz + radius) / CHUNK_SIZE);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const key = chunkKey(cx, cz);
      if (field.spawned.has(key)) continue;
      field.spawned.add(key);
      const wx = cx * CHUNK_SIZE + CHUNK_SIZE * 0.5;
      const wz = cz * CHUNK_SIZE + CHUNK_SIZE * 0.5;
      if (Math.hypot(wx - world.spawnX, wz - world.spawnZ) < 10) continue;
      const rng = mulberry32(world.seedNum ^ 0xa5f11e ^ ((cx * 374761393) ^ (cz * 668265263)));
      const roll = rng();
      const count = roll < 0.4 ? 0 : 1;
      for (let i = 0; i < count; i++) {
        const pos = pickLandInChunk(world, cx, cz, rng);
        if (!pos) continue;
        spawnMobAt(field, world, "hare", pos[0], pos[1]);
      }
    }
  }
}

export function pruneMobs(field: MobField, x: number, z: number, keepChunks: number) {
  const pcx = Math.floor(x / CHUNK_SIZE);
  const pcz = Math.floor(z / CHUNK_SIZE);
  field.mobs = field.mobs.filter((m) => {
    if (Math.abs(m.cx - pcx) > keepChunks || Math.abs(m.cz - pcz) > keepChunks) return false;
    return true;
  });
  field.coins = field.coins.filter((c) => {
    if (!c.alive) return false;
    return Math.hypot(c.x - x, c.z - z) < keepChunks * CHUNK_SIZE;
  });
  for (const key of [...field.spawned]) {
    const [sx, sz] = key.split(":").map(Number);
    if (Math.abs((sx ?? 0) - pcx) > keepChunks || Math.abs((sz ?? 0) - pcz) > keepChunks) {
      field.spawned.delete(key);
    }
  }
}

function dropCoins(field: MobField, m: Mob) {
  const spec = DROP[m.kind];
  if (Math.random() > spec.chance) return;
  const value = spec.min + Math.floor(Math.random() * (spec.max - spec.min + 1));
  const n = value >= 28 ? 3 : value >= 16 ? 2 : 1;
  const each = Math.max(1, Math.floor(value / n));
  let left = value;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = i === n - 1 ? left : each;
    left -= v;
    field.coins.push({
      x: m.x + Math.cos(a) * 0.22,
      y: m.y + 0.35,
      z: m.z + Math.sin(a) * 0.22,
      vx: Math.cos(a) * 1.4,
      vz: Math.sin(a) * 1.4,
      value: v,
      age: 0,
      alive: true,
    });
  }
}

function killMob(field: MobField, m: Mob, events: MobEvents) {
  if (!m.alive) return;
  m.alive = false;
  m.hurtT = 0.2;
  m.fuseT = 0;
  events.kills += 1;
  dropCoins(field, m);
}

function hitMob(field: MobField, m: Mob, dmg: number, events: MobEvents) {
  if (!m.alive) return;
  m.hp -= dmg;
  m.hurtT = 0.18;
  m.fuseT = 0;
  events.hits += 1;
  if (m.kind === "hare") m.fleeT = 2.4;
  if (m.hp <= 0) killMob(field, m, events);
}

function nearestHostile(field: MobField, player: Player, maxD: number): Mob | null {
  let best: Mob | null = null;
  let bestD = maxD;
  for (const m of field.mobs) {
    if (!m.alive || !m.aggressive) continue;
    const d = Math.hypot(m.x - player.x, m.z - player.z);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

function aimDir(field: MobField, player: Player): { x: number; z: number; dist: number } {
  let fx = -Math.sin(player.yaw);
  let fz = -Math.cos(player.yaw);
  let mag = Math.hypot(fx, fz);
  if (mag < 0.05) {
    fx = 1;
    fz = 0;
    mag = 1;
  }
  fx /= mag;
  fz /= mag;
  let aimX = fx;
  let aimZ = fz;
  let aimD = 8;
  let aimed = false;
  for (const m of field.mobs) {
    if (!m.alive || (!m.aggressive && m.kind !== "hare")) continue;
    const dx = m.x - player.x;
    const dz = m.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15 || d > 12) continue;
    const nx = dx / d;
    const nz = dz / d;
    if (nx * fx + nz * fz < -0.12) continue;
    if (!aimed || d < aimD) {
      aimed = true;
      aimD = d;
      aimX = nx;
      aimZ = nz;
    }
  }
  return { x: aimX, z: aimZ, dist: aimed ? aimD : 6 };
}

function makeShot(
  player: Player,
  ax: number,
  az: number,
  st: AttackStats,
  range: number,
): Rock {
  const mag = Math.hypot(ax, az) || 1;
  const nx = ax / mag;
  const nz = az / mag;
  const lift = 1.35 + Math.min(2.4, range * 0.12);
  return {
    x: player.x + nx * 0.38,
    y: player.y + 0.52,
    z: player.z + nz * 0.38,
    vx: nx * st.speed,
    vy: lift,
    vz: nz * st.speed,
    alive: true,
    age: 0,
    dmg: st.dmg,
    scale: st.scale,
    pierce: st.pierce,
    homing: st.homing,
    kind: "shot",
    orbitA: 0,
    orbitR: 0,
    hits: [],
  };
}

export function throwRock(_world: World, field: MobField, player: Player): boolean {
  if (player.throwCd > 0 || player.hp <= 0) return false;
  const liveShots = field.rocks.filter((r) => r.alive && r.kind === "shot").length;
  if (liveShots >= 10) return false;
  const st = attackStats(player.atkLv);
  player.throwCd = st.cooldown;
  player.squash = 1.12;
  const aim = aimDir(field, player);
  const count = st.count;
  const spread = st.spread;
  if (count <= 1) {
    field.rocks.push(makeShot(player, aim.x, aim.z, st, aim.dist));
    return true;
  }
  const base = Math.atan2(aim.z, aim.x);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
    const a = base + t * spread;
    field.rocks.push(makeShot(player, Math.cos(a), Math.sin(a), st, aim.dist));
  }
  return true;
}

function syncOrbits(field: MobField, player: Player) {
  const st = attackStats(player.atkLv);
  const want = player.hp > 0 ? st.orbits : 0;
  const orbits = field.rocks.filter((r) => r.kind === "orbit" && r.alive);
  if (orbits.length === want) {
    for (const r of orbits) {
      r.dmg = st.dmg;
      r.scale = st.scale * 0.82;
      r.orbitR = 1.28 + want * 0.12;
    }
    return;
  }
  field.rocks = field.rocks.filter((r) => r.kind !== "orbit");
  for (let i = 0; i < want; i++) {
    const a = (i / want) * Math.PI * 2;
    field.rocks.push({
      x: player.x,
      y: player.y + 0.55,
      z: player.z,
      vx: 0,
      vy: 0,
      vz: 0,
      alive: true,
      age: 0,
      dmg: st.dmg,
      scale: st.scale * 0.82,
      pierce: 99,
      homing: false,
      kind: "orbit",
      orbitA: a,
      orbitR: 1.28 + want * 0.12,
      hits: [],
    });
  }
}

function syncScythes(field: MobField, player: Player) {
  const st = scytheStats(player.scytheLv);
  const want = player.hp > 0 ? st.blades : 0;
  const blades = field.rocks.filter((r) => r.kind === "scythe" && r.alive);
  if (blades.length === want) {
    for (const r of blades) {
      r.dmg = st.dmg;
      r.scale = st.scale;
      r.orbitR = st.radius;
    }
    return;
  }
  field.rocks = field.rocks.filter((r) => r.kind !== "scythe");
  for (let i = 0; i < want; i++) {
    const a = (i / want) * Math.PI * 2;
    field.rocks.push({
      x: player.x,
      y: player.y + 0.62,
      z: player.z,
      vx: 0,
      vy: 0,
      vz: 0,
      alive: true,
      age: 0,
      dmg: st.dmg,
      scale: st.scale,
      pierce: 99,
      homing: false,
      kind: "scythe",
      orbitA: a,
      orbitR: st.radius,
      hits: [],
    });
  }
}

export function tryBuy(player: Player, field: MobField, kind: BuyKind): boolean {
  if (player.coins < SHOP_COST) return false;
  if (kind === "speed") {
    if (player.speedLv >= MAX_SPEED_LV) return false;
    player.speedLv += 1;
  } else if (kind === "scythe") {
    if (player.scytheLv >= MAX_SCYTHE_LV) return false;
    player.scytheLv += 1;
  } else {
    if (player.atkLv >= MAX_ATK_LV) return false;
    player.atkLv += 1;
  }
  player.coins -= SHOP_COST;
  syncOrbits(field, player);
  syncScythes(field, player);
  return true;
}

function waveKind(n: number, i: number): MobKind {
  if (n >= 10 && i === 0) return "cthulhu";
  if (n >= 7 && i % 7 === 0) return "fuse";
  if (n >= 6 && i % 5 === 0) return "moose";
  if (n >= 4 && i % 4 === 0) return "bear";
  if (n >= 2 && i % 3 === 0) return "boar";
  return "wolf";
}

function spawnWave(world: World, field: MobField, player: Player) {
  const n = field.waveN;
  const pattern = n % 4;
  const count = Math.min(14, 5 + Math.floor(n * 0.7));
  const sp = 1.0 + Math.min(0.5, n * 0.035);
  const dist = 7.1 + (n % 3) * 0.25;
  const base = n * 0.85 + player.yaw;

  if (pattern === 0) {
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      const [sx, sz] = pickLandNear(
        world,
        player.x + Math.cos(a) * dist,
        player.z + Math.sin(a) * dist,
        0.4,
        a,
      );
      spawnMobAt(field, world, waveKind(n, i), sx, sz, { march: "seek", marchSp: sp });
    }
    return;
  }

  if (pattern === 1) {
    const fx = Math.cos(base);
    const fz = Math.sin(base);
    const px = -fz;
    const pz = fx;
    for (let i = 0; i < count; i++) {
      const along = (i - (count - 1) / 2) * 0.95;
      const [sx, sz] = pickLandNear(
        world,
        player.x + fx * dist + px * along,
        player.z + fz * dist + pz * along,
        0.45,
        base,
      );
      const m = spawnMobAt(field, world, waveKind(n, i), sx, sz, { march: "wall", marchSp: sp * 0.92 });
      const dx = player.x - sx;
      const dz = player.z - sz;
      const d = Math.hypot(dx, dz) || 1;
      m.wishX = dx / d;
      m.wishZ = dz / d;
    }
    return;
  }

  if (pattern === 2) {
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      const [sx, sz] = pickLandNear(
        world,
        player.x + Math.cos(a) * dist,
        player.z + Math.sin(a) * dist,
        0.4,
        a,
      );
      spawnMobAt(field, world, waveKind(n, i), sx, sz, {
        march: "orbit",
        marchSp: sp,
        orbitA: a,
        orbitR: dist,
      });
    }
    return;
  }

  const fan = 0.95;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const a = base + t * fan;
    const [sx, sz] = pickLandNear(
      world,
      player.x + Math.cos(a) * dist,
      player.z + Math.sin(a) * dist,
      0.4,
      a,
    );
    spawnMobAt(field, world, waveKind(n, i), sx, sz, { march: "seek", marchSp: sp });
  }
}

function stepWaves(world: World, field: MobField, player: Player, dt: number) {
  if (player.hp <= 0) return;
  field.waveT += dt;
  const nextAt = WAVE_FIRST + field.waveN * WAVE_GAP;
  if (field.waveT < nextAt) return;
  const live = field.mobs.filter((m) => m.alive && m.aggressive).length;
  if (live >= WAVE_LIVE_CAP) return;
  spawnWave(world, field, player);
  field.waveN += 1;
}

function stepIdleHunt(world: World, field: MobField, player: Player, dt: number) {
  const moving = Math.hypot(player.vx, player.vz) > 0.42 || !player.grounded;
  if (moving) {
    field.idleT = Math.max(0, field.idleT - dt * 2.2);
    if (field.idleT <= 0) field.idleWave = 0;
    return;
  }
  if (player.hp <= 0) return;
  field.idleT += dt;
  const nextAt = IDLE_FIRST + field.idleWave * IDLE_GAP;
  if (field.idleWave >= IDLE_HUNT.length || field.idleT < nextAt) return;
  const kind = IDLE_HUNT[field.idleWave]!;
  const a = player.yaw + field.idleWave * 0.72;
  const dist = 3.45 + field.idleWave * 0.22;
  const [sx, sz] = pickLandNear(
    world,
    player.x - Math.sin(a) * dist,
    player.z - Math.cos(a) * dist,
    1.35,
    a,
  );
  spawnMobAt(field, world, kind, sx, sz, { march: "seek", marchSp: 1.18 });
  field.idleWave += 1;
}

function stepCoins(world: World, field: MobField, player: Player, dt: number, events: MobEvents) {
  for (const c of field.coins) {
    if (!c.alive) continue;
    c.age += dt;
    const floor = tileTop(sampleTop(world, c.x, c.z));
    c.y += (floor + 0.28 - c.y) * (1 - Math.exp(-dt * 8));
    const dx = player.x - c.x;
    const dz = player.z - c.z;
    const dist = Math.hypot(dx, dz);
    if (player.hp > 0 && dist < COIN_MAGNET_R) {
      const pull = dist < 1.1 ? 16 : 9;
      const inv = dist > 0.001 ? 1 / dist : 0;
      c.vx += dx * inv * pull * dt;
      c.vz += dz * inv * pull * dt;
    } else {
      c.vx *= Math.exp(-dt * 4.5);
      c.vz *= Math.exp(-dt * 4.5);
    }
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    if (player.hp > 0 && dist < COIN_PICKUP_R) {
      player.coins += c.value;
      events.coins += c.value;
      c.alive = false;
    } else if (c.age > 28) {
      c.alive = false;
    }
  }
  field.coins = field.coins.filter((c) => c.alive);
}

export function stepMobs(world: World, field: MobField, player: Player, dt: number): MobEvents {
  const events: MobEvents = { playerDamage: 0, hits: 0, kills: 0, coins: 0, explosions: [] };
  stepIdleHunt(world, field, player, dt);
  stepWaves(world, field, player, dt);
  syncOrbits(field, player);
  syncScythes(field, player);

  const st = attackStats(player.atkLv);
  if (st.auto && player.hp > 0 && player.throwCd <= 0) {
    if (nearestHostile(field, player, 13)) throwRock(world, field, player);
  }

  for (const m of field.mobs) {
    if (!m.alive) continue;
    m.hurtT = Math.max(0, m.hurtT - dt);
    m.fleeT = Math.max(0, m.fleeT - dt);
    m.thinkT -= dt;
    const ks = STATS[m.kind];
    const dx = player.x - m.x;
    const dz = player.z - m.z;
    const dist = Math.hypot(dx, dz);
    const scared = m.fleeT > 0;
    if (m.march !== "free" && !scared && player.hp > 0) {
      if (m.march === "orbit") {
        m.orbitA += dt * 0.58;
        m.orbitR = Math.max(1.7, m.orbitR - dt * 0.38);
        const tx = player.x + Math.cos(m.orbitA) * m.orbitR;
        const tz = player.z + Math.sin(m.orbitA) * m.orbitR;
        const ox = tx - m.x;
        const oz = tz - m.z;
        const od = Math.hypot(ox, oz) || 1;
        m.wishX = ox / od;
        m.wishZ = oz / od;
      } else if (m.march === "wall") {
        const inv = dist > 0.001 ? 1 / dist : 0;
        m.wishX = m.wishX * 0.94 + dx * inv * 0.06;
        m.wishZ = m.wishZ * 0.94 + dz * inv * 0.06;
        const wm = Math.hypot(m.wishX, m.wishZ) || 1;
        m.wishX /= wm;
        m.wishZ /= wm;
      } else {
        const inv = dist > 0.001 ? 1 / dist : 0;
        m.wishX = dx * inv;
        m.wishZ = dz * inv;
      }
    } else if (m.thinkT <= 0) {
      m.thinkT = 0.32 + (m.id % 7) * 0.07;
      if (scared) {
        const inv = dist > 0.001 ? 1 / dist : 0;
        m.wishX = -dx * inv;
        m.wishZ = -dz * inv;
      } else if (m.aggressive) {
        if (dist < ks.aggro && player.hp > 0) {
          const inv = dist > 0.001 ? 1 / dist : 0;
          m.wishX = dx * inv;
          m.wishZ = dz * inv;
        } else {
          const a = (m.id * 1.7 + m.thinkT * 9) % (Math.PI * 2);
          m.wishX = Math.cos(a);
          m.wishZ = Math.sin(a);
        }
      } else if (dist < HARE_FLEE_R && player.hp > 0) {
        const inv = dist > 0.001 ? 1 / dist : 0;
        m.wishX = -dx * inv;
        m.wishZ = -dz * inv;
      } else {
        const a = (m.id * 2.3 + player.x) % (Math.PI * 2);
        m.wishX = Math.cos(a);
        m.wishZ = Math.sin(a);
      }
    }
    const cell = sampleTop(world, m.x, m.z);
    const chasing = m.aggressive && !scared && dist < ks.aggro;
    const fleeing = scared || (!m.aggressive && dist < HARE_FLEE_R);
    let speed =
      m.march !== "free" && !scared
        ? m.marchSp
        : chasing
          ? ks.chase
          : fleeing
            ? ks.flee
            : ks.walk;
    if (m.kind === "fuse" && !scared && dist < FUSE_RANGE && player.hp > 0) {
      m.fuseT += dt;
      speed *= 0.18;
    } else if (m.kind === "fuse") {
      m.fuseT = Math.max(0, m.fuseT - dt * 0.7);
    }
    if (cell.water) speed *= 0.55;
    m.vx = m.wishX * speed;
    m.vz = m.wishZ * speed;
    const nx = m.x + m.vx * dt;
    const nz = m.z + m.vz * dt;
    if (!blocked(world, nx, nz, m.y, m.radius)) {
      m.x = nx;
      m.z = nz;
    } else if (!blocked(world, nx, m.z, m.y, m.radius)) {
      m.x = nx;
    } else if (!blocked(world, m.x, nz, m.y, m.radius)) {
      m.z = nz;
    } else {
      m.wishX = -m.wishX;
      m.wishZ = -m.wishZ;
      m.thinkT = 0.12;
    }
    const support = sampleTop(world, m.x, m.z);
    m.y = tileTop(support);
    const [gx, gz] = worldToGrid(m.x, m.z);
    m.cx = Math.floor(gx / CHUNK_SIZE);
    m.cz = Math.floor(gz / CHUNK_SIZE);
    const moving = Math.hypot(m.vx, m.vz);
    if (moving > 0.2) {
      m.walkPhase += dt * Math.PI * 2 * (m.kind === "hare" ? 1.55 : 1.12);
      m.yaw = Math.atan2(-m.vx, -m.vz);
    }
    if (m.kind === "fuse" && m.fuseT >= FUSE_TIME && m.alive) {
      killMob(field, m, events);
      events.explosions.push({ x: m.x, z: m.z });
    }
  }

  const orbitSpeed = 2.35 + player.atkLv * 0.22;
  const scytheSt = scytheStats(player.scytheLv);
  for (const rock of field.rocks) {
    if (!rock.alive) continue;
    rock.age += dt;
    if (rock.kind === "orbit" || rock.kind === "scythe") {
      const spin = rock.kind === "scythe" ? scytheSt.spin : orbitSpeed;
      rock.orbitA += dt * spin;
      rock.x = player.x + Math.cos(rock.orbitA) * rock.orbitR;
      rock.z = player.z + Math.sin(rock.orbitA) * rock.orbitR;
      rock.y = player.y + (rock.kind === "scythe" ? 0.66 : 0.58) + Math.sin(rock.orbitA * 2) * 0.08;
      if (player.hp <= 0) rock.alive = false;
    } else {
      if (rock.homing) {
        const t = nearestHostile(field, player, 14);
        if (t) {
          const dx = t.x - rock.x;
          const dz = t.z - rock.z;
          const d = Math.hypot(dx, dz);
          const spd = Math.hypot(rock.vx, rock.vz) || st.speed;
          if (d > 0.04) {
            const k = 1 - Math.exp(-dt * 6.4);
            const nx = dx / d;
            const nz = dz / d;
            const vx = rock.vx * (1 - k) + nx * spd * k;
            const vz = rock.vz * (1 - k) + nz * spd * k;
            const mag = Math.hypot(vx, vz) || 1;
            rock.vx = (vx / mag) * spd;
            rock.vz = (vz / mag) * spd;
          }
        }
      }
      rock.vy -= GRAVITY * 0.82 * dt;
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.z += rock.vz * dt;
      const floor = tileTop(sampleTop(world, rock.x, rock.z));
      if (rock.y <= floor + 0.06 || rock.age > 1.55) {
        rock.alive = false;
        continue;
      }
    }
    for (const m of field.mobs) {
      if (!m.alive) continue;
      if (rock.hits.includes(m.id)) continue;
      if (rock.kind === "orbit" && m.hurtT > 0.05) continue;
      if (rock.kind === "scythe" && m.hurtT > 0.12) continue;
      const dx = rock.x - m.x;
      const dz = rock.z - m.z;
      const reach = m.radius + (rock.kind === "scythe" ? 0.95 : 0.62) * rock.scale;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (rock.y < m.y - 0.25 || rock.y > m.y + 1.85) continue;
      hitMob(field, m, rock.dmg, events);
      rock.hits.push(m.id);
      if (rock.kind === "shot" && rock.hits.length > rock.pierce) {
        rock.alive = false;
        break;
      }
    }
  }
  field.rocks = field.rocks.filter((r) => r.alive);

  for (const boom of events.explosions) {
    deformCrater(world, boom.x, boom.z, 2.35);
    const pd = Math.hypot(player.x - boom.x, player.z - boom.z);
    if (pd < BLAST_RADIUS && player.hp > 0) {
      player.hp = Math.max(0, player.hp - BLAST_DAMAGE);
      player.iFrame = PLAYER_IFRAME;
      player.hurtT = 0.55;
      player.squash = 0.66;
      player.vy = 5.15;
      player.grounded = false;
      events.playerDamage += BLAST_DAMAGE;
    }
    for (const o of field.mobs) {
      if (!o.alive) continue;
      if (Math.hypot(o.x - boom.x, o.z - boom.z) < 3.3) {
        o.fleeT = 2.2;
        o.hurtT = 0.18;
      }
    }
  }

  stepCoins(world, field, player, dt, events);

  if (player.hp <= 0) {
    field.mobs = field.mobs.filter((m) => m.alive || m.hurtT > 0);
    return events;
  }

  for (const m of field.mobs) {
    if (!m.alive || !m.aggressive || m.fleeT > 0) continue;
    const dmg = MOB_DAMAGE[m.kind];
    if (dmg <= 0) continue;
    if (player.iFrame > 0) continue;
    if (!player.grounded) continue;
    const dx = player.x - m.x;
    const dz = player.z - m.z;
    const reach = (player.radius ?? PLAYER_RADIUS) + m.radius;
    if (dx * dx + dz * dz > reach * reach * 1.18) continue;
    player.hp = Math.max(0, player.hp - dmg);
    player.iFrame = PLAYER_IFRAME;
    player.hurtT = 0.38;
    player.squash = 0.78;
    events.playerDamage += dmg;
  }

  field.mobs = field.mobs.filter((m) => m.alive || m.hurtT > 0);
  return events;
}
