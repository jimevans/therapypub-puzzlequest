// Each v1 route is defined once, here in a form that both registers it with
// Express and describes it in the OpenAPI document, so the two can't drift:
// the access rule, the request schemas the route validates against, and the
// responses it can give.
import type { Request, RequestHandler, Response, Router } from "express";
import type { z } from "zod";
import {
  requireAdmin,
  requireSelf,
  requireSelfOrAdmin,
  requireUser,
} from "../../middleware/authorization.js";
import { authenticateSession } from "../../middleware/sessionAuthentication.js";
import { validate } from "../../middleware/validate.js";
import { Problems, type ProblemType } from "../problems.js";

/**
 * Who may use a route:
 * - public: anyone, signed in or not;
 * - signedIn: any signed-in user;
 * - admin: administrators;
 * - self: only the user named by the {userName} path parameter;
 * - selfOrAdmin: that user, and administrators.
 */
export type Access = "public" | "signedIn" | "admin" | "self" | "selfOrAdmin";

/** The middleware that enforces each access rule. */
const ACCESS_MIDDLEWARE: Record<Access, RequestHandler[]> = {
  public: [],
  signedIn: [requireUser],
  admin: [requireAdmin],
  self: [requireSelf],
  selfOrAdmin: [requireSelfOrAdmin],
};

/** A response a route can give, other than a problem. */
export interface RouteResponse {
  description: string;
  /** The body's schema, sent as JSON; leave it out for no body. */
  body?: z.ZodType;
  /** Headers the response has, by name. */
  headers?: Record<string, { description: string }>;
}

/**
 * A v1 route.
 * @template B the schema of the request body
 * @template Q the schema of the query parameters
 * @template P the schema of the path parameters
 */
export interface Route<
  B extends z.ZodType = z.ZodUnknown,
  Q extends z.ZodObject = z.ZodObject,
  P extends z.ZodObject = z.ZodObject,
> {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** The path below /api/v1, with parameters in braces: /users/{userName}. */
  path: string;
  /** A unique name for the operation, for generated clients. */
  operationId: string;
  /** What the route does, in a few words. */
  summary: string;
  /** More about what the route does, if needed. */
  description?: string;
  /** The groups the route is listed under in the documentation. */
  tags: string[];
  access: Access;
  /** Middleware that runs before validation, such as rate limits. */
  before?: RequestHandler[];
  /** The schemas the request must match. */
  request?: { body?: B; query?: Q; params?: P };
  /** The successful responses, by status code. */
  responses: Record<number, RouteResponse>;
  /**
   * The problems the route can report beyond those its access rule and
   * request schemas imply (see problemsOf).
   */
  problems?: ProblemType[];
  /**
   * Handles a request that has passed authorization and validation, with
   * its parts replaced by what the schemas parsed.
   */
  handle(
    req: Request<z.output<P>, unknown, z.output<B>, z.output<Q>>,
    res: Response
  ): Promise<void> | void;
}

/** A route of any request shape, for lists of routes. */
export type AnyRoute = Route<z.ZodType, z.ZodObject, z.ZodObject>;

/**
 * Defines a route, inferring the types its handler receives from its
 * request schemas.
 * @param route the route
 * @returns the route
 */
export function defineRoute<
  B extends z.ZodType = z.ZodUnknown,
  Q extends z.ZodObject = z.ZodObject,
  P extends z.ZodObject = z.ZodObject,
>(route: Route<B, Q, P>): AnyRoute {
  return route as unknown as AnyRoute;
}

/**
 * Converts a route's path to Express's form: /users/{userName} becomes
 * /users/:userName.
 * @param path the path, with parameters in braces
 * @returns the path for Express
 */
export function toExpressPath(path: string): string {
  return path.replace(/\{(\w+)\}/g, ":$1");
}

/**
 * Gets the problems a route can report: those its access rule and request
 * schemas imply, and those it lists.
 * @param route the route
 * @returns the problems
 */
export function problemsOf(route: AnyRoute): ProblemType[] {
  const implied: ProblemType[] = [];
  if (route.request) {
    implied.push(Problems.invalidRequest);
  }
  if (route.access !== "public") {
    implied.push(Problems.signInRequired);
  }
  if (route.access !== "public" && route.access !== "signedIn") {
    implied.push(Problems.forbidden);
  }
  return [...implied, ...(route.problems ?? [])];
}

/**
 * Registers routes with a router: each authenticates the session, enforces
 * its access rule, runs its own middleware, validates the request, and then
 * handles it.
 * @param router the router
 * @param routes the routes
 */
export function registerRoutes(router: Router, routes: AnyRoute[]): void {
  for (const route of routes) {
    const handlers: RequestHandler[] = [
      authenticateSession,
      ...ACCESS_MIDDLEWARE[route.access],
      ...(route.before ?? []),
    ];
    if (route.request) {
      handlers.push(validate(route.request));
    }
    handlers.push((req, res) => route.handle(req as never, res));
    router[route.method](toExpressPath(route.path), ...handlers);
  }
}
