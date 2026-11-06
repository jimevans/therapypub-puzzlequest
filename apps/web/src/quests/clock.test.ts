import { describe, expect, it } from "vitest";
import { elapsedAt, formatDuration, totalAt } from "./clock";

const START = Date.parse("2026-11-06T18:00:00Z");
const MINUTE = 60_000;

describe("a running clock", () => {
  const clock = {
    running: true,
    clockStart: "2026-11-06T18:00:00.000Z",
    elapsedMs: 0,
    penaltyMs: MINUTE,
    totalMs: MINUTE,
  };

  it("counts up from when it started", () => {
    expect(elapsedAt(clock, START + 5 * MINUTE)).toBe(5 * MINUTE);
  });

  it("adds penalties to the total", () => {
    expect(totalAt(clock, START + 5 * MINUTE)).toBe(6 * MINUTE);
  });
});

describe("a stopped clock", () => {
  const clock = {
    running: false,
    elapsedMs: 5 * MINUTE,
    penaltyMs: MINUTE,
    totalMs: 6 * MINUTE,
  };

  it("keeps its time, whatever the time is now", () => {
    expect(elapsedAt(clock, START)).toBe(5 * MINUTE);
    expect(totalAt(clock, START)).toBe(6 * MINUTE);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [5_000, "0:05"],
    [65_000, "1:05"],
    [3_845_000, "1:04:05"],
    // A phone whose clock is behind the server's.
    [-5_000, "0:00"],
  ])("shows %d ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
