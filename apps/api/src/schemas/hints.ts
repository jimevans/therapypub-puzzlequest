// The schemas of a puzzle's hints that both the API's resources and its live
// updates use.
import { z } from "zod";

/** A time penalty, in whole seconds. */
export const timePenaltySeconds = z.number().int().nonnegative();

/** What revealing a puzzle's next hint would cost. */
export const nextHintSchema = z
  .object({
    timePenaltySeconds: timePenaltySeconds.meta({
      description: "Seconds revealing it adds to the players' time.",
    }),
    solutionWarning: z.boolean().meta({
      description:
        "True if the hint gives the solution away, so a client can warn first.",
    }),
  })
  .meta({
    // Only responses and live updates have it, but the API's description
    // also renders live updates as input, under the input ID, which
    // createOpenApiDocument then leaves out as unused.
    id: "NextHintInput",
    outputId: "NextHint",
    description: "What revealing the puzzle's next hint would cost.",
  });
export type NextHint = z.infer<typeof nextHintSchema>;

/**
 * Describes a puzzle's next hint, as the API shows it.
 * @param hint the hint's definition, if there is one
 * @returns what revealing it would cost, or null if there is none
 */
export function toNextHint(
  hint: { timePenalty: number; solutionWarning: boolean } | null | undefined
): NextHint | null {
  return hint
    ? {
        timePenaltySeconds: hint.timePenalty,
        solutionWarning: hint.solutionWarning,
      }
    : null;
}
