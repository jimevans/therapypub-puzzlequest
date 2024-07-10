import { config } from "../config.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as AuthorizationService from "../services/authentication.service.js";
import * as QuestService from "../services/quest.service.js";

export async function index(req, res) {
  if (req.user === null) {
    res.render("index");
    return;
  }

  if (AuthorizationService.isUserAdmin(req.user)) {
    res.render("adminHome", { user: req.user });
    return;
  }

  const quests = [];
  const foundQuestsResult = await QuestService.getQuests(req.user.userName);
  if (foundQuestsResult.status === "error") {
    res.status(foundQuestsResult.statusCode).send(JSON.stringify({
      "error": foundQuestsResult.message
    }))
  }
  const foundQuests = foundQuestsResult.data;
  foundQuests.forEach((quest) => {
    const startTime = quest.puzzles.length ? quest.puzzles[0].startTime : "";
    const endTime = quest.puzzles.length ? quest.puzzles[quest.puzzles.length - 1].endTime : "";
    quests.push({
      name: quest.name,
      displayName: quest.displayName,
      status: quest.status,
      statusDescription: quest.statusDescription,
      startTime: startTime || "",
      endTime: endTime || ""
    })
  });
  res.render("home", { user: req.user, quests: quests });
}

export function login(req, res) {
  res.render("login");
}

export function authenticate(req, res) {
  res.redirect("/");
}

export function logout(req, res) {
  // TODO: Create invalid token denylist and add to this to
  // prevent tokens from logged out sessions from potentially
  // being hijacked.
  if (TokenAuthenticator.TOKEN_COOKIE_NAME in req.cookies) {
    res.cookie(TokenAuthenticator.TOKEN_COOKIE_NAME, "", {
      httpOnly: true,
      secure: config.PQ_RUNTIME_ENVIRONMENT !== "development",
      expires: new Date(0),
    });
  }
  res.redirect("/");
}
