import { describe, expect, it } from "vitest";
import { QuestStatus, rankEntries } from "../../../src/domain/quest/index.js";

const { NOT_STARTED, IN_PROGRESS, COMPLETED } = QuestStatus;

/** An entry, named so that the order can be read. */
const entry = (name: string, status: QuestStatus, totalMs = 0) => ({
  name,
  status,
  totalMs,
});

/** The entries' names and ranks, in leaderboard order. */
function ranksOf(entries: ReturnType<typeof entry>[]) {
  return rankEntries(entries).entries.map(({ entry, rank }) => [
    entry.name,
    rank,
  ]);
}

describe("rankEntries", () => {
  it("ranks the entries that completed, best score first", () => {
    expect(
      ranksOf([
        entry("slow", COMPLETED, 3000),
        entry("fast", COMPLETED, 1000),
        entry("middle", COMPLETED, 2000),
      ])
    ).toEqual([
      ["fast", 1],
      ["middle", 2],
      ["slow", 3],
    ]);
  });

  it("gives tied scores the same rank, and skips the places they share", () => {
    expect(
      ranksOf([
        entry("d", COMPLETED, 3000),
        entry("b", COMPLETED, 2000),
        entry("a", COMPLETED, 1000),
        entry("c", COMPLETED, 2000),
      ])
    ).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });

  it("puts those playing after the finishers, unranked, in entry order, then those not started", () => {
    expect(
      ranksOf([
        entry("waiting", NOT_STARTED),
        entry("second playing", IN_PROGRESS, 100),
        entry("finished", COMPLETED, 9000),
        entry("first playing", IN_PROGRESS, 500),
        entry("also waiting", NOT_STARTED),
      ])
    ).toEqual([
      ["finished", 1],
      ["second playing", null],
      ["first playing", null],
      ["waiting", null],
      ["also waiting", null],
    ]);
  });

  it("is provisional while some have ranks and others could still beat them", () => {
    expect(
      rankEntries([entry("a", COMPLETED, 1), entry("b", IN_PROGRESS, 2)])
        .provisional
    ).toBe(true);
    expect(
      rankEntries([entry("a", COMPLETED, 1), entry("b", NOT_STARTED)])
        .provisional
    ).toBe(true);
  });

  it("isn't provisional before anyone finishes, or once everyone has", () => {
    expect(
      rankEntries([entry("a", IN_PROGRESS, 1), entry("b", NOT_STARTED)])
        .provisional
    ).toBe(false);
    expect(
      rankEntries([entry("a", COMPLETED, 1), entry("b", COMPLETED, 2)])
        .provisional
    ).toBe(false);
  });

  it("ranks a lone entry first once it completes, and finally", () => {
    expect(rankEntries([entry("only", COMPLETED, 5)])).toEqual({
      entries: [{ entry: entry("only", COMPLETED, 5), rank: 1 }],
      provisional: false,
    });
    expect(rankEntries([entry("only", IN_PROGRESS, 5)])).toEqual({
      entries: [{ entry: entry("only", IN_PROGRESS, 5), rank: null }],
      provisional: false,
    });
  });

  it("ranks no entries", () => {
    expect(rankEntries([])).toEqual({ entries: [], provisional: false });
  });
});
