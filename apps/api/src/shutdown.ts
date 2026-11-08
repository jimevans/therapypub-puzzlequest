// Stopping the server cleanly, when the host asks it to (SIGTERM, or SIGINT
// from a terminal): requests already running finish, live-update clients are
// told to reconnect, and the database connection is closed, so nothing is
// cut off halfway.
import type { Server } from "node:http";
import type { WebSocketServer } from "ws";
import type { Logger } from "pino";

/** How long requests already running may take before they're cut off. */
export const SHUTDOWN_GRACE_MS = 10_000;

/** The websocket close code for a server going away. */
const GOING_AWAY = 1001;

/** What shutting down stops. */
export interface ShutdownParts {
  server: Pick<
    Server,
    "close" | "closeIdleConnections" | "closeAllConnections"
  >;
  socketServer: Pick<WebSocketServer, "clients" | "close">;
  /** Closes the database connection. */
  disconnect: () => Promise<void>;
  log: Pick<Logger, "info" | "warn" | "error">;
  /** Ends the process. */
  exit: (code: number) => void;
  /** How long requests may take to finish; SHUTDOWN_GRACE_MS by default. */
  graceMs?: number;
}

/**
 * Makes the function that shuts the server down. Calling it again while
 * it's under way does nothing more.
 * @param parts what it stops
 * @returns the function, given why it's shutting down
 */
export function createShutdown(
  parts: ShutdownParts
): (reason: string) => Promise<void> {
  let shuttingDown: Promise<void> | undefined;
  return (reason) => {
    shuttingDown ??= shutDown(parts, reason);
    return shuttingDown;
  };
}

/**
 * Shuts the server down.
 * @param parts what it stops
 * @param reason why, for the log
 */
async function shutDown(
  {
    server,
    socketServer,
    disconnect,
    log,
    exit,
    graceMs = SHUTDOWN_GRACE_MS,
  }: ShutdownParts,
  reason: string
): Promise<void> {
  log.info({ reason }, "shutting down");
  // Stop taking connections, and close those waiting idle for another
  // request; close() waits for the rest to finish.
  const closed = new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  server.closeIdleConnections();
  for (const client of socketServer.clients) {
    client.close(GOING_AWAY, "The server is restarting");
  }
  socketServer.close();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timed out">((resolve) => {
    timer = setTimeout(() => resolve("timed out"), graceMs);
  });
  if ((await Promise.race([closed, timedOut])) === "timed out") {
    log.warn("requests still running when time ran out; cutting them off");
    server.closeAllConnections();
  }
  clearTimeout(timer);
  try {
    await disconnect();
  } catch (err) {
    log.error({ err }, "closing the database connection failed");
  }
  log.info("shut down");
  exit(0);
}
