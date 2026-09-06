import {
  COYOTE_TIME,
  FIXED_DT,
  GRAVITY,
  HEIGHT_UNIT,
  JUMP_BUFFER,
  JUMP_CLIMB,
  JUMP_SPEED,
  MOVE_SPEED,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  WALK_STEP,
  WATER_SPEED,
} from "./constants";
import type { SampledInput } from "./input";
import { cellAt, tileTop, worldToGrid, type World } from "./terrain";

export type BlockReason = "none" | "ledge";
export type WandererSex = "female" | "male";

export type Player = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  coyote: number;
  jumpBuf: number;
  squash: number;
  hops: number;
  hint: BlockReason;
  hintT: number;
  landPulse: number;
  walkPhase: number;
  idlePhase: number;
  onWater: boolean;
  hp: number;
  maxHp: number;
  iFrame: number;
  hurtT: number;
  radius: number;
  throwCd: number;
  sex: WandererSex;
};

export function spawnPlayer(world: World, sex: WandererSex = "female"): Player {
  const y = world.spawnH * HEIGHT_UNIT;
  return {
    x: world.spawnX,
    y,
    z: world.spawnZ,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: Math.PI / 4,
    grounded: true,
    coyote: 0,
    jumpBuf: 0,
    squash: 1,
    hops: 0,
    hint: "none",
    hintT: 0,
    landPulse: 0,
    walkPhase: 0,
    idlePhase: 0,
    onWater: false,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    iFrame: 0,
    hurtT: 0,
    radius: PLAYER_RADIUS,
    throwCd: 0,
    sex,
  };
}

function sampleCell(world: World, x: number, z: number) {
  const [gx, gz] = worldToGrid(x, z);
  return cellAt(world, gx, gz);
}

function blockedAt(
  world: World,
  x: number,
  z: number,
  feetY: number,
  maxRise: number,
): BlockReason {
  const offsets: [number, number][] = [
    [PLAYER_RADIUS, 0],
    [-PLAYER_RADIUS, 0],
    [0, PLAYER_RADIUS],
    [0, -PLAYER_RADIUS],
    [PLAYER_RADIUS * 0.7, PLAYER_RADIUS * 0.7],
    [PLAYER_RADIUS * 0.7, -PLAYER_RADIUS * 0.7],
    [-PLAYER_RADIUS * 0.7, PLAYER_RADIUS * 0.7],
    [-PLAYER_RADIUS * 0.7, -PLAYER_RADIUS * 0.7],
  ];
  for (const [ox, oz] of offsets) {
    const cell = sampleCell(world, x + ox, z + oz);
    const rise = tileTop(cell) - feetY;
    if (rise > maxRise + 0.04) return "ledge";
  }
  return "none";
}

export function stepPlayer(world: World, p: Player, input: SampledInput, dt = FIXED_DT) {
  p.hintT = Math.max(0, p.hintT - dt);
  p.landPulse = Math.max(0, p.landPulse - dt);
  p.iFrame = Math.max(0, p.iFrame - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.throwCd = Math.max(0, p.throwCd - dt);
  p.idlePhase += dt;
  p.squash += (1 - p.squash) * (1 - Math.exp(-dt * 11));

  if (input.jumpPressed) p.jumpBuf = JUMP_BUFFER;
  else p.jumpBuf = Math.max(0, p.jumpBuf - dt);

  if (p.grounded) p.coyote = COYOTE_TIME;
  else p.coyote = Math.max(0, p.coyote - dt);

  const wishMag = Math.hypot(input.worldX, input.worldZ);
  const base = p.onWater ? WATER_SPEED : MOVE_SPEED;
  const speed = base * (p.grounded ? 1 : 0.92);
  const wishX = wishMag > 0.001 ? (input.worldX / wishMag) * speed : 0;
  const wishZ = wishMag > 0.001 ? (input.worldZ / wishMag) * speed : 0;
  p.vx = wishX;
  p.vz = wishZ;

  const canJump = p.grounded || p.coyote > 0;
  if (p.jumpBuf > 0 && canJump) {
    p.vy = JUMP_SPEED;
    p.grounded = false;
    p.coyote = 0;
    p.jumpBuf = 0;
    p.squash = 1.22;
    p.hops += 1;
  }

  if (!p.grounded) p.vy -= GRAVITY * dt;

  const maxRise = p.grounded ? WALK_STEP * HEIGHT_UNIT : JUMP_CLIMB * HEIGHT_UNIT;

  const tryAxis = (nx: number, nz: number) => {
    const reason = blockedAt(world, nx, nz, p.y, maxRise);
    if (reason === "none") {
      p.x = nx;
      p.z = nz;
      return true;
    }
    p.hint = reason;
    p.hintT = 0.9;
    return false;
  };

  const nx = p.x + p.vx * dt;
  const nz = p.z + p.vz * dt;
  const ox = p.x;
  const oz = p.z;
  if (!tryAxis(nx, nz)) {
    if (!tryAxis(nx, p.z)) tryAxis(p.x, nz);
  }

  const moved = Math.hypot(p.x - ox, p.z - oz);
  if (moved > 0.0005) {
    const targetYaw = Math.atan2(-(p.x - ox), -(p.z - oz));
    let dyaw = targetYaw - p.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    p.yaw += dyaw * (1 - Math.exp(-dt * 14));
  } else if (wishMag > 0.001) {
    const targetYaw = Math.atan2(-wishX, -wishZ);
    let dyaw = targetYaw - p.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    p.yaw += dyaw * (1 - Math.exp(-dt * 12));
  }
  if (p.grounded && wishMag > 0.001) {
    p.walkPhase += dt * Math.PI * 2 * (p.onWater ? 0.88 : 1.18) * Math.min(1, wishMag);
  } else if (p.grounded) {
    const rest = Math.round(p.walkPhase / Math.PI) * Math.PI;
    p.walkPhase += (rest - p.walkPhase) * (1 - Math.exp(-dt * 4.2));
  } else {
    p.walkPhase += dt * 2.4;
  }

  p.y += p.vy * dt;

  const support = sampleCell(world, p.x, p.z);
  const top = tileTop(support);

  if (p.grounded) {
    p.y = top;
    p.vy = 0;
    p.onWater = support.water;
    return;
  }

  if (p.vy <= 0 && p.y <= top + 0.16) {
    if (p.vy < -2.5) {
      p.squash = 0.72;
      p.landPulse = 0.18;
    } else {
      p.squash = 0.88;
    }
    p.y = top;
    p.vy = 0;
    p.grounded = true;
    p.onWater = support.water;
  } else {
    p.onWater = false;
    if (p.y < top - 0.02 && p.vy <= 0) {
      p.y = top;
      p.vy = 0;
      p.grounded = true;
      p.onWater = support.water;
    }
  }
}

export function playerSpeed(p: Player): number {
  return Math.hypot(p.vx, p.vz);
}
