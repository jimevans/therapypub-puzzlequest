import { z } from "zod";
import { roleSchema } from "./enums.js";
import { displayName, newName, phoneNumber, requiredText } from "./common.js";

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
  role: roleSchema.optional().meta({
    description:
      "Only an administrator may give it; anyone else signs up as a player.",
  }),
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
  role: roleSchema.optional().meta({
    description:
      "Only an administrator may change it, which signs the user out everywhere.",
  }),
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

/**
 * DELETE /api/v1/users/{userName}: deleting your own account needs your
 * password; an administrator deleting someone else sends nothing.
 */
export const deleteUserBody = z.object({
  password: z.string().optional().meta({
    description: "Your password, to delete your own account.",
  }),
});
export type DeleteUserBody = z.infer<typeof deleteUserBody>;
