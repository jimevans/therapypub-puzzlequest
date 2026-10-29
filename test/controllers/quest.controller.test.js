import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminUser,
  createMockRequest,
  createMockResponse,
  playerUser,
} from "../helpers.js";

vi.mock("../../src/services/team.service.js", async (importOriginal) => {
  const original = await importOriginal();
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
  const original = await importOriginal();
  return {
    ...original,
    getQuestByQuestName: vi.fn(),
    deleteQuest: vi.fn(),
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
  QuestService.getQuestByQuestName.mockImplementation(async () => ({
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

    expect(res.body.data.puzzles.map((p) => p.activationCode)).toEqual([
      "code1",
      "code2",
    ]);
  });
});

describe("deleteQuest", () => {
  it("sends exactly one response when the quest does not exist", async () => {
    QuestService.deleteQuest.mockResolvedValue({
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
