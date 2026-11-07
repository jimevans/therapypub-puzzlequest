import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, dataOrThrow } from "../../api";
import { fetchAllPages } from "../../fetchAllPages";
import { LinkButton } from "../../ui/LinkButton";
import styles from "./Admin.module.css";
import {
  AdminList,
  DeleteButton,
  DeleteDialog,
  useDeletion,
} from "./AdminList";

type Quest = Schemas["Quest"];

const QUERY_KEY = ["quests"];

function assignedTo({ assignee }: Quest): string {
  return `${assignee.name ?? "(deleted)"} (${assignee.kind})`;
}

/** Every quest, however far it has got. */
export function QuestsList() {
  const quests = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      fetchAllPages(async (after) =>
        dataOrThrow(await api.GET("/quests", { params: { query: { after } } }))
      ),
  });
  const flow = useDeletion<Quest>({
    queryKey: QUERY_KEY,
    remove: async ({ name }) =>
      dataOrThrow(
        await api.DELETE("/quests/{name}", { params: { path: { name } } })
      ),
  });

  return (
    <AdminList
      title="Quests"
      action={
        <LinkButton
          id="new-quest"
          to="/quest/new"
          variant="primary"
          reloadDocument
        >
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
              <th>Assigned to</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {quests.data.map((quest) => (
              <tr key={quest.name} data-quest-name={quest.name}>
                <td>
                  {/* Reloads, because its page isn't in this app for
                      administrators yet. */}
                  <Link
                    to={`/quest/${encodeURIComponent(quest.name)}`}
                    reloadDocument
                  >
                    {quest.displayName}
                  </Link>
                </td>
                <td className={styles.secondary}>{quest.name}</td>
                <td>{assignedTo(quest)}</td>
                <td>{quest.statusDescription}</td>
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
