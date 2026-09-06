import { useEffect, useRef } from "react";
import { createAudio } from "./audio";
import { CAM_ROT_SPEED, CHUNK_SIZE, FIXED_DT, HEIGHT_UNIT } from "./constants";
import { createInput, screenToWorld } from "./input";
import {
  createMobField,
  ensureMobsAround,
  pruneMobs,
  spawnMobAt,
  stepMobs,
  throwRock,
  tryBuy,
  type BuyKind,
  type MobKind,
} from "./mobs";
import { BASE_EH, BASE_TH, BASE_TW, createPaint, rotateXZ } from "./paint";
import { playerSpeed, spawnPlayer, stepPlayer } from "./sim";
import { useGame, type WandererSex } from "./store";
import {
  cellAt,
  ensureAround,
  generateWorld,
  pruneChunks,
  scatterPropsNear,
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
  getCam?: () => { x: number; z: number; elev: number; sx: number; sy: number };
  getHp?: () => number;
  getMobs?: () => {
    kind: MobKind;
    x: number;
    z: number;
    hp: number;
    aggressive: boolean;
    fleeT: number;
    fuseT: number;
  }[];
  spawnMobAt?: (kind: MobKind, x: number, z: number) => number;
  throwRock?: () => boolean;
  getRocks?: () => { x: number; y: number; z: number }[];
  getIdle?: () => { t: number; wave: number };
  setIdle?: (t: number, wave?: number) => void;
  getScarCount?: () => number;
  getSex?: () => WandererSex;
  getCoins?: () => number;
  getLevels?: () => { speed: number; atk: number };
  buy?: (kind: BuyKind) => boolean;
  spawnCoin?: (x: number, z: number, value: number) => void;
  setHp?: (n: number) => void;
  setIFrame?: (t: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: Probe;
    __ridgefold?: Probe;
  }
}

export function IsoView({ seed, sex }: { seed: string; sex: WandererSex }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const world: World = generateWorld(seed);
    const player = spawnPlayer(world, sex);
    const field = createMobField();
    const input = createInput();
    const audio = createAudio();
    const setHud = useGame.getState().setHud;
    const pause = useGame.getState().pause;
    const die = useGame.getState().die;

    (window as unknown as {
      __ridgeInput?: {
        setTouchMove: typeof input.setTouchMove;
        setTouchJump: typeof input.setTouchJump;
        setTouchThrow: typeof input.setTouchThrow;
        setTouchYaw: typeof input.setTouchYaw;
      };
    }).__ridgeInput = {
      setTouchMove: input.setTouchMove,
      setTouchJump: input.setTouchJump,
      setTouchThrow: input.setTouchThrow,
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
    let camWX = player.x;
    let camWZ = player.z;
    let camElev = player.y / HEIGHT_UNIT;
    let camWVX = 0;
    let camWVZ = 0;
    let camElevV = 0;
    let lookVX = 0;
    let lookVZ = 0;
    let trauma = 0;
    const sparks: { x: number; z: number; y: number; vx: number; vz: number; vy: number; life: number }[] = [];

    const springDamp = (
      pos: number,
      vel: number,
      target: number,
      dt: number,
      freq: number,
      zeta: number,
    ): [number, number] => {
      const omega = Math.PI * 2 * freq;
      const f = 1 + 2 * dt * zeta * omega;
      const oo = omega * omega;
      const det = f + dt * dt * oo;
      return [
        (pos * f + vel * dt + oo * target * dt * dt) / det,
        (vel + oo * (target - pos) * dt) / det,
      ];
    };

    const probe: Probe = {
      getYaw: () => player.yaw,
      getSpeed: () => playerSpeed(player),
      setKeys: (codes) => input.setKeys(codes),
      getPos: () => ({ x: player.x, y: player.y, z: player.z, grounded: player.grounded }),
      getCamYaw: () => camYaw,
      getWalkPhase: () => player.walkPhase,
      getZoom: () => zoom,
      getCam: () => ({ x: camWX, z: camWZ, elev: camElev, sx: camX, sy: camY }),
      getHp: () => player.hp,
      getMobs: () =>
        field.mobs
          .filter((m) => m.alive)
          .map((m) => ({
            id: m.id,
            kind: m.kind,
            x: m.x,
            z: m.z,
            hp: m.hp,
            aggressive: m.aggressive,
            fleeT: m.fleeT,
            fuseT: m.fuseT,
          })),
      spawnMobAt: (kind, x, z) => spawnMobAt(field, world, kind, x, z).id,
      throwRock: () => throwRock(world, field, player),
      getRocks: () => field.rocks.map((r) => ({ x: r.x, y: r.y, z: r.z })),
      getIdle: () => ({ t: field.idleT, wave: field.idleWave }),
      setIdle: (t, wave = 0) => {
        field.idleT = t;
        field.idleWave = wave;
      },
      getScarCount: () => world.scars.size,
      getSex: () => player.sex,
      getCoins: () => player.coins,
      getLevels: () => ({ speed: player.speedLv, atk: player.atkLv }),
      buy: (kind) => tryBuy(player, field, kind),
      spawnCoin: (x, z, value) => {
        field.coins.push({
          x,
          y: player.y + 0.3,
          z,
          vx: 0,
          vz: 0,
          value,
          age: 0,
          alive: true,
        });
      },
      setHp: (n) => {
        player.hp = Math.max(0, Math.min(player.maxHp, n));
      },
      setIFrame: (t) => {
        player.iFrame = t;
      },
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

    const paint = createPaint({
      ctx,
      world,
      project,
      depth,
      getZoom: () => zoom,
    });

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

    const viewRadius = (cssW: number, cssH: number) => {
      const tw = BASE_TW * zoom;
      const th = BASE_TH * zoom;
      const spanX = cssW * 0.5 / Math.max(8, tw);
      const spanY = cssH * 0.5 / Math.max(8, th) + 10;
      return Math.ceil(Math.max(spanX, spanY) * 1.32) + 5;
    };

    const draw = (cssW: number, cssH: number, t: number, dt: number) => {
      const view = viewRadius(cssW, cssH);
      ensureAround(world, player.x, player.z, view + 8);
      ensureMobsAround(world, field, player.x, player.z, view + 4);
      if (!camInited) {
        camWX = player.x;
        camWZ = player.z;
        camElev = player.y / HEIGHT_UNIT;
        camWVX = 0;
        camWVZ = 0;
        camElevV = 0;
        lookVX = 0;
        lookVZ = 0;
        camInited = true;
      } else {
        const kLook = 1 - Math.exp(-2.1 * dt);
        const ahead = player.grounded ? 0.11 : 0.04;
        lookVX += (player.vx * ahead - lookVX) * kLook;
        lookVZ += (player.vz * ahead - lookVZ) * kLook;
        const posFreq = player.grounded ? 1.05 : 1.45;
        const elevFreq = player.grounded ? 0.42 : 1.35;
        [camWX, camWVX] = springDamp(camWX, camWVX, player.x + lookVX, dt, posFreq, 1.18);
        [camWZ, camWVZ] = springDamp(camWZ, camWVZ, player.z + lookVZ, dt, posFreq, 1.18);
        [camElev, camElevV] = springDamp(
          camElev,
          camElevV,
          player.y / HEIGHT_UNIT,
          dt,
          elevFreq,
          1.22,
        );
      }
      const [px, py] = project(camWX, camWZ, camElev);
      camX = px;
      camY = py;

      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, "#8ea4b0");
      sky.addColorStop(0.55, "#7d929a");
      sky.addColorStop(1, "#5f7378");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);

      trauma = Math.max(0, trauma - dt * 2.6);
      const shake = trauma * trauma;
      const ox = (Math.sin(t * 47.2) * 8 + Math.sin(t * 23.1) * 3) * shake;
      const oy = Math.cos(t * 41.4) * 6 * shake;

      ctx.save();
      ctx.translate(cssW * 0.5 - camX + ox, cssH * 0.5 - camY + oy);

      const gx0 = Math.floor(player.x - view);
      const gx1 = Math.ceil(player.x + view);
      const gz0 = Math.floor(player.z - view);
      const gz1 = Math.ceil(player.z + view);
      const tw = BASE_TW * zoom;
      const th = BASE_TH * zoom;
      const maxSx = cssW * 0.5 + tw * 3;
      const maxSyDown = cssH * 0.5 + th * 5;
      const maxSyUp = cssH * 0.5 + th * 10;

      type Item = {
        d: number;
        kind: "tile" | "prop" | "player" | "mob" | "rock" | "coin";
        i: number;
        x: number;
        z: number;
        h: number;
        biome: number;
        water: boolean;
      };
      const actor: Item = {
        d: depth(player.x, player.z) + 0.01,
        kind: "player",
        i: -1,
        x: player.x,
        z: player.z,
        h: player.y / HEIGHT_UNIT,
        biome: 0,
        water: false,
      };
      const items: Item[] = [actor];

      for (let gz = gz0; gz < gz1; gz++) {
        for (let gx = gx0; gx < gx1; gx++) {
          const cell = cellAt(world, gx, gz);
          const x = gx + 0.5;
          const z = gz + 0.5;
          const [sx, sy] = project(x, z, cell.water ? 0.34 : cell.h);
          if (Math.abs(sx - camX) > maxSx) continue;
          if (sy - camY > maxSyDown) continue;
          if (camY - sy > maxSyUp) continue;
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
          h: p.y / HEIGHT_UNIT,
          biome: 0,
          water: false,
        });
      }
      const liveMobs = field.mobs.filter((m) => m.alive || m.hurtT > 0);
      for (let i = 0; i < liveMobs.length; i++) {
        const m = liveMobs[i]!;
        items.push({
          d: depth(m.x, m.z) + 0.02,
          kind: "mob",
          i,
          x: m.x,
          z: m.z,
          h: m.y / HEIGHT_UNIT,
          biome: 0,
          water: false,
        });
      }
      const liveRocks = field.rocks.filter((r) => r.alive);
      for (let i = 0; i < liveRocks.length; i++) {
        const r = liveRocks[i]!;
        items.push({
          d: depth(r.x, r.z) + 0.04,
          kind: "rock",
          i,
          x: r.x,
          z: r.z,
          h: r.y / HEIGHT_UNIT,
          biome: 0,
          water: false,
        });
      }
      const liveCoins = field.coins.filter((c) => c.alive);
      for (let i = 0; i < liveCoins.length; i++) {
        const c = liveCoins[i]!;
        items.push({
          d: depth(c.x, c.z) + 0.03,
          kind: "coin",
          i,
          x: c.x,
          z: c.z,
          h: c.y / HEIGHT_UNIT,
          biome: 0,
          water: false,
        });
      }
      const isActor = (it: Item) =>
        it.kind === "player" || it.kind === "mob" || it.kind === "rock" || it.kind === "coin";
      const hidesActor = (it: Item, subject: Item) => {
        if (it.kind === "prop") return it.d > subject.d;
        if (isActor(it)) return false;
        if (it.d <= subject.d + 0.08) return false;
        if (it.water) return false;
        return it.h > subject.h + 1.05;
      };
      items.sort((a, b) => {
        const aA = isActor(a);
        const bA = isActor(b);
        if (aA !== bA) {
          const subject = aA ? a : b;
          const other = aA ? b : a;
          if (hidesActor(other, subject)) return aA ? -1 : 1;
          return aA ? 1 : -1;
        }
        return a.d - b.d || a.h - b.h;
      });

      for (const it of items) {
        if (it.kind === "tile") paint.drawBlock(it.x, it.z, it.h, it.biome, it.water, t);
        else if (it.kind === "prop") paint.drawProp(props[it.i]!);
        else if (it.kind === "mob") paint.drawMob(liveMobs[it.i]!);
        else if (it.kind === "rock") paint.drawRock(liveRocks[it.i]!);
        else if (it.kind === "coin") paint.drawCoin(liveCoins[it.i]!, t);
        else paint.drawExplorer(player, t);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        if (s.life > 0) paint.drawSpark(s.x, s.z, s.y, s.life);
      }
      ctx.restore();

      if (player.hurtT > 0) {
        ctx.fillStyle = `rgba(140, 36, 28, ${Math.min(0.26, player.hurtT * 0.7)})`;
        ctx.fillRect(0, 0, cssW, cssH);
      }
      if (field.idleT > 1.2) {
        const a = Math.min(0.2, (field.idleT - 1.2) * 0.05);
        ctx.fillStyle = `rgba(48, 16, 14, ${a})`;
        ctx.fillRect(0, 0, cssW, cssH);
      }
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
          const pending = useGame.getState().pendingBuy;
          if (pending) {
            if (tryBuy(player, field, pending)) audio.buy();
            useGame.getState().clearBuy();
          }
          if (sample.throwPressed && throwRock(world, field, player)) {
            audio.throw();
          }
          const ev = stepMobs(world, field, player, FIXED_DT);
          if (ev.playerDamage > 0) {
            audio.hurt();
            trauma = Math.min(1, trauma + 0.48);
          }
          if (ev.hits > 0) {
            audio.hit();
            trauma = Math.min(1, trauma + 0.12);
          }
          if (ev.kills > 0) {
            audio.kill();
            trauma = Math.min(1, trauma + 0.28);
          }
          if (ev.coins > 0) audio.coin();
          if (ev.explosions.length > 0) {
            audio.explode();
            trauma = Math.min(1, trauma + 0.78);
            for (const boom of ev.explosions) {
              for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
                const sp = 2.1 + Math.random() * 3.6;
                sparks.push({
                  x: boom.x,
                  z: boom.z,
                  y: 0.55,
                  vx: Math.cos(a) * sp,
                  vz: Math.sin(a) * sp,
                  vy: 3.1 + Math.random() * 4.4,
                  life: 0.5 + Math.random() * 0.4,
                });
              }
            }
          }
          for (let i = sparks.length - 1; i >= 0; i--) {
            const s = sparks[i]!;
            s.life -= FIXED_DT;
            s.x += s.vx * FIXED_DT;
            s.z += s.vz * FIXED_DT;
            s.y += s.vy * FIXED_DT;
            s.vy -= 13 * FIXED_DT;
            if (s.life <= 0 || s.y < -0.4) sparks.splice(i, 1);
          }
          if (player.hp <= 0) {
            die();
            audio.fall();
          }
          if (player.hops > hops) audio.jump();
          if (player.grounded && !wasGrounded && player.landPulse > 0) audio.land();
          hops = player.hops;
          wasGrounded = player.grounded;
          acc -= FIXED_DT;
          steps += 1;
        }
        const cssW0 = canvas.clientWidth || window.innerWidth;
        const cssH0 = canvas.clientHeight || window.innerHeight;
        const keep = Math.ceil(viewRadius(cssW0, cssH0) / CHUNK_SIZE) + 2;
        if (steps > 0) {
          pruneChunks(world, player.x, player.z, keep);
          pruneMobs(field, player.x, player.z, keep);
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
          hint:
            player.hintT > 0 && player.hint === "ledge"
              ? "ledge"
              : field.idleT > 1.25
                ? "still"
                : "none",
          grounded: player.grounded,
          onWater: player.onWater,
          hp: player.hp,
          maxHp: player.maxHp,
          coins: player.coins,
          speedLv: player.speedLv,
          atkLv: player.atkLv,
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
  }, [seed, sex]);

  return (
    <canvas
      ref={canvasRef}
      className="iso-canvas"
      aria-label="Ridgefold isometric land"
    />
  );
}
