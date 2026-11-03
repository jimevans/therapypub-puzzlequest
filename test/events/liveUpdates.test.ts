import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/websocket.service.js", () => ({
  notifyBrowsers: vi.fn(),
}));

const { notifyBrowsers } =
  await import("../../src/services/websocket.service.js");
const { sendLiveUpdates } = await import("../../src/events/liveUpdates.js");

const AT = new Date("2026-11-03T20:00:00Z");

/** The pages that show the progress of puzzle p1 in quest q1. */
const P1_PAGES = [
  "/quest/q1",
  "/quest/q1/puzzle/p1",
  "/monitor/quest/q1",
  "/monitor/quest/q1/puzzle/p1",
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendLiveUpdates", () => {
  it("announces an activated puzzle", () => {
    sendLiveUpdates({
      questName: "q1",
      events: [{ type: "PuzzleActivated", puzzleName: "p1", at: AT }],
    });

    expect(notifyBrowsers).toHaveBeenCalledExactlyOnceWith(P1_PAGES, [], {
      message: "puzzleActivated",
      questName: "q1",
      puzzleName: "p1",
      activationTime: AT,
    });
  });

  it("announces a solved puzzle and the next one, except to the solver", () => {
    sendLiveUpdates({
      questName: "q1",
      connectionId: "solver",
      events: [
        {
          type: "PuzzleSolved",
          puzzleName: "p1",
          solutionText: "Red",
          at: AT,
        },
        {
          type: "PuzzleStarted",
          puzzleName: "p2",
          displayName: "Puzzle 2",
          at: AT,
        },
      ],
    });

    expect(vi.mocked(notifyBrowsers).mock.calls).toEqual([
      [
        P1_PAGES,
        ["solver"],
        {
          message: "puzzleSolved",
          questName: "q1",
          puzzleName: "p1",
          solutionText: "Red",
          endTime: AT,
          questComplete: undefined,
        },
      ],
      [
        P1_PAGES,
        ["solver"],
        {
          message: "puzzleStarted",
          questName: "q1",
          puzzleName: "p2",
          displayName: "Puzzle 2",
          startTime: AT,
        },
      ],
    ]);
  });

  it("announces a completed quest with its last solved puzzle", () => {
    sendLiveUpdates({
      questName: "q1",
      events: [
        {
          type: "PuzzleSolved",
          puzzleName: "p1",
          solutionText: "Red",
          at: AT,
        },
        { type: "QuestCompleted", at: AT },
      ],
    });

    expect(notifyBrowsers).toHaveBeenCalledExactlyOnceWith(
      P1_PAGES,
      [],
      expect.objectContaining({ message: "puzzleSolved", questComplete: true })
    );
  });

  it("shares a revealed hint on the puzzle's pages, except with the asker", () => {
    sendLiveUpdates({
      questName: "q1",
      connectionId: "asker",
      events: [
        {
          type: "HintRevealed",
          puzzleName: "p1",
          hintIndex: 0,
          timePenalty: 60,
          hintText: "Look up",
          moreHints: true,
          isNextHintSolution: false,
          at: AT,
        },
      ],
    });

    expect(notifyBrowsers).toHaveBeenCalledExactlyOnceWith(
      ["/quest/q1/puzzle/p1", "/monitor/quest/q1/puzzle/p1"],
      ["asker"],
      {
        message: "hintRequested",
        hintText: "Look up",
        moreHints: true,
        timePenalty: 60,
        isNextHintSolution: false,
      }
    );
  });

  it("sends nothing when a quest starts or is reset", () => {
    sendLiveUpdates({
      questName: "q1",
      events: [
        { type: "QuestStarted", at: AT },
        {
          type: "PuzzleStarted",
          puzzleName: "p1",
          displayName: "Puzzle 1",
          at: AT,
        },
        { type: "QuestReset", at: AT },
      ],
    });

    expect(notifyBrowsers).not.toHaveBeenCalled();
  });
});
