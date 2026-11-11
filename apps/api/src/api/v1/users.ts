// Users, their passwords, and verifying their email addresses.
import { z } from "zod";
import * as RateLimiter from "../../middleware/rateLimiter.js";
import { toAuthorizationLevel } from "../../schemas/enums.js";
import {
  changePasswordBody,
  createUserBody,
  deleteUserBody,
  forgotPasswordBody,
  resetPasswordBody,
  updateUserBody,
  verifyEmailBody,
} from "../../schemas/user.schemas.js";
import { joinTeamBody } from "../../schemas/team.schemas.js";
import * as EmailVerificationService from "../../services/emailVerification.service.js";
import * as PasswordService from "../../services/password.service.js";
import * as QuestService from "../../services/quest.service.js";
import { issueUserLiveTicket } from "../../services/liveTicket.service.js";
import * as TeamService from "../../services/team.service.js";
import * as UserService from "../../services/user.service.js";
import { log } from "../../logger.js";
import { pageQuery, pageSchema } from "../paging.js";
import { liveTicketSchema } from "./spectating.js";
import { Problems, sendProblem, sendServiceProblem } from "../problems.js";
import {
  questSummarySchema,
  resourcePath,
  teamSummarySchema,
  toQuestSummaryResource,
  toUserResource,
  userSchema,
} from "./resources.js";
import { defineRoute } from "./route.js";

/** The path parameter naming a user. */
const userParams = z.object({
  userName: z.string().meta({ description: "The user's user name." }),
});

/**
 * The changes a PATCH makes to a user; fields left out keep their values.
 * A password is changed with PUT .../password, or by a reset link.
 */
const patchUserBody = updateUserBody.omit({ password: true });

/**
 * Gets a user, with their teams, as the API shows them.
 * @param userName the user's name
 * @returns the user, or the service's error result
 */
async function getUserResource(userName: string) {
  const result = await UserService.getUserByUserName(userName, true);
  if (result.status === "error") {
    return result;
  }
  const user = result.data;
  return {
    status: "success" as const,
    data: toUserResource(user, await user.getTeams()),
  };
}

export const userRoutes = [
  defineRoute({
    method: "get",
    path: "/users",
    operationId: "listUsers",
    summary: "List users",
    tags: ["Users"],
    access: "admin",
    request: { query: pageQuery },
    responses: {
      200: { description: "A page of users.", body: pageSchema(userSchema) },
    },
    async handle(req, res) {
      const page = await UserService.listUsersPage(req.query);
      res.json({
        items: page.items.map((user) => toUserResource(user)),
        next: page.next,
      });
    },
  }),
  defineRoute({
    method: "post",
    path: "/users",
    operationId: "createUser",
    summary: "Sign up, or create a user",
    description:
      "Anyone may sign up, as a player. An administrator creating a user may also choose its role. A verification email is sent to the address.",
    tags: ["Users"],
    access: "public",
    request: { body: createUserBody },
    responses: {
      201: {
        description: "Created.",
        body: userSchema,
        headers: { Location: { description: "The new user." } },
      },
    },
    problems: [
      Problems.forbidden,
      Problems.alreadyExists,
      Problems.passwordNotAllowed,
    ],
    async handle(req, res) {
      const { role, ...definition } = req.body;
      const isAdmin = UserService.getLoggedInUser(req.user)?.isAdmin() ?? false;
      if (role !== undefined && !isAdmin) {
        sendProblem(
          res,
          Problems.forbidden,
          "Only an administrator can choose a new user's role"
        );
        return;
      }
      const created = await UserService.createUser(
        new UserService.User({
          ...definition,
          authorizationLevel: toAuthorizationLevel(role ?? "player"),
        })
      );
      if (created.status === "error") {
        sendServiceProblem(res, created);
        return;
      }
      const user = await getUserResource(definition.userName);
      if (user.status === "error") {
        sendServiceProblem(res, user);
        return;
      }
      res
        .status(201)
        .location(resourcePath("users", definition.userName))
        .json(user.data);
    },
  }),
  defineRoute({
    method: "get",
    path: "/users/{userName}",
    operationId: "getUser",
    summary: "Get a user",
    tags: ["Users"],
    access: "selfOrAdmin",
    request: { params: userParams },
    responses: { 200: { description: "The user.", body: userSchema } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const user = await getUserResource(req.params.userName);
      if (user.status === "error") {
        sendServiceProblem(res, user);
        return;
      }
      res.json(user.data);
    },
  }),
  defineRoute({
    method: "get",
    path: "/users/{userName}/quests",
    operationId: "listUserQuests",
    summary: "List a user's quests",
    description:
      "The quests the user plays, on their own or in a team, once their entry has started: what a player sees on signing in. Each shows the user's own entry, and no one else's. It has no puzzles in it, so it says nothing about how long a quest is.",
    tags: ["Users"],
    access: "selfOrAdmin",
    request: { params: userParams, query: pageQuery },
    responses: {
      200: {
        description: "A page of quests.",
        body: pageSchema(questSummarySchema),
      },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const found = await UserService.getUserByUserName(req.params.userName);
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      const page = await QuestService.listAssignedQuestsPage(
        await found.data.getAssigneeIds(),
        req.query
      );
      res.json({
        items: page.items.map(toQuestSummaryResource),
        next: page.next,
      });
    },
  }),
  defineRoute({
    method: "post",
    path: "/users/{userName}/live-tickets",
    operationId: "createUserLiveTicket",
    summary: "Get a ticket to hear when a user's quests change",
    description:
      "A ticket lets one connection to the live-update websocket, /api/v1/updates, follow the list of quests the user plays: it's sent questsChanged whenever that list should be fetched again, as when one of the quests starts. It expires within a minute and can be used once, so ask for a new one for each connection.",
    tags: ["Users"],
    access: "selfOrAdmin",
    before: [RateLimiter.liveTicketRateLimiter],
    request: { params: userParams },
    responses: {
      201: { description: "The ticket.", body: liveTicketSchema },
    },
    problems: [Problems.notFound, Problems.tooManyRequests],
    async handle(req, res) {
      const found = await UserService.getUserByUserName(req.params.userName);
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      const userId = found.data.id;
      if (!userId) {
        sendProblem(res, Problems.notFound, "The user no longer exists");
        return;
      }
      const issued = await issueUserLiveTicket(userId);
      res.status(201).json({
        ticket: issued.ticket,
        expiresAt: issued.expiresAt.toISOString(),
      });
    },
  }),
  defineRoute({
    method: "patch",
    path: "/users/{userName}",
    operationId: "updateUser",
    summary: "Change a user",
    description:
      "Changes the fields given. A new email address must be verified again, and a verification email is sent to it. Only an administrator may change a role, which signs the user out everywhere.",
    tags: ["Users"],
    access: "selfOrAdmin",
    request: { params: userParams, body: patchUserBody },
    responses: { 200: { description: "The user.", body: userSchema } },
    problems: [Problems.notFound, Problems.alreadyExists],
    async handle(req, res) {
      const { sms, role, ...changes } = req.body;
      const isAdmin = UserService.requireLoggedInUser(req.user).isAdmin();
      if (role !== undefined && !isAdmin) {
        sendProblem(
          res,
          Problems.forbidden,
          "Only an administrator can change a user's role"
        );
        return;
      }
      const updated = await UserService.updateUser(req.params.userName, {
        ...changes,
        allowSmsMessages: sms,
        authorizationLevel:
          role !== undefined ? toAuthorizationLevel(role) : undefined,
      });
      if (updated.status === "error") {
        sendServiceProblem(res, updated);
        return;
      }
      const user = await getUserResource(req.params.userName);
      if (user.status === "error") {
        sendServiceProblem(res, user);
        return;
      }
      res.json(user.data);
    },
  }),
  defineRoute({
    method: "delete",
    path: "/users/{userName}",
    operationId: "deleteUser",
    summary: "Delete a user",
    description:
      "Deletes the user, ends their sessions, removes them from their teams, and takes their name out of quests' activity logs. Their entries in quests stay, as a deleted user's. Deleting your own account needs your password; wrong ones are limited, as for changing it. The only administrator can't be deleted.",
    tags: ["Users"],
    access: "selfOrAdmin",
    before: [RateLimiter.passwordChangeRateLimiter],
    request: { params: userParams, body: deleteUserBody },
    responses: { 204: { description: "Deleted." } },
    problems: [
      Problems.notFound,
      Problems.incorrectPassword,
      Problems.wrongState,
      Problems.tooManyRequests,
    ],
    async handle(req, res) {
      const isOwnAccount = UserService.requireLoggedInUser(
        req.user
      ).isCurrentUser(req.params.userName);
      const deleted = isOwnAccount
        ? await UserService.deleteOwnAccount(
            req.params.userName,
            req.body.password
          )
        : await UserService.deleteUser(req.params.userName);
      if (deleted.status === "error") {
        sendServiceProblem(res, deleted);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "post",
    path: "/users/{userName}/teams",
    operationId: "joinTeamByCode",
    summary: "Join a team by its code",
    description:
      "Adds the user to the team whose join code is given, in any letter case. The user needn't know the team's name, and players can't list the teams. Wrong codes are limited, since any team's code works.",
    tags: ["Teams"],
    access: "selfOrAdmin",
    before: [RateLimiter.joinCodeRateLimiter],
    request: { params: userParams, body: joinTeamBody },
    responses: {
      201: {
        description: "Joined: the team.",
        body: teamSummarySchema,
        headers: { Location: { description: "The team." } },
      },
    },
    problems: [
      Problems.notFound,
      Problems.alreadyExists,
      Problems.wrongJoinCode,
      Problems.tooManyRequests,
    ],
    async handle(req, res) {
      const joined = await TeamService.joinTeamByCode(
        req.params.userName,
        req.body.joinCode
      );
      if (joined.status === "error") {
        sendServiceProblem(res, joined);
        return;
      }
      res
        .status(201)
        .location(resourcePath("teams", joined.data.teamName))
        .json(joined.data);
    },
  }),
  defineRoute({
    method: "put",
    path: "/users/{userName}/password",
    operationId: "changePassword",
    summary: "Change your password",
    description:
      "Needs the current password, so only the user may do it. The user stays signed in on this device, and is signed out everywhere else.",
    tags: ["Passwords"],
    access: "self",
    before: [RateLimiter.passwordChangeRateLimiter],
    request: { params: userParams, body: changePasswordBody },
    responses: { 204: { description: "Changed." } },
    problems: [
      Problems.incorrectPassword,
      Problems.passwordNotAllowed,
      Problems.tooManyRequests,
    ],
    async handle(req, res) {
      const changed = await PasswordService.changePassword(
        req.params.userName,
        req.body.currentPassword,
        req.body.newPassword,
        req.sessionToken
      );
      if (changed.status === "error") {
        sendServiceProblem(res, changed);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "post",
    path: "/users/{userName}/password-reset-links",
    operationId: "sendPasswordResetLink",
    summary: "Email a user a password reset link",
    description:
      "For an administrator helping a user who can't sign in. The link goes to the user's verified email address.",
    tags: ["Passwords"],
    access: "admin",
    request: { params: userParams },
    responses: { 204: { description: "Sent." } },
    problems: [Problems.notFound, Problems.emailNotVerified],
    async handle(req, res) {
      const sent = await PasswordService.requestPasswordResetForUser(
        req.params.userName
      );
      if (sent.status === "error") {
        sendServiceProblem(res, sent);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "post",
    path: "/users/{userName}/email-verification-requests",
    operationId: "sendVerificationEmail",
    summary: "Email a user a new verification link",
    tags: ["Email verification"],
    access: "selfOrAdmin",
    before: [RateLimiter.verificationEmailRateLimiter],
    request: { params: userParams },
    responses: { 204: { description: "Sent." } },
    problems: [Problems.notFound, Problems.tooManyRequests],
    async handle(req, res) {
      const sent = await EmailVerificationService.sendVerificationEmail(
        req.params.userName
      );
      if (sent.status === "error") {
        sendServiceProblem(res, sent);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "post",
    path: "/password-reset-requests",
    operationId: "requestPasswordReset",
    summary: "Ask for a password reset link",
    description:
      "Emails a reset link to the account with this user name or email address, if it has a verified address. The response is the same whether or not there is such an account, so it doesn't say which accounts exist.",
    tags: ["Passwords"],
    access: "public",
    before: [
      RateLimiter.passwordResetRequestAddressRateLimiter,
      RateLimiter.passwordResetRequestRateLimiter,
    ],
    request: { body: forgotPasswordBody },
    responses: { 202: { description: "Accepted." } },
    problems: [Problems.tooManyRequests],
    async handle(req, res) {
      // Respond before doing any work, so how long the response takes
      // doesn't say whether an account matched.
      res.status(202).end();
      try {
        const result = await PasswordService.requestPasswordReset(
          req.body.identifier
        );
        if (result.status === "error") {
          log().error(
            { reason: result.message },
            "password reset request failed"
          );
        }
      } catch (err) {
        // The response has been sent, so an uncaught rejection here would
        // otherwise crash the process.
        log().error({ err }, "password reset request failed");
      }
    },
  }),
  defineRoute({
    method: "post",
    path: "/password-resets",
    operationId: "resetPassword",
    summary: "Reset a password",
    description:
      "Sets a new password with the token from a reset link, and signs the user out everywhere.",
    tags: ["Passwords"],
    access: "public",
    before: [RateLimiter.passwordResetRateLimiter],
    request: { body: resetPasswordBody },
    responses: { 204: { description: "Reset." } },
    problems: [
      Problems.invalidLink,
      Problems.passwordNotAllowed,
      Problems.tooManyRequests,
    ],
    async handle(req, res) {
      const reset = await PasswordService.resetPassword(
        req.body.resetToken,
        req.body.newPassword
      );
      if (reset.status === "error") {
        sendServiceProblem(res, reset);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "post",
    path: "/email-verifications",
    operationId: "verifyEmail",
    summary: "Verify an email address",
    description: "With the token from a verification link.",
    tags: ["Email verification"],
    access: "public",
    before: [RateLimiter.emailVerificationRateLimiter],
    request: { body: verifyEmailBody },
    responses: { 204: { description: "Verified." } },
    problems: [Problems.invalidLink, Problems.tooManyRequests],
    async handle(req, res) {
      const verified = await EmailVerificationService.verifyEmail(
        req.body.token
      );
      if (verified.status === "error") {
        sendServiceProblem(res, verified);
        return;
      }
      res.status(204).end();
    },
  }),
];
