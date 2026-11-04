// Tests of simultaneous actions on one quest, such as two teammates
// submitting the same solution. Each test makes one action save in the gap
// between another action loading the quest and saving it, which is when a
// lost update would happen.
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
import { assigneeIdsOf, userIdsOf } from "../references.js";

const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel, QuestPuzzleStatus, QuestStatus } =
  await import("../../src/models/quest.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { TeamModel, UserModel } = await import("../../src/models/user.model.js");

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

// Two members of the team the quest is assigned to, each acting as
// themselves and as the team.
let PLAYER: string[] = [];
let TEAMMATE: string[] = [];

beforeEach(async () => {
  await QuestModel.deleteMany({});
  await PuzzleModel.deleteMany({});
  await UserModel.deleteMany({});
  await TeamModel.deleteMany({});
  await UserModel.create(
    ["player", "teammate"].map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
    }))
  );
  await TeamModel.create({
    teamName: "team",
    displayName: "Team",
    joinCode: "join",
    memberIds: await userIdsOf("player", "teammate"),
  });
  PLAYER = await assigneeIdsOf("player", "team");
  TEAMMATE = await assigneeIdsOf("teammate", "team");
  await PuzzleModel.create([
    {
      name: "colors",
      displayName: "Colors",
      solutionKeyword: "red,blue",
      solutionDisplayText: "Red and blue",
      hints: [
        { text: "Think of the flag", timePenalty: 60 },
        { text: "It is red and blue", timePenalty: 300 },
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
    assignee: { kind: "team", name: "team" },
    puzzles: [{ puzzleName: "colors" }, { puzzleName: "fruit" }],
  });
  await QuestService.startQuest("test-quest");
  const quest = await storedQuest();
  await QuestService.activatePuzzle(
    "test-quest",
    "colors",
    PLAYER,
    quest.puzzles[0].activationCode
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function storedQuest() {
  return (await QuestModel.findOne({ name: "test-quest" }).lean())!;
}

/**
 * Makes the next quest save wait while another action runs to completion,
 * as if that action had been sent at the same moment.
 * @param competingAction the action that saves first
 * @returns a promise for the competing action's result
 */
function runBeforeNextSave<T>(competingAction: () => Promise<T>): Promise<T> {
  const realSave = QuestModel.prototype.save;
  return new Promise((resolve) => {
    vi.spyOn(QuestModel.prototype, "save").mockImplementationOnce(
      async function (this: InstanceType<typeof QuestModel>) {
        resolve(await competingAction());
        return realSave.call(this);
      }
    );
  });
}

describe("simultaneous actions on a quest", () => {
  it("accepts only one of two simultaneous correct solutions", async () => {
    const competing = runBeforeNextSave(() =>
      QuestService.finishPuzzle("test-quest", "colors", TEAMMATE, "red blue")
    );

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red blue"
    );

    expect((await competing).status).toBe("success");
    expect(result).toEqual({
      status: "error",
      statusCode: 400,
      message: "Puzzle colors in quest test-quest is not in progress",
    });
    const quest = await storedQuest();
    expect(quest.puzzles.map((p) => p.status)).toEqual([
      QuestPuzzleStatus.COMPLETED,
      QuestPuzzleStatus.AWAITING_ACTIVATION,
    ]);
  });

  it("keeps a hint revealed while a solution was being checked", async () => {
    const competing = runBeforeNextSave(() =>
      QuestService.getPuzzleHint("test-quest", "colors", TEAMMATE)
    );

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red blue"
    );

    expect((await competing).data).toMatchObject({
      hintText: "Think of the flag",
    });
    expect(result.status).toBe("success");
    const quest = await storedQuest();
    expect(quest.puzzles[0]).toMatchObject({
      status: QuestPuzzleStatus.COMPLETED,
      nextHintToDisplay: 1,
    });
  });

  it("refuses a hint for a puzzle solved while the hint was requested", async () => {
    const competing = runBeforeNextSave(() =>
      QuestService.finishPuzzle("test-quest", "colors", TEAMMATE, "red blue")
    );

    const result = await QuestService.getPuzzleHint(
      "test-quest",
      "colors",
      PLAYER
    );

    expect((await competing).status).toBe("success");
    expect(result).toEqual({
      status: "error",
      statusCode: 400,
      message: "Puzzle colors in quest test-quest is not in progress",
    });
    expect((await storedQuest()).puzzles[0].nextHintToDisplay).toBe(0);
  });

  it("reveals each hint once when two are requested at once", async () => {
    const competing = runBeforeNextSave(() =>
      QuestService.getPuzzleHint("test-quest", "colors", TEAMMATE)
    );

    const result = await QuestService.getPuzzleHint(
      "test-quest",
      "colors",
      PLAYER
    );

    expect((await competing).data).toMatchObject({
      hintText: "Think of the flag",
    });
    expect(result.data).toMatchObject({ hintText: "It is red and blue" });
    expect((await storedQuest()).puzzles[0].nextHintToDisplay).toBe(2);
  });

  it("gives up after three attempts if the quest keeps changing", async () => {
    const realSave = QuestModel.prototype.save;
    const save = vi
      .spyOn(QuestModel.prototype, "save")
      .mockImplementation(async function (
        this: InstanceType<typeof QuestModel>
      ) {
        // Another change is saved every time, just before this one.
        await QuestModel.updateOne(
          { name: "test-quest" },
          { $inc: { __v: 1 } }
        );
        return realSave.call(this);
      });

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red blue"
    );

    expect(result).toEqual({
      status: "error",
      statusCode: 409,
      message:
        "Quest test-quest is being changed by someone else; please try again",
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect((await storedQuest()).puzzles[0].status).toBe(
      QuestPuzzleStatus.IN_PROGRESS
    );
  });

  it("keeps both a player's progress and an expected text reply set at the same moment", async () => {
    const competing = runBeforeNextSave(() =>
      QuestService.setExpectedTextResponse("test-quest", "Ready", "Go")
    );

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red blue"
    );

    expect((await competing).status).toBe("success");
    expect(result.status).toBe("success");
    const quest = await storedQuest();
    expect(quest.textResponse).toBe("Ready");
    expect(quest.puzzles[0].status).toBe(QuestPuzzleStatus.COMPLETED);
  });

  it("reports setting a text reply for an unknown quest", async () => {
    expect(
      await QuestService.setExpectedTextResponse("missing", "Ready", "Go")
    ).toEqual({
      status: "error",
      statusCode: 404,
      message: "No quest with quest name missing found",
    });
  });

  it("reports other save failures as server errors, logging the details", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const diskFull = new Error("disk full");
    vi.spyOn(QuestModel.prototype, "save").mockRejectedValue(diskFull);

    expect(await QuestService.resetQuest("test-quest")).toEqual({
      status: "error",
      statusCode: 500,
      message: "An unexpected error occurred",
    });
    expect(error).toHaveBeenCalledWith("applyQuestAction failed:", diskFull);
  });
});

describe("a quest stored without a version key", () => {
  beforeEach(async () => {
    await QuestModel.collection.updateOne(
      { name: "test-quest" },
      { $unset: { __v: "" } }
    );
  });

  it("is given one before it is changed", async () => {
    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red blue"
    );

    expect(result.status).toBe("success");
    const quest = await storedQuest();
    expect(quest.__v).toBe(1);
    expect(quest.status).toBe(QuestStatus.IN_PROGRESS);
  });

  it("is protected from simultaneous changes", async () => {
    const competing = runBeforeNextSave(() =>
      QuestService.finishPuzzle("test-quest", "colors", TEAMMATE, "red blue")
    );

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red blue"
    );

    expect((await competing).status).toBe("success");
    expect(result.status).toBe("error");
  });
});
