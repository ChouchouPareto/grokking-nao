"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import type { AISuggestion, ThoughtEdge, ThoughtNode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { controlsRef, fixNode, positionsRef, startLayout, syncPositions } from "@/lib/graph";

const NODE_COLOR = "#6d6ff2";
const NODE_FOCUS_COLOR = "#a5b4fc";
const NODE_SOURCE_COLOR = "#f5b544";
const EDGE_COLOR = "#5b6472";
const EDGE_DISCOVERY_COLOR = "#f5b544";

export default function Canvas3D() {
  const clearSelection = useStore((s) => s.selectNode);
  const clearEdge = useStore((s) => s.selectEdge);
  const setConnectFrom = useStore((s) => s.setConnectFrom);

  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 30], fov: 55, near: 0.1, far: 1000 }}
        onPointerMissed={() => {
          clearSelection(null);
          clearEdge(null);
          setConnectFrom(null);
        }}
      >
        <color attach="background" args={["#0b0e14"]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[10, 12, 10]} intensity={1.6} />
        <pointLight position={[-12, -8, -12]} intensity={0.6} color="#a5b4fc" />
        <Graph />
        <CameraController />
        <OrbitControls
          ref={(c) => {
            controlsRef.current = c as unknown as (typeof controlsRef)["current"];
          }}
          enableDamping
          dampingFactor={0.08}
          minDistance={6}
          maxDistance={140}
        />
      </Canvas>
    </div>
  );
}

function Graph() {
  const nodes = useStore((s) => s.idea?.nodes ?? []);
  const edges = useStore((s) => s.idea?.edges ?? []);
  const layoutNonce = useStore((s) => s.layoutNonce);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const mode = useStore((s) => s.mode);
  const connectFromId = useStore((s) => s.connectFromId);
  const suggestions = useStore((s) => s.suggestions);

  const nodeIds = nodes.map((n) => n.id).join(",");
  const edgeIds = edges.map((e) => e.id).join(",");

  const prevNonce = useRef(layoutNonce);

  useEffect(() => {
    const relayout = layoutNonce !== prevNonce.current;
    prevNonce.current = layoutNonce;
    syncPositions(nodes);
    return startLayout(nodes, edges, relayout, (positions) => {
      useStore.getState().commitPositions(positions);
      // 布局稳定后自动取景，确保所有节点可见
      useStore.getState().requestGlobalView();
    }).stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIds, edgeIds, layoutNonce]);

  const focusSet = useMemo(() => {
    const set = new Set<string>();
    if (focusedNodeId) {
      set.add(focusedNodeId);
      for (const e of edges) {
        if (e.sourceNodeId === focusedNodeId) set.add(e.targetNodeId);
        if (e.targetNodeId === focusedNodeId) set.add(e.sourceNodeId);
      }
    }
    return set;
  }, [focusedNodeId, edges]);

  const isFocusActive = focusedNodeId !== null;

  return (
    <group>
      {edges.map((edge) => (
        <EdgeMesh
          key={edge.id}
          edge={edge}
          dimmed={
            isFocusActive &&
            edge.sourceNodeId !== focusedNodeId &&
            edge.targetNodeId !== focusedNodeId
          }
          selected={edge.id === selectedEdgeId}
        />
      ))}
      {nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          dimmed={isFocusActive && !focusSet.has(node.id)}
          selected={node.id === selectedNodeId}
          isConnectSource={mode === "connect" && connectFromId === node.id}
          connectMode={mode === "connect"}
        />
      ))}
      {suggestions
        .filter((s) => s.type === "node")
        .map((s) => (
          <CandidateNode key={s.id} suggestion={s} />
        ))}
      {suggestions
        .filter((s) => s.type === "edge")
        .map((s) => (
          <CandidateEdge key={s.id} suggestion={s} />
        ))}
    </group>
  );
}

function NodeMesh({
  node,
  dimmed,
  selected,
  isConnectSource,
  connectMode,
}: {
  node: ThoughtNode;
  dimmed: boolean;
  selected: boolean;
  isConnectSource: boolean;
  connectMode: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const { camera, gl, raycaster } = useThree();

  useFrame(() => {
    const pos = positionsRef.current.get(node.id);
    if (pos && groupRef.current) groupRef.current.position.copy(pos);
  });

  const handleClick = () => {
    if (movedRef.current) return;
    const s = useStore.getState();
    if (connectMode) {
      if (!s.connectFromId) {
        s.setConnectFrom(node.id);
      } else if (s.connectFromId === node.id) {
        s.setConnectFrom(null);
      } else {
        s.addEdge(s.connectFromId, node.id);
        s.setConnectFrom(null);
        s.setMode("browse");
      }
      return;
    }
    s.selectNode(node.id);
    s.setFocused(s.focusedNodeId === node.id ? null : node.id);
  };

  const onPointerDown = (e: {
    stopPropagation: () => void;
    pointerId: number;
  }) => {
    e.stopPropagation();
    draggingRef.current = true;
    movedRef.current = false;
    startPos.current = { x: 0, y: 0 };
    if (controlsRef.current) controlsRef.current.enabled = false;

    const dom = gl.domElement;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startPos.current.x;
      const dy = ev.clientY - startPos.current.y;
      if (startPos.current.x === 0 && startPos.current.y === 0) {
        startPos.current = { x: ev.clientX, y: ev.clientY };
        return;
      }
      if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
      const pos = positionsRef.current.get(node.id);
      if (!pos) return;
      const camDir = camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, pos);
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const point = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, point)) {
        const v = positionsRef.current.get(node.id);
        if (v) v.copy(point);
        fixNode(node.id, point.x, point.y, point.z);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      draggingRef.current = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
      const pos = positionsRef.current.get(node.id);
      if (pos) {
        useStore
          .getState()
          .setNodePosition(node.id, { x: pos.x, y: pos.y, z: pos.z }, true);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const baseColor = isConnectSource
    ? NODE_SOURCE_COLOR
    : selected || hovered
      ? NODE_FOCUS_COLOR
      : NODE_COLOR;
  const opacity = dimmed ? 0.15 : 1;

  return (
    <group
      ref={groupRef}
      position={[node.position.x, node.position.y, node.position.z]}
    >
      <mesh
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial
          color={baseColor}
          roughness={0.35}
          metalness={0.15}
          transparent
          opacity={opacity}
        />
      </mesh>
      <Html position={[0, 1.15, 0]} center zIndexRange={[10, 0]}>
        <div className="node-label" style={{ opacity: dimmed ? 0.2 : 1 }}>
          {node.text}
        </div>
      </Html>
    </group>
  );
}

function EdgeMesh({
  edge,
  dimmed,
  selected,
}: {
  edge: ThoughtEdge;
  dimmed: boolean;
  selected: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const tmpA = useRef(new THREE.Vector3());
  const tmpB = useRef(new THREE.Vector3());
  const tmpMid = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());

  useFrame(() => {
    const a = positionsRef.current.get(edge.sourceNodeId);
    const b = positionsRef.current.get(edge.targetNodeId);
    const g = groupRef.current;
    if (!a || !b || !g) return;
    tmpA.current.copy(a);
    tmpB.current.copy(b);
    tmpMid.current.addVectors(tmpA.current, tmpB.current).multiplyScalar(0.5);
    tmpDir.current.subVectors(tmpB.current, tmpA.current);
    const len = Math.max(tmpDir.current.length(), 0.001);
    g.position.copy(tmpMid.current);
    g.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tmpDir.current.normalize(),
    );
    g.scale.set(1, len, 1);
  });

  const color = edge.isDiscovery ? EDGE_DISCOVERY_COLOR : EDGE_COLOR;
  const radius = edge.isDiscovery ? 0.09 : 0.05;
  const opacity = dimmed ? 0.1 : edge.isDiscovery ? 1 : selected ? 0.9 : 0.55;

  return (
    <group ref={groupRef}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          const s = useStore.getState();
          if (s.mode === "browse") s.selectEdge(edge.id);
        }}
      >
        <cylinderGeometry args={[radius, radius, 1, 10]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function CandidateNode({ suggestion }: { suggestion: AISuggestion }) {
  const pos = suggestion.position ?? { x: 0, y: 0, z: 0 };
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh>
        <sphereGeometry args={[0.55, 24, 24]} />
        <meshStandardMaterial
          color="#a5b4fc"
          roughness={0.4}
          metalness={0.1}
          transparent
          opacity={0.45}
        />
      </mesh>
      <Html position={[0, 1.15, 0]} center zIndexRange={[10, 0]}>
        <div
          className="node-label"
          style={{ opacity: 0.75, borderColor: "#a5b4fc" }}
        >
          {suggestion.content}
        </div>
      </Html>
    </group>
  );
}

function CandidateEdge({ suggestion }: { suggestion: AISuggestion }) {
  const groupRef = useRef<THREE.Group>(null);
  const tmpA = useRef(new THREE.Vector3());
  const tmpB = useRef(new THREE.Vector3());
  const tmpMid = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!suggestion.sourceNodeId || !suggestion.targetNodeId) return;
    const a = positionsRef.current.get(suggestion.sourceNodeId);
    const b = positionsRef.current.get(suggestion.targetNodeId);
    const g = groupRef.current;
    if (!a || !b || !g) return;
    tmpA.current.copy(a);
    tmpB.current.copy(b);
    tmpMid.current.addVectors(tmpA.current, tmpB.current).multiplyScalar(0.5);
    tmpDir.current.subVectors(tmpB.current, tmpA.current);
    const len = Math.max(tmpDir.current.length(), 0.001);
    g.position.copy(tmpMid.current);
    g.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tmpDir.current.normalize(),
    );
    g.scale.set(1, len, 1);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <cylinderGeometry args={[0.06, 0.06, 1, 8]} />
        <meshBasicMaterial color="#a5b4fc" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

function CameraController() {
  const cameraCmd = useStore((s) => s.cameraCmd);
  const { camera } = useThree();

  const fitGlobal = () => {
    const nodes = useStore.getState().idea?.nodes ?? [];
    const controls = controlsRef.current;
    if (!controls) return;
    const toTarget = new THREE.Vector3();
    if (nodes.length === 0) {
      toTarget.set(0, 0, 0);
      camera.position.set(0, 0, 30);
    } else {
      const box = new THREE.Box3();
      for (const n of nodes) {
        box.expandByPoint(
          new THREE.Vector3(n.position.x, n.position.y, n.position.z),
        );
      }
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      toTarget.copy(sphere.center);
      const radius = Math.max(sphere.radius, 3);
      const fov = (camera as THREE.PerspectiveCamera).fov;
      const dist = (radius / Math.tan((fov * Math.PI) / 360)) * 1.4;
      const dir = camera.position.clone().sub(toTarget);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      camera.position.copy(toTarget).addScaledVector(dir, dist);
    }
    controls.target.copy(toTarget);
    camera.lookAt(toTarget);
    controls.update();
  };

  // 首次挂载：自动全局取景
  useEffect(() => {
    fitGlobal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cameraCmd) return;
    if (cameraCmd.type === "global") {
      fitGlobal();
    } else {
      const nodes = useStore.getState().idea?.nodes ?? [];
      const node = nodes.find((n) => n.id === cameraCmd.nodeId);
      const controls = controlsRef.current;
      if (!node || !controls) return;
      const toTarget = new THREE.Vector3(
        node.position.x,
        node.position.y,
        node.position.z,
      );
      const dir = camera.position.clone().sub(toTarget);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      camera.position.copy(toTarget).addScaledVector(dir, 14);
      controls.target.copy(toTarget);
      camera.lookAt(toTarget);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCmd]);

  return null;
}
