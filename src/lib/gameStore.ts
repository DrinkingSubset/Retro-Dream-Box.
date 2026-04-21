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

/** Detect system from file extension only. Used as a fallback. */
export function detectSystemByExt(fileName: string): SystemId | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "gba") return "gba";
  if (ext === "gbc" || ext === "gb") return "gbc";
  if (ext === "nes") return "nes";
  return null;
}

/**
 * Canonical Nintendo logo bytes embedded in every official Game Boy / GBA
 * cartridge header. The boot ROM verifies these bytes; if they don't match,
 * the console refuses to run the cartridge. We use the first 16 bytes as a
 * cheap, reliable fingerprint.
 *
 * GB / GBC: header logo lives at 0x104..0x133 (48 bytes).
 * GBA:      header logo lives at 0x004..0x09F (156 bytes).
 *
 * Both share the same first 16 bytes (the GBA logo is a superset that
 * extends the original Game Boy logo), so a single fingerprint works for
 * matching at either offset.
 */
const NINTENDO_LOGO_HEAD = new Uint8Array([
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b,
  0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
]);

function bytesEqualAt(buf: Uint8Array, offset: number, expected: Uint8Array): boolean {
  if (offset + expected.length > buf.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buf[offset + i] !== expected[i]) return false;
  }
  return true;
}

/**
 * Detect the system by inspecting ROM header bytes. Far more reliable than
 * the file extension because users frequently have misnamed dumps (a GBA
 * ROM saved as `.gb`, a GBC ROM saved as `.gba`, etc.).
 *
 * Detection order:
 *   1. NES — "NES\x1A" magic at offset 0 (iNES header).
 *   2. GBA — Nintendo logo at offset 0x04.
 *   3. GB / GBC — Nintendo logo at offset 0x104. The byte at 0x143 tells
 *      us GBC (0x80 = GBC-compatible, 0xC0 = GBC-only) vs original GB.
 */
export function detectSystemByHeader(data: ArrayBuffer): SystemId | null {
  const buf = new Uint8Array(data);
  if (buf.length < 0x150) {
    // Too small for any valid GB / GBA cartridge, but might still be a
    // tiny NES test ROM.
    if (buf.length >= 4 && buf[0] === 0x4e && buf[1] === 0x45 && buf[2] === 0x53 && buf[3] === 0x1a) {
      return "nes";
    }
    return null;
  }

  // NES: "NES<EOF>" at offset 0.
  if (buf[0] === 0x4e && buf[1] === 0x45 && buf[2] === 0x53 && buf[3] === 0x1a) {
    return "nes";
  }

  // GBA: logo at 0x04. Check first since misnamed `.gb` GBA ROMs exist.
  if (bytesEqualAt(buf, 0x04, NINTENDO_LOGO_HEAD)) {
    return "gba";
  }

  // GB / GBC: logo at 0x104. CGB flag at 0x143 distinguishes the two,
  // but for skin/core selection we treat both as "gbc" because Gambatte
  // handles original GB games as well.
  if (bytesEqualAt(buf, 0x104, NINTENDO_LOGO_HEAD)) {
    return "gbc";
  }

  return null;
}

/**
 * Detect the system from both file name and file contents. Header detection
 * wins; the extension is only used when the header is inconclusive (e.g.
 * an unofficial homebrew ROM with a missing logo).
 */
export function detectSystem(fileName: string, data?: ArrayBuffer): SystemId | null {
  if (data) {
    const fromHeader = detectSystemByHeader(data);
    if (fromHeader) return fromHeader;
  }
  return detectSystemByExt(fileName);
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
  // Read the file once, then run header detection. This catches misnamed
  // ROMs (e.g. a GBA dump saved as `.gb`) that the extension-only path
  // would route to the wrong emulator core / skin.
  const data = await file.arrayBuffer();
  const system = detectSystem(file.name, data);
  if (!system) return null;
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
