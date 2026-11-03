import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Settings the configuration module requires. Tests never read src/.env.
    env: {
      PQ_MONGODB_URI: "mongodb://127.0.0.1:27017/puzzlequest_test",
      PQ_SECRET_KEY: "test-secret-key-at-least-32-characters-long",
    },
    // `npm run test:coverage` measures coverage of the server code. The game
    // rules in src/domain must be fully covered; the rest has no threshold
    // yet.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: {
        "src/domain/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
});
