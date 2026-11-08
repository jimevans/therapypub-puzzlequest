// Which backups are kept: the newest 14, and the newest of each of the last
// 8 weeks.
import { describe, expect, it } from "vitest";
import { backupNameAt } from "../src/backup/backup.js";
import { backupsToRemove } from "../src/backup/retention.js";

/**
 * Names a nightly backup for each of a number of days, newest first.
 * @param days how many days
 * @returns the names
 */
function nightly(days: number): string[] {
  // Sunday 2026-11-08 is the newest.
  return Array.from({ length: days }, (_, day) =>
    backupNameAt(new Date(Date.UTC(2026, 10, 8 - day, 3)))
  );
}

describe("backup retention", () => {
  it("keeps everything while there are 14 or fewer", () => {
    expect(backupsToRemove(nightly(14))).toEqual([]);
  });

  it("keeps the newest 14, and the newest of each of the last 8 weeks", () => {
    const names = nightly(100);

    const kept = names.filter((name) => !backupsToRemove(names).includes(name));

    expect(kept).toEqual([
      // The newest 14 days: two weeks, Monday to Sunday.
      ...names.slice(0, 14),
      // Then the newest of each earlier week, its Sunday, until there are 8
      // weeks.
      "2026-10-25T03-00-00Z",
      "2026-10-18T03-00-00Z",
      "2026-10-11T03-00-00Z",
      "2026-10-04T03-00-00Z",
      "2026-09-27T03-00-00Z",
      "2026-09-20T03-00-00Z",
    ]);
  });

  it("removes unfinished backups, except the one being made", () => {
    expect(
      backupsToRemove(
        [
          ".partial-2026-11-07T03-00-00Z",
          ".partial-2026-11-08T03-00-00Z",
          "2026-11-07T03-00-00Z",
        ],
        "2026-11-08T03-00-00Z"
      )
    ).toEqual([".partial-2026-11-07T03-00-00Z"]);
  });

  it("leaves alone anything that isn't a backup", () => {
    expect(backupsToRemove([...nightly(30), "notes.txt", "old"])).not.toContain(
      "notes.txt"
    );
  });
});
