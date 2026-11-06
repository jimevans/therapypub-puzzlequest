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
 * One quest on the board: its name, clock, and how far it has got. It stands
 * alone so that a board can list several, once quests can be raced.
 */
export function BoardEntry({ quest }: { quest: Schemas["SpectatorQuest"] }) {
  const completed = quest.status === QUEST_COMPLETED;
  const stepNumber = quest.puzzles.length;
  const step = quest.puzzles.at(-1);
  return (
    <section className={styles.entry} data-quest-name={quest.name}>
      {/* Paused goes beside the name, so that showing it moves nothing else,
          and pushes nothing off the bottom of the screen. */}
      <div className={styles.heading}>
        <h1 className={styles.name}>{quest.displayName}</h1>
        {quest.paused && (
          <p id="paused-banner" className={styles.paused} role="status">
            Paused by the puzzle master
          </p>
        )}
      </div>
      {quest.status === QUEST_NOT_STARTED ? (
        <p id="board-not-started" className={styles.notStarted}>
          Starting soon
        </p>
      ) : (
        <>
          <ClockTime
            className={styles.clock}
            clock={quest.progress}
            show="total"
          />
          {quest.progress.penaltyMs > 0 && (
            <p className={styles.penalties}>
              including {formatDuration(quest.progress.penaltyMs)} in hint
              penalties
            </p>
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
