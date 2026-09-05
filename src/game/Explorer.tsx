import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { Player } from "./sim";

export function Explorer({ player }: { player: Player }) {
  const group = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(player.x, player.y, player.z);
    g.rotation.y = player.yaw;
    const s = player.squash;
    g.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    const swing = player.grounded ? Math.sin(player.walkPhase) * 0.45 : 0.15;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
  });

  return (
    <group ref={group} castShadow>
      <mesh position={[0, 0.62, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.34, 6, 10]} />
        <meshStandardMaterial color="#3d4540" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.02, 0.02]} castShadow>
        <sphereGeometry args={[0.175, 14, 12]} />
        <meshStandardMaterial color="#e8dcc8" roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.12, -0.02]} rotation={[0.15, 0, 0]} castShadow>
        <sphereGeometry args={[0.19, 12, 10]} />
        <meshStandardMaterial color="#2c3330" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.7, -0.16]} castShadow>
        <boxGeometry args={[0.22, 0.26, 0.12]} />
        <meshStandardMaterial color="#4f5b54" roughness={0.7} />
      </mesh>
      <group ref={leftLeg} position={[-0.09, 0.34, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.22, 4, 8]} />
          <meshStandardMaterial color="#2a302c" roughness={0.75} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.09, 0.34, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.22, 4, 8]} />
          <meshStandardMaterial color="#2a302c" roughness={0.75} />
        </mesh>
      </group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.34, 16]} />
        <meshBasicMaterial color="#1a1f1c" transparent opacity={0.28} />
      </mesh>
    </group>
  );
}
