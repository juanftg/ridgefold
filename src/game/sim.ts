import {
  COYOTE_TIME,
  FALL_KILL_Y,
  FIXED_DT,
  GRAVITY,
  HEIGHT_UNIT,
  JUMP_BUFFER,
  JUMP_CLIMB,
  JUMP_SPEED,
  MOVE_SPEED,
  PLAYER_RADIUS,
  WALK_DOWN,
  WALK_STEP,
} from "./constants";
import type { SampledInput } from "./input";
import { cellAt, tileTop, worldToGrid, type World } from "./terrain";

export type BlockReason = "none" | "gap" | "ledge";

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
  lastSafeX: number;
  lastSafeY: number;
  lastSafeZ: number;
  lastSafeYaw: number;
  hops: number;
  fallen: number;
  hint: BlockReason;
  hintT: number;
  landPulse: number;
  walkPhase: number;
};

export function spawnPlayer(world: World): Player {
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
    lastSafeX: world.spawnX,
    lastSafeY: y,
    lastSafeZ: world.spawnZ,
    lastSafeYaw: Math.PI / 4,
    hops: 0,
    fallen: 0,
    hint: "none",
    hintT: 0,
    landPulse: 0,
    walkPhase: 0,
  };
}

function sampleCell(world: World, x: number, z: number) {
  const [gx, gz] = worldToGrid(x, z, world.size);
  return cellAt(world, gx, gz);
}

function blockedAt(
  world: World,
  x: number,
  z: number,
  feetY: number,
  maxRise: number,
  airborne: boolean,
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
    if (!cell || !cell.solid) {
      if (airborne) continue;
      return "gap";
    }
    const rise = tileTop(cell) - feetY;
    if (rise > maxRise + 0.04) {
      return "ledge";
    }
  }
  return "none";
}

function supportUnder(world: World, x: number, z: number) {
  const cell = sampleCell(world, x, z);
  if (!cell?.solid) return null;
  return cell;
}

export function stepPlayer(world: World, p: Player, input: SampledInput, dt = FIXED_DT) {
  p.hintT = Math.max(0, p.hintT - dt);
  p.landPulse = Math.max(0, p.landPulse - dt);
  p.squash += (1 - p.squash) * Math.min(1, dt * 10);

  if (input.jumpPressed) p.jumpBuf = JUMP_BUFFER;
  else p.jumpBuf = Math.max(0, p.jumpBuf - dt);

  if (p.grounded) p.coyote = COYOTE_TIME;
  else p.coyote = Math.max(0, p.coyote - dt);

  const wishMag = Math.hypot(input.worldX, input.worldZ);
  const speed = MOVE_SPEED * (p.grounded ? 1 : 0.92);
  const wishX = wishMag > 0.001 ? (input.worldX / wishMag) * speed : 0;
  const wishZ = wishMag > 0.001 ? (input.worldZ / wishMag) * speed : 0;
  p.vx = wishX;
  p.vz = wishZ;

  if (wishMag > 0.08) {
    const targetYaw = Math.atan2(-p.vx, -p.vz);
    let dyaw = targetYaw - p.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    p.yaw += dyaw * Math.min(1, dt * 10);
    p.walkPhase += dt * 9.5 * wishMag;
  }

  const canJump = p.grounded || p.coyote > 0;
  if (p.jumpBuf > 0 && canJump) {
    p.vy = JUMP_SPEED;
    p.grounded = false;
    p.coyote = 0;
    p.jumpBuf = 0;
    p.squash = 1.22;
    p.hops += 1;
  }

  if (!p.grounded) {
    p.vy -= GRAVITY * dt;
  }

  const maxRise = p.grounded
    ? WALK_STEP * HEIGHT_UNIT
    : JUMP_CLIMB * HEIGHT_UNIT;

  const tryAxis = (nx: number, nz: number) => {
    const reason = blockedAt(world, nx, nz, p.y, maxRise, !p.grounded);
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
  if (!tryAxis(nx, nz)) {
    if (!tryAxis(nx, p.z)) {
      tryAxis(p.x, nz);
    }
  }

  p.y += p.vy * dt;

  const support = supportUnder(world, p.x, p.z);
  if (support) {
    const top = tileTop(support);
    const drop = p.y - top;
    if (p.vy <= 0.2 && drop <= 0.16 && drop >= -WALK_DOWN * HEIGHT_UNIT - 0.05) {
      const wasAir = !p.grounded;
      if (wasAir && p.vy < -2.5) {
        p.squash = 0.72;
        p.landPulse = 0.18;
      }
      p.y = top;
      p.vy = 0;
      p.grounded = true;
      p.lastSafeX = p.x;
      p.lastSafeY = p.y;
      p.lastSafeZ = p.z;
      p.lastSafeYaw = p.yaw;
    } else if (drop < -0.2) {
      p.grounded = false;
    }
  } else {
    p.grounded = false;
  }

  if (p.y < FALL_KILL_Y) {
    p.x = p.lastSafeX;
    p.y = p.lastSafeY + 0.02;
    p.z = p.lastSafeZ;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.yaw = p.lastSafeYaw;
    p.grounded = true;
    p.fallen += 1;
    p.squash = 0.8;
    p.hint = "gap";
    p.hintT = 1.1;
  }
}

export function playerSpeed(p: Player): number {
  return Math.hypot(p.vx, p.vz);
}
