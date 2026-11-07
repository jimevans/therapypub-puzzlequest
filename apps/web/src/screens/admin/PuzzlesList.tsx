import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, dataOrThrow } from "../../api";
import { LinkButton } from "../../ui/LinkButton";
import { puzzleTypeLabel } from "./puzzleTypes";
import styles from "./Admin.module.css";
import {
  AdminList,
  DeleteButton,
  DeleteDialog,
  useDeletion,
} from "./AdminList";
import { allPuzzlesQuery } from "./listQueries";
import { PUZZLES_KEY } from "./puzzle/puzzleForm";

type Puzzle = Schemas["Puzzle"];

/** Every puzzle, for putting into quests. */
export function PuzzlesList() {
  const puzzles = useQuery(allPuzzlesQuery);
  const flow = useDeletion<Puzzle>({
    queryKey: PUZZLES_KEY,
    remove: async ({ name }) =>
      dataOrThrow(
        await api.DELETE("/puzzles/{name}", { params: { path: { name } } })
      ),
  });

  return (
    <AdminList
      title="Puzzles"
      action={
        <LinkButton id="new-puzzle" to="/puzzle/new" variant="primary">
          New puzzle
        </LinkButton>
      }
      isEmpty={puzzles.data?.length === 0}
      emptyMessage="There are no puzzles yet."
      error={puzzles.error ?? flow.deletion.error}
    >
      {puzzles.data && puzzles.data.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Puzzle</th>
              <th className={styles.secondary}>Name</th>
              <th>Type</th>
              <th className={styles.secondary}>Hints</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {puzzles.data.map((puzzle) => (
              <tr key={puzzle.name} data-puzzle-name={puzzle.name}>
                <td>
                  <Link to={`/puzzle/${encodeURIComponent(puzzle.name)}`}>
                    {puzzle.displayName}
                  </Link>
                </td>
                <td className={styles.secondary}>{puzzle.name}</td>
                <td>{puzzleTypeLabel(puzzle.type)}</td>
                <td className={styles.secondary}>{puzzle.hints.length}</td>
                <td className={styles.rowActions}>
                  <DeleteButton
                    name={puzzle.displayName}
                    onPress={() => flow.setAsking(puzzle)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <DeleteDialog flow={flow} nameOf={({ displayName }) => displayName}>
        A puzzle that a quest uses can't be deleted, so you may need to remove
        it from its quests first.
      </DeleteDialog>
    </AdminList>
  );
}
