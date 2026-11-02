// Renders every page through createApp(), as an anonymous visitor, an
// administrator, or a player, so that each EJS view is rendered with the data
// its controller really passes. Each page is identified by the module script
// it loads (/script/<view>.js), or by its heading for the error page.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";

const jwt = (await import("jsonwebtoken")).default;
const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

const ACCOUNTS = {
  admin: { authorizationLevel: AuthorizationLevel.ADMIN },
  player: { authorizationLevel: AuthorizationLevel.USER },
};

let mongoServer;
let app;

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
    memberNames: ["player"],
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
    userName: "player",
    puzzles,
  });
  await QuestService.startQuest("waiting-quest");
  // A team quest whose first puzzle has been activated and is in progress.
  await QuestService.createQuest({
    name: "running-quest",
    displayName: "Running Quest",
    userName: "team-a",
    puzzles,
  });
  await QuestService.startQuest("running-quest");
  const runningQuest = await QuestModel.findOne({
    name: "running-quest",
  }).lean();
  await QuestService.activatePuzzle(
    "running-quest",
    "text-puzzle",
    ["team-a"],
    runningQuest.puzzles[0].activationCode
  );
  await QuestService.getPuzzleHint("running-quest", "text-puzzle", ["team-a"]);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

/**
 * Requests a page, signed in as the given account if any.
 * @param {string} path the page to request
 * @param {string | null} account "admin", "player", or null for anonymous
 * @returns {Promise<import("supertest").Response>} the response
 */
function getPage(path, account) {
  const pageRequest = request(app).get(path);
  if (!account) {
    return pageRequest;
  }
  jwt.verify.mockReturnValue({
    userName: account,
    displayName: `${account} display name`,
    email: `${account}@example.com`,
    authorizationLevel: ACCOUNTS[account].authorizationLevel,
    iat: Math.floor(Date.now() / 1000),
  });
  return pageRequest.set("Authorization", "Bearer token");
}

// [description, path, account, view, text the page must contain]
const PAGES = [
  ["landing page", "/", null, "index", ["Sign up"]],
  ["sign-in page", "/login", null, "login", []],
  ["sign-up page", "/user/register", null, "user", ['id="user-name"']],
  ["forgot password page", "/user/password/forgot", null, "forgotPassword", []],
  [
    "reset password page",
    "/user/password/reset?token=abc_123",
    null,
    "resetPassword",
    ['"abc_123"'],
  ],
  ["sign-in for a protected page", "/puzzle/text-puzzle", null, "login", []],

  ["administrator home", "/", "admin", "admin", []],
  ["own profile", "/user/admin", "admin", "user", ["Change password"]],
  [
    "another user's profile",
    "/user/player",
    "admin",
    "user",
    ["Send password reset email", "player display name"],
  ],
  ["profile editor", "/user/player/edit", "admin", "user", ['id="auth-level"']],
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
    ["Running Quest"],
  ],
  [
    "quest editor",
    "/quest/running-quest/edit",
    "admin",
    "questEdit",
    ["Running Quest"],
  ],
  [
    "quest monitor",
    "/monitor/quest/running-quest",
    "admin",
    "monitorQuest",
    ["Running Quest", "Text Puzzle"],
  ],
  [
    "puzzle monitor",
    "/monitor/quest/running-quest/puzzle/text-puzzle",
    "admin",
    "monitorPuzzle",
    ["It makes music"],
  ],

  ["player home", "/", "player", "home", ["Waiting Quest", "Running Quest"]],
  [
    "player's own profile",
    "/user/player",
    "player",
    "user",
    ["Change password", "Team A"],
  ],
  ["player's profile editor", "/user/player/edit", "player", "user", []],
  [
    "quest",
    "/quest/waiting-quest",
    "player",
    "quest",
    ["Waiting Quest", "Text Puzzle"],
  ],
  [
    "puzzle awaiting activation",
    "/quest/waiting-quest/puzzle/text-puzzle",
    "player",
    "activate",
    ["Text Puzzle"],
  ],
  [
    "puzzle in progress",
    "/quest/running-quest/puzzle/text-puzzle",
    "player",
    "puzzle",
    ["Text Puzzle", "It makes music"],
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
});

describe("a quest puzzle whose puzzle was deleted", () => {
  it("renders the error page with a 404", async () => {
    await PuzzleModel.create({
      name: "doomed-puzzle",
      displayName: "Doomed Puzzle",
      solutionKeyword: "gone",
      solutionDisplayText: "Gone",
    });
    await QuestService.createQuest({
      name: "doomed-quest",
      userName: "player",
      puzzles: [{ puzzleName: "doomed-puzzle" }],
    });
    await QuestService.startQuest("doomed-quest");
    await PuzzleModel.deleteOne({ name: "doomed-puzzle" });

    const response = await getPage(
      "/quest/doomed-quest/puzzle/doomed-puzzle",
      "player"
    );

    expect(response.status).toBe(404);
    expect(response.text).toContain("<h1>Not found</h1>");
    expect(response.text).toContain("Puzzle doomed-puzzle no longer exists");
  });
});

describe("error page", () => {
  it.each([
    [
      "a puzzle that does not exist",
      "/puzzle/missing",
      "admin",
      200,
      "Not found",
    ],
    [
      "puzzles, for a player",
      "/puzzle/text-puzzle",
      "player",
      200,
      "Unauthorized",
    ],
    [
      "another user's profile, for a player",
      "/user/other",
      "player",
      200,
      "Unauthorized",
    ],
    [
      "a quest that does not exist",
      "/quest/missing",
      "player",
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
