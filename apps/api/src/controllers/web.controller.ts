import type { Request, Response } from "express";
import { webDirectory } from "../paths.js";

/**
 * Sends the React app's page, which fetches whatever it shows from the API. It
 * holds no data, so it's safe to send to anyone.
 * @param req the request
 * @param res the response
 */
export function sendWebApp(req: Request, res: Response): void {
  // Browsers must ask each time, so a deployment reaches them at once.
  res.set("Cache-Control", "no-cache");
  res.sendFile("index.html", { root: webDirectory }, (error) => {
    if (error && !res.headersSent) {
      res.status(503).type("text").send("The web app hasn't been built.");
    }
  });
}
