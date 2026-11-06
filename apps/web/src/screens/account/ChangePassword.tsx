import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api, dataOrThrow, messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./Account.module.css";
import { PASSWORDS_DIFFER, newPasswordRules } from "./passwords";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

/** Changes the signed-in user's own password. */
export function ChangePassword({ userName }: { userName: string }) {
  const { control, handleSubmit, getValues, reset } = useForm({
    defaultValues: EMPTY,
  });
  const change = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: typeof EMPTY) =>
      dataOrThrow(
        await api.PUT("/users/{userName}/password", {
          params: { path: { userName } },
          body: { currentPassword, newPassword },
        })
      ),
    onSuccess: () => reset(EMPTY),
  });

  return (
    <section id="change-password" className={styles.section}>
      <h2>Change password</h2>
      {change.error && <Banner tone="danger">{messageOf(change.error)}</Banner>}
      {change.isSuccess && (
        <Banner>
          Your password has been changed. You have been signed out on all other
          devices.
        </Banner>
      )}
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => change.mutate(values))(event);
        }}
      >
        <FormTextField
          control={control}
          name="currentPassword"
          rules={{ required: "Enter your current password" }}
          id="current-password"
          label="Current password"
          type="password"
          autoComplete="current-password"
        />
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
        <Button
          id="change-password-button"
          type="submit"
          isDisabled={change.isPending}
        >
          Change password
        </Button>
      </form>
    </section>
  );
}
