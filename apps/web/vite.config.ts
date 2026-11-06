import type { IncomingMessage } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The API server, which `npm run dev` starts, for `npm run dev:web`. */
const API_SERVER = "http://localhost:3000";

/** The authorization level of an administrator, who gets EJS pages for now. */
const ADMINISTRATOR = 10;

const toApiServer = {
  target: API_SERVER,
  // The server refuses changes from other sites, and in development this page
  // comes from Vite's address. In production they're one site.
  headers: { origin: API_SERVER },
};

/**
 * For the pages where the server chooses by session. Whoever qualifies gets
 * Vite's copy of the React app, since the server's would be the last build, and
 * everyone else gets the server's page, as in production.
 * @param qualifies decides by the signed-in user's authorization level
 * @returns the proxy's settings
 */
function toReactFor(qualifies: (authorizationLevel: number) => boolean) {
  return {
    ...toApiServer,
    bypass: async (req: IncomingMessage) => {
      const response = await fetch(`${API_SERVER}/api/v1/sessions/current`, {
        headers: { cookie: req.headers.cookie ?? "" },
      });
      if (!response.ok) {
        return undefined;
      }
      const { user } = (await response.json()) as {
        user: { authorizationLevel: number };
      };
      return qualifies(user.authorizationLevel) ? "/index.html" : undefined;
    },
  };
}

const toReactForPlayers = toReactFor((level) => level < ADMINISTRATOR);

export default defineConfig({
  plugins: [react()],
  build: {
    // Inlined files would be data: URLs, which the Content Security Policy
    // doesn't allow for fonts.
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        // Stable names for the shared libraries, so that .size-limit.json can
        // count them. Left alone, each chunk is named after whichever module
        // happens to be in it.
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
    // Vite serves the React app. Everything else comes from the API server:
    // the API, uploaded media, and the pages not yet moved to React.
    proxy: {
      "/api": { ...toApiServer, ws: true },
      "^/$": toReactForPlayers,
      "^/quest/(?!new$)[^/]+$": toReactForPlayers,
      "^/quest/[^/]+/puzzle/[^/]+$": toReactFor(() => true),
      "^/(login|logout)$": toApiServer,
      "^/(user|puzzle|quest|monitor)/": toApiServer,
      "^/(puzzleData|script|style|image|policies|vendor)/": toApiServer,
    },
  },
});
