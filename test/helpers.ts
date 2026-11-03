import type { Request, Response } from "express";
import { vi } from "vitest";
import type { TokenUser } from "../src/middleware/tokenAuthentication.js";
import { AuthorizationLevel } from "../src/models/user.model.js";

/** A mock Express response that records what the handler sent. */
export type MockResponse = Response & {
  /** The parsed body of the last response sent. */
  body: any;
  /** The number of times a response was sent. */
  sendCount: number;
};

/**
 * Creates a minimal mock of an Express response object that records calls.
 * @returns the mock response
 */
export function createMockResponse(): MockResponse {
  const res = {
    statusCode: 200,
    body: undefined,
    sendCount: 0,
  } as unknown as MockResponse;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.send = vi.fn((body?: unknown) => {
    res.sendCount++;
    res.body = typeof body === "string" ? JSON.parse(body) : body;
    return res;
  });
  res.render = vi.fn(() => res) as unknown as Response["render"];
  res.set = vi.fn(() => res);
  res.cookie = vi.fn(() => res);
  res.clearCookie = vi.fn(() => res);
  return res;
}

/** The properties of a mock Express request. */
export interface MockRequestOptions {
  /** The decoded token user data, or null for anonymous. */
  user?: TokenUser | null;
  /** The route parameters. */
  params?: Record<string, string>;
  /** The request body. */
  body?: any;
  /** The query string parameters. */
  query?: Record<string, string>;
  /** The request cookies. */
  cookies?: Record<string, string>;
  /** The request headers. */
  headers?: Record<string, string>;
}

/**
 * Creates a mock Express request.
 * @param options the request properties
 * @returns the mock request, typed to fit any route handler
 */
export function createMockRequest({
  user = null,
  params = {},
  body = {},
  query = {},
  cookies = {},
  headers = {},
}: MockRequestOptions = {}): Request<any> {
  return { user, params, body, query, cookies, headers } as Request<any>;
}

export const playerUser: TokenUser = {
  userName: "player",
  displayName: "Player",
  email: "player@example.com",
  phone: "",
  sms: false,
  authorizationLevel: AuthorizationLevel.USER,
};

export const otherPlayerUser: TokenUser = {
  userName: "other",
  displayName: "Other",
  email: "other@example.com",
  phone: "",
  sms: false,
  authorizationLevel: AuthorizationLevel.USER,
};

export const adminUser: TokenUser = {
  userName: "admin",
  displayName: "Admin",
  email: "admin@example.com",
  phone: "",
  sms: false,
  authorizationLevel: AuthorizationLevel.ADMIN,
};
