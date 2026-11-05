import type { Request, Response } from "express";
import * as SessionAuthenticator from "../middleware/sessionAuthentication.js";
import * as SessionService from "../services/session.service.js";
import * as UserService from "../services/user.service.js";
import * as QuestService from "../services/quest.service.js";

export async function index(req: Request, res: Response): Promise<void> {
  const loggedInUser = UserService.getLoggedInUser(req.user);

  // Case 1: No user logged in.
  if (loggedInUser === null) {
    res.render("index");
    return;
  }

  // Case 2: Logged in user is an admin.
  if (loggedInUser.isAdmin()) {
    res.render("adminHome", { user: loggedInUser });
    return;
  }

  // Case 3: Logged in user is a valid end user.
  const assigneeIds = await loggedInUser.getAssigneeIds();
  const findOptions = { assigneeIds, questStatus: 1 };
  // Puzzle details are needed for hint penalties.
  const foundQuestsResult = await QuestService.findQuests(findOptions, true);
  if (foundQuestsResult.status === "error") {
    if (foundQuestsResult.statusCode !== 404) {
      res.render("error", {
        errorTitle: "Unexpected error",
        errorDetails: foundQuestsResult.message,
      });
      return;
    } else {
      res.render("home", {
        userName: loggedInUser.userName,
        emailVerified: req.user?.emailVerified ?? false,
        quests: [],
      });
      return;
    }
  }
  const quests = foundQuestsResult.data.map((quest) => ({
    name: quest.name,
    displayName: quest.displayName,
    status: quest.status,
    statusDescription: quest.statusDescription,
    progress: quest.getProgress(),
  }));
  res.render("home", {
    userName: loggedInUser.userName,
    emailVerified: req.user?.emailVerified ?? false,
    quests: quests,
  });
}

export function login(req: Request, res: Response): void {
  res.render("login", { requestingUrl: "/" });
}

/**
 * Signs out: ends the browser's session and returns to the home page.
 * @param req the request
 * @param res the response
 */
export async function logout(req: Request, res: Response): Promise<void> {
  if (req.sessionToken) {
    await SessionService.deleteSession(req.sessionToken);
  }
  SessionAuthenticator.clearSessionCookie(res);
  res.redirect("/");
}
