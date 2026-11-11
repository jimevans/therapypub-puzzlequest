// Tests of request validation through the whole application: invalid input
// gets a 400 naming the fields, values pages send as text are converted, and
// fields a request adds are never used.
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
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await UserModel.init();
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
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
      phone: "",
      password: "hash",
      authorizationLevel:
        userName === "admin"
          ? AuthorizationLevel.ADMIN
          : AuthorizationLevel.USER,
    }))
  );
  sessions = await startSessions("admin", "player");
});

/**
 * Starts a request signed in as a user, or anonymously.
 * @param method the HTTP method
 * @param path the path
 * @param userName who sends it, or null for anonymous
 * @returns the request
 */
function send(
  method: "post" | "put" | "patch",
  path: string,
  userName: "admin" | "player" | null = "admin"
) {
  const pending = request(app)[method](path);
  if (userName) {
    pending.set("Authorization", `Bearer ${sessions[userName]}`);
  }
  return pending;
}

async function storedUser(userName: string) {
  return (await UserModel.findOne({ userName }).lean())!;
}

describe("invalid input", () => {
  it("gets a 400 naming each invalid field", async () => {
    const response = await send("post", "/api/v1/users", null).send({
      userName: "a/b",
      email: "not an email",
      phone: "555-0142",
      password: "a long enough password",
    });

    expect(response.status).toBe(400);
    const body = JSON.parse(response.text);
    expect(body.errors).toEqual([
      { path: "body.userName", message: 'Must not contain "/"' },
      { path: "body.email", message: "Enter a valid email address" },
      {
        path: "body.phone",
        message: "Enter a valid US or Canadian phone number",
      },
    ]);
    expect(body.detail).toBe(
      'userName: Must not contain "/"; email: Enter a valid email address; phone: Enter a valid US or Canadian phone number'
    );
    expect(await UserModel.countDocuments()).toBe(2);
  });

  it("reports a quest assigned to something other than a user or team", async () => {
    const response = await send("post", "/api/v1/quests").send({
      questName: "quest",
      displayName: "Quest",
      entrants: [{ kind: "group", name: "player" }],
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.text).errors).toEqual([
      { path: "body.entrants.0.kind", message: expect.any(String) },
    ]);
  });

  it("reports a missing field", async () => {
    const response = await send("post", "/api/v1/quests").send({
      questName: "quest",
      entrants: [{ kind: "player", name: "player" }],
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.text).errors).toEqual([
      { path: "body.displayName", message: expect.any(String) },
    ]);
  });

  it.each(["", "   "])(
    "refuses to rename a quest to %j, keeping its name",
    async (displayName) => {
      await QuestService.createQuest({
        name: "quest",
        displayName: "Quest",
        entrants: [{ kind: "user", name: "player" }],
        puzzles: [],
      });

      const response = await send("patch", "/api/v1/quests/quest").send({
        displayName,
      });

      expect(response.status).toBe(400);
      expect(JSON.parse(response.text).errors).toEqual([
        { path: "body.displayName", message: "Required" },
      ]);
      const quest = await QuestModel.findOne({ name: "quest" }).lean();
      expect(quest?.displayName).toBe("Quest");
    }
  );

  it("is checked only after authorization", async () => {
    const response = await send("post", "/api/v1/quests", "player").send({});

    expect(response.status).toBe(403);
  });
});

describe("phone numbers", () => {
  it("are stored in E.164 format, however they're typed", async () => {
    const response = await send("post", "/api/v1/users", null).send({
      userName: "newcomer",
      email: "newcomer@example.com",
      phone: "(312) 555-0142",
      password: "a long enough password",
    });

    expect(response.status).toBe(201);
    expect((await storedUser("newcomer")).phone).toBe("+13125550142");
  });

  it("can be removed by sending an empty one", async () => {
    await UserModel.updateOne(
      { userName: "player" },
      { phone: "+13125550142" }
    );

    const response = await send("patch", "/api/v1/users/player", "player").send(
      {
        phone: "",
      }
    );

    expect(response.status).toBe(200);
    expect((await storedUser("player")).phone).toBe("");
  });
});

describe("roles", () => {
  it("can make a user staff, stored as the staff authorization level", async () => {
    const response = await send("patch", "/api/v1/users/player").send({
      role: "staff",
    });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("staff");
    expect((await storedUser("player")).authorizationLevel).toBe(5);
  });

  it("can make a user an administrator, stored as the administrator level", async () => {
    await send("patch", "/api/v1/users/player").send({ role: "admin" });

    expect((await storedUser("player")).authorizationLevel).toBe(10);
  });

  it("no longer include Guest", async () => {
    const response = await send("patch", "/api/v1/users/player").send({
      role: "guest",
    });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContainEqual({
      path: "body.role",
      message: "Must be a known role",
    });
  });

  it("aren't the stored authorization levels", async () => {
    const response = await send("patch", "/api/v1/users/player").send({
      role: 10,
    });

    expect(response.status).toBe(400);
    expect((await storedUser("player")).authorizationLevel).toBe(1);
  });
});

describe("values pages send as text", () => {
  it("are converted in nested fields too", async () => {
    const response = await send("post", "/api/v1/puzzles").send({
      puzzleName: "riddle",
      solutionKeyword: "piano",
      solutionText: "A piano",
      hints: [{ text: "It makes music", timePenaltySeconds: "60" }],
    });

    expect(response.status).toBe(201);
    const puzzle = (await PuzzleModel.findOne({ name: "riddle" }).lean())!;
    expect(puzzle.hints[0]).toMatchObject({
      text: "It makes music",
      timePenalty: 60,
      solutionWarning: false,
    });
  });
});

describe("fields a request adds", () => {
  it("are dropped, so they can't change what they shouldn't", async () => {
    const response = await send("patch", "/api/v1/users/player", "player").send(
      {
        displayName: "Renamed",
        userName: "someone-else",
        passwordChangedAt: "2000-01-01",
        _id: "000000000000000000000000",
      }
    );

    expect(response.status).toBe(200);
    const player = await storedUser("player");
    expect(player.displayName).toBe("Renamed");
    expect(player.passwordChangedAt).toBeUndefined();
  });

  it("can't redirect a quest update to another quest", async () => {
    await PuzzleModel.create({
      name: "riddle",
      solutionKeyword: "piano",
      solutionDisplayText: "A piano",
    });
    for (const name of ["first", "second"]) {
      await QuestService.createQuest({
        name,
        displayName: name,
        entrants: [{ kind: "user", name: "player" }],
        puzzles: [],
      });
    }

    await send("patch", "/api/v1/quests/first").send({
      name: "second",
      questName: "second",
      displayName: "Renamed",
    });

    const quests = await QuestModel.find({}).sort({ name: 1 }).lean();
    expect(quests.map((quest) => quest.displayName)).toEqual([
      "Renamed",
      "second",
    ]);
  });
});

describe("activating a puzzle", () => {
  it("needs an activation code or a readable QR code", async () => {
    const response = await send(
      "post",
      "/api/v1/quests/quest/puzzles/riddle/activation",
      "player"
    ).send({});

    expect(response.status).toBe(400);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/invalid-request",
      detail: "Send an activation code, or a scanned image of its QR code",
    });
  });
});
