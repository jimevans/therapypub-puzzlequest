import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Leaderboard } from "./Leaderboard";
import { ordinal } from "./entrants";

const STOPPED = {
  endTime: null,
  running: false,
  clockStart: null,
  elapsedMs: 0,
  penaltyMs: 0,
  totalMs: 0,
};

function entry(
  id: string,
  displayName: string,
  rank: number | null,
  totalMs = 0
) {
  return {
    id,
    entrant: { kind: "team" as const, displayName },
    status: rank === null ? ("inProgress" as const) : ("completed" as const),
    statusDescription: rank === null ? "In progress" : "Completed",
    paused: false,
    rank,
    progress: {
      ...STOPPED,
      startTime: "2026-11-06T18:00:00.000Z",
      totalMs,
      puzzles: [],
    },
    puzzles: [],
  };
}

const RACING = { racing: true, provisional: false, rivalsHidden: false };

describe("Leaderboard", () => {
  it("says each rank as a place, and an unranked team as not ranked yet", () => {
    render(
      <Leaderboard
        quest={{
          ...RACING,
          provisional: true,
          entries: [
            entry("a", "The Reds", 1, 60_000),
            entry("b", "The Blues", null, 120_000),
          ],
        }}
      />
    );

    const [header, first, second] = screen.getAllByRole("row");
    expect(
      within(header!)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual(["Rank", "Team or player", "Status", "Time"]);
    expect(within(first!).getByRole("rowheader")).toHaveTextContent("The Reds");
    expect(first).toHaveTextContent("1stThe RedsCompleted1:00");
    expect(second).toHaveTextContent("Not ranked yet");
  });

  it("tells screen readers when a team finishes, and the result, but not each tick", () => {
    const { rerender } = render(
      <Leaderboard
        quest={{
          ...RACING,
          entries: [
            entry("a", "The Reds", null),
            entry("b", "The Blues", null),
          ],
        }}
      />
    );
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("");

    // Only a clock moved.
    rerender(
      <Leaderboard
        quest={{
          ...RACING,
          entries: [
            entry("a", "The Reds", null, 1000),
            entry("b", "The Blues", null, 1000),
          ],
        }}
      />
    );
    expect(region).toHaveTextContent("");

    rerender(
      <Leaderboard
        quest={{
          ...RACING,
          provisional: true,
          entries: [
            entry("b", "The Blues", 1, 2000),
            entry("a", "The Reds", null),
          ],
        }}
      />
    );
    expect(region).toHaveTextContent("The Blues finished 1st.");

    rerender(
      <Leaderboard
        quest={{
          ...RACING,
          racing: false,
          entries: [
            entry("b", "The Blues", 1, 2000),
            entry("a", "The Reds", 2, 3000),
          ],
        }}
      />
    );
    expect(region).toHaveTextContent(
      "The Reds finished 2nd. Final standings: The Blues won."
    );
  });

  it("names every winner of a tie", () => {
    const { rerender } = render(
      <Leaderboard
        quest={{
          ...RACING,
          entries: [entry("a", "The Reds", 1), entry("b", "The Blues", null)],
        }}
      />
    );
    rerender(
      <Leaderboard
        quest={{
          ...RACING,
          racing: false,
          entries: [entry("a", "The Reds", 1), entry("b", "The Blues", 1)],
        }}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "The Blues finished 1st. Final standings: The Reds and The Blues won."
    );
    expect(screen.getAllByText("Winner")).toHaveLength(2);
  });

  it("picks out the viewer's own entry in words", () => {
    render(
      <Leaderboard
        quest={{
          ...RACING,
          entries: [
            entry("a", "The Reds", null),
            {
              ...entry("b", "Sam", null),
              entrant: { kind: "player" as const, displayName: null },
            },
          ],
        }}
        ownEntryId="b"
      />
    );

    const [, reds, sam] = screen.getAllByRole("row");
    expect(reds).not.toHaveTextContent(/You/);
    expect(sam).toHaveTextContent("A deleted player You");
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [101, "101st"],
  ])("says %i as %s", (rank, place) => {
    expect(ordinal(rank)).toBe(place);
  });
});
