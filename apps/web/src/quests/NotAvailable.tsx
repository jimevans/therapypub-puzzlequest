/**
 * Says a quest or puzzle can't be shown. The API answers alike for one that
 * doesn't exist, isn't the player's, or has been reset, so this can't say which.
 */
export function NotAvailable({ what }: { what: "quest" | "puzzle" }) {
  const title =
    what === "quest" ? "Quest not available" : "Puzzle not available";
  return (
    <>
      <title>{`${title} · PuzzleQuest`}</title>
      <h1>{title}</h1>
      <p>
        This {what} isn't available. The quest may have been reset, or the link
        may be wrong.
      </p>
      <a href="/">See your quests</a>
    </>
  );
}
