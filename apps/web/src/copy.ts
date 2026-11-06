// Words that belong to the transit metaphor, which may change: the line is here
// to stay as a way of showing progress, but "stop" and "end of the line" may
// not be. Everything else calls these things steps, in neutral terms, so that
// changing the wording means changing only this file.

export const copy = {
  /** What a step of a quest is called, by its place in the quest. */
  stepLabel: (stepNumber: number) => `Stop ${stepNumber}`,
  /** Describes the list of steps reached, for screen readers. */
  stepsReached: "Stops reached",
  /** Says that the quest is over. */
  questFinished: "End of the line",
  /** Goes on to the step just reached. */
  goToNextStep: (displayName: string) => `On to ${displayName}`,
};
