/**
 * Per-game settings — overrides that apply only when a specific ROM is
 * loaded. Values fall back to the global app settings when unset.
 *
 * Stored in localStorage as a single keyed map so reads are sync (we need
 * them during initial Play.tsx render before the first paint).
 */
import { useEffect, useState } from "react";
import type { DisplayMode } from "./settingsStore";
import type { ShaderId } from "./shaders";

export interface GameSettings {
  /** Per-game picture profile override. */
  displayMode?: DisplayMode;
  /** Per-game shader overlay override. */
  shader?: ShaderId;
  /** Per-game playback speed (0.5, 1, 2, 4). */
  speed?: number;
  /** Per-game audio volume override (0-1). */
  volume?: number;
  /** Per-game default for "hold buttons" mode. */
  holdMode?: boolean;
  /** Custom skin URL/id to use, overriding the player's default. */
  customSkinId?: string;
}

const KEY = "delta-game-settings-v1";
const EVENT = "delta-game-settings-change";

type Map = Record<string, GameSettings>;

function load(): Map {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Map) : {};
  } catch {
    return {};
  }
}

function save(m: Map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // ignore quota errors
  }
}

export function getGameSettings(gameId: string): GameSettings {
  return load()[gameId] ?? {};
}

export function updateGameSettings(gameId: string, patch: Partial<GameSettings>): GameSettings {
  const m = load();
  const next: GameSettings = { ...(m[gameId] ?? {}), ...patch };
  // Strip undefined keys so they revert to global defaults.
  for (const k of Object.keys(next) as (keyof GameSettings)[]) {
    if (next[k] === undefined) delete next[k];
  }
  m[gameId] = next;
  save(m);
  return next;
}

export function clearGameSettings(gameId: string) {
  const m = load();
  delete m[gameId];
  save(m);
}

export function useGameSettings(gameId: string | undefined): GameSettings {
  const [s, setS] = useState<GameSettings>(() => (gameId ? getGameSettings(gameId) : {}));
  useEffect(() => {
    if (!gameId) return;
    const sync = () => setS(getGameSettings(gameId));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [gameId]);
  return s;
}
