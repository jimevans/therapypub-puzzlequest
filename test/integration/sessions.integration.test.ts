// Tests of signing in and out with database sessions, through the whole
// application.
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

const bcrypt = (await import("bcrypt")).default;
const { createApp } = await import("../../src/createApp.js");
const { SessionModel } = await import("../../src/models/session.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const SessionService = await import("../../src/services/session.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await SessionModel.init();
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(bcrypt.compare).mockImplementation(
    async (password) => password === "right password"
  );
  await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]);
  await UserModel.create(
    (["admin", "player"] as const).map((userName) => ({
      userName,
      displayName: `${userName} display name`,
      email: `${userName}@example.com`,
      password: "hash",
      authorizationLevel:
        userName === "admin"
          ? AuthorizationLevel.ADMIN
          : AuthorizationLevel.USER,
    }))
  );
});

/**
 * Gets the session cookie a response sets, if any.
 * @param response the response
 * @returns the Set-Cookie header for the session cookie
 */
function sessionCookie(response: request.Response): string | undefined {
  const cookies = response.headers["set-cookie"] as unknown as
    string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith("pq-session="));
}

/**
 * Gets the token a session cookie holds.
 * @param cookie the Set-Cookie header
 * @returns the token
 */
function tokenIn(cookie: string): string {
  return cookie.slice("pq-session=".length).split(";")[0];
}

/**
 * Requests the API's view of the player's own account, to see who a
 * request counts as.
 * @param authenticate adds the session to the request
 * @returns the response status
 */
async function whoAmI(
  authenticate: (pending: request.Test) => request.Test
): Promise<number> {
  return (await authenticate(request(app).get("/api/user/player"))).status;
}

function signIn(body: object = {}) {
  return request(app)
    .post("/api/user/login")
    .send({ userName: "player", password: "right password", ...body });
}

describe("signing in from a browser", () => {
  it("sets an httpOnly, SameSite cookie, and never shows the page the token", async () => {
    const response = await signIn();

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toEqual({ status: "success" });
    const cookie = sessionCookie(response)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);
  });

  it("stores only a hash of the token", async () => {
    const token = tokenIn(sessionCookie(await signIn())!);

    const [session] = await SessionModel.find({}).lean();
    expect(session.tokenHash).toBe(SessionService.hashSessionToken(token));
    expect(JSON.stringify(session)).not.toContain(token);
    expect(session.userName).toBe("player");
  });

  it("signs the browser in with the cookie", async () => {
    const cookie = sessionCookie(await signIn())!;

    expect(await whoAmI((pending) => pending.set("Cookie", cookie))).toBe(200);
  });

  it("starts no session for a wrong password", async () => {
    const response = await signIn({ password: "wrong" });

    expect(response.status).toBe(401);
    expect(sessionCookie(response)).toBeUndefined();
    expect(await SessionModel.countDocuments()).toBe(0);
  });
});

describe("signing in from an app", () => {
  it("returns the token instead of setting a cookie", async () => {
    const response = await signIn({ client: "native" });

    expect(sessionCookie(response)).toBeUndefined();
    const { token } = JSON.parse(response.text).data;
    expect(
      await whoAmI((pending) => pending.set("Authorization", `Bearer ${token}`))
    ).toBe(200);
  });
});

describe("signing out", () => {
  it("ends the session through the API", async () => {
    const { player } = await startSessions("player");
    const bearer = (pending: request.Test) =>
      pending.set("Authorization", `Bearer ${player}`);

    expect((await bearer(request(app).post("/api/user/logout"))).status).toBe(
      200
    );

    expect(await whoAmI(bearer)).toBe(401);
  });

  it("ends the session and clears the cookie from the sign-out link", async () => {
    const cookie = sessionCookie(await signIn())!;

    const response = await request(app).get("/logout").set("Cookie", cookie);

    expect(response.status).toBe(302);
    expect(sessionCookie(response)).toMatch(/^pq-session=;/);
    expect(await whoAmI((pending) => pending.set("Cookie", cookie))).toBe(401);
  });

  it("does nothing for an anonymous visitor", async () => {
    expect((await request(app).post("/api/user/logout")).status).toBe(200);
  });
});

describe("a session that has ended", () => {
  it("counts as anonymous, and its cookie is cleared", async () => {
    const response = await request(app)
      .get("/")
      .set("Cookie", "pq-session=not-a-session");

    expect(response.status).toBe(200);
    expect(response.text).toContain('src="/script/index.js"');
    expect(sessionCookie(response)).toMatch(/^pq-session=;/);
  });

  it("counts as anonymous once it expires", async () => {
    const { player } = await startSessions("player");
    await SessionModel.updateMany({}, { expiresAt: new Date(Date.now() - 1) });

    expect(
      await whoAmI((pending) =>
        pending.set("Authorization", `Bearer ${player}`)
      )
    ).toBe(401);
  });

  it("expires through a TTL index", async () => {
    const indexes = await SessionModel.collection.indexes();

    expect(
      indexes.find((index) => index.key.expiresAt === 1)?.expireAfterSeconds
    ).toBe(0);
  });
});

describe("a session in use", () => {
  it("is extended, and its cookie renewed, at most hourly", async () => {
    const cookie = sessionCookie(await signIn())!;
    const before = (await SessionModel.findOne({}).lean())!;

    const soon = await request(app).get("/").set("Cookie", cookie);
    expect(sessionCookie(soon)).toBeUndefined();

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await SessionModel.updateMany(
      {},
      { lastUsedAt: twoHoursAgo, expiresAt: before.expiresAt }
    );
    const later = await request(app).get("/").set("Cookie", cookie);

    expect(sessionCookie(later)).toMatch(/Max-Age=2592000/);
    const after = (await SessionModel.findOne({}).lean())!;
    expect(after.lastUsedAt.getTime()).toBeGreaterThan(twoHoursAgo.getTime());
    expect(after.expiresAt.getTime()).toBeGreaterThan(
      before.expiresAt.getTime()
    );
  });
});

describe("the cookie from before sessions", () => {
  it("is cleared", async () => {
    const response = await request(app)
      .get("/")
      .set("Cookie", "pq-db-token=an-old-signed-token");

    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(cookies.find((cookie) => cookie.startsWith("pq-db-token="))).toMatch(
      /^pq-db-token=;/
    );
  });
});

describe("changes to a user", () => {
  it("apply to their session at once", async () => {
    const { player, admin } = await startSessions("player", "admin");
    await UserModel.updateOne(
      { userName: "player" },
      { displayName: "Renamed" }
    );

    const response = await request(app)
      .get("/api/user/player")
      .set("Authorization", `Bearer ${player}`);
    expect(JSON.parse(response.text).data.displayName).toBe("Renamed");

    // An administrator who loses that level can't act as one any more.
    await UserModel.updateOne(
      { userName: "admin" },
      { authorizationLevel: AuthorizationLevel.USER }
    );
    const listing = await request(app)
      .get("/api/user/list")
      .set("Authorization", `Bearer ${admin}`);
    expect(listing.status).toBe(403);
  });

  it("end the user's sessions when an administrator changes their level", async () => {
    const { player, admin } = await startSessions("player", "admin");

    await request(app)
      .put("/api/user/player")
      .set("Authorization", `Bearer ${admin}`)
      .send({ authorizationLevel: AuthorizationLevel.ADMIN });

    expect(await SessionService.findSession(player)).toBeNull();
    expect(await SessionService.findSession(admin)).not.toBeNull();
  });

  it("end the user's sessions when they are deleted", async () => {
    const { player, admin } = await startSessions("player", "admin");

    await request(app)
      .delete("/api/user/player")
      .set("Authorization", `Bearer ${admin}`);

    expect(await SessionService.findSession(player)).toBeNull();
  });

  it("don't end their sessions for a change of display name", async () => {
    const { player } = await startSessions("player");

    await request(app)
      .put("/api/user/player")
      .set("Authorization", `Bearer ${player}`)
      .send({ displayName: "New name" });

    expect(await SessionService.findSession(player)).not.toBeNull();
  });
});
