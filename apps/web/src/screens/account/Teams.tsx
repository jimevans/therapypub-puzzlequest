import type { Schemas } from "@puzzlequest/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

function JoinTeam({
  userName,
  onJoined,
  onCancel,
}: {
  userName: string;
  onJoined: (team: TeamSummary) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const { control, handleSubmit } = useForm({
    defaultValues: { joinCode: "" },
  });
  // Just the code: players don't see the other teams, which would show one
  // client's groups to another.
  const join = useMutation({
    mutationFn: async ({ joinCode }: { joinCode: string }) =>
      dataOrThrow(
        await api.POST("/users/{userName}/teams", {
          params: { path: { userName } },
          body: { joinCode },
        })
      ),
    onSuccess: async (team) => {
      await queryClient.invalidateQueries(userQuery(userName));
      onJoined(team);
    },
  });

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => join.mutate(values))(event);
      }}
    >
      {join.error && <Banner tone="danger">{messageOf(join.error)}</Banner>}
      <FormTextField
        control={control}
        name="joinCode"
        rules={{ required: "Enter the team's join code" }}
        id="join-code"
        label="Join code"
        description="Your team's organizer can tell you it."
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
        <Button onPress={onCancel}>Cancel</Button>
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
  const [joined, setJoined] = useState<TeamSummary | null>(null);
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
      {joined && <Banner>You joined {joined.displayName}.</Banner>}
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
          onJoined={(team) => {
            setJoined(team);
            setIsJoining(false);
          }}
          onCancel={() => setIsJoining(false)}
        />
      ) : (
        <Button
          id="join-team"
          onPress={() => {
            setJoined(null);
            setIsJoining(true);
          }}
        >
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
