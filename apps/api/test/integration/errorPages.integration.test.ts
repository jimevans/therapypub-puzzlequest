// Requests pages through createApp(), as an anonymous visitor, an
// administrator, or a player, for the server's own error page, which needs no
// React. The rest of the site is the React app (see
// webPageChoice.integration.test.ts).
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";
import { assigneeIdsOf, userIdsOf } from "../references.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

const ACCOUNTS: Record<string, { authorizationLevel: number }> = {
  admin: { authorizationLevel: AuthorizationLevel.ADMIN },
  player: { authorizationLevel: AuthorizationLevel.USER },
};

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
      displayName: `${userName} display name`,
      email: `${userName}@example.com`,
      phone: "5551230000",
      sms: true,
      password: "hash",
      authorizationLevel:
        ACCOUNTS[userName]?.authorizationLevel ?? AuthorizationLevel.USER,
    }))
  );
  await TeamModel.create({
    teamName: "team-a",
    displayName: "Team A",
    joinCode: "join-code",
    memberIds: await userIdsOf("player"),
  });
  await PuzzleModel.create([
    {
      name: "text-puzzle",
      displayName: "Text Puzzle",
      type: 0,
      text: "# Riddle\n\nWhat has **keys** but no locks?",
      solutionKeyword: "piano",
      solutionDisplayText: "A piano",
      hints: [
        { text: "It makes music", timePenalty: 60 },
        { text: "It has 88 keys", solutionWarning: true, timePenalty: 300 },
      ],
    },
    {
      name: "image-puzzle",
      displayName: "Image Puzzle",
      type: 1,
      text: "/puzzleData/image-puzzle.png",
      solutionKeyword: "cat",
      solutionDisplayText: "A cat",
    },
  ]);

  const puzzles = [
    { puzzleName: "text-puzzle" },
    { puzzleName: "image-puzzle" },
  ];
  // Started: the first puzzle is waiting to be activated.
  await QuestService.createQuest({
    name: "waiting-quest",
    displayName: "Waiting Quest",
    assignee: { kind: "user", name: "player" },
    puzzles,
  });
  await QuestService.startQuest("waiting-quest");
  // A team quest whose first puzzle has been activated and is in progress.
  await QuestService.createQuest({
    name: "running-quest",
    displayName: "Running Quest",
    assignee: { kind: "team", name: "team-a" },
    puzzles,
  });
  await QuestService.startQuest("running-quest");
  const runningQuest = await QuestModel.findOne({
    name: "running-quest",
  }).lean();
  await QuestService.activatePuzzle(
    "running-quest",
    "text-puzzle",
    await assigneeIdsOf("team-a"),
    runningQuest!.puzzles[0].activationCode
  );
  await QuestService.getPuzzleHint(
    "running-quest",
    "text-puzzle",
    await assigneeIdsOf("team-a")
  );
  sessions = await startSessions("admin", "player");
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

/**
 * Requests a page, signed in as the given account if any.
 * @param path the page to request
 * @param account "admin", "player", or null for anonymous
 * @returns the response
 */
function getPage(path: string, account: string | null): request.Test {
  const pageRequest = request(app).get(path);
  if (!account) {
    return pageRequest;
  }
  return pageRequest.set("Authorization", `Bearer ${sessions[account]}`);
}

describe("a quest puzzle whose puzzle was deleted", () => {
  it("sends an anonymous visitor to sign in, and back to the page afterwards", async () => {
    const response = await getPage("/puzzle/text-puzzle?a=1&b=2", null);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `/login?next=${encodeURIComponent("/puzzle/text-puzzle?a=1&b=2")}`
    );
  });

  it("is not found", async () => {
    await PuzzleModel.create({
      name: "doomed-puzzle",
      displayName: "Doomed Puzzle",
      solutionKeyword: "gone",
      solutionDisplayText: "Gone",
    });
    await QuestService.createQuest({
      name: "doomed-quest",
      assignee: { kind: "user", name: "player" },
      puzzles: [{ puzzleName: "doomed-puzzle" }],
    });
    await QuestService.startQuest("doomed-quest");
    await PuzzleModel.deleteOne({ name: "doomed-puzzle" });

    const response = await getPage(
      "/api/v1/quests/doomed-quest/puzzles/doomed-puzzle",
      "player"
    );

    expect(response.status).toBe(404);
    expect(response.body.detail).toBe(
      "No puzzle named doomed-puzzle found for quest doomed-quest"
    );
  });
});

describe("error page", () => {
  it.each([
    [
      "puzzles, for a player",
      "/puzzle/text-puzzle",
      "player",
      403,
      "Forbidden",
    ],
    [
      "another user's profile, for a player",
      "/user/other",
      "player",
      403,
      "Forbidden",
    ],
  ])("renders for %s", async (_description, path, account, status, title) => {
    const response = await getPage(path, account);

    expect(response.status).toBe(status);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain(`<h1>${title}</h1>`);
  });

  it("works under the Content Security Policy: no inline scripts or styles", async () => {
    const response = await getPage("/user/other", "player");

    expect(response.text).not.toMatch(/<script|<style|\sstyle=/);
    expect(response.text).toContain('href="/style/error.css"');
    expect(response.headers["content-security-policy"]).toContain(
      "script-src 'self'"
    );
  });

  it("is shown for a missing file", async () => {
    const response = await getPage("/image/missing.png", null);

    expect(response.status).toBe(404);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain("<h1>Not found</h1>");
  });

  it("is shown for an address under /api that isn't the API", async () => {
    const response = await getPage("/api/v2/quests", null);

    expect(response.status).toBe(404);
    expect(response.text).toContain("<h1>Not found</h1>");
  });
});
