// Which backups to keep: the newest 14, and the newest of each of the last 8
// weeks, so a mistake noticed weeks later can still be undone.
import { BACKUP_NAME } from "./backup.js";

/** How many of the newest backups are kept. */
export const NEWEST_KEPT = 14;
/** How many weeks keep their newest backup. */
export const WEEKS_KEPT = 8;

/**
 * Gets when a backup was made, from its name.
 * @param name the name, such as 2026-11-08T03-00-00Z
 * @returns the time
 */
function timeOf(name: string): Date {
  const [date, time] = name.slice(0, -1).split("T");
  return new Date(`${date}T${time.replaceAll("-", ":")}Z`);
}

/**
 * Names the week a time is in, by its Monday (in UTC).
 * @param time the time
 * @returns the Monday's date, such as 2026-11-02
 */
function weekOf(time: Date): string {
  const monday = new Date(time);
  monday.setUTCDate(time.getUTCDate() - ((time.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

/**
 * Decides which backups to remove. Anything in the folder not named as a
 * backup is left alone, except unfinished ones (".partial-"), which a
 * failed run left behind.
 * @param names the names in the backups folder
 * @param current the name of a backup being made now, whose unfinished
 *   folder must stay
 * @returns the names to remove
 */
export function backupsToRemove(names: string[], current?: string): string[] {
  const backups = names
    .filter((name) => BACKUP_NAME.test(name))
    .sort()
    .reverse();
  const kept = new Set(backups.slice(0, NEWEST_KEPT));
  const weeks = new Set<string>();
  for (const name of backups) {
    const week = weekOf(timeOf(name));
    if (!weeks.has(week)) {
      if (weeks.size === WEEKS_KEPT) {
        break;
      }
      weeks.add(week);
      kept.add(name);
    }
  }
  const unfinished = names.filter(
    (name) =>
      name.startsWith(".partial-") && name !== `.partial-${current ?? ""}`
  );
  return [...backups.filter((name) => !kept.has(name)), ...unfinished];
}
