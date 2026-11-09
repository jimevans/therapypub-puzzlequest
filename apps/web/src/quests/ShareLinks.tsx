import type { Schemas } from "@puzzlequest/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, dataOrThrow, messageOf } from "../api";
import { questQueryKey } from "../live/useLiveQuest";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { TextField } from "../ui/TextField";
import { shareLinksQuery } from "./queries";
import { shareLinkAddress } from "./shareLink";
import styles from "./ShareLinks.module.css";

const dateOf = (when: string) => new Date(when).toLocaleDateString();

/**
 * Lets a private quest's players and staff give others a link to follow it. It
 * shows nothing for a public quest, which anyone can follow already.
 */
export function ShareLinks({ questName }: { questName: string }) {
  const queryClient = useQueryClient();
  const links = useQuery(shareLinksQuery(questName));
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<Schemas["ShareLink"] | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: questQueryKey(questName) });

  const create = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST("/quests/{name}/share-links", {
          params: { path: { name: questName } },
          body: {
            label,
            ...(expires
              ? { expiresAt: new Date(`${expires}T23:59:59`).toISOString() }
              : {}),
          },
        })
      ),
    onSuccess: ({ token }) => {
      setAddress(shareLinkAddress(questName, token));
      setCopied(false);
      setLabel("");
      setExpires("");
    },
    onSettled: refresh,
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE(
        "/quests/{name}/share-links/{linkId}",
        { params: { path: { name: questName, linkId: id } } }
      );
      if (!response.ok) {
        throw new Error(error?.detail ?? "Couldn't revoke the link");
      }
    },
    onSettled: refresh,
  });

  if (links.data?.visibility !== "private") {
    return null;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="share-links-heading">
      <h2 id="share-links-heading">Share this quest</h2>
      <p>
        This quest is private. Anyone you give a link to can follow it, without
        an account, until the link expires or is revoked.
      </p>
      {(create.error ?? revoke.error) && (
        <Banner tone="danger">
          {messageOf((create.error ?? revoke.error) as Error)}
        </Banner>
      )}
      {links.data.links.length > 0 && (
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
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (label.trim()) {
            create.mutate();
          }
        }}
      >
        <TextField
          id="share-link-label"
          label="Who is it for?"
          description="Only you and the others on this quest see this."
          value={label}
          onChange={setLabel}
        />
        {links.data.canSetExpiry && (
          <TextField
            id="share-link-expires"
            label="Expires on"
            description="Leave empty for 30 days from now."
            type="date"
            value={expires}
            onChange={setExpires}
          />
        )}
        <Button type="submit" isPending={create.isPending}>
          Make a link
        </Button>
      </form>
      {address && (
        <div className={styles.created}>
          <TextField
            id="share-link-address"
            label="Send them this link"
            description="It's shown only now, so copy it before leaving this page."
            value={address}
            isReadOnly
          />
          <Button onPress={() => void copy(address)}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
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
