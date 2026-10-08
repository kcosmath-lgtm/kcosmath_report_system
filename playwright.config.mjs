import { defineConfig } from "@playwright/test";
try { process.loadEnvFile(".env.local"); } catch { /* CI may provide environment variables directly. */ }
const port = process.env.PLAYWRIGHT_PORT || "3100";
export default defineConfig({
  testDir: "./tests/browser", timeout: 45_000, workers: 1,
  use: { baseURL: `http://localhost:${port}`, channel: "chrome", headless: true, viewport: { width: 1440, height: 1000 } },
  webServer: { command: `npm run start -- --port ${port}`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 60_000 },
});
