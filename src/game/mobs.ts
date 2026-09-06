import {
  BLAST_DAMAGE,
  BLAST_RADIUS,
  CHUNK_SIZE,
  FUSE_RANGE,
  FUSE_TIME,
  GRAVITY,
  HARE_FLEE_R,
  HARE_ROCK_FLEE_T,
  HEIGHT_UNIT,
  IDLE_FIRST,
  IDLE_GAP,
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
import { cellAt, chunkKey, deformCrater, tileTop, worldToGrid, type World } from "./terrain";

export type MobKind = "hare" | "wolf" | "boar" | "bear" | "moose" | "fuse" | "cthulhu";

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
  idleT: number;
  idleWave: number;
};

export type MobEvents = {
  playerDamage: number;
  scares: number;
  explosions: { x: number; z: number }[];
};

export function createMobField(): MobField {
  return { mobs: [], rocks: [], nextId: 1, spawned: new Set(), idleT: 0, idleWave: 0 };
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
      const count = roll < 0.12 ? 0 : roll < 0.58 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const pos = pickLandInChunk(world, cx, cz, rng);
        if (!pos) continue;
        const k = rng();
        const kind: MobKind =
          k < 0.28 ? "hare" : k < 0.48 ? "wolf" : k < 0.66 ? "boar" : k < 0.82 ? "bear" : k < 0.94 ? "moose" : "fuse";
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

function fleeTime(kind: MobKind): number {
  if (kind === "hare") return HARE_ROCK_FLEE_T;
  if (kind === "cthulhu") return 1.7;
  if (kind === "fuse") return 4.2;
  if (kind === "moose" || kind === "bear") return 3.4;
  return WOLF_FLEE_T;
}

function scareMob(m: Mob, player: Player) {
  m.fleeT = fleeTime(m.kind);
  m.hurtT = 0.22;
  m.thinkT = 0;
  m.fuseT = 0;
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

export function throwRock(_world: World, field: MobField, player: Player): boolean {
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
    if (d < 0.15 || d > 12) continue;
    const nx = dx / d;
    const nz = dz / d;
    if (nx * fx + nz * fz < -0.15) continue;
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
  spawnMobAt(field, world, kind, sx, sz);
  field.idleWave += 1;
}

export function stepMobs(world: World, field: MobField, player: Player, dt: number): MobEvents {
  const events: MobEvents = { playerDamage: 0, scares: 0, explosions: [] };
  stepIdleHunt(world, field, player, dt);

  for (const m of field.mobs) {
    if (!m.alive) continue;
    m.hurtT = Math.max(0, m.hurtT - dt);
    m.fleeT = Math.max(0, m.fleeT - dt);
    m.thinkT -= dt;
    const st = STATS[m.kind];
    const dx = player.x - m.x;
    const dz = player.z - m.z;
    const dist = Math.hypot(dx, dz);
    const scared = m.fleeT > 0;
    if (m.thinkT <= 0) {
      m.thinkT = 0.32 + (m.id % 7) * 0.07;
      if (scared) {
        const inv = dist > 0.001 ? 1 / dist : 0;
        m.wishX = -dx * inv;
        m.wishZ = -dz * inv;
      } else if (m.aggressive) {
        if (dist < st.aggro && player.hp > 0) {
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
    const chasing = m.aggressive && !scared && dist < st.aggro;
    const fleeing = scared || (!m.aggressive && dist < HARE_FLEE_R);
    let speed = chasing ? st.chase : fleeing ? st.flee : st.walk;
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
      m.alive = false;
      m.hurtT = 0.2;
      events.explosions.push({ x: m.x, z: m.z });
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
      const reach = m.radius + 0.55;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (rock.y < m.y - 0.12 || rock.y > m.y + 1.15) continue;
      scareMob(m, player);
      rock.alive = false;
      events.scares += 1;
      break;
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
      if (Math.hypot(o.x - boom.x, o.z - boom.z) < 3.3) scareMob(o, player);
    }
  }

  if (player.hp <= 0) {
    field.mobs = field.mobs.filter((m) => m.alive || m.hurtT > 0);
    return events;
  }

  for (const m of field.mobs) {
    if (!m.alive || !m.aggressive || m.fleeT > 0) continue;
    const dmg = MOB_DAMAGE[m.kind];
    if (dmg <= 0) continue;
    if (player.iFrame > 0) continue;
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
