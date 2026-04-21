/**
 * Display shaders — pure-CSS overlays applied above the emulator canvas.
 *
 * We deliberately avoid WebGL: the EJS canvas is a libretro-driven
 * surface that we don't own, and stacking a CSS overlay keeps the work
 * GPU-accelerated, free of DPR / sizing pitfalls, and trivial to toggle.
 *
 * Each shader returns a small style block:
 *   - `filter`        — color / contrast tweaks layered on top of the
 *                       user's "picture mode" filter (we compose them).
 *   - `overlayStyle`  — a layer drawn over the canvas (scanlines, dot
 *                       grid, vignette).
 *   - `mixBlendMode`  — composite mode for the overlay layer.
 */

export type ShaderId = "off" | "crt" | "lcd" | "scanlines" | "dot-matrix";

export interface ShaderDef {
  id: ShaderId;
  label: string;
  desc: string;
}

export const SHADERS: ShaderDef[] = [
  { id: "off",         label: "None",        desc: "No shader overlay" },
  { id: "crt",         label: "CRT",         desc: "Curved scanlines and a soft vignette like a tube TV" },
  { id: "lcd",         label: "LCD Grid",    desc: "Subtle pixel grid that mimics a backlit handheld panel" },
  { id: "scanlines",   label: "Scanlines",   desc: "Crisp horizontal scanlines" },
  { id: "dot-matrix",  label: "Dot Matrix",  desc: "Original Game Boy green dot-matrix tint" },
];

export interface ShaderStyles {
  /** Composed with the user's display-mode filter on the canvas itself. */
  extraCanvasFilter: string;
  /** Optional overlay rendered above the canvas (same rect). */
  overlay: React.CSSProperties | null;
}

const SCANLINE_OVERLAY = (gap: number, opacity: number): React.CSSProperties => ({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,${opacity}) 0px, rgba(0,0,0,${opacity}) 1px, transparent 1px, transparent ${gap}px)`,
  mixBlendMode: "multiply",
});

const LCD_GRID_OVERLAY: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  backgroundImage:
    "linear-gradient(rgba(0,0,0,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.18) 1px, transparent 1px)",
  backgroundSize: "3px 3px",
  mixBlendMode: "multiply",
};

const CRT_OVERLAY: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px), radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.55) 100%)",
  mixBlendMode: "multiply",
};

const DOT_MATRIX_OVERLAY: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  backgroundImage:
    "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.45) 35%, transparent 36%)",
  backgroundSize: "3px 3px",
  mixBlendMode: "multiply",
};

export function getShaderStyles(id: ShaderId): ShaderStyles {
  switch (id) {
    case "crt":
      return { extraCanvasFilter: "contrast(1.1) saturate(1.05)", overlay: CRT_OVERLAY };
    case "lcd":
      return { extraCanvasFilter: "brightness(1.05) contrast(1.05)", overlay: LCD_GRID_OVERLAY };
    case "scanlines":
      return { extraCanvasFilter: "contrast(1.05)", overlay: SCANLINE_OVERLAY(2, 0.32) };
    case "dot-matrix":
      // Greenscale tint mimics the original Game Boy DMG screen.
      return {
        extraCanvasFilter: "grayscale(1) sepia(1) hue-rotate(50deg) saturate(2) brightness(0.95)",
        overlay: DOT_MATRIX_OVERLAY,
      };
    case "off":
    default:
      return { extraCanvasFilter: "", overlay: null };
  }
}

/** Compose two CSS filter strings, dropping `none`/empty parts. */
export function composeFilters(...parts: string[]): string {
  const cleaned = parts.map((p) => (p ?? "").trim()).filter((p) => p && p !== "none");
  return cleaned.length ? cleaned.join(" ") : "none";
}
