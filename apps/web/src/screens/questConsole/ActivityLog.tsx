import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import styles from "./QuestConsole.module.css";
import { type EntrantRef, eventsQuery } from "./consoleData";
import { describeEvent } from "./describeEvent";

/** How many of the latest events show until the administrator asks for all. */
const SHOWN_AT_FIRST = 20;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

type QuestEvent = Schemas["QuestEvent"];

/**
 * Whether an event happened in an entrant's entry.
 * @param event the event
 * @param entrant the team or player
 * @returns true if so
 */
function isOf(event: QuestEvent, entrant: EntrantRef): boolean {
  return (
    event.entrant?.kind === entrant.kind && event.entrant.name === entrant.name
  );
}

/**
 * What has happened in the quest, newest first, including before any reset.
 * In a race it shows one entrant's events, or everyone's, each saying whose
 * it was.
 */
export function ActivityLog({
  quest,
  entrant,
  Heading = "h2",
}: {
  quest: Schemas["Quest"];
  /** In a race, the team or player whose events to show at first. */
  entrant?: EntrantRef;
  Heading?: "h2" | "h3";
}) {
  const events = useQuery(eventsQuery(quest.name));
  const [showAll, setShowAll] = useState(false);
  const [everyone, setEveryone] = useState(false);
  const labels = new Map(
    (quest.entries[0]?.puzzles ?? []).map((puzzle) => [
      puzzle.puzzleName,
      puzzle.displayName ?? puzzle.puzzleName,
    ])
  );
  // Names as the event log keeps them, to the names on screen.
  const entrantNames = new Map(
    quest.entries.map(({ entrant: { kind, name, displayName } }) => [
      `${kind}:${name}`,
      displayName ?? name,
    ])
  );
  const whose = (event: QuestEvent) =>
    event.entrant
      ? `${
          entrantNames.get(`${event.entrant.kind}:${event.entrant.name}`) ??
          event.entrant.name ??
          `A deleted ${event.entrant.kind === "team" ? "team" : "player"}`
        }: `
      : "";
  const filtered =
    entrant && !everyone
      ? (events.data ?? []).filter((event) => isOf(event, entrant))
      : (events.data ?? []);
  const named = entrant !== undefined && everyone;
  const newestFirst = [...filtered].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, SHOWN_AT_FIRST);

  return (
    <section
      id="activity"
      className={styles.section}
      aria-labelledby="activity-heading"
    >
      <Heading id="activity-heading">Activity</Heading>
      {entrant && (
        <div className={styles.checkbox}>
          <input
            id="activity-everyone"
            type="checkbox"
            checked={everyone}
            onChange={(event) => setEveryone(event.target.checked)}
          />
          <label htmlFor="activity-everyone">
            Show every team&apos;s and player&apos;s activity
          </label>
        </div>
      )}
      {events.isError && (
        <Banner tone="danger">{messageOf(events.error)}</Banner>
      )}
      {events.data && newestFirst.length === 0 && (
        <p>Nothing has happened yet.</p>
      )}
      <ol className={styles.activity}>
        {shown.map((event, index) => (
          // Events have no IDs of their own, and the list only grows at the top.
          <li key={newestFirst.length - index}>
            <time dateTime={event.at}>
              {timeFormat.format(Date.parse(event.at))}
            </time>
            <span>
              {named && whose(event)}
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
