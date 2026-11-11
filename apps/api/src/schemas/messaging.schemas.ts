import { z } from "zod";
import { requiredText } from "./common.js";

/**
 * POST /api/v1/quests/{questName}/text-messages. A reply to wait for needs the
 * confirmation to send back when it arrives.
 */
export const sendTextBody = z
  .object({
    message: requiredText.max(1600, "Must be at most 1600 characters"),
    expectedResponse: z.string().optional().meta({
      description:
        "A reply for the quest to wait for; letter case doesn't matter.",
    }),
    responseConfirmation: z.string().optional().meta({
      description: "What is texted back when the reply arrives.",
    }),
  })
  .refine((body) => !body.expectedResponse || body.responseConfirmation, {
    message: "A reply to wait for needs a confirmation to send back",
    path: ["responseConfirmation"],
  });

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
