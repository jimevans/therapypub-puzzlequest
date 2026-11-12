import path from "node:path";
// Characterization tests for the quest service: they record what the service
// does today, including behavior that is probably wrong, so that the Phase 1
// state machine rewrite changes behavior only on purpose. Tests whose names
// end in "(current behavior)" pin down a known quirk or bug; when Phase 1
// fixes one, update that test to describe the new behavior.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { assigneeIdsOf, puzzleIdsOf, withPuzzleNames } from "../references.js";

const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel, QuestPuzzleStatus, QuestStatus } =
  await import("../../src/models/quest.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const PuzzleService = await import("../../src/services/puzzle.service.js");
const { Puzzle } = PuzzleService;
const { User, UserTeam } = await import("../../src/services/user.service.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

/**
 * Gets a quest as seen through its first entry, or the user's own.
 * @param questName the quest
 * @param user who's asking; omit for no filtering
 * @returns the result, with the quest as seen through the entry
 */
async function getQuest(
  questName: string,
  user?: InstanceType<typeof User> | null
) {
  const result = await QuestService.getQuestEntries(questName, user);
  return result.status === "error"
    ? result
    : { ...result, data: result.data[0] };
}

let PLAYER: string[] = [];

beforeEach(async () => {
  await QuestModel.deleteMany({});
  await PuzzleModel.deleteMany({});
  await UserModel.deleteMany({});
  await TeamModel.deleteMany({});
  const users = await UserModel.create(
    ["player", "other", "someone", "admin"].map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
    }))
  );
  await TeamModel.create({
    teamName: "team-a",
    displayName: "Team A",
    joinCode: "join-a",
    memberIds: [users[2]._id],
  });
  PLAYER = await assigneeIdsOf("player");
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

/**
 * Creates a quest assigned to "player" containing the named puzzles.
 * @param puzzleNames the puzzles, in order
 * @param name the quest name
 * @returns the stored quest document
 */
async function createQuest(
  puzzleNames = ["colors", "fruit", "finale"],
  name = "test-quest"
) {
  const result = await QuestService.createQuest({
    name,
    displayName: "Test Quest",
    entrants: [{ kind: "user", name: "player" }],
    puzzles: puzzleNames.map((puzzleName) => ({ puzzleName })),
  });
  expect(result).toEqual({ status: "success", statusCode: 200 });
  return withPuzzleNames((await QuestModel.findOne({ name }).lean())!);
}

/**
 * Creates and starts a quest, then activates its first puzzle.
 * @returns the stored quest document
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
  return withPuzzleNames(
    (await QuestModel.findOne({ name: quest.name }).lean())!
  );
}

/** Assigns the test quest to team-a, whose member is "someone". */
async function assignToTeamA() {
  const [teamId] = await assigneeIdsOf("team-a");
  await QuestModel.updateOne(
    { name: "test-quest" },
    { "entries.0.assignee": { kind: "team", id: teamId } }
  );
}

async function storedQuest(name = "test-quest") {
  return withPuzzleNames((await QuestModel.findOne({ name }).lean())!);
}

async function createUser(
  userName: string,
  authorizationLevel: number,
  teamNames: string[] = []
) {
  const [id] = await assigneeIdsOf(userName);
  const user = new User({
    id,
    userName,
    displayName: userName,
    email: `${userName}@example.com`,
    phone: "",
    sms: false,
    authorizationLevel,
  });
  const teamIds = await assigneeIdsOf(...teamNames);
  user.teams = teamNames.map(
    (teamName, index) =>
      new UserTeam({ id: teamIds[index], teamName, displayName: teamName })
  );
  return user;
}

/**
 * Runs a service call and checks that it stamped the current time.
 * @param action the call to run
 * @returns the result and time bounds
 */
async function timed<T>(
  action: () => Promise<T>
): Promise<{ result: T; before: Date; after: Date }> {
  const before = new Date();
  const result = await action();
  const after = new Date();
  return { result, before, after };
}

function expectBetween(
  date: Date | null | undefined,
  before: Date,
  after: Date
): void {
  expect(date).toBeInstanceOf(Date);
  expect(date!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(date!.getTime()).toBeLessThanOrEqual(after.getTime());
}

describe("createQuest", () => {
  it("creates a not-started quest whose puzzles are all unavailable", async () => {
    const quest = await createQuest();

    expect(quest).toMatchObject({
      name: "test-quest",
      displayName: "Test Quest",
    });
    expect(quest.entries).toHaveLength(1);
    expect(quest.entries[0]).toMatchObject({
      assignee: {
        kind: "user",
        id: (await UserModel.findOne({ userName: "player" }).lean())!._id,
      },
      status: QuestStatus.NOT_STARTED,
      messages: [],
    });
    expect(quest.entries[0]!.challenge).toBeUndefined();
    expect(quest.challenges).toEqual([]);
    expect(quest.textAppPlayers).toBe(true);
    expect(quest.puzzles.map((puzzle) => puzzle.puzzleName)).toEqual([
      "colors",
      "fruit",
      "finale",
    ]);
    for (const puzzle of quest.puzzles) {
      expect(puzzle.activationCode).toMatch(/^[0-9a-f]{32}$/);
    }
    expect(quest.entries[0]!.puzzles.map((puzzle) => puzzle.puzzleId)).toEqual(
      quest.puzzles.map((puzzle) => puzzle.puzzleId)
    );
    for (const puzzle of quest.entries[0]!.puzzles) {
      expect(puzzle.status).toBe(QuestPuzzleStatus.UNAVAILABLE);
      expect(puzzle.nextHintToDisplay).toBe(0);
      expect(puzzle.startTime).toBeUndefined();
      expect(puzzle.activationTime).toBeUndefined();
      expect(puzzle.endTime).toBeUndefined();
    }
    const codes = new Set(quest.puzzles.map((puzzle) => puzzle.activationCode));
    expect(codes.size).toBe(3);
  });

  it("uses the name as the display name when none is given", async () => {
    await QuestService.createQuest({
      name: "plain",
      entrants: [{ kind: "user", name: "player" }],
    });

    expect((await storedQuest("plain")).displayName).toBe("plain");
  });

  it("creates a quest with no puzzles when none are given", async () => {
    await QuestService.createQuest({
      name: "empty",
      entrants: [{ kind: "user", name: "player" }],
    });

    expect((await storedQuest("empty")).puzzles).toEqual([]);
  });

  it.each([
    ["My Big Quest", "my.big.quest"],
    ["  Spaced   Out\tQuest ", "spaced.out.quest"],
    ["Solo", "solo"],
  ])(
    "derives the name from display name %j as %j",
    async (displayName, expectedName) => {
      await QuestService.createQuest({
        displayName,
        entrants: [{ kind: "user", name: "player" }],
      });

      const quests = await QuestModel.find({}).lean();
      expect(quests.map((quest) => quest.name)).toEqual([expectedName]);
    }
  );

  it("rejects a definition with neither a name nor a display name", async () => {
    expect(
      await QuestService.createQuest({
        entrants: [{ kind: "user", name: "player" }],
      })
    ).toEqual({
      status: "error",
      statusCode: 400,
      reason: "invalid-quest",
      message: "Quest definition must contain a name or display name",
    });
  });

  it("uses an activation code given for a puzzle, and generates the others", async () => {
    await QuestService.createQuest({
      name: "coded",
      entrants: [{ kind: "user", name: "player" }],
      puzzles: [
        { puzzleName: "colors", activationCode: "printed-code" },
        { puzzleName: "fruit" },
      ],
    });

    const quest = await storedQuest("coded");
    expect(quest.puzzles[0].activationCode).toBe("printed-code");
    expect(quest.puzzles[1].activationCode).toMatch(/^[0-9a-f]{32}$/);
  });

  it("rejects a definition without a user or team to assign it to", async () => {
    expect(await QuestService.createQuest({ name: "orphan" })).toEqual({
      status: "error",
      statusCode: 400,
      reason: "invalid-quest",
      field: "entrants",
      message:
        "Quest definition must contain at least one user or team to play it",
    });
  });

  it.each([
    ["a user", "user", "nobody"],
    ["a team", "team", "nobody"],
    ["a team by a user's name", "team", "player"],
  ] as const)(
    "rejects assigning it to %s that doesn't exist",
    async (_, kind, name) => {
      expect(
        await QuestService.createQuest({
          name: "orphan",
          entrants: [{ kind, name }],
        })
      ).toEqual({
        status: "error",
        statusCode: 400,
        reason: "invalid-quest",
        field: "entrants",
        message: `No ${kind} with name ${name} found`,
      });
      expect(await QuestModel.countDocuments({ name: "orphan" })).toBe(0);
    }
  );

  it("rejects a duplicate quest name", async () => {
    await createQuest();

    expect(
      await QuestService.createQuest({
        name: "test-quest",
        entrants: [{ kind: "user", name: "other" }],
      })
    ).toEqual({
      status: "error",
      statusCode: 400,
      reason: "already-exists",
      message: "Quest with name test-quest already exists",
    });
  });

  it("rejects puzzle names that do not exist", async () => {
    expect(
      await QuestService.createQuest({
        name: "bad",
        entrants: [{ kind: "user", name: "player" }],
        puzzles: [
          { puzzleName: "fruit" },
          { puzzleName: "nope" },
          { puzzleName: "nada" },
        ],
      })
    ).toEqual({
      status: "error",
      statusCode: 400,
      reason: "invalid-quest",
      message: "No puzzles found with names: nope, nada",
    });
    expect(await storedQuest("bad")).toBeNull();
  });

  it("rejects a puzzle that appears more than once", async () => {
    expect(
      await QuestService.createQuest({
        name: "bad",
        entrants: [{ kind: "user", name: "player" }],
        puzzles: [{ puzzleName: "fruit" }, { puzzleName: "fruit" }],
      })
    ).toEqual({
      status: "error",
      statusCode: 400,
      reason: "invalid-quest",
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
    expect(quest.entries[0]!.status).toBe(QuestStatus.IN_PROGRESS);
    expect(quest.entries[0]!.puzzles.map((puzzle) => puzzle.status)).toEqual([
      QuestPuzzleStatus.AWAITING_ACTIVATION,
      QuestPuzzleStatus.UNAVAILABLE,
      QuestPuzzleStatus.UNAVAILABLE,
    ]);
    expectBetween(quest.entries[0]!.puzzles[0].startTime, before, after);
    expect(quest.entries[0]!.puzzles[1].startTime).toBeUndefined();
  });

  it("returns 404 for an unknown quest", async () => {
    expect(await QuestService.startQuest("missing")).toEqual({
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: "No quest with quest name missing found",
    });
  });

  it("refuses to start a quest with no puzzles", async () => {
    await QuestService.createQuest({
      name: "empty",
      entrants: [{ kind: "user", name: "player" }],
    });

    expect(await QuestService.startQuest("empty")).toEqual({
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message: "Quest empty cannot be started; it has no puzzles",
    });
  });

  it("refuses to start a quest that has already started, reporting the numeric status", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    expect(await QuestService.startQuest("test-quest")).toEqual({
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
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
    expectBetween(result.data!.activationTime, before, after);
    const quest = await storedQuest();
    expect(quest.entries[0]!.puzzles[0].status).toBe(
      QuestPuzzleStatus.IN_PROGRESS
    );
    expect(quest.entries[0]!.puzzles[0].activationTime).toEqual(
      result.data!.activationTime
    );
    expect(quest.entries[0]!.puzzles[1].status).toBe(
      QuestPuzzleStatus.UNAVAILABLE
    );
  });

  it("allows a member of the team the quest is assigned to", async () => {
    const created = await createQuest();
    await assignToTeamA();
    await QuestService.startQuest("test-quest");

    const result = await QuestService.activatePuzzle(
      "test-quest",
      "colors",
      await assigneeIdsOf("someone", "team-a"),
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
      reason: "wrong-activation-code",
      message: "Incorrect activation code for puzzle",
    });
    expect((await storedQuest()).entries[0]!.puzzles[0].status).toBe(
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
        await assigneeIdsOf("other"),
        created.puzzles[0].activationCode
      )
    ).toEqual({
      status: "error",
      statusCode: 403,
      reason: "forbidden",
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
      reason: "wrong-state",
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
      reason: "not-found",
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
      reason: "wrong-state",
      message: "Quest test-quest is not yet started",
    });
  });

  it("returns 404 for an unknown quest", async () => {
    expect(
      await QuestService.activatePuzzle("missing", "colors", PLAYER, "code")
    ).toEqual({
      status: "error",
      statusCode: 404,
      reason: "not-found",
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
    expectBetween(result.data!.endTime, before, after);
    const quest = await storedQuest();
    expect(quest.entries[0]!.status).toBe(QuestStatus.IN_PROGRESS);
    expect(quest.entries[0]!.puzzles[0].status).toBe(
      QuestPuzzleStatus.COMPLETED
    );
    expect(quest.entries[0]!.puzzles[0].endTime).toEqual(result.data!.endTime);
    expect(quest.entries[0]!.puzzles[1].status).toBe(
      QuestPuzzleStatus.AWAITING_ACTIVATION
    );
    expect(quest.entries[0]!.puzzles[1].startTime).toEqual(
      result.data!.endTime
    );
    expect(quest.entries[0]!.puzzles[2].status).toBe(
      QuestPuzzleStatus.UNAVAILABLE
    );
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
    expect(quest.entries[0]!.status).toBe(QuestStatus.COMPLETED);
    expect(quest.entries[0]!.puzzles[0].status).toBe(
      QuestPuzzleStatus.COMPLETED
    );
  });

  it("plays a whole quest from start to completion", async () => {
    const created = await createQuest();
    await QuestService.startQuest("test-quest");
    const answers: Record<string, string> = {
      colors: "red blue",
      fruit: "apple",
      finale: "done",
    };

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
      expect(Boolean(solve.data!.questComplete)).toBe(
        index === created.puzzles.length - 1
      );
    }

    const quest = await storedQuest();
    expect(quest.entries[0]!.status).toBe(QuestStatus.COMPLETED);
    expect(
      quest.entries[0]!.puzzles.every(
        (p) => p.status === QuestPuzzleStatus.COMPLETED
      )
    ).toBe(true);
  });

  it("rejects an incorrect guess without changing state", async () => {
    await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.finishPuzzle("test-quest", "colors", PLAYER, "green")
    ).toEqual({
      status: "error",
      statusCode: 406,
      reason: "wrong-answer",
      message: "Incorrect guess for puzzle solution",
    });
    expect((await storedQuest()).entries[0]!.puzzles[0].status).toBe(
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
      reason: "wrong-state",
      message: "Puzzle colors in quest test-quest is not in progress",
    });
  });

  it("rejects solving a puzzle in a completed quest", async () => {
    await createQuestWithFirstPuzzleInProgress();
    await QuestModel.updateOne(
      { name: "test-quest" },
      { "entries.0.status": QuestStatus.COMPLETED }
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
      reason: "wrong-state",
      message: "Quest test-quest is already completed",
    });
  });

  it("rejects a user who is not assigned to the quest", async () => {
    await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.finishPuzzle(
        "test-quest",
        "colors",
        await assigneeIdsOf("other"),
        "red"
      )
    ).toEqual({
      status: "error",
      statusCode: 403,
      reason: "forbidden",
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
      reason: "not-found",
      message: "No puzzle with puzzle name colors found",
    });
  });

  it("records the solution and names the next puzzle when its details are missing", async () => {
    await createQuestWithFirstPuzzleInProgress();
    // Deleted behind the quest's back: the service refuses to delete a puzzle
    // a quest uses, but data stored before that rule may lack one.
    const [fruitId] = await puzzleIdsOf("fruit");
    await PuzzleModel.deleteOne({ name: "fruit" });

    const result = await QuestService.finishPuzzle(
      "test-quest",
      "colors",
      PLAYER,
      "red blue"
    );

    expect(result.data).toMatchObject({
      nextPuzzleName: `deleted-puzzle-${fruitId.toString()}`,
      nextPuzzleDisplayName: `deleted-puzzle-${fruitId.toString()}`,
    });
    const quest = await storedQuest();
    expect(quest.entries[0]!.puzzles[0].status).toBe(
      QuestPuzzleStatus.COMPLETED
    );
    expect(quest.entries[0]!.puzzles[1].status).toBe(
      QuestPuzzleStatus.AWAITING_ACTIVATION
    );
  });

  it.each([
    [
      "finishPuzzle",
      (quest: string) =>
        QuestService.finishPuzzle(quest, "colors", PLAYER, "red blue"),
    ],
    [
      "getPuzzleHint",
      (quest: string) => QuestService.getPuzzleHint(quest, "colors", PLAYER),
    ],
  ])("%s rejects a quest that has not started", async (_name, action) => {
    await createQuest();

    expect(await action("test-quest")).toEqual({
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
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
        timePenalty: 60,
        nextHint: { timePenalty: 300, solutionWarning: true },
      },
    });
    expect(second.data).toEqual({
      hintText: "It is red and blue",
      timePenalty: 300,
      nextHint: null,
    });
    expect((await storedQuest()).entries[0]!.puzzles[0].nextHintToDisplay).toBe(
      2
    );
  });

  it("returns false once every hint has been shown", async () => {
    await createQuestWithFirstPuzzleInProgress();
    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);
    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);

    expect(
      await QuestService.getPuzzleHint("test-quest", "colors", PLAYER)
    ).toEqual({ status: "success", statusCode: 200, data: false });
    expect((await storedQuest()).entries[0]!.puzzles[0].nextHintToDisplay).toBe(
      2
    );
  });

  it("records only the hint position, not the time penalty (current behavior)", async () => {
    const before = await createQuestWithFirstPuzzleInProgress();

    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);

    const after = await storedQuest();
    expect(after.puzzles).toEqual(before.puzzles);
    expect(after.entries[0]!.puzzles[0]).toEqual({
      ...before.entries[0]!.puzzles[0],
      nextHintToDisplay: 1,
    });
    expect(after.entries[0]!.status).toBe(before.entries[0]!.status);
  });

  it("rejects hints for a puzzle that is not in progress", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    expect(
      await QuestService.getPuzzleHint("test-quest", "colors", PLAYER)
    ).toEqual({
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message: "Puzzle colors in quest test-quest is not in progress",
    });
  });

  it("rejects a user who is not assigned to the quest", async () => {
    await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.getPuzzleHint(
        "test-quest",
        "colors",
        await assigneeIdsOf("other")
      )
    ).toEqual({
      status: "error",
      statusCode: 403,
      reason: "forbidden",
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
    expect(quest.entries[0]!.status).toBe(QuestStatus.NOT_STARTED);
    for (const puzzle of quest.entries[0]!.puzzles) {
      expect(puzzle.status).toBe(QuestPuzzleStatus.UNAVAILABLE);
      expect(puzzle.nextHintToDisplay).toBe(0);
      expect(puzzle.startTime).toBeUndefined();
      expect(puzzle.activationTime).toBeUndefined();
      expect(puzzle.endTime).toBeUndefined();
    }
    for (const [index, puzzle] of quest.puzzles.entries()) {
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
      entrants: [{ kind: "team", name: "team-a" }],
      puzzles: [
        { puzzleName: "finale", activationCode: "keep-this-code" },
        { puzzleName: "colors" },
      ],
    });

    expect(result).toEqual({ status: "success", statusCode: 200 });
    const quest = await storedQuest();
    expect(quest.displayName).toBe("Renamed");
    expect(quest.entries[0]!.assignee).toEqual({
      kind: "team",
      id: (await TeamModel.findOne({ teamName: "team-a" }).lean())!._id,
    });
    expect(
      quest.puzzles.map((p, index) => [
        p.puzzleName,
        quest.entries[0]!.puzzles[index].status,
      ])
    ).toEqual([
      ["finale", QuestPuzzleStatus.UNAVAILABLE],
      ["colors", QuestPuzzleStatus.UNAVAILABLE],
    ]);
    expect(quest.puzzles[0].activationCode).toBe("keep-this-code");
    expect(quest.puzzles[1].activationCode).toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps the display name and the user when they are omitted", async () => {
    await createQuest();

    await QuestService.updateQuest({
      name: "test-quest",
      puzzles: [{ puzzleName: "fruit" }],
    });

    const quest = await storedQuest();
    expect(quest.displayName).toBe("Test Quest");
    expect(quest.entries[0]!.assignee).toEqual({
      kind: "user",
      id: (await UserModel.findOne({ userName: "player" }).lean())!._id,
    });
  });

  it("keeps the stored progress and times of puzzles that stay in the quest", async () => {
    const before = await createQuestWithFirstPuzzleInProgress();
    await QuestService.getPuzzleHint("test-quest", "colors", PLAYER);

    // The admin quest edit page sends these fields, but not the times.
    await QuestService.updateQuest({
      name: "test-quest",
      displayName: "Renamed",
      puzzles: before.puzzles.map(({ puzzleName, activationCode }, index) => ({
        puzzleName,
        status: before.entries[0]!.puzzles[index].status,
        activationCode,
      })),
    });

    const quest = await storedQuest();
    expect(quest.displayName).toBe("Renamed");
    expect(quest.puzzles[0]).toEqual(before.puzzles[0]);
    expect(quest.entries[0]!.puzzles[0]).toEqual({
      ...before.entries[0]!.puzzles[0],
      nextHintToDisplay: 1,
    });
    expect(quest.entries[0]!.puzzles[0].startTime).toBeInstanceOf(Date);
    expect(quest.entries[0]!.puzzles[0].activationTime).toBeInstanceOf(Date);
  });

  it("leaves the puzzles unchanged when the definition has no puzzle list", async () => {
    const before = await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.updateQuest({ name: "test-quest", displayName: "x" })
    ).toEqual({ status: "success", statusCode: 200 });

    const quest = await storedQuest();
    expect(quest.displayName).toBe("x");
    expect(quest.puzzles).toEqual(before.puzzles);
    expect(quest.entries[0]!.puzzles).toEqual(before.entries[0]!.puzzles);
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
      reason: "invalid-quest",
      message: "No puzzles found with names: nope",
    });
    expect(await storedQuest()).toEqual(before);
  });

  it("removes every puzzle when given an empty list", async () => {
    await createQuest();

    await QuestService.updateQuest({ name: "test-quest", puzzles: [] });

    expect((await storedQuest()).puzzles).toEqual([]);
  });

  it("ignores progress in the definition, which changes only through the game's actions", async () => {
    const before = await createQuestWithFirstPuzzleInProgress();

    // The quest editor used to send these, and saving a stale editor page
    // rewound the players.
    expect(
      await QuestService.updateQuest({
        name: "test-quest",
        status: QuestStatus.NOT_STARTED,
        puzzles: [
          {
            puzzleName: "colors",
            status: QuestPuzzleStatus.COMPLETED,
            nextHintToDisplay: 2,
            startTime: new Date(0),
          },
          {
            puzzleName: "fruit",
            status: QuestPuzzleStatus.AWAITING_ACTIVATION,
          },
          { puzzleName: "finale" },
        ],
      } as never)
    ).toEqual({ status: "success", statusCode: 200 });

    const quest = await storedQuest();
    expect(quest.entries[0]!.status).toBe(QuestStatus.IN_PROGRESS);
    expect(quest.puzzles).toEqual(before.puzzles);
    expect(quest.entries[0]!.puzzles).toEqual(before.entries[0]!.puzzles);
  });

  it("lets puzzles after the ones the players have reached change", async () => {
    await createQuestWithFirstPuzzleInProgress();

    expect(
      await QuestService.updateQuest({
        name: "test-quest",
        puzzles: [{ puzzleName: "colors" }, { puzzleName: "finale" }],
      })
    ).toEqual({ status: "success", statusCode: 200 });

    expect((await storedQuest()).puzzles.map((p) => p.puzzleName)).toEqual([
      "colors",
      "finale",
    ]);
  });

  it.each([
    ["moved", ["fruit", "colors", "finale"]],
    ["removed", ["fruit", "finale"]],
  ])(
    "refuses to let a puzzle the players have reached be %s",
    async (_, puzzleNames) => {
      const before = await createQuestWithFirstPuzzleInProgress();

      expect(
        await QuestService.updateQuest({
          name: "test-quest",
          displayName: "Renamed",
          puzzles: puzzleNames.map((puzzleName) => ({ puzzleName })),
        })
      ).toEqual({
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
        message:
          "Puzzle colors has already been reached by user player, so it must stay in its place at the start of the quest",
      });
      expect(await storedQuest()).toEqual(before);
    }
  );

  it("locks a completed quest's puzzle list until it is reset", async () => {
    await createQuest(["fruit"]);
    await QuestService.startQuest("test-quest");
    const { activationCode } = (await storedQuest()).puzzles[0];
    await QuestService.activatePuzzle(
      "test-quest",
      "fruit",
      PLAYER,
      activationCode
    );
    await QuestService.finishPuzzle("test-quest", "fruit", PLAYER, "apple");

    const extended = [{ puzzleName: "fruit" }, { puzzleName: "finale" }];
    expect(
      await QuestService.updateQuest({ name: "test-quest", puzzles: extended })
    ).toEqual({
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message:
        "Quest test-quest is completed by user player, so its puzzles can't change until that entry is reset",
    });
    expect(
      await QuestService.updateQuest({
        name: "test-quest",
        displayName: "Renamed",
        puzzles: [{ puzzleName: "fruit" }],
      })
    ).toEqual({ status: "success", statusCode: 200 });

    await QuestService.resetQuest("test-quest");
    expect(
      await QuestService.updateQuest({ name: "test-quest", puzzles: extended })
    ).toEqual({ status: "success", statusCode: 200 });
  });

  it("checks the puzzle list again when the players progress during an edit", async () => {
    await createQuestWithFirstPuzzleInProgress();
    const realSave = QuestModel.prototype.save;
    // The players solve the first puzzle just before the edit is saved, so
    // the edit is checked again against the new progress.
    vi.spyOn(QuestModel.prototype, "save").mockImplementationOnce(
      async function (this: InstanceType<typeof QuestModel>) {
        await QuestService.finishPuzzle(
          "test-quest",
          "colors",
          PLAYER,
          "red blue"
        );
        return realSave.call(this);
      }
    );

    const result = await QuestService.updateQuest({
      name: "test-quest",
      puzzles: [{ puzzleName: "colors" }, { puzzleName: "finale" }],
    });
    vi.restoreAllMocks();

    expect(result).toEqual({
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message:
        "Puzzle fruit has already been reached by user player, so it must stay in its place at the start of the quest",
    });
    expect(
      (await storedQuest()).entries[0]!.puzzles.map((p) => p.status)
    ).toEqual([
      QuestPuzzleStatus.COMPLETED,
      QuestPuzzleStatus.AWAITING_ACTIVATION,
      QuestPuzzleStatus.UNAVAILABLE,
    ]);
  });

  it("returns 404 for an unknown quest", async () => {
    expect(
      await QuestService.updateQuest({ name: "missing", puzzles: [] })
    ).toEqual({
      status: "error",
      statusCode: 404,
      reason: "not-found",
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
      reason: "not-found",
      message: "Quest with name missing does not exist",
    });
  });
});

describe("getQuestEntries", () => {
  it("returns every puzzle, with details and activation codes, to an admin", async () => {
    const created = await createQuest();

    const result = await getQuest(
      "test-quest",
      await createUser("admin", AuthorizationLevel.ADMIN)
    );

    expect(result.status).toBe("success");
    const quest = result.data!;
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
    expect(quest.puzzles[0].puzzleDetail!.displayName).toBe("Colors");
  });

  it("applies no player filtering when there is no user", async () => {
    await createQuest();

    const result = await getQuest("test-quest", null);

    expect(result.data!.puzzles).toHaveLength(3);
  });

  it("hides a quest that has not started from its player", async () => {
    await createQuest();

    expect(
      await getQuest(
        "test-quest",
        await createUser("player", AuthorizationLevel.USER)
      )
    ).toEqual({
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message:
        "no quests found matching quest name equal to test-quest and assigned to the user or one of their teams and status greater than or equal to 1",
    });
  });

  it("shows a player only the puzzles that have become available", async () => {
    await createQuestWithFirstPuzzleInProgress();
    await QuestService.finishPuzzle("test-quest", "colors", PLAYER, "red blue");

    const result = await getQuest(
      "test-quest",
      await createUser("player", AuthorizationLevel.USER)
    );

    expect(
      result.data!.puzzles.map((p) => [p.puzzleName, p.statusDescription])
    ).toEqual([
      ["colors", "Completed"],
      ["fruit", "Awaiting activation"],
    ]);
  });

  it("shows a quest assigned to a team to its members", async () => {
    await createQuest();
    await assignToTeamA();
    await QuestService.startQuest("test-quest");

    const result = await getQuest(
      "test-quest",
      await createUser("someone", AuthorizationLevel.USER, ["team-a"])
    );

    expect(result.data!.puzzles.map((p) => p.puzzleName)).toEqual(["colors"]);
  });

  it("hides a quest from players it is not assigned to", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    const result = await getQuest(
      "test-quest",
      await createUser("other", AuthorizationLevel.USER)
    );

    expect(result.statusCode).toBe(404);
  });
});

describe("deleting a puzzle", () => {
  it("is refused while a quest uses it", async () => {
    await createQuest(["colors", "fruit"]);
    await createQuest(["fruit"], "other-quest");

    expect(await PuzzleService.deletePuzzle("fruit")).toEqual({
      status: "error",
      statusCode: 409,
      reason: "in-use",
      message:
        "Puzzle fruit is used by quests test-quest, other-quest; remove it from those quests first",
    });
    expect(await PuzzleModel.countDocuments({ name: "fruit" })).toBe(1);
  });

  it("is allowed once no quest uses it", async () => {
    await createQuest(["colors", "fruit"]);
    expect(
      await QuestService.updateQuest({
        name: "test-quest",
        puzzles: [{ puzzleName: "colors" }],
      })
    ).toEqual({ status: "success", statusCode: 200 });

    expect(await PuzzleService.deletePuzzle("fruit")).toEqual({
      status: "success",
      statusCode: 200,
    });
    expect(await PuzzleModel.countDocuments({ name: "fruit" })).toBe(0);
  });
});

describe("quests whose puzzles were deleted", () => {
  it("still load, without details for the deleted puzzle", async () => {
    await createQuest(["colors", "fruit"]);
    // Deleted behind the quest's back, as data stored before the service
    // refused to delete a puzzle a quest uses may be.
    const [fruitId] = await puzzleIdsOf("fruit");
    await PuzzleModel.deleteOne({ name: "fruit" });

    const result = await getQuest("test-quest", null);

    expect(result.status).toBe("success");
    expect(result.data!.puzzles.map((p) => p.puzzleName)).toEqual([
      "colors",
      `deleted-puzzle-${fruitId.toString()}`,
    ]);
    expect(result.data!.puzzles[0].puzzleDetail!.displayName).toBe("Colors");
    expect(result.data!.puzzles[1].puzzleDetail).toBeUndefined();
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

    expect(result.data!.puzzleName).toBe("fruit");
    expect(result.data!.puzzleDetail!.solutionDisplayText).toBe("Apple");
  });

  it("returns 404 for a puzzle the player cannot see yet", async () => {
    await createQuest();
    await QuestService.startQuest("test-quest");

    expect(
      await QuestService.getQuestPuzzle(
        "test-quest",
        "fruit",
        await createUser("player", AuthorizationLevel.USER)
      )
    ).toEqual({
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: "No puzzle named fruit found for quest test-quest",
    });
  });
});

describe("findQuests", () => {
  it("returns every quest when given no criteria", async () => {
    await createQuest(["fruit"], "one");
    await createQuest(["fruit"], "two");

    const result = await QuestService.findQuests();

    expect(result.data!.map((quest) => quest.name).sort()).toEqual([
      "one",
      "two",
    ]);
    expect(result.data![0].puzzles[0].puzzleDetail).toBeUndefined();
  });

  it("returns 404 when there are no quests", async () => {
    expect(await QuestService.findQuests()).toEqual({
      status: "error",
      statusCode: 404,
      reason: "not-found",
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
    expect(result.data!.subarray(0, 8)).toEqual(
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

describe("getQuestRunBook", () => {
  function createPdfRecorder() {
    const calls: unknown[][] = [];
    const pdfDoc = new Proxy({} as PDFKit.PDFDocument, {
      get(target, method) {
        return (...args: unknown[]) => {
          calls.push([method, ...args]);
          return pdfDoc;
        };
      },
    });
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

  it("prints an image puzzle's media from storage", async () => {
    await createQuest(["fruit"]);
    await PuzzleModel.updateOne(
      { name: "fruit" },
      { type: 1, text: "/puzzleData/riddle.png" }
    );
    const { pdfDoc, calls } = createPdfRecorder();

    await QuestService.getQuestRunBook("test-quest", pdfDoc);

    const image = calls.find(([method]) => method === "image");
    expect(image?.[1]).toBe(
      path.resolve(
        import.meta.dirname,
        "../../../../storage/puzzleData/riddle.png"
      )
    );
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
