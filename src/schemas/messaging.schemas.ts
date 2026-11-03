import { z } from "zod";
import { requiredText } from "./common.js";

/** POST /api/messaging/outgoing/text */
export const sendTextBody = z.object({
  questName: requiredText,
  message: requiredText.max(1600, "Must be at most 1600 characters"),
  /** A reply to wait for, and the confirmation to send when it arrives. */
  expectedResponse: z.string().optional(),
  responseConfirmation: z.string().optional(),
});
export type SendTextBody = z.infer<typeof sendTextBody>;

/**
 * Twilio's webhooks (signature-checked before this). From is the caller's
 * number in E.164 format; a caller who hides it has a placeholder instead.
 */
export const incomingCallBody = z.object({
  From: z.string().default(""),
});
export type IncomingCallBody = z.infer<typeof incomingCallBody>;

export const incomingTextBody = z.object({
  From: z.string().default(""),
  Body: z.string().default(""),
});
export type IncomingTextBody = z.infer<typeof incomingTextBody>;
