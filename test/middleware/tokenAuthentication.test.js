import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest, createMockResponse } from "../helpers.js";

vi.mock("../../src/services/user.service.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, getTokenValidationData: vi.fn() };
});

const jwt = (await import("jsonwebtoken")).default;
const UserService = await import("../../src/services/user.service.js");
const TokenAuthenticator = await import("../../src/middleware/tokenAuthentication.js");

const issuedAt = Math.floor(new Date("2026-01-01T12:00:00Z").getTime() / 1000);

function createAuthenticatedRequest() {
  return createMockRequest({
    cookies: { [TokenAuthenticator.TOKEN_COOKIE_NAME]: "jwt" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  jwt.verify.mockReturnValue({
    userName: "player",
    displayName: "Player",
    authorizationLevel: 1,
    iat: issuedAt,
  });
});

describe("tokenAuthenticate", () => {
  it("authenticates a valid token for a user whose password has not changed", async () => {
    UserService.getTokenValidationData.mockResolvedValue({});
    const req = createAuthenticatedRequest();
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, createMockResponse(), next);

    expect(req.user.userName).toBe("player");
    expect(next).toHaveBeenCalled();
  });

  it("treats a token issued before the last password change as signed out", async () => {
    UserService.getTokenValidationData.mockResolvedValue({
      passwordChangedAt: new Date((issuedAt + 60) * 1000),
    });
    const req = createAuthenticatedRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, res, next);

    expect(req.user).toBeNull();
    expect(res.clearCookie).toHaveBeenCalledWith(TokenAuthenticator.TOKEN_COOKIE_NAME);
    expect(next).toHaveBeenCalled();
  });

  it("accepts a token issued after the last password change", async () => {
    UserService.getTokenValidationData.mockResolvedValue({
      passwordChangedAt: new Date((issuedAt - 60) * 1000),
    });
    const req = createAuthenticatedRequest();

    await TokenAuthenticator.tokenAuthenticate(req, createMockResponse(), vi.fn());

    expect(req.user.userName).toBe("player");
  });

  it("treats a token for a deleted user as signed out", async () => {
    UserService.getTokenValidationData.mockResolvedValue(null);
    const req = createAuthenticatedRequest();
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, createMockResponse(), next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });
});
