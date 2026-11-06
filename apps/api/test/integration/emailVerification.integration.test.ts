// Tests of email address verification, through the whole application.
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
import { startSessions } from "../sessions.js";

vi.mock("../../src/services/email.service.js", () => ({
  sendEmail: vi.fn(async () => ({ status: "success", statusCode: 200 })),
}));

const { config } = await import("../../src/config.js");
const { createApp } = await import("../../src/createApp.js");
const { EmailVerificationModel } =
  await import("../../src/models/emailVerification.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const EmailService = await import("../../src/services/email.service.js");
const EmailVerificationService =
  await import("../../src/services/emailVerification.service.js");
const PasswordService = await import("../../src/services/password.service.js");
const { verificationEmailRateLimiter } =
  await import("../../src/middleware/rateLimiter.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([UserModel.init(), EmailVerificationModel.init()]);
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  config.PQ_BASE_URL = "https://puzzlequest.example";
  await verificationEmailRateLimiter.resetKey("player");
  await Promise.all([
    UserModel.deleteMany({}),
    EmailVerificationModel.deleteMany({}),
  ]);
  await UserModel.create(
    (["admin", "player"] as const).map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
      authorizationLevel:
        userName === "admin"
          ? AuthorizationLevel.ADMIN
          : AuthorizationLevel.USER,
      // The administrator is verified; the player isn't yet.
      emailVerifiedAt: userName === "admin" ? new Date() : undefined,
    }))
  );
});

afterEach(() => {
  config.PQ_BASE_URL = undefined;
});

/**
 * Gets the token from the most recent verification email.
 * @returns the token
 */
function emailedToken(): string {
  const { text } = vi.mocked(EmailService.sendEmail).mock.lastCall![0];
  const link = new URL(text.match(/https:\/\/\S+/)![0]);
  expect(link.pathname).toBe("/user/email/verify");
  return link.searchParams.get("token")!;
}

function verify(token: string) {
  return request(app).post("/api/v1/email-verifications").send({ token });
}

async function isVerified(userName: string): Promise<boolean> {
  const user = await UserModel.findOne({ userName }).lean();
  return Boolean(user?.emailVerifiedAt);
}

describe("signing up", () => {
  it("emails a link to verify the address, keeping only a hash of its token", async () => {
    await request(app).post("/api/v1/users").send({
      userName: "newcomer",
      email: "newcomer@example.com",
      password: "a long enough password",
    });

    expect(EmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "newcomer@example.com",
        subject: "Verify your PuzzleQuest email address",
      })
    );
    const token = emailedToken();
    const [stored] = await EmailVerificationModel.find({}).lean();
    expect(stored.tokenHash).toBe(
      EmailVerificationService.hashVerificationToken(token)
    );
    expect(stored.email).toBe("newcomer@example.com");
    expect(await isVerified("newcomer")).toBe(false);
  });

  it("still succeeds when the email can't be sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(EmailService.sendEmail).mockResolvedValueOnce({
      status: "error",
      statusCode: 500,
      message: "SMTP down",
    });

    const response = await request(app).post("/api/v1/users").send({
      userName: "newcomer",
      email: "newcomer@example.com",
      password: "a long enough password",
    });

    expect(response.status).toBe(201);
    expect(console.error).toHaveBeenCalledWith(
      "Sending a verification email to newcomer failed: SMTP down"
    );
  });
});

describe("following the link", () => {
  beforeEach(async () => {
    await EmailVerificationService.sendVerificationEmail("player");
  });

  it("verifies the address, once", async () => {
    const token = emailedToken();

    expect((await verify(token)).status).toBe(204);
    expect(await isVerified("player")).toBe(true);

    const again = await verify(token);
    expect(again.status).toBe(422);
    expect(JSON.parse(again.text).detail).toBe(
      "This verification link is invalid or has expired. Sign in to send a new one."
    );
  });

  it("doesn't work once it expires", async () => {
    const token = emailedToken();
    await EmailVerificationModel.updateMany(
      {},
      { expiresAt: new Date(Date.now() - 1000) }
    );

    expect((await verify(token)).status).toBe(422);
    expect(await isVerified("player")).toBe(false);
  });

  it("doesn't verify an address the user has since changed", async () => {
    const token = emailedToken();
    await UserModel.updateOne(
      { userName: "player" },
      { email: "elsewhere@example.com" }
    );

    expect((await verify(token)).status).toBe(422);
    expect(await isVerified("player")).toBe(false);
  });

  it("replaces an earlier link when a new one is sent", async () => {
    const first = emailedToken();
    await EmailVerificationService.sendVerificationEmail("player");

    expect((await verify(first)).status).toBe(422);
    expect((await verify(emailedToken())).status).toBe(204);
  });

  it("opens a page that verifies only when the button is pressed", async () => {
    const token = emailedToken();

    const response = await request(app).get(
      `/user/email/verify?token=${token}`
    );

    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(await isVerified("player")).toBe(false);
  });
});

describe("changing an email address", () => {
  it("clears the verification and sends a link to the new address", async () => {
    await UserModel.updateOne(
      { userName: "player" },
      { emailVerifiedAt: new Date() }
    );
    const { player } = await startSessions("player");

    await request(app)
      .patch("/api/v1/users/player")
      .set("Authorization", `Bearer ${player}`)
      .send({ email: "new@example.com" });

    expect(await isVerified("player")).toBe(false);
    expect(vi.mocked(EmailService.sendEmail).mock.lastCall![0].to).toBe(
      "new@example.com"
    );
  });

  it("isn't needed for other changes", async () => {
    await UserModel.updateOne(
      { userName: "player" },
      { emailVerifiedAt: new Date() }
    );
    const { player } = await startSessions("player");

    await request(app)
      .patch("/api/v1/users/player")
      .set("Authorization", `Bearer ${player}`)
      .send({ displayName: "New name", email: "player@example.com" });

    expect(await isVerified("player")).toBe(true);
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });
});

describe("sending the link again", () => {
  function resend(token: string) {
    return request(app)
      .post("/api/v1/users/player/email-verification-requests")
      .set("Authorization", `Bearer ${token}`);
  }

  it("emails a new link", async () => {
    const { player } = await startSessions("player");

    expect((await resend(player)).status).toBe(204);
    expect(EmailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends nothing once the address is verified", async () => {
    await UserModel.updateOne(
      { userName: "player" },
      { emailVerifiedAt: new Date() }
    );
    const { player } = await startSessions("player");

    expect((await resend(player)).status).toBe(204);
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("is limited, so it can't flood an inbox", async () => {
    const { player } = await startSessions("player");
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await resend(player)).status).toBe(204);
    }

    expect((await resend(player)).status).toBe(429);
  });
});

describe("password reset", () => {
  // The forgot-password endpoint responds before it looks the account up, so
  // its timing reveals nothing; these call the service so they can wait.
  it("sends nothing to an unverified address, while reporting success", async () => {
    const result = await PasswordService.requestPasswordReset("player");

    expect(result).toEqual({ status: "success", statusCode: 200 });
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("emails a verified address", async () => {
    await UserModel.updateOne(
      { userName: "player" },
      { emailVerifiedAt: new Date() }
    );

    await PasswordService.requestPasswordReset("player");

    expect(EmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "player@example.com" })
    );
  });

  it("tells an administrator why it can't send a link to an unverified address", async () => {
    const { admin } = await startSessions("admin");

    const response = await request(app)
      .post("/api/v1/users/player/password-reset-links")
      .set("Authorization", `Bearer ${admin}`);

    expect(response.status).toBe(409);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/email-not-verified",
    });
    expect(JSON.parse(response.text).detail).toBe(
      "player hasn't verified their email address yet, so a reset link can't be sent to it"
    );
  });
});

describe("what a profile needs for its reminder", () => {
  it("says whether the address is verified", async () => {
    const { player } = await startSessions("player");
    const emailVerified = async () =>
      (
        await request(app)
          .get("/api/v1/users/player")
          .set("Authorization", `Bearer ${player}`)
      ).body.emailVerified;

    expect(await emailVerified()).toBe(false);

    await UserModel.updateOne(
      { userName: "player" },
      { emailVerifiedAt: new Date() }
    );

    expect(await emailVerified()).toBe(true);
  });
});
