// Keeping the server's log file in bounds (scripts/rotate-log.sh), as the
// host's daily cron job runs it.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = new URL("../scripts/rotate-log.sh", import.meta.url).pathname;

let folder: string;
let logFile: string;

/**
 * Runs the script on the log file.
 * @param maxBytes the size at which it rotates
 * @param copies how many copies it keeps
 */
function rotate(maxBytes: number, copies = 2): void {
  execFileSync("sh", [SCRIPT, logFile, String(maxBytes), String(copies)]);
}

/**
 * Reads a compressed copy.
 * @param copy which one: 1 is the newest
 * @returns its text
 */
function copyOf(copy: number): string {
  return gunzipSync(readFileSync(`${logFile}.${copy}.gz`)).toString();
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "puzzlequest-log-"));
  logFile = join(folder, "stderr.log");
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("rotating the log", () => {
  it("leaves a log under the size alone", () => {
    writeFileSync(logFile, "short\n");

    rotate(100);

    expect(readFileSync(logFile, "utf8")).toBe("short\n");
    expect(existsSync(`${logFile}.1.gz`)).toBe(false);
  });

  it("does nothing when there's no log yet", () => {
    expect(() => rotate(100)).not.toThrow();
  });

  it("keeps a compressed copy and empties the log in place", () => {
    writeFileSync(logFile, "first day\n");
    const before = statSync(logFile).ino;

    rotate(5);

    expect(copyOf(1)).toBe("first day\n");
    expect(readFileSync(logFile, "utf8")).toBe("");
    // The same file, which the server goes on appending to.
    expect(statSync(logFile).ino).toBe(before);
  });

  it("keeps only the newest copies", () => {
    for (const day of ["first", "second", "third"]) {
      writeFileSync(logFile, `${day} day\n`);
      rotate(5, 2);
    }

    expect(copyOf(1)).toBe("third day\n");
    expect(copyOf(2)).toBe("second day\n");
    expect(existsSync(`${logFile}.3.gz`)).toBe(false);
  });
});
