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

/**
 * One entry's progress through a quest, as players and spectators both see it:
 * a player sees their own entry, and spectators each entry.
 */
export type EntrySummary = Pick<
  Schemas["SpectatorQuestEntry"],
  "status" | "statusDescription" | "paused" | "progress"
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

/** The level of a step's heading: below the page's, or below an entry's. */
type StepHeading = "h2" | "h3";

function StepCard({
  step,
  stepNumber,
  clock,
  Heading,
}: {
  step: QuestStep;
  stepNumber: number;
  clock?: Clock;
  Heading: StepHeading;
}) {
  const completed = step.status === STEP_COMPLETED;
  return (
    <ProgressStep
      state={completed ? "done" : "current"}
      data-puzzle-name={step.name}
    >
      <p className={styles.stepNumber}>{copy.stepLabel(stepNumber)}</p>
      <Heading className={styles.stepName}>
        {step.path ? (
          <Link to={step.path}>{step.displayName}</Link>
        ) : (
          step.displayName
        )}
      </Heading>
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
 * Where one entry has got to: the clock, and each step reached, on a line that
 * stays open until it has finished the quest.
 */
export function EntryProgress({
  entry,
  steps,
  finish,
  stepHeading = "h2",
  id,
}: {
  entry: EntrySummary;
  steps: QuestStep[];
  /** What to show when the entry has finished. */
  finish: ReactNode;
  /** The level of each step's heading; h3 when the entry has a heading. */
  stepHeading?: StepHeading;
  /** The summary's ID, when the page shows only this entry. */
  id?: string;
}) {
  const { progress } = entry;
  const completed = entry.status === QUEST_COMPLETED;
  return (
    <>
      <section id={id} className={styles.summary}>
        <ClockTime className={styles.clock} clock={progress} show="total" />
        <p className={styles.status}>
          {entry.statusDescription}
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
            Heading={stepHeading}
          />
        ))}
      </ProgressLine>
      {completed && finish}
    </>
  );
}

/**
 * Where a quest has got to, for a page that shows one entry: the quest's name,
 * and that entry's progress, announced as it changes.
 */
export function QuestProgress({
  displayName,
  entry,
  steps,
  finish,
}: {
  /** The quest's name. */
  displayName: string;
  entry: EntrySummary;
  steps: QuestStep[];
  /** What to show when the quest is over. */
  finish: ReactNode;
}) {
  const announcement = useAnnouncement(
    progressSnapshot(entry, steps),
    describeProgress
  );
  return (
    <>
      <title>{`${displayName} · PuzzleQuest`}</title>
      <h1>{displayName}</h1>
      <Announcement message={announcement} />
      {entry.paused && <PausedBanner />}
      <EntryProgress
        id="quest-progress"
        entry={entry}
        steps={steps}
        finish={finish}
      />
    </>
  );
}
