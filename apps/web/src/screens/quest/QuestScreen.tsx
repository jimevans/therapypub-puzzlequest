import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
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

function QuestDetails({ quest }: { quest: Schemas["Quest"] }) {
  return (
    <QuestProgress
      quest={quest}
      steps={quest.puzzles.map((step) => ({
        name: step.puzzleName,
        displayName: step.displayName ?? step.puzzleName,
        status: step.status,
        statusDescription: step.statusDescription,
        startTime: step.startTime,
        activationTime: step.activationTime,
        endTime: step.endTime,
        solutionText: step.solutionDisplayText,
        path: `/quest/${encodeURIComponent(quest.name)}/puzzle/${encodeURIComponent(step.puzzleName)}`,
      }))}
      finish={
        <FinishPanel>
          Congratulations! You finished {quest.displayName} in{" "}
          <strong>{formatDuration(quest.progress.totalMs)}</strong>.
        </FinishPanel>
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
