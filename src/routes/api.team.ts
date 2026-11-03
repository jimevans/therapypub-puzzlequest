import express from "express";
import {
  requireAdmin,
  requireSelfOrAdmin,
  requireUser,
} from "../middleware/authorization.js";
import * as TeamController from "../controllers/team.controller.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const teamApiRouter = express.Router();

teamApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
  requireUser,
  TeamController.listTeams
);
teamApiRouter.get(
  "/:teamName",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  TeamController.retrieveTeam
);
teamApiRouter.put(
  "/:teamName",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  TeamController.updateTeam
);
teamApiRouter.delete(
  "/:teamName",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  TeamController.deleteTeam
);
teamApiRouter.post(
  "/create",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  TeamController.createTeam
);
teamApiRouter.put(
  "/:teamName/member/:userName",
  TokenAuthenticator.tokenAuthenticate,
  requireSelfOrAdmin,
  TeamController.joinTeam
);
teamApiRouter.delete(
  "/:teamName/member/:userName",
  TokenAuthenticator.tokenAuthenticate,
  requireSelfOrAdmin,
  TeamController.leaveTeam
);

export { teamApiRouter as TeamApiRouter };
