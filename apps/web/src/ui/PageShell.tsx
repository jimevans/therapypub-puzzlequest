import type { ReactNode } from "react";
import styles from "./PageShell.module.css";

/** The frame of every page: the site's name, and the page's content. */
export function PageShell({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.name} href="/">
          PuzzleQuest
        </a>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
