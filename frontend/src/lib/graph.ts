import * as THREE from "three";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceX,
  forceY,
  forceZ,
  forceCollide,
} from "d3-force-3d";
import type {
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force-3d";
import type { ThoughtNode, ThoughtEdge, Vec3 } from "./types";
import { randomPos } from "./utils";

interface SimNode extends SimulationNodeDatum {
  id: string;
}
type SimLink = SimulationLinkDatum<SimNode>;

/**
 * 非响应式逐帧位置表：3D 组件在 useFrame 里读取它直接移动网格，
 * 避免力导向每一帧都触发 React 重渲染。
 */
export const positionsRef: { current: Map<string, THREE.Vector3> } = {
  current: new Map(),
};

export interface ControlsLike {
  enabled: boolean;
  target: THREE.Vector3;
  update: () => void;
}

/** OrbitControls 实例引用（由画布注入，供拖动时禁用）。 */
export const controlsRef: { current: ControlsLike | null } = {
  current: null,
};

let activeSimulation: Simulation<SimNode, undefined> | null = null;
let activeNodes: SimNode[] = [];

export function syncPositions(nodes: ThoughtNode[]): void {
  const map = positionsRef.current;
  map.clear();
  for (const n of nodes) {
    map.set(n.id, new THREE.Vector3(n.position.x, n.position.y, n.position.z));
  }
}

export function startLayout(
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  relayout: boolean,
  onEnd: (positions: Record<string, Vec3>) => void,
): { stop: () => void } {
  activeSimulation?.stop();

  const simNodes: SimNode[] = nodes.map((n) => {
    const p = relayout ? randomPos() : n.position;
    const pinned = !relayout && n.isPositionPinned;
    return {
      id: n.id,
      x: p.x,
      y: p.y,
      z: p.z,
      fx: pinned ? p.x : null,
      fy: pinned ? p.y : null,
      fz: pinned ? p.z : null,
    };
  });

  const simLinks: SimLink[] = edges.map((e) => ({
    source: e.sourceNodeId,
    target: e.targetNodeId,
  }));

  activeNodes = simNodes;

  const sim = forceSimulation<SimNode>(simNodes, 3)
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(10)
        .strength(0.35),
    )
    .force("charge", forceManyBody().strength(-5))
    .force("center", forceCenter(0, 0, 0))
    .force("x", forceX(0).strength(0.05))
    .force("y", forceY(0).strength(0.05))
    .force("z", forceZ(0).strength(0.05))
    .force("collide", forceCollide().radius(2).strength(0.7))
    .alpha(1)
    .alphaDecay(0.08);

  sim.on("tick", () => {
    const map = positionsRef.current;
    for (const n of simNodes) {
      let v = map.get(n.id);
      if (!v) {
        v = new THREE.Vector3();
        map.set(n.id, v);
      }
      v.set(n.x ?? 0, n.y ?? 0, n.z ?? 0);
    }
  });

  sim.on("end", () => {
    const out: Record<string, Vec3> = {};
    for (const n of simNodes) {
      out[n.id] = { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 };
    }
    onEnd(out);
  });

  activeSimulation = sim;
  sim.restart();

  return { stop: () => sim.stop() };
}

export function stopLayout(): void {
  activeSimulation?.stop();
  activeSimulation = null;
  activeNodes = [];
}

/** 拖动期间锁定节点，避免力导向把它拉回去。 */
export function fixNode(id: string, x: number, y: number, z: number): void {
  const n = activeNodes.find((node) => node.id === id);
  if (!n) return;
  n.fx = x;
  n.fy = y;
  n.fz = z;
  n.x = x;
  n.y = y;
  n.z = z;
  activeSimulation?.alpha(0.3).restart();
}

export function unfixNode(id: string): void {
  const n = activeNodes.find((node) => node.id === id);
  if (!n) return;
  n.fx = null;
  n.fy = null;
  n.fz = null;
}
