import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError } from "../../api";
import { useLiveQuest } from "../../live/useLiveQuest";
import { FinishPanel } from "../../quests/FinishPanel";
import { NotAvailable } from "../../quests/NotAvailable";
import { QuestProgress } from "../../quests/QuestProgress";
import { formatDuration } from "../../quests/clock";
import { spectatorQuestQuery } from "../../quests/queries";
import {
  QUEST_NOT_STARTED,
  STEP_AWAITING_ACTIVATION,
} from "../../quests/status";
import { Banner } from "../../ui/Banner";
import styles from "./FollowAlong.module.css";

function QuestDetails({ quest }: { quest: Schemas["SpectatorQuest"] }) {
  if (quest.status === QUEST_NOT_STARTED) {
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
      quest={quest}
      steps={quest.puzzles.map((step) => {
        const clock = quest.progress.puzzles.find(
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
              : `/monitor/quest/${encodeURIComponent(quest.name)}/puzzle/${encodeURIComponent(step.name)}`,
        };
      })}
      finish={
        <FinishPanel>
          {quest.displayName} finished in{" "}
          <strong>{formatDuration(quest.progress.totalMs)}</strong>.
        </FinishPanel>
      }
    />
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
