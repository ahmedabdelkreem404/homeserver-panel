import { defineConfig } from "@playwright/test";

// The panel runs for real in Docker (Node 24, built frontend, real Dokploy read access); see e2e/global-setup.js.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.js",
  globalTeardown: "./e2e/global-teardown.js",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", locale: "ar-EG", trace: "off", screenshot: "off" },
  projects: [{ name: "desktop", use: { viewport: { width: 1280, height: 800 } } }],
});
