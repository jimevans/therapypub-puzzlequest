// Renders every page through createApp(), as an anonymous visitor, an
// administrator, or a player, so that each EJS view is rendered with the data
// its controller really passes. Each page is identified by the module script
// it loads (/script/<view>.js), or by its heading for the error page.
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

// [description, path, account, view, text the page must contain]
const PAGES: [string, string, string | null, string, string[]][] = [
  ["new puzzle", "/puzzle/new", "admin", "puzzleEdit", []],
  [
    "text puzzle details",
    "/puzzle/text-puzzle",
    "admin",
    "puzzleDetails",
    ["Text Puzzle"],
  ],
  [
    "image puzzle details",
    "/puzzle/image-puzzle",
    "admin",
    "puzzleDetails",
    ["Image Puzzle"],
  ],
  [
    "puzzle editor",
    "/puzzle/text-puzzle/edit",
    "admin",
    "puzzleEdit",
    ["Text Puzzle"],
  ],
  ["new quest", "/quest/new", "admin", "questEdit", []],
  [
    "quest details",
    "/quest/running-quest",
    "admin",
    "questDetails",
    ["Running Quest", "team-a (team)"],
  ],
  [
    "quest editor",
    "/quest/running-quest/edit",
    "admin",
    "questEdit",
    ["Running Quest", 'value="team-a" data-kind="team"'],
  ],
];

describe.each(PAGES)("%s (%s)", (_description, path, account, view, texts) => {
  it(`renders the ${view} view`, async () => {
    const response = await getPage(path, account);

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.text).toMatch(/^<!DOCTYPE html>/);
    expect(response.text).toContain(`src="/script/${view}.js"`);
    for (const text of texts) {
      expect(response.text).toContain(text);
    }
  });

  it("gives its inline scripts the Content Security Policy's nonce", async () => {
    const response = await getPage(path, account);

    const nonce = /'nonce-([^']+)'/.exec(
      response.headers["content-security-policy"]
    )?.[1];
    expect(nonce).toBeDefined();
    const inlineScripts = response.text.match(/<script(?![^>]*\ssrc=)[^>]*>/g);
    for (const script of inlineScripts ?? []) {
      expect(script).toBe(`<script nonce="${nonce}">`);
    }
  });
});

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
      "a puzzle that does not exist",
      "/puzzle/missing",
      "admin",
      404,
      "Not found",
    ],
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
    [
      "a quest that does not exist",
      "/quest/missing",
      "admin",
      404,
      "Not found",
    ],
  ])("renders for %s", async (_description, path, account, status, title) => {
    const response = await getPage(path, account);

    expect(response.status).toBe(status);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain(`<h1>${title}</h1>`);
  });
});
