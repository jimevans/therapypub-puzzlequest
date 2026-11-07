import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ApiError, messageOf } from "../../../api";
import { fieldErrorsOf } from "../../../fieldErrors";
import { PuzzleContent, PuzzleType } from "../../../quests/PuzzleContent";
import { PUZZLE_TYPES } from "../puzzleTypes";
import { Banner } from "../../../ui/Banner";
import { Button } from "../../../ui/Button";
import { FormTextField } from "../../../ui/FormTextField";
import { LEAVING_SAVED, LeaveWarning } from "../../../ui/LeaveWarning";
import { HintRows } from "./HintRows";
import { MediaField } from "./MediaField";
import styles from "./Puzzle.module.css";
import {
  PUZZLES_KEY,
  type Puzzle,
  type PuzzleFormValues,
  UploadFailedError,
  formFieldOf,
  formValuesOf,
  keptMediaPath,
  puzzleDefinitionQuery,
  savePuzzle,
} from "./puzzleForm";

/** Why the editor was opened again after saving, if it was. */
interface EditorState {
  uploadError?: string;
}

const puzzlePath = (name: string) => `/puzzle/${encodeURIComponent(name)}`;

/** A text puzzle's Markdown, beside how players will see it. */
function TextEditor({
  control,
  displayName,
}: {
  control: ReturnType<typeof useForm<PuzzleFormValues>>["control"];
  displayName: string;
}) {
  const text = useWatch({ control, name: "text" });
  // Lets typing stay quick on a long puzzle: React draws the preview when it
  // has time, a moment behind the text, rather than on every keystroke.
  const preview = useDeferredValue(text);
  return (
    <div className={styles.textEditor}>
      <FormTextField
        control={control}
        name="text"
        rules={{ required: "Enter the puzzle's text" }}
        id="puzzle-text"
        label="Text"
        description="Markdown: **bold**, *italic*, lists, links, and images."
        rows={12}
      />
      <section className={styles.preview} aria-labelledby="preview-heading">
        <h2 id="preview-heading" className={styles.label}>
          As players see it
        </h2>
        <PuzzleContent
          displayName={displayName}
          type={PuzzleType.Text}
          text={preview}
        />
      </section>
    </div>
  );
}

function EditorForm({ puzzle }: { puzzle?: Puzzle }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uploadError = (useLocation().state as EditorState | null)?.uploadError;
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { isDirty },
  } = useForm<PuzzleFormValues>({ defaultValues: formValuesOf(puzzle) });
  const [type, displayName] = useWatch({
    control,
    name: ["type", "displayName"],
  });

  const save = useMutation({
    mutationFn: (values: PuzzleFormValues) => savePuzzle(values, puzzle),
    onSettled: () => queryClient.invalidateQueries({ queryKey: PUZZLES_KEY }),
    // The changes are saved, so there's nothing to ask about leaving.
    onSuccess: (_, values) =>
      navigate(puzzlePath(puzzle?.name ?? values.puzzleName.trim()), {
        state: LEAVING_SAVED,
      }),
    onError: async (error, values) => {
      if (error instanceof UploadFailedError && !puzzle) {
        // The new puzzle exists, so editing it is what's left.
        await navigate(`${puzzlePath(values.puzzleName.trim())}/edit`, {
          replace: true,
          state: {
            ...LEAVING_SAVED,
            uploadError: messageOf(error.cause),
          } satisfies EditorState & typeof LEAVING_SAVED,
        });
        return;
      }
      fieldErrorsOf(error).forEach(({ field, message }) =>
        setError(formFieldOf(field) as keyof PuzzleFormValues, { message })
      );
    },
  });
  const showBanner =
    save.error &&
    (save.error instanceof UploadFailedError ||
      fieldErrorsOf(save.error).length === 0);
  const cancelPath = puzzle ? puzzlePath(puzzle.name) : "/puzzles";

  return (
    <>
      <h1>{puzzle ? `Edit ${puzzle.displayName}` : "New puzzle"}</h1>
      {uploadError && !save.isError && (
        <Banner tone="danger">
          The puzzle was created, but its file couldn&apos;t be uploaded:{" "}
          {uploadError} Choose it again to try once more.
        </Banner>
      )}
      {showBanner && (
        <Banner tone="danger">
          {save.error instanceof UploadFailedError
            ? `The puzzle was saved, but its file couldn't be uploaded: ${messageOf(save.error.cause)}`
            : messageOf(save.error)}
        </Banner>
      )}
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => save.mutate(values))(event);
        }}
      >
        {puzzle ? (
          <p>Name: {puzzle.name}</p>
        ) : (
          <FormTextField
            control={control}
            name="puzzleName"
            rules={{
              required: "Enter a name",
              validate: (name) =>
                !String(name).includes("/") || 'A name can\'t contain "/"',
            }}
            id="puzzle-name"
            label="Name"
            description="Part of the puzzle's address, and can't be changed. Players never see it."
            inputProps={{ autoCapitalize: "none", autoCorrect: "off" }}
          />
        )}
        <FormTextField
          control={control}
          name="displayName"
          rules={{ required: "Enter a display name" }}
          id="display-name"
          label="Display name"
          description="What players see."
        />
        <div className={styles.field}>
          <label htmlFor="puzzle-type">Type</label>
          <select
            id="puzzle-type"
            className={styles.select}
            {...register("type", {
              valueAsNumber: true,
              // A file chosen for one kind of puzzle can't be another kind.
              onChange: () => setValue("file", null),
            })}
          >
            {PUZZLE_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {type === PuzzleType.Text ? (
          <TextEditor control={control} displayName={displayName} />
        ) : (
          // A new key for each type starts the field afresh.
          <MediaField
            key={type}
            control={control}
            type={type}
            displayName={displayName}
            keptPath={keptMediaPath(puzzle, type)}
          />
        )}
        <FormTextField
          control={control}
          name="solutionKeyword"
          rules={{ required: "Enter the solution's keywords" }}
          id="solution-keyword"
          label="Solution keywords"
          description="Separated by commas. A guess must contain all of them; letter case, spacing, and punctuation don't matter."
          inputProps={{ autoCapitalize: "none" }}
        />
        <FormTextField
          control={control}
          name="solutionDisplayText"
          rules={{ required: "Enter the solution as players see it" }}
          id="solution-display-text"
          label="Solution as shown"
          description="What players see once they've solved it."
        />
        <HintRows control={control} register={register} />
        <div className={styles.actions}>
          <Button
            id="save-puzzle"
            type="submit"
            variant="primary"
            isDisabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Link to={cancelPath}>Cancel</Link>
        </div>
      </form>
      <LeaveWarning when={isDirty} />
    </>
  );
}

/** Creating a puzzle, or changing one. */
export function PuzzleEditor() {
  const name = useParams().name;
  const puzzle = useQuery({
    ...puzzleDefinitionQuery(name ?? ""),
    enabled: name !== undefined,
  });
  const gone = puzzle.error instanceof ApiError && puzzle.error.status === 404;

  return (
    <>
      <title>
        {`${name === undefined ? "New puzzle" : "Edit puzzle"} · PuzzleQuest`}
      </title>
      {name === undefined ? (
        <EditorForm />
      ) : gone ? (
        <>
          <h1>Puzzle not found</h1>
          <Link to="/puzzles">See every puzzle</Link>
        </>
      ) : puzzle.data ? (
        // Editing starts from the puzzle as it was when the editor opened, and
        // isn't replaced when the data is fetched again, so nothing typed is
        // lost. The key starts afresh if the editor moves to another puzzle.
        <EditorForm key={puzzle.data.name} puzzle={puzzle.data} />
      ) : (
        puzzle.isError && (
          <Banner tone="danger">{messageOf(puzzle.error)}</Banner>
        )
      )}
    </>
  );
}
