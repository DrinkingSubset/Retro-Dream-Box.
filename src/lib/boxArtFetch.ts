import type { SystemId } from "./gameStore";

/**
 * Fetch box-art from the public libretro-thumbnails repository on GitHub.
 * The repo is structured as one folder per system, with three subfolders
 * (`Named_Boxarts`, `Named_Snaps`, `Named_Titles`) and PNG files named
 * after the canonical no-intro ROM name.
 *
 * We can't list a directory via the raw CDN, but we can hit the GitHub
 * tree API to discover candidate filenames once and cache the result in
 * sessionStorage. Subsequent lookups are an in-memory map operation.
 */

const REPOS: Record<SystemId, string> = {
  gba: "libretro-thumbnails/Nintendo_-_Game_Boy_Advance",
  gbc: "libretro-thumbnails/Nintendo_-_Game_Boy_Color",
  nes: "libretro-thumbnails/Nintendo_-_Nintendo_Entertainment_System",
};

const CDN_BASE = "https://raw.githubusercontent.com";
const API_BASE = "https://api.github.com/repos";

interface IndexEntry {
  name: string; // filename without extension
  path: string; // full path inside repo
}

const indexCache = new Map<SystemId, IndexEntry[]>();

async function loadIndex(system: SystemId): Promise<IndexEntry[]> {
  if (indexCache.has(system)) return indexCache.get(system)!;
  const cacheKey = `boxart-index-${system}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as IndexEntry[];
      indexCache.set(system, parsed);
      return parsed;
    }
  } catch { /* ignore */ }

  const repo = REPOS[system];
  // The `master` tree with recursive=1 lists every file in the repo.
  const res = await fetch(`${API_BASE}/${repo}/git/trees/master?recursive=1`);
  if (!res.ok) throw new Error(`Box art index unavailable (${res.status})`);
  const json = (await res.json()) as { tree: { path: string; type: string }[] };
  const entries: IndexEntry[] = json.tree
    .filter((t) => t.type === "blob" && t.path.startsWith("Named_Boxarts/") && t.path.endsWith(".png"))
    .map((t) => ({
      path: t.path,
      name: t.path.replace(/^Named_Boxarts\//, "").replace(/\.png$/, ""),
    }));
  indexCache.set(system, entries);
  try { sessionStorage.setItem(cacheKey, JSON.stringify(entries)); } catch { /* quota */ }
  return entries;
}

/** Lower-case, strip non-alphanumerics for fuzzy matching. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface BoxArtMatch {
  url: string;
  matchedName: string;
}

/**
 * Find the closest box-art image for a game by fuzzy name match. Returns
 * `null` when no reasonable match exists so the caller can fall back to
 * the placeholder gradient.
 */
export async function fetchBoxArt(name: string, system: SystemId): Promise<BoxArtMatch | null> {
  const entries = await loadIndex(system);
  const target = normalise(name);
  if (!target) return null;

  // 1. Exact (normalised) match.
  let best: IndexEntry | null = null;
  let bestScore = 0;
  for (const e of entries) {
    const candidate = normalise(e.name);
    if (candidate === target) { best = e; bestScore = 1000; break; }
    // 2. Contains match — prefer the shorter name (less noise).
    if (candidate.includes(target) || target.includes(candidate)) {
      const score = 500 - Math.abs(candidate.length - target.length);
      if (score > bestScore) { best = e; bestScore = score; }
    }
  }
  if (!best) return null;

  const repo = REPOS[system];
  const url = `${CDN_BASE}/${repo}/master/${best.path}`;
  return { url, matchedName: best.name };
}

/** Fetch the box-art image and return it as a data URL for IndexedDB storage. */
export async function fetchBoxArtAsDataUrl(name: string, system: SystemId): Promise<string | null> {
  const match = await fetchBoxArt(name, system);
  if (!match) return null;
  const res = await fetch(match.url);
  if (!res.ok) return null;
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
