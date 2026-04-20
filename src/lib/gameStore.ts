import { openDB, type IDBPDatabase } from "idb";

export type SystemId = "gba" | "gbc" | "nes";

export interface GameRecord {
  id: string;
  name: string;
  system: SystemId;
  fileName: string;
  size: number;
  data: ArrayBuffer;
  addedAt: number;
  lastPlayedAt?: number;
  playCount: number;
  artworkDataUrl?: string;
}

export interface GameMeta {
  id: string;
  name: string;
  system: SystemId;
  fileName: string;
  size: number;
  addedAt: number;
  lastPlayedAt?: number;
  playCount: number;
  artworkDataUrl?: string;
}

const DB_NAME = "delta-emu";
const STORE = "games";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("system", "system");
          store.createIndex("addedAt", "addedAt");
        }
      },
    });
  }
  return dbPromise;
}

export const SYSTEM_LABELS: Record<SystemId, string> = {
  gba: "Game Boy Advance",
  gbc: "Game Boy / Color",
  nes: "Nintendo Entertainment System",
};

export const SYSTEM_SHORT: Record<SystemId, string> = {
  gba: "GBA",
  gbc: "GBC",
  nes: "NES",
};

export function detectSystem(fileName: string): SystemId | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "gba") return "gba";
  if (ext === "gbc" || ext === "gb") return "gbc";
  if (ext === "nes") return "nes";
  return null;
}

function cleanName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_.]+/g, " ").trim();
}

function metaOf(g: GameRecord): GameMeta {
  const { data: _data, ...meta } = g;
  void _data;
  return meta;
}

export async function listGames(): Promise<GameMeta[]> {
  const db = await getDb();
  const all = (await db.getAll(STORE)) as GameRecord[];
  return all
    .map(metaOf)
    .sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
}

export async function getGame(id: string): Promise<GameRecord | undefined> {
  const db = await getDb();
  return (await db.get(STORE, id)) as GameRecord | undefined;
}

export async function addGameFile(file: File): Promise<GameMeta | null> {
  const system = detectSystem(file.name);
  if (!system) return null;
  const data = await file.arrayBuffer();
  const id = crypto.randomUUID();
  const record: GameRecord = {
    id,
    name: cleanName(file.name),
    system,
    fileName: file.name,
    size: file.size,
    data,
    addedAt: Date.now(),
    playCount: 0,
  };
  const db = await getDb();
  await db.put(STORE, record);
  return metaOf(record);
}

export async function deleteGame(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

export async function renameGame(id: string, name: string): Promise<void> {
  const db = await getDb();
  const g = (await db.get(STORE, id)) as GameRecord | undefined;
  if (!g) return;
  g.name = name.trim() || g.name;
  await db.put(STORE, g);
}

export async function setArtwork(id: string, dataUrl: string | undefined): Promise<void> {
  const db = await getDb();
  const g = (await db.get(STORE, id)) as GameRecord | undefined;
  if (!g) return;
  g.artworkDataUrl = dataUrl;
  await db.put(STORE, g);
}

export async function markPlayed(id: string): Promise<void> {
  const db = await getDb();
  const g = (await db.get(STORE, id)) as GameRecord | undefined;
  if (!g) return;
  g.lastPlayedAt = Date.now();
  g.playCount = (g.playCount ?? 0) + 1;
  await db.put(STORE, g);
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
