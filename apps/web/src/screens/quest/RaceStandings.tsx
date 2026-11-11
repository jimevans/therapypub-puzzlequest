import { useQuery } from "@tanstack/react-query";
import { Leaderboard } from "../../quests/Leaderboard";
import { spectatorQuestQuery } from "../../quests/queries";

/**
 * Once a player's team has finished: if it was a race, the standings, with
 * their team picked out. The public view has them, which a quest's players may
 * always see, and it shows the whole leaderboard once their team has finished.
 * The quest screen's live updates keep it up to date.
 */
export default function RaceStandings({
  questName,
  entryId,
}: {
  questName: string;
  /** The player's own entry. */
  entryId: string;
}) {
  const quest = useQuery(spectatorQuestQuery(questName));
  // A quest one team played has no standings to show.
  if (!quest.data || quest.data.entries.length < 2) {
    return null;
  }
  return <Leaderboard quest={quest.data} ownEntryId={entryId} />;
}
