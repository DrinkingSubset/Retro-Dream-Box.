/**
 * Custom user-uploaded `.deltaskin` files. Stored as raw ArrayBuffers in
 * IndexedDB so they survive across sessions.
 *
 * The runtime resolves a `customSkin:{id}` URL by:
 *   1. Loading the bytes from IDB.
 *   2. Wrapping them in a Blob URL.
 *   3. Handing the Blob URL to `loadDeltaSkin()` (which is fully
 *      content-agnostic — it just fetches & unzips).
 *
 * The Blob URL is cached per skin id so repeated lookups don't re-allocate.
 */
import { useEffect, useState } from "react";
import { openDB, type IDBPDatabase } from "idb";
import JSZip from "jszip";

const DB_NAME = "delta-custom-skins";
const STORE = "skins";

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export interface CustomSkinRecord {
  id: string;
  name: string;
  /** System this skin targets — chosen at upload time. */
  system: "gba" | "gbc" | "nes";
  /** Raw .deltaskin zip bytes. */
  data: ArrayBuffer;
  addedAt: number;
}

export interface CustomSkinMeta {
  id: string;
  name: string;
  system: "gba" | "gbc" | "nes";
  addedAt: number;
}

export const CUSTOM_SKIN_PREFIX = "customSkin:";

/** Validate a `.deltaskin` archive by checking it has an `info.json`. */
async function validateSkin(buf: ArrayBuffer): Promise<{ name: string }> {
  const zip = await JSZip.loadAsync(buf);
  const info = zip.file("info.json");
  if (!info) throw new Error("Not a valid .deltaskin: missing info.json");
  const parsed = JSON.parse(await info.async("string"));
  return { name: typeof parsed?.name === "string" ? parsed.name : "Custom skin" };
}

export async function addCustomSkin(file: File, system: CustomSkinRecord["system"]): Promise<CustomSkinMeta> {
  const data = await file.arrayBuffer();
  const { name } = await validateSkin(data);
  const id = crypto.randomUUID();
  const rec: CustomSkinRecord = {
    id,
    name: name || file.name.replace(/\.deltaskin$/i, ""),
    system,
    data,
    addedAt: Date.now(),
  };
  await (await db()).put(STORE, rec);
  window.dispatchEvent(new CustomEvent("delta-custom-skins-change"));
  return { id: rec.id, name: rec.name, system: rec.system, addedAt: rec.addedAt };
}

export async function listCustomSkins(): Promise<CustomSkinMeta[]> {
  const all = (await (await db()).getAll(STORE)) as CustomSkinRecord[];
  return all
    .map(({ data: _d, ...meta }) => {
      void _d;
      return meta;
    })
    .sort((a, b) => b.addedAt - a.addedAt);
}

export async function deleteCustomSkin(id: string): Promise<void> {
  // Free any cached blob URL so future loads re-create it.
  const cached = blobUrlCache.get(id);
  if (cached) {
    URL.revokeObjectURL(cached);
    blobUrlCache.delete(id);
  }
  await (await db()).delete(STORE, id);
  window.dispatchEvent(new CustomEvent("delta-custom-skins-change"));
}

const blobUrlCache = new Map<string, string>();

/**
 * Resolve a `customSkin:{id}` URL into a real Blob URL that
 * `loadDeltaSkin()` can fetch. Returns null if not a custom-skin URL or
 * the id is missing from storage.
 */
export async function resolveCustomSkinUrl(url: string): Promise<string | null> {
  if (!url.startsWith(CUSTOM_SKIN_PREFIX)) return null;
  const id = url.slice(CUSTOM_SKIN_PREFIX.length);
  const cached = blobUrlCache.get(id);
  if (cached) return cached;
  const rec = (await (await db()).get(STORE, id)) as CustomSkinRecord | undefined;
  if (!rec) return null;
  const blob = new Blob([rec.data], { type: "application/zip" });
  const blobUrl = URL.createObjectURL(blob);
  blobUrlCache.set(id, blobUrl);
  return blobUrl;
}

export function useCustomSkins(): CustomSkinMeta[] {
  const [skins, setSkins] = useState<CustomSkinMeta[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      listCustomSkins().then((s) => {
        if (alive) setSkins(s);
      });
    };
    refresh();
    window.addEventListener("delta-custom-skins-change", refresh);
    return () => {
      alive = false;
      window.removeEventListener("delta-custom-skins-change", refresh);
    };
  }, []);
  return skins;
}
