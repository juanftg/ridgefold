import { BIOME_SIDE, BIOME_TOP, HEIGHT_UNIT } from "./constants";
import type { Coin, Mob, Rock } from "./mobs";
import type { Player } from "./sim";
import { cellAt, type Prop, type World } from "./terrain";

export const BASE_TW = 28;
export const BASE_TH = 14;
export const BASE_EH = 17;

export function rotateXZ(x: number, z: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function quad(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, stroke?: string, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tileTint(gx: number, gz: number, biome: number): number {
  const px = gx >> 2;
  const pz = gz >> 2;
  let h = Math.imul(px + 19, 374761393) ^ Math.imul(pz + 7, 668265263) ^ Math.imul(biome + 1, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  const patch = (((h >>> 0) / 4294967296) - 0.5) * 28;
  let g = Math.imul(gx + 3, 1597334677) ^ Math.imul(gz + 11, 3812015801);
  g = Math.imul(g ^ (g >>> 16), 2246822507);
  const grain = (((g >>> 0) / 4294967296) - 0.5) * 14;
  return Math.round(patch + grain);
}

export type ProjectFn = (x: number, z: number, elev: number) => [number, number];
export type DepthFn = (x: number, z: number) => number;

export function createPaint(args: {
  ctx: CanvasRenderingContext2D;
  world: World;
  project: ProjectFn;
  depth: DepthFn;
  getZoom: () => number;
}) {
  const { ctx, world, project, depth, getZoom } = args;
  let lastFacing = 0;

  const facingFromVel = (
    x: number,
    z: number,
    vx: number,
    vz: number,
    elev: number,
    prev: number,
  ) => {
    const [sx, sy] = project(x, z, elev);
    const [ax, ay] = project(x + vx * 0.14, z + vz * 0.14, elev);
    const sdx = ax - sx;
    const sdy = ay - sy;
    if (sdx * sdx + sdy * sdy < 0.18) return prev;
    return Math.abs(sdx) >= Math.abs(sdy) ? (sdx >= 0 ? 1 : 3) : sdy >= 0 ? 0 : 2;
  };

  const drawBlock = (x: number, z: number, h: number, biome: number, water: boolean, t: number) => {
    const zoom = getZoom();
    const elev = water
      ? 0.34 + Math.sin(t * 1.6 + x * 1.7 + z * 1.15) * 0.05
      : Math.max(0.55, h);
    const gx = Math.floor(x);
    const gz = Math.floor(z);
    const neighborElev = (nx: number, nz: number) => {
      const c = cellAt(world, nx, nz);
      return c.water ? 0.28 : Math.max(0.55, c.h);
    };
    const half = 0.5;
    const x0 = x - half;
    const x1 = x + half;
    const z0 = z - half;
    const z1 = z + half;
    const t00 = project(x0, z0, elev);
    const t10 = project(x1, z0, elev);
    const t11 = project(x1, z1, elev);
    const t01 = project(x0, z1, elev);
    const tint = tileTint(gx, gz, biome);
    const side = shade(BIOME_SIDE[biome] ?? "#5a4a38", Math.round(tint * 0.35));
    const topBase = BIOME_TOP[biome] ?? "#6e8f5c";
    const top = water
      ? shade(topBase, Math.round(Math.sin(t * 2 + x + z) * 18 + tint * 0.4))
      : shade(topBase, tint);
    const face = (
      ax: number,
      az: number,
      bx: number,
      bz: number,
      bot: number,
      color: string,
    ) => {
      if (bot >= elev - 0.02) return;
      const p0 = project(ax, az, elev);
      const p1 = project(bx, bz, elev);
      const p2 = project(bx, bz, bot);
      const p3 = project(ax, az, bot);
      quad(ctx, [p0, p1, p2, p3], color);
    };
    const visPosX = depth(1, 0) > depth(0, 0);
    const visPosZ = depth(0, 1) > depth(0, 0);
    if (visPosX) face(x1, z0, x1, z1, neighborElev(gx + 1, gz), shade(side, water ? -8 : -18));
    else face(x0, z0, x0, z1, neighborElev(gx - 1, gz), shade(side, water ? -4 : -8));
    if (visPosZ) face(x0, z1, x1, z1, neighborElev(gx, gz + 1), shade(side, water ? 16 : 10));
    else face(x0, z0, x1, z0, neighborElev(gx, gz - 1), shade(side, water ? 8 : 4));
    const seam = shade(topBase, tint - (water ? 18 : 38));
    quad(ctx, [t00, t10, t11, t01], top, seam, Math.max(0.85, zoom * 0.58));
  };

  const drawProp = (p: Prop) => {
    const zoom = getZoom();
    const [sx, sy] = project(p.x, p.z, p.y / HEIGHT_UNIT);
    const k = zoom;
    if (p.kind === "pine") {
      ctx.fillStyle = "#2f4a38";
      ctx.beginPath();
      ctx.moveTo(sx, sy - 28 * p.scale * k);
      ctx.lineTo(sx + 9 * p.scale * k, sy - 4 * k);
      ctx.lineTo(sx - 9 * p.scale * k, sy - 4 * k);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#3d5c45";
      ctx.beginPath();
      ctx.moveTo(sx, sy - 20 * p.scale * k);
      ctx.lineTo(sx + 11 * p.scale * k, sy);
      ctx.lineTo(sx - 11 * p.scale * k, sy);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#7a746c";
      ctx.beginPath();
      ctx.ellipse(sx, sy - 4 * k, 7 * p.scale * 4 * k, 5 * p.scale * 4 * k, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawExplorer = (p: Player, t = 0) => {
    const zoom = getZoom();
    const elev = p.y / HEIGHT_UNIT;
    const [sx, sy] = project(p.x, p.z, elev);
    const k = zoom * 0.9;
    const speed = Math.hypot(p.vx, p.vz);
    const walking = p.grounded && speed > 0.28;
    const ph = p.walkPhase;
    const idle = p.idlePhase;
    const swing = walking ? Math.sin(ph) : Math.sin(idle * 1.35) * 0.08;
    const swingE = walking ? Math.sin(ph - 0.18) : swing * 0.6;
    const bob = walking
      ? Math.abs(Math.sin(ph)) * 2.15 + Math.sin(ph * 2) * 0.35
      : p.grounded
        ? Math.sin(idle * 2.15) * 0.55
        : 2.4;
    lastFacing = facingFromVel(p.x, p.z, p.vx, p.vz, elev, lastFacing);
    const facing = lastFacing;
    const flip = facing === 3 ? -1 : 1;
    const sideOn = facing === 1 || facing === 3;
    const rear = facing === 2;
    const s = p.squash;
    const fem = p.sex === "female";
    const flicker = p.iFrame > 0 && Math.floor(p.iFrame * 18) % 2 === 0;
    if (flicker) return;

    ctx.fillStyle = p.onWater ? "rgba(36, 88, 108, 0.4)" : "rgba(16, 20, 18, 0.34)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2.2 * k, (6.6 + (walking ? 1.8 : 0.4)) * k, 3.15 * k, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(sx, sy - bob * k);
    ctx.rotate(walking ? swing * 0.03 : Math.sin(idle * 1.1 + t) * 0.018);
    ctx.scale((flip * k) / Math.sqrt(s), k * s);

    const aL = walking ? -swingE * (sideOn ? 0.78 : 0.46) : 0.06 + Math.sin(idle * 1.6) * 0.05;
    const aR = walking ? swingE * (sideOn ? 0.78 : 0.46) : 0.06 - Math.sin(idle * 1.6) * 0.05;
    const lL = walking ? -swing * (sideOn ? 0.66 : 0.4) : 0.04;
    const lR = walking ? swing * (sideOn ? 0.66 : 0.4) : 0.04;
    const skin = p.hurtT > 0 ? "#d4a090" : fem ? "#e6cbb0" : "#e2c8a8";
    const jacket = fem ? "#4a5852" : "#3c4944";
    const jacketDark = fem ? "#38443f" : "#2c3531";
    const pants = fem ? "#2a322e" : "#232826";
    const pantsLight = fem ? "#343e39" : "#2c332f";
    const hair = fem ? "#3c2a22" : "#1c1814";
    const hairHi = fem ? "#5a4034" : "#2a2420";

    const arm = (shX: number, shY: number, a: number, color: string) => {
      ctx.save();
      ctx.translate(shX, shY);
      ctx.rotate(a);
      ctx.fillStyle = color;
      roundRect(ctx, -1.35, -0.6, 2.7, 8.4, 1.3);
      ctx.fill();
      ctx.fillStyle = jacketDark;
      roundRect(ctx, -1.45, -0.5, 2.9, 2.2, 1.1);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(0.15, 8.5, 1.3, 1.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const leg = (hipX: number, hipY: number, a: number, color: string, lead: boolean) => {
      const thigh = fem ? 5.45 : 5.7;
      const shin = fem ? 5.05 : 5.25;
      const knee = walking ? 0.2 + Math.max(0, -Math.sin(ph + (lead ? 0 : Math.PI))) * 0.52 : 0.07;
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      ctx.fillStyle = color;
      roundRect(ctx, -1.7, -0.6, 3.4, thigh, 1.5);
      ctx.fill();
      ctx.translate(0, thigh - 0.4);
      ctx.rotate(knee);
      roundRect(ctx, -1.5, -0.4, 3, shin, 1.3);
      ctx.fill();
      ctx.fillStyle = "#1a1612";
      ctx.beginPath();
      ctx.ellipse(1.15, shin + 0.2, 2.45, 1.2, 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2c2620";
      ctx.fillRect(0.2, shin - 1.3, 2.2, 0.45);
      ctx.restore();
    };

    const pack = () => {
      ctx.save();
      ctx.translate(0, Math.sin(idle * 2.35) * 0.32);
      ctx.fillStyle = "#4a3c30";
      roundRect(ctx, sideOn ? -3.2 : -3.6, -16.2, sideOn ? 3.4 : 7.2, 6.4, 1.4);
      ctx.fill();
      ctx.fillStyle = "#3a2e24";
      roundRect(ctx, sideOn ? -3.2 : -3.6, -16.2, sideOn ? 3.4 : 7.2, 1.5, 0.8);
      ctx.fill();
      ctx.strokeStyle = "#c6b89a";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(sideOn ? -1.4 : -2.4, -16);
      ctx.lineTo(sideOn ? 1.6 : -1.2, -9.4);
      ctx.stroke();
      ctx.restore();
    };

    const torso = () => {
      if (rear) pack();
      const tw = fem ? (sideOn ? 8.4 : 9.8) : sideOn ? 9.4 : 11.1;
      const tx = fem ? (sideOn ? -3.8 : -4.9) : sideOn ? -4.3 : -5.5;
      ctx.fillStyle = jacket;
      roundRect(ctx, tx, -16.8, tw, fem ? 10.6 : 11.3, 2.6);
      ctx.fill();
      if (fem) {
        ctx.fillStyle = pants;
        roundRect(ctx, tx + 0.3, -7.4, tw - 0.6, 2.6, 1.4);
        ctx.fill();
      }
      ctx.fillStyle = "#c6b89a";
      if (!rear) {
        ctx.beginPath();
        ctx.moveTo(sideOn ? 0.6 : 0, -16.6);
        ctx.lineTo(sideOn ? 2.3 : 2.1, -11.4);
        ctx.lineTo(sideOn ? -1.0 : -2.1, -11.4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = jacketDark;
      roundRect(ctx, tx, -16.8, tw, 2.3, 1.4);
      ctx.fill();
      ctx.fillStyle = "#4a3a2c";
      ctx.fillRect(tx + 0.25, -6.8, tw - 0.5, 1.15);
      ctx.fillStyle = "#cbb892";
      ctx.beginPath();
      ctx.arc(sideOn ? 0.2 : 0, -6.2, 0.55, 0, Math.PI * 2);
      ctx.fill();
      if (!rear) pack();
    };

    const hairBack = (hx: number) => {
      ctx.fillStyle = hair;
      if (fem) {
        ctx.beginPath();
        ctx.ellipse(hx - (sideOn ? 1.4 : 0), -19.6, 3.9, 4.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(hx - (sideOn ? 2.6 : 0.2), -16.2);
        ctx.rotate(-0.18 + swing * 0.12);
        ctx.beginPath();
        ctx.ellipse(0, 3.8, 1.35, 4.6, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hairHi;
        ctx.beginPath();
        ctx.ellipse(0.35, 2.2, 0.45, 3.2, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.ellipse(hx, -21.8, 3.75, 2.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const head = () => {
      const hx = sideOn ? 1.05 : 0.2;
      hairBack(hx);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(hx, fem ? -20.55 : -20.35, fem ? 3.4 : 3.6, fem ? 4.05 : 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.ellipse(hx, -22.55, fem ? 3.65 : 3.75, fem ? 2.85 : 2.65, sideOn ? 0.16 : 0.05, Math.PI, Math.PI * 2.05);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx - (sideOn ? 0.15 : 0), -21.7, fem ? 3.5 : 3.55, 2.15, 0, 0, Math.PI * 2);
      ctx.fill();
      if (fem && sideOn) {
        ctx.beginPath();
        ctx.ellipse(hx - 0.4, -22.9, 1.1, 0.7, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!rear) {
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.ellipse(hx + (sideOn ? 3.25 : 0), -19.55, 0.72, 0.9, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a1e1c";
        ctx.beginPath();
        ctx.ellipse(hx + (sideOn ? 1.55 : 1.32), -20.2, fem ? 0.62 : 0.72, fem ? 0.78 : 0.88, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!sideOn) {
          ctx.beginPath();
          ctx.ellipse(hx - 1.32, -20.2, fem ? 0.62 : 0.72, fem ? 0.78 : 0.88, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.beginPath();
        ctx.arc(hx + (sideOn ? 1.78 : 1.52), -20.48, 0.28, 0, Math.PI * 2);
        ctx.fill();
        if (fem) {
          ctx.strokeStyle = "#1a1612";
          ctx.lineWidth = 0.55;
          ctx.beginPath();
          ctx.moveTo(hx + (sideOn ? 1.15 : 0.7), -21.05);
          ctx.quadraticCurveTo(hx + (sideOn ? 1.7 : 1.3), -21.45, hx + (sideOn ? 2.15 : 1.85), -21.05);
          ctx.stroke();
        }
        ctx.fillStyle = "#c4a090";
        ctx.beginPath();
        ctx.ellipse(hx + (sideOn ? 2.35 : 0.15), -19.35, 0.55, 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!fem) {
          ctx.fillStyle = "rgba(40, 32, 28, 0.28)";
          ctx.beginPath();
          ctx.ellipse(hx + (sideOn ? 1.4 : 0), -18.55, sideOn ? 1.6 : 2.2, 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (sideOn) {
          ctx.fillStyle = skin;
          ctx.beginPath();
          ctx.ellipse(hx + 3.35, -19.65, 0.72, 0.88, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = hair;
        ctx.beginPath();
        ctx.ellipse(hx, -21.15, 3.65, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = skin;
      roundRect(ctx, hx - 1.0, -17.15, 2.05, 1.75, 0.7);
      ctx.fill();
      ctx.fillStyle = fem ? "#6a4a40" : "#4a3a32";
      ctx.fillRect(hx - 0.85, -16.55, 1.7, 0.35);
    };

    if (rear) {
      arm(3.6, -15.5, aL, jacketDark);
      leg(-2.2, -6.5, lL, pants, false);
      torso();
      leg(2.2, -6.5, lR, pantsLight, true);
      arm(-3.8, -15.5, aR, jacket);
      head();
    } else {
      arm(sideOn ? 1.1 : 4.15, -15.5, aL, jacketDark);
      leg(sideOn ? -1.15 : -2.45, -6.5, lL, pants, false);
      torso();
      leg(sideOn ? 1.25 : 2.45, -6.5, lR, pantsLight, true);
      arm(sideOn ? -1.05 : -4.25, -15.5, aR, jacket);
      head();
    }

    ctx.restore();
  };

  const gaitLegs = (gait: number, spread: number) => {
    ctx.fillStyle = "#3a3530";
    ctx.fillRect(-spread, -2.4 + gait, 1.3, 2.7);
    ctx.fillRect(-spread * 0.35, -2.4 - gait, 1.3, 2.7);
    ctx.fillRect(spread * 0.28, -2.4 + gait, 1.3, 2.7);
    ctx.fillRect(spread * 0.85, -2.4 - gait, 1.3, 2.7);
  };

  const drawMob = (m: Mob) => {
    const zoom = getZoom();
    const elev = m.y / HEIGHT_UNIT;
    const [sx, sy] = project(m.x, m.z, elev);
    const hop = m.kind === "hare" ? Math.abs(Math.sin(m.walkPhase)) * 2.4 : Math.abs(Math.sin(m.walkPhase)) * 0.55;
    const kScale =
      m.kind === "hare" ? 0.62 : m.kind === "cthulhu" ? 1.12 : m.kind === "moose" || m.kind === "bear" ? 0.92 : 0.78;
    const k = zoom * kScale;
    m.facing = facingFromVel(m.x, m.z, m.vx, m.vz, elev, m.facing);
    const facing = m.facing;
    const flip = facing === 3 ? -1 : 1;
    const sideOn = facing === 1 || facing === 3;
    const rear = facing === 2;
    const flash = m.hurtT > 0;
    const fuseBlink = m.kind === "fuse" && m.fuseT > 0 && Math.floor(m.fuseT * 14) % 2 === 0;

    ctx.fillStyle = "rgba(16, 20, 18, 0.28)";
    ctx.beginPath();
    const shw = m.kind === "cthulhu" ? 10.4 : m.kind === "moose" ? 8.6 : m.kind === "bear" ? 8.2 : m.kind === "wolf" ? 7.2 : 5.2;
    ctx.ellipse(sx, sy + 1.4 * k, shw * k, 2.6 * k, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(sx, sy - hop * zoom * 0.4);
    ctx.scale(flip * k, k);

    if (m.kind === "hare") {
      const fur = flash ? "#d8b090" : "#c4a882";
      const belly = "#e6d4b4";
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(0, -4.2, 3.4, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = belly;
      ctx.beginPath();
      ctx.ellipse(sideOn ? 0.6 : 0, -3.6, 2.1, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(sideOn ? 1.4 : 0.2, -7.1, 2.15, 1.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(sideOn ? 0.6 : -1.1, -8.6);
      ctx.rotate(-0.35);
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(0, -2.4, 0.85, 2.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8c4b8";
      ctx.beginPath();
      ctx.ellipse(0, -2.2, 0.4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(sideOn ? 1.8 : 1.1, -8.5);
      ctx.rotate(0.2);
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(0, -2.5, 0.85, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (!rear) {
        ctx.fillStyle = "#1a1612";
        ctx.beginPath();
        ctx.arc(sideOn ? 2.4 : 0.9, -7.15, 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c45c4a";
        ctx.beginPath();
        ctx.arc(sideOn ? 3.1 : 0.2, -6.4, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ddd0c2";
      ctx.beginPath();
      ctx.ellipse(sideOn ? -2.8 : 0, -4.6, 1.1, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === "boar") {
      const fur = flash ? "#8a7060" : "#5a4638";
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(sideOn ? -0.2 : 0, -4.6, 5.4, 3.1, sideOn ? -0.12 : 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2c24";
      ctx.beginPath();
      ctx.ellipse(sideOn ? 4.4 : 0.4, -5.6, 2.4, 1.8, sideOn ? -0.15 : 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8dcc8";
      ctx.beginPath();
      ctx.moveTo(sideOn ? 5.8 : 1.2, -5.2);
      ctx.lineTo(sideOn ? 7.4 : 2.2, -6.6);
      ctx.lineTo(sideOn ? 6.6 : 1.6, -4.8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sideOn ? 5.8 : -1.0, -5.2);
      ctx.lineTo(sideOn ? 7.2 : -2.0, -6.4);
      ctx.lineTo(sideOn ? 6.4 : -1.4, -4.7);
      ctx.closePath();
      ctx.fill();
      if (!rear) {
        ctx.fillStyle = "#1a1612";
        ctx.beginPath();
        ctx.arc(sideOn ? 5.2 : 0.9, -6.0, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      gaitLegs(Math.sin(m.walkPhase) * 1.05, 3.2);
    } else if (m.kind === "bear") {
      const fur = flash ? "#8a6a52" : "#5c4030";
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(sideOn ? -0.3 : 0, -5.8, 6.2, 3.8, sideOn ? -0.1 : 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sideOn ? 4.6 : 0.2, -8.4, 2.8, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a281c";
      ctx.beginPath();
      ctx.ellipse(sideOn ? 3.6 : -1.4, -10.4, 1.15, 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sideOn ? 5.6 : 1.4, -10.3, 1.15, 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c4a882";
      ctx.beginPath();
      ctx.ellipse(sideOn ? 6.4 : 0.3, -7.5, 1.4, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!rear) {
        ctx.fillStyle = "#1a1612";
        ctx.beginPath();
        ctx.arc(sideOn ? 5.5 : 1.0, -8.55, 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      gaitLegs(Math.sin(m.walkPhase) * 0.9, 3.8);
    } else if (m.kind === "moose") {
      const fur = flash ? "#8a6a48" : "#5a402c";
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(sideOn ? -0.6 : 0, -6.6, 6.4, 3.4, sideOn ? -0.16 : 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sideOn ? 5.2 : 0.3, -9.2, 2.4, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2a1c";
      ctx.beginPath();
      ctx.moveTo(sideOn ? 4.2 : -1.6, -11.2);
      ctx.lineTo(sideOn ? 1.4 : -4.4, -14.6);
      ctx.lineTo(sideOn ? 2.2 : -3.2, -12.2);
      ctx.lineTo(sideOn ? 3.4 : -2.4, -13.8);
      ctx.lineTo(sideOn ? 5.0 : -0.4, -11.0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sideOn ? 6.0 : 1.6, -11.1);
      ctx.lineTo(sideOn ? 8.6 : 4.2, -14.4);
      ctx.lineTo(sideOn ? 7.4 : 3.0, -12.0);
      ctx.lineTo(sideOn ? 9.0 : 4.6, -13.2);
      ctx.lineTo(sideOn ? 6.6 : 0.6, -10.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#4a3424";
      ctx.beginPath();
      ctx.ellipse(sideOn ? 7.2 : 0.4, -8.2, 1.8, 1.15, 0.2, 0, Math.PI * 2);
      ctx.fill();
      if (!rear) {
        ctx.fillStyle = "#1a1612";
        ctx.beginPath();
        ctx.arc(sideOn ? 6.2 : 0.9, -9.4, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      gaitLegs(Math.sin(m.walkPhase) * 1.2, 3.6);
    } else if (m.kind === "fuse") {
      const body = fuseBlink ? "#d8e8c8" : flash ? "#8aaa70" : "#4a6a40";
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, -4.4, 3.5 + m.fuseT * 0.55, 4.2 + m.fuseT * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fuseBlink ? "#2a2018" : "#1a2418";
      ctx.beginPath();
      ctx.arc(sideOn ? 1.3 : 0.9, -5.5, 0.55, 0, Math.PI * 2);
      ctx.fill();
      if (!sideOn) {
        ctx.beginPath();
        ctx.arc(-0.9, -5.5, 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#2a3a24";
      ctx.fillRect(-2.2, -1.6, 1.2, 1.8);
      ctx.fillRect(1.0, -1.6, 1.2, 1.8);
      ctx.strokeStyle = "#6a8a52";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -8.6);
      ctx.lineTo(0.4, -11.2 - m.fuseT * 1.4);
      ctx.stroke();
      ctx.fillStyle = m.fuseT > 0.4 ? "#c45c4a" : "#3a4a32";
      ctx.beginPath();
      ctx.arc(0.4, -11.4 - m.fuseT * 1.4, 0.7 + m.fuseT * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === "cthulhu") {
      const hide = flash ? "#5a6a72" : "#2c3a42";
      ctx.fillStyle = hide;
      ctx.beginPath();
      ctx.ellipse(0, -7.2, 7.2, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#243038";
      ctx.beginPath();
      ctx.moveTo(-6.4, -8.2);
      ctx.quadraticCurveTo(-9.5, -14.5, -2.2, -11.4);
      ctx.quadraticCurveTo(-4.2, -8.6, -5.4, -7.4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6.4, -8.2);
      ctx.quadraticCurveTo(9.5, -14.5, 2.2, -11.4);
      ctx.quadraticCurveTo(4.2, -8.6, 5.4, -7.4);
      ctx.fill();
      ctx.fillStyle = "#3a4a52";
      ctx.beginPath();
      ctx.ellipse(sideOn ? 1.2 : 0, -10.4, 3.4, 3.1, 0, 0, Math.PI * 2);
      ctx.fill();
      const glow = 0.45 + Math.abs(Math.sin(m.walkPhase * 0.7)) * 0.4;
      ctx.fillStyle = `rgba(196, 92, 74, ${0.55 + glow * 0.4})`;
      ctx.beginPath();
      ctx.arc(sideOn ? 2.2 : 1.15, -10.7, 0.72, 0, Math.PI * 2);
      ctx.fill();
      if (!sideOn) {
        ctx.beginPath();
        ctx.arc(-1.15, -10.7, 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#1c282e";
      ctx.lineWidth = 1.15;
      for (let i = 0; i < 5; i++) {
        const ox = -2.4 + i * 1.2;
        const wiggle = Math.sin(m.walkPhase + i) * 1.4;
        ctx.beginPath();
        ctx.moveTo(ox, -5.4);
        ctx.quadraticCurveTo(ox + wiggle, -2.2, ox + wiggle * 0.4, 0.6);
        ctx.stroke();
      }
    } else {
      const fur = flash ? "#8a7a72" : m.fleeT > 0 ? "#6a635c" : "#5c5752";
      const dark = "#3a3530";
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(sideOn ? -0.4 : 0, -5.2, 5.6, 3.15, sideOn ? -0.18 : 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7a7268";
      ctx.beginPath();
      ctx.ellipse(sideOn ? 0.4 : 0, -4.4, 3.6, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(sideOn ? 4.2 : 0.3, -7.4, 2.6, 2.15, sideOn ? -0.2 : 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(sideOn ? 3.2 : -1.4, -9.2);
      ctx.lineTo(sideOn ? 2.4 : -2.1, -11.4);
      ctx.lineTo(sideOn ? 4.2 : -0.4, -9.0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sideOn ? 5.2 : 1.4, -9.1);
      ctx.lineTo(sideOn ? 5.6 : 2.1, -11.2);
      ctx.lineTo(sideOn ? 6.2 : 0.5, -8.8);
      ctx.closePath();
      ctx.fill();
      if (sideOn) {
        ctx.fillStyle = fur;
        ctx.beginPath();
        ctx.ellipse(6.6, -6.6, 2.2, 1.15, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a2420";
        ctx.beginPath();
        ctx.ellipse(8.4, -6.35, 0.7, 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!rear) {
        ctx.fillStyle = "#c45c4a";
        ctx.beginPath();
        ctx.arc(sideOn ? 5.2 : 1.1, -7.55, 0.48, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sideOn ? -5.4 : 0, -5.6);
      ctx.quadraticCurveTo(sideOn ? -8.2 : -3.4, -8.4, sideOn ? -7.4 : -2.2, -3.2);
      ctx.stroke();
      gaitLegs(Math.sin(m.walkPhase) * 1.1, 3.4);
    }

    ctx.restore();

    if (m.alive && m.hp < m.maxHp) {
      const bw = 9 * k;
      const ratio = Math.max(0, m.hp / m.maxHp);
      const by = sy - (m.kind === "cthulhu" ? 22 : 16) * k;
      ctx.fillStyle = "rgba(16, 20, 18, 0.45)";
      ctx.fillRect(sx - bw * 0.5, by, bw, 1.4 * k);
      ctx.fillStyle = "#c45c4a";
      ctx.fillRect(sx - bw * 0.5, by, bw * ratio, 1.4 * k);
    }
  };

  const drawRock = (r: Rock) => {
    const zoom = getZoom();
    const elev = r.y / HEIGHT_UNIT;
    const [sx, sy] = project(r.x, r.z, elev);
    const s = r.scale || 1;
    const k = zoom * 0.9 * s;
    if (r.kind === "scythe") {
      ctx.fillStyle = "rgba(16, 20, 18, 0.2)";
      ctx.beginPath();
      ctx.ellipse(sx, sy + 1.6 * k, 3.2 * k, 1.35 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(sx, sy - 2.2 * k);
      ctx.rotate(r.orbitA + 0.7);
      ctx.fillStyle = "#6a3a32";
      ctx.fillRect(-1.1 * k, -1.2 * k, 2.2 * k, 7.4 * k);
      ctx.fillStyle = "#c4b08a";
      ctx.beginPath();
      ctx.moveTo(0.2 * k, -1.4 * k);
      ctx.quadraticCurveTo(9.5 * k, -7.2 * k, 16.4 * k, 1.8 * k);
      ctx.quadraticCurveTo(8.4 * k, -1.6 * k, 1.2 * k, 2.4 * k);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e8dcc8";
      ctx.beginPath();
      ctx.moveTo(1.4 * k, -0.6 * k);
      ctx.quadraticCurveTo(8.6 * k, -5.4 * k, 14.2 * k, 0.6 * k);
      ctx.quadraticCurveTo(8.2 * k, -2.2 * k, 2.0 * k, 0.8 * k);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c45c4a";
      ctx.beginPath();
      ctx.arc(0, -1.6 * k, 1.15 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const [gsx, gsy] = project(r.x, r.z, 0.2);
    ctx.fillStyle = "rgba(16, 20, 18, 0.22)";
    ctx.beginPath();
    ctx.ellipse(gsx, gsy + 1.2 * k, 2.4 * k, 1.2 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = r.kind === "orbit" ? "#c4b08a" : "#8a8074";
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1.1 * k, 2.15 * k, 1.55 * k, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c4b9a8";
    ctx.beginPath();
    ctx.ellipse(sx - 0.5 * k, sy - 1.7 * k, 0.85 * k, 0.55 * k, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = r.homing ? "#c45c4a" : "#5c564c";
    ctx.lineWidth = Math.max(0.7, zoom * 0.35);
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1.1 * k, 2.15 * k, 1.55 * k, 0.35, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawCoin = (c: Coin, t: number) => {
    const zoom = getZoom();
    const bob = Math.sin(t * 5.4 + c.x * 3) * 0.12;
    const elev = (c.y + bob) / HEIGHT_UNIT;
    const [sx, sy] = project(c.x, c.z, elev);
    const k = zoom * (0.72 + Math.min(0.45, c.value / 40));
    ctx.fillStyle = "rgba(16, 20, 18, 0.26)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2.1 * k, 2.4 * k, 1.15 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c6a24a";
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1.4 * k, 2.35 * k, 1.7 * k, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8d08a";
    ctx.beginPath();
    ctx.ellipse(sx - 0.35 * k, sy - 2.0 * k, 1.15 * k, 0.8 * k, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6a2c";
    ctx.lineWidth = Math.max(0.7, zoom * 0.32);
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1.4 * k, 2.35 * k, 1.7 * k, 0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#8a6a2c";
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1.4 * k, 0.7 * k, 0.5 * k, 0.1, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawSpark = (x: number, z: number, y: number, life: number) => {
    const zoom = getZoom();
    const [sx, sy] = project(x, z, y / HEIGHT_UNIT);
    const a = Math.max(0, Math.min(1, life));
    ctx.fillStyle = `rgba(232, 210, 170, ${a * 0.92})`;
    ctx.beginPath();
    ctx.arc(sx, sy, (1.5 + a * 2.4) * zoom * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(196, 92, 74, ${a * 0.55})`;
    ctx.beginPath();
    ctx.arc(sx, sy, (0.6 + a * 1.1) * zoom * 0.55, 0, Math.PI * 2);
    ctx.fill();
  };

  return { drawBlock, drawProp, drawExplorer, drawMob, drawRock, drawCoin, drawSpark };
}
