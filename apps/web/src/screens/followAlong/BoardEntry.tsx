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
 * A quest's one entry on the board, filling the screen under the quest's
 * name: its clock, and how far it has got. (A race shows the leaderboard
 * instead.)
 */
export function BoardEntry({
  title,
  entry,
}: {
  /** The quest's name. */
  title: string;
  entry: Schemas["SpectatorQuestEntry"];
}) {
  const completed = entry.status === QUEST_COMPLETED;
  const stepNumber = entry.puzzles.length;
  const step = entry.puzzles.at(-1);
  return (
    <section className={styles.entry} data-entry-id={entry.id}>
      {/* Paused goes beside the name, so that showing it moves nothing else,
          and pushes nothing off the bottom of the screen. */}
      <div className={styles.heading}>
        <h1 className={styles.name}>{title}</h1>
        {entry.paused && (
          <p id="paused-banner" className={styles.paused} role="status">
            Paused by the puzzle master
          </p>
        )}
      </div>
      {entry.status === QUEST_NOT_STARTED ? (
        <p id="board-not-started" className={styles.notStarted}>
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
