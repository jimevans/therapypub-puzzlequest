import { rateLimit } from "express-rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const rateLimitedResponse = {
  status: "error",
  message: "Too many requests; please try again later",
};

/**
 * Limits failed sign-in attempts from a single client.
 */
export const loginRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
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
