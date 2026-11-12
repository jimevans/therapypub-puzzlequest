// The puzzle master's messages and challenges reaching players who have the
// app (decision 0025): sent from the console, shown in the quest, sent as push
// notifications, kept to send again, and answered in the app or by text. Push
// notifications go to a fake sender; texts to Twilio's API, intercepted.
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
import Twilio from "twilio";
import type { PushSender } from "../../src/push/types.js";
import { startSessions } from "../sessions.js";

// The service waits between outgoing texts to respect carrier limits.
vi.mock("timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));

const { config } = await import("../../src/config.js");
const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { SessionModel } = await import("../../src/models/session.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const SessionService = await import("../../src/services/session.service.js");
const PushService = await import("../../src/services/push.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let tokens: Record<string, string>;
/** The numbers texted, in order. */
let texted: string[];
let pushSender: {
  send: ReturnType<typeof vi.fn<PushSender["send"]>>;
  close: () => void;
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await SessionModel.init();
  app = createApp();
}, 120000);

afterAll(async () => {
  PushService.setPushSenders(undefined);
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
    SessionModel.deleteMany({}),
  ]);
  // Ann has the app and accepts texts; Bob accepts texts but hasn't the
  // app; Cat has the app and doesn't accept texts. Ann and Bob are a team.
  await UserModel.create([
    user("ann", "+15551230001", true),
    user("bob", "+15551230002", true),
    user("cat", "+15551230003", false),
    {
      ...user("admin", "+15559990000", false),
      authorizationLevel: AuthorizationLevel.ADMIN,
    },
  ]);
  const members = await UserModel.find({ userName: { $in: ["ann", "bob"] } });
  await TeamModel.create({
    teamName: "harbor",
    displayName: "Harbor",
    joinCode: "join",
    memberIds: members.map((member) => member._id),
  });
  await PuzzleModel.create({
    name: "colors",
    displayName: "Colors",
    solutionKeyword: "red",
    solutionDisplayText: "Red",
  });
  await QuestService.createQuest({
    name: "walk",
    displayName: "Harbor walk",
    entrants: [
      { kind: "team", name: "harbor" },
      { kind: "user", name: "cat" },
    ],
    puzzles: [{ puzzleName: "colors" }],
  });
  await QuestService.startQuest("walk");

  tokens = await startSessions("ann", "bob", "cat", "admin");
  pushSender = {
    send: vi.fn<PushSender["send"]>(async () => "sent"),
    close() {},
  };
  PushService.setPushSenders({ ios: pushSender });
  for (const name of ["ann", "cat"]) {
    await SessionService.setPushTarget(tokens[name], {
      platform: "ios",
      token: `${name}-phone`,
      environment: "production",
    });
  }

  config.PQ_TWILIO_ACCOUNT_SID = `AC${"0".repeat(32)}`;
  config.PQ_TWILIO_AUTH_TOKEN = "auth-token";
  config.PQ_TWILIO_MESSAGING_SERVICE_ID = `MG${"1".repeat(32)}`;
  texted = [];
  vi.spyOn(Twilio.RequestClient.prototype, "request").mockImplementation(
    async (options) => {
      texted.push((options.data as { To: string }).To);
      return {
        statusCode: 201,
        body: JSON.stringify({ sid: `SM${"2".repeat(32)}` }),
        headers: {},
      };
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  config.PQ_TWILIO_ACCOUNT_SID = undefined;
  config.PQ_TWILIO_AUTH_TOKEN = undefined;
  config.PQ_TWILIO_MESSAGING_SERVICE_ID = undefined;
});

function user(userName: string, phone: string, sms: boolean) {
  return {
    userName,
    displayName: userName,
    email: `${userName}@example.com`,
    phone,
    sms,
    password: "hash",
  };
}

/**
 * Makes a request as one of the users.
 * @param name the user
 * @param method the method
 * @param path the path below /api/v1
 * @param body the body, if any
 * @returns the response
 */
function as(
  name: string,
  method: "get" | "post" | "patch",
  path: string,
  body?: object
) {
  const pending = request(app)
    [method](`/api/v1${path}`)
    .set("Authorization", `Bearer ${tokens[name]}`);
  return body ? pending.send(body) : pending;
}

const challenge = {
  message: "What has keys but opens no locks?",
  expectedResponse: "piano",
  responseConfirmation: "Correct! Show this to the bartender.",
};

/** The phones a push notification went to, and what each said. */
function pushed() {
  return pushSender.send.mock.calls.map(([target, notification]) => ({
    to: target.token,
    ...notification,
  }));
}

/** The player's own entry, as the quest shows it to them. */
async function ownEntry(name: string) {
  const response = await as(name, "get", "/quests/walk");
  expect(response.status).toBe(200);
  return response.body.entries[0];
}

describe("sending a challenge", () => {
  it("shows it to the team in the app, sends it to the app's phones, and texts everyone who accepts texts", async () => {
    const response = await as(
      "admin",
      "post",
      "/quests/walk/teams/harbor/text-messages",
      challenge
    );

    expect(response.status).toBe(204);
    expect(texted).toEqual(["+15551230001", "+15551230002"]);
    await vi.waitFor(() =>
      expect(pushed()).toEqual([
        {
          to: "ann-phone",
          category: "message",
          questName: "walk",
          title: "Harbor walk",
          body: challenge.message,
        },
      ])
    );
    for (const name of ["ann", "bob"]) {
      const entry = await ownEntry(name);
      expect(entry.messages).toEqual([
        {
          text: challenge.message,
          sentAt: expect.any(String),
          challenge: true,
        },
      ]);
      expect(entry.challenge).toEqual({
        challengeId: expect.any(String),
        message: challenge.message,
        sentAt: expect.any(String),
        answeredAt: null,
        answeredVia: null,
      });
    }
    // Not to the other entry.
    expect((await ownEntry("cat")).messages).toEqual([]);
  });

  it("doesn't text players who have the app, once the quest says not to", async () => {
    const changed = await as("admin", "patch", "/quests/walk", {
      textPlayersWithApp: false,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.textPlayersWithApp).toBe(false);

    await as(
      "admin",
      "post",
      "/quests/walk/teams/harbor/text-messages",
      challenge
    );

    expect(texted).toEqual(["+15551230002"]);
    await vi.waitFor(() =>
      expect(pushed().map(({ to }) => to)).toEqual(["ann-phone"])
    );
  });

  it("texts a player whose app doesn't take the puzzle master's messages", async () => {
    await as("admin", "patch", "/quests/walk", { textPlayersWithApp: false });
    await SessionService.setPushTarget(tokens.ann, {
      platform: "ios",
      token: "ann-phone",
      environment: "production",
      categories: ["questStarted"],
    });

    await as(
      "admin",
      "post",
      "/quests/walk/teams/harbor/text-messages",
      challenge
    );

    expect(texted).toEqual(["+15551230001", "+15551230002"]);
    expect(pushSender.send).not.toHaveBeenCalled();
  });

  it("reaches a player who has the app but doesn't accept texts", async () => {
    const response = await as(
      "admin",
      "post",
      "/quests/walk/players/cat/text-messages",
      {
        message: "Nearly there.",
      }
    );

    expect(response.status).toBe(204);
    expect(texted).toEqual([]);
    await vi.waitFor(() =>
      expect(pushed().map(({ to }) => to)).toEqual(["cat-phone"])
    );
    const entry = await ownEntry("cat");
    expect(entry.messages).toEqual([
      { text: "Nearly there.", sentAt: expect.any(String), challenge: false },
    ]);
    expect(entry.challenge).toBeNull();
  });

  it("sends every entry in progress the same challenge", async () => {
    await as("admin", "post", "/quests/walk/text-messages", challenge);

    expect(texted).toEqual(["+15551230001", "+15551230002"]);
    await vi.waitFor(() =>
      expect(
        pushed()
          .map(({ to }) => to)
          .sort()
      ).toEqual(["ann-phone", "cat-phone"])
    );
    const ids = [
      (await ownEntry("ann")).challenge.challengeId,
      (await ownEntry("cat")).challenge.challengeId,
    ];
    expect(ids[0]).toBe(ids[1]);
  });

  it("keeps each challenge with the quest once, to send again with one tap", async () => {
    await as(
      "admin",
      "post",
      "/quests/walk/teams/harbor/text-messages",
      challenge
    );
    await as(
      "admin",
      "post",
      "/quests/walk/teams/harbor/text-messages",
      challenge
    );
    await as("admin", "post", "/quests/walk/teams/harbor/text-messages", {
      message: "Just a note.",
    });

    const listed = await as("admin", "get", "/quests/walk/challenges");

    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({
      challenges: [
        {
          challengeId: expect.any(String),
          ...challenge,
          createdAt: expect.any(String),
        },
      ],
    });

    const sentAgain = await as(
      "admin",
      "post",
      "/quests/walk/players/cat/text-messages",
      {
        challengeId: listed.body.challenges[0].challengeId,
      }
    );

    expect(sentAgain.status).toBe(204);
    expect((await ownEntry("cat")).challenge).toMatchObject({
      challengeId: listed.body.challenges[0].challengeId,
      message: challenge.message,
    });
  });

  it("isn't found for a challenge the quest hasn't kept", async () => {
    const response = await as(
      "admin",
      "post",
      "/quests/walk/players/cat/text-messages",
      {
        challengeId: "000000000000000000000000",
      }
    );

    expect(response.status).toBe(404);
    expect(response.body.type).toBe("/problems/not-found");
  });

  it("lists no challenges for a quest that doesn't exist", async () => {
    const response = await as("admin", "get", "/quests/nowhere/challenges");

    expect(response.status).toBe(404);
  });

  it.each([
    ["nothing to send", {}, "body.message"],
    [
      "a kept challenge with a message too",
      { challengeId: "000000000000000000000000", message: "Hi" },
      "body.challengeId",
    ],
    [
      "an answer with no keywords",
      { message: "Hi", expectedResponse: " , ", responseConfirmation: "Yes" },
      "body.expectedResponse",
    ],
  ])("refuses %s", async (_, body, path) => {
    const response = await as(
      "admin",
      "post",
      "/quests/walk/players/cat/text-messages",
      body
    );

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([expect.objectContaining({ path })]);
  });
});

describe("answering a challenge in the app", () => {
  beforeEach(async () => {
    await as(
      "admin",
      "post",
      "/quests/walk/teams/harbor/text-messages",
      challenge
    );
  });

  const answer = (name: string, text: string) =>
    as(name, "post", "/quests/walk/challenge/answers", { answer: text });

  it("gives the confirmation for an answer with every keyword, for the whole team", async () => {
    const wrong = await answer("bob", "an organ");
    expect(wrong.status).toBe(422);
    expect(wrong.body.type).toBe("/problems/wrong-answer");

    const right = await answer("bob", "It's a Piano!");

    expect(right.status).toBe(200);
    expect(right.body).toEqual({
      confirmation: challenge.responseConfirmation,
      answeredAt: expect.any(String),
    });
    // Ann sees it answered, with the confirmation to show.
    expect((await ownEntry("ann")).challenge).toMatchObject({
      answeredAt: right.body.answeredAt,
      answeredVia: "app",
      confirmation: challenge.responseConfirmation,
    });
    // And can't answer it again.
    const again = await answer("ann", "piano");
    expect(again.status).toBe(409);
    expect(again.body.type).toBe("/problems/wrong-state");
  });

  it("is refused when no challenge was sent", async () => {
    const response = await answer("cat", "piano");

    expect(response.status).toBe(409);
    expect(response.body.type).toBe("/problems/wrong-state");
  });

  it("is refused for a quest the player doesn't play, or that doesn't exist", async () => {
    await UserModel.create(user("dan", "+15551230004", false));
    tokens.dan = (await startSessions("dan")).dan;

    expect((await answer("dan", "piano")).status).toBe(403);
    expect(
      (
        await as("ann", "post", "/quests/nowhere/challenge/answers", {
          answer: "piano",
        })
      ).status
    ).toBe(404);
  });

  it("is refused once the quest is no longer in progress", async () => {
    await QuestService.skipQuestPuzzle("walk", "colors");

    const response = await answer("ann", "piano");

    expect(response.status).toBe(409);
    expect(response.body.type).toBe("/problems/wrong-state");
  });
});

describe("resetting an entry", () => {
  it("clears its messages and challenge", async () => {
    await as(
      "admin",
      "post",
      "/quests/walk/teams/harbor/text-messages",
      challenge
    );

    await QuestService.resetQuest("walk");
    await QuestService.startQuest("walk");

    const entry = await ownEntry("ann");
    expect(entry.messages).toEqual([]);
    expect(entry.challenge).toBeNull();
  });
});
