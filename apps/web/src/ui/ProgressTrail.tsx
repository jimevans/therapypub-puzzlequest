import styles from "./ProgressTrail.module.css";

interface ProgressTrailProps {
  /** Which step this is, counting from 1. */
  stepNumber: number;
  /** Whether this step is finished, rather than still being worked on. */
  done: boolean;
  /**
   * The line carries on past this step into the unknown. Players never learn
   * how long a quest is, so it must stay open until the quest is over.
   */
  open: boolean;
}

/**
 * A short strip of the line, showing how far along the current step is. It's
 * decoration, so whatever uses it must say which step this is in words.
 */
export function ProgressTrail({ stepNumber, done, open }: ProgressTrailProps) {
  return (
    <div className={styles.trail} aria-hidden="true">
      {Array.from({ length: stepNumber - 1 }, (_, index) => (
        <span key={index} className={styles.passed} />
      ))}
      <span className={done ? styles.done : styles.current} />
      <span className={open ? styles.ahead : styles.end} />
    </div>
  );
}
