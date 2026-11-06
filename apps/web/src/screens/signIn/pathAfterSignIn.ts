/**
 * Decides where to go after signing in. The address comes from the URL, which
 * anyone can write a link with, so it must be a path on this site, rather than
 * an address elsewhere such as "//example.com" (or "/\example.com", which
 * browsers read the same way).
 * @param next the page that asked for sign-in, if any
 * @returns the path to go to
 */
export function pathAfterSignIn(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}
