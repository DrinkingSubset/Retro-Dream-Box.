/**
 * Preload EmulatorJS cores into the browser's HTTP cache so booting a ROM
 * doesn't trigger a fresh download every time. Called once on app start.
 *
 * EmulatorJS serves cores from a versioned CDN path. The exact filenames
 * are resolved by the loader at boot, but fetching the loader + the WASM
 * "data" archives for each core warms the cache so subsequent boots are
 * effectively instant.
 */

const CDN = "https://cdn.emulatorjs.org/stable/data/";

// Core slugs we ship support for. Keep aligned with CORE_MAP in Play.tsx.
const CORES = ["mgba", "gambatte", "fceumm"] as const;

let started = false;

export function preloadEmulatorCores() {
  if (started) return;
  started = true;

  const urls = [
    `${CDN}loader.js`,
    `${CDN}emulator.min.js`,
    `${CDN}emulator.min.css`,
    ...CORES.flatMap((c) => [
      `${CDN}cores/${c}-wasm.data`,
      `${CDN}cores/${c}-wasm.js`,
    ]),
  ];

  // Fire-and-forget. Failures are fine — boot will retry on demand.
  for (const url of urls) {
    fetch(url, { cache: "force-cache", mode: "cors" }).catch(() => {});
  }
}
