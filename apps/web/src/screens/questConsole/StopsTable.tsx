import type { Schemas } from "@puzzlequest/api-client";
import { Link } from "react-router";
import { ClockTime } from "../../quests/ClockTime";
import {
  QUEST_COMPLETED,
  QUEST_NOT_STARTED,
  STEP_AWAITING_ACTIVATION,
  STEP_COMPLETED,
  STEP_IN_PROGRESS,
} from "../../quests/status";
import { Button } from "../../ui/Button";
import adminStyles from "../admin/Admin.module.css";
import styles from "./QuestConsole.module.css";

type Quest = Schemas["Quest"];
type QuestPuzzle = Quest["puzzles"][number];

interface StopsTableProps {
  quest: Quest;
  onSkip: (puzzle: QuestPuzzle) => void;
  onReset: (puzzle: QuestPuzzle) => void;
}

/** A puzzle's name as the quest shows it. */
export function puzzleLabel(puzzle: QuestPuzzle): string {
  return puzzle.displayName ?? puzzle.puzzleName;
}

/**
 * Every stop of the quest, in order, whether or not the players have reached
 * it, with what the puzzle master needs to run it.
 */
export function StopsTable({ quest, onSkip, onReset }: StopsTableProps) {
  const questPath = `/api/v1/quests/${encodeURIComponent(quest.name)}`;
  const running = quest.status !== QUEST_NOT_STARTED;
  const clockOf = (puzzleName: string) =>
    quest.progress.puzzles.find((clock) => clock.puzzleName === puzzleName);

  return (
    <div className={styles.stopsBox}>
      <table id="stops" className={`${adminStyles.table} ${styles.stops}`}>
        <thead>
          <tr>
            <th>Stop</th>
            <th>Puzzle</th>
            <th>Status</th>
            <th className={adminStyles.secondary}>Code</th>
            <th className={adminStyles.secondary}>Hints</th>
            <th className={adminStyles.secondary}>Time</th>
            <th className={adminStyles.secondary}>Solution</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {quest.puzzles.map((puzzle, index) => {
            const label = puzzleLabel(puzzle);
            const clock = clockOf(puzzle.puzzleName);
            const canSkip =
              quest.status !== QUEST_COMPLETED &&
              (puzzle.status === STEP_AWAITING_ACTIVATION ||
                puzzle.status === STEP_IN_PROGRESS);
            const canReset = running && puzzle.status === STEP_COMPLETED;
            return (
              <tr key={puzzle.puzzleName} data-puzzle-name={puzzle.puzzleName}>
                <td>{index + 1}</td>
                <td>
                  <Link to={`/puzzle/${encodeURIComponent(puzzle.puzzleName)}`}>
                    {label}
                  </Link>
                  {/* A phone has no room for the code's own column. */}
                  <span className={styles.phoneCode} aria-hidden="true">
                    {puzzle.activationCode}
                  </span>
                </td>
                <td>{puzzle.statusDescription}</td>
                <td className={`${adminStyles.secondary} ${styles.code}`}>
                  {puzzle.activationCode}
                </td>
                <td className={adminStyles.secondary}>
                  {puzzle.hints
                    ? `${puzzle.nextHintToDisplay} of ${puzzle.hints.length}`
                    : puzzle.nextHintToDisplay}
                </td>
                <td className={`${adminStyles.secondary} ${styles.time}`}>
                  {clock?.startTime ? (
                    <ClockTime clock={clock} show="total" />
                  ) : (
                    "–"
                  )}
                </td>
                <td className={adminStyles.secondary}>
                  {puzzle.solutionDisplayText}
                </td>
                <td className={adminStyles.rowActions}>
                  <a
                    href={`${questPath}/puzzles/${encodeURIComponent(puzzle.puzzleName)}/qr-code`}
                    download={`${quest.name}-${puzzle.puzzleName}-qr-code.png`}
                    aria-label={`QR code for ${label}`}
                  >
                    QR code
                  </a>
                  {canSkip && (
                    <Button
                      aria-label={`Skip ${label}`}
                      onPress={() => onSkip(puzzle)}
                    >
                      Skip
                    </Button>
                  )}
                  {canReset && (
                    <Button
                      aria-label={`Reset ${label}`}
                      onPress={() => onReset(puzzle)}
                    >
                      Reset
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
