// Tests of playing a quest through the v1 API: seeing puzzles, activating them,
// guessing solutions, and revealing hints. Scanned QR codes and the activation rate
// limit are tested in uploads.integration.test.ts, pausing in its own file,
// and who may use each route in the authorization matrix.
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
import { userIdsOf } from "../references.js";

// Rate limits have their own tests; these make more guesses than they allow.
vi.mock("../../src/middleware/rateLimiter.js", () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) =>
    next();
  return {
    loginRateLimiter: passThrough,
    loginAddressRateLimiter: passThrough,
    passwordResetRequestRateLimiter: passThrough,
    passwordResetRequestAddressRateLimiter: passThrough,
    passwordResetRateLimiter: passThrough,
    passwordChangeRateLimiter: passThrough,
    activationRateLimiter: passThrough,
    joinCodeRateLimiter: passThrough,
    solutionRateLimiter: passThrough,
    liveTicketRateLimiter: passThrough,
    emailVerificationRateLimiter: passThrough,
    verificationEmailRateLimiter: passThrough,
  };
});

const { createApp } = await import("../../src/createApp.js");
const { playerPuzzleSchema } = await import("../../src/api/v1/resources.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { questEventBus } = await import("../../src/events/questEventBus.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

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
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
  ]);
  await UserModel.create(
    (["admin", "player", "teammate", "other"] as const).map((userName) => ({
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
  await TeamModel.create({
    teamName: "team",
    displayName: "Team",
    joinCode: "join",
    memberIds: await userIdsOf("player", "teammate"),
  });
  await PuzzleModel.create([
    {
      name: "riddle",
      displayName: "Riddle",
      solutionKeyword: "piano",
      solutionDisplayText: "A piano",
      hints: [
        { text: "It makes music", timePenalty: 60 },
        { text: "It's a piano", solutionWarning: true, timePenalty: 300 },
      ],
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
    entrants: [{ kind: "team", name: "team" }],
    puzzles: [
      { puzzleName: "riddle", activationCode: "riddle-code" },
      { puzzleName: "finale", activationCode: "finale-code" },
    ],
  });
  await QuestService.startQuest("quest");
  sessions = await startSessions("admin", "player", "teammate", "other");
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Role = "admin" | "player" | "teammate" | "other";

function play(role: Role, action: string, puzzle: string, body: object) {
  return request(app)
    .post(`/api/v1/quests/quest/puzzles/${puzzle}/${action}`)
    .set("Authorization", `Bearer ${sessions[role]}`)
    .send(body);
}

function bodyOf(response: request.Response) {
  return JSON.parse(response.text);
}

describe("seeing a puzzle", () => {
  function see(role: Role, puzzle: string) {
    return request(app)
      .get(`/api/v1/quests/quest/puzzles/${puzzle}`)
      .set("Authorization", `Bearer ${sessions[role]}`);
  }

  /** Gets the puzzle, checking the answer is exactly what's documented. */
  async function seen(role: Role, puzzle: string) {
    const response = await see(role, puzzle);
    expect(response.status).toBe(200);
    const body = bodyOf(response);
    expect(playerPuzzleSchema.parse(body)).toEqual(body);
    return body;
  }

  const activate = (puzzle: string) =>
    play("player", "activation", puzzle, {
      activationCode: `${puzzle}-code`,
    });

  beforeEach(async () => {
    await PuzzleModel.updateOne(
      { name: "riddle" },
      { text: "What has **keys**?" }
    );
  });

  it("shows no content until the puzzle is activated", async () => {
    expect(await seen("teammate", "riddle")).toMatchObject({
      quest: { name: "quest", displayName: "Quest", paused: false },
      puzzle: {
        name: "riddle",
        displayName: "Riddle",
        status: 1,
        skipped: false,
        stopNumber: 1,
        type: null,
        text: null,
        hints: [],
        nextHint: null,
        solutionText: null,
      },
      next: null,
    });
  });

  it("shows the Markdown, and what the next hint costs, once activated", async () => {
    await activate("riddle");

    expect((await seen("player", "riddle")).puzzle).toMatchObject({
      status: 2,
      type: 0,
      text: "What has **keys**?",
      hints: [],
      nextHint: { timePenalty: 60, solutionWarning: false },
      solutionText: null,
    });
  });

  it("gives a media puzzle's path", async () => {
    await PuzzleModel.updateOne(
      { name: "riddle" },
      { type: 1, text: "/puzzleData/riddle.png" }
    );
    await activate("riddle");

    expect((await seen("player", "riddle")).puzzle).toMatchObject({
      type: 1,
      text: "/puzzleData/riddle.png",
    });
  });

  it("shows revealed hints, and warns of one that gives the solution away", async () => {
    await activate("riddle");
    await play("player", "hints", "riddle", {});

    expect((await seen("player", "riddle")).puzzle).toMatchObject({
      hints: [{ text: "It makes music", timePenalty: 60 }],
      nextHint: { timePenalty: 300, solutionWarning: true },
    });
  });

  it("shows no next hint when none are left", async () => {
    await activate("riddle");
    await play("player", "hints", "riddle", {});
    await play("player", "hints", "riddle", {});

    expect((await seen("player", "riddle")).puzzle.nextHint).toBeNull();
  });

  it("shows the solution and the next stop once solved", async () => {
    await activate("riddle");
    await play("player", "solution-attempts", "riddle", { guess: "piano" });

    const solved = await seen("player", "riddle");
    expect(solved.puzzle).toMatchObject({
      status: 3,
      solutionText: "A piano",
      nextHint: null,
    });
    expect(solved.next).toEqual({ name: "finale", displayName: "Finale" });
    expect((await seen("player", "finale")).puzzle).toMatchObject({
      stopNumber: 2,
      status: 1,
    });
  });

  it("marks a skipped puzzle, and shows its solution", async () => {
    await QuestService.skipQuestPuzzle("quest", "riddle");

    expect((await seen("player", "riddle")).puzzle).toMatchObject({
      skipped: true,
      status: 3,
      solutionText: "A piano",
    });
  });

  it("says when the quest is paused", async () => {
    await activate("riddle");
    await QuestService.pauseQuest("quest");

    expect((await seen("player", "riddle")).quest.paused).toBe(true);
  });

  it.each(["player", "admin"] as const)(
    "reveals nothing about puzzles not yet reached, to %s",
    async (role) => {
      await activate("riddle");

      const response = await see(role, "riddle");

      // Checks the raw answer, so no field can give the quest's length away.
      expect(response.text).not.toMatch(/finale/i);
      expect(response.text).not.toContain("riddle-code");
      expect(response.text).not.toContain("solutionKeyword");
      expect(response.text).not.toContain("It's a piano");
      expect(bodyOf(response).quest.progress.puzzles).toHaveLength(1);
    }
  );

  it("answers alike for a puzzle not reached and one that doesn't exist", async () => {
    for (const role of ["player", "admin"] as const) {
      const unreached = await see(role, "finale");
      const unknown = await see(role, "nothing");

      expect(unreached.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(unreached.text.replace("finale", "nothing")).toBe(unknown.text);
    }
  });

  it("isn't found by a player the quest isn't assigned to", async () => {
    expect((await see("other", "riddle")).status).toBe(404);
  });

  it("isn't found before the quest starts, even by an administrator", async () => {
    await QuestService.resetQuest("quest");

    expect((await see("player", "riddle")).status).toBe(404);
    expect((await see("admin", "riddle")).status).toBe(404);
  });
});

describe("activating a puzzle", () => {
  it("starts it, for any member of the team", async () => {
    const response = await play("teammate", "activation", "riddle", {
      activationCode: "riddle-code",
    });

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({ activationTime: expect.any(String) });
  });

  it("accepts a typed code in any letter case, with stray spaces", async () => {
    const response = await play("player", "activation", "riddle", {
      activationCode: " Riddle-Code ",
    });

    expect(response.status).toBe(200);
  });

  it("needs the puzzle's code", async () => {
    const response = await play("player", "activation", "riddle", {
      activationCode: "wrong",
    });

    expect(response.status).toBe(422);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/wrong-activation-code",
      detail: "Incorrect activation code for puzzle",
    });
  });

  it("is refused to a player the quest isn't assigned to", async () => {
    const response = await play("other", "activation", "riddle", {
      activationCode: "riddle-code",
    });

    expect(response.status).toBe(403);
    expect(bodyOf(response).type).toBe("/problems/forbidden");
  });

  it("doesn't reveal a puzzle the players haven't reached", async () => {
    const response = await play("player", "activation", "finale", {
      activationCode: "finale-code",
    });

    expect(response.status).toBe(404);
    expect(bodyOf(response).type).toBe("/problems/not-found");
  });

  it("can't start a puzzle twice", async () => {
    await play("player", "activation", "riddle", {
      activationCode: "riddle-code",
    });

    const response = await play("player", "activation", "riddle", {
      activationCode: "riddle-code",
    });

    expect(response.status).toBe(409);
    expect(bodyOf(response).type).toBe("/problems/wrong-state");
  });
});

describe("guessing a solution", () => {
  beforeEach(async () => {
    await play("player", "activation", "riddle", {
      activationCode: "riddle-code",
    });
  });

  it("solves the puzzle, naming the next one", async () => {
    const response = await play("player", "solution-attempts", "riddle", {
      guess: "Is it a PIANO?",
    });

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({
      solutionText: "A piano",
      nextPuzzle: { name: "finale", displayName: "Finale" },
      questComplete: false,
    });
  });

  it("completes the quest with the last puzzle", async () => {
    await play("player", "solution-attempts", "riddle", { guess: "piano" });
    await play("player", "activation", "finale", {
      activationCode: "finale-code",
    });

    const response = await play("player", "solution-attempts", "finale", {
      guess: "done",
    });

    expect(bodyOf(response)).toEqual({
      solutionText: "Done",
      nextPuzzle: null,
      questComplete: true,
    });
  });

  it("is a problem when it's wrong", async () => {
    const response = await play("player", "solution-attempts", "riddle", {
      guess: "organ",
    });

    expect(response.status).toBe(422);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/wrong-answer",
      detail: "Incorrect guess for puzzle solution",
    });
  });

  it("leaves the page that guessed out of the live update", async () => {
    const handler = vi.fn();
    const stop = questEventBus.subscribe(handler);
    try {
      await play("player", "solution-attempts", "riddle", {
        guess: "piano",
        connectionId: "connection-1",
      });
    } finally {
      stop();
    }

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "player",
        connectionId: "connection-1",
      })
    );
  });
});

describe("revealing a hint", () => {
  beforeEach(async () => {
    await play("player", "activation", "riddle", {
      activationCode: "riddle-code",
    });
  });

  it("reveals the next one, warning when the one after gives the solution away", async () => {
    const response = await play("player", "hints", "riddle", {});

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({
      text: "It makes music",
      timePenalty: 60,
      moreHints: true,
      isNextHintSolution: true,
    });
  });

  it("is a problem once every hint is revealed", async () => {
    await play("player", "hints", "riddle", {});
    const last = bodyOf(await play("player", "hints", "riddle", {}));
    expect(last.moreHints).toBe(false);

    const response = await play("player", "hints", "riddle", {});

    expect(response.status).toBe(409);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/no-more-hints",
      detail: "Every hint for puzzle riddle has been revealed",
    });
  });

  it("passes who asked, and their page's connection, to the live update", async () => {
    const handler = vi.fn();
    const stop = questEventBus.subscribe(handler);
    try {
      await play("teammate", "hints", "riddle", {
        connectionId: "connection-2",
      });
    } finally {
      stop();
    }

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "teammate",
        connectionId: "connection-2",
        events: [expect.objectContaining({ type: "HintRevealed" })],
      })
    );
  });
});
