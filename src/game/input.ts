import { ISO_RIGHT, ISO_UP } from "./constants";

export type SampledInput = {
  moveX: number;
  moveY: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  pausePressed: boolean;
  worldX: number;
  worldZ: number;
};

function radialDeadzone(x: number, y: number, dz = 0.16): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = ((m - dz) / (1 - dz)) / m;
  return { x: x * scale, y: y * scale };
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
  "KeyP",
  "Escape",
]);

export function createInput() {
  const keys = new Set<string>();
  let injected: string[] | null = null;
  let touchX = 0;
  let touchY = 0;
  let touchJump = false;
  let prevJump = false;
  let prevPause = false;

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
  function setKeys(codes: string[]) {
    injected = codes;
  }

  function held(): Set<string> {
    if (injected) return new Set(injected);
    return keys;
  }

  function sample(): SampledInput {
    const k = held();
    let mx = 0;
    let my = 0;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyW") || k.has("ArrowUp")) my += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) my -= 1;

    let padJump = false;
    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() ?? [] : [];
    for (const pad of pads) {
      if (!pad || pad.mapping !== "standard") continue;
      const stick = radialDeadzone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
      mx += stick.x;
      my += stick.y;
      if (pad.buttons[0]?.pressed) padJump = true;
      if (pad.buttons[12]?.pressed) my += 1;
      if (pad.buttons[13]?.pressed) my -= 1;
      if (pad.buttons[14]?.pressed) mx -= 1;
      if (pad.buttons[15]?.pressed) mx += 1;
    }

    mx += touchX;
    my += touchY;
    mx = Math.max(-1, Math.min(1, mx));
    my = Math.max(-1, Math.min(1, my));
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    const jumpHeld = k.has("Space") || touchJump || padJump;
    const jumpPressed = jumpHeld && !prevJump;
    prevJump = jumpHeld;

    const pauseHeld = k.has("Escape") || k.has("KeyP");
    const pausePressed = pauseHeld && !prevPause;
    prevPause = pauseHeld;

    const worldX = ISO_RIGHT.x * mx + ISO_UP.x * my;
    const worldZ = ISO_RIGHT.z * mx + ISO_UP.z * my;

    return {
      moveX: mx,
      moveY: my,
      jumpHeld,
      jumpPressed,
      pausePressed,
      worldX,
      worldZ,
    };
  }

  function dispose() {
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", clear);
  }

  return { sample, setTouchMove, setTouchJump, setKeys, held, dispose };
}

export type InputController = ReturnType<typeof createInput>;
