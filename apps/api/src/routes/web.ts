// Serves the React app's built files (apps/web/dist) from the same origin as
// the API, so it shares the session cookie and the site's security rules.
import express from "express";
import { sendWebApp } from "../controllers/web.controller.js";
import { webDirectory } from "../paths.js";

/**
 * The pages the React app shows to everyone. Pages for only some people are in
 * their own routers, which check first (admin.ts, quest.ts, user.ts). Any other
 * address gets the app with a 404 status (see createApp.ts).
 */
const WEB_PAGES = [
  "/login",
  "/monitor/quest/:name",
  "/monitor/quest/:name/board",
  "/monitor/quest/:name/puzzle/:puzzleName",
  "/user/password/forgot",
  "/user/register",
];

/** The pages opened from emailed links with a one-time token in the address. */
const WEB_PAGES_WITH_TOKENS = ["/user/password/reset", "/user/email/verify"];

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

webRouter.get(WEB_PAGES_WITH_TOKENS, (req, res) => {
  // Keep the token in the address from leaking to other sites.
  res.set("Referrer-Policy", "no-referrer");
  sendWebApp(req, res);
});

export { webRouter as WebRouter };
