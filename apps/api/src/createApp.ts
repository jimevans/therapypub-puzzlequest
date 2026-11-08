import compression from "compression";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { sendWebAppNotFound } from "./controllers/web.controller.js";
import { sendErrorPage } from "./errorPage.js";
import { contentSecurityPolicy } from "./middleware/contentSecurityPolicy.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { logRequests } from "./middleware/requestLogging.js";
import { requireSameOrigin } from "./middleware/sameOrigin.js";
import { publicDirectory, puzzleDataDirectory } from "./paths.js";
import { V1Router } from "./api/v1/index.js";
import { AdminRouter } from "./routes/admin.js";
import { ApiReferenceRouter } from "./routes/apiReference.js";
import { HealthRouter } from "./routes/health.js";
import { IndexRouter } from "./routes/index.js";
import { QuestRouter } from "./routes/quest.js";
import { UserRouter } from "./routes/user.js";
import { WebRouter } from "./routes/web.js";

/**
 * Creates the Express application. This has no side effects: it does not
 * connect to the database or listen on a port (see app.js), so tests can
 * create an app and send requests to it directly.
 * @returns the configured application
 */
export function createApp(): Express {
  const app = express();

  // First, so every request has an ID, and its handling is logged with it.
  app.use(logRequests);

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

  app.use(contentSecurityPolicy);

  app.use(HealthRouter);

  app.use(compression());

  // Bodies are limited to 100 KB; uploads go through multer, which has its
  // own limits.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(publicDirectory));
  app.use("/puzzleData", express.static(puzzleDataDirectory));
  app.use(WebRouter);

  app.use(cookieParser());
  app.use(requireSameOrigin);

  app.use("/", IndexRouter);
  app.use(AdminRouter);

  // The API, for the pages' scripts and for apps, and its reference.
  app.use("/api/v1/docs", ApiReferenceRouter);
  app.use("/api/v1", V1Router);

  // The pages.
  app.use("/user", UserRouter);
  app.use("/quest", QuestRouter);

  // Any other address. A page the React app doesn't have gets the app, which
  // says so in its own words, with a 404 status; a missing file, or an address
  // in the API, gets the server's own error page.
  app.use((req, res) => {
    const isPage =
      (req.method === "GET" || req.method === "HEAD") &&
      !/\.[^/]*$/.test(req.path) &&
      !req.path.startsWith("/api/") &&
      !req.path.startsWith("/puzzleData/");
    if (isPage) {
      sendWebAppNotFound(req, res);
      return;
    }
    sendErrorPage(res, 404, "Not found", "There's nothing at this address.");
  });

  // Must be registered after every route.
  app.use(errorHandler);

  return app;
}
