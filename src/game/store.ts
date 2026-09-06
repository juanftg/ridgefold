import { create } from "zustand";
import { randomSeedWord } from "./rng";

export type Phase = "title" | "playing" | "paused";

type Hud = {
  seed: string;
  elevation: number;
  hops: number;
  hint: "none" | "ledge";
  grounded: boolean;
  onWater: boolean;
};

type GameState = {
  phase: Phase;
  seed: string;
  hud: Hud;
  setSeed: (s: string) => void;
  play: () => void;
  pause: () => void;
  resume: () => void;
  toTitle: () => void;
  newFold: () => void;
  setHud: (h: Partial<Hud>) => void;
};

const DEFAULT_SEED = "ridge-mist";

export const useGame = create<GameState>((set, get) => ({
  phase: "title",
  seed: DEFAULT_SEED,
  hud: {
    seed: "",
    elevation: 0,
    hops: 0,
    hint: "none",
    grounded: true,
    onWater: false,
  },
  setSeed: (s) => set({ seed: s }),
  play: () => set({ phase: "playing" }),
  pause: () => {
    if (get().phase === "playing") set({ phase: "paused" });
  },
  resume: () => {
    if (get().phase === "paused") set({ phase: "playing" });
  },
  toTitle: () => set({ phase: "title" }),
  newFold: () => set({ seed: randomSeedWord(), phase: "playing" }),
  setHud: (h) => set((s) => ({ hud: { ...s.hud, ...h } })),
}));
