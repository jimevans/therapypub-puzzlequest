import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * The address last shown. Kept outside any component, since the app's
 * screens sit in several frames, and moving between frames starts a new one.
 */
let shownPath: string | undefined;

/**
 * Moves focus to the new screen's heading when the app moves to another
 * address, as a page load would put a screen reader at the top of a new
 * page: otherwise focus stays on the link just used, or is lost, and nothing
 * says the screen changed. The first screen, which the browser loaded,
 * keeps the browser's own behavior. A screen still loading gets focus on its
 * heading once it appears.
 */
export function useFocusOnNavigate(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (shownPath === undefined || shownPath === pathname) {
      shownPath = pathname;
      return;
    }
    shownPath = pathname;
    return focusHeadingWhenShown();
  }, [pathname]);
}

/**
 * Puts focus on the screen's main heading, if there is one.
 * @returns whether it did
 */
function focusHeading(): boolean {
  const heading = document.querySelector<HTMLElement>("main h1, h1");
  if (!heading) {
    return false;
  }
  if (!heading.hasAttribute("tabindex")) {
    heading.setAttribute("tabindex", "-1");
  }
  heading.focus({ preventScroll: true });
  return true;
}

/**
 * Whether focus has been lost: to the page itself, or still on an element
 * that has left the page, which Firefox reports for a moment.
 */
function focusIsLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

/**
 * Focuses the screen's main heading, now or once it appears.
 * @returns a function that stops waiting for it
 */
function focusHeadingWhenShown(): () => void {
  if (focusHeading()) {
    return () => undefined;
  }
  const observer = new MutationObserver(() => {
    if (focusHeading()) {
      stop();
    }
  });
  const timer = setTimeout(() => stop(), 10_000);
  function stop() {
    observer.disconnect();
    clearTimeout(timer);
  }
  observer.observe(document.body, { childList: true, subtree: true });
  return stop;
}

/**
 * Keeps focus from being lost when what had it leaves the page, such as a
 * form replaced by its result, or a list's row deleted: focus would fall to
 * the page itself, leaving a keyboard or screen reader user nowhere. It goes
 * to the screen's heading instead, and the screen's announcements say what
 * happened. Watches for as long as a page frame is shown.
 */
export function useKeepFocus(): void {
  useEffect(() => {
    let focused: Element | null = document.activeElement;
    const remember = (event: FocusEvent) => {
      focused = event.target as Element;
    };
    const rescue = () => {
      if (focused && !focused.isConnected && focusIsLost()) {
        focused = null;
        focusHeading();
      }
    };
    // Checked again once the browser has settled where focus is.
    const observer = new MutationObserver(() => {
      rescue();
      setTimeout(rescue, 0);
    });
    document.addEventListener("focusin", remember);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("focusin", remember);
      observer.disconnect();
    };
  }, []);
}

/**
 * Moves focus on navigating, and keeps it from being lost (see
 * useFocusOnNavigate and useKeepFocus), as a component.
 */
export function FocusOnNavigate(): null {
  useFocusOnNavigate();
  useKeepFocus();
  return null;
}

/** Forgets the address shown, for tests. */
export function forgetShownPath(): void {
  shownPath = undefined;
}
