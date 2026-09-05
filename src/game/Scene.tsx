import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Explorer } from "./Explorer";
import { TerrainView, TileGlow } from "./TerrainView";
import { createAudio } from "./audio";
import { FIXED_DT, HEIGHT_UNIT } from "./constants";
import { createInput, type InputController } from "./input";
import { playerSpeed, spawnPlayer, stepPlayer, type Player } from "./sim";
import { useGame } from "./store";
import { generateWorld, worldToGrid, type World } from "./terrain";

type Probe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys: (codes: string[]) => void;
  getPos: () => { x: number; y: number; z: number; grounded: boolean };
};

declare global {
  interface Window {
    __controlsTest?: Probe;
    __ridgefold?: Probe;
  }
}

function CameraRig({ player }: { player: Player }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const k = 1 - Math.exp(-5.2 * dt);
    desired.current.set(player.x + 16, player.y + 16, player.z + 16);
    camera.position.lerp(desired.current, k);
    look.current.set(player.x, player.y + 0.6, player.z);
    camera.lookAt(look.current);
    if (camera instanceof THREE.OrthographicCamera) {
    const targetZoom = 44;
      camera.zoom += (targetZoom - camera.zoom) * k;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function Dust({ player }: { player: Player }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bits = useRef(
    Array.from({ length: 28 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
    })),
  );
  const lastPulse = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    if (player.landPulse > 0.12 && lastPulse.current <= 0.12) {
      let spawned = 0;
      for (const b of bits.current) {
        if (b.life > 0) continue;
        const a = Math.random() * Math.PI * 2;
        b.x = player.x;
        b.y = player.y + 0.05;
        b.z = player.z;
        b.vx = Math.cos(a) * (1.2 + Math.random());
        b.vz = Math.sin(a) * (1.2 + Math.random());
        b.vy = 1.4 + Math.random();
        b.life = 0.35 + Math.random() * 0.2;
        spawned += 1;
        if (spawned >= 8) break;
      }
    }
    lastPulse.current = player.landPulse;
    const m = mesh.current;
    if (!m) return;
    bits.current.forEach((b, i) => {
      if (b.life > 0) {
        b.life -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.vy -= 6 * dt;
        dummy.position.set(b.x, b.y, b.z);
        const s = Math.max(0.02, b.life * 0.35);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.position.set(0, -20, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      }
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, 28]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#c4b89a" transparent opacity={0.7} />
    </instancedMesh>
  );
}

function SimLoop({
  world,
  player,
  input,
}: {
  world: World;
  player: Player;
  input: InputController;
}) {
  const acc = useRef(0);
  const hudTick = useRef(0);
  const setHud = useGame((s) => s.setHud);
  const phase = useGame((s) => s.phase);
  const pause = useGame((s) => s.pause);
  const audio = useRef(createAudio());
  const wasGrounded = useRef(true);
  const lastHint = useRef(player.hintT);
  const unlocked = useRef(false);

  useEffect(() => {
    const probe: Probe = {
      getYaw: () => player.yaw,
      getSpeed: () => playerSpeed(player),
      setKeys: (codes) => input.setKeys(codes),
      getPos: () => ({
        x: player.x,
        y: player.y,
        z: player.z,
        grounded: player.grounded,
      }),
    };
    window.__controlsTest = probe;
    window.__ridgefold = probe;
    return () => {
      if (window.__controlsTest === probe) delete window.__controlsTest;
      if (window.__ridgefold === probe) delete window.__ridgefold;
    };
  }, [input, player]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    if (phase !== "playing") {
      acc.current = 0;
      return;
    }
    if (!unlocked.current) {
      audio.current.unlock();
      unlocked.current = true;
    }
    acc.current += d;
    let steps = 0;
    while (acc.current >= FIXED_DT && steps < 5) {
      const sample = input.sample();
      if (sample.pausePressed) pause();
      const hops = player.hops;
      const fallen = player.fallen;
      stepPlayer(world, player, sample, FIXED_DT);
      if (player.hops > hops) audio.current.jump();
      if (player.fallen > fallen) audio.current.fall();
      if (player.grounded && !wasGrounded.current && player.landPulse > 0) {
        audio.current.land();
      }
      if (player.hintT > lastHint.current && player.hint !== "none") {
        audio.current.bump();
      }
      wasGrounded.current = player.grounded;
      lastHint.current = player.hintT;
      acc.current -= FIXED_DT;
      steps += 1;
    }

    hudTick.current += d;
    if (hudTick.current > 0.12) {
      hudTick.current = 0;
      const [gx, gz] = worldToGrid(player.x, player.z, world.size);
      setHud({
        seed: world.seed,
        elevation: Math.round((player.y / HEIGHT_UNIT) * 10) / 10,
        hops: player.hops,
        hint: player.hintT > 0 ? player.hint : "none",
        grounded: player.grounded,
      });
      void gx;
      void gz;
    }
  });

  return null;
}

export function WorldScene({ seed }: { seed: string }) {
  const world = useMemo(() => generateWorld(seed), [seed]);
  const player = useMemo(() => spawnPlayer(world), [world]);
  const input = useMemo(() => createInput(), []);

  useEffect(() => {
    const api = {
      setTouchMove: input.setTouchMove,
      setTouchJump: input.setTouchJump,
    };
    (window as unknown as { __ridgeInput?: typeof api }).__ridgeInput = api;
    return () => {
      input.dispose();
      delete (window as unknown as { __ridgeInput?: typeof api }).__ridgeInput;
    };
  }, [input]);

  return (
    <>
      <color attach="background" args={["#8d9aa0"]} />
      <fog attach="fog" args={["#8d9aa0", 34, 78]} />
      <hemisphereLight args={["#dce6ea", "#6a7a62", 1.05]} />
      <ambientLight intensity={0.42} />
      <directionalLight
        position={[18, 28, 8]}
        intensity={1.55}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.2, 0]} receiveShadow>
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color="#4a5558" roughness={1} />
      </mesh>
      <TerrainView world={world} />
      <Explorer player={player} />
      <TileGlow player={player} />
      <Dust player={player} />
      <CameraRig player={player} />
      <SimLoop world={world} player={player} input={input} />
    </>
  );
}
