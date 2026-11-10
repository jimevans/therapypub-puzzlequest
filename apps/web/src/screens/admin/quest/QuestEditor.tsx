import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, messageOf } from "../../../api";
import { fieldErrorsOf } from "../../../fieldErrors";
import { questQuery } from "../../../quests/queries";
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

/** Who a quest can be assigned to: any team, or any user. */
function AssigneeSelect({
  register,
  error,
}: {
  register: ReturnType<typeof useForm<QuestFormValues>>["register"];
  error?: string;
}) {
  const users = useQuery(allUsersQuery);
  const teams = useQuery(allTeamsQuery);
  if (users.isError || teams.isError) {
    return (
      <Banner tone="danger">
        {messageOf((users.error ?? teams.error) as Error)}
      </Banner>
    );
  }
  // Drawn only once there's a choice to show: a select box drawn before its
  // options are there shows nothing chosen, and that's what it would submit.
  if (!users.data || !teams.data) {
    return <p>Loading who it can be assigned to…</p>;
  }
  return (
    <div className={styles.field}>
      <label htmlFor="assignee">Assigned to</label>
      <select
        id="assignee"
        className={styles.select}
        aria-invalid={error !== undefined}
        aria-describedby={error ? "assignee-error" : undefined}
        {...register("assignee", { required: "Choose a team or a player" })}
      >
        <option value="">Choose…</option>
        <optgroup label="Teams">
          {teams.data.map((team) => (
            <option key={team.teamName} value={`team:${team.teamName}`}>
              {team.displayName} ({team.teamName})
            </option>
          ))}
        </optgroup>
        <optgroup label="Players">
          {users.data.map((user) => (
            <option key={user.userName} value={`user:${user.userName}`}>
              {user.displayName} ({user.userName})
            </option>
          ))}
        </optgroup>
      </select>
      {error && (
        <p id="assignee-error" className={styles.error}>
          {error}
        </p>
      )}
    </div>
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
          <p>Name: {quest.name}</p>
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
        <AssigneeSelect register={register} error={errors.assignee?.message} />
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
          <Link to={quest ? questPath(quest.name) : "/quests"}>Cancel</Link>
        </div>
      </form>
      <PuzzlePicker
        isOpen={picking}
        inQuest={new Set(fields.map((field) => field.puzzleName))}
        onCancel={() => setPicking(false)}
        onAdd={(puzzles) => {
          append(
            puzzles.map((puzzle) => ({
              puzzleName: puzzle.name,
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
        <EditorForm key={quest.data.name} quest={quest.data} />
      ) : (
        quest.isError && <Banner tone="danger">{messageOf(quest.error)}</Banner>
      )}
    </>
  );
}
