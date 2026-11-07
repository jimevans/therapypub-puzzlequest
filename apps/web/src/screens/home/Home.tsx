import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router";
import { api, dataOrThrow } from "../../api";
import { ClockTime } from "../../quests/ClockTime";
import { fetchAllPages } from "../../fetchAllPages";
import { Suspense, lazy } from "react";
import { isAdministrator, isStaff, useSession } from "../../session";
import { Banner } from "../../ui/Banner";
import { EmailReminder } from "../account/EmailReminder";
import styles from "./Home.module.css";
import { Landing } from "./Landing";

// Staff download their list only when they open it.
const StaffHome = lazy(() => import("../staff/StaffHome"));

/** Starting or resetting a quest sends no live update, so this is how it shows. */
const REFRESH_MS = 30_000;

function fetchQuests(userName: string) {
  return fetchAllPages(async (after) =>
    dataOrThrow(
      await api.GET("/users/{userName}/quests", {
        params: { path: { userName }, query: { after } },
      })
    )
  );
}

function QuestCard({ quest }: { quest: Schemas["QuestSummary"] }) {
  return (
    <li className={styles.quest} data-quest-name={quest.name}>
      <Link
        className={styles.name}
        to={`/quest/${encodeURIComponent(quest.name)}`}
      >
        {quest.displayName}
      </Link>
      <span className={styles.status}>{quest.statusDescription}</span>
      <ClockTime className={styles.clock} clock={quest.progress} show="total" />
    </li>
  );
}

/**
 * The site's home: a player's quests, once started; the landing page for anyone
 * signed out; and the administrators' lists for them.
 */
export function Home() {
  const session = useSession();
  const user = session.data?.user;
  const quests = useQuery({
    queryKey: ["users", user?.userName, "quests"],
    queryFn: () => fetchQuests(user?.userName ?? ""),
    enabled: Boolean(user) && !isAdministrator(user) && !isStaff(user),
    refetchInterval: REFRESH_MS,
  });

  if (session.data === null) {
    return <Landing />;
  }
  if (isAdministrator(user)) {
    return <Navigate to="/quests" replace />;
  }
  if (isStaff(user)) {
    return (
      <Suspense fallback={null}>
        <StaffHome />
      </Suspense>
    );
  }

  return (
    <>
      <title>Your quests · PuzzleQuest</title>
      {user && !user.emailVerified && (
        <EmailReminder userName={user.userName} />
      )}
      <h1>Your quests</h1>
      {(session.isError || (quests.isError && !quests.data)) && (
        <Banner tone="danger">
          Couldn't load your quests. Check your connection and try again.
        </Banner>
      )}
      {quests.data?.length === 0 && <p>You have no quests yet.</p>}
      {quests.data && quests.data.length > 0 && (
        <ul className={styles.quests}>
          {quests.data.map((quest) => (
            <QuestCard key={quest.name} quest={quest} />
          ))}
        </ul>
      )}
    </>
  );
}
