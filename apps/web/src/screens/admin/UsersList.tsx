import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, dataOrThrow } from "../../api";
import { useSession } from "../../session";
import { LinkButton } from "../../ui/LinkButton";
import styles from "./Admin.module.css";
import {
  AdminList,
  DeleteButton,
  DeleteDialog,
  useDeletion,
} from "./AdminList";
import { allUsersQuery } from "./listQueries";

type User = Schemas["User"];

const QUERY_KEY = ["users"];

/** Every user. */
export function UsersList() {
  const session = useSession();
  const users = useQuery(allUsersQuery);
  const flow = useDeletion<User>({
    queryKey: QUERY_KEY,
    remove: async ({ userName }) =>
      dataOrThrow(
        await api.DELETE("/users/{userName}", {
          params: { path: { userName } },
          // An administrator deleting someone else needs no password.
          body: {},
        })
      ),
  });

  return (
    <AdminList
      title="Users"
      action={
        <LinkButton id="new-user" to="/user/register" variant="primary">
          New user
        </LinkButton>
      }
      isEmpty={users.data?.length === 0}
      emptyMessage="There are no users yet."
      error={users.error ?? flow.deletion.error}
    >
      {users.data && users.data.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>User name</th>
              <th>Display name</th>
              <th className={styles.secondary}>Email</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {users.data.map((user) => (
              <tr key={user.userName} data-user-name={user.userName}>
                <td>
                  <Link to={`/user/${encodeURIComponent(user.userName)}`}>
                    {user.userName}
                  </Link>
                </td>
                <td>{user.displayName}</td>
                <td className={styles.secondary}>{user.email}</td>
                <td className={styles.rowActions}>
                  {/* Not yourself: it could leave nobody able to administer
                      the site. */}
                  {user.userName !== session.data?.user.userName && (
                    <DeleteButton
                      name={user.userName}
                      onPress={() => flow.setAsking(user)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <DeleteDialog flow={flow} nameOf={({ userName }) => userName}>
        This ends their sessions and removes them from their teams. Quests
        assigned to them stay, assigned to a deleted user.
      </DeleteDialog>
    </AdminList>
  );
}
