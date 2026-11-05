/** Where the time of the last reload is kept, across the reload. */
const LAST_RELOAD_KEY = "pq-chunk-reload";

/** A reload this soon after another didn't help, so don't loop. */
const MIN_RELOAD_INTERVAL_MS = 10000;

function lastReload(): number {
  try {
    return Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function rememberReload(): void {
  try {
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage, the page can't tell it has just reloaded, so it could
    // loop; a page that can't remember reloads once per failure regardless.
  }
}

/**
 * A deployment replaces the built files, so a page left open can ask for a
 * screen's file that no longer exists. Reloading gets the current ones. If
 * that doesn't help, the error reaches the error page instead of looping.
 */
export function reloadWhenChunksAreReplaced(): void {
  window.addEventListener("vite:preloadError", (event) => {
    if (Date.now() - lastReload() < MIN_RELOAD_INTERVAL_MS) {
      return;
    }
    rememberReload();
    event.preventDefault();
    location.reload();
  });
}
