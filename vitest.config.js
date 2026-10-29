import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    setupFiles: ["test/setup.js"],
    // Settings the configuration module requires. Tests never read src/.env.
    env: {
      PQ_MONGODB_URI: "mongodb://127.0.0.1:27017/puzzlequest_test",
      PQ_SECRET_KEY: "test-secret-key-at-least-32-characters-long",
    },
  },
});
