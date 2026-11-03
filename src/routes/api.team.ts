import express from "express";
import { validate } from "../middleware/validate.js";
import {
  createTeamBody,
  joinTeamBody,
  updateTeamBody,
} from "../schemas/team.schemas.js";
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
  validate({ body: updateTeamBody }),
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
  validate({ body: createTeamBody }),
  TeamController.createTeam
);
teamApiRouter.put(
  "/:teamName/member/:userName",
  TokenAuthenticator.tokenAuthenticate,
  requireSelfOrAdmin,
  validate({ body: joinTeamBody }),
  TeamController.joinTeam
);
teamApiRouter.delete(
  "/:teamName/member/:userName",
  TokenAuthenticator.tokenAuthenticate,
  requireSelfOrAdmin,
  TeamController.leaveTeam
);

export { teamApiRouter as TeamApiRouter };
