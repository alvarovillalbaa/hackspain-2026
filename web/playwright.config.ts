import { defineConfig, devices } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

/** Eve requires Node 24; prefer nvm's v24 when the shell still has 22. */
function node24BinDir(): string | null {
  if (process.versions.node.startsWith("24.")) {
    return null;
  }
  const nvmRoot = process.env.NVM_DIR ?? join(homedir(), ".nvm");
  const versionsDir = join(nvmRoot, "versions", "node");
  try {
    const match = readdirSync(versionsDir)
      .filter((name) => /^v24\./.test(name))
      .sort()
      .at(-1);
    if (!match) return null;
    const candidate = join(versionsDir, match, "bin");
    return existsSync(join(candidate, "node")) ? candidate : null;
  } catch {
    return null;
  }
}

const node24 = node24BinDir();
const webServerEnv: Record<string, string> = Object.fromEntries(
  Object.entries(
    node24
      ? { ...process.env, PATH: `${node24}:${process.env.PATH ?? ""}` }
      : process.env
  ).filter((entry): entry is [string, string] => entry[1] != null)
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: webServerEnv,
  },
});
