// Tests of pausing and resuming quests, through the whole application.
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
const { QuestModel, QuestStatus } =
  await import("../../src/models/quest.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { questEventBus } = await import("../../src/events/questEventBus.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};
let PLAYER: string[] = [];

const MINUTE = 60 * 1000;

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
      solutionKeyword: "piano",
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
  const quest = (await QuestModel.findOne({ name: "quest" }).lean())!;
  await QuestService.activatePuzzle(
    "quest",
    "riddle",
    PLAYER,
    quest.puzzles[0].activationCode
  );
  sessions = await startSessions("admin", "player");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function asAdmin(action: "pause" | "resume") {
  return request(app)
    .post(`/api/v1/quests/quest/${action}`)
    .set("Authorization", `Bearer ${sessions.admin}`);
}

function asPlayer(method: "get" | "put" | "post", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${sessions.player}`);
}

async function storedQuest() {
  return (await QuestModel.findOne({ name: "quest" }).lean())!;
}

describe("pausing a quest", () => {
  it("records the pause, and shows the quest as paused", async () => {
    const before = Date.now();

    expect((await asAdmin("pause")).status).toBe(200);

    const quest = await storedQuest();
    expect(quest.pauses).toHaveLength(1);
    expect(quest.pauses[0].startTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(quest.pauses[0].endTime).toBeUndefined();
    const json = JSON.parse(
      (await asPlayer("get", "/api/v1/quests/quest")).text
    );
    expect(json).toMatchObject({
      paused: true,
      statusDescription: "Paused",
      progress: { running: false },
    });
  });

  it("publishes QuestPaused with the admin as the actor", async () => {
    const handler = vi.fn();
    const stop = questEventBus.subscribe(handler);
    try {
      await asAdmin("pause");
    } finally {
      stop();
    }

    expect(handler).toHaveBeenCalledWith({
      questName: "quest",
      actor: "admin",
      events: [{ type: "QuestPaused", at: expect.any(Date) }],
    });
  });

  it.each([
    [
      "solve a puzzle",
      "put",
      "/api/quest/quest/puzzle/riddle/solve",
      { guess: "piano" },
    ],
    ["reveal a hint", "put", "/api/quest/quest/puzzle/riddle/hint", {}],
  ] as const)(
    "stops the players trying to %s",
    async (_, method, path, body) => {
      await asAdmin("pause");

      const response = await asPlayer(method, path).send(body);

      expect(response.status).toBe(409);
      expect(JSON.parse(response.text).message).toBe(
        "Quest quest is paused by the puzzle master; please wait until it resumes"
      );
      const quest = await storedQuest();
      expect(quest.puzzles[0]).toMatchObject({
        status: 2,
        nextHintToDisplay: 0,
      });
    }
  );

  it("stops a guess that was being checked as the quest was paused", async () => {
    const realSave = QuestModel.prototype.save;
    // The admin's pause is saved between the guess loading the quest and
    // saving it, so the guess is checked again and refused.
    vi.spyOn(QuestModel.prototype, "save").mockImplementationOnce(
      async function (this: InstanceType<typeof QuestModel>) {
        await QuestService.pauseQuest("quest");
        return realSave.call(this);
      }
    );

    const result = await QuestService.finishPuzzle(
      "quest",
      "riddle",
      PLAYER,
      "piano"
    );

    expect(result.statusCode).toBe(409);
    expect((await storedQuest()).puzzles[0].status).toBe(2);
  });

  it.each([
    ["twice", async () => asAdmin("pause"), "Quest quest is already paused"],
    [
      "once completed",
      async () =>
        QuestModel.updateOne(
          { name: "quest" },
          { status: QuestStatus.COMPLETED }
        ),
      "Quest quest can be paused only while it is in progress",
    ],
  ])("is refused %s", async (_, setUp, message) => {
    await setUp();

    const response = await asAdmin("pause");

    expect(response.status).toBe(409);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/wrong-state",
      detail: message,
    });
  });
});

describe("resuming a quest", () => {
  it("ends the pause and lets the players carry on", async () => {
    await asAdmin("pause");

    expect((await asAdmin("resume")).status).toBe(200);

    const quest = await storedQuest();
    expect(quest.pauses[0].endTime).toBeInstanceOf(Date);
    const solve = await asPlayer(
      "put",
      "/api/quest/quest/puzzle/riddle/solve"
    ).send({ guess: "piano" });
    expect(solve.status).toBe(200);
  });

  it("is refused when the quest isn't paused", async () => {
    const response = await asAdmin("resume");

    expect(response.status).toBe(409);
    expect(JSON.parse(response.text).detail).toBe("Quest quest isn't paused");
  });
});

describe("the players' time", () => {
  it("doesn't include the time the quest was paused", async () => {
    // Started 30 minutes ago, and paused for 10 of them.
    const now = Date.now();
    await QuestModel.updateOne(
      { name: "quest" },
      {
        $set: {
          "puzzles.0.startTime": new Date(now - 30 * MINUTE),
          pauses: [
            {
              startTime: new Date(now - 20 * MINUTE),
              endTime: new Date(now - 10 * MINUTE),
            },
          ],
        },
      }
    );

    const json = JSON.parse(
      (await asPlayer("get", "/api/v1/quests/quest")).text
    );

    const elapsed = json.progress.puzzles[0].elapsedMs;
    expect(elapsed).toBeGreaterThanOrEqual(20 * MINUTE);
    expect(elapsed).toBeLessThan(21 * MINUTE);
  });
});

describe("a paused quest's pages", () => {
  beforeEach(async () => {
    await asAdmin("pause");
  });

  it("say it is paused", async () => {
    const page = await asPlayer("get", "/quest/quest");

    expect(page.text).toContain('id="paused-banner"');
    expect(page.text).toContain("Paused");
    expect(page.text).not.toContain("data-clock-start");
  });

  it("disable guessing and hints on the puzzle page", async () => {
    const page = await asPlayer("get", "/quest/quest/puzzle/riddle");

    expect(page.text).toContain('id="paused-banner"');
    expect(page.text).toMatch(/<fieldset class="pq-fieldset" disabled>/);
    expect(page.text).toContain(
      "Hints are unavailable while the quest is paused"
    );
  });

  it("disable activation", async () => {
    await QuestModel.updateOne(
      { name: "quest" },
      { $set: { "puzzles.0.status": 1 } }
    );

    const page = await asPlayer("get", "/quest/quest/puzzle/riddle");

    expect(page.text).toMatch(
      /<fieldset id="activation-mode" class="pq-fieldset" disabled>/
    );
  });

  it("show the admin a Resume button", async () => {
    const page = await request(app)
      .get("/quest/quest")
      .set("Authorization", `Bearer ${sessions.admin}`);

    expect(page.text).toContain('id="resume-link"');
    expect(page.text).not.toContain('id="pause-link"');
  });

  it("show the monitor that it is paused", async () => {
    const page = await request(app).get("/monitor/quest/quest");

    expect(page.text).toContain('id="paused-banner"');
  });
});

describe("a running quest's pages", () => {
  it("don't show the paused banner, and offer the admin a Pause button", async () => {
    const page = await asPlayer("get", "/quest/quest/puzzle/riddle");
    const details = await request(app)
      .get("/quest/quest")
      .set("Authorization", `Bearer ${sessions.admin}`);

    expect(page.text).not.toContain('id="paused-banner"');
    expect(page.text).toMatch(/<fieldset class="pq-fieldset" >/);
    expect(details.text).toContain('id="pause-link"');
  });
});
