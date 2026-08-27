export type Vec3 = { x: number; y: number; z: number };

export type NodeSource = "user" | "ai";
export type NodeStatus = "formal" | "candidate";
export type EdgeSource = "user" | "ai";
export type EdgeStatus = "formal" | "candidate";

export interface ThoughtNode {
  id: string;
  text: string;
  source: NodeSource;
  status: NodeStatus;
  position: Vec3;
  isPositionPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ThoughtEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  source: EdgeSource;
  status: EdgeStatus;
  note?: string;
  isDiscovery: boolean;
  discoveryNote?: string;
  createdAt: number;
  updatedAt: number;
}

export type SuggestionType = "node" | "edge" | "question";
export type SuggestionStatus =
  | "pending"
  | "accepted"
  | "edited_accepted"
  | "rejected";

export type AIRequestMode =
  | "intent_profile"
  | "relation_probe"
  | "node_brainstorm"
  | "deep_expand";

export interface IntentProfile {
  primaryIntent: string;
  thinkingStage: string;
  dimensionsPresent: string[];
  dimensionsMissing: string[];
  confidence: number;
}

export interface AISuggestion {
  id: string;
  requestId: string;
  type: SuggestionType;
  content: string;
  reason: string;
  dimension: string;
  relatedNodeIds: string[];
  sourceNodeId?: string;
  targetNodeId?: string;
  edgeNote?: string;
  relation?: string;
  strength?: number;
  status: SuggestionStatus;
  position?: Vec3; // 前端补充：node 类型候选的临时位置
}

export interface BrainstormSummary {
  id: string;
  title: string;
  overview: string;
  themes: string[];
  keyConnections: string[];
  openQuestions: string[];
  nextDirections: string[];
  createdAt: number;
}

export interface Idea {
  id: string;
  schemaVersion: number;
  title: string;
  seedText: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  discoveryCount: number;
  rejectedSummary: string[];
  intentProfile?: IntentProfile;
  autoRelationDiscovery: boolean;
  summaries: BrainstormSummary[];
}

export const SCHEMA_VERSION = 3;
