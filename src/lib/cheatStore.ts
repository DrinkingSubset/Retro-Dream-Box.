import { openDB, type IDBPDatabase } from "idb";

export interface Cheat {
  id: string;
  name: string;
  code: string; // raw user input (may contain newlines, "+" separators)
  enabled: boolean;
}

const DB_NAME = "delta-emu-cheats";
const STORE = "cheats";

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE); // keyPath = gameId
        }
      },
    });
  }
  return dbPromise;
}

export async function getCheats(gameId: string): Promise<Cheat[]> {
  const db = await getDb();
  return ((await db.get(STORE, gameId)) as Cheat[] | undefined) ?? [];
}

export async function saveCheats(gameId: string, cheats: Cheat[]): Promise<void> {
  const db = await getDb();
  await db.put(STORE, cheats, gameId);
}

/**
 * Normalise a raw user-entered cheat string into the canonical newline-
 * separated lines that EmulatorJS / libretro cores accept for both
 * Game Genie and GameShark / Action Replay codes.
 *
 * Accepts codes split by newlines, "+", ";" or "," — strips empty lines.
 */
export function normaliseCheatCode(raw: string): string {
  return raw
    .split(/[\n+;,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}
