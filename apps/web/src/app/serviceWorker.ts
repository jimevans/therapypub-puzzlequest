/**
 * Registers the service worker (src/serviceWorker/sw.ts), which opens the app's
 * pages at once on later visits. Only built copies of the app have one, so the
 * development server never caches anything.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }
  // After the page has loaded, so it doesn't compete with the page's own files.
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Without it, the app works as before, only less quickly on later
        // visits.
      });
    },
    { once: true }
  );
}
