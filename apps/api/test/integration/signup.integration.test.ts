// Tests of who decides a new account's authorization level. Sign-up is
// public, so the level a request asks for must count only when an
// administrator sends it.
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
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

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
  await UserModel.deleteMany({});
});

async function createAdmin() {
  await UserModel.create({
    userName: "admin",
    displayName: "Admin",
    email: "admin@example.com",
    password: "hash",
    authorizationLevel: AuthorizationLevel.ADMIN,
  });
}

/**
 * Signs up a new account, asking to be an administrator.
 * @param signedInAs who sends the request, or null for anonymous
 * @returns the response
 */
async function signUpAsAdmin(signedInAs: "admin" | "player" | null) {
  const pending = request(app).post("/api/v1/users");
  if (signedInAs) {
    const tokens = await startSessions(signedInAs);
    pending.set("Authorization", `Bearer ${tokens[signedInAs]}`);
  }
  return await pending.send({
    userName: "newcomer",
    displayName: "Newcomer",
    email: "newcomer@example.com",
    password: "a long enough password",
    authorizationLevel: AuthorizationLevel.ADMIN,
  });
}

async function storedLevel() {
  return (await UserModel.findOne({ userName: "newcomer" }).lean())
    ?.authorizationLevel;
}

describe("signing up", () => {
  it("gives an anonymous visitor an ordinary account", async () => {
    await createAdmin();

    const response = await request(app).post("/api/v1/users").send({
      userName: "newcomer",
      displayName: "Newcomer",
      email: "newcomer@example.com",
      password: "a long enough password",
    });

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe("/api/v1/users/newcomer");
    expect(JSON.parse(response.text)).toMatchObject({
      userName: "newcomer",
      authorizationLevel: AuthorizationLevel.USER,
      emailVerified: false,
      teams: [],
    });
    expect(await storedLevel()).toBe(AuthorizationLevel.USER);
  });

  it("refuses an anonymous visitor asking for a level, creating nothing", async () => {
    await createAdmin();

    const response = await signUpAsAdmin(null);

    expect(response.status).toBe(403);
    expect(JSON.parse(response.text).type).toBe("/problems/forbidden");
    expect(await storedLevel()).toBeUndefined();
  });

  it("refuses a player asking for a level for a new account", async () => {
    await createAdmin();
    await UserModel.create({
      userName: "player",
      displayName: "Player",
      email: "player@example.com",
      password: "hash",
      authorizationLevel: AuthorizationLevel.USER,
    });

    expect((await signUpAsAdmin("player")).status).toBe(403);

    expect(await storedLevel()).toBeUndefined();
  });

  it("lets an administrator choose the level", async () => {
    await createAdmin();

    expect((await signUpAsAdmin("admin")).status).toBe(201);

    expect(await storedLevel()).toBe(AuthorizationLevel.ADMIN);
  });

  it("makes even the very first account a player", async () => {
    const response = await request(app).post("/api/v1/users").send({
      userName: "newcomer",
      displayName: "Newcomer",
      email: "newcomer@example.com",
      password: "a long enough password",
    });

    expect(response.status).toBe(201);
    expect(await storedLevel()).toBe(AuthorizationLevel.USER);
  });
});
