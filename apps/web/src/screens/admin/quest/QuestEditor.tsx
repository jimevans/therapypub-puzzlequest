import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Control, useFieldArray, useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, messageOf } from "../../../api";
import { fieldErrorsOf } from "../../../fieldErrors";
import { questQuery } from "../../../quests/queries";
import type { EntrantValues } from "./questForm";
import { Banner } from "../../../ui/Banner";
import { Button } from "../../../ui/Button";
import { FormTextField } from "../../../ui/FormTextField";
import { LEAVING_SAVED, LeaveWarning } from "../../../ui/LeaveWarning";
import { SortableList } from "../../../ui/SortableList";
import { allQuestsQuery, allTeamsQuery, allUsersQuery } from "../listQueries";
import { PuzzlePicker } from "./PuzzlePicker";
import styles from "./QuestEditor.module.css";
import {
  type Quest,
  type QuestFormValues,
  formFieldOf,
  formValuesOf,
  isCompleted,
  reachedCount,
  saveQuest,
} from "./questForm";

const questPath = (name: string) => `/quest/${encodeURIComponent(name)}`;

/** The teams and players playing the quest, in order. */
function EntrantsField({
  control,
  error,
}: {
  control: Control<QuestFormValues>;
  error?: string;
}) {
  const users = useQuery(allUsersQuery);
  const teams = useQuery(allTeamsQuery);
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "entrants",
    rules: {
      validate: (entrants) => entrants.length > 0 || "Add a team or a player",
    },
  });
  // The team or player chosen to add, as "team:name" or "player:name".
  const [choice, setChoice] = useState("");
  const added = new Set(fields.map((field) => `${field.kind}:${field.name}`));
  const errorId = "entrants-error";

  const add = () => {
    const [kind, ...rest] = choice.split(":");
    const name = rest.join(":");
    const label =
      kind === "team"
        ? `${teams.data?.find((team) => team.teamName === name)?.displayName ?? name} (team)`
        : `${users.data?.find((user) => user.userName === name)?.displayName ?? name} (player)`;
    append({
      kind: kind as EntrantValues["kind"],
      name,
      label,
      started: false,
    });
    setChoice("");
  };

  return (
    <fieldset
      id="entrants"
      className={styles.stops}
      aria-describedby={error ? errorId : undefined}
    >
      <legend>Entrants</legend>
      <p className={styles.note}>
        The teams and players who play it, each with its own progress through
        the same stops: more than one makes it a race. A player can be in only
        one of them.
      </p>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
      {fields.length === 0 ? (
        <p>No entrants yet.</p>
      ) : (
        <SortableList
          items={fields}
          getId={(field) => field.id}
          label={(field) => field.label}
          onMove={move}
          className={styles.stopList}
          renderItem={(field, index, handle) => (
            <div
              className={styles.stop}
              data-entrant={`${field.kind}:${field.name}`}
            >
              {handle}
              <span className={styles.stopNumber}>{index + 1}</span>
              <span className={styles.stopName}>{field.label}</span>
              <span className={styles.stopActions}>
                <Button
                  aria-label={`Move ${field.label} up`}
                  isDisabled={index === 0}
                  onPress={() => move(index, index - 1)}
                >
                  Up
                </Button>
                <Button
                  aria-label={`Move ${field.label} down`}
                  isDisabled={index === fields.length - 1}
                  onPress={() => move(index, index + 1)}
                >
                  Down
                </Button>
                {/* Once it has started, resetting its entry comes first. */}
                {field.started ? (
                  <span className={styles.fixedMark}>Started</span>
                ) : (
                  <Button
                    aria-label={`Remove ${field.label}`}
                    onPress={() => remove(index)}
                  >
                    Remove
                  </Button>
                )}
              </span>
            </div>
          )}
        />
      )}
      {users.isError || teams.isError ? (
        <Banner tone="danger">
          {messageOf((users.error ?? teams.error) as Error)}
        </Banner>
      ) : !users.data || !teams.data ? (
        <p>Loading the teams and players…</p>
      ) : (
        <div className={styles.addEntrant}>
          <div className={styles.field}>
            <label htmlFor="entrant-choice">Add a team or player</label>
            <select
              id="entrant-choice"
              className={styles.select}
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">Choose…</option>
              <optgroup label="Teams">
                {teams.data
                  .filter((team) => !added.has(`team:${team.teamName}`))
                  .map((team) => (
                    <option key={team.teamName} value={`team:${team.teamName}`}>
                      {team.displayName} ({team.teamName})
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Players">
                {users.data
                  .filter((user) => !added.has(`player:${user.userName}`))
                  .map((user) => (
                    <option
                      key={user.userName}
                      value={`player:${user.userName}`}
                    >
                      {user.displayName} ({user.userName})
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
          <Button id="add-entrant" isDisabled={choice === ""} onPress={add}>
            Add
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function EditorForm({ quest }: { quest?: Quest }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { isDirty, errors },
  } = useForm<QuestFormValues>({ defaultValues: formValuesOf(quest) });
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "stops",
  });
  const completed = isCompleted(quest);
  const fixed = completed ? fields.length : reachedCount(quest);

  const save = useMutation({
    mutationFn: (values: QuestFormValues) => saveQuest(values, quest),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: allQuestsQuery.queryKey }),
    // The changes are saved, so there's nothing to ask about leaving.
    onSuccess: (name) => navigate(questPath(name), { state: LEAVING_SAVED }),
    onError: (error) => {
      fieldErrorsOf(error).forEach(({ field, message }) =>
        setError(formFieldOf(field), { message })
      );
    },
  });
  const showBanner = save.error && fieldErrorsOf(save.error).length === 0;

  return (
    <>
      <h1>{quest ? `Edit ${quest.displayName}` : "New quest"}</h1>
      {showBanner && <Banner tone="danger">{messageOf(save.error)}</Banner>}
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => save.mutate(values))(event);
        }}
      >
        {quest ? (
          <p>Name: {quest.questName}</p>
        ) : (
          <FormTextField
            control={control}
            name="questName"
            rules={{
              required: "Enter a name",
              validate: (name) =>
                !String(name).includes("/") || 'A name can\'t contain "/"',
            }}
            id="quest-name"
            label="Name"
            description="Part of the quest's address, and can't be changed."
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
          <label>
            <input
              type="checkbox"
              aria-describedby="private-description"
              {...register("isPrivate")}
            />{" "}
            Private
          </label>
          <p id="private-description" className={styles.note}>
            Only its players and staff can follow it. Otherwise anyone can.
          </p>
        </div>

        <EntrantsField
          control={control}
          error={errors.entrants?.message ?? errors.entrants?.root?.message}
        />

        <fieldset id="stops" className={styles.stops}>
          <legend>Stops</legend>
          {completed ? (
            <p className={styles.note}>
              The quest is completed, so its stops can&apos;t change until
              it&apos;s reset.
            </p>
          ) : fixed > 0 ? (
            <p className={styles.note}>
              The players have reached the first{" "}
              {fixed === 1 ? "stop" : `${fixed} stops`}, so{" "}
              {fixed === 1 ? "it stays" : "they stay"} in place. Later stops can
              still change.
            </p>
          ) : (
            <p className={styles.note}>
              Players reach them in this order, one at a time.
            </p>
          )}
          {errors.stops?.message && (
            <p className={styles.error}>{errors.stops.message}</p>
          )}
          {fields.length === 0 ? (
            <p>No stops yet.</p>
          ) : (
            <SortableList
              items={fields}
              getId={(field) => field.id}
              label={(field) => field.displayName}
              fixedCount={fixed}
              onMove={move}
              className={styles.stopList}
              renderItem={(field, index, handle) => {
                const isFixed = index < fixed;
                return (
                  <div
                    className={styles.stop}
                    data-puzzle-name={field.puzzleName}
                  >
                    {handle ?? (
                      <span className={styles.fixedMark}>Reached</span>
                    )}
                    <span className={styles.stopNumber}>{index + 1}</span>
                    <span className={styles.stopName}>
                      <Link
                        to={`/puzzle/${encodeURIComponent(field.puzzleName)}`}
                      >
                        {field.displayName}
                      </Link>
                      <span className={styles.secondaryText}>
                        {field.activationCode ?? "Code assigned when saved"}
                      </span>
                      <label className={styles.cardWord}>
                        <span>Card word</span>
                        <input
                          {...register(`stops.${index}.cardWord`)}
                          aria-label={`Card word for ${field.displayName}`}
                          maxLength={40}
                          autoComplete="off"
                        />
                      </label>
                    </span>
                    {!isFixed && (
                      <span className={styles.stopActions}>
                        <Button
                          aria-label={`Move ${field.displayName} up`}
                          isDisabled={index <= fixed}
                          onPress={() => move(index, index - 1)}
                        >
                          Up
                        </Button>
                        <Button
                          aria-label={`Move ${field.displayName} down`}
                          isDisabled={index === fields.length - 1}
                          onPress={() => move(index, index + 1)}
                        >
                          Down
                        </Button>
                        <Button
                          aria-label={`Remove ${field.displayName}`}
                          onPress={() => remove(index)}
                        >
                          Remove
                        </Button>
                      </span>
                    )}
                  </div>
                );
              }}
            />
          )}
          {!completed && (
            <Button id="add-puzzles" onPress={() => setPicking(true)}>
              Add puzzles
            </Button>
          )}
        </fieldset>

        <div className={styles.actions}>
          <Button
            id="save-quest"
            type="submit"
            variant="primary"
            isPending={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Link to={quest ? questPath(quest.questName) : "/quests"}>
            Cancel
          </Link>
        </div>
      </form>
      <PuzzlePicker
        isOpen={picking}
        inQuest={new Set(fields.map((field) => field.puzzleName))}
        onCancel={() => setPicking(false)}
        onAdd={(puzzles) => {
          append(
            puzzles.map((puzzle) => ({
              puzzleName: puzzle.puzzleName,
              displayName: puzzle.displayName,
              cardWord: "",
            }))
          );
          setPicking(false);
        }}
      />
      <LeaveWarning when={isDirty} />
    </>
  );
}

/** Creating a quest, or changing one. */
export function QuestEditor() {
  const name = useParams().name;
  const quest = useQuery({
    ...questQuery(name ?? ""),
    enabled: name !== undefined,
  });
  const gone = quest.error instanceof ApiError && quest.error.status === 404;

  return (
    <>
      <title>
        {`${name === undefined ? "New quest" : "Edit quest"} · PuzzleQuest`}
      </title>
      {name === undefined ? (
        <EditorForm />
      ) : gone ? (
        <>
          <h1>Quest not found</h1>
          <Link to="/quests">See every quest</Link>
        </>
      ) : quest.data ? (
        // Editing starts from the quest as it was when the editor opened, and
        // isn't replaced when the data is fetched again, so nothing typed is
        // lost. The key starts afresh if the editor moves to another quest.
        <EditorForm key={quest.data.questName} quest={quest.data} />
      ) : (
        quest.isError && <Banner tone="danger">{messageOf(quest.error)}</Banner>
      )}
    </>
  );
}
