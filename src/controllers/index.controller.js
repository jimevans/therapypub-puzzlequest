import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as UserService from "../services/user.service.js";
import * as QuestService from "../services/quest.service.js";

export async function index(req, res) {
  // Case 1: No user logged in.
  if (req.user === null) {
    res.render("index");
    return;
  }

  // Case 2: Logged in user is an admin.
  if (UserService.isUserAdmin(req.user)) {
    res.render("adminHome", { user: req.user });
    return;
  }

  // Case 3: Logged in user is a valid end user.
  const quests = [];
  const foundQuestsResult = await QuestService.getQuests(req.user.userName, 1);
  if (foundQuestsResult.status === "error") {
    res.render("error", { errorTitle: "Unexpected error", errorDetails: foundQuestsResult.message });
    return;
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
  res.render("home", { userName: req.user.userName, quests: quests });
}

export function login(req, res) {
  res.render("login", { requestingUrl: "/" });
}

export function authenticate(req, res) {
  // Authentication happens in the middleware layer for JWT verification,
  // so all we need to do is redirect back to the root.
  res.redirect("/");
}

export function logout(req, res) {
  // TODO: Create invalid token denylist and add to this to
  // prevent tokens from logged out sessions from potentially
  // being hijacked.
  if (TokenAuthenticator.TOKEN_COOKIE_NAME in req.cookies) {
    res.clearCookie(TokenAuthenticator.TOKEN_COOKIE_NAME);
  }
  res.redirect("/");
}
