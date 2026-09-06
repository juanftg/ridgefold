import { useEffect, useRef } from "react";
import { createAudio } from "./audio";
import { BIOME_SIDE, BIOME_TOP, FIXED_DT, HEIGHT_UNIT } from "./constants";
import { createInput } from "./input";
import { playerSpeed, spawnPlayer, stepPlayer, type Player } from "./sim";
import { useGame } from "./store";
import { generateWorld, scatterProps, type Prop, type World } from "./terrain";

type Probe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys: (codes: string[]) => void;
  getPos: () => { x: number; y: number; z: number; grounded: boolean };
};

declare global {
  interface Window {
    __controlsTest?: Probe;
    __ridgefold?: Probe;
  }
}

const TW = 18;
const TH = 9;
const EH = 12;
const VIEW = 20;

function project(x: number, z: number, elev: number): [number, number] {
  return [(x - z) * TW, (x + z) * TH - elev * EH];
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

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  z: number,
  h: number,
  biome: number,
) {
  const elev = Math.max(0.55, h);
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
  quad(ctx, [t10, t11, b11, b10], shade(side, -18));
  quad(ctx, [t01, t11, b11, b01], shade(side, 10));
  quad(ctx, [t00, t10, t11, t01], top);
}

function drawProp(ctx: CanvasRenderingContext2D, p: Prop) {
  const [sx, sy] = project(p.x, p.z, p.y / HEIGHT_UNIT);
  if (p.kind === "pine") {
    ctx.fillStyle = "#2f4a38";
    ctx.beginPath();
    ctx.moveTo(sx, sy - 28 * p.scale);
    ctx.lineTo(sx + 9 * p.scale, sy - 4);
    ctx.lineTo(sx - 9 * p.scale, sy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3d5c45";
    ctx.beginPath();
    ctx.moveTo(sx, sy - 20 * p.scale);
    ctx.lineTo(sx + 11 * p.scale, sy);
    ctx.lineTo(sx - 11 * p.scale, sy);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = "#7a746c";
    ctx.beginPath();
    ctx.ellipse(sx, sy - 4, 7 * p.scale * 4, 5 * p.scale * 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
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

function drawExplorer(ctx: CanvasRenderingContext2D, p: Player) {
  const elev = p.y / HEIGHT_UNIT;
  const [sx, sy] = project(p.x, p.z, elev);
  ctx.fillStyle = "rgba(18, 22, 20, 0.32)";
  ctx.beginPath();
  ctx.ellipse(sx, sy + 3, 11, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(sx, sy);
  const s = p.squash;
  ctx.scale(1 / Math.sqrt(s), s);
  const swing = p.grounded ? Math.sin(p.walkPhase) * 5 : 3;
  ctx.fillStyle = "#2a302c";
  ctx.fillRect(-7, -8, 5, 10);
  ctx.fillRect(2, -8 + swing * 0.15, 5, 10);
  ctx.fillStyle = "#3d4540";
  roundRect(ctx, -8, -22, 16, 16, 4);
  ctx.fill();
  ctx.fillStyle = "#4f5b54";
  roundRect(ctx, -6, -18, 8, 10, 2);
  ctx.fill();
  ctx.fillStyle = "#e8dcc8";
  ctx.beginPath();
  ctx.arc(0, -28, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2c3330";
  ctx.beginPath();
  ctx.ellipse(0, -31, 6.4, 4.2, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
    const props = scatterProps(world);
    const input = createInput();
    const audio = createAudio();
    const setHud = useGame.getState().setHud;
    const pause = useGame.getState().pause;

    (window as unknown as {
      __ridgeInput?: {
        setTouchMove: typeof input.setTouchMove;
        setTouchJump: typeof input.setTouchJump;
      };
    }).__ridgeInput = {
      setTouchMove: input.setTouchMove,
      setTouchJump: input.setTouchJump,
    };
    const probe: Probe = {
      getYaw: () => player.yaw,
      getSpeed: () => playerSpeed(player),
      setKeys: (codes) => input.setKeys(codes),
      getPos: () => ({ x: player.x, y: player.y, z: player.z, grounded: player.grounded }),
    };
    window.__controlsTest = probe;
    window.__ridgefold = probe;

    let camX = 0;
    let camY = 0;
    let acc = 0;
    let hudT = 0;
    let last = performance.now();
    let raf = 0;
    let unlocked = false;
    let hops = player.hops;
    let fallen = player.fallen;
    let wasGrounded = true;
    const origin = world.size / 2;

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

    const draw = (cssW: number, cssH: number) => {
      const elev = player.y / HEIGHT_UNIT;
      const [px, py] = project(player.x, player.z, elev);
      camX += (px - camX) * 0.12;
      camY += (py - camY) * 0.12;

      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, "#9aa7ad");
      sky.addColorStop(0.55, "#8d9aa0");
      sky.addColorStop(1, "#6d7b80");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.save();
      ctx.translate(cssW * 0.5 - camX, cssH * 0.48 - camY);

      const gx0 = Math.max(0, Math.floor(player.x + origin - VIEW));
      const gx1 = Math.min(world.size, Math.floor(player.x + origin + VIEW));
      const gz0 = Math.max(0, Math.floor(player.z + origin - VIEW));
      const gz1 = Math.min(world.size, Math.floor(player.z + origin + VIEW));

      type Item = {
        d: number;
        kind: "tile" | "prop" | "player";
        i: number;
        x: number;
        z: number;
        h: number;
        biome: number;
      };
      const items: Item[] = [
        {
          d: player.x + player.z + 0.01,
          kind: "player",
          i: -1,
          x: player.x,
          z: player.z,
          h: elev,
          biome: 0,
        },
      ];

      for (let gz = gz0; gz < gz1; gz++) {
        for (let gx = gx0; gx < gx1; gx++) {
          const cell = world.cells[gz * world.size + gx]!;
          if (!cell.solid) continue;
          const x = gx - origin + 0.5;
          const z = gz - origin + 0.5;
          items.push({
            d: x + z,
            kind: "tile",
            i: gz * world.size + gx,
            x,
            z,
            h: cell.h,
            biome: cell.biome,
          });
        }
      }
      for (let i = 0; i < props.length; i++) {
        const p = props[i]!;
        if (Math.abs(p.x - player.x) > VIEW || Math.abs(p.z - player.z) > VIEW) continue;
        items.push({
          d: p.x + p.z + 0.2,
          kind: "prop",
          i,
          x: p.x,
          z: p.z,
          h: 0,
          biome: 0,
        });
      }
      items.sort((a, b) => a.d - b.d || a.h - b.h);

      for (const it of items) {
        if (it.kind === "tile") drawBlock(ctx, it.x, it.z, it.h, it.biome);
        else if (it.kind === "prop") drawProp(ctx, props[it.i]!);
        else drawExplorer(ctx, player);
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
          stepPlayer(world, player, sample, FIXED_DT);
          if (player.hops > hops) audio.jump();
          if (player.fallen > fallen) audio.fall();
          if (player.grounded && !wasGrounded && player.landPulse > 0) audio.land();
          hops = player.hops;
          fallen = player.fallen;
          wasGrounded = player.grounded;
          acc -= FIXED_DT;
          steps += 1;
        }
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
        });
      }

      const cssW = canvas.clientWidth || window.innerWidth;
      const cssH = canvas.clientHeight || window.innerHeight;
      draw(cssW, cssH);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.dispose();
      delete (window as unknown as { __ridgeInput?: unknown }).__ridgeInput;
      if (window.__controlsTest === probe) delete window.__controlsTest;
      if (window.__ridgefold === probe) delete window.__ridgefold;
    };
  }, [seed]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 block h-full w-full touch-none"
      aria-label="Ridgefold isometric land"
    />
  );
}
