import type { AIRequestMode, AISuggestion, IntentProfile } from "./types";

const BASE = "/api/ai";

export interface SuggestionPayload {
  idea_id: string;
  seed_text: string;
  title: string;
  nodes: { id: string; text: string }[];
  edges: { source_node_id: string; target_node_id: string; note?: string }[];
  rejected_summary: string[];
  focused_node_id: string | null;
  mode: AIRequestMode;
  trigger_node_ids: string[];
}

export interface RawSuggestion {
  id: string;
  type: "node" | "edge" | "question";
  content: string;
  reason: string;
  dimension?: string;
  related_node_ids: string[];
  source_node_id?: string | null;
  target_node_id?: string | null;
  edge_note?: string | null;
  relation?: string | null;
  strength?: number | null;
}

interface RawIntentProfile {
  primary_intent: string;
  thinking_stage: string;
  dimensions_present: string[];
  dimensions_missing: string[];
  confidence: number;
}

export interface SuggestResponse {
  request_id: string;
  suggestions: RawSuggestion[];
  intent_profile?: RawIntentProfile | null;
}

export interface RawSummary {
  title: string;
  overview: string;
  themes: string[];
  key_connections: string[];
  open_questions: string[];
  next_directions: string[];
}

export interface SummaryResponse {
  request_id: string;
  summary: RawSummary;
}

export class AIRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function fetchSuggestions(
  payload: SuggestionPayload,
): Promise<SuggestResponse> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AIRequestError("network", "无法连接 AI 服务");
  }

  if (!resp.ok) {
    let message = "AI 暂时不可用，请稍后重试";
    let code = "http";
    try {
      const body = await resp.json();
      const m = body?.detail?.error?.message ?? body?.error?.message;
      const c = body?.detail?.error?.code ?? body?.error?.code;
      if (typeof m === "string" && m) message = m;
      if (typeof c === "string" && c) code = c;
    } catch {
      /* 保留默认消息 */
    }
    throw new AIRequestError(code, message);
  }

  const data = (await resp.json()) as SuggestResponse;
  return data;
}

export async function fetchSummary(
  payload: Omit<SuggestionPayload, "rejected_summary" | "mode" | "trigger_node_ids"> & {
    scope: "all" | "focused";
  },
): Promise<SummaryResponse> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AIRequestError("network", "无法连接 AI 服务");
  }
  if (!resp.ok) throw new AIRequestError("http", "阶段总结生成失败，请重试");
  return (await resp.json()) as SummaryResponse;
}

export function toAISuggestion(
  raw: RawSuggestion,
  requestId: string,
): AISuggestion {
  return {
    id: raw.id,
    requestId,
    type: raw.type,
    content: raw.content,
    reason: raw.reason,
    dimension: raw.dimension ?? "跨维联系",
    relatedNodeIds: raw.related_node_ids ?? [],
    sourceNodeId: raw.source_node_id ?? undefined,
    targetNodeId: raw.target_node_id ?? undefined,
    edgeNote: raw.edge_note ?? undefined,
    relation: raw.relation ?? undefined,
    strength: raw.strength ?? undefined,
    status: "pending",
  };
}

export function toIntentProfile(raw?: RawIntentProfile | null): IntentProfile | undefined {
  if (!raw) return undefined;
  return {
    primaryIntent: raw.primary_intent,
    thinkingStage: raw.thinking_stage,
    dimensionsPresent: raw.dimensions_present ?? [],
    dimensionsMissing: raw.dimensions_missing ?? [],
    confidence: raw.confidence,
  };
}
