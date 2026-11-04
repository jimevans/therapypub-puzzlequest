// Signing in and out. A browser's session is kept in an httpOnly cookie,
// which page scripts can't read; an app asks for the token instead and sends
// it as a Bearer token.
import { z } from "zod";
import * as SessionAuthenticator from "../../middleware/sessionAuthentication.js";
import * as RateLimiter from "../../middleware/rateLimiter.js";
import { loginBody } from "../../schemas/user.schemas.js";
import * as AuthenticationService from "../../services/authentication.service.js";
import * as SessionService from "../../services/session.service.js";
import { Problems, sendProblem } from "../problems.js";
import { toUserResource, userSchema } from "./resources.js";
import { defineRoute } from "./route.js";

/** A session. */
const sessionSchema = z
  .object({
    user: userSchema,
    token: z.string().optional().meta({
      description:
        'The session token, only when signing in with client "native", to send as Authorization: Bearer <token>.',
    }),
  })
  .meta({ id: "Session" });

/** The path of the session a request presents. */
const CURRENT_SESSION_PATH = "/api/v1/sessions/current";

export const sessionRoutes = [
  defineRoute({
    method: "post",
    path: "/sessions",
    operationId: "signIn",
    summary: "Sign in",
    description:
      'Starts a session. A browser ("web", the default) gets it as a cookie; an app ("native") gets its token in the response.',
    tags: ["Sessions"],
    access: "public",
    before: [RateLimiter.loginAddressRateLimiter, RateLimiter.loginRateLimiter],
    request: { body: loginBody },
    responses: {
      201: {
        description: "Signed in.",
        body: sessionSchema,
        headers: {
          Location: { description: "The session: /api/v1/sessions/current." },
          "Set-Cookie": {
            description: 'The session cookie, for client "web".',
          },
        },
      },
    },
    problems: [Problems.signInFailed, Problems.tooManyRequests],
    async handle(req, res) {
      const result = await AuthenticationService.authenticate(
        req.body.userName,
        req.body.password
      );
      if (result.status === "error") {
        sendProblem(res, Problems.signInFailed, result.message);
        return;
      }
      const user = result.data;
      const token = await SessionService.createSession(
        // A user loaded from the database always has an ID.
        user.id ?? "",
        req.get("user-agent")
      );
      if (req.body.client === "web") {
        SessionAuthenticator.setSessionCookie(res, token);
      }
      res
        .status(201)
        .location(CURRENT_SESSION_PATH)
        .json({
          user: toUserResource(user),
          ...(req.body.client === "native" ? { token } : {}),
        });
    },
  }),
  defineRoute({
    method: "get",
    path: "/sessions/current",
    operationId: "getCurrentSession",
    summary: "Get the current session",
    description: "Says who is signed in.",
    tags: ["Sessions"],
    access: "signedIn",
    responses: {
      200: { description: "The session.", body: sessionSchema },
    },
    handle(req, res) {
      // requireUser has checked there is a signed-in user.
      res.json({ user: toUserResource(req.user!) });
    },
  }),
  defineRoute({
    method: "delete",
    path: "/sessions/current",
    operationId: "signOut",
    summary: "Sign out",
    description:
      "Ends the session the request presents, from its cookie or Bearer token. Signing out when not signed in does nothing.",
    tags: ["Sessions"],
    access: "public",
    responses: { 204: { description: "Signed out." } },
    async handle(req, res) {
      if (req.sessionToken) {
        await SessionService.deleteSession(req.sessionToken);
      }
      SessionAuthenticator.clearSessionCookie(res);
      res.status(204).end();
    },
  }),
];
