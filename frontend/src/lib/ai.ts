import type { AISuggestion } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";

export interface SuggestionPayload {
  idea_id: string;
  seed_text: string;
  title: string;
  nodes: { id: string; text: string }[];
  edges: { source_node_id: string; target_node_id: string; note?: string }[];
  rejected_summary: string[];
  focused_node_id: string | null;
}

export interface RawSuggestion {
  id: string;
  type: "node" | "edge" | "question";
  content: string;
  reason: string;
  related_node_ids: string[];
  source_node_id?: string | null;
  target_node_id?: string | null;
  edge_note?: string | null;
}

export interface SuggestResponse {
  request_id: string;
  suggestions: RawSuggestion[];
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
    resp = await fetch(`${BASE}/api/v1/ai/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AIRequestError("network", "无法连接 AI 服务");
  }

  if (!resp.ok) {
    let message = "AI 暂时不可用，请稍后重试";
    try {
      const body = await resp.json();
      const m = body?.detail?.error?.message ?? body?.error?.message;
      if (typeof m === "string" && m) message = m;
    } catch {
      /* 保留默认消息 */
    }
    throw new AIRequestError("http", message);
  }

  const data = (await resp.json()) as SuggestResponse;
  return data;
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
    relatedNodeIds: raw.related_node_ids ?? [],
    sourceNodeId: raw.source_node_id ?? undefined,
    targetNodeId: raw.target_node_id ?? undefined,
    edgeNote: raw.edge_note ?? undefined,
    status: "pending",
  };
}
