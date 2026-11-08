import { useState } from "react";
import styles from "./Announcement.module.css";

/**
 * Describes what changed, for screen readers: something a viewer would see
 * change on screen, such as a teammate solving a puzzle, that a screen reader
 * wouldn't otherwise mention. Compares each render's snapshot with the last
 * one, as React's documentation suggests for information from previous
 * renders, and keeps the latest description.
 * @param snapshot what's worth announcing, as plain data
 * @param describe says what changed between two snapshots, or null
 * @returns the latest description, or "" before anything has changed
 */
export function useAnnouncement<Snapshot>(
  snapshot: Snapshot,
  describe: (previous: Snapshot, current: Snapshot) => string | null
): string {
  const key = JSON.stringify(snapshot);
  const [previous, setPrevious] = useState({ key, snapshot });
  const [message, setMessage] = useState("");
  if (key !== previous.key) {
    setPrevious({ key, snapshot });
    const description = describe(previous.snapshot, snapshot);
    if (description) {
      setMessage(description);
    }
  }
  return message;
}

/**
 * Where announcements are read out: a polite live region, on the page from
 * the start, since screen readers announce changes to a region they already
 * know, and hidden from view.
 */
export function Announcement({ message }: { message: string }) {
  return (
    <p className={styles.announcement} role="status" data-announcement>
      {message}
    </p>
  );
}
