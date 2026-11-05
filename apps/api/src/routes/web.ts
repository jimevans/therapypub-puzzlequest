// Serves the React app's built files (apps/web/dist) from the same origin as
// the API, so it shares the session cookie and the site's security rules.
import express from "express";
import { webDirectory } from "../paths.js";

/**
 * The pages the React app shows. Moving a screen to React adds its URL here
 * and deletes its EJS route, so every link keeps working.
 */
const WEB_PAGES = ["/web-check"];

const webRouter = express.Router();

// Built files have a hash of their contents in their names, so a change gets
// a new name, and browsers can keep them for as long as they like.
webRouter.use(
  "/assets",
  express.static(`${webDirectory}/assets`, {
    immutable: true,
    index: false,
    maxAge: "1y",
  }),
  (req, res) => {
    res.sendStatus(404);
  }
);

webRouter.get(WEB_PAGES, (req, res) => {
  // Browsers must ask each time, so a deployment reaches them at once.
  res.set("Cache-Control", "no-cache");
  res.sendFile("index.html", { root: webDirectory }, (error) => {
    if (error && !res.headersSent) {
      res.status(503).type("text").send("The web app hasn't been built.");
    }
  });
});

export { webRouter as WebRouter };
