import { z } from "zod";
import { AuthorizationLevel } from "../models/user.model.js";
import {
  displayName,
  newName,
  phoneNumber,
  requiredText,
  wholeNumber,
} from "./common.js";

/** An authorization level (see AuthorizationLevel). */
const authorizationLevel = wholeNumber.refine(
  (level) => (Object.values(AuthorizationLevel) as number[]).includes(level),
  "Must be a known authorization level"
);

/** POST /api/v1/sessions */
export const loginBody = z.object({
  userName: z.string().trim().toLowerCase().min(1, "Required"),
  password: requiredText,
  /**
   * "web" (the default) keeps the session in a cookie; "native", for an app,
   * returns the session token for it to send as a Bearer token.
   */
  client: z.enum(["web", "native"]).default("web"),
});
export type LoginBody = z.infer<typeof loginBody>;

/**
 * POST /api/v1/users. The password policy is checked by the service, so
 * its rules live in one place.
 */
export const createUserBody = z.object({
  userName: newName,
  displayName: displayName.default(""),
  email: z.email("Enter a valid email address"),
  phone: phoneNumber.default(""),
  sms: z.boolean().default(false),
  password: requiredText,
  /** Counts only when an administrator creates the account. */
  authorizationLevel: authorizationLevel.optional(),
});
export type CreateUserBody = z.infer<typeof createUserBody>;

/** PATCH /api/v1/users/{userName} (without the password). Fields left out keep their stored values. */
export const updateUserBody = z.object({
  displayName: displayName.optional(),
  email: z.email("Enter a valid email address").optional(),
  phone: phoneNumber.optional(),
  sms: z.boolean().optional(),
  /** Counts only when an administrator sends it. */
  password: requiredText.optional(),
  /** Counts only when an administrator sends it. */
  authorizationLevel: authorizationLevel.optional(),
});
export type UpdateUserBody = z.infer<typeof updateUserBody>;

/** PUT /api/v1/users/{userName}/password */
export const changePasswordBody = z.object({
  currentPassword: requiredText,
  newPassword: requiredText,
});
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

/** POST /api/v1/password-reset-requests: a user name or email address. */
export const forgotPasswordBody = z.object({
  identifier: z.string().trim().min(1, "Required"),
});
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBody>;

/** POST /api/v1/password-resets */
export const resetPasswordBody = z.object({
  resetToken: requiredText,
  newPassword: requiredText,
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBody>;

/** POST /api/v1/email-verifications: the token from a verification link. */
export const verifyEmailBody = z.object({
  token: requiredText,
});
export type VerifyEmailBody = z.infer<typeof verifyEmailBody>;
