// Tests of the v1 API's quests, through the whole application: what players
// and administrators see, managing quests, running them, and their event
// logs. Pausing, rescue actions, and text messages have their own files;
// who may use each route is in the authorization matrix.
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";
import { assigneeIdsOf, entryIdOf } from "../references.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { QuestEventModel } =
  await import("../../src/models/questEvent.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const ChallengeService =
  await import("../../src/services/challenge.service.js");
const { subscribeQuestEventHandlers } =
  await import("../../src/events/subscribers.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};
let unsubscribe: () => void = () => {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await QuestModel.init();
  app = createApp();
}, 120000);

afterAll(async () => {
  unsubscribe();
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  unsubscribe();
  unsubscribe = subscribeQuestEventHandlers();
  await Promise.all([
    UserModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
    QuestEventModel.deleteMany({}),
  ]);
  await UserModel.create(
    (["admin", "player", "other"] as const).map((userName) => ({
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
  await PuzzleModel.create(
    ["first", "second", "third"].map((name) => ({
      name,
      displayName: name.toUpperCase(),
      solutionKeyword: name,
      solutionDisplayText: `${name} solution`,
      hints: [
        { text: "first hint", timePenalty: 60 },
        { text: "second hint", solutionWarning: true, timePenalty: 300 },
      ],
    }))
  );
  await QuestService.createQuest({
    name: "quest",
    displayName: "Quest",
    entrants: [{ kind: "user", name: "player" }],
    puzzles: [
      { puzzleName: "first", activationCode: "code-1" },
      { puzzleName: "second", activationCode: "code-2" },
      { puzzleName: "third", activationCode: "code-3" },
    ],
  });
  sessions = await startSessions("admin", "player", "other");
});

type Role = "admin" | "player" | "other";

function as(
  role: Role,
  method: "get" | "post" | "patch" | "delete",
  path: string
) {
  return request(app)
    [method](`/api/v1${path}`)
    .set("Authorization", `Bearer ${sessions[role]}`);
}

function bodyOf(response: request.Response) {
  return JSON.parse(response.text);
}

/** Starts the quest and has the player solve the first puzzle and reveal a
 * hint on the second. */
async function playSome() {
  const player = await assigneeIdsOf("player");
  await QuestService.startQuest("quest");
  await QuestService.activatePuzzle("quest", "first", player, "code-1");
  await QuestService.finishPuzzle("quest", "first", player, "first");
  await QuestService.activatePuzzle("quest", "second", player, "code-2");
  await QuestService.getPuzzleHint("quest", "second", player);
  const kept = await ChallengeService.keepChallenge("quest", {
    message: "Ring the bell",
    answer: "reply",
    confirmation: "Thanks",
  });
  if (kept.status === "error") {
    throw new Error(kept.message);
  }
  const entryId = await entryIdOf("quest");
  await ChallengeService.recordMessage("quest", entryId, "Welcome!");
  await ChallengeService.recordMessage(
    "quest",
    entryId,
    "Ring the bell",
    kept.data
  );
}

describe("a quest, as its player sees it", () => {
  it("is hidden until it starts", async () => {
    expect((await as("player", "get", "/quests/quest")).status).toBe(404);
  });

  it("shows only the puzzles reached, revealed hints, and solved puzzles' solutions", async () => {
    await playSome();

    const quest = bodyOf(await as("player", "get", "/quests/quest"));

    expect(quest).not.toHaveProperty("visibility");
    expect(quest.entries).toHaveLength(1);
    const [entry] = quest.entries;
    expect(entry).not.toHaveProperty("textResponse");
    expect(entry).not.toHaveProperty("textResponseConfirmation");
    expect(entry.messages).toEqual([
      { text: "Welcome!", sentAt: expect.any(String), challenge: false },
      { text: "Ring the bell", sentAt: expect.any(String), challenge: true },
    ]);
    // Neither its answer nor, until it's answered, its confirmation.
    expect(entry.challenge).toEqual({
      challengeId: expect.any(String),
      message: "Ring the bell",
      sentAt: expect.any(String),
      answeredAt: null,
      answeredVia: null,
    });
    const [solved, current, ...rest] = entry.puzzles;
    expect(rest).toEqual([]);
    expect(solved).toMatchObject({
      puzzleName: "first",
      displayName: "FIRST",
      status: "completed",
      hintsRevealed: 0,
      solutionText: "first solution",
      hints: [],
    });
    expect(current).toMatchObject({
      status: "inProgress",
      hintsRevealed: 1,
      startTime: expect.any(String),
      activationTime: expect.any(String),
      endTime: null,
    });
    expect(current).not.toHaveProperty("solutionText");
    expect(current.hints).toEqual([
      { text: "first hint", solutionWarning: false, timePenaltySeconds: 60 },
    ]);
    for (const puzzle of entry.puzzles) {
      expect(puzzle).not.toHaveProperty("activationCode");
      expect(puzzle).not.toHaveProperty("cardWord");
    }
  });

  it("is hidden from other players", async () => {
    await playSome();

    const response = await as("other", "get", "/quests/quest");

    expect(response.status).toBe(404);
    expect(bodyOf(response).type).toBe("/problems/not-found");
  });
});

describe("a quest, as an administrator sees it", () => {
  it("shows every puzzle, hint, solution, activation code, and the text reply", async () => {
    await playSome();

    const quest = bodyOf(await as("admin", "get", "/quests/quest"));
    const [entry] = quest.entries;

    expect(quest.visibility).toBe("public");
    expect(quest.textPlayersWithApp).toBe(false);
    expect(entry.textResponse).toBe("reply");
    expect(entry.textResponseConfirmation).toBe("Thanks");
    expect(entry.challenge).toMatchObject({
      message: "Ring the bell",
      expectedResponse: "reply",
      confirmation: "Thanks",
      answeredAt: null,
    });
    expect(
      entry.puzzles.map((p: { activationCode: string }) => p.activationCode)
    ).toEqual(["code-1", "code-2", "code-3"]);
    expect(entry.puzzles[1]).toMatchObject({
      solutionText: "second solution",
      hints: [expect.anything(), expect.anything()],
    });
    // Unset values are null, not left out.
    expect(entry.puzzles[2]).toMatchObject({
      status: "notReached",
      solutionText: "third solution",
      cardWord: null,
      activationTime: null,
      startTime: null,
      endTime: null,
    });
    expect(entry.rank).toBeNull();
    expect(entry.id).toBe(await entryIdOf("quest"));
    // Named, never by the user's or team's own ID.
    expect(entry.entrant).toEqual({
      kind: "player",
      name: "player",
      displayName: "player",
    });
  });
});

describe("listing quests", () => {
  it("comes a page at a time, with puzzle details", async () => {
    await QuestService.createQuest({
      name: "later",
      displayName: "Later",
      entrants: [{ kind: "user", name: "other" }],
    });

    const first = bodyOf(await as("admin", "get", "/quests?limit=1"));
    const second = bodyOf(
      await as("admin", "get", `/quests?limit=1&after=${first.next}`)
    );

    expect(first.items.map((q: { questName: string }) => q.questName)).toEqual([
      "quest",
    ]);
    expect(first.items[0].entries[0].puzzles[0].displayName).toBe("FIRST");
    expect(first.items[0].entries[0]).toMatchObject({
      textResponse: null,
      textResponseConfirmation: null,
      messages: [],
      challenge: null,
    });
    expect(second).toEqual({
      items: [expect.objectContaining({ questName: "later" })],
      next: null,
    });
  });

  it("is empty when there are no quests", async () => {
    await QuestModel.deleteMany({});

    expect(bodyOf(await as("admin", "get", "/quests"))).toEqual({
      items: [],
      next: null,
    });
  });
});

describe("managing a quest", () => {
  it("creates one, answering with it", async () => {
    const response = await as("admin", "post", "/quests").send({
      questName: "new-quest",
      displayName: "New Quest",
      entrants: [{ kind: "player", name: "other" }],
      puzzles: [{ puzzleName: "first" }],
    });

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe("/api/v1/quests/new-quest");
    expect(bodyOf(response)).toMatchObject({
      questName: "new-quest",
      entries: [
        {
          entrant: { kind: "player", name: "other" },
          status: "notStarted",
          statusDescription: "Not yet started",
          puzzles: [
            { puzzleName: "first", activationCode: expect.any(String) },
          ],
        },
      ],
    });
  });

  it("refuses one that refers to a puzzle that doesn't exist", async () => {
    const response = await as("admin", "post", "/quests").send({
      questName: "new-quest",
      displayName: "New Quest",
      entrants: [{ kind: "player", name: "other" }],
      puzzles: [{ puzzleName: "nothing" }],
    });

    expect(response.status).toBe(422);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/invalid-quest",
      detail: "No puzzles found with names: nothing",
    });
  });

  it("can't move a puzzle the players have reached", async () => {
    await playSome();

    const response = await as("admin", "patch", "/quests/quest").send({
      puzzles: [{ puzzleName: "second" }, { puzzleName: "first" }],
    });

    expect(response.status).toBe(409);
    expect(bodyOf(response).type).toBe("/problems/wrong-state");
  });

  it("changes one, answering with it", async () => {
    const response = await as("admin", "patch", "/quests/quest").send({
      displayName: "Renamed",
      entrants: [{ kind: "player", name: "other" }],
    });

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toMatchObject({
      displayName: "Renamed",
      entries: [{ entrant: { kind: "player", name: "other" } }],
    });
  });

  it("keeps the display name when it's left out of a change", async () => {
    const response = await as("admin", "patch", "/quests/quest").send({
      entrants: [{ kind: "player", name: "other" }],
    });

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toMatchObject({
      displayName: "Quest",
      entries: [{ entrant: { kind: "player", name: "other" } }],
    });
    // Stored as it always was.
    const stored = (await QuestModel.findOne({ name: "quest" }).lean())!;
    expect(stored.entries[0].assignee?.kind).toBe("user");
  });

  it("deletes one", async () => {
    expect((await as("admin", "delete", "/quests/quest")).status).toBe(204);
    expect((await as("admin", "get", "/quests/quest")).status).toBe(404);
  });
});

describe("a stop's card word", () => {
  const words = async () =>
    bodyOf(await as("admin", "get", "/quests/quest")).entries[0].puzzles.map(
      (puzzle: { cardWord: string | null }) => puzzle.cardWord
    );

  it("is set, kept when left out, and removed when empty", async () => {
    const set = await as("admin", "patch", "/quests/quest").send({
      puzzles: [
        { puzzleName: "first", cardWord: "  SHOW  " },
        { puzzleName: "second", cardWord: "ALL OF US" },
        { puzzleName: "third" },
      ],
    });
    expect(set.status).toBe(200);
    expect(await words()).toEqual(["SHOW", "ALL OF US", null]);

    await as("admin", "patch", "/quests/quest").send({
      puzzles: [
        { puzzleName: "first" },
        { puzzleName: "second", cardWord: "" },
        { puzzleName: "third" },
      ],
    });
    expect(await words()).toEqual(["SHOW", null, null]);
  });

  it("is never shown to the players", async () => {
    await as("admin", "patch", "/quests/quest").send({
      puzzles: ["first", "second", "third"].map((puzzleName) => ({
        puzzleName,
        cardWord: "SECRET",
      })),
    });
    await playSome();

    const response = await as("player", "get", "/quests/quest");

    expect(response.status).toBe(200);
    expect(response.text).not.toContain("SECRET");
  });

  it("is refused when longer than a card can hold", async () => {
    const response = await as("admin", "patch", "/quests/quest").send({
      puzzles: [{ puzzleName: "first", cardWord: "W".repeat(41) }],
    });

    expect(response.status).toBe(400);
  });
});

describe("running a quest", () => {
  it("starts it, answering with it", async () => {
    const response = await as("admin", "post", "/quests/quest/start");

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toMatchObject({
      entries: [
        {
          statusDescription: "In progress",
          puzzles: [{ statusDescription: "Awaiting activation" }, {}, {}],
        },
      ],
    });
  });

  it("can't start it twice", async () => {
    await as("admin", "post", "/quests/quest/start");

    const response = await as("admin", "post", "/quests/quest/start");

    expect(response.status).toBe(409);
    expect(bodyOf(response).type).toBe("/problems/wrong-state");
  });

  it("resets it", async () => {
    await playSome();

    const response = await as("admin", "post", "/quests/quest/reset");

    expect(bodyOf(response).entries[0].statusDescription).toBe(
      "Not yet started"
    );
  });

  it("is a problem for a quest that doesn't exist", async () => {
    const response = await as("admin", "post", "/quests/nothing/start");

    expect(response.status).toBe(404);
  });
});

describe("a quest's event log", () => {
  it("lists what happened, oldest first, a page at a time", async () => {
    await playSome();
    // The log is written after each action, without waiting.
    await expect
      .poll(() => QuestEventModel.countDocuments({ questName: "quest" }))
      .toBeGreaterThanOrEqual(6);

    const first = bodyOf(
      await as("admin", "get", "/quests/quest/events?limit=2")
    );
    const second = bodyOf(
      await as("admin", "get", `/quests/quest/events?after=${first.next}`)
    );

    const entrant = { kind: "player", name: "player" };
    expect(first.items).toEqual([
      {
        type: "questStarted",
        at: expect.any(String),
        puzzleName: null,
        actor: null,
        actorDeleted: false,
        entrant,
        data: null,
      },
      {
        type: "puzzleStarted",
        puzzleName: "first",
        at: expect.any(String),
        actor: null,
        actorDeleted: false,
        entrant,
        data: null,
      },
    ]);
    expect(second.items.map((event: { type: string }) => event.type)).toEqual([
      "puzzleActivated",
      "puzzleSolved",
      "puzzleStarted",
      "puzzleActivated",
      "hintRevealed",
    ]);
    // The hint's penalty is stored in seconds as timePenalty, and named for
    // its unit here.
    expect(second.items.at(-1).data).toEqual({
      hintIndex: 0,
      timePenaltySeconds: 60,
    });
  });

  it("is a problem for a quest that doesn't exist", async () => {
    const response = await as("admin", "get", "/quests/nothing/events");

    expect(response.status).toBe(404);
  });
});

describe("a run book", () => {
  it("is a PDF, named after the quest", async () => {
    const response = await as("admin", "get", "/quests/quest/run-book").buffer(
      true
    );

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      "attachment; filename=quest.pdf"
    );
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("is a problem for a quest that doesn't exist", async () => {
    const response = await as("admin", "get", "/quests/nothing/run-book");

    expect(response.status).toBe(404);
    expect(bodyOf(response).type).toBe("/problems/not-found");
  });
});

describe("a quest's activation cards", () => {
  it("are a PDF, named after the quest", async () => {
    const response = await as("admin", "get", "/quests/quest/qr-cards").buffer(
      true
    );

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      "attachment; filename=quest-qr-cards.pdf"
    );
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("are a problem for a quest that doesn't exist", async () => {
    const response = await as("admin", "get", "/quests/nothing/qr-cards");

    expect(response.status).toBe(404);
    expect(bodyOf(response).type).toBe("/problems/not-found");
  });
});

describe("an activation QR code", () => {
  it("is a PNG image", async () => {
    const response = await as(
      "admin",
      "get",
      "/quests/quest/puzzles/first/qr-code"
    ).buffer(true);

    expect(response.status).toBe(200);
    expect(response.type).toBe("image/png");
    expect(response.body.subarray(1, 4).toString()).toBe("PNG");
  });

  it("is a problem for a puzzle the quest doesn't have", async () => {
    const response = await as(
      "admin",
      "get",
      "/quests/quest/puzzles/nothing/qr-code"
    );

    expect(response.status).toBe(404);
    expect(bodyOf(response).type).toBe("/problems/not-found");
  });
});
