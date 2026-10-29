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

const UserService = await import("../../src/services/user.service.js");
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
