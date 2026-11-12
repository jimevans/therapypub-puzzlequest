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
import { recordLogs } from "../logs.js";
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
    passwordResetRequestRateLimiter: passThrough,
    passwordResetRequestAddressRateLimiter: passThrough,
    passwordResetRateLimiter: passThrough,
    passwordChangeRateLimiter: passThrough,
    activationRateLimiter: passThrough,
    joinCodeRateLimiter: passThrough,
    solutionRateLimiter: passThrough,
    liveTicketRateLimiter: passThrough,
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
const { HealthRouter } = await import("../../src/routes/health.js");
const { ApiReferenceRouter } = await import("../../src/routes/apiReference.js");
const { V1Router } = await import("../../src/api/v1/index.js");
const { AdminRouter } = await import("../../src/routes/admin.js");
const { QuestRouter } = await import("../../src/routes/quest.js");
const { UserRouter } = await import("../../src/routes/user.js");

/** Where createApp mounts each router. */
const MOUNTS: [string, Router][] = [
  ["", IndexRouter],
  ["", AdminRouter],
  ["", HealthRouter],
  ["/api/v1/docs", ApiReferenceRouter],
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
/** Managing a quest's share links, for its players and staff. */
const QUEST_MEMBER: Policy = ["signIn", "allow", "hidden", "allow", "allow"];
/** Revoking a link that doesn't exist; revoking itself has its own tests. */
const NO_SUCH_LINK: Policy = ["signIn", "hidden", "hidden", "hidden", "hidden"];
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
  ["get", "/healthz", PUBLIC],

  ["get", "/api/v1/docs", PUBLIC],
  ["get", "/api/v1/docs/swagger-ui.css", PUBLIC],
  ["get", "/api/v1/docs/swagger-ui-bundle.js", PUBLIC],

  ["get", "/api/v1/openapi.json", PUBLIC],
  ["post", "/api/v1/sessions", PUBLIC],
  ["get", "/api/v1/sessions/current", SIGNED_IN],
  ["delete", "/api/v1/sessions/current", PUBLIC],
  ["put", "/api/v1/sessions/current/push-target", SIGNED_IN],
  ["delete", "/api/v1/sessions/current/push-target", SIGNED_IN],
  ["get", "/api/v1/users", ADMIN],
  ["post", "/api/v1/users", PUBLIC],
  ["get", "/api/v1/users/:userName", SELF_OR_ADMIN],
  ["get", "/api/v1/users/:userName/quests", SELF_OR_ADMIN],
  ["post", "/api/v1/users/:userName/live-tickets", SELF_OR_ADMIN],
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
  ["get", "/api/v1/puzzles/:puzzleName", ADMIN],
  ["patch", "/api/v1/puzzles/:puzzleName", ADMIN],
  ["delete", "/api/v1/puzzles/:puzzleName", ADMIN],
  ["post", "/api/v1/puzzle-media", ADMIN],
  ["get", "/api/v1/quests", ADMIN],
  ["post", "/api/v1/quests", ADMIN],
  ["get", "/api/v1/quests/:questName", QUEST_VIEWER],
  ["patch", "/api/v1/quests/:questName", ADMIN],
  ["delete", "/api/v1/quests/:questName", ADMIN],
  ["post", "/api/v1/quests/:questName/start", ADMIN],
  ["post", "/api/v1/quests/:questName/reset", ADMIN],
  ["post", "/api/v1/quests/:questName/pause", ADMIN],
  ["post", "/api/v1/quests/:questName/resume", ADMIN],
  ["post", "/api/v1/quests/:questName/teams/:teamName/start", ADMIN],
  ["post", "/api/v1/quests/:questName/teams/:teamName/reset", ADMIN],
  ["post", "/api/v1/quests/:questName/teams/:teamName/pause", ADMIN],
  ["post", "/api/v1/quests/:questName/teams/:teamName/resume", ADMIN],
  [
    "post",
    "/api/v1/quests/:questName/teams/:teamName/puzzles/:puzzleName/skip",
    ADMIN,
  ],
  [
    "post",
    "/api/v1/quests/:questName/teams/:teamName/puzzles/:puzzleName/reset",
    ADMIN,
  ],
  ["post", "/api/v1/quests/:questName/text-messages", ADMIN],
  ["post", "/api/v1/quests/:questName/teams/:teamName/text-messages", ADMIN],
  ["post", "/api/v1/quests/:questName/players/:userName/start", ADMIN],
  ["post", "/api/v1/quests/:questName/players/:userName/reset", ADMIN],
  ["post", "/api/v1/quests/:questName/players/:userName/pause", ADMIN],
  ["post", "/api/v1/quests/:questName/players/:userName/resume", ADMIN],
  [
    "post",
    "/api/v1/quests/:questName/players/:userName/puzzles/:puzzleName/skip",
    ADMIN,
  ],
  [
    "post",
    "/api/v1/quests/:questName/players/:userName/puzzles/:puzzleName/reset",
    ADMIN,
  ],
  ["post", "/api/v1/quests/:questName/players/:userName/text-messages", ADMIN],
  ["get", "/api/v1/quests/:questName/puzzles/:puzzleName/qr-code", STAFF],
  ["get", "/api/v1/quests/:questName/events", ADMIN],
  ["get", "/api/v1/quests/:questName/run-book", ADMIN],
  ["get", "/api/v1/quests/:questName/qr-cards", ADMIN],
  ["get", "/api/v1/staff/quests", STAFF],
  ["get", "/api/v1/quests/:questName/staff-view", STAFF],
  ["get", "/api/v1/quests/:questName/puzzles/:puzzleName", QUEST_VIEWER],
  ["post", "/api/v1/quests/:questName/live-tickets", PUBLIC],
  ["get", "/api/v1/quests/:questName/share-links", QUEST_MEMBER],
  ["post", "/api/v1/quests/:questName/share-links", QUEST_MEMBER],
  ["delete", "/api/v1/quests/:questName/share-links/:linkId", NO_SUCH_LINK],
  ["get", "/api/v1/quests/:questName/spectator-view", PUBLIC],
  [
    "get",
    "/api/v1/quests/:questName/puzzles/:puzzleName/spectator-view",
    PUBLIC,
  ],
  [
    "post",
    "/api/v1/quests/:questName/puzzles/:puzzleName/activation",
    QUEST_PLAYER,
  ],
  [
    "post",
    "/api/v1/quests/:questName/puzzles/:puzzleName/solution-attempts",
    QUEST_PLAYER,
  ],
  ["post", "/api/v1/quests/:questName/puzzles/:puzzleName/hints", QUEST_PLAYER],
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
  // The pages' addresses still name the quest :name.
  name: "quest",
  questName: "quest",
  puzzleName: "riddle",
  teamName: "team-a",
  linkId: "000000000000000000000000",
};

/**
 * Bodies for routes that need one to get as far as the authorization
 * decision. Most authorization doesn't depend on the body.
 */
const BODIES: Record<string, object> = {
  "/api/v1/quests/:questName/share-links": { label: "A link" },
  "/api/v1/quests/:questName/puzzles/:puzzleName/activation": {
    activationCode: "wrong",
  },
  "/api/v1/quests/:questName/puzzles/:puzzleName/solution-attempts": {
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
    (["admin", "staff", "player", "other", "solo"] as const).map(
      (userName) => ({
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
      })
    )
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
    // A second entrant, playing on their own, for the per-player routes.
    entrants: [
      { kind: "team", name: "team-a" },
      { kind: "user", name: "solo" },
    ],
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
  // The puzzle pages use :name for the puzzle; the quest pages, for the
  // quest.
  const isPuzzleRoute = /^\/(api\/(v1\/)?)?puzzles?\//.test(routePath);
  // A quest's per-player routes name the quest's player entrant.
  const isEntrantRoute = routePath.includes("/players/:userName");
  const path = routePath.replace(/:(\w+)/g, (_, name) =>
    name === "name" && isPuzzleRoute
      ? "riddle"
      : name === "userName" && isEntrantRoute
        ? "solo"
        : PARAMS[name]
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
      const logs = recordLogs();
      const response = await send(method, routePath, role);

      expect(
        outcomeOf(response),
        `${response.status} ${response.text?.slice(0, 200)}`
      ).toBe(expected);
      // A refusal is a security event: logged by who was refused, or for a
      // webhook, as one refused.
      if (expected === "deny") {
        expect(logs).toContainEqual(
          routePath.includes("/webhooks/")
            ? expect.objectContaining({ event: "webhook-refused" })
            : expect.objectContaining({
                level: "warn",
                event: "forbidden",
                userId: expect.any(String),
              })
        );
      }
    }
  );
});
