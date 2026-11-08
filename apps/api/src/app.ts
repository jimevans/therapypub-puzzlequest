// Application startup: connects to MongoDB, then serves HTTP and websocket
// traffic, until the host asks it to stop. In production, the hosting
// environment starts it through loader.cjs, which loads the compiled
// dist/app.js; during development, `npm run dev` runs this file directly. The
// application itself is defined in createApp.ts.
import * as http from "http";
import mongoose from "mongoose";
import { config, configSource } from "./config.js";
import { createApp } from "./createApp.js";
import { subscribeQuestEventHandlers } from "./events/subscribers.js";
import { logger } from "./logger.js";
import { ensureDefaultOrganization } from "./models/organization.model.js";
import * as WebSocketService from "./services/websocket.service.js";
import { createShutdown } from "./shutdown.js";
import { runningCommit } from "./version.js";

// An error nothing caught leaves the server in a state no one planned for,
// so it's logged and the process ends; the host starts a fresh one.
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  logger.fatal({ err }, "unhandled promise rejection");
  process.exit(1);
});

logger.info({ configSource, commit: runningCommit() }, "starting");

mongoose.set("strictQuery", false);
mongoose.connection.on("error", (err) => {
  logger.error({ err }, "database connection error");
});

try {
  await mongoose.connect(config.PQ_MONGODB_URI);
} catch (err) {
  logger.fatal({ err }, "unable to connect to the database");
  process.exit(1);
}

// Every record belongs to an organization, so the default one must exist.
await ensureDefaultOrganization();
subscribeQuestEventHandlers();

const server = http.createServer(createApp());

const socketServer = WebSocketService.initialize();
server.on("upgrade", (req, socket, header) => {
  socketServer.handleUpgrade(req, socket, header, (ws) =>
    socketServer.emit("connection", ws, req)
  );
});

const shutdown = createShutdown({
  server,
  socketServer,
  disconnect: () => mongoose.disconnect(),
  log: logger,
  exit: (code) => process.exit(code),
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void shutdown(signal));
}

server.listen(config.PQ_PORT, () => {
  logger.info({ port: config.PQ_PORT }, "listening");
});
