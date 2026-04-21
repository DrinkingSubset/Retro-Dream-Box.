import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker — but NEVER inside an iframe (Lovable preview)
// and only in production builds. This prevents stale-content / HMR conflicts
// while still giving installed PWA users true offline support.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

if (import.meta.env.PROD && !isInIframe && "serviceWorker" in navigator) {
  registerSW({ immediate: true });
}
