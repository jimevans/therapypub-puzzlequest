import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError, api, dataOrThrow } from "../../api";
import { copy } from "../../copy";
import { questQueryKey, useLiveQuest } from "../../live/useLiveQuest";
import { ClockTime } from "../../quests/ClockTime";
import { NotAvailable } from "../../quests/NotAvailable";
import { PausedBanner } from "../../quests/PausedBanner";
import { type Clock, formatDuration, formatMoment } from "../../quests/clock";
import { QUEST_COMPLETED, STEP_COMPLETED } from "../../quests/status";
import { Banner } from "../../ui/Banner";
import { ProgressLine, ProgressStep } from "../../ui/ProgressLine";
import styles from "./QuestScreen.module.css";

type Quest = Schemas["Quest"];
type Step = Quest["puzzles"][number];

/** When something happened, if it has. */
function Moment({ label, at }: { label: string; at?: string | null }) {
  return at ? (
    <>
      <dt>{label}</dt>
      <dd>{formatMoment(at)}</dd>
    </>
  ) : null;
}

/** The time spent; and, once there are penalties, those and the total. */
function Times({ clock }: { clock: Clock }) {
  return (
    <>
      <dt>Time</dt>
      <dd>
        <ClockTime clock={clock} show="elapsed" />
      </dd>
      {clock.penaltyMs > 0 && (
        <>
          <dt>Hint penalties</dt>
          <dd>{formatDuration(clock.penaltyMs)}</dd>
          <dt>Total</dt>
          <dd>
            <ClockTime clock={clock} show="total" />
          </dd>
        </>
      )}
    </>
  );
}

function StepCard({
  questName,
  step,
  stepNumber,
  clock,
}: {
  questName: string;
  step: Step;
  stepNumber: number;
  clock?: Clock;
}) {
  const completed = step.status === STEP_COMPLETED;
  const path = `/quest/${encodeURIComponent(questName)}/puzzle/${encodeURIComponent(step.puzzleName)}`;
  return (
    <ProgressStep
      state={completed ? "done" : "current"}
      data-puzzle-name={step.puzzleName}
    >
      <p className={styles.stepNumber}>{copy.stepLabel(stepNumber)}</p>
      <h2 className={styles.stepName}>
        <Link to={path}>{step.displayName ?? step.puzzleName}</Link>
      </h2>
      <p className={styles.status}>{step.statusDescription}</p>
      <dl className={styles.facts}>
        <Moment label="Started" at={step.startTime} />
        <Moment label="Activated" at={step.activationTime} />
        <Moment label="Finished" at={step.endTime} />
        {clock && <Times clock={clock} />}
        {completed && step.solutionDisplayText && (
          <>
            <dt>Solution</dt>
            <dd>{step.solutionDisplayText}</dd>
          </>
        )}
      </dl>
    </ProgressStep>
  );
}

function QuestDetails({ quest }: { quest: Quest }) {
  const { progress } = quest;
  const completed = quest.status === QUEST_COMPLETED;
  return (
    <>
      <title>{`${quest.displayName} · PuzzleQuest`}</title>
      <h1>{quest.displayName}</h1>
      {quest.paused && <PausedBanner />}
      <section id="quest-progress" className={styles.summary}>
        <ClockTime className={styles.clock} clock={progress} show="total" />
        <p className={styles.status}>
          {quest.statusDescription}
          {progress.penaltyMs > 0 &&
            `, including ${formatDuration(progress.penaltyMs)} in hint penalties`}
        </p>
        <dl className={styles.facts}>
          <Moment label="Started" at={progress.startTime} />
          <Moment label="Finished" at={progress.endTime} />
        </dl>
      </section>
      <ProgressLine label={copy.stepsReached} open={!completed}>
        {quest.puzzles.map((step, index) => (
          <StepCard
            key={step.puzzleName}
            questName={quest.name}
            step={step}
            stepNumber={index + 1}
            clock={progress.puzzles.find(
              ({ puzzleName }) => puzzleName === step.puzzleName
            )}
          />
        ))}
      </ProgressLine>
      {completed && <p className={styles.finished}>{copy.questFinished}</p>}
    </>
  );
}

/** Where a player's quest has got to: each step reached, and the clock. */
export function QuestScreen() {
  const name = useParams().name ?? "";
  const { connected } = useLiveQuest(name);
  const quest = useQuery({
    queryKey: questQueryKey(name),
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{name}", { params: { path: { name } } })
      ),
  });

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
        <QuestDetails quest={quest.data} />
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
