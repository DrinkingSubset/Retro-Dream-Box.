/**
 * Delta skin loader.
 *
 * A `.deltaskin` is a zip archive containing:
 *   - info.json   — layout, hit regions, mappingSize for each device/orientation
 *   - one or more PDFs (e.g. iphone_portrait.pdf, iphone_landscape.pdf)
 *
 * We unzip in the browser, parse info.json, and rasterise the relevant PDF
 * to a PNG data URL via PDF.js. The rendered image becomes the controller
 * background; touch buttons are positioned over the hit regions.
 *
 * NOTE: We use the legacy build of PDF.js so the worker can be bundled by
 * Vite as a static asset — no separate hosting required.
 */
import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist";
// Vite-bundled PDF.js worker. The `?url` suffix gives us a static URL.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { get as idbGet, set as idbSet, createStore } from "idb-keyval";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * IndexedDB store for cached rendered skin representations.
 * Key: `${skinUrl}::${orientation}` → cached PNG data URL + metadata.
 * This avoids re-rasterising the same PDF every time a game opens.
 */
const SKIN_CACHE_VERSION = 1;
const skinStore = createStore("delta-skin-cache", "rendered-v1");

interface CachedRep {
  v: number;
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
}

/** Logical input names recognised by Delta skins. */
export type DeltaInput =
  | "up" | "down" | "left" | "right"
  | "a" | "b" | "x" | "y"
  | "l" | "r" | "l2" | "r2"
  | "start" | "select" | "menu"
  | "thumbstick";

export interface SkinFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SkinExtendedEdges {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface SkinItem {
  /** Either a string→string mapping (D-pad) or an array of input names. */
  inputs: Record<string, string> | string[];
  frame: SkinFrame;
  extendedEdges?: SkinExtendedEdges;
  /** Thumbstick metadata, if this is a thumbstick item. */
  thumbstick?: { name: string; width: number; height: number };
}

export interface SkinRepresentation {
  assets: { resizable?: string; small?: string; medium?: string; large?: string };
  items: SkinItem[];
  mappingSize: { width: number; height: number };
  extendedEdges?: SkinExtendedEdges;
  translucent?: boolean;
}

export interface ParsedSkin {
  /** Display name from info.json. */
  name: string;
  identifier: string;
  /** Portrait representation (with rendered background image). */
  portrait: RenderedRepresentation;
  /** Landscape representation (with rendered background image). */
  landscape: RenderedRepresentation;
}

export interface RenderedRepresentation {
  imageDataUrl: string;
  /** Native pixel size of the rendered PDF. */
  imageWidth: number;
  imageHeight: number;
  /** Logical mapping size from info.json — coords for hit regions. */
  mappingWidth: number;
  mappingHeight: number;
  items: SkinItem[];
  extendedEdges?: SkinExtendedEdges;
  translucent: boolean;
}

const cache = new Map<string, Promise<ParsedSkin>>();

/**
 * Render a single page of a PDF (loaded from a Uint8Array) to a PNG data URL.
 * Scale is chosen so the long edge is around 1400px — sharp on retina without
 * blowing up memory.
 */
async function renderPdfToImage(
  pdfBytes: Uint8Array,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const loadingTask = pdfjs.getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const longEdge = Math.max(baseViewport.width, baseViewport.height);
    const scale = Math.min(3, Math.max(1.2, 1400 / longEdge));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    await page.render({ canvasContext: ctx, viewport }).promise;
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    await pdf.destroy();
  }
}

/**
 * Fetch and parse a `.deltaskin` archive. Results are cached per URL so the
 * same skin isn't re-rendered on every screen switch.
 */
export function loadDeltaSkin(url: string): Promise<ParsedSkin> {
  const existing = cache.get(url);
  if (existing) return existing;

  const promise = (async (): Promise<ParsedSkin> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Skin fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const infoFile = zip.file("info.json");
    if (!infoFile) throw new Error("Skin is missing info.json");
    const info = JSON.parse(await infoFile.async("string"));

    const reps = info?.representations?.iphone?.standard;
    if (!reps?.portrait || !reps?.landscape) {
      throw new Error("Skin missing iphone/standard representations");
    }

    async function renderRep(rep: SkinRepresentation): Promise<RenderedRepresentation> {
      const pdfName = rep.assets?.resizable ?? rep.assets?.large ?? rep.assets?.medium ?? rep.assets?.small;
      if (!pdfName) throw new Error("Representation missing PDF asset");
      const pdfFile = zip.file(pdfName);
      if (!pdfFile) throw new Error(`Skin missing PDF asset: ${pdfName}`);
      const pdfBytes = new Uint8Array(await pdfFile.async("arraybuffer"));
      const rendered = await renderPdfToImage(pdfBytes);
      return {
        imageDataUrl: rendered.dataUrl,
        imageWidth: rendered.width,
        imageHeight: rendered.height,
        mappingWidth: rep.mappingSize.width,
        mappingHeight: rep.mappingSize.height,
        items: rep.items,
        extendedEdges: rep.extendedEdges,
        translucent: !!rep.translucent,
      };
    }

    const [portrait, landscape] = await Promise.all([
      renderRep(reps.portrait),
      renderRep(reps.landscape),
    ]);

    return {
      name: info.name ?? "Skin",
      identifier: info.identifier ?? url,
      portrait,
      landscape,
    };
  })();

  cache.set(url, promise);
  // Drop failed loads from cache so a refresh can retry.
  promise.catch(() => cache.delete(url));
  return promise;
}

/**
 * Flatten a SkinItem's inputs into a list of canonical input names.
 * D-pad items have `{up, down, left, right}` so we expand to all four.
 */
export function expandInputs(item: SkinItem): DeltaInput[] {
  if (Array.isArray(item.inputs)) return item.inputs as DeltaInput[];
  return Object.values(item.inputs) as DeltaInput[];
}
