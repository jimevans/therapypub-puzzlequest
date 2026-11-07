import type { Response } from "express";

/**
 * Escapes text for HTML.
 * @param text the text
 * @returns the text, safe to put between tags or in an attribute
 */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!
  );
}

/**
 * Sends a page saying why a page can't be shown. It's plain HTML with its own
 * small stylesheet, rather than the React app, so that it works even if the
 * app's build is missing or broken.
 * @param res the response
 * @param status the HTTP status
 * @param title what went wrong, in a few words, such as "Forbidden"
 * @param details more about it
 */
export function sendErrorPage(
  res: Response,
  status: number,
  title: string,
  details: string
): void {
  res
    .status(status)
    .type("html")
    .send(
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · PuzzleQuest</title>
    <link rel="icon" type="image/png" href="/image/pq-logo-192.png" sizes="192x192" />
    <link rel="stylesheet" href="/style/error.css" />
  </head>
  <body>
    <header><a href="/">PuzzleQuest</a></header>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(details)}</p>
      <p><a href="/">Go to the home page</a></p>
    </main>
  </body>
</html>
`
    );
}
