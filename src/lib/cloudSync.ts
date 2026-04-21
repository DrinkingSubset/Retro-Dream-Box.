import { supabase } from "@/integrations/supabase/client";
import {
  SAVE_SLOTS,
  readSlot,
  readSlotMeta,
  writeSlot,
  type SaveSlot,
  type SaveStateMeta,
} from "./saveStateStore";
import { getGame, type GameRecord, type SystemId } from "./gameStore";

/**
 * Cloud sync layer for save data. We only sync the things the user
 * explicitly chose: SRAM (battery saves) and save-state slots. ROM files
 * stay strictly on-device.
 *
 * Data layout:
 *   - Catalog row in `cloud_saves` per (user, game, kind, slot).
 *   - Binary blob in the private `game-saves` bucket at
 *     `{user_id}/{game_id}/{kind}-{slot}.bin`.
 *
 * Conflict resolution is last-write-wins by `updated_at`. Each push/pull
 * compares the local meta `savedAt` against the cloud `updated_at` and
 * uploads / downloads only when the remote side is older / newer.
 */

const BUCKET = "game-saves";

/** True when there is an active Supabase session. */
export async function isSignedIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

function pathFor(userId: string, gameId: string, kind: "sram" | "state", slot: number) {
  return `${userId}/${gameId}/${kind}-${slot}.bin`;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*                                Save states                                  */
/* -------------------------------------------------------------------------- */

export interface CloudSaveRow {
  id: string;
  game_id: string;
  game_name: string;
  system: SystemId;
  kind: "sram" | "state";
  slot: number;
  size: number;
  thumbnail: string | null;
  updated_at: string;
}

/** Upload a save-state slot for the given game. */
export async function pushState(
  game: GameRecord,
  slot: SaveSlot,
  data: ArrayBuffer,
  meta: SaveStateMeta,
): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to sync save states");

  const path = pathFor(userId, game.id, "state", slot);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([data]), { upsert: true, contentType: "application/octet-stream" });
  if (upErr) throw upErr;

  const { error: dbErr } = await supabase.from("cloud_saves").upsert(
    {
      user_id: userId,
      game_id: game.id,
      game_name: game.name,
      system: game.system,
      kind: "state",
      slot,
      file_path: path,
      size: data.byteLength,
      thumbnail: meta.thumbnail ?? null,
      updated_at: new Date(meta.savedAt).toISOString(),
    },
    { onConflict: "user_id,game_id,kind,slot" },
  );
  if (dbErr) throw dbErr;
}

/** Download a save-state slot from the cloud and write it to local storage. */
export async function pullState(gameId: string, slot: SaveSlot): Promise<SaveStateMeta | null> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to sync save states");

  const { data: row, error } = await supabase
    .from("cloud_saves")
    .select("*")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .eq("kind", "state")
    .eq("slot", slot)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(row.file_path);
  if (dlErr) throw dlErr;
  const buf = await blob.arrayBuffer();
  return await writeSlot(gameId, slot, buf, row.thumbnail ?? undefined);
}

/* -------------------------------------------------------------------------- */
/*                                  SRAM                                       */
/* -------------------------------------------------------------------------- */

/**
 * Read the in-memory SRAM (battery save) from the running EmulatorJS
 * instance. Returns null when the core isn't loaded or the game has no
 * battery-backed save (e.g. most NES games).
 */
function readSramFromEmulator(): Uint8Array | null {
  const emu = (window as unknown as { EJS_emulator?: { gameManager?: { getSaveFile?: () => Uint8Array } } }).EJS_emulator;
  try {
    const sram = emu?.gameManager?.getSaveFile?.();
    return sram && sram.byteLength > 0 ? sram : null;
  } catch {
    return null;
  }
}

/** Write SRAM bytes back into the running emulator. */
function writeSramToEmulator(data: Uint8Array): boolean {
  const emu = (window as unknown as { EJS_emulator?: { gameManager?: { loadSaveFile?: (d: Uint8Array) => void } } }).EJS_emulator;
  try {
    emu?.gameManager?.loadSaveFile?.(data);
    return true;
  } catch {
    return false;
  }
}

/** Push the current in-memory SRAM to the cloud. No-op if no SRAM exists. */
export async function pushSram(game: GameRecord): Promise<boolean> {
  const sram = readSramFromEmulator();
  if (!sram) return false;
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to sync save data");

  const path = pathFor(userId, game.id, "sram", 0);
  const buf = new ArrayBuffer(sram.byteLength);
  new Uint8Array(buf).set(sram);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([buf]), { upsert: true, contentType: "application/octet-stream" });
  if (upErr) throw upErr;

  const { error: dbErr } = await supabase.from("cloud_saves").upsert(
    {
      user_id: userId,
      game_id: game.id,
      game_name: game.name,
      system: game.system,
      kind: "sram",
      slot: 0,
      file_path: path,
      size: sram.byteLength,
      thumbnail: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,game_id,kind,slot" },
  );
  if (dbErr) throw dbErr;
  return true;
}

/** Pull SRAM from cloud and inject into the running emulator. */
export async function pullSram(gameId: string): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to sync save data");

  const { data: row, error } = await supabase
    .from("cloud_saves")
    .select("file_path")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .eq("kind", "sram")
    .eq("slot", 0)
    .maybeSingle();
  if (error) throw error;
  if (!row) return false;

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(row.file_path);
  if (dlErr) throw dlErr;
  const buf = new Uint8Array(await blob.arrayBuffer());
  return writeSramToEmulator(buf);
}

/* -------------------------------------------------------------------------- */
/*                              Bulk operations                                */
/* -------------------------------------------------------------------------- */

export interface SyncSummary {
  uploaded: number;
  downloaded: number;
  skipped: number;
  errors: string[];
}

/**
 * Two-way sync of every save-state slot for a single game. Whichever side
 * has the newer timestamp wins for each slot. Use this when entering a game
 * to make sure the slot picker shows the latest snapshots.
 */
export async function syncStatesForGame(gameId: string): Promise<SyncSummary> {
  const summary: SyncSummary = { uploaded: 0, downloaded: 0, skipped: 0, errors: [] };
  const userId = await currentUserId();
  if (!userId) return summary;

  const game = await getGame(gameId);
  if (!game) return summary;

  const { data: rows, error } = await supabase
    .from("cloud_saves")
    .select("*")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .eq("kind", "state");
  if (error) {
    summary.errors.push(error.message);
    return summary;
  }
  const remoteBySlot = new Map<number, CloudSaveRow>();
  for (const r of (rows ?? []) as CloudSaveRow[]) remoteBySlot.set(r.slot, r);

  for (const slot of SAVE_SLOTS) {
    try {
      const localMeta = await readSlotMeta(gameId, slot);
      const remote = remoteBySlot.get(slot);

      if (!localMeta && !remote) continue;
      if (localMeta && !remote) {
        const data = await readSlot(gameId, slot);
        if (data) {
          await pushState(game, slot, data, localMeta);
          summary.uploaded++;
        }
        continue;
      }
      if (!localMeta && remote) {
        await pullState(gameId, slot);
        summary.downloaded++;
        continue;
      }
      // Both exist — last-write-wins.
      const remoteTime = new Date(remote!.updated_at).getTime();
      if (localMeta!.savedAt > remoteTime) {
        const data = await readSlot(gameId, slot);
        if (data) {
          await pushState(game, slot, data, localMeta!);
          summary.uploaded++;
        }
      } else if (remoteTime > localMeta!.savedAt) {
        await pullState(gameId, slot);
        summary.downloaded++;
      } else {
        summary.skipped++;
      }
    } catch (e) {
      summary.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return summary;
}

/** List every cloud save row for the current user. Used by Settings. */
export async function listAllCloudSaves(): Promise<CloudSaveRow[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("cloud_saves")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CloudSaveRow[];
}

export async function deleteCloudSave(row: Pick<CloudSaveRow, "id" | "game_id">, kind: "sram" | "state", slot: number): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in required");
  const path = pathFor(userId, row.game_id, kind, slot);
  await supabase.storage.from(BUCKET).remove([path]);
  await supabase.from("cloud_saves").delete().eq("id", row.id);
}
