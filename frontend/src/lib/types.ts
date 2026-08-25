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
}

export const SCHEMA_VERSION = 1;
