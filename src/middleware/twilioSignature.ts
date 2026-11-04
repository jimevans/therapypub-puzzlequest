import type { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import { config } from "../config.js";

/** The header in which Twilio sends its signature of a webhook request. */
export const TWILIO_SIGNATURE_HEADER = "x-twilio-signature";

/**
 * Rejects webhook requests that weren't sent by Twilio. Twilio signs each
 * request with the account's auth token, over the URL it called and the
 * form fields it sent. That URL is the one configured in the Twilio console,
 * which is rebuilt here from PQ_BASE_URL, so the two must match. Requests are
 * rejected when the auth token or base URL isn't configured. A rejected
 * request is answered with a bare 403, which tells its sender nothing.
 * @param req the request
 * @param res the response
 * @param next the next handler
 */
export function requireTwilioSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!config.PQ_TWILIO_AUTH_TOKEN || !config.PQ_BASE_URL) {
    console.error(
      "Rejected a Twilio webhook: PQ_TWILIO_AUTH_TOKEN and PQ_BASE_URL must be set to check its signature"
    );
    res.status(403).type("text").send("Forbidden");
    return;
  }
  const signature = req.get(TWILIO_SIGNATURE_HEADER);
  const url = new URL(req.originalUrl, config.PQ_BASE_URL).href;
  if (
    !signature ||
    !twilio.validateRequest(
      config.PQ_TWILIO_AUTH_TOKEN,
      signature,
      url,
      req.body ?? {}
    )
  ) {
    res.status(403).type("text").send("Forbidden");
    return;
  }
  next();
}
