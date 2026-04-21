import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      // Disable SW in dev — it interferes with HMR and the Lovable preview iframe.
      devOptions: { enabled: false },
      // Don't auto-inject the registration script; we register manually in main.tsx
      // so we can skip registration inside iframes (Lovable preview).
      injectRegister: null,
      includeAssets: ["favicon.ico", "robots.txt", "apple-touch-icon.png"],
      workbox: {
        // OAuth callback must always hit the network — never cached.
        navigateFallbackDenylist: [/^\/~oauth/, /^\/auth\/callback/],
        // EmulatorJS cores are huge (mGBA ~2MB) — don't bundle in precache.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
      manifest: {
        name: "Retro Play",
        short_name: "Retro Play",
        description: "Web emulator for Game Boy Advance, Game Boy Color, and NES.",
        theme_color: "#1a0b2e",
        background_color: "#1a0b2e",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
