import { BIOME_SIDE, BIOME_TOP, HEIGHT_UNIT } from "./constants";
import type { Mob, Rock } from "./mobs";
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

  const drawExplorer = (p: Player) => {
    const zoom = getZoom();
    const elev = p.y / HEIGHT_UNIT;
    const [sx, sy] = project(p.x, p.z, elev);
    const k = zoom * 0.88;
    const speed = Math.hypot(p.vx, p.vz);
    const walking = p.grounded && speed > 0.28;
    const ph = p.walkPhase;
    const swing = walking ? Math.sin(ph) : 0;
    const bob = walking ? Math.abs(Math.sin(ph)) * 2.4 : p.grounded ? 0 : 2.2;
    lastFacing = facingFromVel(p.x, p.z, p.vx, p.vz, elev, lastFacing);
    const facing = lastFacing;
    const flip = facing === 3 ? -1 : 1;
    const sideOn = facing === 1 || facing === 3;
    const rear = facing === 2;
    const s = p.squash;
    const flicker = p.iFrame > 0 && Math.floor(p.iFrame * 18) % 2 === 0;
    if (flicker) return;

    ctx.fillStyle = p.onWater ? "rgba(36, 88, 108, 0.4)" : "rgba(16, 20, 18, 0.34)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2.2 * k, (6.4 + (walking ? 1.6 : 0)) * k, 3.1 * k, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(sx, sy - bob * k);
    ctx.scale((flip * k) / Math.sqrt(s), k * s);

    const aL = walking ? -swing * (sideOn ? 0.72 : 0.42) : 0.08;
    const aR = walking ? swing * (sideOn ? 0.72 : 0.42) : 0.08;
    const lL = walking ? -swing * (sideOn ? 0.62 : 0.38) : 0.05;
    const lR = walking ? swing * (sideOn ? 0.62 : 0.38) : 0.05;
    const skin = p.hurtT > 0 ? "#d4a090" : "#e2c8a8";
    const jacket = "#3c4944";
    const jacketDark = "#2c3531";
    const pants = "#232826";
    const pantsLight = "#2c332f";

    const arm = (shX: number, shY: number, a: number, color: string) => {
      ctx.save();
      ctx.translate(shX, shY);
      ctx.rotate(a);
      ctx.fillStyle = color;
      roundRect(ctx, -1.35, -0.6, 2.7, 8.2, 1.3);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(0.15, 8.3, 1.25, 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const leg = (hipX: number, hipY: number, a: number, color: string, lead: boolean) => {
      const thigh = 5.6;
      const shin = 5.2;
      const knee = walking ? 0.24 + Math.max(0, -Math.sin(ph + (lead ? 0 : Math.PI))) * 0.48 : 0.08;
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
      ctx.ellipse(1.05, shin + 0.15, 2.35, 1.15, 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const torso = () => {
      ctx.fillStyle = jacket;
      roundRect(ctx, sideOn ? -4.2 : -5.4, -16.6, sideOn ? 9.2 : 10.8, 11.2, 2.6);
      ctx.fill();
      ctx.fillStyle = "#c6b89a";
      if (!rear) {
        ctx.beginPath();
        ctx.moveTo(sideOn ? 0.6 : 0, -16.4);
        ctx.lineTo(sideOn ? 2.4 : 2.2, -11.2);
        ctx.lineTo(sideOn ? -1.1 : -2.2, -11.2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = jacketDark;
      roundRect(ctx, sideOn ? -4.2 : -5.4, -16.6, sideOn ? 9.2 : 10.8, 2.4, 1.4);
      ctx.fill();
      ctx.fillStyle = "#4a3a2c";
      ctx.fillRect(sideOn ? -4 : -5.1, -6.6, sideOn ? 8.6 : 10.2, 1.15);
    };

    const head = () => {
      const hx = sideOn ? 1.05 : 0.2;
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(hx, -20.4, 3.55, 4.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1c1814";
      ctx.beginPath();
      ctx.ellipse(hx, -22.4, 3.7, 2.7, sideOn ? 0.18 : 0.05, Math.PI, Math.PI * 2.05);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx - (sideOn ? 0.2 : 0), -21.6, 3.55, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!rear) {
        ctx.fillStyle = "#1a1e1c";
        ctx.beginPath();
        ctx.ellipse(hx + (sideOn ? 1.55 : 1.35), -20.15, 0.7, 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!sideOn) {
          ctx.beginPath();
          ctx.ellipse(hx - 1.35, -20.15, 0.7, 0.85, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.arc(hx + (sideOn ? 1.75 : 1.55), -20.4, 0.28, 0, Math.PI * 2);
        ctx.fill();
        if (sideOn) {
          ctx.fillStyle = skin;
          ctx.beginPath();
          ctx.ellipse(hx + 3.3, -19.7, 0.7, 0.85, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "#1c1814";
        ctx.beginPath();
        ctx.ellipse(hx, -21.2, 3.6, 3.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = skin;
      roundRect(ctx, hx - 1.05, -17.1, 2.1, 1.7, 0.7);
      ctx.fill();
    };

    if (rear) {
      arm(3.6, -15.4, aL, jacketDark);
      leg(-2.2, -6.4, lL, pants, false);
      torso();
      leg(2.2, -6.4, lR, pantsLight, true);
      arm(-3.8, -15.4, aR, jacket);
      head();
    } else {
      arm(sideOn ? 1.1 : 4.1, -15.4, aL, jacketDark);
      leg(sideOn ? -1.1 : -2.4, -6.4, lL, pants, false);
      torso();
      leg(sideOn ? 1.2 : 2.4, -6.4, lR, pantsLight, true);
      arm(sideOn ? -1.0 : -4.2, -15.4, aR, jacket);
      head();
    }

    ctx.restore();
  };

  const drawMob = (m: Mob) => {
    const zoom = getZoom();
    const elev = m.y / HEIGHT_UNIT;
    const [sx, sy] = project(m.x, m.z, elev);
    const hop = m.kind === "hare" ? Math.abs(Math.sin(m.walkPhase)) * 2.4 : 0;
    const k = zoom * (m.kind === "hare" ? 0.62 : 0.78);
    m.facing = facingFromVel(m.x, m.z, m.vx, m.vz, elev, m.facing);
    const facing = m.facing;
    const flip = facing === 3 ? -1 : 1;
    const sideOn = facing === 1 || facing === 3;
    const rear = facing === 2;
    const flash = m.hurtT > 0;

    ctx.fillStyle = "rgba(16, 20, 18, 0.28)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 1.4 * k, (m.kind === "wolf" ? 7.2 : 4.6) * k, 2.6 * k, 0, 0, Math.PI * 2);
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
      const gait = Math.sin(m.walkPhase) * 1.1;
      ctx.fillStyle = dark;
      ctx.fillRect(-3.4, -2.4 + gait, 1.3, 2.6);
      ctx.fillRect(-1.2, -2.4 - gait, 1.3, 2.6);
      ctx.fillRect(1.1, -2.4 + gait, 1.3, 2.6);
      ctx.fillRect(3.2, -2.4 - gait, 1.3, 2.6);
    }

    ctx.restore();
  };

  const drawRock = (r: Rock) => {
    const zoom = getZoom();
    const elev = r.y / HEIGHT_UNIT;
    const [sx, sy] = project(r.x, r.z, elev);
    const k = zoom * 0.9;
    const [gsx, gsy] = project(r.x, r.z, 0.2);
    ctx.fillStyle = "rgba(16, 20, 18, 0.22)";
    ctx.beginPath();
    ctx.ellipse(gsx, gsy + 1.2 * k, 2.4 * k, 1.2 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a8074";
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1.1 * k, 2.15 * k, 1.55 * k, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c4b9a8";
    ctx.beginPath();
    ctx.ellipse(sx - 0.5 * k, sy - 1.7 * k, 0.85 * k, 0.55 * k, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5c564c";
    ctx.lineWidth = Math.max(0.7, zoom * 0.35);
    ctx.beginPath();
    ctx.ellipse(sx, sy - 1.1 * k, 2.15 * k, 1.55 * k, 0.35, 0, Math.PI * 2);
    ctx.stroke();
  };

  return { drawBlock, drawProp, drawExplorer, drawMob, drawRock };
}
