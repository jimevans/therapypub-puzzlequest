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
import { authenticateSession } from "../middleware/sessionAuthentication.js";

const teamApiRouter = express.Router();

teamApiRouter.get(
  "/list",
  authenticateSession,
  requireUser,
  TeamController.listTeams
);
teamApiRouter.get(
  "/:teamName",
  authenticateSession,
  requireAdmin,
  TeamController.retrieveTeam
);
teamApiRouter.put(
  "/:teamName",
  authenticateSession,
  requireAdmin,
  validate({ body: updateTeamBody }),
  TeamController.updateTeam
);
teamApiRouter.delete(
  "/:teamName",
  authenticateSession,
  requireAdmin,
  TeamController.deleteTeam
);
teamApiRouter.post(
  "/create",
  authenticateSession,
  requireAdmin,
  validate({ body: createTeamBody }),
  TeamController.createTeam
);
teamApiRouter.put(
  "/:teamName/member/:userName",
  authenticateSession,
  requireSelfOrAdmin,
  validate({ body: joinTeamBody }),
  TeamController.joinTeam
);
teamApiRouter.delete(
  "/:teamName/member/:userName",
  authenticateSession,
  requireSelfOrAdmin,
  TeamController.leaveTeam
);

export { teamApiRouter as TeamApiRouter };
