import type { Schemas } from "@puzzlequest/api-client";
import { copy } from "../../copy";
import { ClockTime } from "../../quests/ClockTime";
import { formatDuration } from "../../quests/clock";
import {
  QUEST_COMPLETED,
  QUEST_NOT_STARTED,
  STEP_COMPLETED,
} from "../../quests/status";
import { ProgressTrail } from "../../ui/ProgressTrail";
import styles from "./Board.module.css";

/**
 * One entry on the board: its name, clock, and how far it has got. A quest
 * with one entry shows it filling the screen, under the quest's name; a race
 * lists each, smaller, under its team's or player's name. While a race is
 * under way the board gets no stops, so then each shows its time alone.
 */
export function BoardEntry({
  title,
  entry,
  compact,
}: {
  /** The quest's name, or, in a race, the entrant's. */
  title: string;
  entry: Schemas["SpectatorQuestEntry"];
  /** Whether it's one of several, so smaller and without the IDs. */
  compact: boolean;
}) {
  const completed = entry.status === QUEST_COMPLETED;
  const stepNumber = entry.puzzles.length;
  const step = entry.puzzles.at(-1);
  const Heading = compact ? "h2" : "h1";
  return (
    <section
      className={`${styles.entry} ${compact ? styles.compact : ""}`}
      data-entry-id={entry.id}
    >
      {/* Paused goes beside the name, so that showing it moves nothing else,
          and pushes nothing off the bottom of the screen. */}
      <div className={styles.heading}>
        <Heading className={styles.name}>{title}</Heading>
        {entry.paused && (
          <p
            id={compact ? undefined : "paused-banner"}
            className={styles.paused}
            role="status"
          >
            Paused by the puzzle master
          </p>
        )}
      </div>
      {entry.status === QUEST_NOT_STARTED ? (
        <p
          id={compact ? undefined : "board-not-started"}
          className={styles.notStarted}
        >
          Starting soon
        </p>
      ) : (
        <>
          <ClockTime
            className={styles.clock}
            clock={entry.progress}
            show="total"
          />
          {entry.progress.penaltyMs > 0 && (
            <p className={styles.penalties}>
              including {formatDuration(entry.progress.penaltyMs)} in hint
              penalties
            </p>
          )}
          {completed && !step && (
            <p className={styles.step}>{copy.questFinished}</p>
          )}
          {step && (
            <div className={styles.progress}>
              <ProgressTrail
                stepNumber={stepNumber}
                done={step.status === STEP_COMPLETED}
                open={!completed}
              />
              {completed ? (
                <p className={styles.step}>{copy.questFinished}</p>
              ) : (
                <p className={styles.step}>
                  <span className={styles.stepNumber}>
                    {copy.stepLabel(stepNumber)}
                  </span>{" "}
                  {step.displayName}
                  <span className={styles.stepStatus}>
                    {step.statusDescription}
                  </span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
