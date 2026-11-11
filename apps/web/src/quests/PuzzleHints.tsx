import type { Schemas } from "@puzzlequest/api-client";
import { formatPenalty } from "./clock";
import styles from "./PuzzleContent.module.css";

/** The hints revealed so far, and what each one cost. */
export function PuzzleHints({
  hints,
}: {
  hints: Schemas["PlayerPuzzle"]["puzzle"]["hints"];
}) {
  if (hints.length === 0) {
    return null;
  }
  return (
    <ol id="hints" className={styles.hints}>
      {hints.map((hint, index) => (
        <li key={index} className={styles.hint}>
          <span className={styles.hintHeading}>
            Hint {index + 1}
            {hint.timePenaltySeconds > 0 &&
              `, ${formatPenalty(hint.timePenaltySeconds)}`}
          </span>
          {hint.text}
        </li>
      ))}
    </ol>
  );
}
