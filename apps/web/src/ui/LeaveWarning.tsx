import { useEffect } from "react";
import { useBlocker } from "react-router";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * The navigation state that leaves without asking, for moving on after the
 * changes have been saved, when the form may not yet know it.
 */
export const LEAVING_SAVED = { leavingSaved: true };

/**
 * Asks before leaving a screen with changes that haven't been saved. Moving
 * within the site asks in the page. Closing or reloading the tab can only be
 * asked about by the browser, in its own words.
 * @param props.when whether there's anything to lose
 */
export function LeaveWarning({ when }: { when: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when &&
      currentLocation.pathname !== nextLocation.pathname &&
      (nextLocation.state as typeof LEAVING_SAVED | null)?.leavingSaved !== true
  );

  useEffect(() => {
    if (!when) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [when]);

  return (
    <ConfirmDialog
      id="leave-dialog"
      isOpen={blocker.state === "blocked"}
      title="Leave without saving?"
      confirmLabel="Leave"
      cancelLabel="Keep editing"
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      Your changes haven't been saved, and will be lost.
    </ConfirmDialog>
  );
}
