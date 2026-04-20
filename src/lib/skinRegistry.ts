/**
 * Skin registry — maps system + skin variant id → URL of a bundled
 * `.deltaskin` archive in /public/skins.
 *
 * For systems where we don't ship a Delta-format file, the entry is `null`
 * and the player falls back to the native HTML/CSS controller built into
 * the app.
 */
import type { SystemId } from "@/lib/gameStore";
import type { GbcVariantId } from "@/lib/settingsStore";

export interface SkinRegistryEntry {
  /** URL relative to the site root, or null if no Delta-format skin exists. */
  url: string | null;
  label: string;
}

export const GBC_SKIN_URLS: Record<GbcVariantId, string> = {
  "default":       "/skins/gbc-atomic-purple.deltaskin",
  "atomic-pink":   "/skins/gbc-atomic-pink.deltaskin",
  "atomic-purple": "/skins/gbc-atomic-purple.deltaskin",
  "berry":         "/skins/gbc-berry.deltaskin",
  "dandelion":     "/skins/gbc-dandelion.deltaskin",
  "grape":         "/skins/gbc-grape.deltaskin",
  "kiwi":          "/skins/gbc-kiwi.deltaskin",
  "horror":        "/skins/gbc-horror.deltaskin",
  "teal":          "/skins/gbc-teal.deltaskin",
};

/**
 * Default Delta-format skin per system, or null if we use the built-in
 * HTML/CSS controller.
 */
export const DEFAULT_DELTASKIN_URL: Partial<Record<SystemId, string>> = {
  gba: "/skins/gba-thumbstick.deltaskin",
  gbc: GBC_SKIN_URLS["default"],
};

export function getSkinUrlForSystem(system: SystemId, gbcVariant: GbcVariantId): string | null {
  if (system === "gbc") return GBC_SKIN_URLS[gbcVariant] ?? GBC_SKIN_URLS["default"];
  return DEFAULT_DELTASKIN_URL[system] ?? null;
}
