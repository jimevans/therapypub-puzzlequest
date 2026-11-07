// Unit tests of the authorization middleware. The matrix test in
// test/integration/authorization.integration.test.ts checks which of these
// guards each route uses.
import type { RequestHandler } from "express";
import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/services/user.service.js";
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
  user: SessionUser | null,
  originalUrl = "/api/v1/quests/quest"
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
      expect(res.type).toHaveBeenCalledWith("application/problem+json");
      expect(res.body).toEqual({
        type: "/problems/forbidden",
        title: "Not allowed",
        status: 403,
        detail: `User ${user.userName} isn't allowed to do this`,
      });
    }
  });

  it("asks an anonymous API client to sign in", () => {
    const { res, passed } = run(guard, null);

    expect(passed).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      type: "/problems/sign-in-required",
      title: "Sign in to do this",
      status: 401,
      detail: "Sign in to do this, with the session cookie or a Bearer token",
    });
  });
});

describe("for pages", () => {
  it("sends an anonymous visitor to sign in, returning to the page afterwards", () => {
    const { res, passed } = run(requireUser, null, "/quest/q1");

    expect(passed).toBe(false);
    expect(res.redirect).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent("/quest/q1")}`
    );
  });

  it("shows a forbidden page with a 403", () => {
    const { res, passed } = run(requireAdmin, playerUser, "/puzzle/new");

    expect(passed).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.type).toHaveBeenCalledWith("html");
    expect(res.body).toContain("<h1>Forbidden</h1>");
    expect(res.body).toContain(
      "<p>User player is not authorized to view this page</p>"
    );
  });
});
