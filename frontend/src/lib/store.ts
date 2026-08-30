import { create } from "zustand";
import type {
  AIRequestMode,
  AISuggestion,
  BrainstormSummary,
  CreateIdeaOptions,
  Idea,
  ThoughtEdge,
  ThoughtNode,
  Vec3,
} from "./types";
import { SCHEMA_VERSION } from "./types";
import { getIdea, putIdea } from "./db";
import { generateTitle, randomPos, uid } from "./utils";
import { syncPositions } from "./graph";
import {
  AIRequestError,
  fetchBusinessLens,
  fetchEnvironmentSuggestions,
  fetchSuggestions,
  fetchSummary,
  toAISuggestion,
  toIntentProfile,
} from "./ai";

export type SpaceMode = "browse" | "connect";
export type SaveStatus = "idle" | "saving" | "saved" | "failed";
export type AIStatus = "idle" | "loading" | "success" | "error" | "blocked";
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
  suggestions: AISuggestion[];
  aiStatus: AIStatus;
  aiMessage: string;
  aiMode: AIRequestMode;
  aiTriggerNodeIds: string[];
  selectedSuggestionId: string | null;
  summaryStatus: AIStatus;
  summaryMessage: string;
  summaryDraft: BrainstormSummary | null;
  environmentStatus: AIStatus;
  environmentMessage: string;

  loadIdea: (id: string) => Promise<void>;
  createIdea: (seed: string, options?: CreateIdeaOptions) => Promise<string>;
  updateTitle: (title: string) => void;
  addNodes: (texts: string[]) => void;
  addNodeAt: (text: string, position: Vec3) => string | null;
  updateNodeText: (id: string, text: string) => void;
  setNodePosition: (id: string, pos: Vec3, pinned: boolean) => void;
  removeNode: (id: string) => void;
  createBranch: (rootNodeId: string, title: string, direction: string) => string | null;
  addNodeThoughtRecord: (nodeId: string, content: string) => void;
  addEdge: (a: string, b: string) => void;
  removeEdge: (id: string) => void;
  setEdgeNote: (id: string, note: string) => void;
  setDiscovery: (id: string, isDiscovery: boolean, note?: string) => void;
  commitPositions: (positions: Record<string, Vec3>) => void;

  requestSuggestions: (mode?: AIRequestMode, triggerNodeIds?: string[]) => Promise<void>;
  requestBusinessLens: () => Promise<void>;
  requestEnvironmentSuggestions: () => Promise<void>;
  addAINode: (text: string, position: Vec3) => void;
  addAIEdge: (sourceNodeId: string, targetNodeId: string, note?: string) => void;
  acceptSuggestion: (id: string, editedContent?: string) => void;
  rejectSuggestion: (id: string) => void;
  clearSuggestions: () => void;
  selectSuggestion: (id: string | null) => void;
  toggleAutoRelationDiscovery: () => void;
  generateSummary: (scope?: "all" | "focused") => Promise<void>;
  saveSummary: () => void;

  setMode: (m: SpaceMode) => void;
  setConnectFrom: (id: string | null) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setFocused: (id: string | null) => void;
  requestRelayout: () => void;
  requestGlobalView: () => void;
  requestFocusView: (nodeId: string) => void;
}

function candidatePosition(s: AISuggestion, nodes: ThoughtNode[], index = 0): AISuggestion {
  if (s.type !== "node") return s;
  const related = nodes.find((n) => n.id === s.relatedNodeIds[0]);
  const base = related?.position ?? { x: 0, y: 0, z: 0 };
  const angle = s.semanticRole === "horizontal"
    ? -Math.PI / 2 + index * (Math.PI * 2 / 5)
    : s.semanticRole === "vertical"
      ? Math.PI + (index % 5) * 0.28
      : -Math.PI / 2 + index * (Math.PI * 2 / 3);
  const radius = s.semanticRole === "vertical" ? 7 + index * 1.25 : 5.2;
  return {
    ...s,
    position: {
      x: base.x + Math.cos(angle) * radius,
      y: base.y + Math.sin(angle) * radius,
      z: base.z + (index - 1) * 1.2,
    },
  };
}

let cameraNonce = 0;
let relationTimer: ReturnType<typeof setTimeout> | null = null;
const pendingRelationNodeIds = new Set<string>();
const relationCache = new Map<string, AISuggestion[]>();

function queueRelationProbe(nodeIds: string[]) {
  nodeIds.forEach((id) => pendingRelationNodeIds.add(id));
  if (relationTimer) clearTimeout(relationTimer);
  relationTimer = setTimeout(() => {
    const state = useStore.getState();
    const ids = [...pendingRelationNodeIds];
    pendingRelationNodeIds.clear();
    relationTimer = null;
    if (!state.idea?.autoRelationDiscovery || state.idea.nodes.length < 3) return;
    if (state.aiStatus === "loading") {
      queueRelationProbe(ids);
      return;
    }
    void state.requestSuggestions("relation_probe", ids);
  }, 3000);
}

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

  const dropSuggestion = (id: string) => {
    set((s) => {
      const suggestions = s.suggestions.filter((x) => x.id !== id);
      return {
        suggestions,
        aiStatus: suggestions.length === 0 ? "idle" : s.aiStatus,
      };
    });
  };

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
    suggestions: [],
    aiStatus: "idle",
    aiMessage: "",
    aiMode: "deep_expand",
    aiTriggerNodeIds: [],
    selectedSuggestionId: null,
    summaryStatus: "idle",
    summaryMessage: "",
    summaryDraft: null,
    environmentStatus: "idle",
    environmentMessage: "",

    async loadIdea(id) {
      set({ loading: true, idea: null, notFound: false });
      const idea = await getIdea(id);
      if (!idea) {
        set({ loading: false, notFound: true });
        return;
      }
      idea.lastOpenedAt = Date.now();
      idea.rejectedSummary = idea.rejectedSummary ?? [];
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
        suggestions: [],
        aiStatus: "idle",
        aiMessage: "",
        selectedSuggestionId: null,
        environmentStatus: "idle",
        environmentMessage: "",
      });
    },

    async createIdea(seed, options = {}) {
      const ts = now();
      const rootNode: ThoughtNode = {
        id: uid(),
        text: seed.trim(),
        source: "user",
        status: "formal",
        position: { x: 0, y: 0, z: 0 },
        isPositionPinned: true,
        semanticRole: "root",
        createdAt: ts,
        updatedAt: ts,
      };
      const idea: Idea = {
        id: uid(),
        schemaVersion: SCHEMA_VERSION,
        title: generateTitle(seed),
        seedText: seed,
        createdAt: ts,
        updatedAt: ts,
        lastOpenedAt: ts,
        nodes: [rootNode],
        edges: [],
        discoveryCount: 0,
        rejectedSummary: [],
        autoRelationDiscovery: true,
        summaries: [],
        thinkingMode: options.thinkingMode ?? "daily",
        direction: {
          text: options.directionText?.trim() ?? "",
          source: options.directionText?.trim() ? (options.directionSource ?? "user") : "open",
          confirmedAt: options.directionText?.trim() ? ts : undefined,
        },
        locationContext: options.locationContext ?? { permission: "idle", label: "" },
        branches: [],
        nodeThoughtRecords: [],
        businessInsights: [],
        environmentSuggestions: [],
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

    addNodeAt(text, position) {
      const value = text.trim();
      if (!value) return null;
      const ts = now();
      const node: ThoughtNode = {
        id: uid(),
        text: value,
        source: "user",
        status: "formal",
        position,
        isPositionPinned: true,
        createdAt: ts,
        updatedAt: ts,
      };
      mutate((idea) => ({ ...idea, nodes: [...idea.nodes, node] }));
      queueRelationProbe([node.id]);
      return node.id;
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
        nodeThoughtRecords: idea.nodeThoughtRecords.filter((record) => record.nodeId !== id),
        branches: idea.branches
          .filter((branch) => branch.rootNodeId !== id)
          .map((branch) => ({ ...branch, nodeIds: branch.nodeIds.filter((nodeId) => nodeId !== id) })),
      }));
      set((s) => ({
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        focusedNodeId: s.focusedNodeId === id ? null : s.focusedNodeId,
      }));
    },

    createBranch(rootNodeId, title, direction) {
      const cleanTitle = title.trim();
      const cleanDirection = direction.trim();
      const idea = get().idea;
      const root = idea?.nodes.find((node) => node.id === rootNodeId);
      if (!idea || !root || !cleanTitle) return null;
      const ts = now();
      const branchId = uid();
      const branchNodeId = uid();
      mutate((current) => ({
        ...current,
        branches: [...current.branches, {
          id: branchId,
          rootNodeId,
          title: cleanTitle,
          direction: cleanDirection,
          status: "active" as const,
          createdAt: ts,
          updatedAt: ts,
          nodeIds: [rootNodeId, branchNodeId],
        }],
        nodes: [...current.nodes, {
          id: branchNodeId,
          text: cleanTitle,
          source: "user" as const,
          status: "formal" as const,
          position: { x: root.position.x + 6, y: root.position.y + 3, z: root.position.z + 2 },
          isPositionPinned: false,
          semanticRole: "free" as const,
          branchId,
          createdAt: ts,
          updatedAt: ts,
        }],
        edges: [...current.edges, {
          id: uid(),
          sourceNodeId: rootNodeId,
          targetNodeId: branchNodeId,
          source: "user" as const,
          status: "formal" as const,
          note: cleanDirection || "思考分支",
          isDiscovery: false,
          createdAt: ts,
          updatedAt: ts,
        }],
      }));
      return branchId;
    },

    addNodeThoughtRecord(nodeId, content) {
      const text = content.trim();
      if (!text || !get().idea?.nodes.some((node) => node.id === nodeId)) return;
      const ts = now();
      mutate((idea) => ({
        ...idea,
        nodeThoughtRecords: [...idea.nodeThoughtRecords, {
          id: uid(),
          nodeId,
          content: text,
          source: "user" as const,
          createdAt: ts,
          updatedAt: ts,
        }],
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

    async requestSuggestions(mode = "deep_expand", triggerNodeIds = []) {
      if (mode === "business_lens") {
        await get().requestBusinessLens();
        return;
      }
      const idea = get().idea;
      if (!idea || get().aiStatus === "loading") return;
      const ideaId = idea.id;
      const formalNodes = idea.nodes.filter((n) => n.status === "formal");
      const fingerprint = JSON.stringify({
        ideaId,
        mode,
        triggerNodeIds: [...triggerNodeIds].sort(),
        nodes: formalNodes.map((node) => [node.id, node.text]),
        edges: idea.edges.map((edge) => [edge.sourceNodeId, edge.targetNodeId, edge.note]),
      });
      if (mode === "relation_probe" && relationCache.has(fingerprint)) {
        set({
          suggestions: relationCache.get(fingerprint) ?? [],
          aiStatus: "success",
          aiMode: mode,
          aiTriggerNodeIds: triggerNodeIds,
          aiMessage: "",
        });
        return;
      }
      set({
        aiStatus: "loading",
        aiMessage: "",
        aiMode: mode,
        aiTriggerNodeIds: triggerNodeIds,
        selectedSuggestionId: null,
      });
      try {
        const resp = await fetchSuggestions({
          idea_id: idea.id,
          seed_text: idea.seedText,
          title: idea.title,
          nodes: formalNodes.map((n) => ({ id: n.id, text: n.text })),
          edges: idea.edges
            .filter((e) => e.status === "formal")
            .map((e) => ({
              source_node_id: e.sourceNodeId,
              target_node_id: e.targetNodeId,
              note: e.note,
            })),
          rejected_summary: idea.rejectedSummary ?? [],
          focused_node_id: get().focusedNodeId,
          mode,
          trigger_node_ids: triggerNodeIds,
        });
        if (get().idea?.id !== ideaId) return;
        const suggestions = resp.suggestions.map((s, index) =>
          candidatePosition(toAISuggestion(s, resp.request_id), idea.nodes, index),
        );
        if (mode === "relation_probe") relationCache.set(fingerprint, suggestions);
        const intentProfile = toIntentProfile(resp.intent_profile);
        if (intentProfile) {
          mutate((current) => ({ ...current, intentProfile }));
        }
        set({
          suggestions,
          aiStatus: "success",
          aiMessage:
            suggestions.length === 0 ? "本轮没有形成有价值的建议" : "",
        });
      } catch (e) {
        if (get().idea?.id !== ideaId) return;
        const msg =
          e instanceof AIRequestError ? e.message : "AI 暂时不可用，请重试";
        set({
          suggestions: [],
          aiStatus: e instanceof AIRequestError && e.code === "content_blocked" ? "blocked" : "error",
          aiMessage: msg,
        });
      }
    },

    async requestBusinessLens() {
      const idea = get().idea;
      if (!idea || idea.thinkingMode !== "business" || get().aiStatus === "loading") return;
      const ideaId = idea.id;
      const rootNode = idea.nodes.find((node) => node.semanticRole === "root") ?? idea.nodes[0];
      if (!rootNode) return;
      set({ aiStatus: "loading", aiMessage: "", aiMode: "business_lens", selectedSuggestionId: null });
      try {
        const response = await fetchBusinessLens({
          idea_id: idea.id,
          seed_text: idea.seedText,
          direction: idea.direction.text,
          location_label: idea.locationContext.label || undefined,
          rejected_summary: idea.rejectedSummary ?? [],
        });
        if (get().idea?.id !== ideaId) return;
        const horizontal: AISuggestion[] = response.lens.horizontal.map((item, index) => candidatePosition({
          id: item.id,
          requestId: response.request_id,
          type: "node",
          content: item.label,
          reason: item.reason,
          dimension: `横向 · ${item.relation}`,
          relatedNodeIds: [rootNode.id],
          relation: item.relation,
          status: "pending",
          semanticRole: "horizontal",
        }, idea.nodes, index));
        const vertical: AISuggestion[] = response.lens.vertical.map((item, index) => candidatePosition({
          id: item.id,
          requestId: response.request_id,
          type: "node",
          content: item.label,
          reason: item.reason,
          dimension: "纵向 · 产业链",
          relatedNodeIds: [rootNode.id],
          relation: "链路影响",
          status: "pending",
          semanticRole: "vertical",
          chainStage: item.stage,
        }, idea.nodes, index));
        mutate((current) => ({
          ...current,
          businessInsights: response.lens.insights.map((content) => ({
            id: uid(), content, status: "candidate" as const, createdAt: now(),
          })),
        }));
        set({ suggestions: [...horizontal, ...vertical], aiStatus: "success", aiMessage: "" });
      } catch (error) {
        if (get().idea?.id !== ideaId) return;
        const message = error instanceof Error ? error.message : "商业透视暂时不可用";
        set({
          suggestions: [],
          aiStatus: error instanceof AIRequestError && error.code === "content_blocked" ? "blocked" : "error",
          aiMessage: message,
        });
      }
    },

    async requestEnvironmentSuggestions() {
      const idea = get().idea;
      if (!idea || get().environmentStatus === "loading") return;
      const ideaId = idea.id;
      set({ environmentStatus: "loading", environmentMessage: "" });
      try {
        const response = await fetchEnvironmentSuggestions({
          idea_id: idea.id,
          seed_text: idea.seedText,
          direction: idea.direction.text,
          thinking_stage: idea.intentProfile?.thinkingStage ?? "发散",
          latitude: idea.locationContext.latitude,
          longitude: idea.locationContext.longitude,
          location_label: idea.locationContext.label || undefined,
        });
        if (get().idea?.id !== ideaId) return;
        mutate((current) => ({
          ...current,
          environmentSuggestions: response.suggestions.map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            instruction: item.instruction,
            durationMinutes: item.duration_minutes,
            placeLabel: item.place_label ?? undefined,
            isGeneric: item.is_generic,
            createdAt: now(),
          })),
        }));
        set({
          environmentStatus: "success",
          environmentMessage: response.location_mode === "nearby" ? "已结合当前位置" : "当前为通用环境建议",
        });
      } catch (error) {
        set({ environmentStatus: "error", environmentMessage: error instanceof Error ? error.message : "环境建议生成失败" });
      }
    },

    addAINode(text, position) {
      const t = text.trim();
      if (!t) return;
      const ts = now();
      const node: ThoughtNode = {
        id: uid(),
        text: t,
        source: "ai",
        status: "formal",
        position,
        isPositionPinned: false,
        createdAt: ts,
        updatedAt: ts,
      };
      mutate((idea) => ({ ...idea, nodes: [...idea.nodes, node] }));
    },

    addAIEdge(sourceNodeId, targetNodeId, note) {
      const cur = get().idea;
      if (!cur || sourceNodeId === targetNodeId) return;
      const exists = cur.edges.some(
        (e) =>
          (e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId) ||
          (e.sourceNodeId === targetNodeId && e.targetNodeId === sourceNodeId),
      );
      if (exists) return;
      const ts = now();
      const edge: ThoughtEdge = {
        id: uid(),
        sourceNodeId,
        targetNodeId,
        source: "ai",
        status: "formal",
        note: note?.trim() || undefined,
        isDiscovery: false,
        createdAt: ts,
        updatedAt: ts,
      };
      mutate((idea) => ({ ...idea, edges: [...idea.edges, edge] }));
    },

    acceptSuggestion(id, editedContent) {
      const s = get().suggestions.find((x) => x.id === id);
      if (!s) return;
      if (s.type === "node") {
        const text = (editedContent ?? s.content).trim();
        if (text && s.semanticRole) {
          const ts = now();
          const nodeId = uid();
          const anchorId = s.relatedNodeIds[0];
          mutate((idea) => ({
            ...idea,
            nodes: [...idea.nodes, {
              id: nodeId,
              text,
              source: "ai" as const,
              status: "formal" as const,
              position: s.position ?? randomPos(),
              isPositionPinned: false,
              semanticRole: s.semanticRole,
              chainStage: s.chainStage,
              createdAt: ts,
              updatedAt: ts,
            }],
            edges: anchorId ? [...idea.edges, {
              id: uid(),
              sourceNodeId: anchorId,
              targetNodeId: nodeId,
              source: "ai" as const,
              status: "formal" as const,
              note: s.relation || s.dimension,
              isDiscovery: false,
              createdAt: ts,
              updatedAt: ts,
            }] : idea.edges,
          }));
        } else if (text) get().addAINode(text, s.position ?? randomPos());
      } else if (s.type === "edge") {
        if (s.sourceNodeId && s.targetNodeId) {
          get().addAIEdge(
            s.sourceNodeId,
            s.targetNodeId,
            editedContent || s.edgeNote,
          );
        }
      }
      dropSuggestion(id);
      set({ selectedSuggestionId: null });
    },

    rejectSuggestion(id) {
      const s = get().suggestions.find((x) => x.id === id);
      if (!s) return;
      mutate((idea) => ({
        ...idea,
        rejectedSummary: [...(idea.rejectedSummary ?? []), s.content],
      }));
      dropSuggestion(id);
      set({ selectedSuggestionId: null });
    },

    clearSuggestions() {
      set({ suggestions: [], aiStatus: "idle", aiMessage: "", selectedSuggestionId: null });
    },

    selectSuggestion(id) {
      set({ selectedSuggestionId: id });
    },

    toggleAutoRelationDiscovery() {
      mutate((idea) => ({
        ...idea,
        autoRelationDiscovery: !idea.autoRelationDiscovery,
      }));
    },

    async generateSummary(scope = "all") {
      const idea = get().idea;
      if (!idea || idea.nodes.length < 2 || get().summaryStatus === "loading") return;
      const focusedId = get().focusedNodeId;
      const includedIds = new Set<string>();
      if (scope === "focused" && focusedId) {
        includedIds.add(focusedId);
        idea.edges.forEach((edge) => {
          if (edge.sourceNodeId === focusedId) includedIds.add(edge.targetNodeId);
          if (edge.targetNodeId === focusedId) includedIds.add(edge.sourceNodeId);
        });
      } else {
        idea.nodes.forEach((node) => includedIds.add(node.id));
      }
      const nodes = idea.nodes.filter((node) => includedIds.has(node.id));
      const edges = idea.edges.filter(
        (edge) => includedIds.has(edge.sourceNodeId) && includedIds.has(edge.targetNodeId),
      );
      set({ summaryStatus: "loading", summaryMessage: "", summaryDraft: null });
      try {
        const response = await fetchSummary({
          idea_id: idea.id,
          seed_text: idea.seedText,
          title: idea.title,
          nodes: nodes.map((node) => ({ id: node.id, text: node.text })),
          edges: edges.map((edge) => ({
            source_node_id: edge.sourceNodeId,
            target_node_id: edge.targetNodeId,
            note: edge.note,
          })),
          focused_node_id: scope === "focused" ? focusedId : null,
          scope,
        });
        const raw = response.summary;
        set({
          summaryStatus: "success",
          summaryDraft: {
            id: uid(),
            title: raw.title,
            overview: raw.overview,
            themes: raw.themes ?? [],
            keyConnections: raw.key_connections ?? [],
            openQuestions: raw.open_questions ?? [],
            nextDirections: raw.next_directions ?? [],
            createdAt: Date.now(),
          },
        });
      } catch (error) {
        set({
          summaryStatus: "error",
          summaryMessage: error instanceof Error ? error.message : "阶段总结生成失败",
        });
      }
    },

    saveSummary() {
      const draft = get().summaryDraft;
      if (!draft) return;
      mutate((idea) => ({ ...idea, summaries: [draft, ...(idea.summaries ?? [])] }));
      set({ summaryMessage: "阶段总结已保存" });
    },
  };
});
