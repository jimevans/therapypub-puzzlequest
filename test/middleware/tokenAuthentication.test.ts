import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest, createMockResponse } from "../helpers.js";

vi.mock("../../src/services/user.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/user.service.js")>();
  return { ...original, getTokenValidationData: vi.fn() };
});

const jwt = (await import("jsonwebtoken")).default;
const UserService = await import("../../src/services/user.service.js");
const TokenAuthenticator =
  await import("../../src/middleware/tokenAuthentication.js");

const issuedAt = Math.floor(new Date("2026-01-01T12:00:00Z").getTime() / 1000);

function createAuthenticatedRequest() {
  return createMockRequest({
    cookies: { [TokenAuthenticator.TOKEN_COOKIE_NAME]: "jwt" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(jwt.verify).mockReturnValue({
    userName: "player",
    displayName: "Player",
    authorizationLevel: 1,
    iat: issuedAt,
  } as never);
});

describe("tokenAuthenticate", () => {
  it("authenticates a valid token for a user whose password has not changed", async () => {
    vi.mocked(UserService.getTokenValidationData).mockResolvedValue({});
    const req = createAuthenticatedRequest();
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, createMockResponse(), next);

    expect(req.user?.userName).toBe("player");
    expect(next).toHaveBeenCalled();
  });

  it("treats a token issued before the last password change as signed out", async () => {
    vi.mocked(UserService.getTokenValidationData).mockResolvedValue({
      passwordChangedAt: new Date((issuedAt + 60) * 1000),
    });
    const req = createAuthenticatedRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, res, next);

    expect(req.user).toBeNull();
    expect(res.clearCookie).toHaveBeenCalledWith(
      TokenAuthenticator.TOKEN_COOKIE_NAME
    );
    expect(next).toHaveBeenCalled();
  });

  it("accepts a token issued after the last password change", async () => {
    vi.mocked(UserService.getTokenValidationData).mockResolvedValue({
      passwordChangedAt: new Date((issuedAt - 60) * 1000),
    });
    const req = createAuthenticatedRequest();

    await TokenAuthenticator.tokenAuthenticate(
      req,
      createMockResponse(),
      vi.fn()
    );

    expect(req.user?.userName).toBe("player");
  });

  it("treats a token for a deleted user as signed out", async () => {
    vi.mocked(UserService.getTokenValidationData).mockResolvedValue(null);
    const req = createAuthenticatedRequest();
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, createMockResponse(), next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it("handles a request without a parsed body, as Express 5 sends for GET and multipart requests", async () => {
    vi.mocked(UserService.getTokenValidationData).mockResolvedValue({});
    const req = createAuthenticatedRequest();
    req.body = undefined;
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, createMockResponse(), next);

    expect(req.user?.userName).toBe("player");
    expect(next).toHaveBeenCalled();
  });

  it("rejects an invalid token with a JSON error and clears the cookie", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw Object.assign(new Error("invalid signature"), {
        name: "JsonWebTokenError",
      });
    });
    const req = createAuthenticatedRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      status: "error",
      message: "Invalid authentication token",
    });
    expect(res.clearCookie).toHaveBeenCalledWith(
      TokenAuthenticator.TOKEN_COOKIE_NAME
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("treats an expired token as signed out", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw Object.assign(new Error("jwt expired"), {
        name: "TokenExpiredError",
      });
    });
    const req = createAuthenticatedRequest();
    const next = vi.fn();

    await TokenAuthenticator.tokenAuthenticate(req, createMockResponse(), next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it("passes database errors on instead of reporting an invalid token", async () => {
    vi.mocked(UserService.getTokenValidationData).mockRejectedValue(
      new Error("connection lost")
    );
    const res = createMockResponse();

    await expect(
      TokenAuthenticator.tokenAuthenticate(
        createAuthenticatedRequest(),
        res,
        vi.fn()
      )
    ).rejects.toThrow("connection lost");
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
