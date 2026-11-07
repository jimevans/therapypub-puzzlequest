import { isAdminPath } from "../app/adminPaths";

/**
 * How the service worker answers a request:
 * - page: with its copy of the app's page, which any of the app's addresses
 *   shows, refreshed in the background for next time;
 * - asset: with its copy of a built file, kept once fetched, since a built
 *   file's name changes whenever its contents do;
 * - network: it leaves the request to the browser, as if it weren't there.
 */
export type Handling = "page" | "asset" | "network";

/**
 * Addresses whose pages always come from the server: what isn't the app, and
 * the app's pages that the server must answer itself.
 */
const SERVER_PAGES = [
  // Not the app: the API, signing out, uploaded media, and the server's own
  // files, including the legal pages.
  /^\/api\//,
  /^\/logout$/,
  /^\/puzzleData\//,
  /^\/policies\//,
  /^\/style\//,
  /^\/image\//,
  // Opened from emailed links with a token in the address, which the server
  // sends with a header keeping the token from leaking to other sites.
  /^\/user\/password\/reset$/,
  /^\/user\/email\/verify$/,
];

/**
 * Decides how to answer a request.
 * @param request what the browser asks for
 * @param request.url its address
 * @param request.method its method, such as GET
 * @param request.mode its mode: navigate when it's a page
 * @param origin this site's origin
 * @returns how to answer it
 */
export function handlingOf(
  { url, method, mode }: { url: string; method: string; mode: string },
  origin: string
): Handling {
  const address = new URL(url);
  if (method !== "GET" || address.origin !== origin) {
    return "network";
  }
  const path = address.pathname;
  if (path.startsWith("/assets/")) {
    return "asset";
  }
  if (mode !== "navigate") {
    return "network";
  }
  // Administrators' screens, too: the server checks who's asking before it
  // sends them, and administrators work on laptops, where a page's speed
  // matters less.
  return SERVER_PAGES.some((pattern) => pattern.test(path)) || isAdminPath(path)
    ? "network"
    : "page";
}
