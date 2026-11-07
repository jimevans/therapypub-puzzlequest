import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import styles from "./Admin.module.css";

interface AdminListProps {
  title: string;
  /** The way to add one, such as a link or a button. */
  action: ReactNode;
  isEmpty: boolean;
  emptyMessage: string;
  /** Why the list couldn't be fetched, if it couldn't. */
  error: Error | null;
  /** The table, if there's anything in it, and the list's dialogs. */
  children: ReactNode;
}

/** One of the administrators' lists: its heading, action, and table. */
export function AdminList({
  title,
  action,
  isEmpty,
  emptyMessage,
  error,
  children,
}: AdminListProps) {
  return (
    <>
      <title>{`${title} · PuzzleQuest`}</title>
      <div className={styles.heading}>
        <h1>{title}</h1>
        {action}
      </div>
      {error && <Banner tone="danger">{messageOf(error)}</Banner>}
      {isEmpty && <p>{emptyMessage}</p>}
      {children}
    </>
  );
}

interface DeletionOptions<Item> {
  /** The list to fetch again afterward. */
  queryKey: readonly unknown[];
  remove: (item: Item) => Promise<unknown>;
}

/**
 * Deleting from a list: which item is being asked about, and what happened.
 * @param options what to delete with, and what to refresh
 * @returns what the list's rows and DeleteDialog need
 */
export function useDeletion<Item>({ queryKey, remove }: DeletionOptions<Item>) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<Item | null>(null);
  const deletion = useMutation({
    mutationFn: remove,
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { asking, setAsking, deletion };
}

/** A row's delete button, which names what it deletes for screen readers. */
export function DeleteButton({
  name,
  onPress,
}: {
  name: string;
  onPress: () => void;
}) {
  return (
    <Button aria-label={`Delete ${name}`} onPress={onPress}>
      Delete
    </Button>
  );
}

/** The in-page confirmation before deleting, saying what it will mean. */
export function DeleteDialog<Item>({
  flow: { asking, setAsking, deletion },
  nameOf,
  children,
}: {
  flow: ReturnType<typeof useDeletion<Item>>;
  nameOf: (item: Item) => string;
  children: ReactNode;
}) {
  return (
    <ConfirmDialog
      id="delete-dialog"
      isOpen={asking !== null}
      title={asking === null ? "" : `Delete ${nameOf(asking)}?`}
      confirmLabel="Delete"
      cancelLabel="Keep it"
      onCancel={() => setAsking(null)}
      onConfirm={() => {
        if (asking !== null) {
          deletion.mutate(asking);
        }
        setAsking(null);
      }}
    >
      {children}
    </ConfirmDialog>
  );
}
