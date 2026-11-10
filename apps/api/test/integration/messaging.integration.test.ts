// Twilio messaging endpoints, exercised over HTTP through createApp(). The
// incoming webhooks receive the form-encoded fields Twilio sends and answer
// with TwiML. Outgoing texts use the real Twilio client; only its HTTP request
// to the Twilio API is intercepted.
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
import { recordLogs } from "../logs.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";
import { userIdsOf } from "../references.js";
import Twilio from "twilio";

// The service waits between outgoing messages to respect carrier limits.
vi.mock("timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));

const { setTimeout: throttle } = await import("timers/promises");
const { config } = await import("../../src/config.js");
const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel, QuestStatus } =
  await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

const ACCOUNT_SID = `AC${"0".repeat(32)}`;
const MESSAGING_SERVICE_SID = `MG${"1".repeat(32)}`;
const AUTH_TOKEN = "auth-token";
const BASE_URL = "https://puzzlequest.example";

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

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
  vi.clearAllMocks();
  // Needed to check the signatures on incoming webhooks.
  config.PQ_TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  config.PQ_BASE_URL = BASE_URL;
  await Promise.all([
    UserModel.deleteMany({}),
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
  ]);
  await UserModel.create([
    user("player", "+15551230001", { sms: true }),
    user("teammate", "+15551230002", { sms: true }),
    user("quiet", "+15551230003", { sms: false }),
    user("admin", "+15559990000", {
      authorizationLevel: AuthorizationLevel.ADMIN,
    }),
  ]);
  await TeamModel.create({
    teamName: "team-a",
    displayName: "Team A",
    joinCode: "join",
    memberIds: await userIdsOf("teammate", "quiet"),
  });
  await PuzzleModel.create({
    name: "colors",
    displayName: "Colors",
    solutionKeyword: "red",
    solutionDisplayText: "Red",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  config.PQ_TWILIO_AUTH_TOKEN = undefined;
  config.PQ_BASE_URL = undefined;
});

function user(
  userName: string,
  phone: string,
  {
    sms = false,
    authorizationLevel,
  }: { sms?: boolean; authorizationLevel?: number } = {}
) {
  return {
    userName,
    displayName: userName,
    email: `${userName}@example.com`,
    phone,
    sms,
    password: "hash",
    authorizationLevel: authorizationLevel ?? AuthorizationLevel.USER,
  };
}

async function createQuest(
  name: string,
  assigneeName: string,
  kind: "user" | "team" = assigneeName.startsWith("team") ? "team" : "user"
): Promise<void> {
  const result = await QuestService.createQuest({
    name,
    assignee: { kind, name: assigneeName },
    puzzles: [{ puzzleName: "colors" }],
  });
  expect(result.status).toBe("success");
}

async function storedQuest(name: string) {
  return (await QuestModel.findOne({ name }).lean())!;
}

/**
 * Posts form fields to a webhook as Twilio does, signed with the account's
 * auth token over the public URL.
 * @param path the webhook path
 * @param fields the form fields
 * @param signature the signature to send instead of a valid one
 * @returns the request
 */
function sendWebhook(
  path: string,
  fields: Record<string, string>,
  signature = Twilio.getExpectedTwilioSignature(
    AUTH_TOKEN,
    `${BASE_URL}${path}`,
    fields
  )
): request.Test {
  return request(app)
    .post(path)
    .type("form")
    .set("X-Twilio-Signature", signature)
    .send(fields);
}

describe("Twilio webhook signatures", () => {
  const webhooks = [
    ["/api/v1/webhooks/twilio/voice", { From: "+15551230001" }],
    [
      "/api/v1/webhooks/twilio/messages",
      { From: "+15551230001", Body: "Ready" },
    ],
  ] as const;

  beforeEach(async () => {
    await createQuest("player-quest", "player");
  });

  it.each(webhooks)(
    "%s accepts a request signed by Twilio",
    async (path, fields) => {
      const response = await sendWebhook(path, fields);

      expect(response.status).toBe(200);
    }
  );

  it.each(webhooks)("%s rejects an unsigned request", async (path, fields) => {
    const logs = recordLogs();
    const response = await request(app).post(path).type("form").send(fields);

    expect(response.status).toBe(403);
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: "warn",
        event: "webhook-refused",
        reason: "bad-signature",
      })
    );
    // Not the caller's number.
    expect(JSON.stringify(logs)).not.toContain(fields.From);
    // A bare refusal, which tells the sender nothing.
    expect(response.text).toBe("Forbidden");
    // A forged call must not start the caller's quests.
    expect((await storedQuest("player-quest")).entries[0]!.status).toBe(
      QuestStatus.NOT_STARTED
    );
  });

  it.each(webhooks)(
    "%s rejects a request signed with another auth token",
    async (path, fields) => {
      const signature = Twilio.getExpectedTwilioSignature(
        "another-token",
        `${BASE_URL}${path}`,
        fields
      );

      const response = await sendWebhook(path, fields, signature);

      expect(response.status).toBe(403);
    }
  );

  it.each(webhooks)(
    "%s rejects a request whose fields were changed after signing",
    async (path, fields) => {
      const signature = Twilio.getExpectedTwilioSignature(
        AUTH_TOKEN,
        `${BASE_URL}${path}`,
        fields
      );

      const response = await request(app)
        .post(path)
        .type("form")
        .set("X-Twilio-Signature", signature)
        .send({ ...fields, From: "+15551230002" });

      expect(response.status).toBe(403);
    }
  );

  it.each(webhooks)(
    "%s rejects every request when the auth token is not configured",
    async (path, fields) => {
      const signature = Twilio.getExpectedTwilioSignature(
        AUTH_TOKEN,
        `${BASE_URL}${path}`,
        fields
      );
      config.PQ_TWILIO_AUTH_TOKEN = undefined;

      const response = await sendWebhook(path, fields, signature);

      expect(response.status).toBe(403);
    }
  );
});

describe("POST /api/v1/webhooks/twilio/voice", () => {
  function call(from?: string): request.Test {
    return sendWebhook(
      "/api/v1/webhooks/twilio/voice",
      from === undefined ? {} : { From: from }
    );
  }

  it("greets a known caller and starts their quests that are waiting", async () => {
    await createQuest("player-quest", "player");
    await createQuest("team-quest", "team-a");
    await createQuest("running-quest", "player");
    await QuestService.startQuest("running-quest");

    const response = await call("+15551230001");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/xml");
    expect(response.text).toMatch(
      /^<\?xml version="1.0" encoding="UTF-8"\?><Response><Say voice="Polly.Emma" language="en-GB">Congratulations! You have reached the puzzle master. Your quest starts now\./
    );
    // Quests are started after the response is sent.
    await vi.waitFor(async () => {
      expect((await storedQuest("player-quest")).entries[0]!.status).toBe(
        QuestStatus.IN_PROGRESS
      );
    });
    expect((await storedQuest("team-quest")).entries[0]!.status).toBe(
      QuestStatus.NOT_STARTED
    );
  });

  it("starts a team's quest when a member calls", async () => {
    await createQuest("team-quest", "team-a");

    await call("+15551230002");

    await vi.waitFor(async () => {
      expect((await storedQuest("team-quest")).entries[0]!.status).toBe(
        QuestStatus.IN_PROGRESS
      );
    });
  });

  it("tells a known caller with no waiting quests so", async () => {
    const response = await call("+15551230001");

    expect(response.text).toContain(
      "The puzzle master says you have no quests waiting to start."
    );
  });

  it("rejects calls from unknown numbers", async () => {
    const response = await call("+15550000000");

    expect(response.text).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>'
    );
  });

  it("asks callers with a hidden number to contact an administrator", async () => {
    const response = await call("");

    expect(response.text).toContain("you have hidden your phone number");
  });
});

describe("POST /api/v1/webhooks/twilio/messages", () => {
  function text(from: string, body: string): request.Test {
    return sendWebhook("/api/v1/webhooks/twilio/messages", {
      From: from,
      Body: body,
    });
  }

  beforeEach(async () => {
    await createQuest("player-quest", "player");
    await QuestService.startQuest("player-quest");
    await QuestService.setExpectedTextResponse(
      "player-quest",
      "Ready",
      "Your next clue is under the mat."
    );
  });

  it("confirms the expected reply, once", async () => {
    const response = await text("+15551230001", "  READY ");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/xml");
    expect(response.text).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>From the PuzzleQuest Game\n\nYour next clue is under the mat.\n\nReply \'STOP\' to unsubscribe</Message></Response>'
    );
    expect((await storedQuest("player-quest")).entries[0]!.textResponse).toBe(
      ""
    );
  });

  it("tells the player when the reply is wrong, and keeps waiting", async () => {
    const response = await text("+15551230001", "not yet");

    expect(response.text).toContain("Your response was incorrect.");
    expect((await storedQuest("player-quest")).entries[0]!.textResponse).toBe(
      "Ready"
    );
  });

  it("tells a player with no expected reply that none is expected", async () => {
    await text("+15551230001", "ready");

    const response = await text("+15551230001", "ready");

    expect(response.text).toContain(
      "The PuzzleMaster is not expecting to hear from you at this time."
    );
  });

  it("tells unknown numbers they are not registered", async () => {
    const response = await text("+15550000000", "hello");

    expect(response.text).toContain(
      "You are not a registered user of this service"
    );
  });
});

describe("POST /api/v1/quests/{name}/text-messages", () => {
  let twilioRequests: { data?: unknown }[];

  let adminToken = "";

  beforeEach(async () => {
    config.PQ_TWILIO_ACCOUNT_SID = ACCOUNT_SID;
    config.PQ_TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    config.PQ_TWILIO_MESSAGING_SERVICE_ID = MESSAGING_SERVICE_SID;
    twilioRequests = [];
    vi.spyOn(Twilio.RequestClient.prototype, "request").mockImplementation(
      async (options) => {
        twilioRequests.push(options);
        return {
          statusCode: 201,
          body: JSON.stringify({
            sid: `SM${"2".repeat(32)}`,
            status: "queued",
          }),
          headers: {},
        };
      }
    );
    adminToken = (await startSessions("admin")).admin;
  });

  afterEach(() => {
    config.PQ_TWILIO_ACCOUNT_SID = undefined;
    config.PQ_TWILIO_AUTH_TOKEN = undefined;
    config.PQ_TWILIO_MESSAGING_SERVICE_ID = undefined;
  });

  function send({
    questName,
    ...body
  }: { questName: string } & Record<string, string>): request.Test {
    return request(app)
      .post(`/api/v1/quests/${questName}/text-messages`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);
  }

  it("texts each team member who accepts texts, through the Twilio API", async () => {
    await createQuest("team-quest", "team-a");
    await QuestService.startQuest("team-quest");

    const response = await send({
      questName: "team-quest",
      message: "Check the garden.",
      expectedResponse: "Found it",
      responseConfirmation: "Well done!",
    });

    expect(response.status).toBe(204);
    expect(twilioRequests).toHaveLength(1);
    expect(twilioRequests[0]).toMatchObject({
      method: "post",
      uri: `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      username: ACCOUNT_SID,
      password: "auth-token",
      data: {
        To: "+15551230002",
        MessagingServiceSid: MESSAGING_SERVICE_SID,
        Body: "From the PuzzleQuest Game Check the garden.\n\nReply 'STOP' to unsubscribe",
      },
    });
    expect(throttle).toHaveBeenCalledWith(5000);
    expect((await storedQuest("team-quest")).entries[0]).toMatchObject({
      textResponse: "Found it",
      textResponseConfirmation: "Well done!",
    });
  });

  it("texts the team's members, even when a user has the team's name", async () => {
    // Names alone couldn't tell these apart; the quest refers to the team.
    await UserModel.create(user("team-a", "+15551230009", { sms: true }));
    await createQuest("team-quest", "team-a", "team");
    await QuestService.startQuest("team-quest");

    const response = await send({
      questName: "team-quest",
      message: "Check the garden.",
      expectedResponse: "Found it",
      responseConfirmation: "Well done!",
    });

    expect(response.status).toBe(204);
    expect(
      twilioRequests.map((sent) => (sent.data as { To: string }).To)
    ).toEqual(["+15551230002"]);
  });

  it("reports that the team a quest is assigned to no longer exists", async () => {
    await createQuest("team-quest", "team-a");
    await QuestService.startQuest("team-quest");
    await TeamModel.deleteMany({});

    const response = await send({
      questName: "team-quest",
      message: "Check the garden.",
      expectedResponse: "Found it",
      responseConfirmation: "Well done!",
    });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.text).detail).toBe(
      "The team this quest is assigned to no longer exists"
    );
    expect(twilioRequests).toHaveLength(0);
  });

  it("reports a Twilio API error without its details, which it logs", async () => {
    const logs = recordLogs();
    await createQuest("player-quest", "player");
    await QuestService.startQuest("player-quest");
    vi.mocked(Twilio.RequestClient.prototype.request).mockResolvedValue({
      statusCode: 400,
      body: JSON.stringify({
        code: 21211,
        message: "The 'To' number is not a valid phone number.",
        status: 400,
      }),
      headers: {},
    });

    const response = await send({ questName: "player-quest", message: "Hi" });

    expect(response.status).toBe(502);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/messaging-failed",
      detail: "An unexpected error occurred",
    });
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: "error",
        msg: "sendOutgoingTextMessage failed",
        err: expect.objectContaining({
          message: "The 'To' number is not a valid phone number.",
        }),
      })
    );
  });

  it("refuses when no one on the quest accepts texts", async () => {
    await createQuest("quiet-quest", "quiet");
    await QuestService.startQuest("quiet-quest");

    const response = await send({
      questName: "quiet-quest",
      message: "Hi",
      expectedResponse: "Found it",
      responseConfirmation: "Well done!",
    });

    expect(response.status).toBe(409);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/no-recipients",
      detail: "No users accepting text messages found for quest",
    });
    expect(twilioRequests).toHaveLength(0);
    // Nothing was sent, so the quest isn't waiting for a reply to it.
    expect((await storedQuest("quiet-quest")).entries[0]!.textResponse).toBe(
      ""
    );
  });

  it("refuses a quest that is not in progress", async () => {
    await createQuest("player-quest", "player");

    const response = await send({ questName: "player-quest", message: "Hi" });

    expect(response.status).toBe(409);
    expect(JSON.parse(response.text).type).toBe("/problems/wrong-state");
    expect(twilioRequests).toHaveLength(0);
  });

  it("refuses a reply to wait for without a confirmation to send back", async () => {
    await createQuest("player-quest", "player");
    await QuestService.startQuest("player-quest");

    const response = await send({
      questName: "player-quest",
      message: "Hi",
      expectedResponse: "Found it",
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.text).errors).toEqual([
      {
        path: "body.responseConfirmation",
        message: "A reply to wait for needs a confirmation to send back",
      },
    ]);
  });
});
