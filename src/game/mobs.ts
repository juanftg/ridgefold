import {
  CHUNK_SIZE,
  GRAVITY,
  HARE_FLEE_R,
  HARE_ROCK_FLEE_T,
  HEIGHT_UNIT,
  PLAYER_IFRAME,
  PLAYER_RADIUS,
  ROCK_COOLDOWN,
  ROCK_SPEED,
  WALK_STEP,
  WOLF_AGGRO_R,
  WOLF_FLEE_T,
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
  fleeT: number;
  alive: boolean;
  aggressive: boolean;
  thinkT: number;
  wishX: number;
  wishZ: number;
  cx: number;
  cz: number;
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
};

export type MobField = {
  mobs: Mob[];
  rocks: Rock[];
  nextId: number;
  spawned: Set<string>;
};

export type MobEvents = {
  playerDamage: number;
  scares: number;
};

export function createMobField(): MobField {
  return { mobs: [], rocks: [], nextId: 1, spawned: new Set() };
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
    fleeT: 0,
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

function scareMob(m: Mob, player: Player) {
  m.fleeT = m.kind === "wolf" ? WOLF_FLEE_T : HARE_ROCK_FLEE_T;
  m.hurtT = 0.22;
  m.thinkT = 0;
  const dx = m.x - player.x;
  const dz = m.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.001) {
    m.wishX = dx / dist;
    m.wishZ = dz / dist;
  } else {
    m.wishX = -Math.sin(player.yaw);
    m.wishZ = -Math.cos(player.yaw);
  }
}

export function throwRock(world: World, field: MobField, player: Player): boolean {
  if (player.throwCd > 0 || player.hp <= 0) return false;
  if (field.rocks.filter((r) => r.alive).length >= 3) return false;
  player.throwCd = ROCK_COOLDOWN;
  player.squash = 1.12;
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
  let aimD = 7;
  let aimed = false;
  for (const m of field.mobs) {
    if (!m.alive || !m.aggressive) continue;
    const dx = m.x - player.x;
    const dz = m.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.45 || d > 12) continue;
    const nx = dx / d;
    const nz = dz / d;
    if (nx * fx + nz * fz < 0.18) continue;
    if (!aimed || d < aimD) {
      aimed = true;
      aimD = d;
      aimX = nx;
      aimZ = nz;
    }
  }
  const range = aimed ? aimD : 7;
  const lift = 2.45 + Math.min(3.6, range * 0.2);
  field.rocks.push({
    x: player.x + aimX * 0.38,
    y: player.y + 0.58,
    z: player.z + aimZ * 0.38,
    vx: aimX * ROCK_SPEED,
    vy: lift,
    vz: aimZ * ROCK_SPEED,
    alive: true,
    age: 0,
  });
  return true;
}

export function stepMobs(world: World, field: MobField, player: Player, dt: number): MobEvents {
  const events: MobEvents = { playerDamage: 0, scares: 0 };
  for (const m of field.mobs) {
    if (!m.alive) continue;
    m.hurtT = Math.max(0, m.hurtT - dt);
    m.fleeT = Math.max(0, m.fleeT - dt);
    m.thinkT -= dt;
    const dx = player.x - m.x;
    const dz = player.z - m.z;
    const dist = Math.hypot(dx, dz);
    const scared = m.fleeT > 0;
    if (m.thinkT <= 0) {
      m.thinkT = 0.35 + (m.id % 7) * 0.08;
      if (scared) {
        const inv = dist > 0.001 ? 1 / dist : 0;
        m.wishX = -dx * inv;
        m.wishZ = -dz * inv;
      } else if (m.aggressive) {
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
    const chasing = m.aggressive && !scared && dist < WOLF_AGGRO_R;
    const fleeing = scared || (!m.aggressive && dist < HARE_FLEE_R);
    let speed = m.kind === "wolf" ? (scared ? 5.35 : chasing ? 3.85 : 2.05) : fleeing ? 4.55 : 2.35;
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

  for (const rock of field.rocks) {
    if (!rock.alive) continue;
    rock.age += dt;
    rock.vy -= GRAVITY * 0.82 * dt;
    rock.x += rock.vx * dt;
    rock.y += rock.vy * dt;
    rock.z += rock.vz * dt;
    const floor = tileTop(sampleTop(world, rock.x, rock.z));
    if (rock.y <= floor + 0.06 || rock.age > 1.55) {
      rock.alive = false;
      continue;
    }
    for (const m of field.mobs) {
      if (!m.alive) continue;
      const dx = rock.x - m.x;
      const dz = rock.z - m.z;
      const reach = m.radius + 0.4;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (rock.y < m.y - 0.12 || rock.y > m.y + 1.15) continue;
      scareMob(m, player);
      rock.alive = false;
      events.scares += 1;
      break;
    }
  }
  field.rocks = field.rocks.filter((r) => r.alive);

  if (player.hp <= 0) return events;

  for (const m of field.mobs) {
    if (!m.alive || !m.aggressive || m.fleeT > 0) continue;
    if (player.iFrame > 0) continue;
    const dx = player.x - m.x;
    const dz = player.z - m.z;
    const reach = (player.radius ?? PLAYER_RADIUS) + m.radius;
    if (dx * dx + dz * dz > reach * reach * 1.18) continue;
    player.hp = Math.max(0, player.hp - 1);
    player.iFrame = PLAYER_IFRAME;
    player.hurtT = 0.38;
    player.squash = 0.78;
    events.playerDamage += 1;
  }

  field.mobs = field.mobs.filter((m) => m.alive || m.hurtT > 0);
  return events;
}
