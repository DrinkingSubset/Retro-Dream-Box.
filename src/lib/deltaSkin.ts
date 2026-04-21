/**
 * Delta skin loader.
 *
 * A `.deltaskin` is a zip archive containing:
 *   - info.json   — layout, hit regions, mappingSize for each device/orientation
 *   - one or more artwork assets (PDF, PNG, JPG, WEBP)
 *
 * We unzip in the browser, parse info.json, and rasterise the relevant
 * artwork asset to a PNG data URL. The rendered image becomes the controller
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
import { resolveCustomSkinUrl, CUSTOM_SKIN_PREFIX } from "@/lib/customSkinStore";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * IndexedDB store for cached rendered skin representations.
 * Key: `${skinUrl}::${orientation}` → cached PNG data URL + metadata.
 * This avoids re-rasterising the same PDF every time a game opens.
 */
const SKIN_CACHE_VERSION = 4;
const skinStore = createStore("delta-skin-cache", "rendered-v4");

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

export interface SkinScreen {
  /** Source rect in the emulator framebuffer. We don't use this — EJS handles it. */
  inputFrame?: SkinFrame;
  /** Where the game screen should appear, in mappingSize coordinates. */
  outputFrame: SkinFrame;
}

export interface SkinRepresentation {
  assets: { resizable?: string; small?: string; medium?: string; large?: string };
  items: SkinItem[];
  /** Optional explicit screen placement(s). When present, infer logic is skipped. */
  screens?: SkinScreen[];
  mappingSize: { width: number; height: number };
  extendedEdges?: SkinExtendedEdges;
  translucent?: boolean;
}

export interface ParsedSkin {
  /** Display name from info.json. */
  name: string;
  identifier: string;
  /** Standard (iPhone home-button) representation. */
  portrait: RenderedRepresentation;
  landscape: RenderedRepresentation;
  /** Optional edgeToEdge (notched / tall-screen) representations. Better
   *  fit for very tall viewports like the Galaxy Z Fold cover screen. */
  portraitEdge?: RenderedRepresentation;
  landscapeEdge?: RenderedRepresentation;
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
  screens?: SkinScreen[];
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

async function renderBitmapToImage(
  imageBytes: Uint8Array,
  mimeType: string,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const bytes = new Uint8Array(imageBytes.byteLength);
  bytes.set(imageBytes);
  const blob = new Blob([bytes.buffer], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Invalid image asset"));
      img.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    ctx.drawImage(image, 0, 0);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderSkinAssetToImage(
  assetName: string,
  assetBytes: Uint8Array,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const normalized = assetName.toLowerCase();
  if (normalized.endsWith(".pdf")) return renderPdfToImage(assetBytes);
  if (normalized.endsWith(".png")) return renderBitmapToImage(assetBytes, "image/png");
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return renderBitmapToImage(assetBytes, "image/jpeg");
  }
  if (normalized.endsWith(".webp")) return renderBitmapToImage(assetBytes, "image/webp");
  throw new Error(`Unsupported skin asset: ${assetName}`);
}

/**
 * Fetch and parse a `.deltaskin` archive. Results are cached per URL so the
 * same skin isn't re-rendered on every screen switch.
 */
export function loadDeltaSkin(url: string): Promise<ParsedSkin> {
  const existing = cache.get(url);
  if (existing) return existing;

  const promise = (async (): Promise<ParsedSkin> => {
    type StrippedRep = Omit<RenderedRepresentation, "imageDataUrl" | "imageWidth" | "imageHeight">;
    type CachedMeta = {
      v: number;
      name: string;
      identifier: string;
      portrait: StrippedRep;
      landscape: StrippedRep;
      portraitEdge?: StrippedRep;
      landscapeEdge?: StrippedRep;
    };

    // Try IndexedDB cache first.
    try {
      const [cP, cL, cPE, cLE, cMeta] = await Promise.all([
        idbGet<CachedRep>(`${url}::portrait`, skinStore),
        idbGet<CachedRep>(`${url}::landscape`, skinStore),
        idbGet<CachedRep>(`${url}::portraitEdge`, skinStore),
        idbGet<CachedRep>(`${url}::landscapeEdge`, skinStore),
        idbGet<CachedMeta>(`${url}::meta`, skinStore),
      ]);
      if (cMeta?.v === SKIN_CACHE_VERSION && cP?.v === SKIN_CACHE_VERSION && cL?.v === SKIN_CACHE_VERSION) {
        const hydrate = (s: StrippedRep, c: CachedRep): RenderedRepresentation => ({
          ...s,
          imageDataUrl: c.imageDataUrl,
          imageWidth: c.imageWidth,
          imageHeight: c.imageHeight,
        });
        return {
          name: cMeta.name,
          identifier: cMeta.identifier,
          portrait: hydrate(cMeta.portrait, cP),
          landscape: hydrate(cMeta.landscape, cL),
          portraitEdge: cMeta.portraitEdge && cPE?.v === SKIN_CACHE_VERSION ? hydrate(cMeta.portraitEdge, cPE) : undefined,
          landscapeEdge: cMeta.landscapeEdge && cLE?.v === SKIN_CACHE_VERSION ? hydrate(cMeta.landscapeEdge, cLE) : undefined,
        };
      }
    } catch {
      // IndexedDB unavailable — fall through to network.
    }

    // Custom user-uploaded skins live in IndexedDB; resolve to a Blob URL
    // before the fetch. For built-in skins this is a no-op.
    let fetchUrl = url;
    if (url.startsWith(CUSTOM_SKIN_PREFIX)) {
      const blobUrl = await resolveCustomSkinUrl(url);
      if (!blobUrl) throw new Error("Custom skin not found in storage");
      fetchUrl = blobUrl;
    }
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`Skin fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const infoFile = zip.file("info.json");
    if (!infoFile) throw new Error("Skin is missing info.json");
    const info = JSON.parse(await infoFile.async("string"));

    const std = info?.representations?.iphone?.standard;
    const e2e = info?.representations?.iphone?.edgeToEdge;
    if (!std?.portrait || !std?.landscape) {
      throw new Error("Skin missing iphone/standard representations");
    }

    async function renderRep(rep: SkinRepresentation): Promise<RenderedRepresentation> {
      const assetName = rep.assets?.resizable ?? rep.assets?.large ?? rep.assets?.medium ?? rep.assets?.small;
      if (!assetName) throw new Error("Representation missing artwork asset");
      const assetFile = zip.file(assetName);
      if (!assetFile) throw new Error(`Skin missing artwork asset: ${assetName}`);
      const assetBytes = new Uint8Array(await assetFile.async("arraybuffer"));
      const rendered = await renderSkinAssetToImage(assetName, assetBytes);
      return {
        imageDataUrl: rendered.dataUrl,
        imageWidth: rendered.width,
        imageHeight: rendered.height,
        mappingWidth: rep.mappingSize.width,
        mappingHeight: rep.mappingSize.height,
        items: rep.items,
        screens: rep.screens,
        extendedEdges: rep.extendedEdges,
        translucent: !!rep.translucent,
      };
    }

    const [portrait, landscape, portraitEdge, landscapeEdge] = await Promise.all([
      renderRep(std.portrait),
      renderRep(std.landscape),
      e2e?.portrait ? renderRep(e2e.portrait) : Promise.resolve(undefined),
      e2e?.landscape ? renderRep(e2e.landscape) : Promise.resolve(undefined),
    ]);

    const result: ParsedSkin = {
      name: info.name ?? "Skin",
      identifier: info.identifier ?? url,
      portrait,
      landscape,
      portraitEdge: portraitEdge as RenderedRepresentation | undefined,
      landscapeEdge: landscapeEdge as RenderedRepresentation | undefined,
    };

    // Persist rendered PNGs + layout metadata. Fire-and-forget.
    const stripImage = (r: RenderedRepresentation): StrippedRep => {
      const { imageDataUrl: _i, imageWidth: _w, imageHeight: _h, ...rest } = r;
      void _i; void _w; void _h;
      return rest;
    };
    const setRep = (key: string, r: RenderedRepresentation) =>
      idbSet(key, {
        v: SKIN_CACHE_VERSION,
        imageDataUrl: r.imageDataUrl,
        imageWidth: r.imageWidth,
        imageHeight: r.imageHeight,
      }, skinStore);

    const writes: Promise<unknown>[] = [
      setRep(`${url}::portrait`, portrait),
      setRep(`${url}::landscape`, landscape),
      idbSet(`${url}::meta`, {
        v: SKIN_CACHE_VERSION,
        name: result.name,
        identifier: result.identifier,
        portrait: stripImage(portrait),
        landscape: stripImage(landscape),
        portraitEdge: result.portraitEdge ? stripImage(result.portraitEdge) : undefined,
        landscapeEdge: result.landscapeEdge ? stripImage(result.landscapeEdge) : undefined,
      } satisfies CachedMeta, skinStore),
    ];
    if (result.portraitEdge) writes.push(setRep(`${url}::portraitEdge`, result.portraitEdge));
    if (result.landscapeEdge) writes.push(setRep(`${url}::landscapeEdge`, result.landscapeEdge));
    Promise.all(writes).catch(() => { /* non-fatal */ });

    return result;
  })();

  cache.set(url, promise);
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

/**
 * Pick the best rendered representation for the current viewport. We
 * prefer the `edgeToEdge` variant when its mapping aspect ratio is closer
 * to the viewport — this is what makes the Galaxy Z Fold cover screen
 * (very tall) and unfolded inner screen (near-square) both look right.
 */
export function pickRepresentation(
  skin: ParsedSkin,
  orientation: "portrait" | "landscape",
  viewport: { width: number; height: number },
): RenderedRepresentation {
  const std = orientation === "portrait" ? skin.portrait : skin.landscape;
  const edge = orientation === "portrait" ? skin.portraitEdge : skin.landscapeEdge;
  if (!edge) return std;

  const targetAspect = viewport.width / Math.max(1, viewport.height);
  const stdAspect = std.mappingWidth / std.mappingHeight;
  const edgeAspect = edge.mappingWidth / edge.mappingHeight;

  return Math.abs(edgeAspect - targetAspect) < Math.abs(stdAspect - targetAspect)
    ? edge
    : std;
}

