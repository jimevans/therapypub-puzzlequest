// Unit tests of the authorization middleware. The matrix test in
// test/integration/authorization.integration.test.ts checks which of these
// guards each route uses.
import type { RequestHandler } from "express";
import { describe, expect, it, vi } from "vitest";
import type { TokenUser } from "../../src/middleware/tokenAuthentication.js";
import {
  requireAdmin,
  requireSelf,
  requireSelfOrAdmin,
  requireUser,
} from "../../src/middleware/authorization.js";
import {
  adminUser,
  createMockRequest,
  createMockResponse,
  otherPlayerUser,
  playerUser,
} from "../helpers.js";

/**
 * Runs a guard for a request.
 * @param guard the middleware
 * @param user the signed-in user, or null for anonymous
 * @param originalUrl the requested URL; /api/ URLs get JSON responses
 * @returns the response, and whether the request was let through
 */
function run(
  guard: RequestHandler,
  user: TokenUser | null,
  originalUrl = "/api/user/player"
) {
  const req = createMockRequest({ user, params: { userName: "player" } });
  req.originalUrl = originalUrl;
  const res = createMockResponse();
  const next = vi.fn();
  guard(req, res, next);
  return { res, passed: next.mock.calls.length === 1 };
}

describe.each([
  ["requireUser", requireUser, [true, true, true]],
  ["requireAdmin", requireAdmin, [false, false, true]],
  ["requireSelf", requireSelf, [true, false, false]],
  ["requireSelfOrAdmin", requireSelfOrAdmin, [true, false, true]],
] as const)("%s", (_name, guard, [forPlayer, forOther, forAdmin]) => {
  // The route's userName is "player".
  it.each([
    ["the user named in the route", playerUser, forPlayer],
    ["another player", otherPlayerUser, forOther],
    ["an administrator", adminUser, forAdmin],
  ])("for %s, lets through: %s", (_who, user, allowed) => {
    const { res, passed } = run(guard, user);

    expect(passed).toBe(allowed);
    if (!allowed) {
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({
        status: "error",
        message: `User ${user.userName} not authorized to perform operation`,
      });
    }
  });

  it("asks an anonymous API client to sign in", () => {
    const { res, passed } = run(guard, null);

    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      status: "error",
      message: "User must be logged in to perform operation",
    });
  });
});

describe("for pages", () => {
  it("shows an anonymous visitor the sign-in page, returning to the page afterwards", () => {
    const { res, passed } = run(requireUser, null, "/quest/q1");

    expect(passed).toBe(false);
    expect(res.render).toHaveBeenCalledWith("login", {
      requestingUrl: "/quest/q1",
    });
  });

  it("shows a forbidden page with a 403", () => {
    const { res, passed } = run(requireAdmin, playerUser, "/puzzle/new");

    expect(passed).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.render).toHaveBeenCalledWith("error", {
      errorTitle: "Forbidden",
      errorDetails: "User player is not authorized to view this page",
    });
  });
});
