import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import styles from "./QuestConsole.module.css";
import { eventsQuery } from "./consoleData";
import { describeEvent } from "./describeEvent";

/** How many of the latest events show until the administrator asks for all. */
const SHOWN_AT_FIRST = 20;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** What has happened in the quest, newest first, including before any reset. */
export function ActivityLog({ quest }: { quest: Schemas["Quest"] }) {
  const events = useQuery(eventsQuery(quest.name));
  const [showAll, setShowAll] = useState(false);
  const labels = new Map(
    quest.puzzles.map((puzzle) => [
      puzzle.puzzleName,
      puzzle.displayName ?? puzzle.puzzleName,
    ])
  );
  const newestFirst = [...(events.data ?? [])].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, SHOWN_AT_FIRST);

  return (
    <section
      id="activity"
      className={styles.section}
      aria-labelledby="activity-heading"
    >
      <h2 id="activity-heading">Activity</h2>
      {events.isError && (
        <Banner tone="danger">{messageOf(events.error)}</Banner>
      )}
      {events.data?.length === 0 && <p>Nothing has happened yet.</p>}
      <ol className={styles.activity}>
        {shown.map((event, index) => (
          // Events have no IDs of their own, and the list only grows at the top.
          <li key={newestFirst.length - index}>
            <time dateTime={event.at}>
              {timeFormat.format(Date.parse(event.at))}
            </time>
            <span>
              {describeEvent(event, (name) => labels.get(name) ?? name)}
              {event.actor ? (
                <span className={styles.actor}> by {event.actor}</span>
              ) : (
                event.actorDeleted && (
                  <span className={styles.actor}> by a deleted player</span>
                )
              )}
            </span>
          </li>
        ))}
      </ol>
      {!showAll && newestFirst.length > SHOWN_AT_FIRST && (
        <Button onPress={() => setShowAll(true)}>
          Show all {newestFirst.length}
        </Button>
      )}
    </section>
  );
}
