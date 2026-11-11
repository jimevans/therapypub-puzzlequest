// What screen readers are told when a quest changes while it's on screen,
// such as a teammate solving a puzzle or the puzzle master pausing the quest:
// a sighted player sees it happen; these say it. The running clock isn't
// announced. See ui/Announcement.tsx.
import type { Schemas } from "@puzzlequest/api-client";
import { copy } from "../copy";
import {
  QUEST_COMPLETED,
  STEP_AWAITING_ACTIVATION,
  STEP_COMPLETED,
  STEP_NOT_REACHED,
} from "./status";

/** A quest's progress, as far as announcing it goes. */
export interface ProgressSnapshot {
  paused: boolean;
  finished: boolean;
  steps: { name: string; displayName: string; solved: boolean }[];
}

/**
 * Says whether the quest was paused or resumed.
 * @param previous whether it was paused
 * @param current whether it is
 * @returns what to say, if anything
 */
function pausing(previous: boolean, current: boolean): string | null {
  if (previous === current) {
    return null;
  }
  return current
    ? "Paused by the puzzle master. The clock is stopped."
    : "The quest has resumed.";
}

/**
 * Describes what changed in a quest's progress.
 * @param previous the progress before
 * @param current the progress now
 * @returns what to say, or null if nothing worth saying changed
 */
export function describeProgress(
  previous: ProgressSnapshot,
  current: ProgressSnapshot
): string | null {
  const said: (string | null)[] = [pausing(previous.paused, current.paused)];
  current.steps.forEach((step, index) => {
    const before = previous.steps.find(({ name }) => name === step.name);
    if (!before) {
      said.push(copy.stepReached(index + 1, step.displayName));
    } else if (step.solved && !before.solved) {
      said.push(`${step.displayName} is solved.`);
    }
  });
  if (current.finished && !previous.finished) {
    said.push(`${copy.questFinished}.`);
  }
  const words = said.filter((line) => line !== null);
  return words.length > 0 ? words.join(" ") : null;
}

/** A puzzle, as far as announcing it goes. */
export interface PuzzleSnapshot {
  paused: boolean;
  status: Schemas["StopStatus"];
  skipped: boolean;
  solutionText: string | null;
  hints: string[];
  questFinished: boolean;
}

/**
 * Describes what changed in a puzzle on screen.
 * @param previous the puzzle before
 * @param current the puzzle now
 * @returns what to say, or null if nothing worth saying changed
 */
export function describePuzzle(
  previous: PuzzleSnapshot,
  current: PuzzleSnapshot
): string | null {
  const said: (string | null)[] = [pausing(previous.paused, current.paused)];
  if (
    previous.status === STEP_AWAITING_ACTIVATION &&
    current.status !== STEP_AWAITING_ACTIVATION
  ) {
    said.push("The puzzle is started.");
  }
  if (previous.status !== STEP_COMPLETED && current.status === STEP_COMPLETED) {
    said.push(
      current.skipped
        ? "Skipped by the puzzle master."
        : `Solved${current.solutionText ? `: ${current.solutionText}` : ""}.`
    );
  }
  for (const hint of current.hints.slice(previous.hints.length)) {
    said.push(`Hint: ${hint}`);
  }
  if (current.questFinished && !previous.questFinished) {
    said.push(`${copy.questFinished}.`);
  }
  const words = said.filter((line) => line !== null);
  return words.length > 0 ? words.join(" ") : null;
}

/** Whether a quest's status means it's over. */
export function isFinished(status: Schemas["QuestStatus"]): boolean {
  return status === QUEST_COMPLETED;
}

/**
 * Takes the snapshot of a quest's progress, from the steps reached: players
 * and spectators get only those, and staff and administrators get every
 * step.
 * @param quest whether it's paused, and its status
 * @param steps its steps, in order
 * @returns the snapshot
 */
export function progressSnapshot(
  quest: { paused: boolean; status: Schemas["QuestStatus"] },
  steps: {
    puzzleName: string;
    displayName?: string;
    status: Schemas["StopStatus"];
  }[]
): ProgressSnapshot {
  return {
    paused: quest.paused,
    finished: isFinished(quest.status),
    steps: steps
      .filter((step) => step.status !== STEP_NOT_REACHED)
      .map((step) => ({
        name: step.puzzleName,
        displayName: step.displayName ?? step.puzzleName,
        solved: step.status === STEP_COMPLETED,
      })),
  };
}
