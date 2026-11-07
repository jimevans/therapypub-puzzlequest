import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError, messageOf } from "../../../api";
import { PuzzleContent } from "../../../quests/PuzzleContent";
import { puzzleTypeLabel } from "../puzzleTypes";
import { Banner } from "../../../ui/Banner";
import { LinkButton } from "../../../ui/LinkButton";
import adminStyles from "../Admin.module.css";
import styles from "./Puzzle.module.css";
import { type Puzzle, puzzleDefinitionQuery } from "./puzzleForm";

function Details({ puzzle }: { puzzle: Puzzle }) {
  return (
    <>
      <div className={adminStyles.heading}>
        <h1>{puzzle.displayName}</h1>
        <LinkButton
          id="edit-puzzle"
          to={`/puzzle/${encodeURIComponent(puzzle.name)}/edit`}
          variant="primary"
        >
          Edit
        </LinkButton>
      </div>
      <dl className={styles.details}>
        <dt>Name</dt>
        <dd>{puzzle.name}</dd>
        <dt>Type</dt>
        <dd>{puzzleTypeLabel(puzzle.type)}</dd>
        <dt>Solution keywords</dt>
        <dd id="solution-keyword">{puzzle.solutionKeyword}</dd>
        <dt>Solution as shown</dt>
        <dd>{puzzle.solutionDisplayText}</dd>
      </dl>
      <section className={styles.section} aria-labelledby="content-heading">
        <h2 id="content-heading" className={styles.label}>
          As players see it
        </h2>
        {puzzle.text ? (
          <PuzzleContent
            displayName={puzzle.displayName}
            type={puzzle.type}
            text={puzzle.text}
          />
        ) : (
          <p>Nothing yet.</p>
        )}
      </section>
      <section className={styles.section} aria-labelledby="hints-heading">
        <h2 id="hints-heading" className={styles.label}>
          Hints
        </h2>
        {puzzle.hints.length === 0 ? (
          <p>No hints.</p>
        ) : (
          <table id="hints" className={`${adminStyles.table} ${styles.table}`}>
            <thead>
              <tr>
                <th>Hint</th>
                <th className={styles.seconds}>Penalty</th>
                <th>Gives the solution away</th>
              </tr>
            </thead>
            <tbody>
              {/* Hints have no IDs of their own; their order is what they are. */}
              {puzzle.hints.map((hint, index) => (
                <tr key={index}>
                  <td>{hint.text}</td>
                  <td className={styles.seconds}>{hint.timePenalty} s</td>
                  <td>{hint.solutionWarning ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

/** A puzzle, as authors see it: with its solution and every hint. */
export function PuzzleDetails() {
  const name = useParams().name ?? "";
  const puzzle = useQuery(puzzleDefinitionQuery(name));
  const gone = puzzle.error instanceof ApiError && puzzle.error.status === 404;

  return (
    <>
      <title>{`${puzzle.data?.displayName ?? "Puzzle"} · PuzzleQuest`}</title>
      {gone ? (
        <>
          <h1>Puzzle not found</h1>
          <Link to="/puzzles">See every puzzle</Link>
        </>
      ) : puzzle.data ? (
        <Details puzzle={puzzle.data} />
      ) : (
        puzzle.isError && (
          <Banner tone="danger">{messageOf(puzzle.error)}</Banner>
        )
      )}
    </>
  );
}
