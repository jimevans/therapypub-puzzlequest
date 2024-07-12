import express from "express";
import * as TeamController from "../controllers/team.controller.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const teamApiRouter = express.Router();

teamApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
  TeamController.listTeams
);
teamApiRouter.get(
  "/:teamName",
  TokenAuthenticator.tokenAuthenticate,
  TeamController.retrieveTeam
);
teamApiRouter.put(
  "/:teamName",
  TokenAuthenticator.tokenAuthenticate,
  TeamController.updateTeam
);
teamApiRouter.delete(
  "/:teamName",
  TokenAuthenticator.tokenAuthenticate,
  TeamController.deleteTeam
);
teamApiRouter.post(
  "/create",
  TokenAuthenticator.tokenAuthenticate,
  TeamController.createTeam
);
teamApiRouter.put(
  "/:teamName/member/:userName",
  TokenAuthenticator.tokenAuthenticate,
  TeamController.joinTeam
);
teamApiRouter.delete(
  "/:teamName/member/:userName",
  TokenAuthenticator.tokenAuthenticate,
  TeamController.leaveTeam
);

export { teamApiRouter as TeamApiRouter };
