import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { messageOf } from "../../api";
import { ClockTime } from "../../quests/ClockTime";
import { Banner } from "../../ui/Banner";
import {
  entrantLabel,
  inLeaderboardOrder,
  ordinal,
  overallState,
} from "../../quests/entrants";
import styles from "./Staff.module.css";
import { staffQuestsQuery } from "./staffQueries";

type Quest = Schemas["StaffQuestSummary"];
type Entry = Quest["entries"][number];

/** An entry's team or player, and how it's doing. */
function entryDetail(entry: Entry): string {
  return `${entrantLabel(entry.entrant)} · ${entry.statusDescription}${
    entry.paused ? ", paused" : ""
  }`;
}

function QuestCard({ quest }: { quest: Quest }) {
  const [only] = quest.entries;
  return (
    <li className={styles.quest} data-quest-name={quest.questName}>
      <Link
        className={styles.name}
        to={`/quest/${encodeURIComponent(quest.questName)}`}
      >
        {quest.displayName}
      </Link>
      {quest.entries.length === 1 && only ? (
        <>
          <span className={styles.detail}>{entryDetail(only)}</span>
          {only.progress.startTime && (
            <ClockTime
              className={styles.clock}
              clock={only.progress}
              show="total"
            />
          )}
        </>
      ) : (
        // A race: each team or player on a line, with its time, in
        // leaderboard order, with its rank once it has finished.
        <ul className={styles.entries}>
          {inLeaderboardOrder(quest.entries, (entry) => entry).map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.rank !== null && `${ordinal(entry.rank)} · `}
                {entryDetail(entry)}
              </span>
              {entry.progress.startTime && (
                <ClockTime
                  className={styles.time}
                  clock={entry.progress}
                  show="total"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Staff's home: every quest, to choose one to follow. */
export default function StaffHome() {
  const quests = useQuery(staffQuestsQuery);
  // Those under way first, then those yet to start, then those finished.
  const order = ["underWay", "notStarted", "finished"];
  const sorted = [...(quests.data ?? [])].sort(
    (a, b) =>
      order.indexOf(overallState(a.entries)) -
      order.indexOf(overallState(b.entries))
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
          <QuestCard key={quest.questName} quest={quest} />
        ))}
      </ul>
    </>
  );
}
