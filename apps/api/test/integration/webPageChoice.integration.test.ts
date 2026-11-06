// Tests of who gets which page while admin screens are still EJS: the server
// chooses by session. They use a small stand-in for the React app's build.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Express } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startSessions } from "../sessions.js";

const paths = vi.hoisted(() => ({ webDirectory: "" }));

vi.mock("../../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/paths.js")>();
  return {
    ...actual,
    get webDirectory() {
      return paths.webDirectory;
    },
  };
});

const REACT_PAGE = "<!doctype html><title>The React app</title>";

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "pq-choice-"));
paths.webDirectory = temporaryDirectory;
writeFileSync(path.join(temporaryDirectory, "index.html"), REACT_PAGE);

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
  await UserModel.create(
    ["admin", "player", "other"].map((userName) => ({
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
  await PuzzleModel.create({
    name: "riddle",
    displayName: "Riddle",
    solutionKeyword: "piano",
    solutionDisplayText: "A piano",
  });
  await QuestService.createQuest({
    name: "trail",
    displayName: "The Trail",
    assignee: { kind: "user", name: "player" },
    puzzles: [{ puzzleName: "riddle" }],
  });
  await QuestService.startQuest("trail");
  sessions = await startSessions("admin", "player", "other");
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function getPage(pagePath: string, account?: string): request.Test {
  const pending = request(app).get(pagePath);
  return account
    ? pending.set("Authorization", `Bearer ${sessions[account]}`)
    : pending;
}

describe("a player", () => {
  it.each(["/", "/quest/trail"])("gets the React app at %s", async (page) => {
    const response = await getPage(page, "player");

    expect(response.status).toBe(200);
    expect(response.text).toBe(REACT_PAGE);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("gets the same page whether or not a quest exists or is theirs", async () => {
    const theirs = await getPage("/quest/trail", "other");
    const missing = await getPage("/quest/no-such-quest", "other");

    expect(theirs.status).toBe(200);
    expect(theirs.text).toBe(REACT_PAGE);
    expect(missing.status).toBe(200);
    expect(missing.text).toBe(REACT_PAGE);
  });

  it("gets the React app for a puzzle", async () => {
    const response = await getPage("/quest/trail/puzzle/riddle", "player");

    expect(response.status).toBe(200);
    expect(response.text).toBe(REACT_PAGE);
  });

  it.each(["/quest/new", "/quest/trail/edit"])(
    "may not open the administrator's page %s",
    async (page) => {
      expect((await getPage(page, "player")).status).toBe(403);
    }
  );
});

describe("an administrator", () => {
  it.each([
    ["/", "admin"],
    ["/quest/trail", "questDetails"],
    ["/quest/new", "questEdit"],
    ["/quest/trail/edit", "questEdit"],
  ])("gets the EJS page at %s", async (page, script) => {
    const response = await getPage(page, "admin");

    expect(response.status).toBe(200);
    expect(response.text).toContain(`src="/script/${script}.js"`);
  });
});

describe("an administrator, who has no EJS page for it", () => {
  it("gets the React app for a puzzle", async () => {
    const response = await getPage("/quest/trail/puzzle/riddle", "admin");

    expect(response.text).toBe(REACT_PAGE);
  });
});

describe("account pages", () => {
  it("offer signing up to anyone", async () => {
    for (const account of [undefined, "player", "admin"]) {
      const response = await getPage("/user/register", account);

      expect(response.status).toBe(200);
      expect(response.text).toBe(REACT_PAGE);
    }
  });

  it.each(["/user/player", "/user/player/edit"])(
    "show %s to its user and administrators only",
    async (page) => {
      expect((await getPage(page, "player")).text).toBe(REACT_PAGE);
      expect((await getPage(page, "admin")).text).toBe(REACT_PAGE);
      expect((await getPage(page, "other")).status).toBe(403);
      expect((await getPage(page)).status).toBe(302);
    }
  );
});

describe("following a quest", () => {
  it.each([
    "/monitor/quest/trail",
    "/monitor/quest/trail/board",
    "/monitor/quest/trail/puzzle/riddle",
    "/monitor/quest/no-such-quest",
  ])("is open to anyone at %s, with no data in the page", async (page) => {
    for (const account of [undefined, "player", "admin"]) {
      const response = await getPage(page, account);

      expect(response.status).toBe(200);
      expect(response.text).toBe(REACT_PAGE);
    }
  });
});

describe("an anonymous visitor", () => {
  it("gets the React app at the site's root, which shows the landing page", async () => {
    const response = await getPage("/");

    expect(response.status).toBe(200);
    expect(response.text).toBe(REACT_PAGE);
  });

  it("gets the React app for a forgotten password", async () => {
    const response = await getPage("/user/password/forgot");

    expect(response.status).toBe(200);
    expect(response.text).toBe(REACT_PAGE);
  });

  it.each([
    "/user/password/reset?token=abc_123",
    "/user/email/verify?token=abc_123",
    "/user/email/verify?token=%3C/script%3E",
  ])("gets %s, keeping the token from other sites", async (page) => {
    const response = await getPage(page);

    expect(response.status).toBe(200);
    expect(response.text).toBe(REACT_PAGE);
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it.each(["/quest/trail", "/quest/trail/puzzle/riddle"])(
    "is sent to sign in, and back, from %s",
    async (page) => {
      const response = await getPage(page);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        `/login?next=${encodeURIComponent(page)}`
      );
    }
  );
});
