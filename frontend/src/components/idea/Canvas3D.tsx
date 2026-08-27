"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import type { AISuggestion, ThoughtEdge, ThoughtNode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { controlsRef, fixNode, positionsRef, startLayout, syncPositions } from "@/lib/graph";
import type { Vec3 } from "@/lib/types";
import { Button, TextInput } from "@/components/ui";

const NODE_COLOR = "#958be8";
const NODE_FOCUS_COLOR = "#b8d9ef";
const NODE_SOURCE_COLOR = "#efbf77";
const EDGE_COLOR = "#b9b9d8";
const EDGE_DISCOVERY_COLOR = "#e8b86d";
const VIEW_MOVEMENT_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

type QuickAddTarget = {
  world: Vec3;
  screen: { x: number; y: number; width: number; height: number };
};

export default function Canvas3D({ leftOpen, rightOpen }: { leftOpen: boolean; rightOpen: boolean }) {
  const clearSelection = useStore((s) => s.selectNode);
  const clearEdge = useStore((s) => s.selectEdge);
  const setConnectFrom = useStore((s) => s.setConnectFrom);
  const addNodeAt = useStore((s) => s.addNodeAt);
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddTarget | null>(null);

  return (
    <div className={`canvas-viewport absolute inset-0 min-w-0 ${leftOpen ? "lg:left-40" : "lg:left-0"} ${rightOpen ? "lg:right-[356px]" : "lg:right-0"}`}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 30], fov: 55, near: 0.1, far: 1000 }}
        onCreated={({ gl }) => {
          gl.domElement.setAttribute("role", "img");
          gl.domElement.setAttribute(
            "aria-label",
            "交互式 3D 关键词网络。WASD 或方向键移动，Q、E 左右转向，拖动旋转，滚轮缩放，双击空白处添加关键词。",
          );
        }}
        onPointerMissed={() => {
          clearSelection(null);
          clearEdge(null);
          setConnectFrom(null);
        }}
      >
        <ambientLight intensity={1.8} />
        <directionalLight position={[10, 12, 10]} intensity={1.1} color="#ffffff" />
        <pointLight position={[-12, -8, -12]} intensity={0.45} color="#c9c2f6" />
        <BackgroundCreateLayer onCreate={setQuickAddTarget} />
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
      {quickAddTarget && (
        <QuickAddDialog
          target={quickAddTarget.screen}
          onClose={() => setQuickAddTarget(null)}
          onSubmit={(text) => {
            addNodeAt(text, quickAddTarget.world);
            setQuickAddTarget(null);
          }}
        />
      )}
    </div>
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
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.78, 24, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial
          color={baseColor}
          roughness={0.18}
          metalness={0.04}
          transparent
          opacity={opacity * 0.16}
          depthWrite={false}
        />
      </mesh>
      <Html position={[0, 0, 0]} center zIndexRange={[10, 0]}>
        <div
          className={`node-label formal-node-label specular-node ${selected ? "is-selected" : ""} ${isConnectSource ? "is-source" : ""}`}
          data-testid="formal-node"
          role="button"
          tabIndex={0}
          aria-label={`选择节点：${node.text}`}
          onPointerDown={onPointerDown}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          onClick={handleClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") handleClick();
          }}
          style={{ opacity: dimmed ? 0.2 : 1 }}
        >
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
  const opacity = dimmed ? 0.08 : edge.isDiscovery ? 0.72 : selected ? 0.7 : 0.42;
  const lineWidth = edge.isDiscovery ? 1.5 : selected ? 1.35 : 0.9;

  return (
    <group ref={groupRef}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          const s = useStore.getState();
          if (s.mode === "browse") s.selectEdge(edge.id);
        }}
      >
        <cylinderGeometry args={[0.16, 0.16, 1, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Line points={[[0, -0.5, 0], [0, 0.5, 0]]} color={color} lineWidth={lineWidth * 4} transparent opacity={opacity * 0.1} depthWrite={false} />
      <Line points={[[0, -0.5, 0], [0, 0.5, 0]]} color={color} lineWidth={lineWidth} transparent opacity={opacity} depthWrite={false} />
    </group>
  );
}

function CandidateNode({ suggestion }: { suggestion: AISuggestion }) {
  const pos = suggestion.position ?? { x: 0, y: 0, z: 0 };
  const selected = useStore((s) => s.selectedSuggestionId === suggestion.id);
  const selectSuggestion = useStore((s) => s.selectSuggestion);
  return (
    <group position={[pos.x, pos.y, pos.z]}>
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
  const { camera } = useThree();
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
    const turnDirection = (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0);

    if (turnDirection !== 0) {
      transitionRef.current = null;
      const targetDistance = Math.max(camera.position.distanceTo(controls.target), 0.1);
      const turnSpeed = accelerated ? 2.9 : 1.8;
      forward.applyAxisAngle(up, turnDirection * turnSpeed * Math.min(delta, 0.05));
      controls.target.copy(camera.position).addScaledVector(forward, targetDistance);
    }

    const right = rightRef.current.crossVectors(forward, up).normalize();
    if (keys.has("KeyW") || keys.has("ArrowUp")) move.add(forward);
    if (keys.has("KeyS") || keys.has("ArrowDown")) move.sub(forward);
    if (keys.has("KeyD") || keys.has("ArrowRight")) move.add(right);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) move.sub(right);

    if (move.lengthSq() > 0) {
      transitionRef.current = null;
      move.normalize().multiplyScalar((accelerated ? 32 : 15) * Math.min(delta, 0.05));
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
        box.expandByPoint(
          new THREE.Vector3(n.position.x, n.position.y, n.position.z),
        );
      }
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      toTarget.copy(sphere.center);
      const radius = Math.max(sphere.radius, 3);
      const perspectiveCamera = camera as THREE.PerspectiveCamera;
      const verticalFov = (perspectiveCamera.fov * Math.PI) / 180;
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * perspectiveCamera.aspect);
      const fitFov = Math.min(verticalFov, horizontalFov);
      const dist = (radius / Math.sin(fitFov / 2)) * 1.55;
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
      const controls = controlsRef.current;
      const livePosition = positionsRef.current.get(cameraCmd.nodeId);
      const storedNode = useStore
        .getState()
        .idea?.nodes.find((node) => node.id === cameraCmd.nodeId);
      if (!controls || (!livePosition && !storedNode)) return;

      // 保留当前缩放与观察方向，只平移相机和控制中心。
      // 这样被点击的节点会精确落在当前 Canvas 的几何中心，而不是被拉近。
      const toTarget = livePosition
        ? livePosition.clone()
        : new THREE.Vector3(
            storedNode!.position.x,
            storedNode!.position.y,
            storedNode!.position.z,
          );
      const cameraOffset = camera.position.clone().sub(controls.target);
      if (cameraOffset.lengthSq() < 1e-6) cameraOffset.set(0, 0, 14);
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
