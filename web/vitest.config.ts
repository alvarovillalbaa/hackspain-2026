import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    exclude: [
      "tests/e2e/**",
      "tests/tmp/**",
      "node_modules/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "lib/xray/**/*.ts",
        "lib/ai/**/*.ts",
      ],
      exclude: [
        "lib/xray/dataset/**",
        "lib/xray/registry/**",
        "lib/xray/marketplace-orchestrator.ts",
        "lib/xray/index.ts",
        "lib/xray/slack-status.ts",
        "lib/xray/watch-queue-server.ts",
        "lib/xray/watch-on-import.ts",
        // Blob/HTTP side-effects — covered by integration + store memory path tests.
        "lib/xray/store.ts",
        "lib/xray/slack-webhook.ts",
        "**/*.test.ts",
        "**/types.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 65,
      },
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, ".") },
      {
        find: /^#(.+)$/,
        replacement: path.resolve(__dirname, "agent") + "/$1",
      },
    ],
  },
});
