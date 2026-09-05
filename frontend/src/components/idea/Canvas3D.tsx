"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Html,
  Line,
  QuadraticBezierLine,
  type QuadraticBezierLineRef,
} from "@react-three/drei";
import type { AISuggestion, ThoughtEdge, ThoughtNode } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  controlsRef,
  fixNode,
  planarPositionsRef,
  positionsRef,
  startLayout,
  startPlanarLayout,
  syncPlanarPositions,
  syncPositions,
} from "@/lib/graph";
import type { Vec3 } from "@/lib/types";
import { Button, TextInput } from "@/components/ui";

const NODE_COLOR = "#73cfff";
const NODE_FOCUS_COLOR = "#ffffff";
const NODE_SOURCE_COLOR = "#ffb36b";
const EDGE_COLOR = "#72bfe8";
const EDGE_DISCOVERY_COLOR = "#ff9a5c";
const VIEW_MOVEMENT_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

type LabelLOD = "full" | "compact" | "point";
const displayPositionsRef: { current: Map<string, THREE.Vector3> } = { current: new Map() };
const labelLODRef: { current: Map<string, LabelLOD> } = { current: new Map() };
const candidateDisplayKey = (id: string) => `candidate:${id}`;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

// Three.js cameras are intentionally mutable scene objects. Keeping projection
// mutations in small helpers prevents React state from being used for frame data.
function configurePerspectiveCamera(camera: THREE.PerspectiveCamera, width: number, height: number) {
  camera.aspect = Math.max(width / Math.max(height, 1), 0.01);
  camera.updateProjectionMatrix();
}

function configureOrthographicCamera(camera: THREE.OrthographicCamera, width: number, height: number) {
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

function setOrthographicZoom(camera: THREE.OrthographicCamera, zoom: number) {
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}

type QuickAddTarget = {
  world: Vec3;
  screen: { x: number; y: number; width: number; height: number };
  sourceNodeId?: string;
};

export default function Canvas3D({
  leftOpen,
  rightOpen,
  labelsVisible,
}: {
  leftOpen: boolean;
  rightOpen: boolean;
  labelsVisible: boolean;
}) {
  const clearSelection = useStore((s) => s.selectNode);
  const clearEdge = useStore((s) => s.selectEdge);
  const setConnectFrom = useStore((s) => s.setConnectFrom);
  const addNodeAt = useStore((s) => s.addNodeAt);
  const viewMode = useStore((s) => s.viewMode);
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddTarget | null>(null);

  return (
    <div className={`canvas-viewport absolute inset-0 min-w-0 ${leftOpen ? "lg:left-40" : "lg:left-0"} ${rightOpen ? "lg:right-[356px]" : "lg:right-0"}`}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.domElement.setAttribute("role", "img");
          gl.domElement.setAttribute(
            "aria-label",
            "交互式关键词网络。支持 3D 空间与 2D 平面视图、键盘移动、缩放、节点拖动和双击添加关键词。",
          );
        }}
        onPointerMissed={() => {
          clearSelection(null);
          clearEdge(null);
          setConnectFrom(null);
        }}
      >
        <ViewCamera />
        <ambientLight intensity={0.42} />
        <directionalLight position={[10, 12, 10]} intensity={0.72} color="#dff6ff" />
        <pointLight position={[-12, -8, -12]} intensity={0.9} color="#4ecbff" />
        <SceneAtmosphere />
        <SpatialDepthField />
        <BackgroundCreateLayer onCreate={setQuickAddTarget} />
        <Graph onQuickAdd={setQuickAddTarget} labelsVisible={labelsVisible} />
        <CameraController />
        <AdaptiveControls />
      </Canvas>
      <div className="canvas-navigation-hint pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1.5 text-[11px] text-muted backdrop-blur-md">
        {viewMode === "3d" ? "3D：拖动旋转 · 滚轮缩放 · WASD 游走" : "2D：拖动画布 · 滚轮缩放 · WASD 平移"}
      </div>
      {quickAddTarget && (
        <QuickAddDialog
          target={quickAddTarget.screen}
          onClose={() => setQuickAddTarget(null)}
          onSubmit={(text) => {
            const newNodeId = addNodeAt(text, quickAddTarget.world);
            if (newNodeId && quickAddTarget.sourceNodeId) {
              useStore.getState().addEdge(quickAddTarget.sourceNodeId, newNodeId);
            }
            setQuickAddTarget(null);
          }}
        />
      )}
    </div>
  );
}

function SceneAtmosphere() {
  const viewMode = useStore((state) => state.viewMode);
  return viewMode === "3d"
    ? <fogExp2 attach="fog" args={["#02070d", 0.008]} />
    : null;
}

function SpatialDepthField() {
  const pointsRef = useRef<THREE.Points>(null);
  const viewMode = useStore((state) => state.viewMode);
  const reducedMotion = usePrefersReducedMotion();
  const particleData = useMemo(() => {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const random = (index: number, salt: number) => {
      const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    const palette = [
      new THREE.Color("#f8fcff"),
      new THREE.Color("#72d4ff"),
      new THREE.Color("#ff985c"),
      new THREE.Color("#8e9fff"),
    ];
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      if (index < count * 0.72) {
        const arm = index % 3;
        const radius = 3.5 + Math.pow(random(index, 1), 0.72) * 42;
        const angle = radius * 0.19 + arm * ((Math.PI * 2) / 3) + (random(index, 2) - 0.5) * 0.5;
        positions[offset] = Math.cos(angle) * radius * 1.15 + (random(index, 3) - 0.5) * 2.2;
        positions[offset + 1] = Math.sin(angle) * radius * 0.68 + (random(index, 4) - 0.5) * 2.1;
        positions[offset + 2] = (random(index, 5) - 0.5) * (5 + radius * 0.18) - 7;
      } else {
        positions[offset] = (random(index, 6) - 0.5) * 110;
        positions[offset + 1] = (random(index, 7) - 0.5) * 72;
        positions[offset + 2] = -42 + random(index, 8) * 58;
      }
      const colorRoll = random(index, 9);
      const color = palette[colorRoll > 0.9 ? 2 : colorRoll > 0.7 ? 3 : colorRoll > 0.45 ? 1 : 0];
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    return { positions, colors };
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current && viewMode === "3d" && !reducedMotion) {
      pointsRef.current.rotation.z += Math.min(delta, 0.05) * 0.012;
    }
  });

  return (
    <points ref={pointsRef} visible={viewMode === "3d"} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[particleData.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[particleData.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={0.105}
        sizeAttenuation
        transparent
        opacity={0.72}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function ViewCamera() {
  const viewMode = useStore((state) => state.viewMode);
  const { set, size } = useThree();
  const perspective = useMemo(() => {
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    camera.position.set(0, 0, 30);
    return camera;
  }, []);
  const orthographic = useMemo(() => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.zoom = 28;
    return camera;
  }, []);
  const last3DPosition = useRef(new THREE.Vector3(0, 0, 30));
  const lastTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    configurePerspectiveCamera(perspective, size.width, size.height);
    configureOrthographicCamera(orthographic, size.width, size.height);
  }, [orthographic, perspective, size.height, size.width]);

  useEffect(() => {
    const target = controlsRef.current?.target
      ? new THREE.Vector3().copy(controlsRef.current.target)
      : lastTarget.current.clone();
    lastTarget.current.copy(target);
    if (viewMode === "2d") {
      last3DPosition.current.copy(perspective.position);
      orthographic.position.set(target.x, target.y, 50);
      orthographic.lookAt(target.x, target.y, 0);
      orthographic.updateProjectionMatrix();
      set({ camera: orthographic });
    } else {
      perspective.position.copy(last3DPosition.current);
      if (perspective.position.distanceTo(target) < 6) perspective.position.set(target.x, target.y, target.z + 30);
      perspective.lookAt(target);
      perspective.updateProjectionMatrix();
      set({ camera: perspective });
    }
  }, [orthographic, perspective, set, viewMode]);

  return null;
}

function AdaptiveControls() {
  const viewMode = useStore((state) => state.viewMode);
  const camera = useThree((state) => state.camera);
  return (
    <OrbitControls
      key={`${viewMode}-${camera.uuid}`}
      camera={camera}
      ref={(control) => {
        controlsRef.current = control as unknown as (typeof controlsRef)["current"];
      }}
      enableDamping
      dampingFactor={0.08}
      enableRotate={viewMode === "3d"}
      screenSpacePanning={viewMode === "2d"}
      minDistance={6}
      maxDistance={140}
      minZoom={6}
      maxZoom={70}
      mouseButtons={viewMode === "2d" ? {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      } : undefined}
      touches={viewMode === "2d" ? {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
      } : undefined}
    />
  );
}

function BackgroundCreateLayer({ onCreate }: { onCreate: (target: QuickAddTarget) => void }) {
  const { camera } = useThree();
  const plane = useMemo(() => new THREE.Plane(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  const onDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    camera.getWorldDirection(normal);
    target.copy(controlsRef.current?.target ?? new THREE.Vector3());
    plane.setFromNormalAndCoplanarPoint(normal, target);
    const point = event.ray.intersectPlane(plane, new THREE.Vector3());
    if (point) {
      const canvasRect = (event.nativeEvent.target as HTMLCanvasElement).getBoundingClientRect();
      onCreate({
        world: { x: point.x, y: point.y, z: point.z },
        screen: {
          x: event.nativeEvent.clientX - canvasRect.left,
          y: event.nativeEvent.clientY - canvasRect.top,
          width: canvasRect.width,
          height: canvasRect.height,
        },
      });
    }
  };

  return (
    <mesh onDoubleClick={onDoubleClick}>
      <sphereGeometry args={[400, 24, 24]} />
      <meshBasicMaterial
        side={THREE.BackSide}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
}

function QuickAddDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: QuickAddTarget["screen"];
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const popoverRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [onClose]);

  const submit = () => {
    if (text.trim()) onSubmit(text.trim());
  };
  const left = Math.min(Math.max(12, target.x + 14), Math.max(12, target.width - 332));
  const top = Math.min(Math.max(64, target.y + 14), Math.max(64, target.height - 230));

  return (
    <section
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="quick-add-title"
      className="quick-add-popover absolute z-40 w-[320px] rounded-3xl p-4"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="quick-add-title" className="text-sm font-medium text-ink">在这里添加关键词</h2>
        <button type="button" aria-label="关闭" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">✕</button>
      </div>
      <TextInput
        value={text}
        onChange={setText}
        autoFocus
        placeholder="输入一个关键词"
        className="w-full"
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
      />
      <p className="mt-2 text-[11px] leading-5 text-muted">
        节点固定在双击位置，并寻找潜在联系。
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={!text.trim()} onClick={submit}>添加节点</Button>
      </div>
    </section>
  );
}

function Graph({
  onQuickAdd,
  labelsVisible,
}: {
  onQuickAdd: (target: QuickAddTarget) => void;
  labelsVisible: boolean;
}) {
  const nodes = useStore((s) => s.idea?.nodes ?? []);
  const edges = useStore((s) => s.idea?.edges ?? []);
  const layoutNonce = useStore((s) => s.layoutNonce);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const mode = useStore((s) => s.mode);
  const connectFromId = useStore((s) => s.connectFromId);
  const suggestions = useStore((s) => s.suggestions);
  const viewMode = useStore((s) => s.viewMode);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const holdNodeHover = (nodeId: string | null) => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    if (nodeId) {
      setHoveredNodeId(nodeId);
      return;
    }
    // 给指针从节点移到预览线/末端按钮留出可操作走廊。
    hoverCloseTimer.current = setTimeout(() => setHoveredNodeId(null), 900);
  };

  useEffect(() => () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
  }, []);

  const nodeIds = nodes.map((n) => n.id).join(",");
  const edgeIds = edges.map((e) => e.id).join(",");

  const prevNonce = useRef(layoutNonce);

  useEffect(() => {
    const relayout = layoutNonce !== prevNonce.current;
    prevNonce.current = layoutNonce;
    syncPositions(nodes);
    if (viewMode === "2d") {
      syncPlanarPositions(nodes);
      return startPlanarLayout(nodes, edges, relayout, () => {
        useStore.getState().requestGlobalView();
      }).stop;
    }
    return startLayout(nodes, edges, relayout, (positions) => {
      useStore.getState().commitPositions(positions);
      useStore.getState().requestGlobalView();
    }).stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIds, edgeIds, layoutNonce, viewMode]);

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
      <SceneDetailManager nodes={nodes} edges={edges} suggestions={suggestions.filter((suggestion) => suggestion.type === "node")} />
      <CognitiveOrbitSystem rootNodeId={nodes.find((node) => node.semanticRole === "root")?.id ?? nodes[0]?.id} />
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
          focused={Boolean(
            focusedNodeId &&
            (edge.sourceNodeId === focusedNodeId || edge.targetNodeId === focusedNodeId),
          )}
        />
      ))}
      {nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          dimmed={isFocusActive && !focusSet.has(node.id)}
          selected={node.id === selectedNodeId}
          focused={node.id === focusedNodeId}
          isConnectSource={mode === "connect" && connectFromId === node.id}
          connectMode={mode === "connect"}
          labelsVisible={labelsVisible}
          onHoverChange={(hovered) => holdNodeHover(hovered ? node.id : null)}
        />
      ))}
      {(hoveredNodeId || selectedNodeId) && mode !== "connect" && (
        <QuickConnectionGuides
          sourceNodeId={hoveredNodeId ?? selectedNodeId!}
          nodes={nodes}
          edges={edges}
          onHoldHover={() => holdNodeHover(hoveredNodeId ?? selectedNodeId)}
          onReleaseHover={() => holdNodeHover(null)}
          onQuickAdd={onQuickAdd}
        />
      )}
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

function CognitiveOrbitSystem({ rootNodeId }: { rootNodeId?: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const viewMode = useStore((state) => state.viewMode);
  const reducedMotion = usePrefersReducedMotion();

  useFrame((_, delta) => {
    if (!groupRef.current || !rootNodeId) return;
    const root = displayPositionsRef.current.get(rootNodeId) ?? positionsRef.current.get(rootNodeId);
    if (root) groupRef.current.position.lerp(root, 1 - Math.exp(-Math.min(delta, 0.05) * 8));
    if (!reducedMotion) groupRef.current.rotation.z += Math.min(delta, 0.05) * 0.025;
  });

  if (!rootNodeId || viewMode !== "3d") return null;

  return (
    <group ref={groupRef}>
      <pointLight color="#dff8ff" intensity={2.1} distance={13} decay={2} />
      <mesh rotation={[1.12, 0.18, 0.28]}>
        <torusGeometry args={[4.4, 0.012, 8, 128]} />
        <meshBasicMaterial color="#72d4ff" transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation={[0.7, 0.92, -0.34]}>
        <torusGeometry args={[7.1, 0.01, 8, 160]} />
        <meshBasicMaterial color="#8e9fff" transparent opacity={0.11} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation={[1.36, -0.5, 0.62]}>
        <torusGeometry args={[10.2, 0.009, 8, 180]} />
        <meshBasicMaterial color="#ff985c" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function SceneDetailManager({
  nodes,
  edges,
  suggestions,
}: {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  suggestions: AISuggestion[];
}) {
  const viewMode = useStore((state) => state.viewMode);
  const selectedNodeId = useStore((state) => state.selectedNodeId);
  const focusedNodeId = useStore((state) => state.focusedNodeId);
  const selectedSuggestionId = useStore((state) => state.selectedSuggestionId);
  const blendRef = useRef(viewMode === "2d" ? 1 : 0);
  const projected = useRef(new THREE.Vector3());
  const cameraDirection = useRef(new THREE.Vector3());

  const focusSet = useMemo(() => {
    const ids = new Set<string>();
    if (!focusedNodeId) return ids;
    ids.add(focusedNodeId);
    for (const edge of edges) {
      if (edge.sourceNodeId === focusedNodeId) ids.add(edge.targetNodeId);
      if (edge.targetNodeId === focusedNodeId) ids.add(edge.sourceNodeId);
    }
    return ids;
  }, [edges, focusedNodeId]);

  useFrame(({ camera, size }, delta) => {
    const targetBlend = viewMode === "2d" ? 1 : 0;
    const blendSpeed = 1 - Math.exp(-Math.min(delta, 0.05) * 8.5);
    blendRef.current = THREE.MathUtils.lerp(blendRef.current, targetBlend, blendSpeed);
    camera.getWorldDirection(cameraDirection.current).normalize();

    for (const node of nodes) {
      const source3D = positionsRef.current.get(node.id) ?? new THREE.Vector3(node.position.x, node.position.y, node.position.z);
      const source2D = planarPositionsRef.current.get(node.id) ?? new THREE.Vector3(source3D.x, source3D.y, 0);
      let display = displayPositionsRef.current.get(node.id);
      if (!display) {
        display = source3D.clone();
        displayPositionsRef.current.set(node.id, display);
      }
      const target = source3D.clone().lerp(source2D, blendRef.current);
      if (focusedNodeId && viewMode === "3d") {
        if (node.id === focusedNodeId) {
          target.addScaledVector(cameraDirection.current, -1.15);
        } else if (!focusSet.has(node.id)) {
          target.addScaledVector(cameraDirection.current, 4.2);
        }
      }
      display.lerp(target, blendSpeed);
    }
    for (const suggestion of suggestions) {
      const position = suggestion.position ?? { x: 0, y: 0, z: 0 };
      const key = candidateDisplayKey(suggestion.id);
      let display = displayPositionsRef.current.get(key);
      if (!display) {
        display = new THREE.Vector3(position.x, position.y, position.z);
        displayPositionsRef.current.set(key, display);
      }
      const target = new THREE.Vector3(position.x, position.y, position.z * (1 - blendRef.current));
      display.lerp(target, blendSpeed);
    }

    const distance = camera.position.distanceTo(controlsRef.current?.target ?? new THREE.Vector3());
    const zoom = camera instanceof THREE.OrthographicCamera ? camera.zoom : 0;
    const sceneLOD: LabelLOD = camera instanceof THREE.OrthographicCamera
      ? zoom >= 28 ? "full" : zoom >= 14 ? "compact" : "point"
      : distance <= 23 ? "full" : distance <= 48 ? "compact" : "point";

    const entries = [
      ...nodes.map((node) => ({
        id: node.id,
        position: displayPositionsRef.current.get(node.id),
        priority: node.id === selectedNodeId ? 1000
          : node.id === focusedNodeId ? 950
            : node.semanticRole === "root" ? 900
              : node.branchId ? 760
                : node.semanticRole === "horizontal" || node.semanticRole === "vertical" ? 520 : 420,
      })),
      ...suggestions.map((suggestion) => ({
        id: candidateDisplayKey(suggestion.id),
        position: displayPositionsRef.current.get(candidateDisplayKey(suggestion.id)),
        priority: suggestion.id === selectedSuggestionId ? 980 : 220,
      })),
    ].filter((entry) => entry.position);

    entries.sort((a, b) => b.priority - a.priority);
    const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
    const nextLOD = new Map<string, LabelLOD>();
    for (const entry of entries) {
      const forceVisible = entry.priority >= 760;
      if (sceneLOD === "point" && !forceVisible) {
        nextLOD.set(entry.id, "point");
        continue;
      }
      projected.current.copy(entry.position!).project(camera);
      if (projected.current.z < -1 || projected.current.z > 1) {
        nextLOD.set(entry.id, "point");
        continue;
      }
      const x = (projected.current.x * 0.5 + 0.5) * size.width;
      const y = (-projected.current.y * 0.5 + 0.5) * size.height;
      const width = sceneLOD === "full" ? 170 : 112;
      const height = sceneLOD === "full" ? 42 : 32;
      const rect = { left: x - width / 2 - 8, right: x + width / 2 + 8, top: y - height / 2 - 6, bottom: y + height / 2 + 6 };
      const collides = occupied.some((other) => !(rect.right < other.left || rect.left > other.right || rect.bottom < other.top || rect.top > other.bottom));
      if (collides && !forceVisible) {
        nextLOD.set(entry.id, "point");
      } else {
        nextLOD.set(entry.id, sceneLOD === "point" ? "compact" : sceneLOD);
        occupied.push(rect);
      }
    }
    labelLODRef.current = nextLOD;
  });

  return null;
}

function NodeMesh({
  node,
  dimmed,
  selected,
  focused,
  isConnectSource,
  connectMode,
  labelsVisible,
  onHoverChange,
}: {
  node: ThoughtNode;
  dimmed: boolean;
  selected: boolean;
  focused: boolean;
  isConnectSource: boolean;
  connectMode: boolean;
  labelsVisible: boolean;
  onHoverChange: (hovered: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const viewMode = useStore((state) => state.viewMode);
  const [hovered, setHovered] = useState(false);
  const labelRevealed = labelsVisible || node.semanticRole === "root" || selected || focused || hovered || isConnectSource;
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const { camera, gl, raycaster } = useThree();

  useFrame(() => {
    const pos = displayPositionsRef.current.get(node.id) ?? positionsRef.current.get(node.id);
    if (pos && groupRef.current) groupRef.current.position.copy(pos);
    const lod = labelLODRef.current.get(node.id) ?? "full";
    if (labelRef.current && labelRef.current.dataset.lod !== lod) {
      labelRef.current.dataset.lod = lod;
      labelRef.current.tabIndex = lod === "point" || !labelRevealed ? -1 : 0;
    }
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
    s.setFocused(node.id);
    s.requestFocusView(node.id);
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
      const pos = displayPositionsRef.current.get(node.id) ?? positionsRef.current.get(node.id);
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
        if (viewMode === "2d") {
          const planar = planarPositionsRef.current.get(node.id);
          if (planar) planar.set(point.x, point.y, 0);
          const spatial = positionsRef.current.get(node.id);
          if (spatial) spatial.set(point.x, point.y, spatial.z);
          fixNode(node.id, point.x, point.y, 0);
        } else {
          const spatial = positionsRef.current.get(node.id);
          if (spatial) spatial.copy(point);
          fixNode(node.id, point.x, point.y, point.z);
        }
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
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
    window.addEventListener("pointercancel", onUp);
  };

  const branchColor = useMemo(() => {
    if (node.semanticRole === "root") return "#f7fcff";
    const key = node.branchId ?? node.id;
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
    return ["#73cfff", "#8e9fff", "#ff9a5c", "#69e0c1"][Math.abs(hash) % 4];
  }, [node.branchId, node.id, node.semanticRole]);
  const baseColor = isConnectSource
    ? NODE_SOURCE_COLOR
    : selected || hovered
      ? NODE_FOCUS_COLOR
      : branchColor || NODE_COLOR;
  const opacity = dimmed ? 0.15 : 1;

  return (
    <group
      ref={groupRef}
      position={[node.position.x, node.position.y, node.position.z]}
    >
      <mesh
        onClick={handleClick}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerOver={() => { setHovered(true); onHoverChange(true); document.body.style.cursor = "grab"; }}
        onPointerOut={() => { setHovered(false); onHoverChange(false); document.body.style.cursor = "default"; }}
      >
        <sphereGeometry args={[0.78, 24, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[node.semanticRole === "root" ? 0.68 : selected || hovered ? 0.46 : 0.38, 28, 28]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={node.semanticRole === "root" ? 1.25 : selected || hovered ? 0.72 : 0.48}
          roughness={0.22}
          metalness={0.08}
          transparent
          opacity={opacity * (node.semanticRole === "root" ? 0.34 : selected || hovered ? 0.24 : 0.15)}
          depthWrite={false}
        />
      </mesh>
      {node.semanticRole === "root" && (
        <mesh raycast={() => null}>
          <sphereGeometry args={[1.18, 28, 28]} />
          <meshBasicMaterial
            color="#dff8ff"
            transparent
            opacity={opacity * 0.055}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      <mesh>
        <sphereGeometry args={[node.semanticRole === "root" ? 0.24 : selected || hovered ? 0.16 : 0.13, 24, 24]} />
        <meshStandardMaterial
          color={selected || hovered ? "#f7fbff" : baseColor}
          emissive={baseColor}
          emissiveIntensity={1.1}
          roughness={0.12}
          metalness={0.18}
          transparent
          opacity={opacity * 0.94}
        />
      </mesh>
      <mesh rotation={[1.08, 0.22, 0.38]}>
        <torusGeometry args={[selected || hovered ? 0.34 : 0.29, 0.012, 8, 48]} />
        <meshBasicMaterial color={baseColor} transparent opacity={opacity * (selected || hovered ? 0.72 : 0.34)} depthWrite={false} />
      </mesh>
      <Html position={[0, node.semanticRole === "root" ? 1.45 : 0.92, 0]} center zIndexRange={[10, 0]}>
        <div
          ref={labelRef}
          data-lod="full"
          className={`node-label formal-node-label specular-node ${selected ? "is-selected" : ""} ${isConnectSource ? "is-source" : ""} ${node.semanticRole === "root" ? "is-root" : ""} ${labelRevealed ? "is-revealed" : "is-concealed"}`}
          data-testid="formal-node"
          role="button"
          tabIndex={0}
          aria-hidden={!labelRevealed}
          aria-label={`选择节点：${node.text}`}
          onPointerDown={onPointerDown}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerOver={() => { setHovered(true); onHoverChange(true); }}
          onPointerOut={() => { setHovered(false); onHoverChange(false); }}
          onClick={handleClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") handleClick();
          }}
          style={{ opacity: dimmed ? 0.16 : 1 }}
        >
          {node.text}
        </div>
      </Html>
    </group>
  );
}

function QuickConnectionGuides({
  sourceNodeId,
  nodes,
  edges,
  onHoldHover,
  onReleaseHover,
  onQuickAdd,
}: {
  sourceNodeId: string;
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  onHoldHover: () => void;
  onReleaseHover: () => void;
  onQuickAdd: (target: QuickAddTarget) => void;
}) {
  const viewMode = useStore((state) => state.viewMode);
  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const edge of edges) {
      if (edge.sourceNodeId === sourceNodeId) ids.add(edge.targetNodeId);
      if (edge.targetNodeId === sourceNodeId) ids.add(edge.sourceNodeId);
    }
    return ids;
  }, [edges, sourceNodeId]);
  const nearestNode = useMemo(() => {
    const source = nodes.find((node) => node.id === sourceNodeId);
    if (!source) return null;
    return nodes
      .filter((node) => node.id !== sourceNodeId && !connectedIds.has(node.id))
      .map((node) => ({
        node,
        distance: Math.hypot(
          node.position.x - source.position.x,
          node.position.y - source.position.y,
          node.position.z - source.position.z,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.node ?? null;
  }, [connectedIds, nodes, sourceNodeId]);

  const getNewDestination = (source: THREE.Vector3, target?: THREE.Vector3) => {
    if (target) {
      const direction = target.clone().sub(source);
      const perpendicular = new THREE.Vector3(-direction.y, direction.x, viewMode === "3d" ? 1.8 : 0);
      if (perpendicular.lengthSq() > 0.01) return source.clone().add(perpendicular.normalize().multiplyScalar(7));
    }
    return source.clone().add(new THREE.Vector3(6.5, -4.2, viewMode === "3d" ? 2.2 : 0));
  };

  return (
    <>
      {nearestNode && (
        <QuickGuide
          sourceNodeId={sourceNodeId}
          targetNodeId={nearestNode.id}
          label={`连到 ${nearestNode.text}`}
          kind="existing"
          onHoldHover={onHoldHover}
          onReleaseHover={onReleaseHover}
          onActivate={() => useStore.getState().addEdge(sourceNodeId, nearestNode.id)}
        />
      )}
      <QuickGuide
        sourceNodeId={sourceNodeId}
        label="新节点"
        kind="new"
        getDestination={(source) => {
          const nearestPosition = nearestNode
            ? displayPositionsRef.current.get(nearestNode.id) ?? positionsRef.current.get(nearestNode.id)
            : undefined;
          return getNewDestination(source, nearestPosition);
        }}
        onHoldHover={onHoldHover}
        onReleaseHover={onReleaseHover}
        onActivate={(event, destination) => {
          const canvasRect = (event.nativeEvent.target as Element).closest("canvas")?.getBoundingClientRect()
            ?? document.querySelector("canvas")?.getBoundingClientRect();
          if (!canvasRect) return;
          onQuickAdd({
            sourceNodeId,
            world: { x: destination.x, y: destination.y, z: destination.z },
            screen: {
              x: event.nativeEvent.clientX - canvasRect.left,
              y: event.nativeEvent.clientY - canvasRect.top,
              width: canvasRect.width,
              height: canvasRect.height,
            },
          });
        }}
      />
    </>
  );
}

function QuickGuide({
  sourceNodeId,
  targetNodeId,
  label,
  kind,
  getDestination,
  onHoldHover,
  onReleaseHover,
  onActivate,
}: {
  sourceNodeId: string;
  targetNodeId?: string;
  label: string;
  kind: "existing" | "new";
  getDestination?: (source: THREE.Vector3) => THREE.Vector3;
  onHoldHover: () => void;
  onReleaseHover: () => void;
  onActivate: (event: ThreeEvent<MouseEvent>, destination: THREE.Vector3) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const destinationRef = useRef(new THREE.Vector3());
  const sourceRef = useRef(new THREE.Vector3());
  const midpointRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());
  const flowRef = useRef<THREE.Mesh>(null);
  const viewMode = useStore((state) => state.viewMode);
  const reducedMotion = usePrefersReducedMotion();

  useFrame(() => {
    const source = displayPositionsRef.current.get(sourceNodeId) ?? positionsRef.current.get(sourceNodeId);
    const target = targetNodeId
      ? displayPositionsRef.current.get(targetNodeId) ?? positionsRef.current.get(targetNodeId)
      : source && getDestination?.(source);
    const group = groupRef.current;
    if (!source || !target || !group) return;
    sourceRef.current.copy(source);
    destinationRef.current.copy(target);
    midpointRef.current.addVectors(source, target).multiplyScalar(0.5);
    directionRef.current.subVectors(target, source);
    const length = Math.max(directionRef.current.length(), 0.001);
    group.position.copy(midpointRef.current);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), directionRef.current.normalize());
    group.scale.set(1, length, 1);
    if (flowRef.current) {
      const progress = reducedMotion ? 0.5 : (performance.now() * 0.00022) % 1;
      flowRef.current.position.y = -0.42 + progress * 0.84;
      flowRef.current.scale.set(1, 1 / length, 1);
    }
  });

  const activate = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onActivate(event, destinationRef.current.clone());
  };

  const setHoverState = (nextHovered: boolean) => {
    setHovered(nextHovered);
    if (nextHovered) {
      onHoldHover();
      document.body.style.cursor = "pointer";
      return;
    }
    onReleaseHover();
    document.body.style.cursor = "default";
  };

  return (
    <group ref={groupRef}>
      <mesh
        onClick={activate}
        onPointerOver={() => setHoverState(true)}
        onPointerOut={() => setHoverState(false)}
      >
        {/* 视觉上仍是细线，但扩大射线检测区，避免要求用户精准点在像素级细线上。 */}
        <cylinderGeometry args={[0.38, 0.38, 1, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Line
        points={[[0, -0.5, 0], [0, 0.5, 0]]}
        color={kind === "existing" ? "#68bfc5" : "#9b8ee7"}
        lineWidth={hovered ? 2.8 : kind === "existing" ? 1.8 : 1.35}
        transparent
        opacity={hovered ? 0.96 : kind === "existing" ? 0.72 : 0.58}
        dashed={kind === "new"}
        dashSize={0.16}
        gapSize={0.11}
        depthWrite={false}
      />
      {viewMode === "3d" && (
        <>
          <mesh raycast={() => null}>
            <cylinderGeometry args={[hovered ? 0.026 : 0.018, hovered ? 0.026 : 0.018, 1, 10]} />
            <meshStandardMaterial
              color={kind === "existing" ? "#83d8dc" : "#b4a8f3"}
              emissive={kind === "existing" ? "#68bfc5" : "#9b8ee7"}
              emissiveIntensity={hovered ? 1.1 : 0.62}
              transparent
              opacity={hovered ? 0.66 : 0.36}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={flowRef} raycast={() => null}>
            <sphereGeometry args={[hovered ? 0.095 : 0.072, 16, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={hovered ? 0.96 : 0.72} depthWrite={false} />
          </mesh>
        </>
      )}
      <Html position={[0, 0.5, 0]} center zIndexRange={[14, 4]}>
        <button
          type="button"
          className={`quick-link-endpoint ${kind === "new" ? "is-new" : ""} ${hovered ? "is-line-hovered" : ""}`}
          aria-label={kind === "new" ? "创建并连接新节点" : label}
          onPointerEnter={() => setHoverState(true)}
          onPointerLeave={() => setHoverState(false)}
          onClick={(event) => {
            event.stopPropagation();
            const synthetic = event as unknown as ThreeEvent<MouseEvent>;
            onActivate(synthetic, destinationRef.current.clone());
          }}
        >
          {kind === "new" ? (
            <><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 5v10M5 10h10" /></svg><span>新节点</span></>
          ) : (
            <span>{label}</span>
          )}
        </button>
      </Html>
    </group>
  );
}

function EdgeMesh({
  edge,
  dimmed,
  selected,
  focused,
}: {
  edge: ThoughtEdge;
  dimmed: boolean;
  selected: boolean;
  focused: boolean;
}) {
  const glowRef = useRef<QuadraticBezierLineRef>(null);
  const lineRef = useRef<QuadraticBezierLineRef>(null);
  const hitRef = useRef<QuadraticBezierLineRef>(null);
  const flowRef = useRef<THREE.Mesh>(null);
  const curveRef = useRef(new THREE.QuadraticBezierCurve3());
  const tmpA = useRef(new THREE.Vector3());
  const tmpB = useRef(new THREE.Vector3());
  const tmpMid = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());
  const tmpCameraDir = useRef(new THREE.Vector3());
  const tmpPerpendicular = useRef(new THREE.Vector3());
  const flowPosition = useRef(new THREE.Vector3());
  const viewMode = useStore((state) => state.viewMode);
  const reducedMotion = usePrefersReducedMotion();
  const camera = useThree((state) => state.camera);
  const initialCurve = useMemo(() => ({
    start: new THREE.Vector3(),
    end: new THREE.Vector3(0, 0.001, 0),
    mid: new THREE.Vector3(0, 0.0005, 0),
  }), []);
  const curveDirection = useMemo(() => {
    let hash = 0;
    for (let index = 0; index < edge.id.length; index += 1) hash = ((hash << 5) - hash + edge.id.charCodeAt(index)) | 0;
    return hash % 2 === 0 ? 1 : -1;
  }, [edge.id]);

  useFrame(() => {
    const a = displayPositionsRef.current.get(edge.sourceNodeId) ?? positionsRef.current.get(edge.sourceNodeId);
    const b = displayPositionsRef.current.get(edge.targetNodeId) ?? positionsRef.current.get(edge.targetNodeId);
    if (!a || !b) return;
    tmpA.current.copy(a);
    tmpB.current.copy(b);
    tmpMid.current.addVectors(tmpA.current, tmpB.current).multiplyScalar(0.5);
    tmpDir.current.subVectors(tmpB.current, tmpA.current);
    const length = Math.max(tmpDir.current.length(), 0.001);
    camera.getWorldDirection(tmpCameraDir.current).normalize();
    tmpPerpendicular.current.crossVectors(tmpDir.current, tmpCameraDir.current);
    if (tmpPerpendicular.current.lengthSq() < 0.001) tmpPerpendicular.current.set(0, 1, 0);
    const bend = viewMode === "3d"
      ? THREE.MathUtils.clamp(length * 0.105, 0.55, 1.85)
      : THREE.MathUtils.clamp(length * 0.055, 0.3, 0.9);
    tmpMid.current.addScaledVector(tmpPerpendicular.current.normalize(), bend * curveDirection);

    curveRef.current.v0.copy(tmpA.current);
    curveRef.current.v1.copy(tmpMid.current);
    curveRef.current.v2.copy(tmpB.current);
    glowRef.current?.setPoints(tmpA.current, tmpB.current, tmpMid.current);
    lineRef.current?.setPoints(tmpA.current, tmpB.current, tmpMid.current);
    hitRef.current?.setPoints(tmpA.current, tmpB.current, tmpMid.current);

    if (flowRef.current) {
      const progress = reducedMotion ? 0.54 : (performance.now() * 0.00016) % 1;
      curveRef.current.getPoint(progress, flowPosition.current);
      flowRef.current.position.copy(flowPosition.current);
    }
  });

  const color = edge.isDiscovery ? EDGE_DISCOVERY_COLOR : EDGE_COLOR;
  const opacity = dimmed ? 0.08 : edge.isDiscovery ? 0.72 : selected ? 0.7 : 0.42;
  const lineWidth = edge.isDiscovery ? 1.5 : selected ? 1.35 : 0.9;

  const selectEdge = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const state = useStore.getState();
    if (state.mode === "browse") state.selectEdge(edge.id);
  };

  return (
    <group>
      <QuadraticBezierLine
        ref={hitRef}
        start={initialCurve.start}
        end={initialCurve.end}
        mid={initialCurve.mid}
        color={color}
        lineWidth={10}
        transparent
        opacity={0}
        depthWrite={false}
        onClick={selectEdge}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      />
      <QuadraticBezierLine
        ref={glowRef}
        start={initialCurve.start}
        end={initialCurve.end}
        mid={initialCurve.mid}
        color={color}
        lineWidth={lineWidth * 5}
        transparent
        opacity={opacity * 0.12}
        depthWrite={false}
        raycast={() => null}
      />
      <QuadraticBezierLine
        ref={lineRef}
        start={initialCurve.start}
        end={initialCurve.end}
        mid={initialCurve.mid}
        color={color}
        lineWidth={lineWidth}
        transparent
        opacity={opacity}
        depthWrite={false}
        raycast={() => null}
      />
      {viewMode === "3d" && (focused || selected) && (
        <mesh ref={flowRef} raycast={() => null}>
          <sphereGeometry args={[selected ? 0.095 : 0.075, 16, 16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={dimmed ? 0.12 : 0.9} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function CandidateNode({ suggestion }: { suggestion: AISuggestion }) {
  const pos = suggestion.position ?? { x: 0, y: 0, z: 0 };
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const selected = useStore((s) => s.selectedSuggestionId === suggestion.id);
  const selectSuggestion = useStore((s) => s.selectSuggestion);
  useFrame(() => {
    const key = candidateDisplayKey(suggestion.id);
    const position = displayPositionsRef.current.get(key);
    if (position && groupRef.current) groupRef.current.position.copy(position);
    const lod = labelLODRef.current.get(key) ?? "full";
    if (labelRef.current && labelRef.current.dataset.lod !== lod) {
      labelRef.current.dataset.lod = lod;
      labelRef.current.tabIndex = lod === "point" ? -1 : 0;
    }
  });
  return (
    <group ref={groupRef} position={[pos.x, pos.y, pos.z]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          selectSuggestion(suggestion.id);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[0.72, 24, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial
          color={selected ? "#efbf77" : "#c8c1f2"}
          roughness={0.4}
          metalness={0.1}
          transparent
          opacity={selected ? 0.2 : 0.1}
          depthWrite={false}
        />
      </mesh>
      <Html position={[0, 0, 0]} center zIndexRange={[10, 0]}>
        <div
          ref={labelRef}
          data-lod="full"
          className={`node-label candidate-node-label specular-node is-candidate ${selected ? "is-selected" : ""}`}
          data-testid="candidate-node"
          role="button"
          tabIndex={0}
          aria-label={`选择联想：${suggestion.content}`}
          onClick={() => selectSuggestion(suggestion.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") selectSuggestion(suggestion.id);
          }}
          style={{ opacity: selected ? 1 : 0.7 }}
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
    const a = displayPositionsRef.current.get(suggestion.sourceNodeId) ?? positionsRef.current.get(suggestion.sourceNodeId);
    const b = displayPositionsRef.current.get(suggestion.targetNodeId) ?? positionsRef.current.get(suggestion.targetNodeId);
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
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          useStore.getState().selectSuggestion(suggestion.id);
        }}
      >
        <cylinderGeometry args={[0.16, 0.16, 1, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Line points={[[0, -0.5, 0], [0, 0.5, 0]]} color="#aaa4df" lineWidth={3.5} transparent opacity={0.06} depthWrite={false} />
      <Line points={[[0, -0.5, 0], [0, 0.5, 0]]} color="#9188d2" lineWidth={1} transparent opacity={0.38} depthWrite={false} dashed dashSize={0.16} gapSize={0.11} />
    </group>
  );
}

function CameraController() {
  const cameraCmd = useStore((s) => s.cameraCmd);
  const viewMode = useStore((s) => s.viewMode);
  const { camera, size } = useThree();
  const pressedKeysRef = useRef(new Set<string>());
  const moveRef = useRef(new THREE.Vector3());
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const upRef = useRef(new THREE.Vector3());
  const transitionRef = useRef<{
    startedAt: number;
    duration: number;
    fromCamera: THREE.Vector3;
    toCamera: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    const isEditing = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element?.matches("input, textarea, select") || element?.isContentEditable);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (VIEW_MOVEMENT_CODES.has(event.code) || event.code === "ShiftLeft" || event.code === "ShiftRight") {
        pressedKeysRef.current.add(event.code);
        if (event.code.startsWith("Arrow")) event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current.delete(event.code);
    };
    const clearKeys = () => pressedKeysRef.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const keys = pressedKeysRef.current;
    const move = moveRef.current.set(0, 0, 0);
    const forward = camera.getWorldDirection(forwardRef.current).normalize();
    const up = upRef.current.copy(camera.up).normalize();
    const accelerated = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const turnDirection = viewMode === "3d"
      ? (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0)
      : 0;

    if (turnDirection !== 0) {
      transitionRef.current = null;
      const targetDistance = Math.max(camera.position.distanceTo(controls.target), 0.1);
      const turnSpeed = accelerated ? 2.9 : 1.8;
      forward.applyAxisAngle(up, turnDirection * turnSpeed * Math.min(delta, 0.05));
      controls.target.copy(camera.position).addScaledVector(forward, targetDistance);
    }

    const right = rightRef.current.crossVectors(forward, up).normalize();
    if (viewMode === "2d") {
      if (keys.has("KeyW") || keys.has("ArrowUp")) move.y += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) move.y -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) move.x += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) move.x -= 1;
    } else {
      if (keys.has("KeyW") || keys.has("ArrowUp")) move.add(forward);
      if (keys.has("KeyS") || keys.has("ArrowDown")) move.sub(forward);
      if (keys.has("KeyD") || keys.has("ArrowRight")) move.add(right);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) move.sub(right);
    }

    if (move.lengthSq() > 0) {
      transitionRef.current = null;
      const speed = viewMode === "2d" ? (accelerated ? 42 : 22) : (accelerated ? 32 : 15);
      move.normalize().multiplyScalar(speed * Math.min(delta, 0.05));
      camera.position.add(move);
      controls.target.add(move);
    }

    if (move.lengthSq() > 0 || turnDirection !== 0) {
      camera.lookAt(controls.target);
      controls.update();
      return;
    }

    const transition = transitionRef.current;
    if (!transition) return;
    const elapsed = performance.now() - transition.startedAt;
    const progress = Math.min(elapsed / transition.duration, 1);
    // smootherstep：起点和终点速度都为 0，避免突然启动或刹停。
    const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
    camera.position.lerpVectors(transition.fromCamera, transition.toCamera, eased);
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
    camera.lookAt(controls.target);
    controls.update();
    if (progress >= 1) transitionRef.current = null;
  });

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
        box.expandByPoint(displayPositionsRef.current.get(n.id) ?? new THREE.Vector3(n.position.x, n.position.y, n.position.z));
      }
      if (camera instanceof THREE.OrthographicCamera) {
        const extent = box.getSize(new THREE.Vector3());
        box.getCenter(toTarget);
        toTarget.z = 0;
        const paddedWidth = Math.max(extent.x + 10, 16);
        const paddedHeight = Math.max(extent.y + 8, 12);
        setOrthographicZoom(camera, THREE.MathUtils.clamp(
          Math.min(size.width / paddedWidth, size.height / paddedHeight),
          6,
          55,
        ));
        camera.position.set(toTarget.x, toTarget.y, 50);
      } else {
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        toTarget.copy(sphere.center);
        const radius = Math.max(sphere.radius + 2.4, 4.5);
        const verticalFov = (camera.fov * Math.PI) / 180;
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
        const fitFov = Math.min(verticalFov, horizontalFov);
        const dist = (radius / Math.sin(fitFov / 2)) * 1.7;
        const dir = camera.position.clone().sub(toTarget);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        camera.position.copy(toTarget).addScaledVector(dir, dist);
      }
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
      const controls = controlsRef.current;
      const livePosition = displayPositionsRef.current.get(cameraCmd.nodeId) ?? positionsRef.current.get(cameraCmd.nodeId);
      const storedNode = useStore
        .getState()
        .idea?.nodes.find((node) => node.id === cameraCmd.nodeId);
      if (!controls || (!livePosition && !storedNode)) return;

      // 聚焦时保留观察方向，同时向目标推进，建立真正的空间进入感。
      const toTarget = livePosition
        ? livePosition.clone()
        : new THREE.Vector3(
            storedNode!.position.x,
            storedNode!.position.y,
            storedNode!.position.z,
          );
      if (camera instanceof THREE.OrthographicCamera) toTarget.z = 0;
      const cameraOffset = camera.position.clone().sub(controls.target);
      if (cameraOffset.lengthSq() < 1e-6) cameraOffset.set(0, 0, 14);
      if (camera instanceof THREE.PerspectiveCamera) {
        cameraOffset.setLength(THREE.MathUtils.clamp(cameraOffset.length() * 0.62, 9.5, 15));
      }
      const toCamera = toTarget.clone().add(cameraOffset);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        camera.position.copy(toCamera);
        controls.target.copy(toTarget);
        camera.lookAt(toTarget);
        controls.update();
      } else {
        // 新的点击会直接替换上一段动画，因此连续切换节点也不会排队或卡顿。
        transitionRef.current = {
          startedAt: performance.now(),
          duration: 520,
          fromCamera: camera.position.clone(),
          toCamera,
          fromTarget: controls.target.clone(),
          toTarget,
        };
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCmd]);

  return null;
}
