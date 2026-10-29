import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminUser,
  createMockRequest,
  createMockResponse,
  playerUser,
} from "../helpers.js";

vi.mock("../../src/services/user.service.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    updateUser: vi.fn(async () => ({ status: "success", statusCode: 200 })),
    deleteUser: vi.fn(async () => ({ status: "success", statusCode: 200 })),
  };
});
vi.mock("../../src/services/password.service.js", () => ({
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  requestPasswordResetForUser: vi.fn(),
  resetPassword: vi.fn(),
}));

const UserService = await import("../../src/services/user.service.js");
const PasswordService = await import("../../src/services/password.service.js");
const TokenAuthenticator =
  await import("../../src/middleware/tokenAuthentication.js");
const UserController = await import("../../src/controllers/user.controller.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateUser", () => {
  it("forbids a non-admin from updating another user", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "other" },
      body: { displayName: "Hacked" },
    });
    const res = createMockResponse();

    await UserController.updateUser(req, res);

    expect(res.statusCode).toBe(403);
    expect(UserService.updateUser).not.toHaveBeenCalled();
  });

  it("ignores an authorization level sent by a non-admin updating themselves", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "player" },
      body: { displayName: "New Name", authorizationLevel: 10 },
    });
    const res = createMockResponse();

    await UserController.updateUser(req, res);

    expect(res.statusCode).toBe(200);
    const [, updatedUser] = UserService.updateUser.mock.calls[0];
    expect(updatedUser.displayName).toBe("New Name");
    expect(updatedUser.authorizationLevel).toBeUndefined();
  });

  it("ignores a password sent by a non-admin updating themselves", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "player" },
      body: { password: "new password" },
    });
    const res = createMockResponse();

    await UserController.updateUser(req, res);

    const [, updatedUser] = UserService.updateUser.mock.calls[0];
    expect(updatedUser.password).toBeUndefined();
  });

  it("allows an admin to change another user's authorization level", async () => {
    const req = createMockRequest({
      user: adminUser,
      params: { userName: "player" },
      body: { authorizationLevel: 10 },
    });
    const res = createMockResponse();

    await UserController.updateUser(req, res);

    expect(res.statusCode).toBe(200);
    const [userName, updatedUser] = UserService.updateUser.mock.calls[0];
    expect(userName).toBe("player");
    expect(updatedUser.authorizationLevel).toBe(10);
  });
});

describe("deleteUser", () => {
  it("forbids a non-admin from deleting another user", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "other" },
    });
    const res = createMockResponse();

    await UserController.deleteUser(req, res);

    expect(res.statusCode).toBe(403);
    expect(UserService.deleteUser).not.toHaveBeenCalled();
  });

  it("allows a user to delete themselves", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "player" },
    });
    const res = createMockResponse();

    await UserController.deleteUser(req, res);

    expect(res.statusCode).toBe(200);
    expect(UserService.deleteUser).toHaveBeenCalledWith("player");
  });
});

describe("changePassword", () => {
  const body = { currentPassword: "old password", newPassword: "new password" };

  it("forbids changing another user's password, even for an admin", async () => {
    const req = createMockRequest({
      user: adminUser,
      params: { userName: "player" },
      body,
    });
    const res = createMockResponse();

    await UserController.changePassword(req, res);

    expect(res.statusCode).toBe(403);
    expect(PasswordService.changePassword).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    const req = createMockRequest({ params: { userName: "player" }, body });
    const res = createMockResponse();

    await UserController.changePassword(req, res);

    expect(res.statusCode).toBe(401);
  });

  it("passes through errors from the password service", async () => {
    PasswordService.changePassword.mockResolvedValue({
      status: "error",
      statusCode: 400,
      message: "Current password is incorrect",
    });
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "player" },
      body,
    });
    const res = createMockResponse();

    await UserController.changePassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Current password is incorrect");
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("replaces the session cookie with the new token for browser sessions", async () => {
    PasswordService.changePassword.mockResolvedValue({
      status: "success",
      statusCode: 200,
      data: "new-token",
    });
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "player" },
      body,
      cookies: { [TokenAuthenticator.TOKEN_COOKIE_NAME]: "old-token" },
    });
    const res = createMockResponse();

    await UserController.changePassword(req, res);

    expect(PasswordService.changePassword).toHaveBeenCalledWith(
      "player",
      "old password",
      "new password"
    );
    expect(res.cookie).toHaveBeenCalledWith(
      TokenAuthenticator.TOKEN_COOKIE_NAME,
      "new-token",
      expect.objectContaining({ httpOnly: true })
    );
    expect(res.body).toEqual({ status: "success", data: "new-token" });
  });

  it("returns the new token without setting a cookie for bearer token clients", async () => {
    PasswordService.changePassword.mockResolvedValue({
      status: "success",
      statusCode: 200,
      data: "new-token",
    });
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "player" },
      body,
    });
    const res = createMockResponse();

    await UserController.changePassword(req, res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.body.data).toBe("new-token");
  });
});

describe("forgotPassword", () => {
  it("responds with success when no account matches", async () => {
    PasswordService.requestPasswordReset.mockResolvedValue({
      status: "success",
      statusCode: 200,
    });
    const req = createMockRequest({ body: { identifier: "nobody" } });
    const res = createMockResponse();

    await UserController.forgotPassword(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: "success" });
  });

  it("responds identically and does not throw when sending fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    PasswordService.requestPasswordReset.mockRejectedValue(
      new Error("SMTP down")
    );
    const req = createMockRequest({ body: { identifier: "player" } });
    const res = createMockResponse();

    await UserController.forgotPassword(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: "success" });
    expect(res.sendCount).toBe(1);
  });

  it("requires an identifier", async () => {
    const req = createMockRequest({ body: {} });
    const res = createMockResponse();

    await UserController.forgotPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(PasswordService.requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  it("passes through an invalid token error", async () => {
    PasswordService.resetPassword.mockResolvedValue({
      status: "error",
      statusCode: 400,
      message: "Password reset link is invalid or has expired",
    });
    const req = createMockRequest({
      body: { resetToken: "bad", newPassword: "new password" },
    });
    const res = createMockResponse();

    await UserController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(PasswordService.resetPassword).toHaveBeenCalledWith(
      "bad",
      "new password"
    );
  });
});

describe("renderResetPassword", () => {
  it("passes a well-formed token to the page and disables referrers", () => {
    const req = createMockRequest({ query: { token: "abc_DEF-123" } });
    const res = createMockResponse();

    UserController.renderResetPassword(req, res);

    expect(res.set).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
    expect(res.render).toHaveBeenCalledWith("resetPassword", {
      resetToken: "abc_DEF-123",
    });
  });

  it("does not pass a malformed token into the page", () => {
    const req = createMockRequest({
      query: { token: "</script><script>alert(1)</script>" },
    });
    const res = createMockResponse();

    UserController.renderResetPassword(req, res);

    expect(res.render).toHaveBeenCalledWith("resetPassword", {
      resetToken: "",
    });
  });
});

describe("sendPasswordResetLink", () => {
  it("forbids non-admins, even for their own account", async () => {
    const req = createMockRequest({
      user: playerUser,
      params: { userName: "player" },
    });
    const res = createMockResponse();

    await UserController.sendPasswordResetLink(req, res);

    expect(res.statusCode).toBe(403);
    expect(PasswordService.requestPasswordResetForUser).not.toHaveBeenCalled();
  });

  it("sends the reset link for an admin", async () => {
    PasswordService.requestPasswordResetForUser.mockResolvedValue({
      status: "success",
      statusCode: 200,
    });
    const req = createMockRequest({
      user: adminUser,
      params: { userName: "player" },
    });
    const res = createMockResponse();

    await UserController.sendPasswordResetLink(req, res);

    expect(PasswordService.requestPasswordResetForUser).toHaveBeenCalledWith(
      "player"
    );
    expect(res.body).toEqual({ status: "success" });
  });

  it("reports errors such as an unknown user to the admin", async () => {
    PasswordService.requestPasswordResetForUser.mockResolvedValue({
      status: "error",
      statusCode: 404,
      message: "No user with user name ghost found",
    });
    const req = createMockRequest({
      user: adminUser,
      params: { userName: "ghost" },
    });
    const res = createMockResponse();

    await UserController.sendPasswordResetLink(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("No user with user name ghost found");
  });
});
