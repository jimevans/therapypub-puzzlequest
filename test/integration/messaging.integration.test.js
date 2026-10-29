// Twilio messaging endpoints, exercised over HTTP through createApp(). The
// incoming webhooks receive the form-encoded fields Twilio sends and answer
// with TwiML. Outgoing texts use the real Twilio client; only its HTTP request
// to the Twilio API is intercepted.
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

// The service waits between outgoing messages to respect carrier limits.
vi.mock("timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));

const jwt = (await import("jsonwebtoken")).default;
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

let mongoServer;
let app;

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
  await Promise.all([
    UserModel.deleteMany({}),
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
  ]);
  await UserModel.create([
    user("player", "5551230001", { sms: true }),
    user("teammate", "5551230002", { sms: true }),
    user("quiet", "5551230003", { sms: false }),
    user("admin", "5559990000", {
      authorizationLevel: AuthorizationLevel.ADMIN,
    }),
  ]);
  await TeamModel.create({
    teamName: "team-a",
    displayName: "Team A",
    joinCode: "join",
    memberNames: ["teammate", "quiet"],
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
});

function user(userName, phone, { sms = false, authorizationLevel } = {}) {
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

async function createQuest(name, userName) {
  await QuestService.createQuest({
    name,
    userName,
    puzzles: [{ puzzleName: "colors" }],
  });
}

function storedQuest(name) {
  return QuestModel.findOne({ name }).lean();
}

describe("POST /api/messaging/incoming/voice", () => {
  function call(from) {
    return request(app)
      .post("/api/messaging/incoming/voice")
      .type("form")
      .send(from === undefined ? {} : { From: from });
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
      expect((await storedQuest("player-quest")).status).toBe(
        QuestStatus.IN_PROGRESS
      );
    });
    expect((await storedQuest("team-quest")).status).toBe(
      QuestStatus.NOT_STARTED
    );
  });

  it("starts a team's quest when a member calls", async () => {
    await createQuest("team-quest", "team-a");

    await call("+15551230002");

    await vi.waitFor(async () => {
      expect((await storedQuest("team-quest")).status).toBe(
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

describe("POST /api/messaging/incoming/text", () => {
  function text(from, body) {
    return request(app)
      .post("/api/messaging/incoming/text")
      .type("form")
      .send({ From: from, Body: body });
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
    expect((await storedQuest("player-quest")).textResponse).toBe("");
  });

  it("tells the player when the reply is wrong, and keeps waiting", async () => {
    const response = await text("+15551230001", "not yet");

    expect(response.text).toContain("Your response was incorrect.");
    expect((await storedQuest("player-quest")).textResponse).toBe("Ready");
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

describe("POST /api/messaging/outgoing/text", () => {
  let twilioRequests;

  beforeEach(() => {
    config.PQ_TWILIO_ACCOUNT_SID = ACCOUNT_SID;
    config.PQ_TWILIO_AUTH_TOKEN = "auth-token";
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
    jwt.verify.mockReturnValue({
      userName: "admin",
      displayName: "admin",
      authorizationLevel: AuthorizationLevel.ADMIN,
      iat: Math.floor(Date.now() / 1000),
    });
  });

  afterEach(() => {
    config.PQ_TWILIO_ACCOUNT_SID = undefined;
    config.PQ_TWILIO_AUTH_TOKEN = undefined;
    config.PQ_TWILIO_MESSAGING_SERVICE_ID = undefined;
  });

  function send(body) {
    return request(app)
      .post("/api/messaging/outgoing/text")
      .set("Authorization", "Bearer token")
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

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toEqual({ status: "success" });
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
    expect(await storedQuest("team-quest")).toMatchObject({
      textResponse: "Found it",
      textResponseConfirmation: "Well done!",
    });
  });

  it("reports a Twilio API error", async () => {
    await createQuest("player-quest", "player");
    await QuestService.startQuest("player-quest");
    Twilio.RequestClient.prototype.request.mockResolvedValue({
      statusCode: 400,
      body: JSON.stringify({
        code: 21211,
        message: "The 'To' number is not a valid phone number.",
        status: 400,
      }),
      headers: {},
    });

    const response = await send({ questName: "player-quest", message: "Hi" });

    expect(response.status).toBe(500);
    expect(JSON.parse(response.text).message).toContain(
      "The 'To' number is not a valid phone number."
    );
  });

  it("refuses when no one on the quest accepts texts", async () => {
    await createQuest("quiet-quest", "quiet");
    await QuestService.startQuest("quiet-quest");

    const response = await send({ questName: "quiet-quest", message: "Hi" });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.text).message).toBe(
      "No users accepting text messages found for quest"
    );
    expect(twilioRequests).toHaveLength(0);
  });

  it("refuses a quest that is not in progress", async () => {
    await createQuest("player-quest", "player");

    const response = await send({ questName: "player-quest", message: "Hi" });

    expect(response.status).toBe(400);
    expect(twilioRequests).toHaveLength(0);
  });
});
