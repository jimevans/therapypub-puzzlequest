import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { ServiceResult } from "../types.js";
import * as UserService from "./user.service.js";

export const MINIMUM_PASSWORD_LENGTH = 8;

// bcrypt silently ignores everything after the first 72 bytes of input.
export const MAXIMUM_PASSWORD_BYTES = 72;

/**
 * Authenticates a user.
 * @param userName the user name to authenticate
 * @param password the password to authenticate
 * @returns a result containing the signed authentication token
 */
export async function authenticate(
  userName: string,
  password: string
): Promise<ServiceResult<string>> {
  const userResponse = await UserService.getUserByUserName(userName);
  if (userResponse.status === "error") {
    return userResponse;
  }
  const user = userResponse.data;
  if (!user.password || !(await bcrypt.compare(password, user.password))) {
    return {
      status: "error",
      statusCode: 401,
      message: `Password for user ${userName} does not match`,
    };
  }
  const token = createAuthenticationToken(user);
  return { status: "success", statusCode: 200, data: token };
}

/**
 * Creates a signed authentication token for a user.
 * @param user the user for which to create the token
 * @returns the signed token
 */
export function createAuthenticationToken(user: UserService.User): string {
  return jwt.sign(
    {
      userName: user.userName.toLowerCase(),
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      sms: user.allowSmsMessages,
      authorizationLevel: user.authorizationLevel,
    },
    config.PQ_SECRET_KEY,
    {
      expiresIn: "12h",
    }
  );
}

/**
 * Determines whether a token was issued before the user's password was last
 * changed, and therefore must no longer be accepted.
 * @param issuedAt the token's issued-at time, in seconds since the epoch
 * @param passwordChangedAt when the password was last changed, if ever
 * @returns true if the token has been revoked; otherwise, false
 */
export function isTokenRevoked(
  issuedAt: number,
  passwordChangedAt: Date | null | undefined
): boolean {
  if (!passwordChangedAt) {
    return false;
  }
  // Token issue times have one-second resolution, so compare in seconds;
  // a token issued in the same second as the change remains valid.
  return issuedAt < Math.floor(passwordChangedAt.getTime() / 1000);
}

/**
 * Validates that a password meets the password policy.
 * @param password the plain text password to validate
 * @returns a success result, or an error result describing the problem
 */
export function validatePasswordPolicy(
  password: unknown
): ServiceResult<undefined> {
  if (
    typeof password !== "string" ||
    password.length < MINIMUM_PASSWORD_LENGTH
  ) {
    return {
      status: "error",
      statusCode: 400,
      message: `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters long`,
    };
  }
  if (Buffer.byteLength(password, "utf8") > MAXIMUM_PASSWORD_BYTES) {
    return {
      status: "error",
      statusCode: 400,
      message: `Password must be no more than ${MAXIMUM_PASSWORD_BYTES} bytes long`,
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Compares a plain text password with an encrypted password.
 * @param plainTextPassword the plain text password
 * @param encryptedPassword the encrypted password from the data store
 * @returns true if the passwords match; otherwise, false
 */
export async function comparePassword(
  plainTextPassword: string,
  encryptedPassword: string
): Promise<boolean> {
  return await bcrypt.compare(plainTextPassword, encryptedPassword);
}

/**
 * Encrypts a password for storage in the data store.
 * @param plainTextPassword the plain text password
 * @returns the encrypted password
 */
export async function encryptPassword(
  plainTextPassword: string
): Promise<string> {
  return await bcrypt.hash(plainTextPassword, 10);
}
