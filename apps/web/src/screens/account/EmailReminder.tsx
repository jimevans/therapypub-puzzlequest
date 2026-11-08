import { useMutation } from "@tanstack/react-query";
import { ApiError, api, dataOrThrow } from "../../api";
import { Button } from "../../ui/Button";
import styles from "./EmailReminder.module.css";

/** Asks the player to verify their email address, with a way to resend it. */
export function EmailReminder({ userName }: { userName: string }) {
  const resend = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST("/users/{userName}/email-verification-requests", {
          params: { path: { userName } },
        })
      ),
  });

  return (
    <div id="email-reminder" className={styles.reminder}>
      <p>
        Please verify your email address: follow the link in the email we sent
        you.
      </p>
      <Button
        id="resend-verification"
        isDisabled={resend.isSuccess}
        isPending={resend.isPending}
        onPress={() => resend.mutate()}
      >
        Send it again
      </Button>
      <p id="resend-verification-result" role="status">
        {resend.isSuccess && "Sent. Check your inbox."}
        {resend.isError &&
          (resend.error instanceof ApiError
            ? resend.error.message
            : "Couldn't reach the server. Check your connection and try again.")}
      </p>
    </div>
  );
}
