import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
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

// Registered last, so it runs first: after hooks run in reverse order, and a
// failed check mustn't leave the page in place for the next test.
afterEach(cleanup);
