import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError, messageOf } from "../../api";
import { copy } from "../../copy";
import { useLiveQuest } from "../../live/useLiveQuest";
import { ClockTime } from "../../quests/ClockTime";
import {
  STEP_AWAITING_ACTIVATION,
  STEP_COMPLETED,
  STEP_IN_PROGRESS,
} from "../../quests/status";
import { Banner } from "../../ui/Banner";
import styles from "./Staff.module.css";
import { assigneeOf } from "./assignee";
import { staffQuestQuery } from "./staffQueries";

type StaffQuest = Schemas["StaffQuest"];
type Step = StaffQuest["puzzles"][number];

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

const at = (iso: string) => timeFormat.format(Date.parse(iso));

/** Where the players are: the step they're looking for, or working on. */
function isCurrent(step: Step): boolean {
  return (
    step.status === STEP_AWAITING_ACTIVATION || step.status === STEP_IN_PROGRESS
  );
}

function StepCard({
  quest,
  step,
  index,
}: {
  quest: StaffQuest;
  step: Step;
  index: number;
}) {
  const clock = quest.progress.puzzles.find(
    (progress) => progress.puzzleName === step.name
  );
  const current = isCurrent(step);
  return (
    <li
      className={`${styles.step} ${current ? styles.current : ""} ${
        step.status === STEP_COMPLETED ? styles.done : ""
      }`}
      data-puzzle-name={step.name}
      aria-current={current ? "step" : undefined}
    >
      <div className={styles.stepHeading}>
        <span className={styles.stepNumber}>{copy.stepLabel(index + 1)}</span>
        <span className={styles.stepName}>{step.displayName}</span>
      </div>
      <p className={styles.stepStatus}>
        {current ? (
          <strong>Players here · {step.statusDescription}</strong>
        ) : (
          step.statusDescription
        )}
      </p>
      <dl className={styles.stepDetails}>
        {step.activationTime && (
          <>
            <dt>Activated</dt>
            <dd>{at(step.activationTime)}</dd>
          </>
        )}
        {step.endTime && (
          <>
            <dt>{step.skipped ? "Skipped" : "Solved"}</dt>
            <dd>{at(step.endTime)}</dd>
          </>
        )}
        {step.hintCount > 0 && step.status !== 0 && (
          <>
            <dt>Hints</dt>
            <dd>
              {step.hintsRevealed} of {step.hintCount}
            </dd>
          </>
        )}
        {clock?.startTime && (
          <>
            <dt>Time</dt>
            <dd className={styles.time}>
              <ClockTime clock={clock} show="total" />
            </dd>
          </>
        )}
      </dl>
    </li>
  );
}

function QuestView({ quest }: { quest: StaffQuest }) {
  const encodedName = encodeURIComponent(quest.name);
  return (
    <>
      <h1>{quest.displayName}</h1>
      <p className={styles.intro}>
        {assigneeOf(quest.assignee)} · {quest.statusDescription}
        {quest.progress.startTime && (
          <>
            {" · "}
            <ClockTime
              className={styles.time}
              clock={quest.progress}
              show="total"
            />
          </>
        )}
      </p>
      {quest.paused && (
        <Banner id="paused-banner">
          Paused by the puzzle master. The clock is stopped, and the players
          can&apos;t do anything until the quest resumes.
        </Banner>
      )}
      <ol id="staff-steps" className={styles.steps}>
        {quest.puzzles.map((step, index) => (
          <StepCard key={step.name} quest={quest} step={step} index={index} />
        ))}
      </ol>
      <p className={styles.links}>
        <Link to={`/monitor/quest/${encodedName}/board`}>Board</Link>
        <Link to="/">All quests</Link>
      </p>
    </>
  );
}

/**
 * A quest as staff follow it: every stop in order, with where the players are,
 * kept up to date as they go. It shows nothing about how to solve anything.
 */
export default function StaffQuest() {
  const name = useParams().name ?? "";
  const { connected } = useLiveQuest(name);
  const quest = useQuery(staffQuestQuery(name));
  const gone = quest.error instanceof ApiError && quest.error.status === 404;

  return (
    <div data-live-updates={connected ? "connected" : "connecting"}>
      <title>{`${quest.data?.displayName ?? "Quest"} · PuzzleQuest`}</title>
      {gone ? (
        <>
          <h1>Quest not found</h1>
          <Link to="/">All quests</Link>
        </>
      ) : quest.data ? (
        <QuestView quest={quest.data} />
      ) : (
        quest.isError && <Banner tone="danger">{messageOf(quest.error)}</Banner>
      )}
    </div>
  );
}
