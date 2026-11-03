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
    runningQuest!.puzzles[0].activationCode
  );
  await QuestService.getPuzzleHint("running-quest", "text-puzzle", ["team-a"]);
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
  [
    "email verification page",
    "/user/email/verify?token=abc_123",
    null,
    "verifyEmail",
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

describe("quest progress", () => {
  beforeAll(async () => {
    // A finished quest: 45 minutes, plus one revealed 60-second hint.
    await QuestModel.create({
      name: "finished-quest",
      displayName: "Finished Quest",
      userName: "player",
      status: 2,
      puzzles: [
        {
          puzzleName: "text-puzzle",
          status: 3,
          nextHintToDisplay: 1,
          activationCode: "code1",
          startTime: new Date("2026-11-03T19:00:00Z"),
          activationTime: new Date("2026-11-03T19:05:00Z"),
          endTime: new Date("2026-11-03T19:30:00Z"),
        },
        {
          puzzleName: "image-puzzle",
          status: 3,
          nextHintToDisplay: 0,
          activationCode: "code2",
          startTime: new Date("2026-11-03T19:30:00Z"),
          activationTime: new Date("2026-11-03T19:35:00Z"),
          endTime: new Date("2026-11-03T19:45:00Z"),
        },
      ],
    });
  });

  /**
   * Gets the HTML of the card whose opening tag contains the given text.
   * @param html the page
   * @param marker text in the card's opening tag
   * @returns the card's HTML, up to the next card
   */
  function card(html: string, marker: string): string {
    const start = html.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    // Search for the next card after the end of this card's opening tag.
    const bodyStart = html.indexOf(">", start) + 1;
    const next = html.slice(bodyStart).search(/class="pq-quest(-puzzle)?"/);
    return html.slice(start, next < 0 ? undefined : bodyStart + next);
  }

  it("shows a finished quest's elapsed time, penalties, and total on the player's home page", async () => {
    const response = await getPage("/", "player");

    const finished = card(response.text, 'data-quest-name="finished-quest"');
    expect(finished).toContain(
      '<span data-progress="elapsed" data-duration="2700000">00:45:00</span>'
    );
    expect(finished).toContain(
      '<span data-progress="penalty" data-duration="60000">00:01:00</span>'
    );
    expect(finished).toContain(
      '<span data-progress="total" data-duration="2760000">00:46:00</span>'
    );
    expect(finished).not.toContain("data-clock-start");
  });

  it("runs the clocks of a quest in progress, adding its penalties to the total", async () => {
    const response = await getPage("/", "player");

    const running = card(response.text, 'data-quest-name="running-quest"');
    expect(running).toMatch(
      /data-progress="elapsed" data-duration="0" data-clock-start="[^"]+"/
    );
    expect(running).toContain(
      '<span data-progress="penalty" data-duration="60000">00:01:00</span>'
    );
    expect(running).toMatch(
      /data-progress="total" data-duration="60000" data-clock-start="[^"]+"/
    );
  });

  it.each([
    ["quest page", "/quest/running-quest", "player"],
    ["quest monitor", "/monitor/quest/running-quest", "admin"],
  ])(
    "shows the penalties on the %s, for the quest and the puzzle",
    async (_page, path, account) => {
      const response = await getPage(path, account);

      const penalty =
        '<span data-progress="penalty" data-duration="60000">00:01:00</span>';
      expect(card(response.text, 'id="quest-progress"')).toContain(penalty);
      expect(card(response.text, 'data-puzzle-name="text-puzzle"')).toContain(
        penalty
      );
    }
  );

  it("includes progress in the quest's JSON", async () => {
    const response = await getPage("/api/quest/finished-quest", "player");

    expect(JSON.parse(response.text).data.progress).toMatchObject({
      running: false,
      elapsedMs: 45 * 60 * 1000,
      penaltyMs: 60 * 1000,
      totalMs: 46 * 60 * 1000,
    });
  });
});
