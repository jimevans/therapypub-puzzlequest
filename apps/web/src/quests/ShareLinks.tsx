import type { Schemas } from "@puzzlequest/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api, dataOrThrow, messageOf } from "../api";
import { questQueryKey } from "../live/useLiveQuest";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Dialog } from "../ui/Dialog";
import dialogStyles from "../ui/Dialog.module.css";
import { TextField } from "../ui/TextField";
import { shareLinksQuery } from "./queries";
import { shareLinkAddress } from "./shareLink";
import styles from "./ShareLinks.module.css";

const dateOf = (when: string) => new Date(when).toLocaleDateString();

type View = "follow" | "board";

// One link opens either page: following along on a phone, or the board on a
// big screen, such as a TV in a lobby.
const VIEWS: {
  view: View;
  id: string;
  label: string;
  description: string;
  copyLabel: string;
}[] = [
  {
    view: "follow",
    id: "share-link-address",
    label: "Send them this link",
    description: "To follow along on a phone or computer.",
    copyLabel: "Copy link",
  },
  {
    view: "board",
    id: "share-link-board-address",
    label: "Board link",
    description: "To show the quest on a big screen, read from across a room.",
    copyLabel: "Copy board link",
  },
];

interface CreateLinkProps {
  questName: string;
  canSetExpiry: boolean;
  onClose: () => void;
}

/**
 * Makes a link, then shows its addresses, once: only the link's hash is
 * stored, so they can't be shown again.
 */
function CreateLink({ questName, canSetExpiry, onClose }: CreateLinkProps) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [copied, setCopied] = useState<View | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST("/quests/{questName}/share-links", {
          params: { path: { questName } },
          body: {
            label,
            ...(expires
              ? { expiresAt: new Date(`${expires}T23:59:59`).toISOString() }
              : {}),
          },
        })
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: questQueryKey(questName) }),
  });

  async function copy(view: View, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(view);
    } catch {
      setCopied(null);
    }
  }

  const token = create.data?.token;
  if (token) {
    return (
      <div className={styles.dialogBody}>
        <p>
          These are shown only now, so copy what you need before closing. Both
          work until the link expires or is revoked.
        </p>
        {VIEWS.map(
          ({ view, id, label: fieldLabel, description, copyLabel }) => {
            const address = shareLinkAddress(questName, token, view);
            return (
              <div key={view} className={styles.address}>
                <TextField
                  id={id}
                  label={fieldLabel}
                  description={description}
                  value={address}
                  isReadOnly
                />
                <Button onPress={() => void copy(view, address)}>
                  {copied === view ? "Copied" : copyLabel}
                </Button>
              </div>
            );
          }
        )}
        <div className={dialogStyles.actions}>
          <Button variant="primary" onPress={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={styles.dialogBody}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (label.trim()) {
          create.mutate();
        }
      }}
    >
      {create.error && <Banner tone="danger">{messageOf(create.error)}</Banner>}
      <TextField
        id="share-link-label"
        label="Who is it for?"
        description="Only you and the others on this quest see this."
        value={label}
        onChange={setLabel}
      />
      {canSetExpiry && (
        <TextField
          id="share-link-expires"
          label="Expires on"
          description="Leave empty for 30 days from now."
          type="date"
          value={expires}
          onChange={setExpires}
        />
      )}
      <div className={dialogStyles.actions}>
        <Button onPress={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" isPending={create.isPending}>
          Make the link
        </Button>
      </div>
    </form>
  );
}

/**
 * Lets a private quest's players and staff give others a link to follow it. It
 * shows nothing for a public quest, which anyone can follow already. It starts
 * closed, so it doesn't crowd the quest: opening it lists the links, and a
 * dialog makes a new one.
 */
export function ShareLinks({ questName }: { questName: string }) {
  const queryClient = useQueryClient();
  const links = useQuery(shareLinksQuery(questName));
  const panelId = useId();
  const [isExpanded, setExpanded] = useState(false);
  const [isCreating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<Schemas["ShareLink"] | null>(null);

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE(
        "/quests/{questName}/share-links/{linkId}",
        { params: { path: { questName, linkId: id } } }
      );
      if (!response.ok) {
        throw new Error(error?.detail ?? "Couldn't revoke the link");
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: questQueryKey(questName) }),
  });

  if (links.data?.visibility !== "private") {
    return null;
  }

  return (
    <section className={styles.panel} aria-labelledby="share-links-heading">
      <h2 id="share-links-heading" className={styles.heading}>
        <button
          type="button"
          id="share-links-toggle"
          className={styles.toggle}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setExpanded(!isExpanded)}
        >
          Share this quest
        </button>
      </h2>
      <div id={panelId} hidden={!isExpanded}>
        <p>
          This quest is private. Anyone you give a link to can follow it,
          without an account, until the link expires or is revoked.
        </p>
        {revoke.error && (
          <Banner tone="danger">{messageOf(revoke.error)}</Banner>
        )}
        {links.data.links.length > 0 ? (
          <ul className={styles.list} id="share-link-list">
            {links.data.links.map((link) => (
              <li key={link.id} className={styles.link}>
                <span>
                  <strong>{link.label}</strong>
                  {link.createdBy ? `, made by ${link.createdBy}` : ""}. Expires{" "}
                  {dateOf(link.expiresAt)}.
                </span>
                {link.canRevoke && (
                  <Button
                    aria-label={`Revoke ${link.label}`}
                    onPress={() => setRevoking(link)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No links yet.</p>
        )}
        <Button onPress={() => setCreating(true)}>Make a link</Button>
      </div>
      <Dialog
        id="share-link-dialog"
        isOpen={isCreating}
        title="Make a link"
        onDismiss={() => setCreating(false)}
      >
        <CreateLink
          questName={questName}
          canSetExpiry={links.data.canSetExpiry}
          onClose={() => setCreating(false)}
        />
      </Dialog>
      <ConfirmDialog
        id="revoke-share-link"
        isOpen={revoking !== null}
        title="Revoke this link?"
        confirmLabel="Revoke"
        cancelLabel="Keep it"
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking) {
            revoke.mutate(revoking.id);
          }
          setRevoking(null);
        }}
      >
        Anyone following through “{revoking?.label}” will be cut off at once.
      </ConfirmDialog>
    </section>
  );
}
