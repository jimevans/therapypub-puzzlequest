import type { LiHTMLAttributes, ReactNode } from "react";
import styles from "./ProgressLine.module.css";

interface ProgressLineProps {
  /** Describes the list, for screen readers. */
  label: string;
  /**
   * The line carries on past its last step into the unknown. Players never
   * learn how long a quest is, so it must stay open until the quest is over.
   */
  open: boolean;
  children: ReactNode;
}

/** A vertical line of the steps reached so far. */
export function ProgressLine({ label, open, children }: ProgressLineProps) {
  return (
    <ol
      aria-label={label}
      className={`${styles.line} ${open ? styles.open : ""}`}
    >
      {children}
    </ol>
  );
}

interface ProgressStepProps extends LiHTMLAttributes<HTMLLIElement> {
  /** Done with, or still being worked on. */
  state: "done" | "current";
}

/** One step on a ProgressLine. */
export function ProgressStep({ state, ...props }: ProgressStepProps) {
  return <li {...props} className={`${styles.step} ${styles[state]}`} />;
}
