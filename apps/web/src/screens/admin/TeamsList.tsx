import type { Schemas } from "@puzzlequest/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { api, dataOrThrow, messageOf } from "../../api";
import { fieldErrorsOf } from "../../fieldErrors";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import dialogStyles from "../../ui/Dialog.module.css";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./Admin.module.css";
import {
  AdminList,
  DeleteButton,
  DeleteDialog,
  useDeletion,
} from "./AdminList";
import { allTeamsQuery } from "./listQueries";

type Team = Schemas["Team"];

interface TeamFormValues {
  teamName: string;
  displayName: string;
  joinCode: string;
}

const QUERY_KEY = ["teams"];

function TeamForm({ team, onDone }: { team: Team | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { control, handleSubmit, setError } = useForm<TeamFormValues>({
    defaultValues: {
      teamName: team?.teamName ?? "",
      displayName: team?.displayName ?? "",
      joinCode: team?.joinCode ?? "",
    },
  });
  const save = useMutation({
    mutationFn: async ({ teamName, displayName, joinCode }: TeamFormValues) =>
      dataOrThrow(
        team
          ? await api.PATCH("/teams/{teamName}", {
              params: { path: { teamName: team.teamName } },
              body: { displayName, joinCode },
            })
          : await api.POST("/teams", {
              body: { teamName, displayName, joinCode },
            })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onDone();
    },
    onError: (error) => {
      fieldErrorsOf<keyof TeamFormValues>(error).forEach(({ field, message }) =>
        setError(field, { message })
      );
    },
  });
  const showBanner = save.error && fieldErrorsOf(save.error).length === 0;

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => save.mutate(values))(event);
      }}
    >
      {showBanner && <Banner tone="danger">{messageOf(save.error)}</Banner>}
      {!team && (
        <FormTextField
          control={control}
          name="teamName"
          rules={{ required: "Enter a team name" }}
          id="team-name"
          label="Team name"
          description="Used in addresses. It can't be changed later."
          inputProps={{ autoCapitalize: "none", autoCorrect: "off" }}
        />
      )}
      <FormTextField
        control={control}
        name="displayName"
        rules={{ required: "Enter a display name" }}
        id="team-display-name"
        label="Display name"
      />
      <FormTextField
        control={control}
        name="joinCode"
        rules={{ required: "Enter a join code" }}
        id="team-join-code"
        label="Join code"
        description="Players need this to join the team."
        inputProps={{ autoCapitalize: "none", autoCorrect: "off" }}
      />
      <div className={dialogStyles.actions}>
        <Button onPress={onDone}>Cancel</Button>
        <Button
          id="save-team"
          type="submit"
          variant="primary"
          isDisabled={save.isPending}
        >
          Save
        </Button>
      </div>
    </form>
  );
}

/** Every team, with its join code and members, for setting teams up. */
export function TeamsList() {
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const teams = useQuery(allTeamsQuery);
  const flow = useDeletion<Team>({
    queryKey: QUERY_KEY,
    remove: async ({ teamName }) =>
      dataOrThrow(
        await api.DELETE("/teams/{teamName}", {
          params: { path: { teamName } },
        })
      ),
  });

  return (
    <AdminList
      title="Teams"
      action={
        <Button
          id="new-team"
          variant="primary"
          onPress={() => setEditing("new")}
        >
          New team
        </Button>
      }
      isEmpty={teams.data?.length === 0}
      emptyMessage="There are no teams yet."
      error={teams.error ?? flow.deletion.error}
    >
      {teams.data && teams.data.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Team</th>
              <th className={styles.secondary}>Name</th>
              <th>Join code</th>
              <th className={styles.secondary}>Members</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {teams.data.map((team) => (
              <tr key={team.teamName} data-team-name={team.teamName}>
                <td>{team.displayName}</td>
                <td className={styles.secondary}>{team.teamName}</td>
                <td>{team.joinCode}</td>
                <td className={styles.secondary}>
                  {team.members
                    ?.map(({ displayName }) => displayName)
                    .join(", ")}
                </td>
                <td className={styles.rowActions}>
                  <Button
                    aria-label={`Edit ${team.displayName}`}
                    onPress={() => setEditing(team)}
                  >
                    Edit
                  </Button>
                  <DeleteButton
                    name={team.displayName}
                    onPress={() => flow.setAsking(team)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Dialog
        id="team-dialog"
        isOpen={editing !== null}
        title={editing === "new" ? "New team" : "Edit team"}
        onDismiss={() => setEditing(null)}
      >
        <TeamForm
          team={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      </Dialog>
      <DeleteDialog flow={flow} nameOf={({ displayName }) => displayName}>
        Quests assigned to the team stay, assigned to a deleted team.
      </DeleteDialog>
    </AdminList>
  );
}
