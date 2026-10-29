import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { IndexRouter } from "./routes/index.js";
import { MessagingApiRouter } from "./routes/api.messaging.js";
import { PuzzleApiRouter } from "./routes/api.puzzle.js";
import { QuestApiRouter } from "./routes/api.quest.js";
import { TeamApiRouter } from "./routes/api.team.js";
import { UserApiRouter } from "./routes/api.user.js";
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
 * @returns {import("express").Express} the configured application
 */
export function createApp() {
  const app = express();

  if (config.PQ_TRUST_PROXY !== undefined) {
    // Required behind a reverse proxy (such as cPanel's Apache front end) so
    // that client IP addresses, and therefore rate limits, are per client.
    app.set("trust proxy", config.PQ_TRUST_PROXY);
  }

  app.use(express.json());
  app.use(express.raw({ limit: "100mb", type: "application/octet-stream" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(import.meta.dirname, "public")));

  app.get("/vendor/marked.esm.js", (req, res) => {
    res.sendFile(markedBrowserModule);
  });

  app.use(cookieParser());

  app.use("/", IndexRouter);

  // API routes for data manipulation
  app.use("/api/user", UserApiRouter);
  app.use("/api/puzzle", PuzzleApiRouter);
  app.use("/api/quest", QuestApiRouter);
  app.use("/api/team", TeamApiRouter);
  app.use("/api/messaging", MessagingApiRouter);

  // UI routes for data display
  app.use("/user", UserRouter);
  app.use("/puzzle", PuzzleRouter);
  app.use("/quest", QuestRouter);
  app.use("/monitor", MonitorRouter);

  app.set("views", path.join(import.meta.dirname, "views"));
  app.set("view engine", "ejs");

  // Must be registered after every route.
  app.use(errorHandler);

  return app;
}
