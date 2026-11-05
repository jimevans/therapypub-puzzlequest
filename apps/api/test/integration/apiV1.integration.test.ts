// Tests of the v1 API's foundations, through the whole application: its
// problem details, its sessions, and its OpenAPI description.
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
import { Validator } from "@seriousme/openapi-schema-validator";
import { startSessions } from "../sessions.js";

const bcrypt = (await import("bcrypt")).default;
const { config } = await import("../../src/config.js");
const { createApp } = await import("../../src/createApp.js");
const { V1Router, v1Routes } = await import("../../src/api/v1/index.js");
const { toExpressPath } = await import("../../src/api/v1/route.js");
const { SessionModel } = await import("../../src/models/session.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

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
  vi.mocked(bcrypt.compare).mockImplementation(
    async (password) => password === "right password"
  );
  await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]);
  await UserModel.create({
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    phone: "+15551230001",
    sms: true,
    password: "hash",
    authorizationLevel: AuthorizationLevel.USER,
    emailVerifiedAt: new Date(),
  });
});

afterEach(() => {
  config.PQ_BASE_URL = undefined;
});

/**
 * Parses a problem response, checking it is one.
 * @param response the response
 * @returns the problem
 */
function problemOf(response: request.Response) {
  expect(response.type).toBe("application/problem+json");
  const problem = JSON.parse(response.text);
  expect(problem.status).toBe(response.status);
  return problem;
}

describe("problems", () => {
  it("say that signing in is needed", async () => {
    const response = await request(app).get("/api/v1/sessions/current");

    expect(response.status).toBe(401);
    expect(problemOf(response)).toEqual({
      type: "/problems/sign-in-required",
      title: "Sign in to do this",
      status: 401,
      detail: "Sign in to do this, with the session cookie or a Bearer token",
    });
  });

  it("list each problem with an invalid request", async () => {
    const response = await request(app)
      .post("/api/v1/sessions")
      .send({ userName: "", client: "tablet" });

    expect(response.status).toBe(400);
    const problem = problemOf(response);
    expect(problem).toMatchObject({
      type: "/problems/invalid-request",
      title: "The request isn't valid",
    });
    expect(problem.errors.map((error: { path: string }) => error.path)).toEqual(
      ["body.userName", "body.password", "body.client"]
    );
  });

  it("say that a path isn't part of the API", async () => {
    const response = await request(app).get("/api/v1/nothing?x=1");

    expect(response.status).toBe(404);
    expect(problemOf(response)).toEqual({
      type: "/problems/not-found",
      title: "Not found",
      status: 404,
      detail: "There is no GET /api/v1/nothing in the API",
    });
  });

  it("refuse a request sent with the cookie from another site", async () => {
    config.PQ_BASE_URL = "https://puzzlequest.example";
    const { player } = await startSessions("player");

    const response = await request(app)
      .delete("/api/v1/sessions/current")
      .set("Cookie", `pq-session=${player}`)
      .set("Origin", "https://elsewhere.example");

    expect(response.status).toBe(403);
    expect(problemOf(response).type).toBe("/problems/cross-site-request");
    expect(await SessionModel.countDocuments()).toBe(1);
  });

  it("aren't used outside the API, where pages answer", async () => {
    const response = await request(app).get("/user/player");

    expect(response.status).toBe(200);
    expect(response.text).toContain('src="/script/login.js"');
  });
});

describe("the current session", () => {
  it("says who is signed in", async () => {
    const { player } = await startSessions("player");

    const response = await request(app)
      .get("/api/v1/sessions/current")
      .set("Authorization", `Bearer ${player}`);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toEqual({
      user: {
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        userName: "player",
        displayName: "Player",
        email: "player@example.com",
        emailVerified: true,
        phone: "+15551230001",
        sms: true,
        authorizationLevel: AuthorizationLevel.USER,
      },
    });
  });

  it("is the one a sign-in starts", async () => {
    const signIn = await request(app)
      .post("/api/v1/sessions")
      .send({ userName: "player", password: "right password" });
    const cookie = (signIn.headers["set-cookie"] as unknown as string[])[0];

    const response = await request(app)
      .get(signIn.headers.location)
      .set("Cookie", cookie.split(";")[0]);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text).user.userName).toBe("player");
  });

  it("ends on signing out", async () => {
    const { player } = await startSessions("player");
    const asPlayer = (pending: request.Test) =>
      pending.set("Authorization", `Bearer ${player}`);

    const signOut = await asPlayer(
      request(app).delete("/api/v1/sessions/current")
    );

    expect(signOut.status).toBe(204);
    expect(signOut.text).toBe("");
    expect(
      (await asPlayer(request(app).get("/api/v1/sessions/current"))).status
    ).toBe(401);
  });
});

describe("the OpenAPI document", () => {
  async function getDocument() {
    const response = await request(app).get("/api/v1/openapi.json");
    expect(response.status).toBe(200);
    expect(response.type).toBe("application/json");
    return JSON.parse(response.text);
  }

  it("is a valid OpenAPI 3.1 document", async () => {
    const document = await getDocument();

    const result = await new Validator().validate(document);

    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(document.openapi).toBe("3.1.0");
  });

  it("describes every route the API registers, except webhooks, and no others", async () => {
    const document = await getDocument();
    const described = Object.entries(
      document.paths as Record<string, object>
    ).flatMap(([path, operations]) =>
      Object.keys(operations).map(
        (method) => `${method} ${toExpressPath(path)}`
      )
    );

    const registered = V1Router.stack.flatMap((layer) =>
      layer.route
        ? Object.keys((layer.route as any).methods).map(
            (method) => `${method} ${layer.route!.path}`
          )
        : []
    );

    const webhooks = v1Routes
      .filter((route) => route.documented === false)
      .map((route) => `${route.method} ${toExpressPath(route.path)}`);

    expect(registered).toHaveLength(v1Routes.length);
    expect(webhooks.length).toBeGreaterThan(0);
    expect(described.sort()).toEqual(
      registered.filter((route) => !webhooks.includes(route)).sort()
    );
  });

  it("describes the live-update websocket's messages", async () => {
    const document = await getDocument();

    expect(document.info.description).toContain("`/api/v1/updates`");
    const update = document.components.schemas.LiveUpdate;
    expect(
      update.oneOf.map(
        (kind: { properties: { message: { const: string } } }) =>
          kind.properties.message.const
      )
    ).toEqual([
      "connection",
      "puzzleActivated",
      "puzzleSolved",
      "puzzleStarted",
      "hintRequested",
      "questUpdated",
    ]);
    expect(document.components.schemas.LiveUpdateSubscription).toMatchObject({
      properties: { message: { const: "subscribe" } },
    });
  });

  it("says nothing about webhooks", async () => {
    const response = await request(app).get("/api/v1/openapi.json");

    expect(response.text).not.toMatch(/webhook|twilio/i);
  });

  it("documents each route's problems, and their types", async () => {
    const document = await getDocument();

    const signIn = document.paths["/sessions"].post;
    expect(Object.keys(signIn.responses).sort()).toEqual([
      "201",
      "400",
      "401",
      "429",
      "500",
    ]);
    expect(signIn.responses["401"].description).toBe(
      "/problems/sign-in-failed: Incorrect user name or password."
    );
    expect(
      signIn.responses["401"].content["application/problem+json"].schema
    ).toEqual({ $ref: "#/components/schemas/Problem" });
    expect(signIn.security).toEqual([]);
    const current = document.paths["/sessions/current"].get;
    expect(current.security).toEqual([{ sessionCookie: [] }, { bearer: [] }]);
    expect(document.info.description).toContain(
      "| `/problems/sign-in-required` | 401 |"
    );
  });
});
