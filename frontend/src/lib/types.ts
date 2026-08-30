export type Vec3 = { x: number; y: number; z: number };

export type NodeSource = "user" | "ai";
export type NodeStatus = "formal" | "candidate";
export type NodeSemanticRole = "root" | "horizontal" | "vertical" | "free";
export type EdgeSource = "user" | "ai";
export type EdgeStatus = "formal" | "candidate";
export type ThinkingMode = "business" | "daily";
export type DirectionSource = "user" | "ai" | "open";
export type LocationPermission = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export interface DirectionIntent {
  text: string;
  source: DirectionSource;
  confirmedAt?: number;
}

export interface LocationContext {
  permission: LocationPermission;
  label: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  updatedAt?: number;
}

export interface DirectionCandidate {
  id: string;
  text: string;
  reason: string;
}

export interface ThinkingBranch {
  id: string;
  rootNodeId: string;
  title: string;
  direction: string;
  status: "active" | "archived";
  createdAt: number;
  updatedAt: number;
  nodeIds: string[];
}

export interface NodeThoughtRecord {
  id: string;
  nodeId: string;
  content: string;
  source: "user" | "ai";
  createdAt: number;
  updatedAt: number;
}

export interface ThoughtNode {
  id: string;
  text: string;
  source: NodeSource;
  status: NodeStatus;
  position: Vec3;
  isPositionPinned: boolean;
  createdAt: number;
  updatedAt: number;
  semanticRole?: NodeSemanticRole;
  chainStage?: "upstream" | "core" | "downstream" | "support";
  branchId?: string;
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
  | "deep_expand"
  | "business_lens";

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
  semanticRole?: NodeSemanticRole;
  chainStage?: "upstream" | "core" | "downstream" | "support";
}

export interface BusinessInsight {
  id: string;
  content: string;
  status: "candidate" | "saved";
  createdAt: number;
}

export interface EnvironmentSuggestion {
  id: string;
  kind: "walk" | "observe" | "listen" | "pause";
  title: string;
  instruction: string;
  durationMinutes: number;
  placeLabel?: string;
  isGeneric: boolean;
  createdAt: number;
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
  thinkingMode: ThinkingMode;
  direction: DirectionIntent;
  locationContext: LocationContext;
  branches: ThinkingBranch[];
  nodeThoughtRecords: NodeThoughtRecord[];
  businessInsights: BusinessInsight[];
  environmentSuggestions: EnvironmentSuggestion[];
}

export interface CreateIdeaOptions {
  thinkingMode?: ThinkingMode;
  directionText?: string;
  directionSource?: DirectionSource;
  locationContext?: LocationContext;
}

export const SCHEMA_VERSION = 4;
