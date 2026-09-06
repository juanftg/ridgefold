import { useEffect, useRef, useState } from "react";
import { Compass, Mountain, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "./store";

function TouchStick() {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  useEffect(() => {
    const el = pad.current;
    if (!el) return;

    const setMove = (x: number, y: number) => {
      const api = (window as unknown as {
        __ridgeInput?: { setTouchMove: (x: number, y: number) => void };
      }).__ridgeInput;
      api?.setTouchMove(x, y);
    };

    const read = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let x = (clientX - cx) / (r.width * 0.42);
      let y = (cy - clientY) / (r.height * 0.42);
      const m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m;
      }
      setKnob({ x, y });
      setMove(x, y);
    };

    const down = (e: PointerEvent) => {
      active.current = e.pointerId;
      el.setPointerCapture(e.pointerId);
      read(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (active.current !== e.pointerId) return;
      read(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (active.current !== e.pointerId) return;
      active.current = null;
      setKnob({ x: 0, y: 0 });
      setMove(0, 0);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div
      ref={pad}
      className="relative size-32 touch-none rounded-full border border-border bg-surface/70"
      aria-label="Move"
    >
      <div
        className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/80"
        style={{
          transform: `translate(calc(-50% + ${knob.x * 36}px), calc(-50% + ${-knob.y * 36}px))`,
        }}
      />
    </div>
  );
}

function JumpButton() {
  const press = (v: boolean) => {
    const api = (window as unknown as {
      __ridgeInput?: { setTouchJump: (v: boolean) => void };
    }).__ridgeInput;
    api?.setTouchJump(v);
  };
  return (
    <button
      type="button"
      aria-label="Jump"
      className="size-16 touch-none rounded-full border border-border bg-accent text-accent-fg text-xs font-medium tracking-wide"
      onPointerDown={(e) => {
        e.preventDefault();
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
    >
      Jump
    </button>
  );
}

export function Overlay() {
  const phase = useGame((s) => s.phase);
  const seed = useGame((s) => s.seed);
  const setSeed = useGame((s) => s.setSeed);
  const play = useGame((s) => s.play);
  const pause = useGame((s) => s.pause);
  const resume = useGame((s) => s.resume);
  const toTitle = useGame((s) => s.toTitle);
  const newFold = useGame((s) => s.newFold);
  const hud = useGame((s) => s.hud);

  const hint =
    hud.hint === "gap"
      ? "The fold breaks here"
      : hud.hint === "ledge"
        ? "Too steep — jump"
        : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-fg">
      {phase === "title" && (
        <div className="pointer-events-auto flex h-full flex-col items-center justify-center bg-bg/30 px-6">
          <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-6 shadow-lg sm:p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-fg-muted">
              Isometric wander
            </p>
            <h1 className="font-display mt-3 text-4xl font-medium leading-tight tracking-display sm:text-5xl">
              Ridgefold
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-fg-muted">
              Hills rise and fall underfoot. Jump the ledges you cannot walk.
              Where the land splits, you stop.
            </p>
            <label className="mt-6 block text-xs font-medium text-fg-muted">
              Seed
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="mt-2 h-11 w-full rounded-[var(--radius-md)] border border-border bg-bg px-3 font-mono text-sm text-fg outline-none ring-ring focus:ring-2"
                spellCheck={false}
              />
            </label>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" size="lg" onClick={play}>
                Wander
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  newFold();
                }}
              >
                New fold
              </Button>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-fg-subtle">
              WASD or arrows move on screen. Space jumps. Gaps cannot be walked;
              a short leap can clear a one-tile break or a high step.
            </p>
          </div>
        </div>
      )}

      {phase !== "title" && (
        <>
          <div className="pointer-events-auto absolute left-4 top-4 flex max-w-[calc(100%-6rem)] flex-col gap-2 sm:left-6 sm:top-6">
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface/80 px-3 py-2 backdrop-blur-sm">
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-fg">
                <Compass className="size-3.5" />
                {hud.seed || seed}
              </div>
              <div className="mt-1 flex items-center gap-3 text-sm tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                  <Mountain className="size-3.5" />
                  {hud.elevation.toFixed(1)}
                </span>
                <span className="text-fg-subtle">{hud.hops} jumps</span>
              </div>
            </div>
            {hint && (
              <div className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-fg">
                {hint}
              </div>
            )}
          </div>
          <div className="pointer-events-auto absolute right-4 top-4 sm:right-6 sm:top-6">
            <Button
              variant="secondary"
              size="icon"
              aria-label={phase === "paused" ? "Resume" : "Pause"}
              onClick={phase === "paused" ? resume : pause}
            >
              {phase === "paused" ? <Play /> : <Pause />}
            </Button>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-5 hidden justify-center sm:flex">
            <p className="rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-fg-muted">
              WASD roam · Space jump · Esc pause
            </p>
          </div>
          <div className="pointer-events-auto absolute bottom-5 left-4 right-4 flex items-end justify-between sm:hidden">
            <TouchStick />
            <JumpButton />
          </div>
        </>
      )}

      {phase === "paused" && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-bg/60 px-6">
          <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-border bg-surface p-6">
            <h2 className="font-display text-2xl font-medium tracking-display">
              Paused
            </h2>
            <p className="mt-2 text-sm text-fg-muted">
              The fold holds still until you wander again.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button onClick={resume}>Resume</Button>
              <Button variant="secondary" onClick={newFold}>
                New fold
              </Button>
              <Button variant="ghost" onClick={toTitle}>
                Title
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
