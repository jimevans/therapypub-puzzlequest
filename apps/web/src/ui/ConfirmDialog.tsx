import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import styles from "./Dialog.module.css";

interface ConfirmDialogProps {
  id?: string;
  isOpen: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Also called when the player dismisses it, such as with the Escape key. */
  onCancel: () => void;
  children: ReactNode;
}

/** Asks before doing something that can't be undone. */
export function ConfirmDialog({
  id,
  isOpen,
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog id={id} isOpen={isOpen} title={title} onDismiss={onCancel}>
      <p>{children}</p>
      <div className={styles.actions}>
        <Button onPress={onCancel}>{cancelLabel}</Button>
        <Button variant="primary" onPress={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
