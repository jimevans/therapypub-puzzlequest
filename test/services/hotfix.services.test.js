import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest } from "../helpers.js";

vi.mock("../../src/models/puzzle.model.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    PuzzleModel: { findOneAndDelete: vi.fn(), find: vi.fn() },
  };
});
vi.mock("../../src/models/user.model.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    UserModel: { findOne: vi.fn() },
  };
});

const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { UserModel } = await import("../../src/models/user.model.js");
const PuzzleService = await import("../../src/services/puzzle.service.js");
const UserService = await import("../../src/services/user.service.js");
const { validateRequest } =
  await import("../../src/services/requestValidation.service.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PuzzleService", () => {
  it("returns an error result when deleting a puzzle that does not exist", async () => {
    PuzzleModel.findOneAndDelete.mockResolvedValue(null);

    const result = await PuzzleService.deletePuzzle("missing");

    expect(result.status).toBe("error");
    expect(result.statusCode).toBe(404);
  });

  it("returns an error result when creating a puzzle that already exists", async () => {
    PuzzleModel.find.mockReturnValue({ lean: async () => [{ name: "dupe" }] });

    const result = await PuzzleService.createPuzzle({ name: "dupe" });

    expect(result.status).toBe("error");
    expect(result.statusCode).toBe(400);
  });
});

describe("UserService", () => {
  it("never serializes the password hash", () => {
    const user = new UserService.User({
      userName: "player",
      password: "$2b$10$hash",
      authorizationLevel: 1,
    });

    expect(JSON.parse(JSON.stringify(user))).not.toHaveProperty("password");
  });

  it("updates a user when no email address is supplied", async () => {
    const foundUser = {
      displayName: "Old",
      email: "player@example.com",
      phone: "",
      sms: false,
      authorizationLevel: 1,
      save: vi.fn(),
    };
    UserModel.findOne.mockResolvedValue(foundUser);

    const result = await UserService.updateUser(
      "player",
      new UserService.User({ displayName: "New" })
    );

    expect(result.status).toBe("success");
    expect(foundUser.displayName).toBe("New");
    expect(foundUser.email).toBe("player@example.com");
  });
});

describe("validateRequest", () => {
  it("rejects an anonymous request requiring admin without throwing", () => {
    const result = validateRequest(
      { requiresAdmin: true },
      createMockRequest()
    );

    expect(result.status).toBe("error");
    expect(result.statusCode).toBe(403);
  });
});
