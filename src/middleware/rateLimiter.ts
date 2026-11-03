import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const rateLimitedResponse = {
  status: "error",
  message: "Too many requests; please try again later",
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
  message: rateLimitedResponse,
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
  message: rateLimitedResponse,
});

/**
 * Limits password change, reset, and reset request attempts from a single client.
 */
export const passwordRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedResponse,
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
  message: rateLimitedResponse,
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
  message: rateLimitedResponse,
});
