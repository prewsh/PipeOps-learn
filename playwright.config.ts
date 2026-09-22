import { defineConfig, devices } from "@playwright/test";

/**
 * E2E is the primary testing mechanism here (AGENTS.md section 10).
 *
 * Two things this config exists to guarantee:
 *  1. Runs are repeatable — fully deterministic seed + fixed clock, so the same
 *     inputs always produce the same artifact.
 *  2. Runs leave a verifiable artifact behind in e2e/artifacts/<run-id>/.
 */
const RUN_ID = process.env.E2E_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_DIR = `e2e/artifacts/${RUN_ID}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: `${ARTIFACT_DIR}/test-results`,
  fullyParallel: false, // shared seeded cohort state — order matters
  forbidOnly: !!process.env.CI,
  retries: 0, // a flaky E2E test is a broken test, not one to retry
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: `${ARTIFACT_DIR}/summary.json` }],
    ["html", { outputFolder: `${ARTIFACT_DIR}/report`, open: "never" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
    timezoneId: "Africa/Lagos", // participants see cohort time
  },
  projects: [
    // Mobile first — the floor the design system sets is 360px.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
