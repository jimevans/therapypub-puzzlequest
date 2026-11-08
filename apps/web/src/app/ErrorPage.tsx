import { isRouteErrorResponse, useRouteError } from "react-router";
import { Banner } from "../ui/Banner";
import buttonStyles from "../ui/Button.module.css";
import { PageShell } from "../ui/PageShell";

/**
 * Shown in place of a page that doesn't exist or that failed. It's part of what
 * every page downloads first, so it uses a plain button, leaving React Aria to
 * the screens that need it.
 */
export function ErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <PageShell>
        <title>Page not found · PuzzleQuest</title>
        <h1>Page not found</h1>
        <p>There's nothing at this address.</p>
      </PageShell>
    );
  }
  return (
    <PageShell>
      <title>Something went wrong · PuzzleQuest</title>
      <h1>Something went wrong</h1>
      <Banner tone="danger">This page couldn't be shown.</Banner>
      <p>
        <button
          type="button"
          className={`${buttonStyles.button} ${buttonStyles.primary}`}
          onClick={() => location.reload()}
        >
          Try again
        </button>
      </p>
    </PageShell>
  );
}
