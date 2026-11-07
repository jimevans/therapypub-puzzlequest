import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { rolldown } from "rolldown";
import { type Plugin, defineConfig } from "vite";

/** The API server, which `npm run dev` starts, for `npm run dev:web`. */
const API_SERVER = "http://localhost:3000";

const toApiServer = {
  target: API_SERVER,
  // The server refuses changes from other sites, and in development this page
  // comes from Vite's address. In production they're one site.
  headers: { origin: API_SERVER },
};

/**
 * Builds the service worker (src/serviceWorker/sw.ts) into dist/sw.js, after
 * the app. It's bundled on its own, as one script with no imports, since not
 * every browser runs a service worker that's a module; and written in with what
 * it needs to know about the app's build.
 * @returns the plugin
 */
function serviceWorker(): Plugin {
  let firstLoad: string[] = [];
  let assets: string[] = [];
  return {
    name: "puzzlequest-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      assets = files
        .map(({ fileName }) => `/${fileName}`)
        .filter((file) => file.startsWith("/assets/"))
        .sort();
      // The app's entry and the scripts and styles it imports at once.
      const found = new Set<string>();
      const visit = (fileName: string) => {
        const chunk = bundle[fileName];
        if (found.has(fileName) || chunk?.type !== "chunk") {
          return;
        }
        found.add(fileName);
        chunk.viteMetadata?.importedCss.forEach((css) => found.add(css));
        chunk.imports.forEach(visit);
      };
      files
        .filter((file) => file.type === "chunk" && file.isEntry)
        .forEach((entry) => visit(entry.fileName));
      firstLoad = [...found].map((file) => `/${file}`).sort();
    },
    async writeBundle(options) {
      const build = await rolldown({
        input: path.resolve(import.meta.dirname, "src/serviceWorker/sw.ts"),
      });
      const { output } = await build.generate({ format: "iife", minify: true });
      await build.close();
      const info = {
        // Changes whenever a built file does, since their names do.
        version: createHash("sha256")
          .update(assets.join("\n"))
          .digest("hex")
          .slice(0, 16),
        firstLoad,
        assets,
      };
      writeFileSync(
        path.join(options.dir ?? "dist", "sw.js"),
        `const PUZZLEQUEST_BUILD = ${JSON.stringify(info)};\n${output[0].code}`
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
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
