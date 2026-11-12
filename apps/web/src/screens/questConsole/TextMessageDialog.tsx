import type { Schemas } from "@puzzlequest/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
   * Whether players who have the app are texted too; if not, only those
   * without it are.
   */
  textPlayersWithApp: boolean;
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
 * The challenges sent in a quest, to send again. Its key starts with the
 * quest's, so it's fetched again whenever the quest changes.
 * @param questName the quest's name
 * @returns the options for TanStack Query
 */
function challengesQuery(questName: string) {
  return {
    queryKey: [...questQueryKey(questName), "challenges"],
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{questName}/challenges", {
          params: { path: { questName } },
        })
      ).challenges,
  };
}

/**
 * Sends the puzzle master's message to a team's or player's players, or,
 * with no entrant, every entrant's.
 * @param questName the quest's name
 * @param entrant the team or player, if only one
 * @param body the message, and any challenge it sets; or a kept challenge
 */
async function sendText(
  questName: string,
  entrant: EntrantRef | undefined,
  body:
    | {
        message: string;
        expectedResponse?: string;
        responseConfirmation?: string;
      }
    | { challengeId: string }
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

/**
 * The challenges sent before, each with a button to send it again to whoever
 * is chosen: one tap for the next team to arrive.
 */
function KeptChallenges({
  questName,
  sending,
  onSend,
}: {
  questName: string;
  /** True while something is being sent, when nothing more can be. */
  sending: boolean;
  onSend: (challenge: Schemas["QuestChallenge"]) => void;
}) {
  const challenges = useQuery(challengesQuery(questName));
  if (!challenges.data?.length) {
    return null;
  }
  return (
    <section
      className={styles.keptChallenges}
      aria-labelledby="kept-challenges-heading"
    >
      <h3 id="kept-challenges-heading">Challenges sent before</h3>
      <ul id="kept-challenges">
        {challenges.data.map((challenge) => (
          <li key={challenge.challengeId}>
            <div>
              <p className={styles.challengeMessage}>{challenge.message}</p>
              <p className={styles.note}>
                Answer: {challenge.expectedResponse}. Shows: &ldquo;
                {challenge.responseConfirmation}&rdquo;
              </p>
            </div>
            <Button
              aria-label={`Send again: ${challenge.message}`}
              isDisabled={sending}
              onPress={() => onSend(challenge)}
            >
              Send again
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Says who a message reaches.
 * @param whose whose players: "the quest's" or "their"
 * @param textPlayersWithApp whether players who have the app are texted too
 * @returns the sentence
 */
function whoItReaches(whose: string, textPlayersWithApp: boolean): string {
  return textPlayersWithApp
    ? `It shows in the app for each of ${whose} players, and is texted to those who accept text messages.`
    : `It shows in the app for each of ${whose} players, and is texted to those who accept text messages and don't have the app.`;
}

function TextMessageForm({
  questName,
  textPlayersWithApp,
  recipients,
  defaultRecipient,
  onClose,
}: TextMessageDialogProps) {
  const queryClient = useQueryClient();
  const [only] = recipients;
  const choosing = recipients.length > 1;
  const { control, register, handleSubmit, setError, getValues } =
    useForm<TextMessageValues>({
      defaultValues: {
        recipient: choosing ? defaultRecipient : (only?.key ?? ""),
        message: "",
        expectedResponse: "",
        responseConfirmation: "",
      },
    });
  const entrantFor = (recipient: string) =>
    recipients.find(({ key }) => key === recipient)?.entrant;
  const afterSending = async () => {
    // The quest now shows the message, and any challenge it waits for.
    await queryClient.invalidateQueries({
      queryKey: questQueryKey(questName),
    });
    onClose(true);
  };
  const send = useMutation({
    mutationFn: async ({
      recipient,
      message,
      expectedResponse,
      responseConfirmation,
    }: TextMessageValues) =>
      sendText(
        questName,
        entrantFor(recipient),
        expectedResponse.trim()
          ? { message, expectedResponse, responseConfirmation }
          : { message }
      ),
    onSuccess: afterSending,
    onError: (error) => {
      fieldErrorsOf<keyof TextMessageValues>(error).forEach(
        ({ field, message }) => setError(field, { message })
      );
    },
  });
  // Sending a kept challenge again, to whoever is chosen now.
  const sendAgain = useMutation({
    mutationFn: async (challengeId: string) =>
      sendText(questName, entrantFor(getValues("recipient")), {
        challengeId,
      }),
    onSuccess: afterSending,
  });
  const failed =
    (send.error && fieldErrorsOf(send.error).length === 0 && send.error) ||
    sendAgain.error;
  const sending = send.isPending || sendAgain.isPending;

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
            {whoItReaches("their", textPlayersWithApp)} Only those playing get
            it.
          </p>
        </div>
      ) : (
        <p>{whoItReaches("the quest's", textPlayersWithApp)}</p>
      )}
      {failed && <Banner tone="danger">{messageOf(failed)}</Banner>}
      <KeptChallenges
        questName={questName}
        sending={sending}
        onSend={(challenge) => sendAgain.mutate(challenge.challengeId)}
      />
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
        label="Answer's keywords (optional)"
        description="Makes the message a challenge, which the players answer in the app or by text; with several teams, each answers its own. An answer is right if it contains every keyword. Separate keywords with commas; letter case, spacing, and punctuation don't matter."
      />
      <FormTextField
        control={control}
        name="responseConfirmation"
        rules={{
          validate: (confirmation, { expectedResponse }) =>
            !expectedResponse.trim() ||
            String(confirmation).trim() !== "" ||
            "Enter what a right answer shows the players",
        }}
        id="response-confirmation"
        label="Confirmation for the venue's staff"
        description="What a right answer shows the players, in the app or texted back, for them to show the venue's staff. Needed with keywords."
      />
      <div className={dialogStyles.actions}>
        <Button onPress={() => onClose(false)}>Cancel</Button>
        <Button type="submit" variant="primary" isPending={sending}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Writing the puzzle master's message to the quest's players, or some of
 * them, or sending a challenge sent before again.
 */
export function TextMessageDialog(props: TextMessageDialogProps) {
  return (
    <Dialog
      id="text-dialog"
      isOpen={props.isOpen}
      title="Message the players"
      onDismiss={() => props.onClose(false)}
    >
      <TextMessageForm {...props} />
    </Dialog>
  );
}
