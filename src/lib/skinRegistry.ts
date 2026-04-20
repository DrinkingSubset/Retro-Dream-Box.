/**
 * Skin registry — maps system + skin variant id → URL of a bundled
 * `.deltaskin` archive in /public/skins.
 *
 * For systems where we don't ship a Delta-format file, the entry is `null`
 * and the player falls back to the native HTML/CSS controller built into
 * the app.
 */
import type { SystemId } from "@/lib/gameStore";
import type { GbcVariantId, GbaVariantId } from "@/lib/settingsStore";

export interface SkinRegistryEntry {
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
 * Game Boy Advance — the "Atomic Advance" pack by starvingartist.
 * All five colour variants ship with both standard and edgeToEdge
 * representations, so they look right on every device including the
 * Galaxy Z Fold cover screen and unfolded inner screen.
 */
export const GBA_SKIN_URLS: Record<GbaVariantId, string> = {
  "atomic-purple": "/skins/aa-atomicpurple.deltaskin",
  "smoke-gray":    "/skins/aa-smokegray.deltaskin",
  "wave-blue":     "/skins/aa-waveblue.deltaskin",
  "fire-red":      "/skins/aa-firered.deltaskin",
  "leaf-green":    "/skins/aa-leafgreen.deltaskin",
};

export const DEFAULT_DELTASKIN_URL: Partial<Record<SystemId, string>> = {
  gba: GBA_SKIN_URLS["atomic-purple"],
  gbc: GBC_SKIN_URLS["default"],
};

export function getSkinUrlForSystem(
  system: SystemId,
  gbcVariant: GbcVariantId,
  gbaVariant: GbaVariantId = "atomic-purple",
): string | null {
  if (system === "gbc") return GBC_SKIN_URLS[gbcVariant] ?? GBC_SKIN_URLS["default"];
  if (system === "gba") return GBA_SKIN_URLS[gbaVariant] ?? GBA_SKIN_URLS["atomic-purple"];
  return DEFAULT_DELTASKIN_URL[system] ?? null;
}
