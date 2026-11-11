// Tests that quest actions publish their events, and that the event log
// records them.
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
import { recordLogs } from "../logs.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { assigneeIdsOf, withPuzzleNames } from "../references.js";

const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { QuestEventModel } =
  await import("../../src/models/questEvent.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { TeamModel, UserModel } = await import("../../src/models/user.model.js");
const UserService = await import("../../src/services/user.service.js");
const { questEventBus } = await import("../../src/events/questEventBus.js");
const { subscribeQuestEventHandlers } =
  await import("../../src/events/subscribers.js");

let mongoServer: MongoMemoryServer | undefined;
let unsubscribe: () => void = () => {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

let PLAYER: string[] = [];

beforeEach(async () => {
  await UserModel.deleteMany({});
  await TeamModel.deleteMany({});
  await UserModel.create({
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    password: "hash",
  });
  PLAYER = await assigneeIdsOf("player");
  unsubscribe = subscribeQuestEventHandlers();
  await QuestModel.deleteMany({});
  await PuzzleModel.deleteMany({});
  await QuestEventModel.deleteMany({});
  await PuzzleModel.create([
    {
      name: "colors",
      displayName: "Colors",
      solutionKeyword: "red,blue",
      solutionDisplayText: "Red and blue",
      hints: [
        { text: "Think of the flag", timePenalty: 60 },
        { text: "It is red and blue", solutionWarning: true, timePenalty: 300 },
      ],
    },
    {
      name: "fruit",
      displayName: "Fruit",
      solutionKeyword: "apple",
      solutionDisplayText: "Apple",
    },
  ]);
  await QuestService.createQuest({
    name: "test-quest",
    displayName: "Test Quest",
    entrants: [{ kind: "user", name: "player" }],
    puzzles: [{ puzzleName: "colors" }, { puzzleName: "fruit" }],
  });
});

afterEach(() => {
  unsubscribe();
  vi.restoreAllMocks();
});

async function activationCode(puzzleName: string) {
  const quest = await withPuzzleNames(
    (await QuestModel.findOne({ name: "test-quest" }).lean())!
  );
  return quest.puzzles.find((p) => p.puzzleName === puzzleName)!.activationCode;
}

async function playWholeQuest() {
  const origin = { actor: "player", connectionId: "c1" };
  await QuestService.startQuest("test-quest", { actor: "admin" });
  await QuestService.activatePuzzle(
    "test-quest",
    "colors",
    PLAYER,
    await activationCode("colors"),
    origin
  );
  await QuestService.getPuzzleHint("test-quest", "colors", PLAYER, origin);
  await QuestService.finishPuzzle(
    "test-quest",
    "colors",
    PLAYER,
    "red blue",
    origin
  );
  await QuestService.activatePuzzle(
    "test-quest",
    "fruit",
    PLAYER,
    await activationCode("fruit"),
    origin
  );
  await QuestService.finishPuzzle(
    "test-quest",
    "fruit",
    PLAYER,
    "apple",
    origin
  );
}

async function loggedEvents() {
  const events = await QuestEventModel.find({ questName: "test-quest" })
    .sort({ at: 1, _id: 1 })
    .lean();
  return events.map(({ type, puzzleName, actor, data }) => ({
    type,
    puzzleName,
    actor,
    data,
  }));
}

describe("the quest event log", () => {
  it("records every step of a quest, in order, with who took it", async () => {
    await playWholeQuest();

    expect(await loggedEvents()).toEqual([
      { type: "QuestStarted", actor: "admin" },
      { type: "PuzzleStarted", puzzleName: "colors", actor: "admin" },
      { type: "PuzzleActivated", puzzleName: "colors", actor: "player" },
      {
        type: "HintRevealed",
        puzzleName: "colors",
        actor: "player",
        data: { hintIndex: 0, timePenalty: 60 },
      },
      { type: "PuzzleSolved", puzzleName: "colors", actor: "player" },
      { type: "PuzzleStarted", puzzleName: "fruit", actor: "player" },
      { type: "PuzzleActivated", puzzleName: "fruit", actor: "player" },
      { type: "PuzzleSolved", puzzleName: "fruit", actor: "player" },
      { type: "QuestCompleted", actor: "player" },
    ]);
  });

  it("records the time each event happened", async () => {
    const before = new Date();
    await QuestService.startQuest("test-quest");
    const after = new Date();

    const [started] = await QuestEventModel.find().lean();
    expect(started.at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(started.at.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(started.actor).toBeUndefined();
  });

  it("records how many hint penalties a puzzle reset refunded", async () => {
    await QuestService.startQuest("test-quest");
    await QuestService.activatePuzzle(
      "test-quest",
      "colors",
      PLAYER,
      await activationCode("colors")
    );
    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);
    await QuestService.finishPuzzle("test-quest", "colors", PLAYER, "red blue");

    await QuestService.resetQuestPuzzle("test-quest", "colors", true, {
      actor: "admin",
    });

    expect((await loggedEvents()).at(-1)).toEqual({
      type: "PuzzleReset",
      puzzleName: "colors",
      actor: "admin",
      data: { refundedHints: 1 },
    });
  });

  it("keeps earlier events when a quest is reset", async () => {
    await QuestService.startQuest("test-quest");
    await QuestService.resetQuest("test-quest", { actor: "admin" });

    expect((await loggedEvents()).map((e) => e.type)).toEqual([
      "QuestStarted",
      "PuzzleStarted",
      "QuestReset",
    ]);
  });

  it("records whose entry each event happened in, by name as it was", async () => {
    await UserModel.create({
      userName: "rival",
      displayName: "Rival",
      email: "rival@example.com",
      password: "hash",
    });
    await TeamModel.create({
      teamName: "crew",
      displayName: "Crew",
      joinCode: "crew-code",
      memberIds: [],
    });
    await QuestService.updateQuest({
      name: "test-quest",
      entrants: [
        { kind: "user", name: "player" },
        { kind: "team", name: "crew" },
      ],
    });
    await QuestService.startQuest("test-quest", { actor: "admin" });
    await TeamModel.updateOne({ teamName: "crew" }, { teamName: "renamed" });

    const events = await QuestEventModel.find({ questName: "test-quest" })
      .sort({ _id: 1 })
      .lean();
    expect(events.map(({ type, entrant }) => [type, entrant])).toEqual([
      ["QuestStarted", { kind: "user", name: "player" }],
      ["PuzzleStarted", { kind: "user", name: "player" }],
      ["QuestStarted", { kind: "team", name: "crew" }],
      ["PuzzleStarted", { kind: "team", name: "crew" }],
    ]);
    const page = await QuestService.listQuestEventsPage("test-quest", {
      limit: 50,
    });
    expect(page.data!.items[2]).toMatchObject({
      type: "QuestStarted",
      entrant: { kind: "team", name: "crew" },
    });
  });

  it("takes a deleted player's name out of the entries they played", async () => {
    await QuestService.startQuest("test-quest");
    await UserModel.create({
      userName: "admin",
      displayName: "Admin",
      email: "admin@example.com",
      password: "hash",
      authorizationLevel: 10,
    });

    expect((await UserService.deleteUser("player")).status).toBe("success");

    const events = await QuestEventModel.find({ questName: "test-quest" })
      .lean()
      .exec();
    expect(events.map(({ entrant }) => entrant)).toEqual([
      { kind: "user" },
      { kind: "user" },
    ]);
    expect(JSON.stringify(events)).not.toContain('"player"');
  });

  it("records nothing for a refused action", async () => {
    await QuestService.startQuest("test-quest");
    await QuestService.activatePuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "wrong-code"
    );

    expect(
      await QuestEventModel.countDocuments({ type: "PuzzleActivated" })
    ).toBe(0);
  });

  it("does not fail a player's action when the log can't be written", async () => {
    const logs = recordLogs();
    vi.spyOn(QuestEventModel, "insertMany").mockRejectedValue(
      new Error("database down")
    );

    const result = await QuestService.startQuest("test-quest");

    expect(result.status).toBe("success");
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: "error",
        msg: "handling quest activity failed",
        questName: "test-quest",
        err: expect.objectContaining({ message: "database down" }),
      })
    );
  });
});

describe("published quest activity", () => {
  it("carries the origin and the details players' screens show", async () => {
    const handler = vi.fn();
    const stop = questEventBus.subscribe(handler);
    try {
      await playWholeQuest();
    } finally {
      stop();
    }

    const hintActivity = handler.mock.calls[2][0];
    expect(hintActivity).toEqual({
      questName: "test-quest",
      actor: "player",
      connectionId: "c1",
      entry: {
        id: expect.any(String),
        assignee: { kind: "user", id: expect.any(String) },
      },
      racing: false,
      events: [
        {
          type: "HintRevealed",
          puzzleName: "colors",
          hintIndex: 0,
          timePenalty: 60,
          hintText: "Think of the flag",
          nextHint: { timePenalty: 300, solutionWarning: true },
          at: expect.any(Date),
        },
      ],
    });
    const solveActivity = handler.mock.calls[3][0];
    expect(solveActivity.events).toEqual([
      expect.objectContaining({
        type: "PuzzleSolved",
        solutionText: "Red and blue",
      }),
      expect.objectContaining({
        type: "PuzzleStarted",
        puzzleName: "fruit",
        displayName: "Fruit",
      }),
    ]);
  });
});
