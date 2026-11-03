import { createHash, randomBytes } from "crypto";
import { config } from "../config.js";
import { EmailVerificationModel } from "../models/emailVerification.model.js";
import { UserModel } from "../models/user.model.js";
import type { ServiceResult } from "../types.js";
import * as EmailService from "./email.service.js";

export const VERIFICATION_TOKEN_LIFETIME_HOURS = 24;

/**
 * Hashes an email verification token for storage and lookup.
 * @param token the verification token
 * @returns the hex-encoded SHA-256 hash of the token
 */
export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Emails a user a link to verify their address, replacing any link sent
 * before. Does nothing for a user whose address is already verified.
 * @param userName the user name
 * @returns a success result, or an error result
 */
export async function sendVerificationEmail(
  userName: string
): Promise<ServiceResult<undefined>> {
  if (!config.PQ_BASE_URL) {
    return {
      status: "error",
      statusCode: 500,
      message: "PQ_BASE_URL must be configured to send verification links",
    };
  }
  const user = await UserModel.findOne({ userName }).lean();
  if (user === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with user name ${userName} found`,
    };
  }
  if (user.emailVerifiedAt) {
    return { status: "success", statusCode: 200 };
  }
  const token = randomBytes(32).toString("base64url");
  await EmailVerificationModel.deleteMany({ userName });
  await EmailVerificationModel.create({
    userName,
    email: user.email,
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(
      Date.now() + VERIFICATION_TOKEN_LIFETIME_HOURS * 60 * 60 * 1000
    ),
  });
  const link = new URL("/user/email/verify", config.PQ_BASE_URL);
  link.searchParams.set("token", token);
  return await EmailService.sendEmail({
    to: user.email,
    subject: "Verify your PuzzleQuest email address",
    text: [
      `Hello ${user.displayName || user.userName},`,
      "",
      "Please confirm that this is your email address by following this link:",
      "",
      link.href,
      "",
      `The link works for ${VERIFICATION_TOKEN_LIFETIME_HOURS} hours. If you didn't sign up for PuzzleQuest, you can ignore this email.`,
    ].join("\n"),
  });
}

/**
 * Sends a verification email, logging a failure rather than reporting it,
 * for actions that shouldn't fail because email couldn't be sent, such as
 * signing up.
 * @param userName the user name
 */
export async function trySendVerificationEmail(
  userName: string
): Promise<void> {
  const result = await sendVerificationEmail(userName);
  if (result.status === "error") {
    console.error(
      `Sending a verification email to ${userName} failed: ${result.message}`
    );
  }
}

/**
 * Verifies a user's email address with the token from a verification link.
 * A token works once, until it expires, and only while the user's address
 * is still the one it was sent to.
 * @param token the verification token
 * @returns a success result, or an error result for an invalid token
 */
export async function verifyEmail(
  token: string
): Promise<ServiceResult<undefined>> {
  const invalid: ServiceResult<undefined> = {
    status: "error",
    statusCode: 400,
    message:
      "This verification link is invalid or has expired. Sign in to send a new one.",
  };
  const verification = await EmailVerificationModel.findOneAndDelete({
    tokenHash: hashVerificationToken(token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (verification === null) {
    return invalid;
  }
  const updated = await UserModel.updateOne(
    { userName: verification.userName, email: verification.email },
    { $set: { emailVerifiedAt: new Date() } }
  );
  return updated.matchedCount === 1
    ? { status: "success", statusCode: 200 }
    : invalid;
}
