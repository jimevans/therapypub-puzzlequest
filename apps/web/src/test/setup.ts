import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { accessibilityProblems } from "./accessibility";
import { fakedAnswerMismatches, noteSpiesOnTheApi } from "./contract";

// Every answer a test fakes for the API client is checked against the API's
// description (see contract.ts).
noteSpiesOnTheApi();

beforeEach(() => {
  // Spies made before this test, such as in a test file's beforeAll, are
  // left to their own tests.
  fakedAnswerMismatches();
});

afterEach(() => {
  const mismatches = fakedAnswerMismatches();
  if (mismatches.length > 0) {
    throw new Error(
      `A faked API answer isn't one the API could give, as its description says:\n${mismatches.map((mismatch) => `  ${mismatch}`).join("\n")}`
    );
  }
});

// Registered after the hooks it must run before: after hooks run in reverse
// order. Cleanup runs before the faked-answer check, so a failed check
// doesn't leave the page in place for the next test; the accessibility check
// runs before cleanup, while the page is still there.
afterEach(cleanup);

afterEach(async () => {
  const problems = await accessibilityProblems();
  if (problems.length > 0) {
    cleanup();
    throw new Error(
      `The page left by this test isn't accessible (WCAG 2.2 AA):\n${problems.map((problem) => `  ${problem}`).join("\n")}`
    );
  }
});
