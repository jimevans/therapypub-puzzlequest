import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { api, dataOrThrow, messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./Account.module.css";

/** Asks for an emailed link to reset a forgotten password. */
export function ForgotPassword() {
  const { control, handleSubmit } = useForm({
    defaultValues: { identifier: "" },
  });
  const request = useMutation({
    mutationFn: async (identifier: string) =>
      dataOrThrow(
        await api.POST("/password-reset-requests", { body: { identifier } })
      ),
  });

  return (
    <>
      <title>Forgot password · PuzzleQuest</title>
      <h1>Forgot password</h1>
      {request.isSuccess ? (
        <div id="sent" className={styles.outcome}>
          {/* The same whether or not there's such an account, so that this
              can't be used to find out who has one. */}
          <p>
            If an account matches what you entered, we've sent it an email with
            a link to reset your password. The link expires in one hour.
          </p>
          <Link to="/login">Return to sign in</Link>
        </div>
      ) : (
        <>
          <p>
            Enter your user name or email address, and we'll email you a link to
            reset your password.
          </p>
          {request.error && (
            <Banner tone="danger">{messageOf(request.error)}</Banner>
          )}
          <form
            className={styles.form}
            noValidate
            onSubmit={(event) => {
              void handleSubmit(({ identifier }) =>
                request.mutate(identifier.trim())
              )(event);
            }}
          >
            <FormTextField
              control={control}
              name="identifier"
              rules={{
                validate: (value) =>
                  value.trim() !== "" ||
                  "Enter your user name or email address",
              }}
              id="identifier"
              label="User name or email"
              autoComplete="username"
              inputProps={{
                autoCapitalize: "none",
                autoCorrect: "off",
                spellCheck: false,
              }}
            />
            <Button
              id="send"
              type="submit"
              variant="primary"
              isDisabled={request.isPending}
            >
              Send reset link
            </Button>
          </form>
          <Link to="/login">Return to sign in</Link>
        </>
      )}
    </>
  );
}
