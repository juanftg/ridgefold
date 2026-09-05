import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Overlay } from "./Overlay";
import { WorldScene } from "./Scene";
import { useGame } from "./store";

export function RidgefoldApp() {
  const [mounted, setMounted] = useState(false);
  const seed = useGame((s) => s.seed);
  const play = useGame((s) => s.play);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    if (params.has("qa") || params.get("autostart") === "1") play();
  }, [play]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg">
      {mounted ? (
        <Canvas
          orthographic
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
          camera={{
            position: [14, 14, 14],
            zoom: 44,
            near: -80,
            far: 200,
          }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 0, 0);
          }}
          style={{ touchAction: "none" }}
        >
          <WorldScene key={seed} seed={seed} />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center font-display text-2xl text-fg">
          Ridgefold
        </div>
      )}
      <Overlay />
    </main>
  );
}
