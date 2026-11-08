import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { deployedCommitFile } from "./paths.js";

let commit: string | undefined;

/**
 * Gets the Git commit the app is running: the one deployed, or in
 * development, the checked-out one.
 * @returns the commit's full hash, or "unknown"
 */
export function runningCommit(): string {
  commit ??= readCommit();
  return commit;
}

/**
 * Reads the commit.
 * @returns the commit's hash, or "unknown"
 */
function readCommit(): string {
  try {
    return readFileSync(deployedCommitFile, "utf8").trim();
  } catch {
    // Not deployed: ask Git.
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}
