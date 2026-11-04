// Errors from the v1 API are problem details (RFC 9457): a JSON object,
// sent as application/problem+json, whose "type" says what kind of problem
// it is, so clients can act on the type rather than parse the message.
import type { Request, Response } from "express";
import { z } from "zod";

/** A kind of problem the API reports. */
export interface ProblemType {
  /** The URI identifying the kind of problem. */
  type: string;
  /** A short summary, the same for every problem of this type. */
  title: string;
  /** The HTTP status code it is reported with. */
  status: number;
  /** When it happens, for the API's documentation. */
  description: string;
}

/**
 * Every kind of problem the API reports. A problem that isn't one of these,
 * such as a request too large to read, is reported with the type
 * "about:blank", whose title is the HTTP status's.
 */
export const Problems = {
  invalidRequest: {
    type: "/problems/invalid-request",
    title: "The request isn't valid",
    status: 400,
    description:
      "The request's parameters or body are missing, malformed, or have values that aren't allowed. The errors member lists each problem, with where it is, such as body.email.",
  },
  signInRequired: {
    type: "/problems/sign-in-required",
    title: "Sign in to do this",
    status: 401,
    description:
      "The request needs a signed-in user, and has no session, or one that has ended.",
  },
  signInFailed: {
    type: "/problems/sign-in-failed",
    title: "Incorrect user name or password",
    status: 401,
    description:
      "The user name and password don't match an account. Which of them is wrong isn't said.",
  },
  forbidden: {
    type: "/problems/forbidden",
    title: "Not allowed",
    status: 403,
    description: "The signed-in user isn't allowed to do this.",
  },
  crossSiteRequest: {
    type: "/problems/cross-site-request",
    title: "Request from another site",
    status: 403,
    description:
      "A request that changes something was sent with this site's cookie from a page on another site. Send it from this site, or with a Bearer token.",
  },
  notFound: {
    type: "/problems/not-found",
    title: "Not found",
    status: 404,
    description:
      "There is no such resource, or the signed-in user may not know about it.",
  },
  tooManyRequests: {
    type: "/problems/too-many-requests",
    title: "Too many requests",
    status: 429,
    description:
      "Too many attempts in a short time. The RateLimit and RateLimit-Policy headers say when to try again.",
  },
  unexpected: {
    type: "/problems/unexpected",
    title: "An unexpected error occurred",
    status: 500,
    description:
      "Something went wrong on the server. The details are logged, not sent.",
  },
} as const satisfies Record<string, ProblemType>;

/** A problem with one part of a request. */
export const fieldErrorSchema = z
  .object({
    path: z.string().meta({
      description: "Where the problem is, such as body.email or query.limit.",
    }),
    message: z.string().meta({ description: "What is wrong." }),
  })
  .meta({ id: "FieldError" });

/** The body of an error response. */
export const problemSchema = z
  .object({
    type: z.string().meta({
      description:
        'The kind of problem: one of the types listed in the API\'s description, or "about:blank" for a plain HTTP error.',
    }),
    title: z
      .string()
      .meta({ description: "A summary of the kind of problem." }),
    status: z.number().int().meta({ description: "The HTTP status code." }),
    detail: z
      .string()
      .meta({ description: "What went wrong with this request." }),
    errors: z.array(fieldErrorSchema).optional().meta({
      description: "For an invalid request, each problem with it.",
    }),
  })
  .meta({ id: "Problem" });
export type Problem = z.infer<typeof problemSchema>;

/** The media type of problem details. */
export const PROBLEM_MEDIA_TYPE = "application/problem+json";

/**
 * Determines whether a request is for the v1 API, which reports errors as
 * problem details. The older API answers { status, message } instead.
 * @param req the request
 * @returns true for a v1 request
 */
export function isV1Request(req: Request): boolean {
  return /^\/api\/v1(\/|\?|$)/.test(req.originalUrl);
}

/**
 * Sends a problem.
 * @param res the response
 * @param problem the kind of problem
 * @param detail what went wrong with this request
 * @param extensions more members, such as errors for an invalid request
 */
export function sendProblem(
  res: Response,
  problem: Pick<ProblemType, "type" | "title" | "status">,
  detail: string,
  extensions: Partial<Pick<Problem, "errors">> = {}
): void {
  const body: Problem = {
    type: problem.type,
    title: problem.title,
    status: problem.status,
    detail,
    ...extensions,
  };
  res
    .status(problem.status)
    .type(PROBLEM_MEDIA_TYPE)
    .send(JSON.stringify(body));
}

/**
 * Sends an error in the format the request's API uses: problem details for
 * v1, or { status: "error", message } for the older API.
 * @param req the request
 * @param res the response
 * @param problem the kind of problem, for v1
 * @param message what went wrong
 */
export function sendApiError(
  req: Request,
  res: Response,
  problem: ProblemType,
  message: string
): void {
  if (isV1Request(req)) {
    sendProblem(res, problem, message);
    return;
  }
  res.status(problem.status).json({ status: "error", message });
}
