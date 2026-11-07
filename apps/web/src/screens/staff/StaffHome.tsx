import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { messageOf } from "../../api";
import { ClockTime } from "../../quests/ClockTime";
import { Banner } from "../../ui/Banner";
import styles from "./Staff.module.css";
import { assigneeOf } from "./assignee";
import { staffQuestsQuery } from "./staffQueries";

function QuestCard({ quest }: { quest: Schemas["StaffQuestSummary"] }) {
  return (
    <li className={styles.quest} data-quest-name={quest.name}>
      <Link
        className={styles.name}
        to={`/quest/${encodeURIComponent(quest.name)}`}
      >
        {quest.displayName}
      </Link>
      <span className={styles.detail}>
        {assigneeOf(quest.assignee)} · {quest.statusDescription}
        {quest.paused && ", paused"}
      </span>
      {quest.progress.startTime && (
        <ClockTime
          className={styles.clock}
          clock={quest.progress}
          show="total"
        />
      )}
    </li>
  );
}

/** Staff's home: every quest, to choose one to follow. */
export default function StaffHome() {
  const quests = useQuery(staffQuestsQuery);
  // Those under way first, then those yet to start, then those finished.
  const order = [1, 0, 2];
  const sorted = [...(quests.data ?? [])].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status)
  );

  return (
    <>
      <title>Quests · PuzzleQuest</title>
      <h1>Quests</h1>
      <p className={styles.intro}>
        Choose a quest to see every stop, and how far the players have got.
      </p>
      {quests.isError && (
        <Banner tone="danger">{messageOf(quests.error)}</Banner>
      )}
      {quests.data?.length === 0 && <p>There are no quests yet.</p>}
      <ul id="staff-quests" className={styles.quests}>
        {sorted.map((quest) => (
          <QuestCard key={quest.name} quest={quest} />
        ))}
      </ul>
    </>
  );
}
