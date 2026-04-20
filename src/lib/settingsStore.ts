import { useEffect, useState } from "react";

export type SkinId = "nes" | "snes" | "n64" | "gbc" | "gba" | "ds";
export type PlayerId = 1 | 2 | 3 | 4;

export interface PlayerSettings {
  skin: SkinId;
  opacity: number; // 0-100
}

export interface AppSettings {
  players: Record<PlayerId, PlayerSettings>;
  respectSilentMode: boolean;
  hapticFeedback: boolean;
  appIcon: "default" | "midnight" | "retro" | "neon";
  cloudSync: {
    googleDrive: { connected: boolean; email?: string };
    dropbox: { connected: boolean; email?: string };
  };
}

export const SKIN_LABELS: Record<SkinId, string> = {
  nes: "Nintendo",
  snes: "Super Nintendo",
  n64: "Nintendo 64",
  gbc: "Game Boy Color",
  gba: "Game Boy Advance",
  ds: "Nintendo DS",
};

const DEFAULTS: AppSettings = {
  players: {
    1: { skin: "gba", opacity: 80 },
    2: { skin: "snes", opacity: 80 },
    3: { skin: "nes", opacity: 80 },
    4: { skin: "n64", opacity: 80 },
  },
  respectSilentMode: false,
  hapticFeedback: true,
  appIcon: "default",
  cloudSync: {
    googleDrive: { connected: false },
    dropbox: { connected: false },
  },
};

const KEY = "delta-settings-v1";

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, players: { ...DEFAULTS.players, ...(parsed.players ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

function save(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent("delta-settings-change"));
  } catch {
    // ignore
  }
}

export function getSettings(): AppSettings {
  return load();
}

export function updateSettings(patch: Partial<AppSettings>) {
  const next = { ...load(), ...patch };
  save(next);
  return next;
}

export function updatePlayer(id: PlayerId, patch: Partial<PlayerSettings>) {
  const cur = load();
  cur.players[id] = { ...cur.players[id], ...patch };
  save(cur);
  return cur;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => load());
  useEffect(() => {
    const handler = () => setSettings(load());
    window.addEventListener("delta-settings-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("delta-settings-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return settings;
}

export function triggerHaptic(settings?: AppSettings) {
  const s = settings ?? load();
  if (!s.hapticFeedback) return;
  try {
    navigator.vibrate?.(10);
  } catch {
    // ignore
  }
}
