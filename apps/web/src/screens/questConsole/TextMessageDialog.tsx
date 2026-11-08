import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api, dataOrThrow, messageOf } from "../../api";
import { fieldErrorsOf } from "../../fieldErrors";
import { questQueryKey } from "../../live/useLiveQuest";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import dialogStyles from "../../ui/Dialog.module.css";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./QuestConsole.module.css";

interface TextMessageValues {
  message: string;
  expectedResponse: string;
  responseConfirmation: string;
}

interface TextMessageDialogProps {
  questName: string;
  isOpen: boolean;
  onClose: (sent: boolean) => void;
}

function TextMessageForm({ questName, onClose }: TextMessageDialogProps) {
  const queryClient = useQueryClient();
  const { control, handleSubmit, setError } = useForm<TextMessageValues>({
    defaultValues: {
      message: "",
      expectedResponse: "",
      responseConfirmation: "",
    },
  });
  const send = useMutation({
    mutationFn: async ({
      message,
      expectedResponse,
      responseConfirmation,
    }: TextMessageValues) =>
      dataOrThrow(
        await api.POST("/quests/{name}/text-messages", {
          params: { path: { name: questName } },
          body: expectedResponse.trim()
            ? { message, expectedResponse, responseConfirmation }
            : { message },
        })
      ),
    onSuccess: async () => {
      // The quest now shows the reply it's waiting for.
      await queryClient.invalidateQueries({
        queryKey: questQueryKey(questName),
      });
      onClose(true);
    },
    onError: (error) => {
      fieldErrorsOf<keyof TextMessageValues>(error).forEach(
        ({ field, message }) => setError(field, { message })
      );
    },
  });
  const showBanner = send.error && fieldErrorsOf(send.error).length === 0;

  return (
    <form
      className={styles.dialogForm}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => send.mutate(values))(event);
      }}
    >
      <p>
        It goes to each of the quest&apos;s players who accept text messages.
      </p>
      {showBanner && <Banner tone="danger">{messageOf(send.error)}</Banner>}
      <FormTextField
        control={control}
        name="message"
        rules={{ required: "Enter the message" }}
        id="text-message"
        label="Message"
        rows={3}
      />
      <FormTextField
        control={control}
        name="expectedResponse"
        id="expected-response"
        label="Reply to wait for (optional)"
        description="The quest waits for a player to text this back."
      />
      <FormTextField
        control={control}
        name="responseConfirmation"
        rules={{
          validate: (confirmation, { expectedResponse }) =>
            !expectedResponse.trim() ||
            String(confirmation).trim() !== "" ||
            "Enter what to send back when the reply arrives",
        }}
        id="response-confirmation"
        label="Confirmation to send back"
        description="Needed with a reply to wait for."
      />
      <div className={dialogStyles.actions}>
        <Button onPress={() => onClose(false)}>Cancel</Button>
        <Button type="submit" variant="primary" isPending={send.isPending}>
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}

/** Writing a text message to the quest's players. */
export function TextMessageDialog(props: TextMessageDialogProps) {
  return (
    <Dialog
      id="text-dialog"
      isOpen={props.isOpen}
      title="Text the players"
      onDismiss={() => props.onClose(false)}
    >
      <TextMessageForm {...props} />
    </Dialog>
  );
}
