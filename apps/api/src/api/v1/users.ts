// Users, their passwords, and verifying their email addresses.
import { z } from "zod";
import * as RateLimiter from "../../middleware/rateLimiter.js";
import { AuthorizationLevel } from "../../models/user.model.js";
import {
  changePasswordBody,
  createUserBody,
  forgotPasswordBody,
  resetPasswordBody,
  updateUserBody,
  verifyEmailBody,
} from "../../schemas/user.schemas.js";
import * as EmailVerificationService from "../../services/emailVerification.service.js";
import * as PasswordService from "../../services/password.service.js";
import * as QuestService from "../../services/quest.service.js";
import * as UserService from "../../services/user.service.js";
import { getErrorMessage } from "../../errors.js";
import { pageQuery, pageSchema } from "../paging.js";
import { Problems, sendProblem, sendServiceProblem } from "../problems.js";
import {
  questSummarySchema,
  resourcePath,
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
      "Anyone may sign up, as a player. An administrator creating a user may also choose its authorization level. A verification email is sent to the address.",
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
      const { authorizationLevel, ...definition } = req.body;
      const isAdmin = UserService.getLoggedInUser(req.user)?.isAdmin() ?? false;
      if (authorizationLevel !== undefined && !isAdmin) {
        sendProblem(
          res,
          Problems.forbidden,
          "Only an administrator can choose a new user's authorization level"
        );
        return;
      }
      const created = await UserService.createUser(
        new UserService.User({
          ...definition,
          authorizationLevel: authorizationLevel ?? AuthorizationLevel.USER,
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
      "The quests assigned to the user or their teams, once they have started: what a player sees on signing in. It has no puzzles in it, so it says nothing about how long a quest is.",
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
    method: "patch",
    path: "/users/{userName}",
    operationId: "updateUser",
    summary: "Change a user",
    description:
      "Changes the fields given. A new email address must be verified again, and a verification email is sent to it. Only an administrator may change an authorization level, which signs the user out everywhere.",
    tags: ["Users"],
    access: "selfOrAdmin",
    request: { params: userParams, body: patchUserBody },
    responses: { 200: { description: "The user.", body: userSchema } },
    problems: [Problems.notFound, Problems.alreadyExists],
    async handle(req, res) {
      const { sms, authorizationLevel, ...changes } = req.body;
      const isAdmin = UserService.requireLoggedInUser(req.user).isAdmin();
      if (authorizationLevel !== undefined && !isAdmin) {
        sendProblem(
          res,
          Problems.forbidden,
          "Only an administrator can change an authorization level"
        );
        return;
      }
      const updated = await UserService.updateUser(req.params.userName, {
        ...changes,
        allowSmsMessages: sms,
        authorizationLevel,
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
      "Deletes the user, ends their sessions, and removes them from their teams. Quests assigned to them stay, assigned to a deleted user.",
    tags: ["Users"],
    access: "selfOrAdmin",
    request: { params: userParams },
    responses: { 204: { description: "Deleted." } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const deleted = await UserService.deleteUser(req.params.userName);
      if (deleted.status === "error") {
        sendServiceProblem(res, deleted);
        return;
      }
      res.status(204).end();
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
    before: [RateLimiter.passwordRateLimiter],
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
    before: [RateLimiter.passwordRateLimiter],
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
          console.error(`Password reset request failed: ${result.message}`);
        }
      } catch (err) {
        // The response has been sent, so an uncaught rejection here would
        // otherwise crash the process.
        console.error(`Password reset request failed: ${getErrorMessage(err)}`);
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
    before: [RateLimiter.passwordRateLimiter],
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
