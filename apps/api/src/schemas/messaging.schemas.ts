import { z } from "zod";
import { parseSolutionKeywords } from "../domain/quest/solution.js";
import type { Outgoing } from "../services/messaging.service.js";
import { requiredText } from "./common.js";

/**
 * POST /api/v1/quests/{questName}/text-messages. A reply to wait for needs the
 * confirmation to send back when it arrives.
 */
export const sendTextBody = z
  .object({
    message: requiredText
      .max(1600, "Must be at most 1600 characters")
      .optional()
      .meta({
        description:
          "What to send. Required, unless sending a kept challenge again by its challengeId.",
      }),
    expectedResponse: z.string().optional().meta({
      description:
        "To set a challenge: the keywords a right answer contains, separated by commas. Letter case, accents, spacing, and punctuation don't matter, as for puzzle answers. The challenge is kept with the quest, so it can be sent again.",
    }),
    responseConfirmation: z.string().optional().meta({
      description:
        "What a right answer to the challenge shows the players, in the app or texted back, for them to show the venue's staff.",
    }),
    challengeId: z.string().min(1).optional().meta({
      description:
        "To send one of the quest's kept challenges again, as it was kept (see GET /quests/{questName}/challenges), instead of a message.",
    }),
  })
  .refine((body) => !body.expectedResponse || body.responseConfirmation, {
    message: "A reply to wait for needs a confirmation to send back",
    path: ["responseConfirmation"],
  })
  .refine(
    (body) =>
      !body.expectedResponse ||
      parseSolutionKeywords(body.expectedResponse).length > 0,
    { message: "Give at least one keyword", path: ["expectedResponse"] }
  )
  .refine((body) => body.message || body.challengeId, {
    message: "Required, unless sending a kept challenge again",
    path: ["message"],
  })
  .refine(
    (body) =>
      !body.challengeId ||
      (!body.message && !body.expectedResponse && !body.responseConfirmation),
    {
      message: "A kept challenge is sent again as it was kept, on its own",
      path: ["challengeId"],
    }
  );
export type SendTextBody = z.output<typeof sendTextBody>;

/**
 * Turns a request to send a message into what the messaging service sends.
 * @param body the request's body
 * @returns the message, with the challenge it sets, or the kept challenge
 */
export function toOutgoing(body: SendTextBody): Outgoing {
  if (body.challengeId) {
    return { challengeId: body.challengeId };
  }
  const { expectedResponse, responseConfirmation } = body;
  return {
    message: body.message ?? "",
    ...(expectedResponse && responseConfirmation
      ? { reply: { expectedResponse, responseConfirmation } }
      : {}),
  };
}

/** POST /api/v1/quests/{questName}/challenge/answers */
export const answerChallengeBody = z.object({
  answer: requiredText.max(1600, "Must be at most 1600 characters").meta({
    description: "The players' answer to the challenge they were sent.",
  }),
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
