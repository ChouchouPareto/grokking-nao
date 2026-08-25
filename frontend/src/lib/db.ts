import { openDB, type IDBPDatabase } from "idb";
import type { Idea } from "./types";

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
  return (await db.get(STORE, id)) as Idea | undefined;
}

export async function listIdeas(): Promise<Idea[]> {
  const db = await getDB();
  const all = (await db.getAll(STORE)) as Idea[];
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function deleteIdea(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}
