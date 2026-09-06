import { useEffect, useRef, useState, type ReactNode } from "react";
import { Axe, Compass, Coins, Mountain, Pause, Play, RotateCcw, RotateCw, Swords, Waves, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_ATK_LV, MAX_SCYTHE_LV, MAX_SPEED_LV, PLAYER_MAX_HP, SHOP_COST } from "./constants";
import { ATK_NAME, SCYTHE_NAME } from "./mobs";
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

function FoldMarket() {
  const coins = useGame((s) => s.hud.coins);
  const speedLv = useGame((s) => s.hud.speedLv);
  const atkLv = useGame((s) => s.hud.atkLv);
  const scytheLv = useGame((s) => s.hud.scytheLv);
  const buy = useGame((s) => s.buy);
  const phase = useGame((s) => s.phase);
  if (phase !== "playing") return null;
  if (coins < SHOP_COST) return null;
  const speedMax = speedLv >= MAX_SPEED_LV;
  const atkMax = atkLv >= MAX_ATK_LV;
  const scytheMax = scytheLv >= MAX_SCYTHE_LV;
  if (speedMax && atkMax && scytheMax) return null;
  const nextAtk = ATK_NAME[Math.min(MAX_ATK_LV, atkLv + 1)] ?? "cataclysm";
  const nextScythe = SCYTHE_NAME[Math.min(MAX_SCYTHE_LV, scytheLv + 1)] ?? "eclipse";
  return (
    <div className="market">
      <p className="market-kicker">Fold market · {SHOP_COST}</p>
      <div className="market-row">
        <button type="button" className="market-btn" disabled={speedMax} onClick={() => buy("speed")}>
          <span className="market-title">
            <Wind size={14} />
            Swift
          </span>
          <span className="market-sub">{speedMax ? "maxed" : `speed ${speedLv + 1}`}</span>
        </button>
        <button type="button" className="market-btn" disabled={atkMax} onClick={() => buy("attack")}>
          <span className="market-title">
            <Swords size={14} />
            Strike
          </span>
          <span className="market-sub">{atkMax ? "maxed" : nextAtk}</span>
        </button>
        <button type="button" className="market-btn" disabled={scytheMax} onClick={() => buy("scythe")}>
          <span className="market-title">
            <Axe size={14} />
            Reap
          </span>
          <span className="market-sub">{scytheMax ? "maxed" : nextScythe}</span>
        </button>
      </div>
    </div>
  );
}

function SexPicker() {
  const sex = useGame((s) => s.sex);
  const setSex = useGame((s) => s.setSex);
  return (
    <div className="sex">
      <p className="sex-label">Who are you</p>
      <div className="sex-row" role="group" aria-label="Wanderer">
        <button
          type="button"
          className={sex === "female" ? "sex-btn on" : "sex-btn"}
          aria-pressed={sex === "female"}
          onClick={() => setSex("female")}
        >
          Female
        </button>
        <button
          type="button"
          className={sex === "male" ? "sex-btn on" : "sex-btn"}
          aria-pressed={sex === "male"}
          onClick={() => setSex("male")}
        >
          Male
        </button>
      </div>
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

  useEffect(() => {
    try {
      if (sessionStorage.getItem("ridgefold-wanderer-ui") === "3") return;
      sessionStorage.setItem("ridgefold-wanderer-ui", "3");
      const p = useGame.getState().phase;
      if (p !== "title") useGame.getState().toTitle();
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="overlay">
      {phase === "title" && (
        <div className="shade title">
          <div className="card">
            <p className="kicker">Endless isometric wander</p>
            <h1 className="title">Ridgefold</h1>
            <SexPicker />
            <p className="lede">
              Rocks throw themselves. Hosts come in slow rings, walls, and
              orbits. A hundred gold buys Swift, Strike, or a circling scythe.
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
              WASD match the screen. Space jumps. F throws a rock. Q / E turns.
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
                <span className="coin-stat">
                  <Coins size={14} />
                  {hud.coins}
                </span>
                {hud.wave > 0 && <span className="subtle">wave {hud.wave}</span>}
                {hud.onWater && (
                  <span className="muted">
                    <Waves size={14} />
                    lake
                  </span>
                )}
              </div>
              <HealthPips hp={hud.hp} maxHp={hud.maxHp} />
            </div>
            <FoldMarket />
            {hud.hint === "ledge" && <div className="toast">Too steep — jump</div>}
          </div>
          {hud.hint === "still" && (
            <div className="still-banner">
              Keep moving — something noticed you
            </div>
          )}
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
            <span>WASD roam · Space jump · F rock · Q/E turn</span>
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
            {(hud.speedLv > 0 || hud.atkLv > 0 || hud.scytheLv > 0) && (
              <p className="pause-copy">
                Swift {hud.speedLv} · Strike {ATK_NAME[hud.atkLv] ?? hud.atkLv}
                {hud.scytheLv > 0 ? ` · Reap ${SCYTHE_NAME[hud.scytheLv]}` : ""}
              </p>
            )}
            <SexPicker />
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
              The land keeps going. You held {hud.coins} gold. Stand up on this
              seed, or take another fold.
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
