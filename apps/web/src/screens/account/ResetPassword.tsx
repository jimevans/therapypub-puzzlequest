import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { api, dataOrThrow, messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./Account.module.css";
import { PASSWORDS_DIFFER, newPasswordRules } from "./passwords";
import { useTokenFromLink } from "./tokens";

/** Chooses a new password, from the link in a password reset email. */
export function ResetPassword() {
  const token = useTokenFromLink();
  const { control, handleSubmit, getValues } = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const reset = useMutation({
    mutationFn: async (newPassword: string) =>
      dataOrThrow(
        await api.POST("/password-resets", {
          body: { resetToken: token ?? "", newPassword },
        })
      ),
  });

  return (
    <>
      <title>Choose a new password · PuzzleQuest</title>
      <h1>Choose a new password</h1>
      {reset.isSuccess ? (
        <div id="reset-complete" className={styles.outcome}>
          <p>
            Your password has been reset, and you have been signed out
            everywhere.
          </p>
          <Link to="/login">Sign in with your new password</Link>
        </div>
      ) : token === null ? (
        <>
          <Banner tone="danger">
            This password reset link is invalid. Request a new one below.
          </Banner>
          <Link to="/user/password/forgot">Request a new link</Link>
        </>
      ) : (
        <>
          {reset.error && (
            <Banner tone="danger">{messageOf(reset.error)}</Banner>
          )}
          <form
            className={styles.form}
            noValidate
            onSubmit={(event) => {
              void handleSubmit(({ newPassword }) => reset.mutate(newPassword))(
                event
              );
            }}
          >
            <FormTextField
              control={control}
              name="newPassword"
              rules={newPasswordRules}
              id="new-password"
              label="New password"
              type="password"
              autoComplete="new-password"
            />
            <FormTextField
              control={control}
              name="confirmPassword"
              rules={{
                validate: (value) =>
                  value === getValues("newPassword") || PASSWORDS_DIFFER,
              }}
              id="new-password-confirm"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
            />
            {/* Not "reset": a form's elements become properties of the form by
                their IDs, so that would replace form.reset, which React Aria
                relies on, and crash the page. */}
            <Button
              id="reset-password"
              type="submit"
              variant="primary"
              isPending={reset.isPending}
            >
              Reset password
            </Button>
          </form>
        </>
      )}
    </>
  );
}
