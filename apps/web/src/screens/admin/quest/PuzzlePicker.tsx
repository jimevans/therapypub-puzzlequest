import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { messageOf } from "../../../api";
import { Banner } from "../../../ui/Banner";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import dialogStyles from "../../../ui/Dialog.module.css";
import { allPuzzlesQuery } from "../listQueries";
import styles from "./QuestEditor.module.css";

type Puzzle = Schemas["Puzzle"];

interface PuzzlePickerProps {
  isOpen: boolean;
  /** The puzzles already in the quest, which aren't offered again. */
  inQuest: ReadonlySet<string>;
  onCancel: () => void;
  onAdd: (puzzles: Puzzle[]) => void;
}

function Choices({
  inQuest,
  onCancel,
  onAdd,
}: Omit<PuzzlePickerProps, "isOpen">) {
  const puzzles = useQuery(allPuzzlesQuery);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const words = search.trim().toLowerCase();
  const offered = (puzzles.data ?? []).filter(
    (puzzle) =>
      !inQuest.has(puzzle.puzzleName) &&
      (words === "" ||
        `${puzzle.displayName} ${puzzle.puzzleName}`
          .toLowerCase()
          .includes(words))
  );

  return (
    <>
      {puzzles.isError && (
        <Banner tone="danger">{messageOf(puzzles.error)}</Banner>
      )}
      <div className={styles.search}>
        <label htmlFor="puzzle-search">Search</label>
        <input
          id="puzzle-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {puzzles.data && offered.length === 0 && (
        <p>
          {words
            ? "No puzzles match."
            : "Every puzzle is already in the quest."}
        </p>
      )}
      <ul className={styles.choices}>
        {offered.map((puzzle, index) => (
          <li key={puzzle.puzzleName}>
            <input
              id={`choose-${index}`}
              type="checkbox"
              checked={chosen.includes(puzzle.puzzleName)}
              onChange={(event) =>
                setChosen(
                  event.target.checked
                    ? [...chosen, puzzle.puzzleName]
                    : chosen.filter((name) => name !== puzzle.puzzleName)
                )
              }
            />
            <label htmlFor={`choose-${index}`}>
              {puzzle.displayName}
              <span className={styles.secondaryText}> {puzzle.puzzleName}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className={dialogStyles.actions}>
        <Button onPress={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          isDisabled={chosen.length === 0}
          // In the order they were chosen.
          onPress={() =>
            onAdd(
              chosen.flatMap(
                (name) =>
                  puzzles.data?.filter(
                    (puzzle) => puzzle.puzzleName === name
                  ) ?? []
              )
            )
          }
        >
          {chosen.length > 1 ? `Add ${chosen.length} puzzles` : "Add"}
        </Button>
      </div>
    </>
  );
}

/** Choosing puzzles to add to the end of the quest. */
export function PuzzlePicker({ isOpen, ...props }: PuzzlePickerProps) {
  return (
    <Dialog
      id="puzzle-picker"
      isOpen={isOpen}
      title="Add puzzles"
      onDismiss={props.onCancel}
    >
      <Choices {...props} />
    </Dialog>
  );
}
