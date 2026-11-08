// After a run of every test file, checks that the tests saw every success
// response the API's description documents, so that no promise made to
// clients goes untested. Problem responses aren't required: the
// authorization matrix and each area's tests cover the ones that matter.
// Runs that leave out test files, such as one file while working on it,
// skip the check.
import {
  globSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { contract } from "./contract.js";

declare module "vitest" {
  export interface ProvidedContext {
    /** Where each test file writes the responses it saw. */
    contractDirectory: string;
  }
}

/** What each test file writes when it finishes. */
export interface SeenResponses {
  /** The test file, relative to the API's folder. */
  file: string;
  /** The responses it saw, as "GET /users 200". */
  responses: string[];
}

/**
 * Documented success responses no test needs to see, each with why. Keep
 * this short: a response belongs here only if a test can't reasonably
 * produce it.
 */
const UNTESTED: Record<string, string> = {};

/**
 * Sets up the directory test files write to, and returns the check.
 * @param project the test project
 * @returns the teardown, which checks coverage
 */
export default function setup(project: TestProject): () => void {
  const directory = mkdtempSync(join(tmpdir(), "puzzlequest-contract-"));
  project.provide("contractDirectory", directory);
  return () => {
    const reports = readdirSync(directory).map(
      (name) =>
        JSON.parse(readFileSync(join(directory, name), "utf8")) as SeenResponses
    );
    rmSync(directory, { recursive: true, force: true });
    const ran = new Set(reports.map((report) => report.file));
    const all = globSync("test/**/*.test.ts", { cwd: project.config.root });
    if (all.some((file) => !ran.has(file))) {
      return;
    }
    const seen = new Set(reports.flatMap((report) => report.responses));
    const untested = contract
      .responses()
      .filter(
        (response) =>
          Number(response.split(" ")[2]) < 400 &&
          !seen.has(response) &&
          !(response in UNTESTED)
      );
    if (untested.length > 0) {
      throw new Error(
        `No test saw these documented responses. Add a test that gets each, or (only if none can) list it in UNTESTED in test/contractCoverage.ts:\n${untested.map((response) => `  ${response}`).join("\n")}`
      );
    }
  };
}
