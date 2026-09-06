import {
  CHUNK_SIZE,
  HARE_FLEE_R,
  HEIGHT_UNIT,
  PLAYER_IFRAME,
  PLAYER_RADIUS,
  STOMP_BOUNCE,
  WALK_STEP,
  WOLF_AGGRO_R,
} from "./constants";
import { mulberry32 } from "./rng";
import type { Player } from "./sim";
import { cellAt, chunkKey, tileTop, worldToGrid, type World } from "./terrain";

export type MobKind = "hare" | "wolf";

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
  alive: boolean;
  aggressive: boolean;
  thinkT: number;
  wishX: number;
  wishZ: number;
  cx: number;
  cz: number;
};

export type MobField = {
  mobs: Mob[];
  nextId: number;
  spawned: Set<string>;
};

export type MobEvents = {
  playerDamage: number;
  stomps: number;
};

export function createMobField(): MobField {
  return { mobs: [], nextId: 1, spawned: new Set() };
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
): Mob {
  const cell = sampleTop(world, x, z);
  const aggressive = kind === "wolf";
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
    hp: aggressive ? 3 : 2,
    maxHp: aggressive ? 3 : 2,
    radius: aggressive ? 0.34 : 0.22,
    walkPhase: 0,
    facing: 0,
    hurtT: 0,
    alive: true,
    aggressive,
    thinkT: 0.2,
    wishX: 0,
    wishZ: 0,
    cx: Math.floor(gx / CHUNK_SIZE),
    cz: Math.floor(gz / CHUNK_SIZE),
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
      if (Math.hypot(wx - world.spawnX, wz - world.spawnZ) < 18) continue;
      const rng = mulberry32(world.seedNum ^ 0xa5f11e ^ ((cx * 374761393) ^ (cz * 668265263)));
      const roll = rng();
      const count = roll < 0.22 ? 0 : roll < 0.72 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const pos = pickLandInChunk(world, cx, cz, rng);
        if (!pos) continue;
        const kind: MobKind = rng() < 0.58 ? "hare" : "wolf";
        spawnMobAt(field, world, kind, pos[0], pos[1]);
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
  for (const key of [...field.spawned]) {
    const [sx, sz] = key.split(":").map(Number);
    if (Math.abs((sx ?? 0) - pcx) > keepChunks || Math.abs((sz ?? 0) - pcz) > keepChunks) {
      field.spawned.delete(key);
    }
  }
}

export function stepMobs(world: World, field: MobField, player: Player, dt: number): MobEvents {
  const events: MobEvents = { playerDamage: 0, stomps: 0 };
  for (const m of field.mobs) {
    if (!m.alive) continue;
    m.hurtT = Math.max(0, m.hurtT - dt);
    m.thinkT -= dt;
    const dx = player.x - m.x;
    const dz = player.z - m.z;
    const dist = Math.hypot(dx, dz);
    if (m.thinkT <= 0) {
      m.thinkT = 0.35 + (m.id % 7) * 0.08;
      if (m.aggressive) {
        if (dist < WOLF_AGGRO_R && player.hp > 0) {
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
    const chasing = m.aggressive && dist < WOLF_AGGRO_R;
    const fleeing = !m.aggressive && dist < HARE_FLEE_R;
    let speed = m.kind === "wolf" ? (chasing ? 3.85 : 2.05) : fleeing ? 4.55 : 2.35;
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
      m.walkPhase += dt * Math.PI * 2 * (m.kind === "hare" ? 1.55 : 1.15);
      m.yaw = Math.atan2(-m.vx, -m.vz);
    }
  }

  if (player.hp <= 0) return events;

  for (const m of field.mobs) {
    if (!m.alive) continue;
    const dx = player.x - m.x;
    const dz = player.z - m.z;
    const reach = player.radius ?? PLAYER_RADIUS;
    const sep = m.radius + reach;
    if (dx * dx + dz * dz > sep * sep * 1.18) continue;
    const above = player.y > m.y + 0.14;
    const stomping = !player.grounded && player.vy < -0.35 && above;
    if (stomping) {
      m.hp -= 1;
      m.hurtT = 0.28;
      player.vy = STOMP_BOUNCE;
      player.grounded = false;
      player.squash = 1.2;
      events.stomps += 1;
      if (m.hp <= 0) m.alive = false;
      continue;
    }
    if (!m.aggressive) continue;
    if (player.iFrame > 0) continue;
    player.hp = Math.max(0, player.hp - 1);
    player.iFrame = PLAYER_IFRAME;
    player.hurtT = 0.38;
    player.squash = 0.78;
    events.playerDamage += 1;
  }

  field.mobs = field.mobs.filter((m) => m.alive || m.hurtT > 0);
  return events;
}
