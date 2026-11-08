// Tests of the Phase 2 quick hardening, through the whole application:
// security headers, body limits, sign-in failures, rate limits, and error
// responses that don't reveal internals.
import type { Express } from "express";
import {
  afterAll,
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
import request from "supertest";
import { startSessions } from "../sessions.js";
import { assigneeIdsOf } from "../references.js";

const bcrypt = (await import("bcrypt")).default;
const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const UserService = await import("../../src/services/user.service.js");
const TeamService = await import("../../src/services/team.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([UserModel.init(), TeamModel.init()]);
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await UserModel.deleteMany({});
  await TeamModel.deleteMany({});
  await QuestModel.deleteMany({});
  await PuzzleModel.deleteMany({});
});

/**
 * Stores a user directly, with the given password hash.
 * @param userName the user name
 * @returns the stored user
 */
async function createUser(userName: string) {
  return UserModel.create({
    userName,
    displayName: userName,
    email: `${userName}@example.com`,
    password: `hash-of-${userName}`,
    authorizationLevel: AuthorizationLevel.USER,
  });
}

/** The session token of the user the next requests come from. */
let signedInToken = "";

/**
 * Makes the next requests come from the given user.
 * @param userName the user name
 */
async function signInAs(userName: string): Promise<void> {
  signedInToken = (await startSessions(userName))[userName];
}

function login(userName: string, password: string) {
  return request(app).post("/api/v1/sessions").send({ userName, password });
}

describe("security headers", () => {
  it("are sent with every response", async () => {
    const response = await request(app).get("/login");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers["strict-transport-security"]).toBe(
      "max-age=31536000"
    );
    expect(response.headers).not.toHaveProperty("x-powered-by");
  });
});

describe("request bodies", () => {
  it("rejects a JSON body over 100 KB", async () => {
    const response = await request(app)
      .post("/api/v1/sessions")
      .send({ userName: "x", password: "y".repeat(101 * 1024) });

    expect(response.status).toBe(413);
    expect(JSON.parse(response.text).type).toBe("/problems/body-too-large");
  });
});

describe("signing in", () => {
  it("gives the same answer for an unknown user and a wrong password", async () => {
    await createUser("known");
    const logs = recordLogs();

    const unknown = await login("nobody", "secret password");
    const wrong = await login("known", "secret password");

    for (const response of [unknown, wrong]) {
      expect(response.status).toBe(401);
      expect(JSON.parse(response.text)).toEqual({
        type: "/problems/sign-in-failed",
        title: "Incorrect user name or password",
        status: 401,
        detail: "Incorrect user name or password",
      });
    }
    // Logged by the user's ID when there's an account, and never by the
    // name typed, which could be a password in the wrong box.
    const known = await UserModel.findOne({ userName: "known" }).lean();
    expect(
      logs.filter((entry) => entry.event === "sign-in-failed")
    ).toMatchObject([
      { level: "warn", knownUser: false },
      { level: "warn", userId: known!._id.toString() },
    ]);
    expect(JSON.stringify(logs)).not.toContain("nobody");
    expect(JSON.stringify(logs)).not.toContain("secret password");
  });

  it("checks a password even for an unknown user, so it takes as long", async () => {
    await login("nobody", "secret password");

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "secret password",
      expect.any(String)
    );
  });

  it("signs in with the right password", async () => {
    await createUser("known");
    vi.mocked(bcrypt.compare).mockImplementation(
      async (password, hash) =>
        password === "right password" && hash === "hash-of-known"
    );

    const response = await login("known", "right password");

    expect(response.status).toBe(201);
  });

  it("limits failed attempts per user name, without locking out others at the same address", async () => {
    await createUser("unlucky");
    await createUser("neighbor");
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login("unlucky", "wrong")).status).toBe(401);
    }

    const logs = recordLogs();
    const limited = await login("unlucky", "wrong");
    expect(limited.status).toBe(429);
    expect(logs).toContainEqual(
      expect.objectContaining({ level: "warn", event: "rate-limited" })
    );
    expect(JSON.parse(limited.text)).toMatchObject({
      type: "/problems/too-many-requests",
      status: 429,
    });
    expect((await login("neighbor", "wrong")).status).toBe(401);
  });
});

describe("guessing solutions", () => {
  beforeEach(async () => {
    await createUser("guesser");
    await createUser("bystander");
    await PuzzleModel.create({
      name: "riddle",
      displayName: "Riddle",
      solutionKeyword: "piano",
      solutionDisplayText: "A piano",
    });
    await QuestService.createQuest({
      name: "quest",
      displayName: "Quest",
      assignee: { kind: "user", name: "guesser" },
      puzzles: [{ puzzleName: "riddle" }],
    });
    await QuestService.startQuest("quest");
    const quest = (await QuestModel.findOne({ name: "quest" }).lean())!;
    await QuestService.activatePuzzle(
      "quest",
      "riddle",
      await assigneeIdsOf("guesser"),
      quest.puzzles[0].activationCode
    );
  });

  function guess(answer: string) {
    return request(app)
      .post("/api/v1/quests/quest/puzzles/riddle/solution-attempts")
      .set("Authorization", `Bearer ${signedInToken}`)
      .send({ guess: answer });
  }

  it("requires a signed-in user", async () => {
    const response = await request(app)
      .post("/api/v1/quests/quest/puzzles/riddle/solution-attempts")
      .send({ guess: "piano" });

    expect(response.status).toBe(401);
  });

  it("limits wrong guesses per player", async () => {
    await signInAs("guesser");
    for (let attempt = 0; attempt < 60; attempt++) {
      expect((await guess("organ")).status).toBe(422);
    }

    expect((await guess("organ")).status).toBe(429);

    await signInAs("bystander");
    expect((await guess("organ")).status).toBe(403);
  });
});

describe("values that must be unique", () => {
  it("reports an email address already in use, without database details", async () => {
    await createUser("first");

    const result = await UserService.createUser(
      new UserService.User({
        userName: "second",
        displayName: "Second",
        email: "first@example.com",
        phone: "",
        sms: false,
        authorizationLevel: AuthorizationLevel.USER,
        password: "a long enough password",
      })
    );

    expect(result).toEqual({
      status: "error",
      statusCode: 400,
      reason: "already-exists",
      message: "That email address is already in use",
    });
  });

  it("reports a team join code already in use", async () => {
    await TeamModel.create({
      teamName: "first",
      displayName: "First",
      joinCode: "shared",
    });

    const result = await TeamService.createTeam({
      teamName: "second",
      displayName: "Second",
      joinCode: "shared",
    });

    expect(result).toEqual({
      status: "error",
      statusCode: 400,
      reason: "already-exists",
      message: "That join code is already in use",
    });
  });
});
