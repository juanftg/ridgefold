import { create } from "zustand";
import { PLAYER_MAX_HP } from "./constants";
import { randomSeedWord } from "./rng";

export type Phase = "title" | "playing" | "paused" | "dead";
export type WandererSex = "female" | "male";

type Hud = {
  seed: string;
  elevation: number;
  hops: number;
  hint: "none" | "ledge" | "still";
  grounded: boolean;
  onWater: boolean;
  hp: number;
  maxHp: number;
};

type GameState = {
  phase: Phase;
  seed: string;
  runId: number;
  sex: WandererSex;
  hud: Hud;
  setSeed: (s: string) => void;
  setSex: (s: WandererSex) => void;
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
const SEX_KEY = "ridgefold-sex";

function readSex(): WandererSex {
  try {
    const v = localStorage.getItem(SEX_KEY);
    if (v === "male" || v === "female") return v;
  } catch {
    /* ignore */
  }
  return "female";
}

export const useGame = create<GameState>((set, get) => ({
  phase: "title",
  seed: DEFAULT_SEED,
  runId: 0,
  sex: typeof window === "undefined" ? "female" : readSex(),
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
  setSex: (sex) => {
    try {
      localStorage.setItem(SEX_KEY, sex);
    } catch {
      /* ignore */
    }
    set({ sex });
  },
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
