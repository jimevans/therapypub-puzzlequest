import { LinkButton } from "../../ui/LinkButton";
import styles from "./Home.module.css";

/**
 * What someone signed out sees first. It's deliberately plain: a commercial
 * landing page will probably be a separate static page, better for searches.
 */
export function Landing() {
  return (
    <>
      <title>PuzzleQuest</title>
      <h1>Welcome to the PuzzleMaster's domain</h1>
      <p>Are you ready to play?</p>
      <div className={styles.landingActions}>
        <LinkButton id="login" to="/login" variant="primary">
          Sign in
        </LinkButton>
        {/* Reloads, because sign-up isn't in this app yet. */}
        <LinkButton id="register" to="/user/register" reloadDocument>
          Sign up
        </LinkButton>
      </div>
    </>
  );
}
