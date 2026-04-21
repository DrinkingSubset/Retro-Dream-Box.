import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.745b9e3c7e5c445197b16aeb06cc74f6",
  appName: "retrodreambox",
  webDir: "dist",
  // Hot-reload from the Lovable sandbox preview while developing on a real device.
  // Once you're ready to ship a real build, remove the `server` block, run
  // `npm run build` then `npx cap sync` so the app loads bundled assets instead.
  server: {
    url: "https://745b9e3c-7e5c-4451-97b1-6aeb06cc74f6.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  android: {
    backgroundColor: "#1a0b2e",
  },
  ios: {
    backgroundColor: "#1a0b2e",
    contentInset: "always",
  },
};

export default config;
