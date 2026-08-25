import { create } from "zustand";
import type { Idea, ThoughtEdge, ThoughtNode, Vec3 } from "./types";
import { SCHEMA_VERSION } from "./types";
import { getIdea, putIdea } from "./db";
import { generateTitle, randomPos, uid } from "./utils";
import { syncPositions } from "./graph";

export type SpaceMode = "browse" | "connect";
export type SaveStatus = "idle" | "saving" | "saved" | "failed";
export type CameraCommand =
  | { type: "global"; nonce: number }
  | { type: "focus"; nonce: number; nodeId: string };

interface IdeaStore {
  idea: Idea | null;
  loading: boolean;
  notFound: boolean;
  mode: SpaceMode;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  focusedNodeId: string | null;
  connectFromId: string | null;
  saveStatus: SaveStatus;
  layoutNonce: number;
  cameraCmd: CameraCommand | null;

  loadIdea: (id: string) => Promise<void>;
  createIdea: (seed: string) => Promise<string>;
  updateTitle: (title: string) => void;
  addNodes: (texts: string[]) => void;
  updateNodeText: (id: string, text: string) => void;
  setNodePosition: (id: string, pos: Vec3, pinned: boolean) => void;
  removeNode: (id: string) => void;
  addEdge: (a: string, b: string) => void;
  removeEdge: (id: string) => void;
  setEdgeNote: (id: string, note: string) => void;
  setDiscovery: (id: string, isDiscovery: boolean, note?: string) => void;
  commitPositions: (positions: Record<string, Vec3>) => void;

  setMode: (m: SpaceMode) => void;
  setConnectFrom: (id: string | null) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setFocused: (id: string | null) => void;
  requestRelayout: () => void;
  requestGlobalView: () => void;
  requestFocusView: (nodeId: string) => void;
}

let cameraNonce = 0;

export const useStore = create<IdeaStore>()((set, get) => {
  const persist = (idea: Idea) => {
    set({ idea, saveStatus: "saving" });
    putIdea(idea)
      .then(() => set({ saveStatus: "saved" }))
      .catch(() => set({ saveStatus: "failed" }));
  };

  const mutate = (fn: (idea: Idea) => Idea) => {
    const cur = get().idea;
    if (!cur) return;
    const next = fn(cur);
    next.discoveryCount = next.edges.filter((e) => e.isDiscovery).length;
    next.updatedAt = Date.now();
    persist(next);
  };

  const now = () => Date.now();

  return {
    idea: null,
    loading: false,
    notFound: false,
    mode: "browse",
    selectedNodeId: null,
    selectedEdgeId: null,
    focusedNodeId: null,
    connectFromId: null,
    saveStatus: "idle",
    layoutNonce: 0,
    cameraCmd: null,

    async loadIdea(id) {
      set({ loading: true, idea: null, notFound: false });
      const idea = await getIdea(id);
      if (!idea) {
        set({ loading: false, notFound: true });
        return;
      }
      idea.lastOpenedAt = Date.now();
      await putIdea(idea);
      syncPositions(idea.nodes);
      set({
        idea,
        loading: false,
        mode: "browse",
        selectedNodeId: null,
        selectedEdgeId: null,
        focusedNodeId: null,
        connectFromId: null,
        saveStatus: "saved",
      });
    },

    async createIdea(seed) {
      const ts = now();
      const idea: Idea = {
        id: uid(),
        schemaVersion: SCHEMA_VERSION,
        title: generateTitle(seed),
        seedText: seed,
        createdAt: ts,
        updatedAt: ts,
        lastOpenedAt: ts,
        nodes: [],
        edges: [],
        discoveryCount: 0,
      };
      await putIdea(idea);
      return idea.id;
    },

    updateTitle(title) {
      const t = title.trim();
      if (!t) return;
      mutate((idea) => ({ ...idea, title: t }));
    },

    addNodes(texts) {
      const ts = now();
      const newNodes: ThoughtNode[] = texts
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({
          id: uid(),
          text,
          source: "user" as const,
          status: "formal" as const,
          position: randomPos(),
          isPositionPinned: false,
          createdAt: ts,
          updatedAt: ts,
        }));
      if (newNodes.length === 0) return;
      mutate((idea) => ({ ...idea, nodes: [...idea.nodes, ...newNodes] }));
    },

    updateNodeText(id, text) {
      const t = text.trim();
      if (!t) return;
      mutate((idea) => ({
        ...idea,
        nodes: idea.nodes.map((n) =>
          n.id === id ? { ...n, text: t, updatedAt: now() } : n,
        ),
      }));
    },

    setNodePosition(id, pos, pinned) {
      mutate((idea) => ({
        ...idea,
        nodes: idea.nodes.map((n) =>
          n.id === id
            ? { ...n, position: pos, isPositionPinned: pinned, updatedAt: now() }
            : n,
        ),
      }));
    },

    removeNode(id) {
      mutate((idea) => ({
        ...idea,
        nodes: idea.nodes.filter((n) => n.id !== id),
        edges: idea.edges.filter(
          (e) => e.sourceNodeId !== id && e.targetNodeId !== id,
        ),
      }));
      set((s) => ({
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        focusedNodeId: s.focusedNodeId === id ? null : s.focusedNodeId,
      }));
    },

    addEdge(a, b) {
      if (a === b) return;
      const cur = get().idea;
      if (!cur) return;
      const existing = cur.edges.find(
        (e) =>
          (e.sourceNodeId === a && e.targetNodeId === b) ||
          (e.sourceNodeId === b && e.targetNodeId === a),
      );
      if (existing) {
        set({ selectedEdgeId: existing.id, selectedNodeId: null });
        return;
      }
      const ts = now();
      const edge: ThoughtEdge = {
        id: uid(),
        sourceNodeId: a,
        targetNodeId: b,
        source: "user" as const,
        status: "formal" as const,
        isDiscovery: false,
        createdAt: ts,
        updatedAt: ts,
      };
      mutate((idea) => ({ ...idea, edges: [...idea.edges, edge] }));
      set({ selectedEdgeId: edge.id, selectedNodeId: null });
    },

    removeEdge(id) {
      mutate((idea) => ({
        ...idea,
        edges: idea.edges.filter((e) => e.id !== id),
      }));
      set((s) => ({
        selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
      }));
    },

    setEdgeNote(id, note) {
      mutate((idea) => ({
        ...idea,
        edges: idea.edges.map((e) =>
          e.id === id ? { ...e, note: note.trim() || undefined, updatedAt: now() } : e,
        ),
      }));
    },

    setDiscovery(id, isDiscovery, note) {
      mutate((idea) => ({
        ...idea,
        edges: idea.edges.map((e) =>
          e.id === id
            ? {
                ...e,
                isDiscovery,
                discoveryNote: note === undefined ? e.discoveryNote : note.trim() || undefined,
                updatedAt: now(),
              }
            : e,
        ),
      }));
    },

    commitPositions(positions) {
      mutate((idea) => ({
        ...idea,
        nodes: idea.nodes.map((n) =>
          positions[n.id] ? { ...n, position: positions[n.id] } : n,
        ),
      }));
    },

    setMode(m) {
      set({ mode: m, connectFromId: null });
    },

    setConnectFrom(id) {
      set({ connectFromId: id });
    },

    selectNode(id) {
      set({ selectedNodeId: id, selectedEdgeId: null });
    },

    selectEdge(id) {
      set({ selectedEdgeId: id, selectedNodeId: null });
    },

    setFocused(id) {
      set({ focusedNodeId: id });
    },

    requestRelayout() {
      mutate((idea) => ({
        ...idea,
        nodes: idea.nodes.map((n) => ({ ...n, isPositionPinned: false })),
      }));
      set({ layoutNonce: get().layoutNonce + 1 });
    },

    requestGlobalView() {
      cameraNonce += 1;
      set({ cameraCmd: { type: "global", nonce: cameraNonce } });
    },

    requestFocusView(nodeId) {
      cameraNonce += 1;
      set({ cameraCmd: { type: "focus", nonce: cameraNonce, nodeId } });
    },
  };
});
