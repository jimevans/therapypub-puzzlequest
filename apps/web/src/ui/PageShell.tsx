import type { ReactNode } from "react";
import { useSession } from "../session";
import styles from "./PageShell.module.css";

/** Links for whoever is signed in. Some lead to pages not yet in this app. */
function AccountLinks() {
  const { data: session } = useSession();
  if (!session) {
    return null;
  }
  return (
    <nav className={styles.links} aria-label="Account">
      <a href="/">Home</a>
      <a href={`/user/${encodeURIComponent(session.user.userName)}`}>Profile</a>
      <a href="/logout">Sign out</a>
    </nav>
  );
}

/** The frame of every page: the site's name, and the page's content. */
export function PageShell({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.name} href="/">
          PuzzleQuest
        </a>
        <AccountLinks />
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
