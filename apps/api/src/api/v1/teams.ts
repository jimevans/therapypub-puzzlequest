// Teams, and joining and leaving them.
import { z } from "zod";
import {
  createTeamBody,
  joinTeamBody,
  updateTeamBody,
} from "../../schemas/team.schemas.js";
import * as TeamService from "../../services/team.service.js";
import { pageQuery, pageSchema } from "../paging.js";
import { Problems, sendServiceProblem } from "../problems.js";
import { resourcePath, teamSchema, toTeamResource } from "./resources.js";
import { defineRoute } from "./route.js";

/** The path parameter naming a team. */
const teamParams = z.object({
  teamName: z.string().meta({ description: "The team's team name." }),
});

/** The path parameters naming a team and one of its members. */
const memberParams = teamParams.extend({
  userName: z.string().meta({ description: "The member's user name." }),
});

/**
 * Gets a team, with its members, as an administrator sees it.
 * @param teamName the team's name
 * @returns the team, or the service's error result
 */
async function getTeamResource(teamName: string) {
  const result = await TeamService.getTeamByTeamName(teamName);
  if (result.status === "error") {
    return result;
  }
  const members = await TeamService.describeMembers([result.data]);
  return {
    status: "success" as const,
    data: toTeamResource(result.data, members),
  };
}

export const teamRoutes = [
  defineRoute({
    method: "get",
    path: "/teams",
    operationId: "listTeams",
    summary: "List teams",
    description:
      "Only for administrators. Players join a team by its code alone (POST /users/{userName}/teams), so they never see one client's groups from another's.",
    tags: ["Teams"],
    access: "admin",
    request: { query: pageQuery },
    responses: {
      200: { description: "A page of teams.", body: pageSchema(teamSchema) },
    },
    async handle(req, res) {
      const page = await TeamService.listTeamsPage(req.query);
      const members = await TeamService.describeMembers(page.items);
      res.json({
        items: page.items.map((team) => toTeamResource(team, members)),
        next: page.next,
      });
    },
  }),
  defineRoute({
    method: "post",
    path: "/teams",
    operationId: "createTeam",
    summary: "Create a team",
    tags: ["Teams"],
    access: "admin",
    request: { body: createTeamBody },
    responses: {
      201: {
        description: "Created.",
        body: teamSchema,
        headers: { Location: { description: "The new team." } },
      },
    },
    problems: [Problems.alreadyExists],
    async handle(req, res) {
      const created = await TeamService.createTeam(req.body);
      if (created.status === "error") {
        sendServiceProblem(res, created);
        return;
      }
      const team = await getTeamResource(req.body.teamName);
      if (team.status === "error") {
        sendServiceProblem(res, team);
        return;
      }
      res
        .status(201)
        .location(resourcePath("teams", req.body.teamName))
        .json(team.data);
    },
  }),
  defineRoute({
    method: "get",
    path: "/teams/{teamName}",
    operationId: "getTeam",
    summary: "Get a team",
    tags: ["Teams"],
    access: "admin",
    request: { params: teamParams },
    responses: { 200: { description: "The team.", body: teamSchema } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const team = await getTeamResource(req.params.teamName);
      if (team.status === "error") {
        sendServiceProblem(res, team);
        return;
      }
      res.json(team.data);
    },
  }),
  defineRoute({
    method: "patch",
    path: "/teams/{teamName}",
    operationId: "updateTeam",
    summary: "Change a team",
    description: "Changes the fields given.",
    tags: ["Teams"],
    access: "admin",
    request: { params: teamParams, body: updateTeamBody },
    responses: { 200: { description: "The team.", body: teamSchema } },
    problems: [Problems.notFound, Problems.alreadyExists],
    async handle(req, res) {
      const updated = await TeamService.updateTeam(
        req.params.teamName,
        req.body
      );
      if (updated.status === "error") {
        sendServiceProblem(res, updated);
        return;
      }
      const team = await getTeamResource(req.params.teamName);
      if (team.status === "error") {
        sendServiceProblem(res, team);
        return;
      }
      res.json(team.data);
    },
  }),
  defineRoute({
    method: "delete",
    path: "/teams/{teamName}",
    operationId: "deleteTeam",
    summary: "Delete a team",
    description:
      "Quests assigned to the team stay, assigned to a deleted team.",
    tags: ["Teams"],
    access: "admin",
    request: { params: teamParams },
    responses: { 204: { description: "Deleted." } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const deleted = await TeamService.deleteTeam(req.params.teamName);
      if (deleted.status === "error") {
        sendServiceProblem(res, deleted);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "put",
    path: "/teams/{teamName}/members/{userName}",
    operationId: "joinTeam",
    summary: "Join a team",
    description:
      "Adds the user to the team, with the team's join code. Only for administrators: players join by the code alone (POST /users/{userName}/teams), since naming a team here would tell them whether it exists.",
    tags: ["Teams"],
    access: "admin",
    request: { params: memberParams, body: joinTeamBody },
    responses: { 204: { description: "Joined." } },
    problems: [
      Problems.notFound,
      Problems.alreadyExists,
      Problems.wrongJoinCode,
    ],
    async handle(req, res) {
      const joined = await TeamService.addUserToTeam(
        req.params.teamName,
        req.params.userName,
        req.body.joinCode
      );
      if (joined.status === "error") {
        sendServiceProblem(res, joined);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "delete",
    path: "/teams/{teamName}/members/{userName}",
    operationId: "leaveTeam",
    summary: "Leave a team",
    description:
      "Removes the user from the team. A user may leave for themselves; an administrator may remove anyone.",
    tags: ["Teams"],
    access: "selfOrAdmin",
    request: { params: memberParams },
    responses: { 204: { description: "Left." } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const left = await TeamService.removeUserFromTeam(
        req.params.teamName,
        req.params.userName
      );
      if (left.status === "error") {
        sendServiceProblem(res, left);
        return;
      }
      res.status(204).end();
    },
  }),
];
