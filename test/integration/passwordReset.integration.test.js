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

vi.mock("../../src/services/email.service.js", () => ({
  sendEmail: vi.fn(async () => ({ status: "success", statusCode: 200 })),
}));

const bcrypt = (await import("bcrypt")).default;
const { config } = await import("../../src/config.js");
const { PasswordResetModel } =
  await import("../../src/models/passwordReset.model.js");
const { UserModel } = await import("../../src/models/user.model.js");
const EmailService = await import("../../src/services/email.service.js");
const PasswordService = await import("../../src/services/password.service.js");
const UserService = await import("../../src/services/user.service.js");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await PasswordResetModel.syncIndexes();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  config.PQ_BASE_URL = "https://puzzlequest.example";
  await UserModel.deleteMany({});
  await PasswordResetModel.deleteMany({});
  await new UserModel({
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    password: "old-hash",
    authorizationLevel: 1,
  }).save();
});

function getEmailedToken() {
  const { text } = EmailService.sendEmail.mock.calls[0][0];
  return new URL(text.match(/https:\/\/\S+/)[0]).searchParams.get("token");
}

describe("password reset against MongoDB", () => {
  it("resets the password once with an emailed token, then rejects reuse", async () => {
    await PasswordService.requestPasswordReset("PLAYER@example.com");
    const token = getEmailedToken();

    const stored = await PasswordResetModel.find({}).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toBe(PasswordService.hashResetToken(token));

    const first = await PasswordService.resetPassword(
      token,
      "brand new password"
    );
    expect(first.status).toBe("success");

    const user = await UserModel.findOne({ userName: "player" }).lean();
    expect(user.password).toBe("hashed");
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    expect(await PasswordResetModel.countDocuments()).toBe(0);

    const second = await PasswordService.resetPassword(
      token,
      "another password"
    );
    expect(second.statusCode).toBe(400);
  });

  it("invalidates an earlier reset link when a new one is requested", async () => {
    await PasswordService.requestPasswordReset("player");
    const firstToken = getEmailedToken();
    vi.clearAllMocks();
    await PasswordService.requestPasswordReset("player");
    const secondToken = getEmailedToken();

    expect(
      (await PasswordService.resetPassword(firstToken, "new password 1"))
        .statusCode
    ).toBe(400);
    expect(
      (await PasswordService.resetPassword(secondToken, "new password 2"))
        .status
    ).toBe("success");
  });

  it("rejects an expired token even before MongoDB removes it", async () => {
    await PasswordService.requestPasswordReset("player");
    const token = getEmailedToken();
    await PasswordResetModel.updateMany(
      {},
      { expiresAt: new Date(Date.now() - 1000) }
    );

    const result = await PasswordService.resetPassword(token, "new password");

    expect(result.statusCode).toBe(400);
  });

  it("allows only one of two concurrent uses of the same token", async () => {
    await PasswordService.requestPasswordReset("player");
    const token = getEmailedToken();

    const results = await Promise.all([
      PasswordService.resetPassword(token, "new password a"),
      PasswordService.resetPassword(token, "new password b"),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(["error", "success"]);
  });

  it("lets a user reset their password from an admin-requested link", async () => {
    const result = await PasswordService.requestPasswordResetForUser("player");
    expect(result.status).toBe("success");
    const token = getEmailedToken();

    const user = await UserModel.findOne({ userName: "player" }).lean();
    expect(user.password).toBe("old-hash");

    expect(
      (await PasswordService.resetPassword(token, "new password")).status
    ).toBe("success");
  });

  it("expires tokens through a TTL index", async () => {
    const indexes = await PasswordResetModel.collection.indexes();
    const ttlIndex = indexes.find((index) => index.key.expiresAt === 1);
    expect(ttlIndex.expireAfterSeconds).toBe(0);
  });

  it("changes the password and exposes the change time for token revocation", async () => {
    bcrypt.compare.mockResolvedValue(true);

    const result = await PasswordService.changePassword(
      "player",
      "old password",
      "new password"
    );
    const validationData = await UserService.getTokenValidationData("player");

    expect(result.status).toBe("success");
    expect(validationData.passwordChangedAt).toBeInstanceOf(Date);
    expect(await UserService.getTokenValidationData("nobody")).toBeNull();
  });
});
