import { createHash, randomBytes } from "crypto";
import { config } from "../config.js";
import { log } from "../logger.js";
import { PasswordResetModel } from "../models/passwordReset.model.js";
import { UserModel } from "../models/user.model.js";
import * as AuthenticationService from "./authentication.service.js";
import * as SessionService from "./session.service.js";
import * as EmailService from "./email.service.js";
import type { ServiceResult } from "../types.js";
import { unexpectedErrorResult } from "../errors.js";

/** A user as loaded from the database. */
type UserDocument = InstanceType<typeof UserModel>;

export const RESET_TOKEN_LIFETIME_MINUTES = 60;

/**
 * Hashes a password reset token for storage and lookup.
 * @param token the reset token
 * @returns the hex-encoded SHA-256 hash of the token
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Sets a new password on a user document, records when it was changed, and
 * ends the user's sessions, so anyone who knew the old password is signed
 * out.
 * @param userDocument the user document from the data store
 * @param newPassword the new plain text password
 * @param keepSessionToken a session to keep, such as the one that changed
 *  the password
 */
async function applyNewPassword(
  userDocument: UserDocument,
  newPassword: string,
  keepSessionToken?: string
): Promise<void> {
  userDocument.password =
    await AuthenticationService.encryptPassword(newPassword);
  userDocument.passwordChangedAt = new Date(Date.now());
  await userDocument.save();
  await PasswordResetModel.deleteMany({ userId: userDocument._id });
  await SessionService.deleteUserSessions(userDocument.id, keepSessionToken);
}

/**
 * Notifies a user that their password was changed. Failures are logged but
 * do not fail the password change.
 * @param userDocument the user document from the data store
 */
async function sendPasswordChangedNotice(
  userDocument: UserDocument
): Promise<void> {
  const result = await EmailService.sendEmail({
    to: userDocument.email,
    subject: "Your PuzzleQuest password was changed",
    text:
      `The password for your PuzzleQuest account (${userDocument.userName}) was just changed.\n\n` +
      "If you did not make this change, reset your password immediately and contact an administrator.",
  });
  if (result.status === "error") {
    log().error({ reason: result.message }, "password change notice not sent");
  }
}

/**
 * Changes the password of a user after verifying their current password.
 * @param userName the user name of the user changing their password
 * @param currentPassword the user's current plain text password
 * @param newPassword the new plain text password
 * @returns a result containing a status, status code, and, on success, a new
 *  authentication token for the user
 */
export async function changePassword(
  userName: string,
  currentPassword: string,
  newPassword: string,
  keepSessionToken?: string
): Promise<ServiceResult<undefined>> {
  const userDocument = await UserModel.findOne({ userName: userName });
  if (userDocument === null) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No user with user name ${userName} found`,
    };
  }
  if (
    !(await AuthenticationService.comparePassword(
      currentPassword,
      userDocument.password
    ))
  ) {
    return {
      status: "error",
      statusCode: 400,
      reason: "incorrect-password",
      message: "Current password is incorrect",
    };
  }
  const policyResult =
    AuthenticationService.validatePasswordPolicy(newPassword);
  if (policyResult.status === "error") {
    return policyResult;
  }
  if (newPassword === currentPassword) {
    return {
      status: "error",
      statusCode: 400,
      reason: "password-not-allowed",
      message: "New password must be different from the current password",
    };
  }
  try {
    await applyNewPassword(userDocument, newPassword, keepSessionToken);
  } catch (err) {
    return unexpectedErrorResult("changePassword", err);
  }
  await sendPasswordChangedNotice(userDocument);
  return { status: "success", statusCode: 200 };
}

/**
 * Creates a password reset token for the user matching the identifier and
 * emails them a link to reset their password. Succeeds without doing anything
 * if no user matches, so callers must not reveal whether an account exists.
 * @param identifier the user name or email address of the user
 * @returns a result containing a status, status code, and message
 */
export async function requestPasswordReset(
  identifier: string
): Promise<ServiceResult<undefined>> {
  const configurationError = checkResetLinkConfiguration();
  if (configurationError) {
    return configurationError;
  }
  const normalizedIdentifier = String(identifier).trim().toLowerCase();
  const userDocument = await UserModel.findOne({
    $or: [{ userName: normalizedIdentifier }, { email: normalizedIdentifier }],
  });
  // A reset link goes only to an address the user has proved is theirs, so
  // a mistyped address can't receive control of the account. The response
  // is the same either way, so it doesn't reveal which accounts exist.
  if (userDocument === null || !userDocument.emailVerifiedAt) {
    return { status: "success", statusCode: 200 };
  }
  return await sendPasswordResetLink(userDocument, false);
}

/**
 * Emails a password reset link to the specified user on behalf of an
 * administrator. Unlike requestPasswordReset, reports whether the user exists.
 * The user's current password keeps working until the link is used.
 * @param userName the user name of the user to send the link to
 * @returns a result containing a status, status code, and message
 */
export async function requestPasswordResetForUser(
  userName: string
): Promise<ServiceResult<undefined>> {
  const configurationError = checkResetLinkConfiguration();
  if (configurationError) {
    return configurationError;
  }
  const userDocument = await UserModel.findOne({ userName: userName });
  if (userDocument === null) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No user with user name ${userName} found`,
    };
  }
  if (!userDocument.emailVerifiedAt) {
    return {
      status: "error",
      statusCode: 400,
      reason: "email-not-verified",
      message: `${userName} hasn't verified their email address yet, so a reset link can't be sent to it`,
    };
  }
  return await sendPasswordResetLink(userDocument, true);
}

/**
 * Creates a password reset token for a user and emails them a link to use it.
 * @param userDocument the user document from the data store
 * @param requestedByAdmin true if an administrator requested the reset;
 *  otherwise, false
 * @returns a result containing a status, status code, and message
 */
async function sendPasswordResetLink(
  userDocument: UserDocument,
  requestedByAdmin: boolean
): Promise<ServiceResult<undefined>> {
  // Only the most recent reset link is valid.
  await PasswordResetModel.deleteMany({ userId: userDocument._id });
  const token = randomBytes(32).toString("base64url");
  await new PasswordResetModel({
    userId: userDocument._id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_LIFETIME_MINUTES * 60 * 1000),
  }).save();

  const resetUrl = new URL("/user/password/reset", config.PQ_BASE_URL);
  resetUrl.searchParams.set("token", token);
  return await EmailService.sendEmail({
    to: userDocument.email,
    subject: "Reset your PuzzleQuest password",
    text:
      `${requestedByAdmin ? "A PuzzleQuest administrator requested a password reset" : "A password reset was requested"} for your PuzzleQuest account (${userDocument.userName}).\n\n` +
      `To choose a new password, open this link within ${RESET_TOKEN_LIFETIME_MINUTES} minutes:\n\n` +
      `${resetUrl.href}\n\n` +
      (requestedByAdmin
        ? "If you were not expecting this, contact an administrator. Your password will not change unless you use the link."
        : "If you did not request this, you can ignore this email; your password will not change."),
  });
}

/**
 * Checks that the configuration needed to build reset links is present.
 * @returns an error result, or null if configured
 */
function checkResetLinkConfiguration(): ServiceResult<undefined> | null {
  if (!config.PQ_BASE_URL) {
    return {
      status: "error",
      statusCode: 500,
      message: "PQ_BASE_URL must be configured to send password reset links",
    };
  }
  return null;
}

/**
 * Resets a user's password using a password reset token. The token can only
 * be used once.
 * @param token the password reset token from the reset link
 * @param newPassword the new plain text password
 * @returns a result containing a status, status code, and message
 */
export async function resetPassword(
  token: unknown,
  newPassword: string
): Promise<ServiceResult<undefined>> {
  const policyResult =
    AuthenticationService.validatePasswordPolicy(newPassword);
  if (policyResult.status === "error") {
    return policyResult;
  }
  const invalidTokenResult: ServiceResult<undefined> = {
    status: "error",
    statusCode: 400,
    reason: "invalid-link",
    message: "Password reset link is invalid or has expired",
  };
  if (typeof token !== "string" || !token) {
    return invalidTokenResult;
  }

  // Deleting the token as it is looked up guarantees it can only be used once,
  // even with concurrent requests. Expiry is checked explicitly because
  // MongoDB only removes expired documents periodically.
  const resetRequest = await PasswordResetModel.findOneAndDelete({
    tokenHash: hashResetToken(token),
    expiresAt: { $gt: new Date(Date.now()) },
  });
  if (resetRequest === null) {
    return invalidTokenResult;
  }
  const userDocument = await UserModel.findById(resetRequest.userId);
  if (userDocument === null) {
    return invalidTokenResult;
  }
  try {
    await applyNewPassword(userDocument, newPassword);
  } catch (err) {
    return unexpectedErrorResult("resetPassword", err);
  }
  await sendPasswordChangedNotice(userDocument);
  return { status: "success", statusCode: 200 };
}
