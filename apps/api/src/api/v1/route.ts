// Each v1 route is defined once, here in a form that both registers it with
// Express and describes it in the OpenAPI document, so the two can't drift:
// the access rule, the request schemas the route validates against, and the
// responses it can give.
import type { Request, RequestHandler, Response, Router } from "express";
import type { z } from "zod";
import {
  requireAdmin,
  requireStaff,
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
 * - staff: staff and administrators;
 * - admin: administrators;
 * - self: only the user named by the {userName} path parameter;
 * - selfOrAdmin: that user, and administrators.
 */
export type Access =
  "public" | "signedIn" | "staff" | "admin" | "self" | "selfOrAdmin";

/** The middleware that enforces each access rule. */
const ACCESS_MIDDLEWARE: Record<Access, RequestHandler[]> = {
  public: [],
  signedIn: [requireUser],
  staff: [requireStaff],
  admin: [requireAdmin],
  self: [requireSelf],
  selfOrAdmin: [requireSelfOrAdmin],
};

/** A response a route can give, other than a problem. */
export interface RouteResponse {
  description: string;
  /** The body's schema; leave it out for no body. */
  body?: z.ZodType;
  /** The body's media type, if it isn't JSON, such as image/png. */
  mediaType?: string;
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
  /**
   * False to leave the route out of the API's description: for webhooks,
   * which only the service that calls them uses.
   */
  documented?: boolean;
  access: Access;
  /** True if a share link's token, in X-Share-Token, can stand in for access. */
  acceptsShareLink?: boolean;
  /** Middleware that runs before validation, such as rate limits. */
  before?: RequestHandler[];
  /**
   * The schemas the request must match. A multipart body, for an upload,
   * is only described: the route's own middleware (multer) reads and checks
   * it.
   */
  request?: {
    body?: B;
    query?: Q;
    params?: P;
    multipart?: z.ZodObject;
    /**
     * The body's media type, if it isn't JSON: form fields, as Twilio's
     * webhooks send them, are validated the same way. A route may take both
     * a body and a multipart upload, whose fields are validated as the body.
     */
    bodyMediaType?: "application/x-www-form-urlencoded";
  };
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
  // Path parameters are plain names, so only a body or query can be
  // invalid.
  if (route.request?.body || route.request?.query) {
    implied.push(Problems.invalidRequest);
  }
  // The body parsers read only so much.
  if (route.request?.body || route.request?.multipart) {
    implied.push(Problems.bodyTooLarge);
  }
  if (route.access !== "public") {
    implied.push(Problems.signInRequired);
  }
  if (route.access !== "public" && route.access !== "signedIn") {
    implied.push(Problems.forbidden);
  }
  // Anything that changes something is refused when another site's page
  // sends it with the session cookie (see requireSameOrigin).
  if (route.method !== "get") {
    implied.push(Problems.crossSiteRequest);
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
    const { body, query, params } = route.request ?? {};
    if (body || query || params) {
      handlers.push(validate({ body, query, params }));
    }
    handlers.push((req, res) => route.handle(req as never, res));
    router[route.method](toExpressPath(route.path), ...handlers);
  }
}
