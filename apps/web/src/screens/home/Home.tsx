import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, dataOrThrow } from "../../api";
import { ClockTime } from "../../quests/ClockTime";
import { useSession } from "../../session";
import { Banner } from "../../ui/Banner";
import { EmailReminder } from "../account/EmailReminder";
import styles from "./Home.module.css";
import { Landing } from "./Landing";

/** Starting or resetting a quest sends no live update, so this is how it shows. */
const REFRESH_MS = 30_000;

async function fetchQuests(userName: string) {
  const quests: Schemas["QuestSummary"][] = [];
  let after: string | undefined;
  do {
    const page = dataOrThrow(
      await api.GET("/users/{userName}/quests", {
        params: { path: { userName }, query: { after } },
      })
    );
    quests.push(...page.items);
    after = page.next ?? undefined;
  } while (after);
  return quests;
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

/** The site's home: a player's quests, once started, or the landing page. */
export function Home() {
  const session = useSession();
  const user = session.data?.user;
  const quests = useQuery({
    queryKey: ["users", user?.userName, "quests"],
    queryFn: () => fetchQuests(user?.userName ?? ""),
    enabled: Boolean(user),
    refetchInterval: REFRESH_MS,
  });

  if (session.data === null) {
    return <Landing />;
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
