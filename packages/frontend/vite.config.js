import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API base URL is a build-time value only (VITE_API_BASE_URL); empty means same origin, which is how the panel is served.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, target: "es2022", assetsInlineLimit: 0 }, // nothing is inlined: the CSP allows no data: fonts or scripts
  server: { port: 5173, proxy: { "/api": process.env.PANEL_DEV_API ?? "http://localhost:3000" } },
  test: { include: ["test/**/*.test.{js,jsx}"], environment: "jsdom", globals: true, setupFiles: ["./test/setup.js"], css: false },
});
