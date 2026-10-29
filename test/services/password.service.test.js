import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/passwordReset.model.js", () => {
  const PasswordResetModel = vi.fn(function (data) {
    Object.assign(this, data);
    this.save = vi.fn(async () => this);
    PasswordResetModel.instances.push(this);
  });
  PasswordResetModel.instances = [];
  PasswordResetModel.deleteMany = vi.fn();
  PasswordResetModel.findOneAndDelete = vi.fn();
  return { PasswordResetModel };
});
vi.mock("../../src/models/user.model.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, UserModel: { findOne: vi.fn() } };
});
vi.mock("../../src/services/email.service.js", () => ({
  sendEmail: vi.fn(async () => ({ status: "success", statusCode: 200 })),
}));

const bcrypt = (await import("bcrypt")).default;
const { config } = await import("../../src/config.js");
const { PasswordResetModel } =
  await import("../../src/models/passwordReset.model.js");
const { UserModel } = await import("../../src/models/user.model.js");
const EmailService = await import("../../src/services/email.service.js");
const AuthenticationService =
  await import("../../src/services/authentication.service.js");
const PasswordService = await import("../../src/services/password.service.js");

function createUserDocument() {
  return {
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    password: "old-hash",
    authorizationLevel: 1,
    save: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  PasswordResetModel.instances = [];
  config.PQ_BASE_URL = "https://puzzlequest.example";
});

describe("validatePasswordPolicy", () => {
  it("rejects passwords shorter than the minimum length", () => {
    const result = AuthenticationService.validatePasswordPolicy("short");
    expect(result.status).toBe("error");
    expect(result.statusCode).toBe(400);
  });

  it("rejects passwords longer than bcrypt can use", () => {
    // 40 characters, but 80 bytes in UTF-8.
    const result = AuthenticationService.validatePasswordPolicy("é".repeat(40));
    expect(result.status).toBe("error");
  });

  it("rejects missing passwords", () => {
    expect(AuthenticationService.validatePasswordPolicy(undefined).status).toBe(
      "error"
    );
  });

  it("accepts passwords meeting the policy", () => {
    expect(
      AuthenticationService.validatePasswordPolicy("long enough").status
    ).toBe("success");
  });
});

describe("isTokenRevoked", () => {
  const changedAt = new Date("2026-01-01T12:00:00.500Z");
  const changedAtSeconds = Math.floor(changedAt.getTime() / 1000);

  it("does not revoke tokens when the password has never changed", () => {
    expect(AuthenticationService.isTokenRevoked(0, undefined)).toBe(false);
  });

  it("revokes tokens issued before the password change", () => {
    expect(
      AuthenticationService.isTokenRevoked(changedAtSeconds - 1, changedAt)
    ).toBe(true);
  });

  it("keeps tokens issued in the same second as, or after, the change", () => {
    expect(
      AuthenticationService.isTokenRevoked(changedAtSeconds, changedAt)
    ).toBe(false);
    expect(
      AuthenticationService.isTokenRevoked(changedAtSeconds + 1, changedAt)
    ).toBe(false);
  });
});

describe("changePassword", () => {
  it("rejects an incorrect current password without saving", async () => {
    const userDocument = createUserDocument();
    UserModel.findOne.mockResolvedValue(userDocument);
    bcrypt.compare.mockResolvedValue(false);

    const result = await PasswordService.changePassword(
      "player",
      "wrong",
      "new password"
    );

    expect(result.status).toBe("error");
    expect(result.statusCode).toBe(400);
    expect(userDocument.save).not.toHaveBeenCalled();
  });

  it("rejects a new password that fails the policy", async () => {
    const userDocument = createUserDocument();
    UserModel.findOne.mockResolvedValue(userDocument);
    bcrypt.compare.mockResolvedValue(true);

    const result = await PasswordService.changePassword(
      "player",
      "old password",
      "short"
    );

    expect(result.status).toBe("error");
    expect(userDocument.save).not.toHaveBeenCalled();
  });

  it("rejects reusing the current password", async () => {
    UserModel.findOne.mockResolvedValue(createUserDocument());
    bcrypt.compare.mockResolvedValue(true);

    const result = await PasswordService.changePassword(
      "player",
      "same password",
      "same password"
    );

    expect(result.status).toBe("error");
  });

  it("returns an error when the user does not exist", async () => {
    UserModel.findOne.mockResolvedValue(null);

    const result = await PasswordService.changePassword(
      "ghost",
      "a",
      "new password"
    );

    expect(result.statusCode).toBe(404);
  });

  it("saves the new password, revokes old tokens, and returns a new token", async () => {
    const userDocument = createUserDocument();
    UserModel.findOne.mockResolvedValue(userDocument);
    bcrypt.compare.mockResolvedValue(true);

    const before = Date.now();
    const result = await PasswordService.changePassword(
      "player",
      "old password",
      "new password"
    );

    expect(result.status).toBe("success");
    expect(result.data).toBe("token");
    expect(userDocument.password).toBe("hashed");
    expect(userDocument.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(
      before
    );
    expect(userDocument.save).toHaveBeenCalled();
    expect(PasswordResetModel.deleteMany).toHaveBeenCalledWith({
      userName: "player",
    });
    expect(EmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "player@example.com" })
    );
  });
});

describe("requestPasswordReset", () => {
  it("succeeds without creating a token or sending email for an unknown account", async () => {
    UserModel.findOne.mockResolvedValue(null);

    const result =
      await PasswordService.requestPasswordReset("nobody@example.com");

    expect(result.status).toBe("success");
    expect(PasswordResetModel.instances).toHaveLength(0);
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("looks users up by normalized user name or email", async () => {
    UserModel.findOne.mockResolvedValue(null);

    await PasswordService.requestPasswordReset("  Player@Example.com ");

    expect(UserModel.findOne).toHaveBeenCalledWith({
      $or: [
        { userName: "player@example.com" },
        { email: "player@example.com" },
      ],
    });
  });

  it("stores only a hash of the token and emails the token in a reset link", async () => {
    UserModel.findOne.mockResolvedValue(createUserDocument());

    const result = await PasswordService.requestPasswordReset("player");

    expect(result.status).toBe("success");
    expect(PasswordResetModel.deleteMany).toHaveBeenCalledWith({
      userName: "player",
    });
    expect(PasswordResetModel.instances).toHaveLength(1);
    const stored = PasswordResetModel.instances[0];
    expect(stored.save).toHaveBeenCalled();
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const email = EmailService.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("player@example.com");
    const link = new URL(email.text.match(/https:\/\/\S+/)[0]);
    expect(link.origin).toBe("https://puzzlequest.example");
    expect(link.pathname).toBe("/user/password/reset");
    const token = link.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toBe(PasswordService.hashResetToken(token));
  });

  it("returns an error when the base URL is not configured", async () => {
    config.PQ_BASE_URL = undefined;

    const result = await PasswordService.requestPasswordReset("player");

    expect(result.status).toBe("error");
    expect(UserModel.findOne).not.toHaveBeenCalled();
  });
});

describe("requestPasswordResetForUser", () => {
  it("reports when the user does not exist", async () => {
    UserModel.findOne.mockResolvedValue(null);

    const result = await PasswordService.requestPasswordResetForUser("ghost");

    expect(result.statusCode).toBe(404);
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("looks the user up by exact user name and emails an admin-specific reset link", async () => {
    UserModel.findOne.mockResolvedValue(createUserDocument());

    const result = await PasswordService.requestPasswordResetForUser("player");

    expect(result.status).toBe("success");
    expect(UserModel.findOne).toHaveBeenCalledWith({ userName: "player" });
    expect(PasswordResetModel.deleteMany).toHaveBeenCalledWith({
      userName: "player",
    });
    const email = EmailService.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("player@example.com");
    expect(email.text).toContain("administrator requested");
    const token = new URL(
      email.text.match(/https:\/\/\S+/)[0]
    ).searchParams.get("token");
    expect(PasswordResetModel.instances[0].tokenHash).toBe(
      PasswordService.hashResetToken(token)
    );
  });

  it("does not change the user's current password", async () => {
    const userDocument = createUserDocument();
    UserModel.findOne.mockResolvedValue(userDocument);

    await PasswordService.requestPasswordResetForUser("player");

    expect(userDocument.password).toBe("old-hash");
    expect(userDocument.save).not.toHaveBeenCalled();
  });

  it("returns an error when the base URL is not configured", async () => {
    config.PQ_BASE_URL = undefined;

    const result = await PasswordService.requestPasswordResetForUser("player");

    expect(result.statusCode).toBe(500);
  });

  it("passes through email delivery failures", async () => {
    UserModel.findOne.mockResolvedValue(createUserDocument());
    EmailService.sendEmail.mockResolvedValueOnce({
      status: "error",
      statusCode: 500,
      message: "Email delivery is not configured",
    });

    const result = await PasswordService.requestPasswordResetForUser("player");

    expect(result.status).toBe("error");
    expect(result.message).toBe("Email delivery is not configured");
  });
});

describe("resetPassword", () => {
  it("checks the password policy before consuming the token", async () => {
    const result = await PasswordService.resetPassword("token", "short");

    expect(result.status).toBe("error");
    expect(PasswordResetModel.findOneAndDelete).not.toHaveBeenCalled();
  });

  it("rejects a token that is unknown, expired, or already used", async () => {
    PasswordResetModel.findOneAndDelete.mockResolvedValue(null);

    const result = await PasswordService.resetPassword("token", "new password");

    expect(result.status).toBe("error");
    expect(result.statusCode).toBe(400);
    const [query] = PasswordResetModel.findOneAndDelete.mock.calls[0];
    expect(query.tokenHash).toBe(PasswordService.hashResetToken("token"));
    expect(query.expiresAt.$gt).toBeInstanceOf(Date);
  });

  it("rejects a missing token", async () => {
    const result = await PasswordService.resetPassword(
      undefined,
      "new password"
    );

    expect(result.statusCode).toBe(400);
    expect(PasswordResetModel.findOneAndDelete).not.toHaveBeenCalled();
  });

  it("sets the new password and revokes existing tokens", async () => {
    const userDocument = createUserDocument();
    PasswordResetModel.findOneAndDelete.mockResolvedValue({
      userName: "player",
    });
    UserModel.findOne.mockResolvedValue(userDocument);

    const result = await PasswordService.resetPassword("token", "new password");

    expect(result.status).toBe("success");
    expect(userDocument.password).toBe("hashed");
    expect(userDocument.passwordChangedAt).toBeInstanceOf(Date);
    expect(userDocument.save).toHaveBeenCalled();
    expect(PasswordResetModel.deleteMany).toHaveBeenCalledWith({
      userName: "player",
    });
  });
});
