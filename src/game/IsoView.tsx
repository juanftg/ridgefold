import { useEffect, useRef } from "react";
import { createAudio } from "./audio";
import { BIOME_SIDE, BIOME_TOP, CAM_ROT_SPEED, FIXED_DT, HEIGHT_UNIT } from "./constants";
import { createInput, screenToWorld } from "./input";
import { playerSpeed, spawnPlayer, stepPlayer, type Player } from "./sim";
import { useGame } from "./store";
import {
  cellAt,
  ensureAround,
  generateWorld,
  pruneChunks,
  scatterPropsNear,
  type Prop,
  type World,
} from "./terrain";

type Probe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys: (codes: string[]) => void;
  getPos: () => { x: number; y: number; z: number; grounded: boolean };
  getCamYaw?: () => number;
  getWalkPhase?: () => number;
  getZoom?: () => number;
};

declare global {
  interface Window {
    __controlsTest?: Probe;
    __ridgefold?: Probe;
  }
}

const BASE_TW = 28;
const BASE_TH = 14;
const BASE_EH = 17;

function rotateXZ(x: number, z: number, a: number): [number, number] {
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

function quad(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
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

export function IsoView({ seed }: { seed: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const world: World = generateWorld(seed);
    const player = spawnPlayer(world);
    const input = createInput();
    const audio = createAudio();
    const setHud = useGame.getState().setHud;
    const pause = useGame.getState().pause;

    (window as unknown as {
      __ridgeInput?: {
        setTouchMove: typeof input.setTouchMove;
        setTouchJump: typeof input.setTouchJump;
        setTouchYaw: typeof input.setTouchYaw;
      };
    }).__ridgeInput = {
      setTouchMove: input.setTouchMove,
      setTouchJump: input.setTouchJump,
      setTouchYaw: input.setTouchYaw,
    };

    let camX = 0;
    let camY = 0;
    let camYaw = 0;
    let zoom = 2.72;
    let acc = 0;
    let hudT = 0;
    let last = performance.now();
    let raf = 0;
    let unlocked = false;
    let hops = player.hops;
    let wasGrounded = true;
    let dragId: number | null = null;
    let dragX = 0;
    let camInited = false;
    let lastFacing = 0;

    const probe: Probe = {
      getYaw: () => player.yaw,
      getSpeed: () => playerSpeed(player),
      setKeys: (codes) => input.setKeys(codes),
      getPos: () => ({ x: player.x, y: player.y, z: player.z, grounded: player.grounded }),
      getCamYaw: () => camYaw,
      getWalkPhase: () => player.walkPhase,
      getZoom: () => zoom,
    };
    window.__controlsTest = probe;
    window.__ridgefold = probe;

    const project = (x: number, z: number, elev: number): [number, number] => {
      const tw = BASE_TW * zoom;
      const th = BASE_TH * zoom;
      const eh = BASE_EH * zoom;
      const [rx, rz] = rotateXZ(x, z, camYaw);
      return [(rx - rz) * tw, (rx + rz) * th - elev * eh];
    };

    const depth = (x: number, z: number) => {
      const [rx, rz] = rotateXZ(x, z, camYaw);
      return rx + rz;
    };

    const drawBlock = (x: number, z: number, h: number, biome: number, water: boolean, t: number) => {
      const elev = water
        ? 0.34 + Math.sin(t * 1.6 + x * 1.7 + z * 1.15) * 0.05
        : Math.max(0.55, h);
      const x0 = x - 0.48;
      const x1 = x + 0.48;
      const z0 = z - 0.48;
      const z1 = z + 0.48;
      const t00 = project(x0, z0, elev);
      const t10 = project(x1, z0, elev);
      const t11 = project(x1, z1, elev);
      const t01 = project(x0, z1, elev);
      const b10 = project(x1, z0, 0);
      const b11 = project(x1, z1, 0);
      const b01 = project(x0, z1, 0);
      const side = BIOME_SIDE[biome] ?? "#5a4a38";
      const top = BIOME_TOP[biome] ?? "#6e8f5c";
      quad(ctx, [t10, t11, b11, b10], shade(side, water ? -8 : -18));
      quad(ctx, [t01, t11, b11, b01], shade(side, water ? 16 : 10));
      quad(ctx, [t00, t10, t11, t01], water ? shade(top, Math.sin(t * 2 + x + z) * 18) : top);
    };

    const drawProp = (p: Prop) => {
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
      const elev = p.y / HEIGHT_UNIT;
      const [sx, sy] = project(p.x, p.z, elev);
      const k = zoom * 1.52;
      const speed = Math.hypot(p.vx, p.vz);
      const walking = p.grounded && speed > 0.28;
      const ph = p.walkPhase;
      const swing = walking ? Math.sin(ph) : 0;
      const bob = walking ? Math.abs(Math.sin(ph)) * 5.1 : p.grounded ? 0 : 3.4;
      const [ax, ay] = project(p.x + p.vx * 0.14, p.z + p.vz * 0.14, elev);
      const sdx = ax - sx;
      const sdy = ay - sy;
      if (walking && sdx * sdx + sdy * sdy > 0.18) {
        lastFacing = Math.abs(sdx) >= Math.abs(sdy) ? (sdx >= 0 ? 1 : 3) : sdy >= 0 ? 0 : 2;
      }
      const facing = lastFacing;
      const flip = facing === 3 ? -1 : 1;
      const sideOn = facing === 1 || facing === 3;
      const rear = facing === 2;
      const s = p.squash;

      ctx.fillStyle = p.onWater ? "rgba(36, 88, 108, 0.4)" : "rgba(16, 20, 18, 0.34)";
      ctx.beginPath();
      ctx.ellipse(sx, sy + 6 * k, (11 + (walking ? 3.4 : 0)) * k, 5.4 * k, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(sx, sy - bob * k);
      ctx.scale((flip * k) / Math.sqrt(s), k * s);

      const aL = walking ? -swing * (sideOn ? 0.78 : 0.48) : 0.1;
      const aR = walking ? swing * (sideOn ? 0.78 : 0.48) : 0.1;
      const lL = walking ? -swing * (sideOn ? 0.7 : 0.42) : 0.06;
      const lR = walking ? swing * (sideOn ? 0.7 : 0.42) : 0.06;

      const arm = (shX: number, shY: number, a: number, color: string) => {
        ctx.save();
        ctx.translate(shX, shY);
        ctx.rotate(a);
        ctx.fillStyle = color;
        roundRect(ctx, -2.1, -1, 4.2, 12.2, 1.9);
        ctx.fill();
        ctx.fillStyle = "#e8dcc8";
        ctx.beginPath();
        ctx.ellipse(0.2, 12.4, 1.9, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      const leg = (hipX: number, hipY: number, a: number, color: string, lead: boolean) => {
        const thigh = 8.6;
        const shin = 7.8;
        const knee = walking
          ? 0.28 + Math.max(0, -Math.sin(ph + (lead ? 0 : Math.PI))) * 0.55
          : 0.1;
        ctx.save();
        ctx.translate(hipX, hipY);
        ctx.rotate(a);
        ctx.fillStyle = color;
        roundRect(ctx, -2.7, -1, 5.4, thigh, 2.3);
        ctx.fill();
        ctx.translate(0, thigh - 0.5);
        ctx.rotate(knee);
        roundRect(ctx, -2.3, -0.5, 4.6, shin, 2);
        ctx.fill();
        ctx.fillStyle = "#151a17";
        ctx.beginPath();
        ctx.ellipse(1.4, shin + 0.2, 3.5, 1.75, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      if (rear) {
        arm(5.6, -23, aL, "#2f3a34");
        leg(-3.4, -10.4, lL, "#1c211e", false);
        ctx.fillStyle = "#3a433e";
        roundRect(ctx, -9, -25.4, 18, 17, 4.8);
        ctx.fill();
        ctx.fillStyle = "#2a322e";
        roundRect(ctx, -6.4, -23.4, 12.8, 10.4, 3);
        ctx.fill();
        leg(3.6, -10.4, lR, "#262c28", true);
        arm(-6, -23, aR, "#3d4540");
        ctx.fillStyle = "#e8dcc8";
        ctx.beginPath();
        ctx.arc(0, -30.8, 6.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2c3330";
        ctx.beginPath();
        ctx.ellipse(0, -34, 7, 4.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        arm(sideOn ? 1.6 : 6.4, -23, aL, "#2f3a34");
        leg(sideOn ? -1.4 : -3.8, -10.4, lL, "#1c211e", false);
        ctx.fillStyle = "#3d4540";
        roundRect(ctx, sideOn ? -6.6 : -9, -25.4, sideOn ? 14 : 18, 17.2, 4.8);
        ctx.fill();
        ctx.fillStyle = "#4f5b54";
        roundRect(ctx, sideOn ? -4.4 : -6.6, -21.8, sideOn ? 8.4 : 10, 11.2, 2.7);
        ctx.fill();
        leg(sideOn ? 1.8 : 3.8, -10.4, lR, "#2a302c", true);
        arm(sideOn ? -1.4 : -6.6, -23, aR, "#3d4540");
        ctx.fillStyle = "#e8dcc8";
        ctx.beginPath();
        ctx.arc(sideOn ? 1.4 : 0.4, -30.8, 6.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2c3330";
        ctx.beginPath();
        ctx.ellipse(sideOn ? 1.6 : 0.3, -34, 6.9, 4.4, sideOn ? 0.22 : 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a1e1c";
        ctx.beginPath();
        ctx.arc(sideOn ? 3.8 : 2.4, -30, 1.25, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!sideOn) {
          ctx.beginPath();
          ctx.arc(-1.8, -30, 1.25, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || window.innerWidth || 800;
      const h = canvas.clientHeight || window.innerHeight || 600;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = zoom * (e.deltaY > 0 ? 0.92 : 1.08);
      zoom = Math.max(1.65, Math.min(4.15, next));
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2 && e.button !== 1) return;
      if (e.button === 0 && e.pointerType === "touch") return;
      dragId = e.pointerId;
      dragX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragId !== e.pointerId) return;
      camYaw += (e.clientX - dragX) * 0.0075;
      dragX = e.clientX;
      input.setCamYaw(camYaw);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragId === e.pointerId) dragId = null;
    };
    const onContext = (e: Event) => e.preventDefault();
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("contextmenu", onContext);

    const draw = (cssW: number, cssH: number, t: number, dt: number) => {
      const view = Math.ceil(18 / zoom) + 2;
      ensureAround(world, player.x, player.z, view + 6);
      const elev = player.y / HEIGHT_UNIT;
      const lookX = player.x + player.vx * 0.2;
      const lookZ = player.z + player.vz * 0.2;
      const [px, py] = project(lookX, lookZ, elev);
      if (!camInited) {
        camX = px;
        camY = py;
        camInited = true;
      } else {
        const follow = 1 - Math.exp(-20 * dt);
        camX += (px - camX) * follow;
        camY += (py - camY) * follow;
      }

      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, "#8ea4b0");
      sky.addColorStop(0.55, "#7d929a");
      sky.addColorStop(1, "#5f7378");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.save();
      ctx.translate(cssW * 0.5 - camX, cssH * 0.5 - camY);

      const gx0 = Math.floor(player.x - view);
      const gx1 = Math.ceil(player.x + view);
      const gz0 = Math.floor(player.z - view);
      const gz1 = Math.ceil(player.z + view);

      type Item = {
        d: number;
        kind: "tile" | "prop" | "player";
        i: number;
        x: number;
        z: number;
        h: number;
        biome: number;
        water: boolean;
      };
      const items: Item[] = [
        {
          d: depth(player.x, player.z) + 0.01,
          kind: "player",
          i: -1,
          x: player.x,
          z: player.z,
          h: elev,
          biome: 0,
          water: false,
        },
      ];

      for (let gz = gz0; gz < gz1; gz++) {
        for (let gx = gx0; gx < gx1; gx++) {
          const cell = cellAt(world, gx, gz);
          const x = gx + 0.5;
          const z = gz + 0.5;
          items.push({
            d: depth(x, z),
            kind: "tile",
            i: 0,
            x,
            z,
            h: cell.h,
            biome: cell.biome,
            water: cell.water,
          });
        }
      }
      const props = scatterPropsNear(world, player.x, player.z, view);
      for (let i = 0; i < props.length; i++) {
        const p = props[i]!;
        items.push({
          d: depth(p.x, p.z) + 0.2,
          kind: "prop",
          i,
          x: p.x,
          z: p.z,
          h: 0,
          biome: 0,
          water: false,
        });
      }
      items.sort((a, b) => a.d - b.d || a.h - b.h);

      for (const it of items) {
        if (it.kind === "tile") drawBlock(it.x, it.z, it.h, it.biome, it.water, t);
        else if (it.kind === "prop") drawProp(props[it.i]!);
        else drawExplorer(player);
      }
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const phase = useGame.getState().phase;
      if (phase === "playing") {
        if (!unlocked) {
          audio.unlock();
          unlocked = true;
        }
        acc += dt;
        let steps = 0;
        while (acc >= FIXED_DT && steps < 5) {
          const sample = input.sample();
          if (sample.pausePressed) pause();
          camYaw += sample.yawRate * CAM_ROT_SPEED * FIXED_DT;
          input.setCamYaw(camYaw);
          const mapped = screenToWorld(sample.moveX, sample.moveY, camYaw);
          sample.worldX = mapped.worldX;
          sample.worldZ = mapped.worldZ;
          stepPlayer(world, player, sample, FIXED_DT);
          if (player.hops > hops) audio.jump();
          if (player.grounded && !wasGrounded && player.landPulse > 0) audio.land();
          hops = player.hops;
          wasGrounded = player.grounded;
          acc -= FIXED_DT;
          steps += 1;
        }
        if (steps > 0) pruneChunks(world, player.x, player.z, 5);
      } else {
        acc = 0;
      }

      hudT += dt;
      if (hudT > 0.12) {
        hudT = 0;
        setHud({
          seed: world.seed,
          elevation: Math.round((player.y / HEIGHT_UNIT) * 10) / 10,
          hops: player.hops,
          hint: player.hintT > 0 ? player.hint : "none",
          grounded: player.grounded,
          onWater: player.onWater,
        });
      }

      const cssW = canvas.clientWidth || window.innerWidth;
      const cssH = canvas.clientHeight || window.innerHeight;
      draw(cssW, cssH, now / 1000, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.dispose();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("contextmenu", onContext);
      delete (window as unknown as { __ridgeInput?: unknown }).__ridgeInput;
      if (window.__controlsTest === probe) delete window.__controlsTest;
      if (window.__ridgefold === probe) delete window.__ridgefold;
    };
  }, [seed]);

  return (
    <canvas
      ref={canvasRef}
      className="iso-canvas"
      aria-label="Ridgefold isometric land"
    />
  );
}
