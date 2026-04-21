import { useEffect, useState } from "react";

export type SkinId = "nes" | "snes" | "n64" | "gbc" | "gba" | "ds";
export type PlayerId = 1 | 2 | 3 | 4;

/**
 * Game Boy Color skin variants — color palettes inspired by classic
 * GBC casing colors (and the Delta community's GBC skin pack).
 */
export type GbcVariantId =
  | "default"
  | "atomic-pink"
  | "atomic-purple"
  | "berry"
  | "dandelion"
  | "grape"
  | "kiwi"
  | "horror"
  | "teal";

/**
 * Game Boy Advance "Atomic Advance" skin variants by starvingartist.
 */
export type GbaVariantId =
  | "atomic-purple"
  | "smoke-gray"
  | "wave-blue"
  | "fire-red"
  | "leaf-green";

export interface GbcVariant {
  id: GbcVariantId;
  label: string;
  body: string;
  button: string;
  accent: string;
}

export const GBC_VARIANTS: GbcVariant[] = [
  { id: "default",       label: "Default",       body: "#3b2a5a", button: "#1f1330", accent: "#0f0820" },
  { id: "atomic-pink",   label: "Atomic Pink",   body: "#c060c0", button: "#2a2a2a", accent: "#7a2078" },
  { id: "atomic-purple", label: "Atomic Purple", body: "#9078a8", button: "#2a2a2a", accent: "#5a4878" },
  { id: "berry",         label: "Berry",         body: "#a80018", button: "#2a2a2a", accent: "#600010" },
  { id: "dandelion",     label: "Dandelion",     body: "#d8a800", button: "#2a2a2a", accent: "#8a6800" },
  { id: "grape",         label: "Grape",         body: "#301878", button: "#1a1030", accent: "#180048" },
  { id: "kiwi",          label: "Kiwi",          body: "#60a818", button: "#2a2a2a", accent: "#306010" },
  { id: "horror",        label: "Horror",        body: "#a8a8a8", button: "#1a1a1a", accent: "#606060" },
  { id: "teal",          label: "Teal",          body: "#009090", button: "#1a2a2a", accent: "#005858" },
];

export interface GbaVariant {
  id: GbaVariantId;
  label: string;
  body: string;
}
export const GBA_VARIANTS: GbaVariant[] = [
  { id: "atomic-purple", label: "Atomic Purple", body: "#9078a8" },
  { id: "smoke-gray",    label: "Smoke Gray",    body: "#5e5e5e" },
  { id: "wave-blue",     label: "Wave Blue",     body: "#3a6db5" },
  { id: "fire-red",      label: "Fire Red",      body: "#c0282a" },
  { id: "leaf-green",    label: "Leaf Green",    body: "#3a8a3a" },
];

export interface PlayerSettings {
  skin: SkinId;
  opacity: number; // 0-100
  scale: number; // 50-150 (% of base size)
  /** GBC color variant — applied when the active controller skin is GBC. */
  gbcVariant: GbcVariantId;
  /** GBA color variant — applied when the active controller skin is GBA. */
  gbaVariant: GbaVariantId;
}

/**
 * Display profile applied to the emulator canvas as a CSS filter.
 * - standard: untouched, true to original output
 * - vivid:    saturation +30%, mild contrast — a nice middle ground on LCDs
 * - oled-pop: heavy saturation + contrast + slight gamma — designed to make
 *             retro palettes pop on OLED panels (Z Fold, Galaxy S, iPhone Pro).
 */
export type DisplayMode = "standard" | "vivid" | "oled-pop";

export interface AppSettings {
  players: Record<PlayerId, PlayerSettings>;
  respectSilentMode: boolean;
  hapticFeedback: boolean;
  appIcon: "default" | "midnight" | "retro" | "neon";
  /** Picture profile applied to the emulator canvas. */
  displayMode: DisplayMode;
  /** Show a live FPS counter overlay while a game is running. */
  showFps: boolean;
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
    1: { skin: "gba", opacity: 80, scale: 100, gbcVariant: "atomic-purple", gbaVariant: "atomic-purple" },
    2: { skin: "snes", opacity: 80, scale: 100, gbcVariant: "default", gbaVariant: "atomic-purple" },
    3: { skin: "nes", opacity: 80, scale: 100, gbcVariant: "default", gbaVariant: "atomic-purple" },
    4: { skin: "n64", opacity: 80, scale: 100, gbcVariant: "default", gbaVariant: "atomic-purple" },
  },
  respectSilentMode: false,
  hapticFeedback: true,
  appIcon: "default",
  displayMode: "vivid",
  cloudSync: {
    googleDrive: { connected: false },
    dropbox: { connected: false },
  },
};

/**
 * CSS `filter` string for each display mode. Applied to the EmulatorJS canvas
 * to richen retro palettes on modern phone displays.
 */
export const DISPLAY_MODE_FILTERS: Record<DisplayMode, string> = {
  "standard": "none",
  "vivid":    "saturate(1.3) contrast(1.08)",
  "oled-pop": "saturate(1.55) contrast(1.18) brightness(1.05)",
};

export const DISPLAY_MODE_LABELS: Record<DisplayMode, { label: string; desc: string }> = {
  "standard": { label: "Standard",  desc: "Original colors, untouched" },
  "vivid":    { label: "Vivid",     desc: "Boosted saturation for modern LCD screens" },
  "oled-pop": { label: "OLED Pop",  desc: "Punchy colors tuned for OLED panels" },
};

const KEY = "delta-settings-v1";

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    const mergedPlayers = { ...DEFAULTS.players } as AppSettings["players"];
    for (const id of [1, 2, 3, 4] as PlayerId[]) {
      mergedPlayers[id] = { ...DEFAULTS.players[id], ...(parsed.players?.[id] ?? {}) };
    }
    return { ...DEFAULTS, ...parsed, players: mergedPlayers };
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
