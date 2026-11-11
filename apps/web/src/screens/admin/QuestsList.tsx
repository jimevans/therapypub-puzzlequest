import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, dataOrThrow } from "../../api";
import { entrantName } from "../../quests/entrants";
import { LinkButton } from "../../ui/LinkButton";
import styles from "./Admin.module.css";
import {
  AdminList,
  DeleteButton,
  DeleteDialog,
  useDeletion,
} from "./AdminList";
import { allQuestsQuery } from "./listQueries";

type Quest = Schemas["Quest"];

const QUERY_KEY = ["quests"];

/** How many entrants a quest lists by name before giving only the count. */
const NAMED_ENTRANTS = 3;

/** Who plays the quest: their names, or how many there are. */
function entrantsOf({ entries }: Quest): string {
  return entries.length > NAMED_ENTRANTS
    ? `${entries.length} entrants`
    : entries.map(({ entrant }) => entrantName(entrant)).join(", ");
}

/**
 * How the quest is going: its entries' status when they're all at the same
 * point, otherwise how many are at each, such as "1 Completed, 1 In progress".
 */
function statusOf({ entries }: Quest): string {
  const counts = new Map<string, number>();
  for (const { statusDescription } of entries) {
    counts.set(statusDescription, (counts.get(statusDescription) ?? 0) + 1);
  }
  return counts.size === 1
    ? [...counts.keys()].join("")
    : [...counts].map(([status, count]) => `${count} ${status}`).join("; ");
}

/** Every quest, however far it has got. */
export function QuestsList() {
  const quests = useQuery(allQuestsQuery);
  const flow = useDeletion<Quest>({
    queryKey: QUERY_KEY,
    remove: async ({ questName }) =>
      dataOrThrow(
        await api.DELETE("/quests/{questName}", {
          params: { path: { questName } },
        })
      ),
  });

  return (
    <AdminList
      title="Quests"
      action={
        <LinkButton id="new-quest" to="/quest/new" variant="primary">
          New quest
        </LinkButton>
      }
      isEmpty={quests.data?.length === 0}
      emptyMessage="There are no quests yet."
      error={quests.error ?? flow.deletion.error}
    >
      {quests.data && quests.data.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Quest</th>
              <th className={styles.secondary}>Name</th>
              <th>Entrants</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {quests.data.map((quest) => (
              <tr key={quest.questName} data-quest-name={quest.questName}>
                <td>
                  <Link to={`/quest/${encodeURIComponent(quest.questName)}`}>
                    {quest.displayName}
                  </Link>
                </td>
                <td className={styles.secondary}>{quest.questName}</td>
                <td>{entrantsOf(quest)}</td>
                <td>{statusOf(quest)}</td>
                <td className={styles.rowActions}>
                  <DeleteButton
                    name={quest.displayName}
                    onPress={() => flow.setAsking(quest)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <DeleteDialog flow={flow} nameOf={({ displayName }) => displayName}>
        Its players lose it at once, even if they're partway through. Its
        activity log is kept.
      </DeleteDialog>
    </AdminList>
  );
}
