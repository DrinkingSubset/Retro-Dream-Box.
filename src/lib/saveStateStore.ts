import { get, set, del, keys } from "idb-keyval";

/**
 * Save-state slots for a single game. Each game supports 9 manual slots
 * (1-9) plus an "auto" slot used for in-session quick saves.
 *
 * Storage layout (idb-keyval):
 *   `state:{gameId}:{slot}`        -> ArrayBuffer (raw libretro state blob)
 *   `state-meta:{gameId}:{slot}`   -> SaveStateMeta (timestamp + thumb data URL)
 *
 * Splitting metadata from binary data lets the slot picker render quickly
 * without paging the (sometimes multi-MB) state blobs into memory.
 */

export type SaveSlot = number; // 1..9

export interface SaveStateMeta {
  slot: SaveSlot;
  savedAt: number;
  thumbnail?: string; // data URL (jpeg, ~160px wide)
}

const dataKey = (gameId: string, slot: SaveSlot) => `state:${gameId}:${slot}`;
const metaKey = (gameId: string, slot: SaveSlot) => `state-meta:${gameId}:${slot}`;

export const SAVE_SLOT_COUNT = 9;
export const SAVE_SLOTS: SaveSlot[] = Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => i + 1);

/** Capture a small jpeg thumbnail from the live emulator canvas. */
export function captureThumbnail(maxWidth = 160): string | undefined {
  try {
    const canvas =
      (window as any).EJS_emulator?.canvas ??
      (document.querySelector("#emu-game canvas") as HTMLCanvasElement | null);
    if (!canvas) return undefined;
    const ratio = canvas.height / canvas.width;
    const w = Math.min(maxWidth, canvas.width);
    const h = Math.round(w * ratio);
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(canvas, 0, 0, w, h);
    return off.toDataURL("image/jpeg", 0.75);
  } catch {
    return undefined;
  }
}

export async function writeSlot(
  gameId: string,
  slot: SaveSlot,
  data: ArrayBuffer,
  thumbnail?: string,
): Promise<SaveStateMeta> {
  const meta: SaveStateMeta = { slot, savedAt: Date.now(), thumbnail };
  await set(dataKey(gameId, slot), data);
  await set(metaKey(gameId, slot), meta);
  return meta;
}

export async function readSlot(gameId: string, slot: SaveSlot): Promise<ArrayBuffer | undefined> {
  return (await get(dataKey(gameId, slot))) as ArrayBuffer | undefined;
}

export async function readSlotMeta(
  gameId: string,
  slot: SaveSlot,
): Promise<SaveStateMeta | undefined> {
  return (await get(metaKey(gameId, slot))) as SaveStateMeta | undefined;
}

export async function deleteSlot(gameId: string, slot: SaveSlot): Promise<void> {
  await del(dataKey(gameId, slot));
  await del(metaKey(gameId, slot));
}

export async function listSlots(gameId: string): Promise<Record<SaveSlot, SaveStateMeta | null>> {
  const out: Record<SaveSlot, SaveStateMeta | null> = {} as any;
  await Promise.all(
    SAVE_SLOTS.map(async (slot) => {
      out[slot] = (await readSlotMeta(gameId, slot)) ?? null;
    }),
  );
  return out;
}

/** Wipe all slots for a game (useful when a ROM is deleted). */
export async function clearAllSlots(gameId: string): Promise<void> {
  const all = (await keys()) as string[];
  await Promise.all(
    all
      .filter((k) => k.startsWith(`state:${gameId}:`) || k.startsWith(`state-meta:${gameId}:`))
      .map((k) => del(k)),
  );
}
