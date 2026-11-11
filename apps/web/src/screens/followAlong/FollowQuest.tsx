import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError } from "../../api";
import { copy } from "../../copy";
import { useLiveQuest } from "../../live/useLiveQuest";
import { FinishPanel } from "../../quests/FinishPanel";
import { Leaderboard } from "../../quests/Leaderboard";
import { NotAvailable } from "../../quests/NotAvailable";
import {
  EntryProgress,
  QuestProgress,
  type QuestStep,
} from "../../quests/QuestProgress";
import {
  describeEntries,
  entriesSnapshot,
} from "../../quests/entryAnnouncements";
import { formatDuration } from "../../quests/clock";
import { entrantName } from "../../quests/entrants";
import { spectatorQuestQuery } from "../../quests/queries";
import {
  QUEST_NOT_STARTED,
  STEP_AWAITING_ACTIVATION,
} from "../../quests/status";
import { Announcement, useAnnouncement } from "../../ui/Announcement";
import { Banner } from "../../ui/Banner";
import styles from "./FollowAlong.module.css";

type SpectatorQuest = Schemas["SpectatorQuest"];
type Entry = SpectatorQuest["entries"][number];

/** The steps an entry has reached, each linking to it once activated. */
function stepsOf(quest: SpectatorQuest, entry: Entry): QuestStep[] {
  return entry.puzzles.map((step) => {
    const clock = entry.progress.puzzles.find(
      ({ puzzleName }) => puzzleName === step.name
    );
    return {
      name: step.name,
      displayName: step.displayName,
      status: step.status,
      statusDescription: step.statusDescription,
      startTime: clock?.startTime,
      activationTime: step.activationTime,
      endTime: clock?.endTime,
      solutionText: step.solutionText,
      // A puzzle's players must find and activate it before anyone sees it.
      path:
        step.status === STEP_AWAITING_ACTIVATION
          ? null
          : `/monitor/quest/${encodeURIComponent(quest.name)}/puzzle/${encodeURIComponent(step.name)}?entry=${encodeURIComponent(entry.id)}`,
    };
  });
}

/** Tells screen readers what changed in any of the quest's entries. */
function useEntriesAnnouncement(quest: SpectatorQuest): string {
  return useAnnouncement(
    entriesSnapshot(
      quest.entries.map((entry) => ({
        id: entry.id,
        name: entrantName(entry.entrant),
        paused: entry.paused,
        status: entry.status,
        steps: entry.puzzles,
      }))
    ),
    describeEntries
  );
}

/** A quest with one team or player: where they've got to. */
function SingleEntry({
  quest,
  entry,
}: {
  quest: SpectatorQuest;
  entry: Entry;
}) {
  if (entry.status === QUEST_NOT_STARTED) {
    return (
      <>
        <title>{`${quest.displayName} · PuzzleQuest`}</title>
        <h1>{quest.displayName}</h1>
        <p id="quest-not-started">
          This quest hasn't started yet. This page will update when it does.
        </p>
      </>
    );
  }
  return (
    <QuestProgress
      displayName={quest.displayName}
      entry={entry}
      steps={stepsOf(quest, entry)}
      finish={
        <FinishPanel>
          {quest.displayName} finished in{" "}
          <strong>{formatDuration(entry.progress.totalMs)}</strong>.
        </FinishPanel>
      }
    />
  );
}

/**
 * A race under way, for anyone but staff: who's playing, how they're doing,
 * and their times, but none of their stops, which rivals mustn't see. A
 * player still racing sees only their own team, until it finishes.
 */
function Standings({ quest }: { quest: SpectatorQuest }) {
  const announcement = useEntriesAnnouncement(quest);
  return (
    <>
      <title>{`${quest.displayName} · PuzzleQuest`}</title>
      <h1>{quest.displayName}</h1>
      <Announcement message={announcement} />
      {!quest.rivalsHidden && <p id="stops-hidden">{copy.stopsHiddenInRace}</p>}
      <Leaderboard
        quest={quest}
        // Then the one entry shown is the player's own.
        ownEntryId={quest.rivalsHidden ? quest.entries[0]?.id : undefined}
      />
    </>
  );
}

/**
 * Several teams or players, each with the stops it has reached: once every
 * one has finished a race, or for staff, who may see them throughout.
 */
function EveryEntry({ quest }: { quest: SpectatorQuest }) {
  const announcement = useEntriesAnnouncement(quest);
  return (
    <>
      <title>{`${quest.displayName} · PuzzleQuest`}</title>
      <h1>{quest.displayName}</h1>
      <Announcement message={announcement} />
      <Leaderboard quest={quest} />
      {quest.entries.map((entry) => {
        const name = entrantName(entry.entrant);
        const headingId = `entry-${entry.id}`;
        return (
          <section
            key={entry.id}
            className={styles.entry}
            data-entry-id={entry.id}
            aria-labelledby={headingId}
          >
            <h2 id={headingId}>{name}</h2>
            {entry.paused && (
              <Banner>
                Paused by the puzzle master. The clock is stopped.
              </Banner>
            )}
            {entry.status === QUEST_NOT_STARTED ? (
              <p>Not started yet.</p>
            ) : (
              <EntryProgress
                entry={entry}
                steps={stepsOf(quest, entry)}
                stepHeading="h3"
                finish={
                  <p className={styles.finished}>
                    {name} finished in{" "}
                    <strong>{formatDuration(entry.progress.totalMs)}</strong>.
                  </p>
                }
              />
            )}
          </section>
        );
      })}
    </>
  );
}

function QuestDetails({ quest }: { quest: SpectatorQuest }) {
  const [only] = quest.entries;
  // A player still racing sees one entry, their own, but it's still a race.
  if (quest.entries.length === 1 && only && !quest.racing) {
    return <SingleEntry quest={quest} entry={only} />;
  }
  return quest.stopsHidden ? (
    <Standings quest={quest} />
  ) : (
    <EveryEntry quest={quest} />
  );
}

/**
 * Follow along: anyone can watch a quest's progress, live, without signing in.
 * Players can open this too, so it shows nothing more than they can see.
 */
export function FollowQuest() {
  const name = useParams().name ?? "";
  const { connected } = useLiveQuest(name);
  const quest = useQuery(spectatorQuestQuery(name));
  const gone = quest.error instanceof ApiError && quest.error.status === 404;

  return (
    <div
      className={styles.screen}
      data-live-updates={connected ? "connected" : "connecting"}
    >
      {gone ? (
        <NotAvailable what="quest" />
      ) : quest.data ? (
        <>
          <QuestDetails quest={quest.data} />
          <Link
            className={styles.questLink}
            to={`/monitor/quest/${encodeURIComponent(name)}/board`}
          >
            Show on a big screen
          </Link>
        </>
      ) : (
        quest.isError && (
          <Banner tone="danger">
            Couldn't load this quest. Check your connection and try again.
          </Banner>
        )
      )}
    </div>
  );
}
