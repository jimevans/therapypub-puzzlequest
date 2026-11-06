import styles from "./PuzzleContent.module.css";

/** A completed puzzle's solution. */
export function PuzzleSolution({
  skipped,
  text,
}: {
  skipped: boolean;
  text: string | null;
}) {
  return (
    <section id="solution" className={styles.solution}>
      <h2>{skipped ? "Skipped" : "Solved"}</h2>
      <p id="solution-text">{text}</p>
    </section>
  );
}
