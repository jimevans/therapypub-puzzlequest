import type { Schemas } from "@puzzlequest/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { api, dataOrThrow, messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./Account.module.css";
import { userQuery } from "./userQuery";

type TeamSummary = Schemas["TeamSummary"];

async function fetchAllTeams() {
  const teams: Schemas["Team"][] = [];
  let after: string | undefined;
  do {
    const page = dataOrThrow(
      await api.GET("/teams", { params: { query: { after } } })
    );
    teams.push(...page.items);
    after = page.next ?? undefined;
  } while (after);
  return teams;
}

function JoinTeam({
  userName,
  memberOf,
  onDone,
}: {
  userName: string;
  memberOf: TeamSummary[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const teams = useQuery({ queryKey: ["teams"], queryFn: fetchAllTeams });
  const { control, register, handleSubmit, setError } = useForm({
    defaultValues: { teamName: "", joinCode: "" },
  });
  const join = useMutation({
    mutationFn: async ({
      teamName,
      joinCode,
    }: {
      teamName: string;
      joinCode: string;
    }) =>
      dataOrThrow(
        await api.PUT("/teams/{teamName}/members/{userName}", {
          params: { path: { teamName, userName } },
          body: { joinCode },
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries(userQuery(userName));
      onDone();
    },
  });
  const joinable = (teams.data ?? []).filter(
    ({ teamName }) => !memberOf.some((team) => team.teamName === teamName)
  );

  if (teams.isError) {
    return <Banner tone="danger">{messageOf(teams.error)}</Banner>;
  }
  if (!teams.data) {
    return null;
  }
  if (joinable.length === 0) {
    return <p>There are no other teams to join.</p>;
  }
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          if (values.teamName) {
            join.mutate(values);
          } else {
            setError("teamName", { message: "Choose a team" });
          }
        })(event);
      }}
    >
      {join.error && <Banner tone="danger">{messageOf(join.error)}</Banner>}
      <div className={styles.field}>
        <label htmlFor="team-choice">Team</label>
        <select
          id="team-choice"
          className={styles.select}
          {...register("teamName")}
        >
          <option value="">Choose a team</option>
          {joinable.map(({ teamName, displayName }) => (
            <option key={teamName} value={teamName}>
              {displayName}
            </option>
          ))}
        </select>
      </div>
      <FormTextField
        control={control}
        name="joinCode"
        rules={{ required: "Enter the team's join code" }}
        id="join-code"
        label="Join code"
        autoComplete="off"
        inputProps={{ autoCapitalize: "none", autoCorrect: "off" }}
      />
      <div className={styles.actions}>
        <Button
          id="join-team-confirm"
          type="submit"
          variant="primary"
          isDisabled={join.isPending}
        >
          Join team
        </Button>
        <Button onPress={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

/** The teams a user belongs to, with ways to join another and to leave. */
export function Teams({
  userName,
  teams,
}: {
  userName: string;
  teams: TeamSummary[];
}) {
  const queryClient = useQueryClient();
  const [isJoining, setIsJoining] = useState(false);
  const [leaving, setLeaving] = useState<TeamSummary | null>(null);
  const leave = useMutation({
    mutationFn: async (teamName: string) =>
      dataOrThrow(
        await api.DELETE("/teams/{teamName}/members/{userName}", {
          params: { path: { teamName, userName } },
        })
      ),
    onSettled: () => queryClient.invalidateQueries(userQuery(userName)),
  });

  return (
    <section id="teams" className={styles.section}>
      <h2>Teams</h2>
      {leave.error && <Banner tone="danger">{messageOf(leave.error)}</Banner>}
      {teams.length === 0 ? (
        <p>Not on a team yet.</p>
      ) : (
        <ul className={styles.teams}>
          {teams.map((team) => (
            <li key={team.teamName} data-team-name={team.teamName}>
              <span>{team.displayName}</span>
              <Button onPress={() => setLeaving(team)}>Leave</Button>
            </li>
          ))}
        </ul>
      )}
      {isJoining ? (
        <JoinTeam
          userName={userName}
          memberOf={teams}
          onDone={() => setIsJoining(false)}
        />
      ) : (
        <Button id="join-team" onPress={() => setIsJoining(true)}>
          Join a team
        </Button>
      )}
      <ConfirmDialog
        id="leave-team"
        isOpen={leaving !== null}
        title={`Leave ${leaving?.displayName ?? "this team"}?`}
        confirmLabel="Leave team"
        cancelLabel="Stay"
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          if (leaving) {
            leave.mutate(leaving.teamName);
          }
          setLeaving(null);
        }}
      >
        You'll need its join code to come back.
      </ConfirmDialog>
    </section>
  );
}
