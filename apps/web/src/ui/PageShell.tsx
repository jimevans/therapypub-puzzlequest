import type { ReactNode } from "react";
import { useInRouterContext } from "react-router";
import { useSession } from "../session";
import { FocusOnNavigate } from "./FocusOnNavigate";
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
export function PageShell({
  children,
  wide = false,
}: {
  children?: ReactNode;
  /** For tables and other pages used mainly on a laptop. */
  wide?: boolean;
}) {
  const inRouter = useInRouterContext();
  return (
    <div className={styles.shell}>
      {inRouter && <FocusOnNavigate />}
      <header className={styles.header}>
        <a className={styles.name} href="/">
          PuzzleQuest
        </a>
        <AccountLinks />
      </header>
      <main className={`${styles.content} ${wide ? styles.wide : ""}`}>
        {children}
      </main>
    </div>
  );
}
