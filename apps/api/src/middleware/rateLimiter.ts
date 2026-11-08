import {
  type RateLimitExceededEventHandler,
  ipKeyGenerator,
  rateLimit,
} from "express-rate-limit";
import { Problems, sendProblem } from "../api/problems.js";
import { log } from "../logger.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Answers a request over its limit. The RateLimit headers say when to try
 * again.
 */
const handler: RateLimitExceededEventHandler = (req, res) => {
  log().warn({ event: "rate-limited" }, "too many requests");
  sendProblem(
    res,
    Problems.tooManyRequests,
    "Too many requests; please try again later"
  );
};

/**
 * Limits failed sign-in attempts for one user name from one network
 * address. Players at a venue share an address, so this is per user name:
 * one player's mistakes don't lock out the others.
 */
export const loginRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.userName ?? "").toLowerCase()}`,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

/**
 * Limits failed sign-in attempts from one network address across all user
 * names, which stops someone trying a password against many accounts. It is
 * high enough for a venue full of players sharing an address.
 */
export const loginAddressRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 100,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

/**
 * Limits wrong guesses at a user's current password when changing it. It is
 * keyed by user rather than by IP address, because players at a venue often
 * share one network, and one player's mistakes mustn't lock out the others.
 * Must run after authorization.
 */
export const passwordChangeRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user?.userName ?? "",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

/**
 * Limits password reset and reset request attempts from a single client. Whoever
 * makes these isn't signed in, so the address is all there is to go on.
 */
export const passwordRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

/**
 * Limits failed puzzle activation attempts by a single user. It is keyed by
 * user rather than by IP address, because players at a venue often share one
 * network. Must run after requireUser.
 */
export const activationRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user?.userName ?? "",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

/**
 * Limits wrong join codes by a single user. A player joins a team by its code
 * alone, so any team's code works, and this stops trying codes until one does.
 * Keyed by user, like activationRateLimiter. Must run after requireUser.
 */
export const joinCodeRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user?.userName ?? "",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

/**
 * Limits wrong guesses at puzzle solutions by a single user. Wrong answers
 * are part of play, so the limit is generous; it stops guessing by script.
 * Keyed by user, like activationRateLimiter. Must run after requireUser.
 */
export const solutionRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 60,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user?.userName ?? "",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

/**
 * Limits failed attempts to verify an email address from one network
 * address. Players at a venue share an address, so it is generous; tokens
 * are random enough that guessing one isn't practical anyway.
 */
export const emailVerificationRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

/**
 * Limits how often a verification email can be sent for one account, so
 * the button can't be used to flood someone's inbox.
 */
export const verificationEmailRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 3,
  keyGenerator: (req) => String(req.params.userName ?? ""),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});
