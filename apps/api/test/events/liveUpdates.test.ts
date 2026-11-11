import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/websocket.service.js", () => ({
  notifyQuestFollowers: vi.fn(),
}));

const { notifyQuestFollowers } =
  await import("../../src/services/websocket.service.js");
const { sendLiveUpdates } = await import("../../src/events/liveUpdates.js");
const { liveUpdateSchema } = await import("../../src/schemas/liveUpdates.js");

const AT = new Date("2026-11-03T20:00:00Z");

/** The entry the activity happened in. */
const ENTRY = {
  id: "entry-1",
  assignee: { kind: "team" as const, id: "000000000000000000000001" },
};

/** Who may see the updates' content: everyone, outside a race. */
const AUDIENCE = { racing: false, assigneeId: "000000000000000000000001" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendLiveUpdates", () => {
  it("announces an activated puzzle", () => {
    sendLiveUpdates({
      questName: "q1",
      entry: ENTRY,
      racing: false,
      events: [{ type: "PuzzleActivated", puzzleName: "p1", at: AT }],
    });

    expect(notifyQuestFollowers).toHaveBeenCalledExactlyOnceWith(
      {
        message: "puzzleActivated",
        questName: "q1",
        entryId: "entry-1",
        puzzleName: "p1",
        activationTime: AT.toISOString(),
      },
      [],
      AUDIENCE
    );
  });

  it("announces a solved puzzle and the next one, except to the solver", () => {
    sendLiveUpdates({
      questName: "q1",
      entry: ENTRY,
      racing: false,
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

    expect(vi.mocked(notifyQuestFollowers).mock.calls).toEqual([
      [
        {
          message: "puzzleSolved",
          questName: "q1",
          entryId: "entry-1",
          puzzleName: "p1",
          solutionText: "Red",
          endTime: AT.toISOString(),
          questComplete: false,
        },
        ["solver"],
        AUDIENCE,
      ],
      [
        {
          message: "puzzleStarted",
          questName: "q1",
          entryId: "entry-1",
          puzzleName: "p2",
          displayName: "Puzzle 2",
          startTime: AT.toISOString(),
        },
        ["solver"],
        AUDIENCE,
      ],
    ]);
  });

  it("announces a completed quest with its last solved puzzle", () => {
    sendLiveUpdates({
      questName: "q1",
      entry: ENTRY,
      racing: false,
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

    expect(notifyQuestFollowers).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "puzzleSolved", questComplete: true }),
      [],
      AUDIENCE
    );
  });

  it("shares a revealed hint, except with the asker", () => {
    sendLiveUpdates({
      questName: "q1",
      entry: ENTRY,
      racing: false,
      connectionId: "asker",
      events: [
        {
          type: "HintRevealed",
          puzzleName: "p1",
          hintIndex: 0,
          timePenalty: 60,
          hintText: "Look up",
          nextHint: { timePenalty: 300, solutionWarning: true },
          at: AT,
        },
      ],
    });

    expect(notifyQuestFollowers).toHaveBeenCalledExactlyOnceWith(
      {
        message: "hintRevealed",
        questName: "q1",
        entryId: "entry-1",
        puzzleName: "p1",
        hintText: "Look up",
        timePenaltySeconds: 60,
        nextHint: { timePenaltySeconds: 300, solutionWarning: true },
      },
      ["asker"],
      AUDIENCE
    );
  });

  it("sends nothing when a quest starts or is reset", () => {
    sendLiveUpdates({
      questName: "q1",
      entry: ENTRY,
      racing: false,
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

    expect(notifyQuestFollowers).not.toHaveBeenCalled();
  });

  it.each([
    { type: "QuestPaused", at: AT },
    { type: "QuestResumed", at: AT },
    { type: "PuzzleSkipped", puzzleName: "p1", at: AT },
    { type: "PuzzleReset", puzzleName: "p1", refundedHints: 0, at: AT },
  ] as const)("tells everyone following the quest after $type", (event) => {
    sendLiveUpdates({
      questName: "q1",
      entry: ENTRY,
      racing: false,
      events: [event],
    });

    expect(notifyQuestFollowers).toHaveBeenCalledExactlyOnceWith({
      message: "questUpdated",
      questName: "q1",
      entryId: "entry-1",
    });
  });

  it("sends only messages clients expect, as their schemas describe", () => {
    sendLiveUpdates({
      questName: "q1",
      entry: ENTRY,
      racing: false,
      events: [
        { type: "PuzzleActivated", puzzleName: "p1", at: AT },
        {
          type: "HintRevealed",
          puzzleName: "p1",
          hintIndex: 0,
          timePenalty: 60,
          hintText: "Look up",
          nextHint: null,
          at: AT,
        },
        { type: "PuzzleSolved", puzzleName: "p1", solutionText: "Red", at: AT },
        {
          type: "PuzzleStarted",
          puzzleName: "p2",
          displayName: "Puzzle 2",
          at: AT,
        },
        { type: "QuestPaused", at: AT },
      ],
    });

    const sent = vi
      .mocked(notifyQuestFollowers)
      .mock.calls.map((call) => call[0]);
    expect(sent.map((message) => message.message)).toEqual([
      "puzzleActivated",
      "hintRevealed",
      "puzzleSolved",
      "puzzleStarted",
      "questUpdated",
    ]);
    for (const message of sent) {
      // Exactly the schema's fields, with nothing left over for it to drop.
      expect(liveUpdateSchema.parse(message)).toEqual(message);
    }
  });
});
