import { vi } from "vitest";
import { AuthorizationLevel } from "../src/models/user.model.js";

/**
 * Creates a minimal mock of an Express response object that records calls.
 * @returns {object} the mock response
 */
export function createMockResponse() {
  const res = {
    statusCode: 200,
    body: undefined,
    sendCount: 0,
  };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.send = vi.fn((body) => {
    res.sendCount++;
    res.body = typeof body === "string" ? JSON.parse(body) : body;
    return res;
  });
  res.render = vi.fn(() => res);
  return res;
}

/**
 * Creates a mock Express request.
 * @param {object} options the request properties
 * @param {object | null} options.user the decoded token user data, or null for anonymous
 * @param {object} options.params the route parameters
 * @param {object} options.body the request body
 * @returns {object} the mock request
 */
export function createMockRequest({ user = null, params = {}, body = {} } = {}) {
  return { user, params, body };
}

export const playerUser = {
  userName: "player",
  displayName: "Player",
  email: "player@example.com",
  authorizationLevel: AuthorizationLevel.USER,
};

export const otherPlayerUser = {
  userName: "other",
  displayName: "Other",
  email: "other@example.com",
  authorizationLevel: AuthorizationLevel.USER,
};

export const adminUser = {
  userName: "admin",
  displayName: "Admin",
  email: "admin@example.com",
  authorizationLevel: AuthorizationLevel.ADMIN,
};
