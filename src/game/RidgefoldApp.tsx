import { IsoView } from "./IsoView";
import { Overlay } from "./Overlay";
import { useGame } from "./store";

export function RidgefoldApp() {
  const seed = useGame((s) => s.seed);
  const runId = useGame((s) => s.runId);
  const sex = useGame((s) => s.sex);
  return (
    <main className="app">
      <IsoView key={`${seed}:${runId}:${sex}`} seed={seed} sex={sex} />
      <Overlay />
    </main>
  );
}
