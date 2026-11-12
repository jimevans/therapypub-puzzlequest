// Registering phones for push notifications with a session, and sending to
// them, through the whole application with fake senders in place of Apple's
// and Google's services.
import type { Express } from "express";
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
import type { PushSender } from "../../src/push/types.js";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { SessionModel } = await import("../../src/models/session.model.js");
const { UserModel } = await import("../../src/models/user.model.js");
const SessionService = await import("../../src/services/session.service.js");
const PushService = await import("../../src/services/push.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let tokens: Record<string, string>;
let ids: Record<string, string>;

/** A fake sender, recording what it's asked to send. */
function fakeSender() {
  return {
    send: vi.fn<PushSender["send"]>(async () => "sent"),
    close: vi.fn(),
  };
}
let ios: ReturnType<typeof fakeSender>;
let android: ReturnType<typeof fakeSender>;

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
  await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]);
  const users = await UserModel.create(
    ["ann", "bob"].map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
    }))
  );
  ids = Object.fromEntries(
    users.map((user) => [user.userName, user._id.toString()])
  );
  tokens = await startSessions("ann", "bob");
  ios = fakeSender();
  android = fakeSender();
  PushService.setPushSenders({ ios, android });
});

const iPhone = { platform: "ios", token: "aa11", environment: "production" };
const pixel = {
  platform: "android",
  token: "fcm-1",
  environment: "production",
};

function register(sessionToken: string, body: object) {
  return request(app)
    .put("/api/v1/sessions/current/push-target")
    .set("Authorization", `Bearer ${sessionToken}`)
    .send(body);
}

const notification = {
  category: "questStarted",
  questName: "Harbor walk",
  title: "Harbor walk",
  body: "Harbor walk has begun.",
};

/** The tokens each fake was asked to send to. */
function sentTo() {
  return [...ios.send.mock.calls, ...android.send.mock.calls].map(
    ([target]) => target.token
  );
}

describe("registering a phone", () => {
  it("sends the session's notifications to it", async () => {
    const response = await register(tokens.ann, iPhone);

    expect(response.status).toBe(204);
    expect(await PushService.sendPush([ids.ann], notification)).toBe(1);
    expect(ios.send).toHaveBeenCalledWith(
      expect.objectContaining(iPhone),
      notification
    );
  });

  it("replaces the phone the session had", async () => {
    await register(tokens.ann, iPhone);
    await register(tokens.ann, pixel);

    await PushService.sendPush([ids.ann], notification);

    expect(sentTo()).toEqual(["fcm-1"]);
  });

  it("moves a phone from another session, as when someone else signs in on it", async () => {
    await register(tokens.ann, iPhone);
    await register(tokens.bob, iPhone);

    await PushService.sendPush([ids.ann, ids.bob], notification);

    expect(ios.send).toHaveBeenCalledOnce();
    expect(ios.send.mock.calls[0][0]).toMatchObject({ userId: ids.bob });
  });

  it("sends only the kinds asked for, and every kind when none are named", async () => {
    await register(tokens.ann, { ...iPhone, categories: ["message"] });
    await register(tokens.bob, pixel);

    await PushService.sendPush([ids.ann, ids.bob], notification);
    await PushService.sendPush([ids.ann, ids.bob], {
      ...notification,
      category: "message",
    });

    expect(sentTo()).toEqual(["aa11", "fcm-1", "fcm-1"]);
  });

  it("keeps kinds the server doesn't know yet", async () => {
    await register(tokens.ann, { ...iPhone, categories: ["somethingNew"] });

    await PushService.sendPush([ids.ann], {
      ...notification,
      category: "somethingNew",
    });

    expect(sentTo()).toEqual(["aa11"]);
  });

  it.each([
    ["an unknown platform", { ...iPhone, platform: "windows" }],
    ["no token", { ...iPhone, token: "" }],
    ["no environment", { platform: "ios", token: "aa11" }],
    ["a malformed kind", { ...iPhone, categories: ["quest started"] }],
  ])("refuses %s", async (_, body) => {
    const response = await register(tokens.ann, body);

    expect(response.status).toBe(400);
    expect(response.body.type).toBe("/problems/invalid-request");
  });

  it("needs a signed-in session", async () => {
    const response = await request(app)
      .put("/api/v1/sessions/current/push-target")
      .send(iPhone);

    expect(response.status).toBe(401);
  });

  it("doesn't show the phone's token back", async () => {
    await register(tokens.ann, iPhone);

    const me = await request(app)
      .get("/api/v1/sessions/current")
      .set("Authorization", `Bearer ${tokens.ann}`);
    expect(JSON.stringify(me.body)).not.toContain("aa11");
  });
});

describe("stopping notifications", () => {
  it("stops them when asked", async () => {
    await register(tokens.ann, iPhone);

    const response = await request(app)
      .delete("/api/v1/sessions/current/push-target")
      .set("Authorization", `Bearer ${tokens.ann}`);

    expect(response.status).toBe(204);
    expect(await PushService.sendPush([ids.ann], notification)).toBe(0);
  });

  it("stops them when the player signs out", async () => {
    await register(tokens.ann, iPhone);

    await request(app)
      .delete("/api/v1/sessions/current")
      .set("Authorization", `Bearer ${tokens.ann}`);

    expect(await PushService.sendPush([ids.ann], notification)).toBe(0);
  });

  it("stops them when the player is signed out everywhere", async () => {
    await register(tokens.ann, iPhone);

    await SessionService.deleteUserSessions(ids.ann);

    expect(await PushService.sendPush([ids.ann], notification)).toBe(0);
  });

  it("sends nothing to a session that has expired but not yet been deleted", async () => {
    await register(tokens.ann, iPhone);
    await SessionModel.updateMany({}, { expiresAt: new Date(Date.now() - 1) });

    expect(await PushService.sendPush([ids.ann], notification)).toBe(0);
  });
});

describe("sending", () => {
  it("forgets a phone Apple or Google says is gone", async () => {
    await register(tokens.ann, iPhone);
    await register(tokens.bob, pixel);
    ios.send.mockResolvedValue("gone");
    android.send.mockResolvedValue("failed");

    expect(await PushService.sendPush([ids.ann, ids.bob], notification)).toBe(
      0
    );

    const sessions = await SessionModel.find({}).lean();
    expect(sessions.map((session) => session.pushTarget?.token).sort()).toEqual(
      ["fcm-1", undefined]
    );
  });

  it("sends nothing to a platform whose settings aren't on the host", async () => {
    PushService.setPushSenders({ android });
    await register(tokens.ann, iPhone);
    await register(tokens.bob, pixel);

    expect(await PushService.sendPush([ids.ann, ids.bob], notification)).toBe(
      1
    );
    expect(sentTo()).toEqual(["fcm-1"]);
  });

  it("sends nothing when no platform's settings are on the host", async () => {
    // Tests have none, so the senders made from the settings send nothing.
    PushService.setPushSenders(undefined);
    await register(tokens.ann, iPhone);

    expect(await PushService.sendPush([ids.ann], notification)).toBe(0);
  });

  it("closes the senders it replaces", async () => {
    PushService.setPushSenders(undefined);

    expect(ios.close).toHaveBeenCalled();
    expect(android.close).toHaveBeenCalled();
  });

  it("never fails, logging what went wrong instead", async () => {
    await register(tokens.ann, iPhone);
    ios.send.mockRejectedValue(new Error("a sender broke its promise"));

    expect(await PushService.sendPush([ids.ann], notification)).toBe(0);
  });
});
