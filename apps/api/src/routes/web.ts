// Serves the React app's built files (apps/web/dist) from the same origin as
// the API, so it shares the session cookie and the site's security rules.
import express from "express";
import { sendWebApp } from "../controllers/web.controller.js";
import { webDirectory } from "../paths.js";

/**
 * The pages the React app shows to everyone. Moving a screen to React adds its
 * URL here and deletes its EJS route, so every link keeps working. Where admin
 * screens are still EJS, the page's own controller chooses by session instead,
 * calling sendWebApp for players (see index.controller.ts and
 * quest.controller.ts).
 */
const WEB_PAGES = [
  "/login",
  "/monitor/quest/:name",
  "/monitor/quest/:name/puzzle/:puzzleName",
];

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

webRouter.get(WEB_PAGES, sendWebApp);

export { webRouter as WebRouter };
