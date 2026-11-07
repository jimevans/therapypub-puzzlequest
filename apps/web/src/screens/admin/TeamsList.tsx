import type { Schemas } from "@puzzlequest/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError, api, dataOrThrow, messageOf } from "../../api";
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
import { allTeamsQuery, allUsersQuery } from "./listQueries";

type Team = Schemas["Team"];

interface TeamFormValues {
  teamName: string;
  displayName: string;
  joinCode: string;
}

const QUERY_KEY = ["teams"];

type Member = NonNullable<Team["members"]>[number];

/** The team was saved, but some of the changes to its members weren't. */
class MembersNotChangedError extends Error {}

/**
 * Brings the team's members in line with the form's, one change at a time.
 * Adding someone already on the team, or removing someone already gone, is
 * taken as done, so trying again after some changes failed is safe.
 * @param teamName the team
 * @param joinCode the team's join code, which adding someone needs
 * @param before the members when the form opened
 * @param after the members the form holds
 * @returns what couldn't be changed, and why
 */
async function changeMembers(
  teamName: string,
  joinCode: string,
  before: readonly Member[],
  after: readonly Member[]
): Promise<string[]> {
  const had = new Set(before.map(({ userName }) => userName));
  const has = new Set(after.map(({ userName }) => userName));
  const failures: string[] = [];
  const attempt = async (
    description: string,
    change: () => Promise<unknown>,
    alreadyDone: number
  ) => {
    try {
      await change();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === alreadyDone)) {
        failures.push(`${description}: ${messageOf(error as Error)}`);
      }
    }
  };
  for (const member of after.filter(({ userName }) => !had.has(userName))) {
    await attempt(
      `Adding ${member.displayName}`,
      async () =>
        dataOrThrow(
          await api.PUT("/teams/{teamName}/members/{userName}", {
            params: { path: { teamName, userName: member.userName } },
            body: { joinCode },
          })
        ),
      409
    );
  }
  for (const member of before.filter(({ userName }) => !has.has(userName))) {
    await attempt(
      `Removing ${member.displayName}`,
      async () =>
        dataOrThrow(
          await api.DELETE("/teams/{teamName}/members/{userName}", {
            params: { path: { teamName, userName: member.userName } },
          })
        ),
      404
    );
  }
  return failures;
}

/** The team's members, to remove any of them or add players. */
function MemberFields({
  members,
  onChange,
}: {
  members: Member[];
  onChange: (members: Member[]) => void;
}) {
  const users = useQuery(allUsersQuery);
  const [chosen, setChosen] = useState("");
  const onTeam = new Set(members.map(({ userName }) => userName));
  const available = (users.data ?? []).filter(
    ({ userName }) => !onTeam.has(userName)
  );

  return (
    <fieldset id="team-members" className={styles.members}>
      <legend>Members</legend>
      {members.length === 0 ? (
        <p>No members yet.</p>
      ) : (
        <ul>
          {members.map((member) => (
            <li key={member.userName} data-user-name={member.userName}>
              <span>
                {member.displayName}{" "}
                <span className={styles.secondaryText}>{member.userName}</span>
              </span>
              <Button
                aria-label={`Remove ${member.displayName}`}
                onPress={() =>
                  onChange(
                    members.filter(
                      ({ userName }) => userName !== member.userName
                    )
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {users.isError && <Banner tone="danger">{messageOf(users.error)}</Banner>}
      <div className={styles.addMember}>
        <label htmlFor="team-add-member">Add a player</label>
        <div>
          <select
            id="team-add-member"
            className={styles.select}
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
          >
            <option value="">Choose…</option>
            {available.map((user) => (
              <option key={user.userName} value={user.userName}>
                {user.displayName} ({user.userName})
              </option>
            ))}
          </select>
          <Button
            id="team-add-member-button"
            isDisabled={chosen === ""}
            onPress={() => {
              const user = available.find(
                ({ userName }) => userName === chosen
              );
              if (user) {
                onChange([
                  ...members,
                  { userName: user.userName, displayName: user.displayName },
                ]);
              }
              setChosen("");
            }}
          >
            Add
          </Button>
        </div>
      </div>
      <p className={styles.note}>Changes to the members are made on Save.</p>
    </fieldset>
  );
}

function TeamForm({ team, onDone }: { team: Team | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<Member[]>(team?.members ?? []);
  const { control, handleSubmit, setError } = useForm<TeamFormValues>({
    defaultValues: {
      teamName: team?.teamName ?? "",
      displayName: team?.displayName ?? "",
      joinCode: team?.joinCode ?? "",
    },
  });
  const save = useMutation({
    mutationFn: async ({ teamName, displayName, joinCode }: TeamFormValues) => {
      dataOrThrow(
        team
          ? await api.PATCH("/teams/{teamName}", {
              params: { path: { teamName: team.teamName } },
              body: { displayName, joinCode },
            })
          : await api.POST("/teams", {
              body: { teamName, displayName, joinCode },
            })
      );
      const failures = await changeMembers(
        team?.teamName ?? teamName,
        joinCode,
        team?.members ?? [],
        members
      );
      if (failures.length > 0) {
        throw new MembersNotChangedError(
          `The team was saved, but not every change to its members: ${failures.join("; ")}.`
        );
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onSuccess: onDone,
    onError: (error) => {
      fieldErrorsOf<keyof TeamFormValues>(error).forEach(({ field, message }) =>
        setError(field, { message })
      );
    },
  });
  const showBanner = save.error && fieldErrorsOf(save.error).length === 0;
  const bannerText =
    save.error instanceof MembersNotChangedError
      ? save.error.message
      : save.error && messageOf(save.error);

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => save.mutate(values))(event);
      }}
    >
      {showBanner && <Banner tone="danger">{bannerText}</Banner>}
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
      <MemberFields members={members} onChange={setMembers} />
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
