import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockRequest,
  createMockResponse,
  playerUser,
} from "../helpers.js";

vi.mock("../../src/services/team.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/team.service.js")>();
  return {
    ...original,
    getTeamsForUser: vi.fn(async () => ({
      status: "success",
      statusCode: 200,
      data: [],
    })),
  };
});
vi.mock("../../src/services/quest.service.js", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../src/services/quest.service.js")
    >();
  return {
    ...original,
    getQuestByQuestName: vi.fn(),
    deleteQuest: vi.fn(),
    updateQuest: vi.fn(async () => ({ status: "success", statusCode: 200 })),
    getPuzzleHint: vi.fn(),
    findQuests: vi.fn(),
  };
});

const QuestService = await import("../../src/services/quest.service.js");
const QuestController =
  await import("../../src/controllers/quest.controller.js");

function createQuest() {
  return new QuestService.Quest({
    name: "quest1",
    displayName: "Quest 1",
    assignee: { kind: "user", id: playerUser.id, name: "player" },
    status: 1,
    puzzles: [
      {
        puzzleName: "p1",
        status: 3,
        activationCode: "code1",
        nextHintToDisplay: 0,
      },
      {
        puzzleName: "p2",
        status: 1,
        activationCode: "code2",
        nextHintToDisplay: 0,
      },
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(QuestService.getQuestByQuestName).mockImplementation(async () => ({
    status: "success",
    statusCode: 200,
    data: createQuest(),
  }));
});

describe("requestQuestPuzzleHint", () => {
  function createHintRequest() {
    return createMockRequest({
      user: playerUser,
      params: { name: "quest1", puzzleName: "puzzle1" },
      body: { connectionId: "connection1" },
    });
  }

  it("passes who asked and their connection to the service", async () => {
    vi.mocked(QuestService.getPuzzleHint).mockResolvedValue({
      status: "success",
      statusCode: 200,
      data: false,
    });
    const res = createMockResponse();

    await QuestController.requestQuestPuzzleHint(createHintRequest(), res);

    expect(QuestService.getPuzzleHint).toHaveBeenCalledWith(
      "quest1",
      "puzzle1",
      [playerUser.id],
      { actor: "player", connectionId: "connection1" }
    );
  });

  it("returns the revealed hint", async () => {
    const hint = {
      hintText: "Look up",
      moreHints: false,
      timePenalty: 60,
      isNextHintSolution: false,
    };
    vi.mocked(QuestService.getPuzzleHint).mockResolvedValue({
      status: "success",
      statusCode: 200,
      data: hint,
    });
    const res = createMockResponse();

    await QuestController.requestQuestPuzzleHint(createHintRequest(), res);

    expect(res.body.data).toEqual(hint);
  });

  it("reports when there are no hints left", async () => {
    vi.mocked(QuestService.getPuzzleHint).mockResolvedValue({
      status: "success",
      statusCode: 200,
      data: false,
    });
    const res = createMockResponse();

    await QuestController.requestQuestPuzzleHint(createHintRequest(), res);

    expect(res.body).toEqual({
      status: "success",
      statusCode: 200,
      data: false,
    });
  });
});
