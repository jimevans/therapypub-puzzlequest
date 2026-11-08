import { useMutation } from "@tanstack/react-query";
import { api, dataOrThrow, messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import styles from "./Account.module.css";
import { useTokenFromLink } from "./tokens";

/**
 * Verifies an email address, from the link in a verification email. It takes a
 * press of the button, because email security scanners follow links by
 * themselves, and that alone mustn't verify an address.
 */
export function VerifyEmail() {
  const token = useTokenFromLink();
  const verify = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST("/email-verifications", {
          body: { token: token ?? "" },
        })
      ),
  });

  return (
    <>
      <title>Verify your email address · PuzzleQuest</title>
      <h1>Verify your email address</h1>
      {verify.isSuccess ? (
        <div id="verify-complete" className={styles.outcome}>
          <p>Thank you. Your email address is verified.</p>
          <a href="/">Go to PuzzleQuest</a>
        </div>
      ) : token === null ? (
        <Banner tone="danger">
          This verification link is invalid. Sign in to send a new one from your
          profile.
        </Banner>
      ) : (
        <>
          <p>Confirm that you received the email we sent to this address.</p>
          {verify.error && (
            <Banner tone="danger">{messageOf(verify.error)}</Banner>
          )}
          <Button
            id="verify"
            variant="primary"
            isPending={verify.isPending}
            onPress={() => verify.mutate()}
          >
            Verify my email address
          </Button>
        </>
      )}
    </>
  );
}
