import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { useParams } from "react-router";
import { ApiError } from "../../api";
import { useLiveQuest } from "../../live/useLiveQuest";
import { FinishPanel } from "../../quests/FinishPanel";
import { NotAvailable } from "../../quests/NotAvailable";
import { QuestProgress } from "../../quests/QuestProgress";
import { ShareLinksSection } from "../../quests/ShareLinksSection";
import { formatDuration } from "../../quests/clock";
import { questQuery } from "../../quests/queries";
import { Banner } from "../../ui/Banner";
import styles from "./QuestScreen.module.css";

// Only a player who has finished needs a race's standings, so they download
// them then. (lazy() loads a component's code the first time it renders.)
const RaceStandings = lazy(() => import("./RaceStandings"));

function QuestDetails({ quest }: { quest: Schemas["Quest"] }) {
  // A player sees only their own entry, as the quest's one entry.
  const entry = quest.entries[0];
  if (!entry) {
    return <NotAvailable what="quest" />;
  }
  return (
    <QuestProgress
      displayName={quest.displayName}
      entry={entry}
      steps={entry.puzzles.map((step) => ({
        puzzleName: step.puzzleName,
        displayName: step.displayName,
        status: step.status,
        statusDescription: step.statusDescription,
        startTime: step.startTime,
        activationTime: step.activationTime,
        endTime: step.endTime,
        solutionText: step.solutionText,
        path: `/quest/${encodeURIComponent(quest.questName)}/puzzle/${encodeURIComponent(step.puzzleName)}`,
      }))}
      finish={
        <>
          <FinishPanel>
            Congratulations! You finished {quest.displayName} in{" "}
            <strong>{formatDuration(entry.progress.totalMs)}</strong>.
          </FinishPanel>
          <Suspense fallback={null}>
            <RaceStandings questName={quest.questName} entryId={entry.id} />
          </Suspense>
        </>
      }
    />
  );
}

/** Where a player's quest has got to: each step reached, and the clock. */
export function QuestScreen() {
  const name = useParams().name ?? "";
  const { connected } = useLiveQuest(name);
  const quest = useQuery(questQuery(name));

  // Resetting a quest makes it disappear, so this overrides what's on screen.
  // Any other failure leaves the last known state showing, since a phone in a
  // dead zone will catch up by itself.
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
          <ShareLinksSection questName={name} />
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
