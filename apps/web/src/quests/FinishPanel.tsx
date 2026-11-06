import type { ReactNode } from "react";
import { copy } from "../copy";
import styles from "./FinishPanel.module.css";

/** The moment a quest ends: the line reaches its last stop. */
export function FinishPanel({ children }: { children: ReactNode }) {
  return (
    <section id="quest-finished" className={styles.finish}>
      <div className={styles.finishLine} aria-hidden="true">
        <span className={styles.finishRail} />
        <span className={styles.finishStop} />
      </div>
      <h2>{copy.questFinished}</h2>
      <p>{children}</p>
    </section>
  );
}
