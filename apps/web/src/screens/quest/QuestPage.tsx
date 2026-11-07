import { Suspense, lazy } from "react";
import { ScrollRestoration } from "react-router";
import { isAdministrator, useSession } from "../../session";
import { PageShell } from "../../ui/PageShell";
import { QuestScreen } from "./QuestScreen";

// Administrators download the console only when they open it.
const QuestConsolePage = lazy(() => import("../questConsole/QuestConsole"));

/**
 * A quest's page, which shows players where they've got to and administrators
 * the console for running it. Both are at the quest's one address, so links and
 * bookmarks work for each.
 */
export function QuestPage() {
  const session = useSession();

  if (session.isPending) {
    return <PageShell />;
  }
  return (
    <>
      {isAdministrator(session.data?.user) ? (
        <Suspense fallback={<PageShell wide />}>
          <QuestConsolePage />
        </Suspense>
      ) : (
        <PageShell>
          <QuestScreen />
        </PageShell>
      )}
      <ScrollRestoration />
    </>
  );
}
