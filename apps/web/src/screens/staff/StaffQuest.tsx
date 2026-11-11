import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, messageOf } from "../../api";
import { copy } from "../../copy";
import { useLiveQuest } from "../../live/useLiveQuest";
import { ClockTime } from "../../quests/ClockTime";
import type { QrCodeStop } from "../../quests/QrCodeDialog";
import { QrCodeDialogWhenShown } from "../../quests/QrCodeDialogWhenShown";
import {
  STEP_AWAITING_ACTIVATION,
  STEP_COMPLETED,
  STEP_IN_PROGRESS,
} from "../../quests/status";
import {
  describeEntries,
  entriesSnapshot,
} from "../../quests/entryAnnouncements";
import { entrantLabel } from "../../quests/entrants";
import { Announcement, useAnnouncement } from "../../ui/Announcement";
import { ShareLinksSection } from "../../quests/ShareLinksSection";
import { Banner } from "../../ui/Banner";
import buttonStyles from "../../ui/Button.module.css";
import styles from "./Staff.module.css";
import { staffQuestQuery } from "./staffQueries";

type StaffQuest = Schemas["StaffQuest"];
type Entry = StaffQuest["entries"][number];
type Step = Entry["puzzles"][number];

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

const at = (iso: string) => timeFormat.format(Date.parse(iso));

/** Where the players are: the step they're looking for, or working on. */
function isCurrent(step: Step): boolean {
  return (
    step.status === STEP_AWAITING_ACTIVATION || step.status === STEP_IN_PROGRESS
  );
}

function StepCard({
  entry,
  step,
  index,
  onShowQrCode,
}: {
  entry: Entry;
  step: Step;
  index: number;
  /** Shows the stop's QR code, for the players to scan. */
  onShowQrCode: () => void;
}) {
  const clock = entry.progress.puzzles.find(
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
      {/* A plain button, with the app's button styles: React Aria's would
          make this screen several times larger. */}
      <button
        type="button"
        className={`${buttonStyles.button} ${
          current ? buttonStyles.primary : buttonStyles.secondary
        }`}
        aria-label={`QR code for ${step.displayName}`}
        onClick={onShowQrCode}
      >
        QR code
      </button>
    </li>
  );
}

/**
 * One entry: how its team or player is doing, and every stop, with where they
 * are. In a race, each has a heading of its own.
 */
function EntryView({
  entry,
  single,
  onShowQrCode,
}: {
  entry: Entry;
  /** Whether it's the quest's only entry, which needs no heading. */
  single: boolean;
  onShowQrCode: (stop: QrCodeStop) => void;
}) {
  const headingId = `entry-${entry.id}`;
  const details = (
    <>
      <p className={styles.intro}>
        {entrantLabel(entry.entrant)} · {entry.statusDescription}
        {entry.progress.startTime && (
          <>
            {" · "}
            <ClockTime
              className={styles.time}
              clock={entry.progress}
              show="total"
            />
          </>
        )}
      </p>
      {entry.paused && (
        <Banner id={single ? "paused-banner" : undefined}>
          Paused by the puzzle master. The clock is stopped, and the players
          can&apos;t do anything until the quest resumes.
        </Banner>
      )}
      <ol
        id={single ? "staff-steps" : undefined}
        className={styles.steps}
        aria-label={
          single ? undefined : `Stops for ${entrantLabel(entry.entrant)}`
        }
      >
        {entry.puzzles.map((step, index) => (
          <StepCard
            key={step.name}
            entry={entry}
            step={step}
            index={index}
            onShowQrCode={() =>
              onShowQrCode({
                number: index + 1,
                puzzleName: step.name,
                label: step.displayName,
                activationCode: step.activationCode,
              })
            }
          />
        ))}
      </ol>
    </>
  );
  return single ? (
    details
  ) : (
    <section
      className={styles.entry}
      data-entry-id={entry.id}
      aria-labelledby={headingId}
    >
      <h2 id={headingId}>{entrantLabel(entry.entrant)}</h2>
      {details}
    </section>
  );
}

function QuestView({ quest }: { quest: StaffQuest }) {
  const [shown, setShown] = useState<QrCodeStop | null>(null);
  const encodedName = encodeURIComponent(quest.name);
  const announcement = useAnnouncement(
    entriesSnapshot(
      quest.entries.map((entry) => ({
        id: entry.id,
        name: entrantLabel(entry.entrant),
        paused: entry.paused,
        status: entry.status,
        steps: entry.puzzles,
      }))
    ),
    describeEntries
  );
  return (
    <>
      <h1>{quest.displayName}</h1>
      <Announcement message={announcement} />
      {quest.entries.map((entry) => (
        <EntryView
          key={entry.id}
          entry={entry}
          single={quest.entries.length === 1}
          onShowQrCode={setShown}
        />
      ))}
      <QrCodeDialogWhenShown
        questName={quest.name}
        stop={shown}
        onClose={() => setShown(null)}
      />
      <ShareLinksSection questName={quest.name} />
      <p className={styles.links}>
        <Link to={`/monitor/quest/${encodedName}/board`}>Board</Link>
        <Link to="/">All quests</Link>
      </p>
    </>
  );
}

/**
 * A quest as staff follow it: every stop in order, with where the players are,
 * kept up to date as they go, and each stop's QR code to show the players. It
 * shows nothing about how to solve anything.
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
