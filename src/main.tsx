import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { preloadEmulatorCores } from "./lib/corePreload";

createRoot(document.getElementById("root")!).render(<App />);

// Warm the emulator core caches as soon as the app boots.
preloadEmulatorCores();

// Register the service worker — but NEVER inside an iframe (Lovable preview)
// and only in production builds. This prevents stale-content / HMR conflicts
// while still giving installed PWA users true offline support.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

if (import.meta.env.PROD && !isInIframe && "serviceWorker" in navigator) {
  registerSW({ immediate: true });
}
