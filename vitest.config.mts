import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the React Server environment; tests run
      // server code directly in Node, so replace it with an empty module.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // First run downloads the MongoDB binary; database tests can be slow on cold start.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Run tests with a non-IST system timezone to prove date helpers do not
    // depend on the server's local time.
    env: { TZ: "UTC" },
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/services/**"],
    },
  },
});
