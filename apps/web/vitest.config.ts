import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["src/test/setup.ts"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        // The service worker runs in browsers' worker, not here: the browser
        // tests cover it, and its decisions are tested in routing.test.ts.
        exclude: ["src/main.tsx", "src/test/**", "src/serviceWorker/sw.ts"],
      },
    },
  })
);
