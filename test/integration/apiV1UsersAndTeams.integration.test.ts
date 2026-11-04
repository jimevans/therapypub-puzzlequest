// Tests of the v1 API's users, passwords, and teams, through the whole
// application. Signing up, email verification, sessions, validation, and
// who may use each route are tested in their own files.
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

// Rate limits have their own tests; these make more requests than they allow.
vi.mock("../../src/middleware/rateLimiter.js", () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) =>
    next();
  return {
    loginRateLimiter: passThrough,
    loginAddressRateLimiter: passThrough,
    passwordRateLimiter: passThrough,
    activationRateLimiter: passThrough,
    solutionRateLimiter: passThrough,
    emailVerificationRateLimiter: passThrough,
    verificationEmailRateLimiter: passThrough,
  };
});
vi.mock("../../src/services/email.service.js", () => ({
  sendEmail: vi.fn(async () => ({ status: "success", statusCode: 200 })),
}));

const bcrypt = (await import("bcrypt")).default;
const { config } = await import("../../src/config.js");
const { createApp } = await import("../../src/createApp.js");
const EmailService = await import("../../src/services/email.service.js");
const PasswordService = await import("../../src/services/password.service.js");
const SessionService = await import("../../src/services/session.service.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  // The tests of unique names and join codes need the indexes built.
  await Promise.all([UserModel.init(), TeamModel.init()]);
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  config.PQ_BASE_URL = "https://puzzlequest.example";
  vi.mocked(bcrypt.compare).mockImplementation(
    async (password) => password === "current password"
  );
  await Promise.all([UserModel.deleteMany({}), TeamModel.deleteMany({})]);
  await UserModel.create(
    (["admin", "player", "other"] as const).map((userName) => ({
      userName,
      displayName: `${userName} display name`,
      email: `${userName}@example.com`,
      password: "hash",
      emailVerifiedAt: new Date(),
      authorizationLevel:
        userName === "admin"
          ? AuthorizationLevel.ADMIN
          : AuthorizationLevel.USER,
    }))
  );
  await TeamModel.create({
    teamName: "team-a",
    displayName: "Team A",
    joinCode: "join-a",
    memberIds: await userIdsOf("player"),
  });
  sessions = await startSessions("admin", "player", "other");
});

afterEach(() => {
  vi.restoreAllMocks();
  config.PQ_BASE_URL = undefined;
});

type Role = "admin" | "player" | "other";

/**
 * Sends a v1 request as a user.
 * @param method the HTTP method
 * @param path the path below /api/v1
 * @param role who sends it
 * @returns the pending request
 */
function as(
  role: Role,
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string
) {
  return request(app)
    [method](`/api/v1${path}`)
    .set("Authorization", `Bearer ${sessions[role]}`);
}

function bodyOf(response: request.Response) {
  return JSON.parse(response.text);
}

describe("listing users", () => {
  it("comes a page at a time, in the order they signed up", async () => {
    const first = await as("admin", "get", "/users?limit=2");

    expect(first.status).toBe(200);
    const page = bodyOf(first);
    expect(
      page.items.map((user: { userName: string }) => user.userName)
    ).toEqual(["admin", "player"]);
    expect(page.items[0]).not.toHaveProperty("password");
    expect(page.items[0]).not.toHaveProperty("teams");

    const second = bodyOf(
      await as("admin", "get", `/users?limit=2&after=${page.next}`)
    );
    expect(second).toEqual({
      items: [expect.objectContaining({ userName: "other" })],
      next: null,
    });
  });
});

describe("a user", () => {
  it("is shown with their teams", async () => {
    const response = await as("player", "get", "/users/player");

    expect(bodyOf(response)).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      userName: "player",
      displayName: "player display name",
      email: "player@example.com",
      emailVerified: true,
      phone: "",
      sms: false,
      authorizationLevel: AuthorizationLevel.USER,
      teams: [{ teamName: "team-a", displayName: "Team A" }],
    });
  });

  it("is a problem to look for when there is none", async () => {
    const response = await as("admin", "get", "/users/nobody");

    expect(response.status).toBe(404);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/not-found",
      detail: "No user with user name nobody found",
    });
  });

  it("can change their own details, and gets them back", async () => {
    const response = await as("player", "patch", "/users/player").send({
      displayName: "Renamed",
      sms: true,
    });

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toMatchObject({
      displayName: "Renamed",
      sms: true,
    });
  });

  it("can't change their own authorization level", async () => {
    const response = await as("player", "patch", "/users/player").send({
      authorizationLevel: AuthorizationLevel.ADMIN,
    });

    expect(response.status).toBe(403);
    expect(bodyOf(response).detail).toBe(
      "Only an administrator can change an authorization level"
    );
    const stored = await UserModel.findOne({ userName: "player" }).lean();
    expect(stored!.authorizationLevel).toBe(AuthorizationLevel.USER);
  });

  it("has an authorization level an administrator can change", async () => {
    const response = await as("admin", "patch", "/users/player").send({
      authorizationLevel: AuthorizationLevel.ADMIN,
    });

    expect(bodyOf(response).authorizationLevel).toBe(AuthorizationLevel.ADMIN);
  });

  it("isn't given a password by a PATCH, even from an administrator", async () => {
    await as("admin", "patch", "/users/player").send({
      password: "a new password",
    });

    const stored = await UserModel.findOne({ userName: "player" }).lean();
    expect(stored!.password).toBe("hash");
  });

  it("can't take an email address another user has", async () => {
    const response = await as("player", "patch", "/users/player").send({
      email: "other@example.com",
    });

    expect(response.status).toBe(409);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/already-exists",
      detail: "That email address is already in use",
    });
  });

  it("can delete their own account, leaving their teams", async () => {
    const response = await as("player", "delete", "/users/player");

    expect(response.status).toBe(204);
    expect(await UserModel.countDocuments({ userName: "player" })).toBe(0);
    const team = await TeamModel.findOne({ teamName: "team-a" }).lean();
    expect(team!.memberIds).toEqual([]);
  });
});

describe("changing a password", () => {
  function change(currentPassword: string, newPassword: string) {
    return as("player", "put", "/users/player/password").send({
      currentPassword,
      newPassword,
    });
  }

  it("needs the current password", async () => {
    const response = await change("wrong", "a new password");

    expect(response.status).toBe(422);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/incorrect-password",
      detail: "Current password is incorrect",
    });
  });

  it("follows the password policy", async () => {
    const response = await change("current password", "short");

    expect(response.status).toBe(422);
    expect(bodyOf(response).type).toBe("/problems/password-not-allowed");
  });

  it("keeps this session, and ends the user's others", async () => {
    const { player: elsewhere } = await startSessions("player");

    const response = await change("current password", "a new password");

    expect(response.status).toBe(204);
    expect(await SessionService.findSession(sessions.player)).not.toBeNull();
    expect(await SessionService.findSession(elsewhere)).toBeNull();
  });
});

describe("a forgotten password", () => {
  it("is accepted the same way whether or not an account matches", async () => {
    const known = await request(app)
      .post("/api/v1/password-reset-requests")
      .send({ identifier: "player" });
    const unknown = await request(app)
      .post("/api/v1/password-reset-requests")
      .send({ identifier: "nobody" });

    for (const response of [known, unknown]) {
      expect(response.status).toBe(202);
      expect(response.text).toBe("");
    }
  });

  it("is accepted even when sending fails, which is logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(PasswordService, "requestPasswordReset").mockRejectedValueOnce(
      new Error("SMTP down")
    );

    const response = await request(app)
      .post("/api/v1/password-reset-requests")
      .send({ identifier: "player" });

    expect(response.status).toBe(202);
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "Password reset request failed: SMTP down"
      )
    );
  });

  it("is reset with the link's token, once", async () => {
    await PasswordService.requestPasswordReset("player");
    const body = vi.mocked(EmailService.sendEmail).mock.lastCall![0].text;
    const resetToken = new URL(body.match(/https:\S+/)![0]).searchParams.get(
      "token"
    );
    const reset = () =>
      request(app)
        .post("/api/v1/password-resets")
        .send({ resetToken, newPassword: "a new password" });

    expect((await reset()).status).toBe(204);

    const again = await reset();
    expect(again.status).toBe(422);
    expect(bodyOf(again)).toMatchObject({
      type: "/problems/invalid-link",
      detail: "Password reset link is invalid or has expired",
    });
  });

  it("can be sent a reset link by an administrator", async () => {
    const response = await as(
      "admin",
      "post",
      "/users/player/password-reset-links"
    );

    expect(response.status).toBe(204);
    expect(EmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "player@example.com" })
    );
  });
});

describe("listing teams", () => {
  it("shows a player only what they need to choose one to join", async () => {
    const response = await as("player", "get", "/teams");

    expect(bodyOf(response)).toEqual({
      items: [{ teamName: "team-a", displayName: "Team A" }],
      next: null,
    });
  });

  it("shows an administrator each team's join code and members", async () => {
    const response = await as("admin", "get", "/teams");

    expect(bodyOf(response).items).toEqual([
      {
        teamName: "team-a",
        displayName: "Team A",
        joinCode: "join-a",
        members: [{ userName: "player", displayName: "player display name" }],
      },
    ]);
  });
});

describe("a team", () => {
  it("is created by an administrator", async () => {
    const response = await as("admin", "post", "/teams").send({
      teamName: "team-b",
      displayName: "Team B",
      joinCode: "join-b",
    });

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe("/api/v1/teams/team-b");
    expect(bodyOf(response)).toEqual({
      teamName: "team-b",
      displayName: "Team B",
      joinCode: "join-b",
      members: [],
    });
  });

  it("can't share a join code with another", async () => {
    const response = await as("admin", "post", "/teams").send({
      teamName: "team-b",
      displayName: "Team B",
      joinCode: "join-a",
    });

    expect(response.status).toBe(409);
    expect(bodyOf(response).detail).toBe("That join code is already in use");
  });

  it("can be changed and deleted", async () => {
    const changed = await as("admin", "patch", "/teams/team-a").send({
      displayName: "The A Team",
    });
    expect(bodyOf(changed).displayName).toBe("The A Team");

    expect((await as("admin", "delete", "/teams/team-a")).status).toBe(204);
    expect((await as("admin", "get", "/teams/team-a")).status).toBe(404);
  });
});

describe("joining and leaving a team", () => {
  const membership = "/teams/team-a/members/other";

  it("needs the team's join code", async () => {
    const response = await as("other", "put", membership).send({
      joinCode: "wrong",
    });

    expect(response.status).toBe(422);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/wrong-join-code",
      detail: "Invalid join code for team team-a",
    });
  });

  it("joins once, and leaves once", async () => {
    const join = () =>
      as("other", "put", membership).send({ joinCode: "JOIN-A" });

    expect((await join()).status).toBe(204);
    expect(bodyOf(await join()).type).toBe("/problems/already-exists");

    expect((await as("other", "delete", membership)).status).toBe(204);
    const again = await as("other", "delete", membership);
    expect(again.status).toBe(404);
    expect(bodyOf(again).detail).toBe(
      "User other is not a member of team team-a"
    );
  });
});
