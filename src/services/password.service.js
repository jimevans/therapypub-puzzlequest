import { createHash, randomBytes } from "crypto";
import { config } from "../config.js";
import { PasswordResetModel } from "../models/passwordReset.model.js";
import { UserModel } from "../models/user.model.js";
import * as AuthenticationService from "./authentication.service.js";
import * as EmailService from "./email.service.js";
import { User } from "./user.service.js";

export const RESET_TOKEN_LIFETIME_MINUTES = 60;

/**
 * Hashes a password reset token for storage and lookup.
 * @param {string} token the reset token
 * @returns {string} the hex-encoded SHA-256 hash of the token
 */
export function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Sets a new password on a user document and records when it was changed,
 * which revokes all previously issued tokens.
 * @param {object} userDocument the user document from the data store
 * @param {string} newPassword the new plain text password
 */
async function applyNewPassword(userDocument, newPassword) {
  userDocument.password =
    await AuthenticationService.encryptPassword(newPassword);
  userDocument.passwordChangedAt = new Date(Date.now());
  await userDocument.save();
  await PasswordResetModel.deleteMany({ userName: userDocument.userName });
}

/**
 * Notifies a user that their password was changed. Failures are logged but
 * do not fail the password change.
 * @param {object} userDocument the user document from the data store
 */
async function sendPasswordChangedNotice(userDocument) {
  const result = await EmailService.sendEmail({
    to: userDocument.email,
    subject: "Your PuzzleQuest password was changed",
    text:
      `The password for your PuzzleQuest account (${userDocument.userName}) was just changed.\n\n` +
      "If you did not make this change, reset your password immediately and contact an administrator.",
  });
  if (result.status === "error") {
    console.error(`Password change notice not sent: ${result.message}`);
  }
}

/**
 * Changes the password of a user after verifying their current password.
 * @param {string} userName the user name of the user changing their password
 * @param {string} currentPassword the user's current plain text password
 * @param {string} newPassword the new plain text password
 * @returns {Promise<object>} a response object containing a status, status code, and,
 *  on success, a new authentication token for the user
 */
export async function changePassword(userName, currentPassword, newPassword) {
  const userDocument = await UserModel.findOne({ userName: userName });
  if (userDocument === null) {
    return {
      status: "error",
      statusCode: 404,
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
      message: "New password must be different from the current password",
    };
  }
  try {
    await applyNewPassword(userDocument, newPassword);
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `Password not changed - ${err.message}`,
    };
  }
  await sendPasswordChangedNotice(userDocument);
  const token = AuthenticationService.createAuthenticationToken(
    new User(userDocument)
  );
  return { status: "success", statusCode: 200, data: token };
}

/**
 * Creates a password reset token for the user matching the identifier and
 * emails them a link to reset their password. Succeeds without doing anything
 * if no user matches, so callers must not reveal whether an account exists.
 * @param {string} identifier the user name or email address of the user
 * @returns {Promise<object>} a response object containing a status, status code, and message
 */
export async function requestPasswordReset(identifier) {
  const configurationError = checkResetLinkConfiguration();
  if (configurationError) {
    return configurationError;
  }
  const normalizedIdentifier = String(identifier).trim().toLowerCase();
  const userDocument = await UserModel.findOne({
    $or: [{ userName: normalizedIdentifier }, { email: normalizedIdentifier }],
  });
  if (userDocument === null) {
    return { status: "success", statusCode: 200 };
  }
  return await sendPasswordResetLink(userDocument, false);
}

/**
 * Emails a password reset link to the specified user on behalf of an
 * administrator. Unlike requestPasswordReset, reports whether the user exists.
 * The user's current password keeps working until the link is used.
 * @param {string} userName the user name of the user to send the link to
 * @returns {Promise<object>} a response object containing a status, status code, and message
 */
export async function requestPasswordResetForUser(userName) {
  const configurationError = checkResetLinkConfiguration();
  if (configurationError) {
    return configurationError;
  }
  const userDocument = await UserModel.findOne({ userName: userName });
  if (userDocument === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with user name ${userName} found`,
    };
  }
  return await sendPasswordResetLink(userDocument, true);
}

/**
 * Creates a password reset token for a user and emails them a link to use it.
 * @param {object} userDocument the user document from the data store
 * @param {boolean} requestedByAdmin true if an administrator requested the reset; otherwise, false
 * @returns {Promise<object>} a response object containing a status, status code, and message
 */
async function sendPasswordResetLink(userDocument, requestedByAdmin) {
  // Only the most recent reset link is valid.
  await PasswordResetModel.deleteMany({ userName: userDocument.userName });
  const token = randomBytes(32).toString("base64url");
  await new PasswordResetModel({
    userName: userDocument.userName,
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
 * @returns {object | null} an error response object, or null if configured
 */
function checkResetLinkConfiguration() {
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
 * @param {string} token the password reset token from the reset link
 * @param {string} newPassword the new plain text password
 * @returns {Promise<object>} a response object containing a status, status code, and message
 */
export async function resetPassword(token, newPassword) {
  const policyResult =
    AuthenticationService.validatePasswordPolicy(newPassword);
  if (policyResult.status === "error") {
    return policyResult;
  }
  const invalidTokenResult = {
    status: "error",
    statusCode: 400,
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
  const userDocument = await UserModel.findOne({
    userName: resetRequest.userName,
  });
  if (userDocument === null) {
    return invalidTokenResult;
  }
  try {
    await applyNewPassword(userDocument, newPassword);
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `Password not reset - ${err.message}`,
    };
  }
  await sendPasswordChangedNotice(userDocument);
  return { status: "success", statusCode: 200 };
}
