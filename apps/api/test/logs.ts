// Reading what the server logs, for tests. Tests run with the log off
// (PQ_LOG_LEVEL=silent); recordLogs() turns it on for one test and keeps
// each entry, parsed, instead of writing it out.
import { onTestFinished } from "vitest";
import * as loggerModule from "../src/logger.js";

/** A log entry, as written: its level's name is in `level`. */
export type LogEntry = Record<string, unknown> & {
  level: string;
  msg?: string;
};

const LEVEL_NAMES: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

/**
 * Records what's logged until the end of the test.
 * @param from the logger module, if a test loaded its own afresh
 * @returns the entries logged, filled in as they're written
 */
export function recordLogs(from = loggerModule): LogEntry[] {
  const { logger, redirectLog } = from;
  const entries: LogEntry[] = [];
  const level = logger.level;
  logger.level = "trace";
  redirectLog({
    write(line) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      entries.push({
        ...entry,
        level: LEVEL_NAMES[entry.level as number] ?? String(entry.level),
      });
    },
  });
  onTestFinished(() => {
    logger.level = level;
    redirectLog(undefined);
  });
  return entries;
}
