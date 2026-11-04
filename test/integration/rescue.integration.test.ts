// Tests of an administrator skipping and resetting puzzles to rescue the
// players, through the whole application.
import type { Express } from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";
import { assigneeIdsOf } from "../references.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel, QuestPuzzleStatus, QuestStatus } =
  await import("../../src/models/quest.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { questEventBus } = await import("../../src/events/questEventBus.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};
let PLAYER: string[] = [];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
  ]);
  await UserModel.create(
    (["admin", "player"] as const).map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
      authorizationLevel:
        userName === "admin"
          ? AuthorizationLevel.ADMIN
          : AuthorizationLevel.USER,
    }))
  );
  await PuzzleModel.create([
    {
      name: "riddle",
      displayName: "Riddle",
      // Badly written: "organ" is accepted, though the answer is a piano.
      solutionKeyword: "o",
      solutionDisplayText: "A piano",
      hints: [{ text: "It makes music", timePenalty: 60 }],
    },
    {
      name: "finale",
      displayName: "Finale",
      solutionKeyword: "done",
      solutionDisplayText: "Done",
    },
  ]);
  await QuestService.createQuest({
    name: "quest",
    displayName: "Quest",
    assignee: { kind: "user", name: "player" },
    puzzles: [{ puzzleName: "riddle" }, { puzzleName: "finale" }],
  });
  PLAYER = await assigneeIdsOf("player");
  await QuestService.startQuest("quest");
  await activate("riddle");
  sessions = await startSessions("admin", "player");
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function activate(puzzleName: string) {
  const quest = (await QuestModel.findOne({ name: "quest" }).lean())!;
  const code = quest.puzzles.find(
    (p) => p.puzzleName === puzzleName
  )!.activationCode;
  await QuestService.activatePuzzle("quest", puzzleName, PLAYER, code);
}

function rescue(
  action: "skip" | "reset",
  puzzleName: string,
  body: object = {}
) {
  return request(app)
    .put(`/api/quest/quest/puzzle/${puzzleName}/${action}`)
    .set("Authorization", `Bearer ${sessions.admin}`)
    .send(body);
}

async function storedQuest() {
  return (await QuestModel.findOne({ name: "quest" }).lean())!;
}

async function playerView() {
  const response = await request(app)
    .get("/api/quest/quest")
    .set("Authorization", `Bearer ${sessions.player}`);
  return JSON.parse(response.text).data;
}

describe("skipping a puzzle", () => {
  it("completes it at no cost, shows its solution, and starts the next", async () => {
    expect((await rescue("skip", "riddle")).status).toBe(200);

    const quest = await storedQuest();
    expect(quest.puzzles[0]).toMatchObject({
      status: QuestPuzzleStatus.COMPLETED,
      skipped: true,
    });
    expect(quest.puzzles[1].status).toBe(QuestPuzzleStatus.AWAITING_ACTIVATION);
    const view = await playerView();
    expect(view.puzzles[0]).toMatchObject({
      statusDescription: "Skipped",
      solutionDisplayText: "A piano",
    });
    expect(view.progress.penaltyMs).toBe(0);
  });

  it("completes the quest when it is the last puzzle", async () => {
    await rescue("skip", "riddle");

    await rescue("skip", "finale");

    expect((await storedQuest()).status).toBe(QuestStatus.COMPLETED);
  });

  it("works while the quest is paused", async () => {
    await QuestService.pauseQuest("quest");

    expect((await rescue("skip", "riddle")).status).toBe(200);
  });

  it("publishes PuzzleSkipped with the admin as the actor", async () => {
    const handler = vi.fn();
    const stop = questEventBus.subscribe(handler);
    try {
      await rescue("skip", "riddle");
    } finally {
      stop();
    }

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "admin",
        events: [
          expect.objectContaining({ type: "PuzzleSkipped" }),
          expect.objectContaining({ type: "PuzzleStarted" }),
        ],
      })
    );
  });

  it.each([
    [
      "a puzzle already completed",
      "riddle",
      async () => rescue("skip", "riddle"),
      400,
      "Puzzle riddle in quest quest is already completed",
    ],
    [
      "a puzzle not yet reached",
      "finale",
      async () => {},
      404,
      "No puzzle with name finale in quest quest",
    ],
  ])("is refused for %s", async (_, puzzleName, setUp, status, message) => {
    await setUp();

    const response = await rescue("skip", puzzleName);

    expect(response.status).toBe(status);
    expect(JSON.parse(response.text).message).toBe(message);
  });
});

describe("resetting a puzzle", () => {
  // The badly written puzzle accepts a wrong answer, after the players
  // revealed its hint.
  async function acceptWrongAnswer() {
    await QuestService.getPuzzleHint("quest", "riddle", PLAYER);
    const result = await QuestService.finishPuzzle(
      "quest",
      "riddle",
      PLAYER,
      "organ"
    );
    expect(result.status).toBe("success");
  }

  it("lets the players solve it properly, refunding its hint when asked", async () => {
    await acceptWrongAnswer();
    await QuestService.pauseQuest("quest");
    // The administrator fixes the puzzle while the quest is paused.
    await PuzzleModel.updateOne(
      { name: "riddle" },
      { solutionKeyword: "piano" }
    );

    expect(
      (await rescue("reset", "riddle", { refundHints: true })).status
    ).toBe(200);
    await QuestService.resumeQuest("quest");

    const quest = await storedQuest();
    expect(quest.puzzles[0]).toMatchObject({
      status: QuestPuzzleStatus.IN_PROGRESS,
      nextHintToDisplay: 1,
      penaltyFreeHints: 1,
    });
    expect(quest.puzzles[0].endTime).toBeUndefined();
    expect(quest.puzzles[1]).toMatchObject({
      status: QuestPuzzleStatus.UNAVAILABLE,
    });
    const view = await playerView();
    expect(view.progress.penaltyMs).toBe(0);
    expect(view.puzzles[0].hints).toEqual([
      expect.objectContaining({ text: "It makes music" }),
    ]);

    const wrong = await QuestService.finishPuzzle(
      "quest",
      "riddle",
      PLAYER,
      "organ"
    );
    expect(wrong.statusCode).toBe(406);
    const right = await QuestService.finishPuzzle(
      "quest",
      "riddle",
      PLAYER,
      "piano"
    );
    expect(right.status).toBe("success");
  });

  it("keeps the hint penalties unless asked to refund them", async () => {
    await acceptWrongAnswer();

    await rescue("reset", "riddle");

    expect((await storedQuest()).puzzles[0].penaltyFreeHints).toBe(0);
    expect((await playerView()).progress.penaltyMs).toBe(60 * 1000);
  });

  it("reopens a completed quest", async () => {
    await acceptWrongAnswer();
    await activate("finale");
    await QuestService.finishPuzzle("quest", "finale", PLAYER, "done");
    expect((await storedQuest()).status).toBe(QuestStatus.COMPLETED);

    await rescue("reset", "finale");

    const quest = await storedQuest();
    expect(quest.status).toBe(QuestStatus.IN_PROGRESS);
    expect(quest.puzzles[1].status).toBe(QuestPuzzleStatus.IN_PROGRESS);
  });

  it("is refused for a puzzle still in progress", async () => {
    const response = await rescue("reset", "riddle");

    expect(response.status).toBe(400);
    expect(JSON.parse(response.text).message).toBe(
      "Puzzle riddle in quest quest hasn't been completed, so there is nothing to reset"
    );
  });

  it("publishes PuzzleReset with how many hints were refunded", async () => {
    await acceptWrongAnswer();
    const handler = vi.fn();
    const stop = questEventBus.subscribe(handler);
    try {
      await rescue("reset", "riddle", { refundHints: true });
    } finally {
      stop();
    }

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "admin",
        events: [
          expect.objectContaining({
            type: "PuzzleReset",
            puzzleName: "riddle",
            refundedHints: 1,
          }),
        ],
      })
    );
  });
});

describe("the quest details page", () => {
  function details() {
    return request(app)
      .get("/quest/quest")
      .set("Authorization", `Bearer ${sessions.admin}`);
  }

  it("offers the reached puzzles for skipping and resetting", async () => {
    const page = (await details()).text;

    expect(page).toContain('id="puzzle-rescue"');
    expect(page).toContain(
      '<option value="riddle">Riddle (In progress)</option>'
    );
    expect(page).not.toContain('<option value="finale">');
  });

  it("offers nothing before the quest starts", async () => {
    await QuestService.resetQuest("quest");

    expect((await details()).text).not.toContain('id="puzzle-rescue"');
  });
});

describe("a skipped puzzle on the players' quest page", () => {
  it("shows as Skipped, with its solution", async () => {
    await rescue("skip", "riddle");

    const page = await request(app)
      .get("/quest/quest")
      .set("Authorization", `Bearer ${sessions.player}`);

    expect(page.text).toContain("Skipped");
    expect(page.text).toContain("A piano");
  });
});
