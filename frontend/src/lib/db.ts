import { openDB, type IDBPDatabase } from "idb";
import type { Idea } from "./types";
import { SCHEMA_VERSION } from "./types";

const DB_NAME = "grokking";
const STORE = "ideas";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function putIdea(idea: Idea): Promise<void> {
  const db = await getDB();
  await db.put(STORE, idea);
}

export async function getIdea(id: string): Promise<Idea | undefined> {
  const db = await getDB();
  const raw = (await db.get(STORE, id)) as Idea | undefined;
  if (!raw) return undefined;
  const idea = normalizeIdea(raw);
  if (idea.schemaVersion !== raw.schemaVersion) await db.put(STORE, idea);
  return idea;
}

export async function listIdeas(): Promise<Idea[]> {
  const db = await getDB();
  const all = ((await db.getAll(STORE)) as Idea[]).map(normalizeIdea);
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function deleteIdea(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

export async function duplicateIdea(source: Idea): Promise<Idea> {
  const ts = Date.now();
  const copy: Idea = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    title: `${source.title}（副本）`,
    createdAt: ts,
    updatedAt: ts,
    lastOpenedAt: ts,
  };
  await putIdea(copy);
  return copy;
}

function normalizeIdea(raw: Idea): Idea {
  return {
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    rejectedSummary: raw.rejectedSummary ?? [],
    autoRelationDiscovery: raw.autoRelationDiscovery ?? true,
    summaries: raw.summaries ?? [],
    thinkingMode: raw.thinkingMode ?? "daily",
    direction: raw.direction ?? { text: "", source: "open" },
    locationContext: raw.locationContext ?? { permission: "idle", label: "" },
    branches: (raw.branches ?? []).map((branch) => ({
      ...branch,
      nodeIds: branch.nodeIds ?? [branch.rootNodeId],
    })),
    nodeThoughtRecords: raw.nodeThoughtRecords ?? [],
    businessInsights: raw.businessInsights ?? [],
    environmentSuggestions: raw.environmentSuggestions ?? [],
    nodes: (raw.nodes ?? []).map((node, index) => ({
      ...node,
      semanticRole: node.semanticRole ?? (index === 0 && node.text === raw.seedText ? "root" : "free"),
    })),
  };
}
