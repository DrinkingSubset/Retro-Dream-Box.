/**
 * Per-skin button-layout overrides — lets the player drag any hit region
 * (A, B, D-pad, Start, Select, L/R, menu) to a new spot on the active
 * Delta skin. Offsets are stored as fractions of the skin's mappingSize
 * so they remain correct across orientations and viewport sizes.
 *
 * Storage: localStorage, keyed by skin URL. Sync reads so the layout
 * applies on the very first paint of the controller.
 */
import { useEffect, useState } from "react";

/** Offset in mappingSize fraction (range −1..1, typically much smaller). */
export interface ButtonOffset {
  /** dx as fraction of mappingWidth */
  dx: number;
  /** dy as fraction of mappingHeight */
  dy: number;
  /** Optional uniform scale multiplier (1 = unchanged). */
  scale?: number;
}

/**
 * Map of input-key → offset. The "input-key" is a stable identifier built
 * from the item's inputs (e.g. "a", "b", "dpad", "start"). For multi-input
 * items we sort and join with "+".
 */
export type SkinLayout = Record<string, ButtonOffset>;

const KEY = "delta-skin-layouts-v1";
const EVENT = "delta-skin-layouts-change";

type Map = Record<string, SkinLayout>;

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
    /* ignore quota */
  }
}

export function getSkinLayout(skinUrl: string): SkinLayout {
  return load()[skinUrl] ?? {};
}

export function setSkinLayoutEntry(skinUrl: string, key: string, offset: ButtonOffset | null) {
  const m = load();
  const cur: SkinLayout = { ...(m[skinUrl] ?? {}) };
  if (offset === null) delete cur[key];
  else cur[key] = offset;
  if (Object.keys(cur).length === 0) delete m[skinUrl];
  else m[skinUrl] = cur;
  save(m);
}

export function clearSkinLayout(skinUrl: string) {
  const m = load();
  delete m[skinUrl];
  save(m);
}

export function useSkinLayout(skinUrl: string | null | undefined): SkinLayout {
  const [layout, setLayout] = useState<SkinLayout>(() =>
    skinUrl ? getSkinLayout(skinUrl) : {},
  );
  useEffect(() => {
    if (!skinUrl) {
      setLayout({});
      return;
    }
    const sync = () => setLayout(getSkinLayout(skinUrl));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [skinUrl]);
  return layout;
}

/**
 * Build a stable key for an item from its input set, regardless of order
 * or array-vs-record shape. Used as the layout map key.
 */
export function inputKeyForItem(item: {
  inputs: Record<string, string> | string[];
  thumbstick?: { name: string };
}): string {
  if (item.thumbstick) return "thumbstick";
  const inputs = Array.isArray(item.inputs)
    ? item.inputs
    : Object.values(item.inputs);
  const lower = inputs.map((s) => String(s).toLowerCase()).sort();
  // D-pad items have all 4 directions — collapse to a single "dpad" key.
  const dpadDirs = ["down", "left", "right", "up"];
  if (
    lower.length === 4 &&
    dpadDirs.every((d) => lower.includes(d))
  ) {
    return "dpad";
  }
  return lower.join("+");
}
