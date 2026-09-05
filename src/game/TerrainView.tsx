import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BIOME_SIDE, BIOME_TOP, HEIGHT_UNIT, TILE } from "./constants";
import type { Player } from "./sim";
import { gridToWorld, scatterProps, type World } from "./terrain";

type Item = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
};

function PackedInstances({
  items,
  color,
  children,
  castShadow,
  receiveShadow,
  roughness = 0.88,
}: {
  items: Item[];
  color: string;
  children: ReactNode;
  castShadow?: boolean;
  receiveShadow?: boolean;
  roughness?: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = Math.max(items.length, 1);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const list = items.length ? items : [{ x: 0, y: -40, z: 0, sx: 0.001, sy: 0.001, sz: 0.001, rx: 0, ry: 0, rz: 0 }];
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.scale.set(it.sx, it.sy, it.sz);
      dummy.rotation.set(it.rx, it.ry, it.rz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.count = list.length;
  }, [items, dummy]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      {children}
      <meshStandardMaterial color={color} roughness={roughness} />
    </instancedMesh>
  );
}

function byColor(items: (Item & { color: string })[]) {
  const map = new Map<string, Item[]>();
  for (const it of items) {
    const list = map.get(it.color) ?? [];
    list.push(it);
    map.set(it.color, list);
  }
  return [...map.entries()];
}

export function TerrainView({ world }: { world: World }) {
  const groups = useMemo(() => {
    const columns: (Item & { color: string })[] = [];
    const caps: (Item & { color: string })[] = [];
    for (let z = 0; z < world.size; z++) {
      for (let x = 0; x < world.size; x++) {
        const cell = world.cells[z * world.size + x]!;
        if (!cell.solid) continue;
        const [wx, wz] = gridToWorld(x, z, world.size);
        const h = Math.max(HEIGHT_UNIT * 0.85, cell.h * HEIGHT_UNIT + HEIGHT_UNIT * 0.55);
        columns.push({
          x: wx,
          y: h / 2,
          z: wz,
          sx: 1,
          sy: h,
          sz: 1,
          rx: 0,
          ry: 0,
          rz: 0,
          color: BIOME_SIDE[cell.biome]!,
        });
        caps.push({
          x: wx,
          y: h + 0.03,
          z: wz,
          sx: 1,
          sy: 1,
          sz: 1,
          rx: 0,
          ry: 0,
          rz: 0,
          color: BIOME_TOP[cell.biome]!,
        });
      }
    }
    const props = scatterProps(world);
    const pines: Item[] = props
      .filter((p) => p.kind === "pine")
      .map((p) => ({
        x: p.x,
        y: p.y + 0.42 * p.scale,
        z: p.z,
        sx: p.scale,
        sy: p.scale,
        sz: p.scale,
        rx: 0,
        ry: p.rot,
        rz: 0,
      }));
    const rocks: Item[] = props
      .filter((p) => p.kind === "rock")
      .map((p) => ({
        x: p.x,
        y: p.y + p.scale * 0.45,
        z: p.z,
        sx: p.scale,
        sy: p.scale,
        sz: p.scale,
        rx: 0.3,
        ry: p.rot,
        rz: 0.2,
      }));
    return {
      columnGroups: byColor(columns),
      capGroups: byColor(caps),
      pines,
      rocks,
    };
  }, [world]);

  return (
    <group>
      {groups.columnGroups.map(([color, items]) => (
        <PackedInstances key={`c-${color}`} items={items} color={color} castShadow receiveShadow roughness={0.92}>
          <boxGeometry args={[TILE * 0.96, 1, TILE * 0.96]} />
        </PackedInstances>
      ))}
      {groups.capGroups.map(([color, items]) => (
        <PackedInstances key={`t-${color}`} items={items} color={color} receiveShadow roughness={0.78}>
          <boxGeometry args={[TILE * 0.98, 0.07, TILE * 0.98]} />
        </PackedInstances>
      ))}
      <PackedInstances items={groups.pines} color="#3d5c45" castShadow roughness={0.85}>
        <coneGeometry args={[0.22, 0.85, 6]} />
      </PackedInstances>
      <PackedInstances items={groups.rocks} color="#7a746c" castShadow roughness={0.9}>
        <icosahedronGeometry args={[1, 0]} />
      </PackedInstances>
    </group>
  );
}

export function TileGlow({ player }: { player: Player }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.position.set(player.x, player.y + 0.045, player.z);
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.28, 0.4, 20]} />
      <meshBasicMaterial color="#d7ddd6" transparent opacity={0.55} />
    </mesh>
  );
}
