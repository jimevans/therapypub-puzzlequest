import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, afterEach, expect, inject, vi } from "vitest";
import { checkResponses, recordResponses, seenResponses } from "./contract.js";
import type { SeenResponses } from "./contractCoverage.js";

// bcrypt is a native module whose build script may not have run, and it is
// slow by design; tests don't exercise it, so stub it globally.
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async () => "hashed"),
    compare: vi.fn(async () => false),
  },
}));

// Contract tests: every v1 response is checked against the API's published
// description (see contract.ts).
recordResponses();

afterEach(() => {
  const mismatches = checkResponses();
  if (mismatches.length > 0) {
    throw new Error(
      `A response doesn't match the API's description. If the description is out of date, run npm run generate:api.\n${mismatches.map((mismatch) => `  ${mismatch}`).join("\n")}`
    );
  }
});

afterAll(() => {
  const file = relative(process.cwd(), expect.getState().testPath ?? "");
  const report: SeenResponses = { file, responses: seenResponses() };
  writeFileSync(
    join(
      inject("contractDirectory"),
      `${createHash("sha256").update(file).digest("hex")}.json`
    ),
    JSON.stringify(report)
  );
});
