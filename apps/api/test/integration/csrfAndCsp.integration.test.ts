// Tests of the protections against cross-site request forgery and against
// injected scripts (the Content Security Policy), through the whole
// application.
import type { Express } from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";
import { userIdsOf } from "../references.js";

const { config } = await import("../../src/config.js");
const { createApp } = await import("../../src/createApp.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");

const SITE = "https://puzzlequest.example";

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let playerCookie = "";
let playerToken = "";

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
  config.PQ_BASE_URL = SITE;
  await Promise.all([UserModel.deleteMany({}), TeamModel.deleteMany({})]);
  await UserModel.create({
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    password: "hash",
    authorizationLevel: AuthorizationLevel.USER,
  });
  await TeamModel.create({
    teamName: "team-a",
    displayName: "Team A",
    joinCode: "join-a",
  });
  playerToken = (await startSessions("player")).player;
  playerCookie = `pq-session=${playerToken}`;
});

afterEach(() => {
  config.PQ_BASE_URL = undefined;
});

/**
 * Sends a state-changing request with the player's session cookie, as their
 * browser would: joining a team, which a forged request might try.
 * @param headers headers the browser adds, saying where it came from
 * @returns the response
 */
function joinTeamFromBrowser(headers: Record<string, string>) {
  return request(app)
    .put("/api/v1/teams/team-a/members/player")
    .set({ Cookie: playerCookie, ...headers })
    .send({ joinCode: "join-a" });
}

async function playerIsMember(): Promise<boolean> {
  const team = await TeamModel.findOne({ teamName: "team-a" }).lean();
  const [playerId] = await userIdsOf("player");
  return team!.memberIds.some((id) => id.equals(playerId));
}

describe("a request that changes something", () => {
  it("is accepted from this site", async () => {
    const response = await joinTeamFromBrowser({ Origin: SITE });

    expect(response.status).toBe(204);
    expect(await playerIsMember()).toBe(true);
  });

  it.each([
    ["from another site", { Origin: "https://evil.example" }],
    ["from an opaque origin, such as a sandboxed page", { Origin: "null" }],
    [
      "from another site, said only by the Referer",
      { Referer: "https://evil.example/page" },
    ],
    [
      "from this site's host over another scheme",
      { Origin: "http://puzzlequest.example" },
    ],
  ])("is refused %s", async (_, headers) => {
    const response = await joinTeamFromBrowser(headers);

    expect(response.status).toBe(403);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/cross-site-request",
      detail: "Request refused: it didn't come from this site",
    });
    expect(await playerIsMember()).toBe(false);
  });

  it("is accepted with only a Referer from this site", async () => {
    const response = await joinTeamFromBrowser({
      Referer: `${SITE}/user/player`,
    });

    expect(response.status).toBe(204);
  });

  it("is accepted from a client that isn't a browser, which doesn't say where it came from", async () => {
    const response = await joinTeamFromBrowser({});

    expect(response.status).toBe(204);
  });

  it("is accepted with its own credentials, which other sites can't add", async () => {
    const response = await request(app)
      .put("/api/v1/teams/team-a/members/player")
      .set({
        Authorization: `Bearer ${playerToken}`,
        Origin: "https://app.example",
      })
      .send({ joinCode: "join-a" });

    expect(response.status).toBe(204);
  });

  it("is checked against the request's own host when the base URL isn't set", async () => {
    config.PQ_BASE_URL = undefined;

    const same = await joinTeamFromBrowser({
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
    });
    const other = await joinTeamFromBrowser({
      Host: "localhost:3000",
      Origin: "http://localhost:4000",
    });

    expect(same.status).toBe(204);
    expect(other.status).toBe(403);
  });
});

describe("a request that only reads", () => {
  it("isn't checked, so links from other sites still work", async () => {
    const response = await request(app)
      .get("/user/player")
      .set({ Cookie: playerCookie, Origin: "https://evil.example" });

    expect(response.status).toBe(200);
  });
});

describe("the Content Security Policy", () => {
  function policyOf(response: request.Response): Record<string, string> {
    return Object.fromEntries(
      (response.headers["content-security-policy"] as string)
        .split(";")
        .map((directive) => directive.trim().split(/\s+/))
        .map(([name, ...values]) => [name, values.join(" ")])
    );
  }

  it("allows only this site's scripts and the page's own inline scripts", async () => {
    const policy = policyOf(await request(app).get("/"));

    expect(policy["script-src"]).toMatch(/^'self' 'nonce-[A-Za-z0-9+/=]+'$/);
    expect(policy["script-src-attr"]).toBe("'none'");
    expect(policy["object-src"]).toBe("'none'");
    expect(policy["frame-ancestors"]).toBe("'none'");
    expect(policy["default-src"]).toBe("'self'");
  });

  it("uses a new nonce for every response", async () => {
    const first = policyOf(await request(app).get("/"))["script-src"];
    const second = policyOf(await request(app).get("/"))["script-src"];

    expect(first).not.toBe(second);
  });

  it("allows live updates over this site's websocket", async () => {
    const policy = policyOf(await request(app).get("/"));

    expect(policy["connect-src"]).toBe("'self' wss://puzzlequest.example");
  });

  it("asks browsers to load everything over HTTPS outside development", async () => {
    const policy = policyOf(await request(app).get("/"));

    expect(policy).toHaveProperty("upgrade-insecure-requests");
  });
});
