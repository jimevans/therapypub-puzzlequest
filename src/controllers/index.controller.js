import { config } from "../config.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as AuthorizationService from "../services/authentication.service.js";

export function index(req, res) {
  if (req.user === null) {
    res.render("index");
    return;
  }

  if (AuthorizationService.isUserAdmin(req.user)) {
    res.render("adminHome", { user: req.user });
    return;
  }
  res.render("home", { user: req.user });
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
