import { Suspense, lazy } from "react";
import { ScrollRestoration } from "react-router";
import { isAdministrator, isStaff, useSession } from "../../session";
import { PageShell } from "../../ui/PageShell";
import { QuestScreen } from "./QuestScreen";

// Administrators download the console only when they open it.
const QuestConsolePage = lazy(() => import("../questConsole/QuestConsole"));
// Staff, likewise, download their view only when they open it.
const StaffQuest = lazy(() => import("../staff/StaffQuest"));

/**
 * A quest's page, which shows players where they've got to, staff every stop
 * and how the players are doing, and administrators the console for running
 * it. All are at the quest's one address, so links and bookmarks work for
 * each.
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
      ) : isStaff(session.data?.user) ? (
        <PageShell>
          <Suspense fallback={null}>
            <StaffQuest />
          </Suspense>
        </PageShell>
      ) : (
        <PageShell>
          <QuestScreen />
        </PageShell>
      )}
      <ScrollRestoration />
    </>
  );
}
