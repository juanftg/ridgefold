import { create } from "zustand";
import { PLAYER_MAX_HP } from "./constants";
import { randomSeedWord } from "./rng";

export type Phase = "title" | "playing" | "paused" | "dead";

type Hud = {
  seed: string;
  elevation: number;
  hops: number;
  hint: "none" | "ledge";
  grounded: boolean;
  onWater: boolean;
  hp: number;
  maxHp: number;
};

type GameState = {
  phase: Phase;
  seed: string;
  runId: number;
  hud: Hud;
  setSeed: (s: string) => void;
  play: () => void;
  pause: () => void;
  resume: () => void;
  toTitle: () => void;
  newFold: () => void;
  die: () => void;
  revive: () => void;
  setHud: (h: Partial<Hud>) => void;
};

const DEFAULT_SEED = "ridge-mist";

export const useGame = create<GameState>((set, get) => ({
  phase: "title",
  seed: DEFAULT_SEED,
  runId: 0,
  hud: {
    seed: "",
    elevation: 0,
    hops: 0,
    hint: "none",
    grounded: true,
    onWater: false,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
  },
  setSeed: (s) => set({ seed: s }),
  play: () => set({ phase: "playing" }),
  pause: () => {
    if (get().phase === "playing") set({ phase: "paused" });
  },
  resume: () => {
    if (get().phase === "paused") set({ phase: "playing" });
  },
  toTitle: () =>
    set((s) => ({
      phase: "title",
      runId: s.phase === "dead" ? s.runId + 1 : s.runId,
    })),
  newFold: () => set({ seed: randomSeedWord(), phase: "playing" }),
  die: () => set({ phase: "dead" }),
  revive: () => set({ phase: "playing", runId: get().runId + 1 }),
  setHud: (h) => set((s) => ({ hud: { ...s.hud, ...h } })),
}));
