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
  role: ThoughtNode["semanticRole"];
  stage: ThoughtNode["chainStage"];
  order: number;
}
type SimLink = SimulationLinkDatum<SimNode>;

/**
 * 非响应式逐帧位置表：3D 组件在 useFrame 里读取它直接移动网格，
 * 避免力导向每一帧都触发 React 重渲染。
 */
export const positionsRef: { current: Map<string, THREE.Vector3> } = {
  current: new Map(),
};

/** 2D 平面视图的独立布局缓存；不会覆盖节点原有 Z 深度。 */
export const planarPositionsRef: { current: Map<string, THREE.Vector3> } = {
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

export function syncPlanarPositions(nodes: ThoughtNode[]): void {
  const map = planarPositionsRef.current;
  const validIds = new Set(nodes.map((node) => node.id));
  for (const id of map.keys()) {
    if (!validIds.has(id)) map.delete(id);
  }
  nodes.forEach((node, index) => {
    if (map.has(node.id)) return;
    const offset = index === 0 ? 0 : ((index % 6) - 2.5) * 0.35;
    map.set(node.id, new THREE.Vector3(node.position.x + offset, node.position.y - offset, 0));
  });
}

export function startLayout(
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  relayout: boolean,
  onEnd: (positions: Record<string, Vec3>) => void,
): { stop: () => void } {
  activeSimulation?.stop();

  const simNodes: SimNode[] = nodes.map((n, order) => {
    const semanticPosition = (): Vec3 => {
      if (n.semanticRole === "root") return { x: 0, y: 0, z: 0 };
      if (n.semanticRole === "horizontal") return { x: ((order % 5) - 2) * 6, y: 7, z: 0 };
      if (n.semanticRole === "vertical") {
        const x = n.chainStage === "upstream" ? -11 : n.chainStage === "downstream" ? 11 : 0;
        const y = n.chainStage === "support" ? -7 : 0;
        return { x, y, z: ((order % 4) - 1.5) * 4 };
      }
      return randomPos();
    };
    const p = relayout ? semanticPosition() : n.position;
    const pinned = !relayout && n.isPositionPinned;
    return {
      id: n.id,
      role: n.semanticRole,
      stage: n.chainStage,
      order,
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
    .force("x", forceX(0).strength(0.035))
    .force("y", forceY(0).strength(0.035))
    .force("z", forceZ(0).strength(0.035))
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

export function startPlanarLayout(
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  relayout: boolean,
  onEnd: () => void,
): { stop: () => void } {
  activeSimulation?.stop();
  syncPlanarPositions(nodes);

  const simNodes: SimNode[] = nodes.map((node, order) => {
    const cached = planarPositionsRef.current.get(node.id);
    const angle = order * 2.399963;
    const radius = 3.8 * Math.sqrt(order);
    const x = relayout ? Math.cos(angle) * radius : (cached?.x ?? node.position.x);
    const y = relayout ? Math.sin(angle) * radius : (cached?.y ?? node.position.y);
    return {
      id: node.id,
      role: node.semanticRole,
      stage: node.chainStage,
      order,
      x,
      y,
      z: 0,
      fx: !relayout && node.isPositionPinned ? x : null,
      fy: !relayout && node.isPositionPinned ? y : null,
      fz: 0,
    };
  });
  const simLinks: SimLink[] = edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  }));
  activeNodes = simNodes;

  const sim = forceSimulation<SimNode>(simNodes, 2)
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((node) => node.id)
        .distance(13)
        .strength(0.28),
    )
    .force("charge", forceManyBody().strength(-28))
    .force("center", forceCenter(0, 0, 0))
    .force("x", forceX(0).strength(0.025))
    .force("y", forceY(0).strength(0.025))
    .force("collide", forceCollide().radius(4.2).strength(0.88))
    .alpha(1)
    .alphaDecay(0.065);

  sim.on("tick", () => {
    for (const node of simNodes) {
      let position = planarPositionsRef.current.get(node.id);
      if (!position) {
        position = new THREE.Vector3();
        planarPositionsRef.current.set(node.id, position);
      }
      position.set(node.x ?? 0, node.y ?? 0, 0);
    }
  });
  sim.on("end", onEnd);
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
