import type { Schemas } from "@puzzlequest/api-client";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { copy } from "../copy";
import { Announcement, useAnnouncement } from "../ui/Announcement";
import { ProgressLine, ProgressStep } from "../ui/ProgressLine";
import { ClockTime } from "./ClockTime";
import { describeProgress, progressSnapshot } from "./announcements";
import { PausedBanner } from "./PausedBanner";
import { type Clock, formatDuration, formatMoment } from "./clock";
import styles from "./QuestProgress.module.css";
import { QUEST_COMPLETED, STEP_COMPLETED } from "./status";

/** A quest, as players and spectators both see it. */
export type QuestSummary = Pick<
  Schemas["SpectatorQuest"],
  "displayName" | "status" | "statusDescription" | "paused" | "progress"
>;

/** One step of a quest, however the API describes it to this viewer. */
export interface QuestStep {
  name: string;
  displayName: string;
  status: number;
  statusDescription: string;
  startTime?: string | null;
  activationTime?: string | null;
  endTime?: string | null;
  solutionText?: string | null;
  /** Where to see more of it, if this viewer may yet. */
  path: string | null;
}

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
  step,
  stepNumber,
  clock,
}: {
  step: QuestStep;
  stepNumber: number;
  clock?: Clock;
}) {
  const completed = step.status === STEP_COMPLETED;
  return (
    <ProgressStep
      state={completed ? "done" : "current"}
      data-puzzle-name={step.name}
    >
      <p className={styles.stepNumber}>{copy.stepLabel(stepNumber)}</p>
      <h2 className={styles.stepName}>
        {step.path ? (
          <Link to={step.path}>{step.displayName}</Link>
        ) : (
          step.displayName
        )}
      </h2>
      <p className={styles.status}>{step.statusDescription}</p>
      <dl className={styles.facts}>
        <Moment label="Started" at={step.startTime} />
        <Moment label="Activated" at={step.activationTime} />
        <Moment label="Finished" at={step.endTime} />
        {clock && <Times clock={clock} />}
        {completed && step.solutionText && (
          <>
            <dt>Solution</dt>
            <dd>{step.solutionText}</dd>
          </>
        )}
      </dl>
    </ProgressStep>
  );
}

/**
 * Where a quest has got to: the clock, and each step reached, on a line that
 * stays open until the quest is over.
 */
export function QuestProgress({
  quest,
  steps,
  finish,
}: {
  quest: QuestSummary;
  steps: QuestStep[];
  /** What to show when the quest is over. */
  finish: ReactNode;
}) {
  const { progress } = quest;
  const completed = quest.status === QUEST_COMPLETED;
  const announcement = useAnnouncement(
    progressSnapshot(quest, steps),
    describeProgress
  );
  return (
    <>
      <title>{`${quest.displayName} · PuzzleQuest`}</title>
      <h1>{quest.displayName}</h1>
      <Announcement message={announcement} />
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
        {steps.map((step, index) => (
          <StepCard
            key={step.name}
            step={step}
            stepNumber={index + 1}
            clock={progress.puzzles.find(
              ({ puzzleName }) => puzzleName === step.name
            )}
          />
        ))}
      </ProgressLine>
      {completed && finish}
    </>
  );
}
