// Errors from the v1 API are problem details (RFC 9457): a JSON object,
// sent as application/problem+json, whose "type" says what kind of problem
// it is, so clients can act on the type rather than parse the message.
import { STATUS_CODES } from "http";
import type { Request, Response } from "express";
import { z } from "zod";
import type { ServiceErrorReason } from "../types.js";
import { log } from "../logger.js";

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
 * such as a body that isn't valid JSON, is reported with the type
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
  alreadyExists: {
    type: "/problems/already-exists",
    title: "Already exists",
    status: 409,
    description:
      "Something with that name, email address, or join code already exists, or the user is already a member of the team.",
  },
  emailNotVerified: {
    type: "/problems/email-not-verified",
    title: "Email address not verified",
    status: 409,
    description:
      "The user hasn't verified their email address, so nothing can be sent to it that depends on it, such as a password reset link.",
  },
  incorrectPassword: {
    type: "/problems/incorrect-password",
    title: "Incorrect password",
    status: 422,
    description: "The current password given isn't the user's password.",
  },
  passwordNotAllowed: {
    type: "/problems/password-not-allowed",
    title: "Password not allowed",
    status: 422,
    description:
      "The new password doesn't meet the password policy, such as its length, or is the same as the current one.",
  },
  wrongJoinCode: {
    type: "/problems/wrong-join-code",
    title: "Wrong join code",
    status: 422,
    description: "The join code isn't the team's.",
  },
  invalidLink: {
    type: "/problems/invalid-link",
    title: "Link invalid or expired",
    status: 422,
    description:
      "The token from a password reset or email verification link isn't valid: it is malformed, already used, or expired.",
  },
  inUse: {
    type: "/problems/in-use",
    title: "In use",
    status: 409,
    description:
      "It can't be deleted while something uses it, such as a puzzle a quest includes. The detail says what uses it.",
  },
  invalidUpload: {
    type: "/problems/invalid-upload",
    title: "Upload not accepted",
    status: 400,
    description:
      "The upload is missing a field, sends its fields in the wrong order, or is a kind of file that isn't accepted.",
  },
  bodyTooLarge: {
    type: "/problems/body-too-large",
    title: "Request too large",
    status: 413,
    description: "The request's body is larger than the server reads.",
  },
  uploadTooLarge: {
    type: "/problems/upload-too-large",
    title: "Upload too large",
    status: 413,
    description: "The uploaded file is larger than allowed.",
  },
  invalidQuest: {
    type: "/problems/invalid-quest",
    title: "Quest not valid",
    status: 422,
    description:
      "The quest is assigned to a user or team that doesn't exist, or lists a puzzle that doesn't exist or appears twice.",
  },
  wrongState: {
    type: "/problems/wrong-state",
    title: "Not possible now",
    status: 409,
    description:
      "The quest or puzzle isn't in a state that allows this: for example, the quest has already started, isn't paused, or is completed, or the puzzle hasn't been reached or solved. The detail says which.",
  },
  questPaused: {
    type: "/problems/quest-paused",
    title: "Quest paused",
    status: 409,
    description:
      "The puzzle master has paused the quest; the players can't act until it resumes.",
  },
  tryAgain: {
    type: "/problems/try-again",
    title: "Changed at the same time",
    status: 409,
    description:
      "Someone else changed the quest at the same moment, several times over. Try again.",
  },
  wrongActivationCode: {
    type: "/problems/wrong-activation-code",
    title: "Wrong activation code",
    status: 422,
    description: "The activation code, typed or scanned, isn't the puzzle's.",
  },
  wrongAnswer: {
    type: "/problems/wrong-answer",
    title: "Not the answer",
    status: 422,
    description: "The guess isn't the puzzle's solution.",
  },
  noRecipients: {
    type: "/problems/no-recipients",
    title: "Nobody to text",
    status: 409,
    description:
      "Nobody the quest is assigned to has a phone number and accepts text messages.",
  },
  messagingFailed: {
    type: "/problems/messaging-failed",
    title: "Text message not sent",
    status: 502,
    description:
      "The text messaging service refused or failed to send a message. The details are logged.",
  },
  unreadableQrCode: {
    type: "/problems/unreadable-qr-code",
    title: "QR code not readable",
    status: 422,
    description:
      "No QR code could be read from the scanned image; try again, closer or with more light, or type the code.",
  },
  noMoreHints: {
    type: "/problems/no-more-hints",
    title: "No more hints",
    status: 409,
    description: "Every one of the puzzle's hints has been revealed.",
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
    requestId: z.string().optional().meta({
      description:
        "For an unexpected error, the request's ID, also in the X-Request-Id header: quote it when reporting the problem, to find it in the server's log.",
    }),
  })
  .meta({ id: "Problem" });
export type Problem = z.infer<typeof problemSchema>;

/** The media type of problem details. */
export const PROBLEM_MEDIA_TYPE = "application/problem+json";

/**
 * Determines whether a request is for the API, which reports errors as
 * problem details, rather than for a page.
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
  const requestId = res.req?.id;
  // Refusing a signed-in user is a security event, wherever it's decided:
  // by a route's access rule, or by a service, such as for a quest that
  // isn't theirs.
  if (problem.type === Problems.forbidden.type) {
    log().warn(
      { event: "forbidden", userId: res.req?.user?.id },
      "refused a request"
    );
  }
  const body: Problem = {
    type: problem.type,
    title: problem.title,
    status: problem.status,
    detail,
    ...extensions,
    ...(problem.status >= 500 && typeof requestId === "string"
      ? { requestId }
      : {}),
  };
  res
    .status(problem.status)
    .type(PROBLEM_MEDIA_TYPE)
    .send(JSON.stringify(body));
}

/** The kind of problem each reason a service operation fails stands for. */
const PROBLEM_FOR_REASON: Record<ServiceErrorReason, ProblemType> = {
  "not-found": Problems.notFound,
  "already-exists": Problems.alreadyExists,
  "incorrect-password": Problems.incorrectPassword,
  "password-not-allowed": Problems.passwordNotAllowed,
  "wrong-join-code": Problems.wrongJoinCode,
  "email-not-verified": Problems.emailNotVerified,
  "invalid-link": Problems.invalidLink,
  "in-use": Problems.inUse,
  forbidden: Problems.forbidden,
  "invalid-quest": Problems.invalidQuest,
  "wrong-state": Problems.wrongState,
  "quest-paused": Problems.questPaused,
  busy: Problems.tryAgain,
  "wrong-activation-code": Problems.wrongActivationCode,
  "wrong-answer": Problems.wrongAnswer,
  "no-recipients": Problems.noRecipients,
  "messaging-failed": Problems.messagingFailed,
};

/**
 * Sends the problem a failed service operation stands for, by its reason;
 * one without a reason is reported by its status code.
 * @param res the response
 * @param error the service's error result
 */
export function sendServiceProblem(
  res: Response,
  error: { statusCode: number; message: string; reason?: ServiceErrorReason }
): void {
  if (error.reason) {
    sendProblem(res, PROBLEM_FOR_REASON[error.reason], error.message);
    return;
  }
  if (error.statusCode >= 500) {
    sendProblem(res, Problems.unexpected, error.message);
    return;
  }
  sendProblem(
    res,
    {
      type: "about:blank",
      title: STATUS_CODES[error.statusCode] ?? "Error",
      status: error.statusCode,
    },
    error.message
  );
}
