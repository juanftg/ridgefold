import { ISO_RIGHT, ISO_UP } from "./constants";

export type SampledInput = {
  moveX: number;
  moveY: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  throwPressed: boolean;
  pausePressed: boolean;
  yawRate: number;
  worldX: number;
  worldZ: number;
};

function radialDeadzone(x: number, y: number, dz = 0.16): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = ((m - dz) / (1 - dz)) / m;
  return { x: x * scale, y: y * scale };
}

function rotateXZ(x: number, z: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}

export function screenToWorld(mx: number, my: number, camYaw: number): { worldX: number; worldZ: number } {
  const [rx, rz] = rotateXZ(ISO_RIGHT.x, ISO_RIGHT.z, -camYaw);
  const [ux, uz] = rotateXZ(ISO_UP.x, ISO_UP.z, -camYaw);
  return { worldX: rx * mx + ux * my, worldZ: rz * mx + uz * my };
}

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyF",
  "KeyP",
  "Escape",
  "KeyQ",
  "KeyE",
  "BracketLeft",
  "BracketRight",
  "Comma",
  "Period",
]);

export function createInput() {
  const keys = new Set<string>();
  let injected: string[] | null = null;
  let touchX = 0;
  let touchY = 0;
  let touchJump = false;
  let touchThrow = false;
  let touchYaw = 0;
  let prevJump = false;
  let prevThrow = false;
  let prevPause = false;
  let camYaw = 0;

  const onDown = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code)) e.preventDefault();
    keys.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const clear = () => keys.clear();

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clear();
    });
  }

  function setTouchMove(x: number, y: number) {
    touchX = x;
    touchY = y;
  }
  function setTouchJump(v: boolean) {
    touchJump = v;
  }
  function setTouchThrow(v: boolean) {
    touchThrow = v;
  }
  function setTouchYaw(v: number) {
    touchYaw = v;
  }
  function setKeys(codes: string[]) {
    injected = codes;
  }
  function setCamYaw(v: number) {
    camYaw = v;
  }
  function getCamYaw() {
    return camYaw;
  }

  function held(): Set<string> {
    if (injected) return new Set(injected);
    return keys;
  }

  function sample(): SampledInput {
    const k = held();
    let mx = 0;
    let my = 0;
    let yawRate = touchYaw;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyW") || k.has("ArrowUp")) my += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) my -= 1;
    if (k.has("KeyQ") || k.has("BracketLeft") || k.has("Comma")) yawRate += 1;
    if (k.has("KeyE") || k.has("BracketRight") || k.has("Period")) yawRate -= 1;

    let padJump = false;
    let padThrow = false;
    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() ?? [] : [];
    for (const pad of pads) {
      if (!pad || pad.mapping !== "standard") continue;
      const stick = radialDeadzone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
      mx += stick.x;
      my += stick.y;
      const look = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.18);
      yawRate -= look.x;
      if (pad.buttons[4]?.pressed) yawRate += 1;
      if (pad.buttons[5]?.pressed) yawRate -= 1;
      if (pad.buttons[0]?.pressed) padJump = true;
      if (pad.buttons[2]?.pressed) padThrow = true;
      if (pad.buttons[12]?.pressed) my += 1;
      if (pad.buttons[13]?.pressed) my -= 1;
      if (pad.buttons[14]?.pressed) mx -= 1;
      if (pad.buttons[15]?.pressed) mx += 1;
    }

    mx += touchX;
    my += touchY;
    mx = Math.max(-1, Math.min(1, mx));
    my = Math.max(-1, Math.min(1, my));
    yawRate = Math.max(-1, Math.min(1, yawRate));
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    const jumpHeld = k.has("Space") || touchJump || padJump;
    const jumpPressed = jumpHeld && !prevJump;
    prevJump = jumpHeld;

    const throwHeld = k.has("KeyF") || touchThrow || padThrow;
    const throwPressed = throwHeld && !prevThrow;
    prevThrow = throwHeld;

    const pauseHeld = k.has("Escape") || k.has("KeyP");
    const pausePressed = pauseHeld && !prevPause;
    prevPause = pauseHeld;

    const moved = screenToWorld(mx, my, camYaw);

    return {
      moveX: mx,
      moveY: my,
      jumpHeld,
      jumpPressed,
      throwPressed,
      pausePressed,
      yawRate,
      worldX: moved.worldX,
      worldZ: moved.worldZ,
    };
  }

  function dispose() {
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", clear);
  }

  return {
    sample,
    setTouchMove,
    setTouchJump,
    setTouchThrow,
    setTouchYaw,
    setKeys,
    setCamYaw,
    getCamYaw,
    held,
    dispose,
  };
}

export type InputController = ReturnType<typeof createInput>;
