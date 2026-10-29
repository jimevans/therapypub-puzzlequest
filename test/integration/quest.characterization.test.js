// Characterization tests for the quest service: they record what the service
// does today, including behavior that is probably wrong, so that the Phase 1
// state machine rewrite changes behavior only on purpose. Tests whose names
// end in "(current behavior)" pin down a known quirk or bug; when Phase 1
// fixes one, update that test to describe the new behavior.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel, QuestPuzzleStatus, QuestStatus } =
  await import("../../src/models/quest.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { Puzzle } = await import("../../src/services/puzzle.service.js");
const { User } = await import("../../src/services/user.service.js");
const { AuthorizationLevel } = await import("../../src/models/user.model.js");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await QuestModel.deleteMany({});
  await PuzzleModel.deleteMany({});
  await PuzzleModel.create([
    {
      name: "colors",
      displayName: "Colors",
      text: "Name **two** colors",
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
      text: "Name a fruit",
      solutionKeyword: "apple",
      solutionDisplayText: "Apple",
      hints: [],
    },
    {
      name: "finale",
      displayName: "Finale",
      text: "The end",
      solutionKeyword: "done",
      solutionDisplayText: "Done",
      hints: [{ text: "Say done", timePenalty: 0 }],
    },
  ]);
});

const PLAYER = ["player"];

/**
 * Creates a quest assigned to "player" containing the named puzzles.
 * @param {string[]} puzzleNames the puzzles, in order
 * @param {string} name the quest name
 * @returns {Promise<object>} the stored quest document
 */
async function createQuest(
  puzzleNames = ["colors", "fruit", "finale"],
  name = "test-quest"
) {
  const result = await QuestService.createQuest({
    name,
    displayName: "Test Quest",
    userName: "player",
    puzzles: puzzleNames.map((puzzleName) => ({ puzzleName })),
  });
  expect(result).toEqual({ status: "success", statusCode: 200 });
  return QuestModel.findOne({ name }).lean();
}

/**
 * Creates and starts a quest, then activates its first puzzle.
 * @returns {Promise<object>} the stored quest document
 */
async function createQuestWithFirstPuzzleInProgress() {
  const quest = await createQuest();
  await QuestService.startQuest(quest.name);
  const result = await QuestService.activatePuzzle(
    quest.name,
    "colors",
    PLAYER,
    quest.puzzles[0].activationCode
  );
  expect(result.status).toBe("success");
  return QuestModel.findOne({ name: quest.name }).lean();
}

function storedQuest(name = "test-quest") {
  return QuestModel.findOne({ name }).lean();
}

function createUser(userName, authorizationLevel, teamNames = []) {
  const user = new User({ userName, authorizationLevel });
  user.teams = teamNames.map((teamName) => ({ teamName }));
  return user;
}

/**
 * Runs a service call and checks that it stamped the current time.
 * @param {() => Promise<object>} action the call to run
 * @returns {Promise<{result: object, before: Date, after: Date}>} the result and time bounds
 */
async function timed(action) {
  const before = new Date();
  const result = await action();
  const after = new Date();
  return { result, before, after };
}

function expectBetween(date, before, after) {
  expect(date.getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(date.getTime()).toBeLessThanOrEqual(after.getTime());
}

describe("createQuest", () => {
  it("creates a not-started quest whose puzzles are all unavailable", async () => {
    const quest = await createQuest();

    expect(quest).toMatchObject({
      name: "test-quest",
      displayName: "Test Quest",
      userName: "player",
      status: QuestStatus.NOT_STARTED,
      textResponse: "",
      textResponseConfirmation: "",
    });
    expect(quest.puzzles.map((puzzle) => puzzle.puzzleName)).toEqual([
      "colors",
      "fruit",
      "finale",
    ]);
    for (const puzzle of quest.puzzles) {
      expect(puzzle.status).toBe(QuestPuzzleStatus.UNAVAILABLE);
      expect(puzzle.nextHintToDisplay).toBe(0);
      expect(puzzle.activationCode).toMatch(/^[0-9a-f]{32}$/);
      expect(puzzle.startTime).toBeUndefined();
      expect(puzzle.activationTime).toBeUndefined();
      expect(puzzle.endTime).toBeUndefined();
    }
    const codes = new Set(quest.puzzles.map((puzzle) => puzzle.activationCode));
    expect(codes.size).toBe(3);
  });

  it("uses the name as the display name when none is given", async () => {
    await QuestService.createQuest({ name: "plain", userName: "player" });

    expect((await storedQuest("plain")).displayName).toBe("plain");
  });

  it("creates a quest with no puzzles when none are given", async () => {
    await QuestService.createQuest({ name: "empty", userName: "player" });

    expect((await storedQuest("empty")).puzzles).toEqual([]);
  });

  it.each([
    ["My Big Quest", "my.big.quest"],
    ["  Spaced   Out\tQuest ", "spaced.out.quest"],
    ["Solo", "solo"],
  ])(
    "derives the name from display name %j as %j",
    async (displayName, expectedName) => {
      await QuestService.createQuest({ displayName, userName: "player" });

      const quests = await QuestModel.find({}).lean();
      expect(quests.map((quest) => quest.name)).toEqual([expectedName]);
    }
  );

  it("rejects a definition with neither a name nor a display name", async () => {
    expect(await QuestService.createQuest({ userName: "player" })).toEqual({
      status: "error",
      statusCode: 400,
      message: "Quest definition must contain a name or display name",
    });
  });

  it("rejects a definition without a user name", async () => {
    expect(await QuestService.createQuest({ name: "orphan" })).toEqual({
      status: "error",
      statusCode: 400,
      message: "Quest definition must contain a user name",
    });
  });

  it("rejects a duplicate quest name", async () => {
    await createQuest();

    expect(
      await QuestService.createQuest({ name: "test-quest", userName: "other" })
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Quest with name test-quest already exists",
    });
  });

  it("rejects puzzle names that do not exist", async () => {
    expect(
      await QuestService.createQuest({
        name: "bad",
        userName: "player",
        puzzles: [
          { puzzleName: "fruit" },
          { puzzleName: "nope" },
          { puzzleName: "nada" },
        ],
      })
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "No puzzles found with names: nope, nada",
    });
    expect(await storedQuest("bad")).toBeNull();
  });

  it("rejects a puzzle that appears more than once", async () => {
    expect(
      await QuestService.createQuest({
        name: "bad",
        userName: "player",
        puzzles: [{ puzzleName: "fruit" }, { puzzleName: "fruit" }],
      })
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Puzzles may appear only once in a quest: fruit",
    });
  });
});

describe("startQuest", () => {
  it("starts the quest and makes only the first puzzle available", async () => {
    await createQuest();

    const { result, before, after } = await timed(() =>
      QuestService.startQuest("test-quest")
    );

    expect(result).toEqual({ status: "success", statusCode: 200 });
    const quest = await storedQuest();
    expect(quest.status).toBe(QuestStatus.IN_PROGRESS);
    expect(quest.puzzles.map((puzzle) => puzzle.status)).toEqual([
      QuestPuzzleStatus.AWAITING_ACTIVATION,
      QuestPuzzleStatus.UNAVAILABLE,
      QuestPuzzleStatus.UNAVAILABLE,
    ]);
    expectBetween(quest.puzzles[0].startTime, before, after);
    expect(quest.puzzles[1].startTime).toBeUndefined();
  });

  it("returns 404 for an unknown quest", async () => {
    expect(await QuestService.startQuest("missing")).toEqual({
      status: "error",
      statusCode: 404,
      message: "No quest with quest name missing found",
    });
  });

  it("refuses to start a quest with no puzzles", async () => {
    await QuestService.createQuest({ name: "empty", userName: "player" });

    expect(await QuestService.startQuest("empty")).toEqual({
      status: "error",
      statusCode: 400,
      message: "Quest empty cannot be started; it has no puzzles",
    });
  });

  it("refuses to start a quest that has already started, reporting the numeric status", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    expect(await QuestService.startQuest("test-quest")).toEqual({
      status: "error",
      statusCode: 400,
      message: "Quest test-quest cannot be started; status is 1",
    });
  });
});

describe("activatePuzzle", () => {
  it("moves the awaiting puzzle to in progress and records the activation time", async () => {
    const created = await createQuest();
    await QuestService.startQuest("test-quest");

    const { result, before, after } = await timed(() =>
      QuestService.activatePuzzle(
        "test-quest",
        "colors",
        PLAYER,
        created.puzzles[0].activationCode
      )
    );

    expect(result.status).toBe("success");
    expect(result.statusCode).toBe(200);
    expectBetween(result.data.activationTime, before, after);
    const quest = await storedQuest();
    expect(quest.puzzles[0].status).toBe(QuestPuzzleStatus.IN_PROGRESS);
    expect(quest.puzzles[0].activationTime).toEqual(result.data.activationTime);
    expect(quest.puzzles[1].status).toBe(QuestPuzzleStatus.UNAVAILABLE);
  });

  it("allows a member of the team the quest is assigned to", async () => {
    const created = await createQuest();
    await QuestModel.updateOne({ name: "test-quest" }, { userName: "team-a" });
    await QuestService.startQuest("test-quest");

    const result = await QuestService.activatePuzzle(
      "test-quest",
      "colors",
      ["someone", "team-a"],
      created.puzzles[0].activationCode
    );

    expect(result.status).toBe("success");
  });

  it("rejects an incorrect activation code without changing state", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    expect(
      await QuestService.activatePuzzle("test-quest", "colors", PLAYER, "wrong")
    ).toEqual({
      status: "error",
      statusCode: 406,
      message: "Incorrect activation code for puzzle",
    });
    expect((await storedQuest()).puzzles[0].status).toBe(
      QuestPuzzleStatus.AWAITING_ACTIVATION
    );
  });

  it("rejects a user who is not assigned to the quest", async () => {
    const created = await createQuest();
    await QuestService.startQuest("test-quest");

    expect(
      await QuestService.activatePuzzle(
        "test-quest",
        "colors",
        ["other"],
        created.puzzles[0].activationCode
      )
    ).toEqual({
      status: "error",
      statusCode: 403,
      message:
        "User is not authorized to activate puzzles for quest test-quest",
    });
  });

  it("rejects activating a puzzle twice", async () => {
    const quest = await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.activatePuzzle(
        "test-quest",
        "colors",
        PLAYER,
        quest.puzzles[0].activationCode
      )
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Puzzle colors in quest test-quest is not awaiting activation",
    });
  });

  it("reports a later, still-unavailable puzzle as not found", async () => {
    const created = await createQuest();
    await QuestService.startQuest("test-quest");

    expect(
      await QuestService.activatePuzzle(
        "test-quest",
        "fruit",
        PLAYER,
        created.puzzles[1].activationCode
      )
    ).toEqual({
      status: "error",
      statusCode: 404,
      message: "No puzzle with name fruit in quest test-quest",
    });
  });

  it("rejects activation in a quest that has not started", async () => {
    const created = await createQuest();

    expect(
      await QuestService.activatePuzzle(
        "test-quest",
        "colors",
        PLAYER,
        created.puzzles[0].activationCode
      )
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Quest test-quest is not yet started",
    });
  });

  it("returns 404 for an unknown quest", async () => {
    expect(
      await QuestService.activatePuzzle("missing", "colors", PLAYER, "code")
    ).toEqual({
      status: "error",
      statusCode: 404,
      message: "No quest with quest name missing found",
    });
  });
});

describe("finishPuzzle", () => {
  it("completes the puzzle and makes the next one available", async () => {
    await createQuestWithFirstPuzzleInProgress();

    const { result, before, after } = await timed(() =>
      QuestService.finishPuzzle("test-quest", "colors", PLAYER, "red and blue")
    );

    expect(result).toEqual({
      status: "success",
      statusCode: 200,
      data: {
        endTime: expect.any(Date),
        solutionText: "Red and blue",
        nextPuzzleName: "fruit",
        nextPuzzleDisplayName: "Fruit",
      },
    });
    expectBetween(result.data.endTime, before, after);
    const quest = await storedQuest();
    expect(quest.status).toBe(QuestStatus.IN_PROGRESS);
    expect(quest.puzzles[0].status).toBe(QuestPuzzleStatus.COMPLETED);
    expect(quest.puzzles[0].endTime).toEqual(result.data.endTime);
    expect(quest.puzzles[1].status).toBe(QuestPuzzleStatus.AWAITING_ACTIVATION);
    expect(quest.puzzles[1].startTime).toEqual(result.data.endTime);
    expect(quest.puzzles[2].status).toBe(QuestPuzzleStatus.UNAVAILABLE);
  });

  it("completes the quest when the last puzzle is solved", async () => {
    await createQuest(["fruit"]);
    await QuestService.startQuest("test-quest");
    const created = await storedQuest();
    await QuestService.activatePuzzle(
      "test-quest",
      "fruit",
      PLAYER,
      created.puzzles[0].activationCode
    );

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "fruit",
      PLAYER,
      "apple"
    );

    expect(result.data).toEqual({
      endTime: expect.any(Date),
      solutionText: "Apple",
      questComplete: true,
    });
    const quest = await storedQuest();
    expect(quest.status).toBe(QuestStatus.COMPLETED);
    expect(quest.puzzles[0].status).toBe(QuestPuzzleStatus.COMPLETED);
  });

  it("plays a whole quest from start to completion", async () => {
    const created = await createQuest();
    await QuestService.startQuest("test-quest");
    const answers = { colors: "red blue", fruit: "apple", finale: "done" };

    for (const [index, puzzle] of created.puzzles.entries()) {
      const activation = await QuestService.activatePuzzle(
        "test-quest",
        puzzle.puzzleName,
        PLAYER,
        puzzle.activationCode
      );
      expect(activation.status).toBe("success");
      const solve = await QuestService.finishPuzzle(
        "test-quest",
        puzzle.puzzleName,
        PLAYER,
        answers[puzzle.puzzleName]
      );
      expect(solve.status).toBe("success");
      expect(Boolean(solve.data.questComplete)).toBe(
        index === created.puzzles.length - 1
      );
    }

    const quest = await storedQuest();
    expect(quest.status).toBe(QuestStatus.COMPLETED);
    expect(
      quest.puzzles.every((p) => p.status === QuestPuzzleStatus.COMPLETED)
    ).toBe(true);
  });

  it("rejects an incorrect guess without changing state", async () => {
    await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.finishPuzzle("test-quest", "colors", PLAYER, "green")
    ).toEqual({
      status: "error",
      statusCode: 406,
      message: "Incorrect guess for puzzle solution",
    });
    expect((await storedQuest()).puzzles[0].status).toBe(
      QuestPuzzleStatus.IN_PROGRESS
    );
  });

  it.each([
    ["BLUE and Red", true, "keywords match case-insensitively, in any order"],
    ["red", false, "every keyword must be present"],
    ["redblue", true, "keywords may run together"],
    ["infrared bluebird", true, "keywords match inside other words"],
  ])("guess %j is accepted: %s (%s)", async (guess, accepted) => {
    await createQuestWithFirstPuzzleInProgress();

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      guess
    );

    expect(result.status).toBe(accepted ? "success" : "error");
  });

  it("ignores spaces around commas and empty keywords", async () => {
    await PuzzleModel.updateOne(
      { name: "colors" },
      { solutionKeyword: " red ,, blue ," }
    );
    await createQuestWithFirstPuzzleInProgress();

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red,blue"
    );

    expect(result.status).toBe("success");
  });

  it("matches keywords literally rather than as regular expressions", async () => {
    await PuzzleModel.updateOne({ name: "colors" }, { solutionKeyword: "r.d" });
    await createQuestWithFirstPuzzleInProgress();

    const wildcard = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "rod"
    );
    const literal = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "R.D"
    );

    expect(wildcard.status).toBe("error");
    expect(literal.status).toBe("success");
  });

  it("accepts keywords containing regular expression syntax", async () => {
    await PuzzleModel.updateOne(
      { name: "colors" },
      { solutionKeyword: "c++,(x)" }
    );
    await createQuestWithFirstPuzzleInProgress();

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "C++ (x)"
    );

    expect(result.status).toBe("success");
  });

  it("rejects solving a puzzle that has not been activated", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    expect(
      await QuestService.finishPuzzle(
        "test-quest",
        "colors",
        PLAYER,
        "red blue"
      )
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Puzzle colors in quest test-quest is not in progress",
    });
  });

  it("rejects solving a puzzle in a completed quest", async () => {
    await createQuestWithFirstPuzzleInProgress();
    await QuestModel.updateOne(
      { name: "test-quest" },
      { status: QuestStatus.COMPLETED }
    );

    expect(
      await QuestService.finishPuzzle(
        "test-quest",
        "colors",
        PLAYER,
        "red blue"
      )
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Quest test-quest is already completed",
    });
  });

  it("rejects a user who is not assigned to the quest", async () => {
    await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.finishPuzzle("test-quest", "colors", ["other"], "red")
    ).toEqual({
      status: "error",
      statusCode: 403,
      message: "User is not authorized to solve puzzles for quest test-quest",
    });
  });

  it("returns the puzzle service's 404 when the puzzle's details are missing", async () => {
    await createQuestWithFirstPuzzleInProgress();
    await PuzzleModel.deleteOne({ name: "colors" });

    expect(
      await QuestService.finishPuzzle(
        "test-quest",
        "colors",
        PLAYER,
        "red blue"
      )
    ).toEqual({
      status: "error",
      statusCode: 404,
      message: "No puzzle with puzzle name colors found",
    });
  });

  it("records the solution and names the next puzzle when its details are missing", async () => {
    await createQuestWithFirstPuzzleInProgress();
    await PuzzleModel.deleteOne({ name: "fruit" });

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red blue"
    );

    expect(result.data).toMatchObject({
      nextPuzzleName: "fruit",
      nextPuzzleDisplayName: "fruit",
    });
    const quest = await storedQuest();
    expect(quest.puzzles[0].status).toBe(QuestPuzzleStatus.COMPLETED);
    expect(quest.puzzles[1].status).toBe(QuestPuzzleStatus.AWAITING_ACTIVATION);
  });

  it.each([
    [
      "finishPuzzle",
      (quest) => QuestService.finishPuzzle(quest, "colors", PLAYER, "red blue"),
    ],
    [
      "getPuzzleHint",
      (quest) => QuestService.getPuzzleHint(quest, "colors", PLAYER),
    ],
  ])("%s rejects a quest that has not started", async (_name, action) => {
    await createQuest();

    expect(await action("test-quest")).toEqual({
      status: "error",
      statusCode: 400,
      message: "Quest test-quest is not yet started",
    });
  });
});

describe("getPuzzleHint", () => {
  it("returns hints in order and warns when the next hint gives the solution away", async () => {
    await createQuestWithFirstPuzzleInProgress();

    const first = await QuestService.getPuzzleHint(
      "test-quest",
      "colors",
      PLAYER
    );
    const second = await QuestService.getPuzzleHint(
      "test-quest",
      "colors",
      PLAYER
    );

    expect(first).toEqual({
      status: "success",
      statusCode: 200,
      data: {
        hintText: "Think of the flag",
        moreHints: true,
        timePenalty: 60,
        isNextHintSolution: true,
      },
    });
    expect(second.data).toEqual({
      hintText: "It is red and blue",
      moreHints: false,
      timePenalty: 300,
      isNextHintSolution: false,
    });
    expect((await storedQuest()).puzzles[0].nextHintToDisplay).toBe(2);
  });

  it("returns false once every hint has been shown", async () => {
    await createQuestWithFirstPuzzleInProgress();
    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);
    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);

    expect(
      await QuestService.getPuzzleHint("test-quest", "colors", PLAYER)
    ).toEqual({ status: "success", statusCode: 200, data: false });
    expect((await storedQuest()).puzzles[0].nextHintToDisplay).toBe(2);
  });

  it("records only the hint position, not the time penalty (current behavior)", async () => {
    const before = await createQuestWithFirstPuzzleInProgress();

    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);

    const after = await storedQuest();
    expect(after.puzzles[0]).toEqual({
      ...before.puzzles[0],
      nextHintToDisplay: 1,
    });
    expect(after.status).toBe(before.status);
  });

  it("rejects hints for a puzzle that is not in progress", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    expect(
      await QuestService.getPuzzleHint("test-quest", "colors", PLAYER)
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Puzzle colors in quest test-quest is not in progress",
    });
  });

  it("rejects a user who is not assigned to the quest", async () => {
    await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.getPuzzleHint("test-quest", "colors", ["other"])
    ).toEqual({
      status: "error",
      statusCode: 403,
      message:
        "User is not authorized to request puzzle hints for quest test-quest",
    });
  });
});

describe("resetQuest", () => {
  it("returns the quest and every puzzle to the initial state, keeping activation codes", async () => {
    const before = await createQuestWithFirstPuzzleInProgress();
    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);
    await QuestService.finishPuzzle("test-quest", "colors", PLAYER, "red blue");

    expect(await QuestService.resetQuest("test-quest")).toEqual({
      status: "success",
      statusCode: 200,
    });

    const quest = await storedQuest();
    expect(quest.status).toBe(QuestStatus.NOT_STARTED);
    for (const [index, puzzle] of quest.puzzles.entries()) {
      expect(puzzle.status).toBe(QuestPuzzleStatus.UNAVAILABLE);
      expect(puzzle.nextHintToDisplay).toBe(0);
      expect(puzzle.startTime).toBeUndefined();
      expect(puzzle.activationTime).toBeUndefined();
      expect(puzzle.endTime).toBeUndefined();
      expect(puzzle.activationCode).toBe(before.puzzles[index].activationCode);
    }
  });

  it("returns 404 for an unknown quest", async () => {
    expect((await QuestService.resetQuest("missing")).statusCode).toBe(404);
  });
});

describe("updateQuest", () => {
  it("replaces the puzzle list, keeping given activation codes and generating missing ones", async () => {
    await createQuest();

    const result = await QuestService.updateQuest({
      name: "test-quest",
      displayName: "Renamed",
      userName: "team-a",
      puzzles: [
        { puzzleName: "finale", activationCode: "keep-this-code" },
        { puzzleName: "colors" },
      ],
    });

    expect(result).toEqual({ status: "success", statusCode: 200 });
    const quest = await storedQuest();
    expect(quest.displayName).toBe("Renamed");
    expect(quest.userName).toBe("team-a");
    expect(quest.puzzles.map((p) => [p.puzzleName, p.status])).toEqual([
      ["finale", QuestPuzzleStatus.UNAVAILABLE],
      ["colors", QuestPuzzleStatus.UNAVAILABLE],
    ]);
    expect(quest.puzzles[0].activationCode).toBe("keep-this-code");
    expect(quest.puzzles[1].activationCode).toMatch(/^[0-9a-f]{32}$/);
  });

  it("uses the name as the display name and keeps the user when they are omitted", async () => {
    await createQuest();

    await QuestService.updateQuest({
      name: "test-quest",
      puzzles: [{ puzzleName: "fruit" }],
    });

    const quest = await storedQuest();
    expect(quest.displayName).toBe("test-quest");
    expect(quest.userName).toBe("player");
  });

  it("keeps the stored progress and times of puzzles that stay in the quest", async () => {
    const before = await createQuestWithFirstPuzzleInProgress();
    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);

    // The admin quest edit page sends these fields, but not the times.
    await QuestService.updateQuest({
      name: "test-quest",
      displayName: "Renamed",
      puzzles: before.puzzles.map(({ puzzleName, status, activationCode }) => ({
        puzzleName,
        status,
        activationCode,
      })),
    });

    const quest = await storedQuest();
    expect(quest.displayName).toBe("Renamed");
    expect(quest.puzzles[0]).toEqual({
      ...before.puzzles[0],
      nextHintToDisplay: 1,
    });
    expect(quest.puzzles[0].startTime).toBeInstanceOf(Date);
    expect(quest.puzzles[0].activationTime).toBeInstanceOf(Date);
  });

  it("applies admin overrides to puzzle progress", async () => {
    await createQuestWithFirstPuzzleInProgress();

    await QuestService.updateQuest({
      name: "test-quest",
      puzzles: [
        { puzzleName: "colors", status: QuestPuzzleStatus.COMPLETED },
        {
          puzzleName: "fruit",
          status: QuestPuzzleStatus.AWAITING_ACTIVATION,
          nextHintToDisplay: 0,
        },
        { puzzleName: "finale" },
      ],
    });

    const quest = await storedQuest();
    expect(quest.puzzles.map((p) => p.status)).toEqual([
      QuestPuzzleStatus.COMPLETED,
      QuestPuzzleStatus.AWAITING_ACTIVATION,
      QuestPuzzleStatus.UNAVAILABLE,
    ]);
  });

  it("leaves the puzzles unchanged when the definition has no puzzle list", async () => {
    const before = await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.updateQuest({ name: "test-quest", displayName: "x" })
    ).toEqual({ status: "success", statusCode: 200 });

    const quest = await storedQuest();
    expect(quest.displayName).toBe("x");
    expect(quest.puzzles).toEqual(before.puzzles);
  });

  it("rejects puzzle names that do not exist, changing nothing", async () => {
    const before = await createQuest();

    expect(
      await QuestService.updateQuest({
        name: "test-quest",
        displayName: "Renamed",
        puzzles: [{ puzzleName: "colors" }, { puzzleName: "nope" }],
      })
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "No puzzles found with names: nope",
    });
    expect(await storedQuest()).toEqual(before);
  });

  it("rejects an invalid quest status", async () => {
    await createQuest();

    expect(
      await QuestService.updateQuest({ name: "test-quest", status: 7 })
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Invalid quest status 7",
    });
  });

  it("removes every puzzle when given an empty list", async () => {
    await createQuest();

    await QuestService.updateQuest({ name: "test-quest", puzzles: [] });

    expect((await storedQuest()).puzzles).toEqual([]);
  });

  it("can set the status back to not started", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    await QuestService.updateQuest({
      name: "test-quest",
      status: QuestStatus.NOT_STARTED,
    });

    expect((await storedQuest()).status).toBe(QuestStatus.NOT_STARTED);
  });

  it("returns 404 for an unknown quest", async () => {
    expect(
      await QuestService.updateQuest({ name: "missing", puzzles: [] })
    ).toEqual({
      status: "error",
      statusCode: 404,
      message: "No quest with quest name missing found",
    });
  });
});

describe("deleteQuest", () => {
  it("deletes the quest", async () => {
    await createQuest();

    expect(await QuestService.deleteQuest("test-quest")).toEqual({
      status: "success",
      statusCode: 200,
    });
    expect(await storedQuest()).toBeNull();
  });

  it("returns 404 for an unknown quest", async () => {
    expect(await QuestService.deleteQuest("missing")).toEqual({
      status: "error",
      statusCode: 404,
      message: "Quest with name missing does not exist",
    });
  });
});

describe("getQuestByQuestName", () => {
  it("returns every puzzle, with details and activation codes, to an admin", async () => {
    const created = await createQuest();

    const result = await QuestService.getQuestByQuestName(
      "test-quest",
      createUser("admin", AuthorizationLevel.ADMIN)
    );

    expect(result.status).toBe("success");
    const quest = result.data;
    expect(quest).toBeInstanceOf(QuestService.Quest);
    expect(quest.statusDescription).toBe("Not yet started");
    expect(quest.puzzles.map((p) => p.puzzleName)).toEqual([
      "colors",
      "fruit",
      "finale",
    ]);
    expect(quest.puzzles[0].activationCode).toBe(
      created.puzzles[0].activationCode
    );
    expect(quest.puzzles[0].puzzleDetail).toBeInstanceOf(Puzzle);
    expect(quest.puzzles[0].puzzleDetail.displayName).toBe("Colors");
  });

  it("applies no player filtering when there is no user", async () => {
    await createQuest();

    const result = await QuestService.getQuestByQuestName("test-quest", null);

    expect(result.data.puzzles).toHaveLength(3);
  });

  it("hides a quest that has not started from its player", async () => {
    await createQuest();

    expect(
      await QuestService.getQuestByQuestName(
        "test-quest",
        createUser("player", AuthorizationLevel.USER)
      )
    ).toEqual({
      status: "error",
      statusCode: 404,
      message:
        "no quests found matching quest name equal to test-quest and user name or team name that is one of [player] and status greater than or equal to 1",
    });
  });

  it("shows a player only the puzzles that have become available", async () => {
    await createQuestWithFirstPuzzleInProgress();
    await QuestService.finishPuzzle("test-quest", "colors", PLAYER, "red blue");

    const result = await QuestService.getQuestByQuestName(
      "test-quest",
      createUser("player", AuthorizationLevel.USER)
    );

    expect(
      result.data.puzzles.map((p) => [p.puzzleName, p.statusDescription])
    ).toEqual([
      ["colors", "Completed"],
      ["fruit", "Awaiting activation"],
    ]);
  });

  it("shows a quest assigned to a team to its members", async () => {
    await createQuest();
    await QuestModel.updateOne({ name: "test-quest" }, { userName: "team-a" });
    await QuestService.startQuest("test-quest");

    const result = await QuestService.getQuestByQuestName(
      "test-quest",
      createUser("someone", AuthorizationLevel.USER, ["team-a"])
    );

    expect(result.data.puzzles.map((p) => p.puzzleName)).toEqual(["colors"]);
  });

  it("hides a quest from players it is not assigned to", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    const result = await QuestService.getQuestByQuestName(
      "test-quest",
      createUser("other", AuthorizationLevel.USER)
    );

    expect(result.statusCode).toBe(404);
  });
});

describe("getQuestPuzzle", () => {
  it("returns one puzzle from the quest", async () => {
    await createQuest();

    const result = await QuestService.getQuestPuzzle(
      "test-quest",
      "fruit",
      null
    );

    expect(result.data.puzzleName).toBe("fruit");
    expect(result.data.puzzleDetail.solutionDisplayText).toBe("Apple");
  });

  it("returns 404 for a puzzle the player cannot see yet", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    expect(
      await QuestService.getQuestPuzzle(
        "test-quest",
        "fruit",
        createUser("player", AuthorizationLevel.USER)
      )
    ).toEqual({
      status: "error",
      statusCode: 404,
      message: "No puzzle named fruit found for quest test-quest",
    });
  });
});

describe("findQuests", () => {
  it("returns every quest when given no criteria", async () => {
    await createQuest(["fruit"], "one");
    await createQuest(["fruit"], "two");

    const result = await QuestService.findQuests();

    expect(result.data.map((quest) => quest.name).sort()).toEqual([
      "one",
      "two",
    ]);
    expect(result.data[0].puzzles[0].puzzleDetail).toBeUndefined();
  });

  it("returns 404 when there are no quests", async () => {
    expect(await QuestService.findQuests()).toEqual({
      status: "error",
      statusCode: 404,
      message: "no quests found",
    });
  });
});

describe("getPuzzleActivationQrCode", () => {
  it("returns a PNG image", async () => {
    await createQuest();

    const result = await QuestService.getPuzzleActivationQrCode(
      "test-quest",
      "colors"
    );

    expect(result.status).toBe("success");
    expect(result.data.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  it("returns 404 for a puzzle that is not in the quest", async () => {
    await createQuest();

    expect(
      (await QuestService.getPuzzleActivationQrCode("test-quest", "nope"))
        .statusCode
    ).toBe(404);
  });
});

describe("text responses", () => {
  it("accepts the expected response case-insensitively, once", async () => {
    await createQuest();
    await QuestService.setExpectedTextResponse(
      "test-quest",
      "Ready",
      "Let's go!"
    );

    expect(
      await QuestService.validateExpectedTextResponse("test-quest", "READY")
    ).toEqual({ status: "success", statusCode: 200, data: "Let's go!" });
    expect(
      await QuestService.validateExpectedTextResponse("test-quest", "ready")
    ).toEqual({
      status: "error",
      statusCode: 418,
      message: "Quest is not expecting a text response",
    });
  });

  it("rejects a response that does not match, leaving it expected", async () => {
    await createQuest();
    await QuestService.setExpectedTextResponse("test-quest", "Ready", "Go");

    expect(
      await QuestService.validateExpectedTextResponse("test-quest", "nope")
    ).toEqual({
      status: "error",
      statusCode: 400,
      message: "Expected response does not match",
    });
    expect((await storedQuest()).textResponse).toBe("Ready");
  });
});

describe("getQuestRunBook", () => {
  function createPdfRecorder() {
    const calls = [];
    const pdfDoc = new Proxy(
      {},
      {
        get(target, method) {
          return (...args) => {
            calls.push([method, ...args]);
            return pdfDoc;
          };
        },
      }
    );
    return { pdfDoc, calls };
  }

  it("adds a titled page per puzzle and ends the document", async () => {
    await createQuest(["colors", "fruit"]);
    const { pdfDoc, calls } = createPdfRecorder();

    expect(await QuestService.getQuestRunBook("test-quest", pdfDoc)).toEqual({
      status: "success",
      statusCode: 200,
    });

    expect(calls.filter(([method]) => method === "addPage")).toHaveLength(2);
    const text = calls
      .filter(([method]) => method === "text")
      .map(([, value]) => value);
    expect(text).toEqual(
      expect.arrayContaining(["Colors", "Name ", "two", " colors", "Fruit"])
    );
    expect(calls.at(-1)).toEqual(["end"]);
  });

  it("returns 500 when a puzzle's details are missing", async () => {
    await createQuest(["fruit"]);
    await PuzzleModel.deleteOne({ name: "fruit" });
    const { pdfDoc } = createPdfRecorder();

    const result = await QuestService.getQuestRunBook("test-quest", pdfDoc);

    expect(result.status).toBe("error");
    expect(result.statusCode).toBe(500);
  });
});
