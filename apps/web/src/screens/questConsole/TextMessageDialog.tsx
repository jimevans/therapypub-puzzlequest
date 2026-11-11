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
import type { EntrantRef } from "./consoleData";

interface TextMessageValues {
  /** Whose players to text: an entrant's key, or "" for everyone's. */
  recipient: string;
  message: string;
  expectedResponse: string;
  responseConfirmation: string;
}

/** A team or player whose players can be texted. */
export interface Recipient {
  /** Identifies it in the quest, such as "team:reds". */
  key: string;
  label: string;
  entrant: EntrantRef;
}

interface TextMessageDialogProps {
  questName: string;
  /**
   * The teams and players to choose from. With only one, it gets the message,
   * and there's nothing to choose.
   */
  recipients: Recipient[];
  /** Who's chosen at first: a recipient's key, or "" for everyone. */
  defaultRecipient: string;
  isOpen: boolean;
  onClose: (sent: boolean) => void;
}

/**
 * Texts a team's or player's players, or, with no entrant, every entrant's.
 * @param questName the quest's name
 * @param entrant the team or player, if only one
 * @param body the message, and any reply to wait for
 */
async function sendText(
  questName: string,
  entrant: EntrantRef | undefined,
  body: {
    message: string;
    expectedResponse?: string;
    responseConfirmation?: string;
  }
) {
  if (!entrant) {
    return dataOrThrow(
      await api.POST("/quests/{questName}/text-messages", {
        params: { path: { questName } },
        body,
      })
    );
  }
  return dataOrThrow(
    entrant.kind === "team"
      ? await api.POST("/quests/{questName}/teams/{teamName}/text-messages", {
          params: { path: { questName, teamName: entrant.name } },
          body,
        })
      : await api.POST("/quests/{questName}/players/{userName}/text-messages", {
          params: { path: { questName, userName: entrant.name } },
          body,
        })
  );
}

function TextMessageForm({
  questName,
  recipients,
  defaultRecipient,
  onClose,
}: TextMessageDialogProps) {
  const queryClient = useQueryClient();
  const [only] = recipients;
  const choosing = recipients.length > 1;
  const { control, register, handleSubmit, setError } =
    useForm<TextMessageValues>({
      defaultValues: {
        recipient: choosing ? defaultRecipient : (only?.key ?? ""),
        message: "",
        expectedResponse: "",
        responseConfirmation: "",
      },
    });
  const send = useMutation({
    mutationFn: async ({
      recipient,
      message,
      expectedResponse,
      responseConfirmation,
    }: TextMessageValues) =>
      sendText(
        questName,
        recipients.find(({ key }) => key === recipient)?.entrant,
        expectedResponse.trim()
          ? { message, expectedResponse, responseConfirmation }
          : { message }
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
      {choosing ? (
        <div className={styles.field}>
          <label htmlFor="text-recipient">Send to</label>
          <select
            id="text-recipient"
            className={styles.select}
            aria-describedby="text-recipient-description"
            {...register("recipient")}
          >
            <option value="">Everyone</option>
            {recipients.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <p id="text-recipient-description" className={styles.note}>
            It goes to each of their players who accept text messages, if
            they&apos;re playing.
          </p>
        </div>
      ) : (
        <p>
          It goes to each of the quest&apos;s players who accept text messages.
        </p>
      )}
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
        description="The quest waits for a player to text this back; with several teams, for one of each."
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

/** Writing a text message to the quest's players, or some of them. */
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
