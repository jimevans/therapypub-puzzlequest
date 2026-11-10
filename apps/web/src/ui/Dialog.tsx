import { type ReactNode, useEffect, useId, useRef } from "react";
import styles from "./Dialog.module.css";

interface DialogProps {
  id?: string;
  /** Styles of its own, such as a larger size, added to the dialog's. */
  className?: string;
  isOpen: boolean;
  title: string;
  /** Called when the visitor dismisses it, such as with the Escape key. */
  onDismiss: () => void;
  children: ReactNode;
}

/**
 * An in-page modal. The browser's own dialog keeps focus inside it, and hides
 * the rest of the page from screen readers.
 */
export function Dialog({
  id,
  className,
  isOpen,
  title,
  onDismiss,
  children,
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      className={className ? `${styles.dialog} ${className}` : styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      {/* Only while open, so that a closed form holds nothing. */}
      {isOpen && (
        <>
          <h2 id={titleId}>{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}
