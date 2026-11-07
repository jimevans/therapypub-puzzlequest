import type { Request, Response } from "express";
import { webDirectory } from "../paths.js";

/**
 * Sends the React app's page, which fetches whatever it shows from the API. It
 * holds no data, so it's safe to send to anyone.
 * @param req the request
 * @param res the response
 */
export function sendWebApp(req: Request, res: Response): void {
  sendWebAppWithStatus(res, 200);
}

/**
 * Sends the React app's page for an address it has no page for, with a 404
 * status, so that the app can say so in its own words while browsers and
 * search engines still learn there's nothing there.
 * @param req the request
 * @param res the response
 */
export function sendWebAppNotFound(req: Request, res: Response): void {
  sendWebAppWithStatus(res, 404);
}

/**
 * Sends the React app's page.
 * @param res the response
 * @param status the HTTP status to send it with
 */
function sendWebAppWithStatus(res: Response, status: number): void {
  res.status(status);
  // Browsers must ask each time, so a deployment reaches them at once.
  res.set("Cache-Control", "no-cache");
  res.sendFile("index.html", { root: webDirectory }, (error) => {
    if (error && !res.headersSent) {
      res.status(503).type("text").send("The web app hasn't been built.");
    }
  });
}
