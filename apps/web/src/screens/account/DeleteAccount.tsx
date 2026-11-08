import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { api, dataOrThrow, messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import dialogStyles from "../../ui/Dialog.module.css";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./Account.module.css";

function ConfirmDeletion({
  userName,
  onCancel,
}: {
  userName: string;
  onCancel: () => void;
}) {
  const { control, handleSubmit } = useForm({
    defaultValues: { password: "" },
  });
  const remove = useMutation({
    mutationFn: async ({ password }: { password: string }) =>
      dataOrThrow(
        await api.DELETE("/users/{userName}", {
          params: { path: { userName } },
          body: { password },
        })
      ),
    // The account and its sessions are gone, so the page starts afresh,
    // signed out.
    onSuccess: () => location.assign("/"),
  });

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => remove.mutate(values))(event);
      }}
    >
      <p>
        Your account goes, with your details, and you&apos;ll leave your teams.
        Your name comes out of quests&apos; activity logs. A quest you were
        playing on your own stays, for the puzzle master. This can&apos;t be
        undone.
      </p>
      {remove.error && <Banner tone="danger">{messageOf(remove.error)}</Banner>}
      <FormTextField
        control={control}
        name="password"
        rules={{ required: "Enter your password" }}
        id="delete-account-password"
        label="Your password"
        type="password"
        autoComplete="current-password"
      />
      <div className={dialogStyles.actions}>
        <Button onPress={onCancel}>Keep my account</Button>
        <Button
          id="delete-account-confirm"
          type="submit"
          variant="primary"
          isPending={remove.isPending}
        >
          Delete my account
        </Button>
      </div>
    </form>
  );
}

/** Deleting the signed-in user's own account, once they've confirmed it. */
export function DeleteAccount({ userName }: { userName: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <section id="delete-account" className={styles.section}>
      <h2>Delete account</h2>
      <p>Delete your account and everything that names you.</p>
      <Button id="delete-account-button" onPress={() => setAsking(true)}>
        Delete my account
      </Button>
      <Dialog
        id="delete-account-dialog"
        isOpen={asking}
        title="Delete your account?"
        onDismiss={() => setAsking(false)}
      >
        <ConfirmDeletion
          userName={userName}
          onCancel={() => setAsking(false)}
        />
      </Dialog>
    </section>
  );
}
