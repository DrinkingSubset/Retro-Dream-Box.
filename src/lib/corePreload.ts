/**
 * Preload EmulatorJS cores into the browser's HTTP cache so booting a ROM
 * doesn't trigger a fresh download every time. Called once on app start.
 *
 * The mGBA core (Game Boy Advance) is the largest of the three we ship,
 * so we explicitly prioritise it: fetched first with high priority, while
 * the smaller GB/GBC + NES cores follow.
 */

const CDN = "https://cdn.emulatorjs.org/stable/data/";

// Ordered by size (largest first) so the slowest download starts immediately.
const CORES = ["mgba", "gambatte", "fceumm"] as const;

let started = false;

function prefetchHigh(url: string) {
  // Use <link rel="preload" as="fetch"> when supported — the browser treats
  // it as a higher priority than fetch() with credentials default.
  try {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "fetch";
    link.href = url;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  } catch {
    /* ignore */
  }
  // Also fire a force-cache fetch so the bytes actually land.
  fetch(url, { cache: "force-cache", mode: "cors" }).catch(() => {});
}

export function preloadEmulatorCores() {
  if (started) return;
  started = true;

  // Boot scripts first.
  for (const url of [`${CDN}loader.js`, `${CDN}emulator.min.js`, `${CDN}emulator.min.css`]) {
    prefetchHigh(url);
  }

  // Cores — mGBA first since it's the heaviest.
  for (const c of CORES) {
    prefetchHigh(`${CDN}cores/${c}-wasm.data`);
    prefetchHigh(`${CDN}cores/${c}-wasm.js`);
  }
}

/**
 * Aggressively warm a single core ahead of launch. Called when the user
 * taps a ROM tile — by the time the Play screen mounts, the core is
 * already in the disk cache.
 */
export function warmCore(slug: "mgba" | "gambatte" | "fceumm") {
  prefetchHigh(`${CDN}cores/${slug}-wasm.data`);
  prefetchHigh(`${CDN}cores/${slug}-wasm.js`);
}
