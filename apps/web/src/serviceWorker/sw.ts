/// <reference lib="webworker" />
// The service worker: it makes the app's pages open at once on a repeat visit,
// by answering with its own copy of the app's page and built files rather than
// waiting for the network. The data on each page still comes from the API.
//
// A new deployment reaches a browser on its next page load after the one that
// fetched it: each page load refreshes the copy of the page for next time. An
// open page is never reloaded under its player. If an open page asks for a
// built file the new deployment removed, the app reloads itself once (see
// app/reloadOnNewDeployment.ts).
//
// To turn it off for everyone, deploy a sw.js that unregisters itself: see the
// README.
import { handlingOf } from "./routing";

declare const self: ServiceWorkerGlobalScope;

/**
 * About this build, written in by the build (see vite.config.ts): a version
 * that changes with every build, which makes browsers install the new worker;
 * the built files the first page load needs, kept at once; and every built
 * file, so that files earlier builds had can go.
 */
declare const PUZZLEQUEST_BUILD: {
  version: string;
  firstLoad: string[];
  assets: string[];
};
const BUILD = PUZZLEQUEST_BUILD;

/** The app's page, for every address it shows. Kept for this build only. */
const PAGE_CACHE = `pq-page-${BUILD.version}`;
/** Built files. Their names change with their contents, so they're kept. */
const ASSET_CACHE = "pq-assets";
/** Where the app's page is fetched from: any of its addresses would do. */
const PAGE_ADDRESS = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(PAGE_CACHE)).add(PAGE_ADDRESS);
      await (await caches.open(ASSET_CACHE)).addAll(BUILD.firstLoad);
      // Takes over from the previous build's worker without waiting for every
      // tab to close. The pages it takes over carry on as they are.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Earlier builds' copies of the page go, and built files this build
      // doesn't have. An open page that still asks for one gets it from the
      // server, or reloads itself if the server no longer has it.
      for (const name of await caches.keys()) {
        if (name.startsWith("pq-page-") && name !== PAGE_CACHE) {
          await caches.delete(name);
        }
      }
      const current = new Set(BUILD.assets);
      const assets = await caches.open(ASSET_CACHE);
      for (const request of await assets.keys()) {
        if (!current.has(new URL(request.url).pathname)) {
          await assets.delete(request);
        }
      }
      await self.clients.claim();
    })()
  );
});

/**
 * Fetches the app's page and keeps it for next time.
 * @returns the page, or undefined if the server couldn't send it
 */
async function refreshPage(): Promise<Response | undefined> {
  try {
    const response = await fetch(PAGE_ADDRESS, { cache: "no-cache" });
    if (response.ok) {
      await (await caches.open(PAGE_CACHE)).put(PAGE_ADDRESS, response.clone());
      return response;
    }
  } catch {
    // Offline, or the server's down: the kept copy will do.
  }
  return undefined;
}

/**
 * Answers a page from the kept copy at once, refreshing it for next time.
 * @param event the page's request
 * @returns the page
 */
async function answerPage(event: FetchEvent): Promise<Response> {
  const kept = await (await caches.open(PAGE_CACHE)).match(PAGE_ADDRESS);
  const refreshed = refreshPage();
  if (kept) {
    event.waitUntil(refreshed);
    return kept;
  }
  return (await refreshed) ?? fetch(event.request);
}

/**
 * Answers a built file from the kept copy, or fetches and keeps it.
 * @param request the file's request
 * @returns the file
 */
async function answerAsset(request: Request): Promise<Response> {
  const cache = await caches.open(ASSET_CACHE);
  const kept = await cache.match(request);
  if (kept) {
    return kept;
  }
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const handling = handlingOf(event.request, self.location.origin);
  if (handling === "page") {
    event.respondWith(answerPage(event));
  } else if (handling === "asset") {
    event.respondWith(answerAsset(event.request));
  }
});
