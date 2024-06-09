import { config } from "../config.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import { AuthorizationLevel } from "../models/user.model.js";

export function index(req, res) {
  if (req.user === null) {
    res.render("index");
    return;
  }

  if (req.user.authorizationLevel === AuthorizationLevel.ADMIN) {
    res.render("adminHome", { user: req.user });
    return;
  }
  res.render("userHome", { user: req.user });
}

export function login(req, res) {
  res.render("login");
}

export function authenticate(req, res) {
  res.redirect("/");
}

export function logout(req, res) {
  if (TokenAuthenticator.TOKEN_COOKIE_NAME in req.cookies) {
    res.cookie(TokenAuthenticator.TOKEN_COOKIE_NAME, "", {
      httpOnly: true,
      secure: config.PQ_RUNTIME_ENVIRONMENT !== "development",
      expires: new Date(0),
    });
  }
  res.redirect("/");
}
