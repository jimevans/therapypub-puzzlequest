import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { config } from "./config.js";
import {
  contentSecurityPolicy,
  createScriptNonce,
} from "./middleware/contentSecurityPolicy.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireSameOrigin } from "./middleware/sameOrigin.js";
import { publicDirectory, viewsDirectory } from "./paths.js";
import { V1Router } from "./api/v1/index.js";
import { IndexRouter } from "./routes/index.js";
import { MessagingApiRouter } from "./routes/api.messaging.js";
import { QuestApiRouter } from "./routes/api.quest.js";
import { MonitorRouter } from "./routes/monitor.js";
import { PuzzleRouter } from "./routes/puzzle.js";
import { QuestRouter } from "./routes/quest.js";
import { UserRouter } from "./routes/user.js";

// Browser build of marked, served from the installed package so that its
// version is pinned by the lockfile and matches the version used on the server.
// The package's entry point is a self-contained ES module.
const markedBrowserModule = fileURLToPath(import.meta.resolve("marked"));

/**
 * Creates the Express application. This has no side effects: it does not
 * connect to the database or listen on a port (see app.js), so tests can
 * create an app and send requests to it directly.
 * @returns the configured application
 */
export function createApp(): Express {
  const app = express();

  if (config.PQ_TRUST_PROXY !== undefined) {
    // Required behind a reverse proxy (such as cPanel's Apache front end) so
    // that client IP addresses, and therefore rate limits, are per client.
    app.set("trust proxy", config.PQ_TRUST_PROXY);
  }

  app.use(
    helmet({
      // Added separately (see contentSecurityPolicy.ts), with nonces for the
      // pages' inline scripts.
      contentSecurityPolicy: false,
      // helmet's default, no-referrer, makes browsers send "Origin: null" on
      // form posts and fetches, which would defeat checking where requests
      // come from. This is the browsers' own default.
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      // Not for subdomains, which the host may serve over plain HTTP.
      strictTransportSecurity: {
        maxAge: 365 * 24 * 60 * 60,
        includeSubDomains: false,
      },
    })
  );

  app.use(createScriptNonce, contentSecurityPolicy);

  // Bodies are limited to 100 KB; uploads go through multer, which has its
  // own limits.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(publicDirectory));

  app.get("/vendor/marked.esm.js", (req, res) => {
    res.sendFile(markedBrowserModule);
  });

  app.use(cookieParser());
  app.use(requireSameOrigin);

  app.use("/", IndexRouter);

  // The v1 API, which the older API routes below are moving to.
  app.use("/api/v1", V1Router);

  // API routes for data manipulation
  app.use("/api/quest", QuestApiRouter);
  app.use("/api/messaging", MessagingApiRouter);

  // UI routes for data display
  app.use("/user", UserRouter);
  app.use("/puzzle", PuzzleRouter);
  app.use("/quest", QuestRouter);
  app.use("/monitor", MonitorRouter);

  app.set("views", viewsDirectory);
  app.set("view engine", "ejs");

  // Must be registered after every route.
  app.use(errorHandler);

  return app;
}
