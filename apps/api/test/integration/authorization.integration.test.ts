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
    passwordChangeRateLimiter: passThrough,
    activationRateLimiter: passThrough,
    joinCodeRateLimiter: passThrough,
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
const { AdminRouter } = await import("../../src/routes/admin.js");
const { QuestRouter } = await import("../../src/routes/quest.js");
const { UserRouter } = await import("../../src/routes/user.js");

/** Where createApp mounts each router. */
const MOUNTS: [string, Router][] = [
  ["", IndexRouter],
  ["", AdminRouter],
  ["/api/v1", V1Router],
  ["/user", UserRouter],
  ["/quest", QuestRouter],
];

type Role = "anonymous" | "player" | "other" | "staff" | "admin";

/**
 * What happens to a request:
 * - allow: it gets past authorization (it may still fail for other reasons,
 *   such as a missing body, but not with 401, 403, or 404);
 * - signIn: the visitor must sign in (401, or a redirect to the sign-in page);
 * - deny: forbidden (403);
 * - hidden: the thing exists, but this user can't see it, so it's
 *   reported as not found (404).
 */
type Outcome = "allow" | "signIn" | "deny" | "hidden";

/** The outcome for each role, in the order of ROLES. */
type Policy = [Outcome, Outcome, Outcome, Outcome, Outcome];
const ROLES: Role[] = ["anonymous", "player", "other", "staff", "admin"];

const PUBLIC: Policy = ["allow", "allow", "allow", "allow", "allow"];
const SIGNED_IN: Policy = ["signIn", "allow", "allow", "allow", "allow"];
const ADMIN: Policy = ["signIn", "deny", "deny", "deny", "allow"];
/** Following quests as staff, which administrators may also do. */
const STAFF: Policy = ["signIn", "deny", "deny", "allow", "allow"];
/** For routes about the player's own account (":userName" is "player"). */
const SELF_OR_ADMIN: Policy = ["signIn", "allow", "deny", "deny", "allow"];
const SELF: Policy = ["signIn", "allow", "deny", "deny", "deny"];
/** Viewing the quest assigned to the player's team. */
const QUEST_VIEWER: Policy = ["signIn", "allow", "hidden", "hidden", "allow"];
/** Playing the quest assigned to the player's team. */
const QUEST_PLAYER: Policy = ["signIn", "allow", "deny", "deny", "deny"];
/** Twilio webhooks, which need Twilio's signature, not a user. */
const TWILIO: Policy = ["deny", "deny", "deny", "deny", "deny"];

/** [method, path as registered, policy] for every route. */
const ROUTES: [string, string, Policy][] = [
  ["get", "/", PUBLIC],
  ["get", "/quests", ADMIN],
  ["get", "/puzzles", ADMIN],
  ["get", "/users", ADMIN],
  ["get", "/teams", ADMIN],
  ["get", "/logout", PUBLIC],

  ["get", "/api/v1/openapi.json", PUBLIC],
  ["post", "/api/v1/sessions", PUBLIC],
  ["get", "/api/v1/sessions/current", SIGNED_IN],
  ["delete", "/api/v1/sessions/current", PUBLIC],
  ["get", "/api/v1/users", ADMIN],
  ["post", "/api/v1/users", PUBLIC],
  ["get", "/api/v1/users/:userName", SELF_OR_ADMIN],
  ["get", "/api/v1/users/:userName/quests", SELF_OR_ADMIN],
  ["patch", "/api/v1/users/:userName", SELF_OR_ADMIN],
  ["delete", "/api/v1/users/:userName", SELF_OR_ADMIN],
  ["put", "/api/v1/users/:userName/password", SELF],
  ["post", "/api/v1/users/:userName/teams", SELF_OR_ADMIN],
  ["post", "/api/v1/users/:userName/password-reset-links", ADMIN],
  [
    "post",
    "/api/v1/users/:userName/email-verification-requests",
    SELF_OR_ADMIN,
  ],
  ["post", "/api/v1/password-reset-requests", PUBLIC],
  ["post", "/api/v1/password-resets", PUBLIC],
  ["post", "/api/v1/email-verifications", PUBLIC],
  ["get", "/api/v1/teams", ADMIN],
  ["post", "/api/v1/teams", ADMIN],
  ["get", "/api/v1/teams/:teamName", ADMIN],
  ["patch", "/api/v1/teams/:teamName", ADMIN],
  ["delete", "/api/v1/teams/:teamName", ADMIN],
  ["put", "/api/v1/teams/:teamName/members/:userName", ADMIN],
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
  ["get", "/api/v1/quests/:name/run-book", ADMIN],
  ["get", "/api/v1/staff/quests", STAFF],
  ["get", "/api/v1/quests/:name/staff-view", STAFF],
  ["get", "/api/v1/quests/:name/puzzles/:puzzleName", QUEST_VIEWER],
  ["get", "/api/v1/quests/:name/spectator-view", PUBLIC],
  ["get", "/api/v1/quests/:name/puzzles/:puzzleName/spectator-view", PUBLIC],
  ["post", "/api/v1/quests/:name/puzzles/:puzzleName/activation", QUEST_PLAYER],
  [
    "post",
    "/api/v1/quests/:name/puzzles/:puzzleName/solution-attempts",
    QUEST_PLAYER,
  ],
  ["post", "/api/v1/quests/:name/puzzles/:puzzleName/hints", QUEST_PLAYER],
  ["post", "/api/v1/quests/:name/text-messages", ADMIN],
  ["post", "/api/v1/webhooks/twilio/voice", TWILIO],
  ["post", "/api/v1/webhooks/twilio/messages", TWILIO],

  ["get", "/user/:userName", SELF_OR_ADMIN],
  ["get", "/user/:userName/edit", SELF_OR_ADMIN],

  ["get", "/puzzle/new", ADMIN],
  ["get", "/puzzle/:name", ADMIN],
  ["get", "/puzzle/:name/edit", ADMIN],

  ["get", "/quest/new", ADMIN],
  ["get", "/quest/:name", SIGNED_IN],
  ["get", "/quest/:name/edit", ADMIN],
  ["get", "/quest/:name/puzzle/:puzzleName", SIGNED_IN],
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
  "/api/v1/quests/:name/puzzles/:puzzleName/activation": {
    activationCode: "wrong",
  },
  "/api/v1/quests/:name/puzzles/:puzzleName/solution-attempts": {
    guess: "wrong",
  },
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
    (["admin", "staff", "player", "other"] as const).map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
      authorizationLevel:
        userName === "admin"
          ? AuthorizationLevel.ADMIN
          : userName === "staff"
            ? AuthorizationLevel.STAFF
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
  sessions = await startSessions("admin", "staff", "player", "other");
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
function outcomeOf(response: request.Response): Outcome | string {
  const isSentToSignIn =
    response.status === 302 && response.headers.location?.startsWith("/login?");
  if (response.status === 401 || isSentToSignIn) {
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
        outcomeOf(response),
        `${response.status} ${response.text?.slice(0, 200)}`
      ).toBe(expected);
    }
  );
});
