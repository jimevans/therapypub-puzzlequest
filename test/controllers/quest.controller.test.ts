import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminUser,
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
  };
});

const QuestService = await import("../../src/services/quest.service.js");
const QuestController =
  await import("../../src/controllers/quest.controller.js");

function createQuest() {
  return new QuestService.Quest({
    name: "quest1",
    displayName: "Quest 1",
    userName: "player",
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

describe("retrieveQuest", () => {
  it("returns the quest without activation codes to a player", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { name: "quest1" },
    });
    const res = createMockResponse();

    await QuestController.retrieveQuest(req, res);

    expect(res.body.status).toBe("success");
    expect(res.body.data.name).toBe("quest1");
    expect(res.body.data.puzzles).toHaveLength(2);
    for (const puzzle of res.body.data.puzzles) {
      expect(puzzle).not.toHaveProperty("activationCode");
    }
  });

  it("returns activation codes to an admin", async () => {
    const req = createMockRequest({
      user: adminUser,
      params: { name: "quest1" },
    });
    const res = createMockResponse();

    await QuestController.retrieveQuest(req, res);

    expect(
      res.body.data.puzzles.map(
        (p: { activationCode: string }) => p.activationCode
      )
    ).toEqual(["code1", "code2"]);
  });
});

describe("deleteQuest", () => {
  it("sends exactly one response when the quest does not exist", async () => {
    vi.mocked(QuestService.deleteQuest).mockResolvedValue({
      status: "error",
      statusCode: 404,
      message: "Quest with name nope does not exist",
    });
    const req = createMockRequest({
      user: adminUser,
      params: { name: "nope" },
    });
    const res = createMockResponse();

    await QuestController.deleteQuest(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.sendCount).toBe(1);
  });
});

describe("updateQuest", () => {
  it("leaves the puzzle list unchanged when the request omits it", async () => {
    const req = createMockRequest({
      user: adminUser,
      params: { name: "quest1" },
      body: { name: "quest1", displayName: "Renamed" },
    });

    await QuestController.updateQuest(req, createMockResponse());

    const [questDefinition] = vi
      .mocked(QuestService.updateQuest)
      .mock.calls.at(-1)!;
    expect(questDefinition.displayName).toBe("Renamed");
    expect(questDefinition.puzzles).toBeUndefined();
  });

  it("passes the puzzle list through when the request includes it", async () => {
    const req = createMockRequest({
      user: adminUser,
      params: { name: "quest1" },
      body: { name: "quest1", puzzles: [{ puzzleName: "puzzle1" }] },
    });

    await QuestController.updateQuest(req, createMockResponse());

    const [questDefinition] = vi
      .mocked(QuestService.updateQuest)
      .mock.calls.at(-1)!;
    expect(questDefinition.puzzles?.map((p) => p.puzzleName)).toEqual([
      "puzzle1",
    ]);
  });
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
      ["player"],
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
