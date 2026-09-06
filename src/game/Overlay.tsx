import { useEffect, useRef, useState, type ReactNode } from "react";
import { Compass, Mountain, Pause, Play, RotateCcw, RotateCw, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAYER_MAX_HP } from "./constants";
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
    <div ref={pad} className="stick" aria-label="Move">
      <div
        className="stick-knob"
        style={{ transform: `translate(${knob.x * 36}px, ${-knob.y * 36}px)` }}
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
      className="jump"
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

function ThrowButton() {
  const press = (v: boolean) => {
    const api = (window as unknown as {
      __ridgeInput?: { setTouchThrow: (v: boolean) => void };
    }).__ridgeInput;
    api?.setTouchThrow(v);
  };
  return (
    <button
      type="button"
      aria-label="Throw rock"
      className="throw"
      onPointerDown={(e) => {
        e.preventDefault();
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
    >
      Rock
    </button>
  );
}

function YawButton({ dir, label, children }: { dir: number; label: string; children: ReactNode }) {
  const press = (v: boolean) => {
    const api = (window as unknown as {
      __ridgeInput?: { setTouchYaw: (v: number) => void };
    }).__ridgeInput;
    api?.setTouchYaw(v ? dir : 0);
  };
  return (
    <button
      type="button"
      aria-label={label}
      className="yaw"
      onPointerDown={(e) => {
        e.preventDefault();
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
    >
      {children}
    </button>
  );
}

function HealthPips({ hp, maxHp }: { hp: number; maxHp: number }) {
  const n = Math.max(1, maxHp || PLAYER_MAX_HP);
  return (
    <div className="hp" aria-label={`Health ${hp} of ${n}`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={i < hp ? "hp-pip on" : "hp-pip"} />
      ))}
    </div>
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
  const revive = useGame((s) => s.revive);
  const hud = useGame((s) => s.hud);
  const hint = hud.hint === "ledge" ? "Too steep \u2014 jump" : null;

  return (
    <div className="overlay">
      {phase === "title" && (
        <div className="shade title">
          <div className="card">
            <p className="kicker">Endless isometric wander</p>
            <h1 className="title">Ridgefold</h1>
            <p className="lede">
              Wide shelves, hill-climb mesas, and lakes at the floor. Hares share
              the fold; wolves hunt. Ten hits and you drop. Fling a rock (F)
              to send a wolf running.
            </p>
            <label className="field">
              Seed
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="seed-input"
                spellCheck={false}
              />
            </label>
            <div className="row">
              <Button className="flex-1" size="lg" onClick={play}>
                Wander
              </Button>
              <Button variant="secondary" size="lg" onClick={() => newFold()}>
                New fold
              </Button>
            </div>
            <p className="hint">
              WASD and arrows always match the screen: up stays up as you rotate
              the camera. Space jumps. F throws a rock. Q / E (or drag) turns.
              Scroll zooms.
            </p>
          </div>
        </div>
      )}

      {phase !== "title" && (
        <>
          <div className="hud">
            <div className="chip">
              <div className="chip-seed">
                <Compass size={14} />
                {hud.seed || seed}
              </div>
              <div className="chip-stats">
                <span className="muted">
                  <Mountain size={14} />
                  {hud.elevation.toFixed(1)}
                </span>
                <span className="subtle">{hud.hops} jumps</span>
                {hud.onWater && (
                  <span className="muted">
                    <Waves size={14} />
                    lake
                  </span>
                )}
              </div>
              <HealthPips hp={hud.hp} maxHp={hud.maxHp} />
            </div>
            {hint && <div className="toast">{hint}</div>}
          </div>
          {phase !== "dead" && (
            <div className="pause-btn">
              <Button
                variant="secondary"
                size="icon"
                aria-label={phase === "paused" ? "Resume" : "Pause"}
                onClick={phase === "paused" ? resume : pause}
              >
                {phase === "paused" ? <Play /> : <Pause />}
              </Button>
            </div>
          )}
          <div className="hint-keys">
            <span>WASD roam \u00b7 Space jump \u00b7 F rock \u00b7 Q/E turn</span>
          </div>
          <div className="touch-bar">
            <TouchStick />
            <div className="actions">
              <div className="yaw-row">
                <YawButton dir={1} label="Turn left">
                  <RotateCcw size={16} />
                </YawButton>
                <YawButton dir={-1} label="Turn right">
                  <RotateCw size={16} />
                </YawButton>
              </div>
              <div className="throw-row">
                <ThrowButton />
                <JumpButton />
              </div>
            </div>
          </div>
        </>
      )}

      {phase === "paused" && (
        <div className="shade pause">
          <div className="card narrow">
            <h2 className="pause-title">Paused</h2>
            <p className="pause-copy">The fold holds still until you wander again.</p>
            <div className="row">
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

      {phase === "dead" && (
        <div className="shade dead">
          <div className="card narrow">
            <p className="kicker">Ten hits</p>
            <h2 className="pause-title">Folded</h2>
            <p className="pause-copy">
              The land keeps going. Stand up on this seed, or take another fold.
            </p>
            <div className="row">
              <Button onClick={revive}>Stand up</Button>
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
