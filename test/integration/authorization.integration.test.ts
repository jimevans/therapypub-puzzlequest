// The authorization policy for every route: who may call it. Each route is
// requested as an anonymous visitor, a player on the team the quest is
// assigned to, a player who isn't, and an administrator, and the outcome
// must match the table. Every route the application registers must appear
// in the table, so a new route can't be added without deciding its policy.
import type { Express, Router } from "express";
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
import { assigneeIdsOf, userIdsOf } from "../references.js";

// Rate limits would turn repeated requests into 429s, hiding the outcome
// under test; they have their own tests.
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
vi.mock("../../src/services/messaging.service.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/services/messaging.service.js")
  >()),
  sendOutgoingTextMessage: vi.fn(async () => ({
    status: "success",
    statusCode: 200,
  })),
}));

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const { SessionModel } = await import("../../src/models/session.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { IndexRouter } = await import("../../src/routes/index.js");
const { V1Router } = await import("../../src/api/v1/index.js");
const { MessagingApiRouter } =
  await import("../../src/routes/api.messaging.js");
const { QuestApiRouter } = await import("../../src/routes/api.quest.js");
const { MonitorRouter } = await import("../../src/routes/monitor.js");
const { PuzzleRouter } = await import("../../src/routes/puzzle.js");
const { QuestRouter } = await import("../../src/routes/quest.js");
const { UserRouter } = await import("../../src/routes/user.js");

/** Where createApp mounts each router. */
const MOUNTS: [string, Router][] = [
  ["", IndexRouter],
  ["/api/v1", V1Router],
  ["/api/quest", QuestApiRouter],
  ["/api/messaging", MessagingApiRouter],
  ["/user", UserRouter],
  ["/puzzle", PuzzleRouter],
  ["/quest", QuestRouter],
  ["/monitor", MonitorRouter],
];

type Role = "anonymous" | "player" | "other" | "admin";

/**
 * What happens to a request:
 * - allow: it gets past authorization (it may still fail for other reasons,
 *   such as a missing body, but not with 401, 403, or 404);
 * - signIn: the visitor must sign in (401, or the sign-in page);
 * - deny: forbidden (403);
 * - hidden: the thing exists, but this user can't see it, so it's
 *   reported as not found (404).
 */
type Outcome = "allow" | "signIn" | "deny" | "hidden";

/** The outcome for each role, in the order of ROLES. */
type Policy = [Outcome, Outcome, Outcome, Outcome];
const ROLES: Role[] = ["anonymous", "player", "other", "admin"];

const PUBLIC: Policy = ["allow", "allow", "allow", "allow"];
const SIGNED_IN: Policy = ["signIn", "allow", "allow", "allow"];
const ADMIN: Policy = ["signIn", "deny", "deny", "allow"];
/** For routes about the player's own account (":userName" is "player"). */
const SELF_OR_ADMIN: Policy = ["signIn", "allow", "deny", "allow"];
const SELF: Policy = ["signIn", "allow", "deny", "deny"];
/** Viewing the quest assigned to the player's team. */
const QUEST_VIEWER: Policy = ["signIn", "allow", "hidden", "allow"];
/** Playing the quest assigned to the player's team. */
const QUEST_PLAYER: Policy = ["signIn", "allow", "deny", "deny"];
/** Twilio webhooks, which need Twilio's signature, not a user. */
const TWILIO: Policy = ["deny", "deny", "deny", "deny"];

/** [method, path as registered, policy] for every route. */
const ROUTES: [string, string, Policy][] = [
  ["get", "/", PUBLIC],
  ["get", "/login", PUBLIC],
  ["get", "/logout", PUBLIC],

  ["get", "/api/v1/openapi.json", PUBLIC],
  ["post", "/api/v1/sessions", PUBLIC],
  ["get", "/api/v1/sessions/current", SIGNED_IN],
  ["delete", "/api/v1/sessions/current", PUBLIC],
  ["get", "/api/v1/users", ADMIN],
  ["post", "/api/v1/users", PUBLIC],
  ["get", "/api/v1/users/:userName", SELF_OR_ADMIN],
  ["patch", "/api/v1/users/:userName", SELF_OR_ADMIN],
  ["delete", "/api/v1/users/:userName", SELF_OR_ADMIN],
  ["put", "/api/v1/users/:userName/password", SELF],
  ["post", "/api/v1/users/:userName/password-reset-links", ADMIN],
  [
    "post",
    "/api/v1/users/:userName/email-verification-requests",
    SELF_OR_ADMIN,
  ],
  ["post", "/api/v1/password-reset-requests", PUBLIC],
  ["post", "/api/v1/password-resets", PUBLIC],
  ["post", "/api/v1/email-verifications", PUBLIC],
  ["get", "/api/v1/teams", SIGNED_IN],
  ["post", "/api/v1/teams", ADMIN],
  ["get", "/api/v1/teams/:teamName", ADMIN],
  ["patch", "/api/v1/teams/:teamName", ADMIN],
  ["delete", "/api/v1/teams/:teamName", ADMIN],
  ["put", "/api/v1/teams/:teamName/members/:userName", SELF_OR_ADMIN],
  ["delete", "/api/v1/teams/:teamName/members/:userName", SELF_OR_ADMIN],
  ["get", "/api/v1/puzzles", ADMIN],
  ["post", "/api/v1/puzzles", ADMIN],
  ["get", "/api/v1/puzzles/:name", ADMIN],
  ["patch", "/api/v1/puzzles/:name", ADMIN],
  ["delete", "/api/v1/puzzles/:name", ADMIN],
  ["post", "/api/v1/puzzle-media", ADMIN],
  ["get", "/api/v1/quests", ADMIN],
  ["post", "/api/v1/quests", ADMIN],
  ["get", "/api/v1/quests/:name", QUEST_VIEWER],
  ["patch", "/api/v1/quests/:name", ADMIN],
  ["delete", "/api/v1/quests/:name", ADMIN],
  ["post", "/api/v1/quests/:name/start", ADMIN],
  ["post", "/api/v1/quests/:name/reset", ADMIN],
  ["post", "/api/v1/quests/:name/pause", ADMIN],
  ["post", "/api/v1/quests/:name/resume", ADMIN],
  ["post", "/api/v1/quests/:name/puzzles/:puzzleName/skip", ADMIN],
  ["post", "/api/v1/quests/:name/puzzles/:puzzleName/reset", ADMIN],
  ["get", "/api/v1/quests/:name/puzzles/:puzzleName/qr-code", ADMIN],
  ["get", "/api/v1/quests/:name/events", ADMIN],
  ["post", "/api/v1/quests/:name/text-messages", ADMIN],
  ["post", "/api/v1/twilio/voice", TWILIO],
  ["post", "/api/v1/twilio/messages", TWILIO],

  ["post", "/api/quest/:name/puzzle/:puzzleName/activate", QUEST_PLAYER],
  ["put", "/api/quest/:name/puzzle/:puzzleName/solve", QUEST_PLAYER],
  ["put", "/api/quest/:name/puzzle/:puzzleName/hint", QUEST_PLAYER],

  ["post", "/api/messaging/incoming/voice", TWILIO],
  ["post", "/api/messaging/incoming/text", TWILIO],

  ["get", "/user/register", PUBLIC],
  ["get", "/user/password/forgot", PUBLIC],
  ["get", "/user/password/reset", PUBLIC],
  ["get", "/user/email/verify", PUBLIC],
  ["get", "/user/:userName", SELF_OR_ADMIN],
  ["get", "/user/:userName/edit", SELF_OR_ADMIN],

  ["get", "/puzzle/new", ADMIN],
  ["get", "/puzzle/:name", ADMIN],
  ["get", "/puzzle/:name/edit", ADMIN],

  ["get", "/quest/new", ADMIN],
  ["get", "/quest/:name", QUEST_VIEWER],
  ["get", "/quest/:name/edit", ADMIN],
  ["get", "/quest/:name/puzzle/:puzzleName", QUEST_VIEWER],
  ["get", "/quest/:name/puzzle/:puzzleName/qrcode", ADMIN],
  ["get", "/quest/:name/pdf", ADMIN],

  ["get", "/monitor/quest/:name", PUBLIC],
  ["get", "/monitor/quest/:name/puzzle/:puzzleName", PUBLIC],
];

/** Values for the route parameters: the fixture's quest, puzzle, and team. */
const PARAMS: Record<string, string> = {
  userName: "player",
  name: "quest",
  puzzleName: "riddle",
  teamName: "team-a",
};

/**
 * Bodies for routes that need one to get as far as the authorization
 * decision. Most authorization doesn't depend on the body.
 */
const BODIES: Record<string, object> = {
  "/api/quest/:name/puzzle/:puzzleName/activate": { activationCode: "wrong" },
  "/api/quest/:name/puzzle/:puzzleName/solve": { guess: "wrong" },
  "/api/quest/:name/puzzle/:puzzleName/hint": {},
};

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

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
  // Requests can change or delete things, so each starts from the same data.
  await Promise.all([
    UserModel.deleteMany({}),
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
    SessionModel.deleteMany({}),
  ]);
  await UserModel.create(
    (["admin", "player", "other"] as const).map((userName) => ({
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
  await TeamModel.create({
    teamName: "team-a",
    displayName: "Team A",
    joinCode: "join-a",
    memberIds: await userIdsOf("player"),
  });
  await PuzzleModel.create({
    name: "riddle",
    displayName: "Riddle",
    solutionKeyword: "piano",
    solutionDisplayText: "A piano",
    hints: [{ text: "It makes music", timePenalty: 60 }],
  });
  await QuestService.createQuest({
    name: "quest",
    displayName: "Quest",
    assignee: { kind: "team", name: "team-a" },
    puzzles: [{ puzzleName: "riddle" }],
  });
  await QuestService.startQuest("quest");
  const quest = (await QuestModel.findOne({ name: "quest" }).lean())!;
  await QuestService.activatePuzzle(
    "quest",
    "riddle",
    await assigneeIdsOf("team-a"),
    quest.puzzles[0].activationCode
  );
  sessions = await startSessions("admin", "player", "other");
});

/**
 * Sends a route's request as a role.
 * @param method the HTTP method
 * @param routePath the route's path, with parameters
 * @param role who sends it
 * @returns the response
 */
function send(method: string, routePath: string, role: Role) {
  // Puzzle routes use :name for the puzzle; quest routes, for the quest.
  const isPuzzleRoute = /^\/(api\/(v1\/)?)?puzzles?\//.test(routePath);
  const path = routePath.replace(/:(\w+)/g, (_, name) =>
    name === "name" && isPuzzleRoute ? "riddle" : PARAMS[name]
  );
  const pending = (request(app) as any)[method](path) as request.Test;
  if (role !== "anonymous") {
    pending.set("Authorization", `Bearer ${sessions[role]}`);
  }
  return method === "get" ? pending : pending.send(BODIES[routePath] ?? {});
}

/**
 * Determines the outcome of a response.
 * @param response the response
 * @returns the outcome
 */
function outcomeOf(
  response: request.Response,
  routePath: string
): Outcome | string {
  const isSignInPage =
    routePath !== "/login" && response.text?.includes('src="/script/login.js"');
  if (response.status === 401 || isSignInPage) {
    return "signIn";
  }
  if (response.status === 403) {
    return "deny";
  }
  if (response.status === 404) {
    return "hidden";
  }
  return "allow";
}

describe("the authorization table", () => {
  it("covers every route the application registers", () => {
    const registered = MOUNTS.flatMap(([mount, router]) =>
      router.stack.flatMap((layer) => {
        if (!layer.route) {
          return [];
        }
        // The index router's "/" is the site root; elsewhere a router's "/"
        // would be its mount path.
        const path = `${mount}${layer.route.path}`.replace(/(.)\/$/, "$1");
        return Object.keys((layer.route as any).methods).map(
          (method) => `${method} ${path}`
        );
      })
    );
    const listed = ROUTES.map(([method, path]) => `${method} ${path}`);

    const missing = registered.filter((route) => !listed.includes(route));
    const extra = listed.filter((route) => !registered.includes(route));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
});

describe.each(ROUTES)("%s %s", (method, routePath, policy) => {
  it.each(ROLES.map((role, index) => [role, policy[index]] as const))(
    "as %s: %s",
    async (role, expected) => {
      const response = await send(method, routePath, role);

      expect(
        outcomeOf(response, routePath),
        `${response.status} ${response.text?.slice(0, 200)}`
      ).toBe(expected);
    }
  );
});
