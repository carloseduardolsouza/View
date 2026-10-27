import { defineConfig } from "@playwright/test";

// Uses the already-running `npm run dev` servers and the installed Chrome (no browser download).
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1, // tests share Orthanc + the annotations DB
  retries: 0,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { screenshot: "only-on-failure", baseURL: "http://localhost:5173", channel: "chrome", headless: true, launchOptions: { args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }, viewport: { width: 1600, height: 900 } },
  webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: true, timeout: 120_000 },
});
