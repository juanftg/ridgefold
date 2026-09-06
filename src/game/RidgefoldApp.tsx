import { IsoView } from "./IsoView";
import { Overlay } from "./Overlay";
import { useGame } from "./store";

export function RidgefoldApp() {
  const seed = useGame((s) => s.seed);
  const runId = useGame((s) => s.runId);
  return (
    <main className="app">
      <IsoView key={`${seed}:${runId}`} seed={seed} />
      <Overlay />
    </main>
  );
}
