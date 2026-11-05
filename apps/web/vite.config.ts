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
  },
  server: {
    // Vite serves the React app. Everything else comes from the API server:
    // the API, uploaded media, and the pages not yet moved to React.
    proxy: {
      "/api": { ...toApiServer, ws: true },
      "^/$": toApiServer,
      "^/(login|logout)$": toApiServer,
      "^/(user|puzzle|quest|monitor)/": toApiServer,
      "^/(puzzleData|script|style|image|policies|vendor)/": toApiServer,
    },
  },
});
