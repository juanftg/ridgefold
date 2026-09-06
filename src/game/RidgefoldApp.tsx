import { IsoView } from "./IsoView";
import { Overlay } from "./Overlay";
import { useGame } from "./store";

export function RidgefoldApp() {
  const seed = useGame((s) => s.seed);
  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <IsoView key={seed} seed={seed} />
      <Overlay />
    </main>
  );
}
