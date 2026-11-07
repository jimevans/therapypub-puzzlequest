import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The API server, which `npm run dev` starts, for `npm run dev:web`. */
const API_SERVER = "http://localhost:3000";

const toApiServer = {
  target: API_SERVER,
  // The server refuses changes from other sites, and in development this page
  // comes from Vite's address. In production they're one site.
  headers: { origin: API_SERVER },
};

export default defineConfig({
  plugins: [react()],
  build: {
    // Inlined files would be data: URLs, which the Content Security Policy
    // doesn't allow for fonts.
    assetsInlineLimit: 0,
    // esbuild, rather than Vite's default, Lightning CSS. Since 7 November
    // 2026, Lightning CSS's Linux library fails to load on the host, which
    // stops the deployment's build; esbuild's Linux program needs nothing from
    // the host's system libraries.
    cssMinify: "esbuild",
    // Lists what each source file loads, for the size budgets (.size-limit.mjs).
    manifest: true,
    rolldownOptions: {
      output: {
        // The libraries, apart from the app's code, so that a change to the app
        // leaves them in the browser's cache.
        advancedChunks: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            },
            { name: "query", test: /node_modules[\\/]@tanstack[\\/]/ },
            {
              name: "aria",
              test: /node_modules[\\/](@react-aria|@react-stately|@react-types|@internationalized|react-aria|react-aria-components|react-stately)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    // Vite serves the React app for every page. The rest comes from the API
    // server: the API, signing out, uploaded media, and its own static files.
    // The server's checks before a page (such as sending someone signed out to
    // sign in) don't happen here; the app's own handling of the API's answers
    // does the same job.
    proxy: {
      "/api": { ...toApiServer, ws: true },
      "^/logout$": toApiServer,
      "^/(puzzleData|style|image|policies)/": toApiServer,
    },
  },
});
