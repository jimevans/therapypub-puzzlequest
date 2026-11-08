// The server's log: one JSON object per line on standard error, which the
// host keeps (on cPanel, Passenger appends it to stderr.log in the
// application's folder, which scripts/rotate-log.sh keeps in bounds). In
// development, `npm run dev` pipes it through pino-pretty to read it.
//
// Code handling a request logs through log(), which adds the request's ID,
// so everything one request causes can be found together. Nothing personal
// goes in: no passwords, tokens, cookies, email addresses, or phone numbers,
// and no request bodies or query strings. Users are named by ID.
import { AsyncLocalStorage } from "node:async_hooks";
import { pino, type DestinationStream, type Logger } from "pino";
import { config } from "./config.js";

/** Field names whose values never reach the log, wherever they appear. */
const PRIVATE_FIELDS = [
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "email",
  "phone",
  "authorization",
  "cookie",
];

/**
 * Where log lines go: standard error, unless a test has redirected them.
 * Written synchronously, with no worker threads, which this host limits.
 */
let sink: { write(line: string): void } = process.stderr;
const destination: DestinationStream = {
  write: (line: string) => sink.write(line),
};

/** The server's logger, for code outside any request. */
export const logger: Logger = pino(
  {
    level: config.PQ_LOG_LEVEL,
    base: { service: "puzzlequest" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        ...PRIVATE_FIELDS,
        ...PRIVATE_FIELDS.map((field) => `*.${field}`),
        // Database errors can quote the values that clashed.
        "err.keyValue",
        "err.errorResponse.keyValue",
      ],
      censor: "[private]",
    },
  },
  destination
);

const requestLoggers = new AsyncLocalStorage<Logger>();

/**
 * Runs a request's handling with its logger, so log() inside it adds the
 * request's ID.
 * @param requestLogger the request's logger
 * @param handle what handles the request
 */
export function runWithRequestLogger(
  requestLogger: Logger,
  handle: () => void
): void {
  requestLoggers.run(requestLogger, handle);
}

/**
 * Gets the logger to use: the current request's, which adds its ID, or the
 * server's outside any request.
 * @returns the logger
 */
export function log(): Logger {
  return requestLoggers.getStore() ?? logger;
}

/**
 * Sends log lines somewhere else, for tests to read them.
 * @param target where to write each line, or undefined for standard error
 */
export function redirectLog(
  target: { write(line: string): void } | undefined
): void {
  sink = target ?? process.stderr;
}
