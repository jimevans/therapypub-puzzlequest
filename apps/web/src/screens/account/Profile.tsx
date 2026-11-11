import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { ApiError, api, dataOrThrow, messageOf } from "../../api";
import { isAdministrator, useSession } from "../../session";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { LinkButton } from "../../ui/LinkButton";
import styles from "./Account.module.css";
import { ChangePassword } from "./ChangePassword";
import { DeleteAccount } from "./DeleteAccount";
import { EmailReminder } from "./EmailReminder";
import { Teams } from "./Teams";
import { ROLES, formatPhone } from "./accountForm";
import { userQuery } from "./userQuery";

/** For an administrator helping a user who can't sign in. */
function SendResetLink({
  userName,
  email,
}: {
  userName: string;
  email: string;
}) {
  const send = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST("/users/{userName}/password-reset-links", {
          params: { path: { userName } },
        })
      ),
  });
  return (
    <section id="admin-password-reset" className={styles.section}>
      <h2>Password</h2>
      <p>
        Email this user a link to choose a new password. Their current password
        keeps working until they use the link.
      </p>
      {send.error && <Banner tone="danger">{messageOf(send.error)}</Banner>}
      {send.isSuccess && <Banner>Password reset email sent to {email}.</Banner>}
      <Button
        id="send-reset-link-button"
        isPending={send.isPending}
        onPress={() => send.mutate()}
      >
        Send password reset email
      </Button>
    </section>
  );
}

/** A user's details: their own, or anyone's for an administrator. */
export function Profile() {
  const userName = useParams().userName ?? "";
  const session = useSession();
  const user = useQuery(userQuery(userName));
  const viewer = session.data?.user;
  const gone = user.error instanceof ApiError && user.error.status === 404;

  if (gone) {
    return (
      <>
        <title>User not found · PuzzleQuest</title>
        <h1>User not found</h1>
        <a href="/">Go to the home page</a>
      </>
    );
  }
  if (!user.data) {
    return user.isError ? (
      <Banner tone="danger">{messageOf(user.error)}</Banner>
    ) : null;
  }

  const details = user.data;
  const isSelf = viewer?.userName === details.userName;
  const role = ROLES.find(({ value }) => value === details.role);
  return (
    <>
      <title>{`${details.displayName} · PuzzleQuest`}</title>
      {isSelf && !details.emailVerified && (
        <EmailReminder userName={details.userName} />
      )}
      <h1>{details.displayName}</h1>
      <dl id="user-details" className={styles.details}>
        <dt>User name</dt>
        <dd>{details.userName}</dd>
        <dt>Email</dt>
        <dd>
          {details.email}
          {details.emailVerified ? "" : " (not verified)"}
        </dd>
        <dt>Phone number</dt>
        <dd>{details.phone ? formatPhone(details.phone) : "None"}</dd>
        <dt>SMS messages</dt>
        <dd>{details.sms ? "Allowed" : "Not allowed"}</dd>
        {isAdministrator(viewer) && (
          <>
            <dt>Role</dt>
            <dd>{role?.label ?? details.role}</dd>
          </>
        )}
      </dl>
      <LinkButton
        id="edit-profile"
        to={`/user/${encodeURIComponent(details.userName)}/edit`}
      >
        Edit details
      </LinkButton>
      <Teams userName={details.userName} teams={details.teams ?? []} />
      {isSelf && <ChangePassword userName={details.userName} />}
      {isSelf && <DeleteAccount userName={details.userName} />}
      {isAdministrator(viewer) && !isSelf && (
        <SendResetLink userName={details.userName} email={details.email} />
      )}
    </>
  );
}
