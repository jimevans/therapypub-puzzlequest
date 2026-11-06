import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";

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

/**
 * Asks before doing something that can't be undone. The browser's own dialog
 * keeps focus inside it, and hides the rest of the page from screen readers.
 */
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
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (isOpen && !element?.open) {
      element?.showModal();
    } else if (!isOpen && element?.open) {
      element.close();
    }
  }, [isOpen]);

  return (
    <dialog
      id={id}
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={id && `${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={id && `${id}-title`}>{title}</h2>
      <p>{children}</p>
      <div className={styles.actions}>
        <Button onPress={onCancel}>{cancelLabel}</Button>
        <Button variant="primary" onPress={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
