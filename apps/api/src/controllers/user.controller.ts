import type { Response } from "express";
import type { RouteRequest } from "../types.js";
import * as UserService from "../services/user.service.js";
import { RenderMode } from "../middleware/useRenderMode.js";
import { formatPhoneNumber } from "../schemas/common.js";

// The user pages. Their scripts change accounts through the v1 API.

export async function renderUser(
  req: RouteRequest<"userName">,
  res: Response
): Promise<void> {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (req.renderMode && req.renderMode === RenderMode.CREATE) {
    if (!loggedInUser || loggedInUser.isAdmin()) {
      res.render("user", {
        renderMode: req.renderMode,
        currentUser: loggedInUser,
        user: null,
        phone: "",
      });
    } else {
      res.render("error", {
        errorTitle: "Unauthorized",
        errorDetails: `User ${loggedInUser.userName} not authorized to create new users`,
      });
    }
    return;
  }

  // The route lets through only the user and administrators.
  const currentUser = UserService.requireLoggedInUser(req.user);
  const userResponse = await UserService.getUserByUserName(
    req.params.userName,
    true
  );
  if (userResponse.status === "error") {
    res.status(userResponse.statusCode).render("error", {
      errorTitle: "Not found",
      errorDetails: userResponse.message,
    });
    return;
  }

  res.render("user", {
    renderMode: req.renderMode,
    currentUser: currentUser,
    user: userResponse.data,
    phone: formatPhoneNumber(userResponse.data.phone),
  });
}
