import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import type { ServiceResult } from "../types.js";
import * as UserService from "./user.service.js";

export const MINIMUM_PASSWORD_LENGTH = 8;

// bcrypt silently ignores everything after the first 72 bytes of input.
export const MAXIMUM_PASSWORD_BYTES = 72;

/** The one message for every failed sign-in. */
export const INCORRECT_CREDENTIALS_MESSAGE = "Incorrect user name or password";

// A hash of a password no one has, compared against when the user name is
// unknown, so a failed sign-in takes about as long either way.
let dummyPasswordHash: Promise<string> | undefined;

/**
 * Authenticates a user. A failed sign-in gives the same message, and takes
 * about the same time, whether or not the user name exists, so it doesn't
 * reveal which user names do.
 * @param userName the user name to authenticate
 * @param password the password to authenticate
 * @returns a result containing the user
 */
export async function authenticate(
  userName: string,
  password: string
): Promise<ServiceResult<UserService.User>> {
  const userResponse = await UserService.getUserByUserName(userName);
  const passwordHash =
    userResponse.status === "success"
      ? userResponse.data.password
      : await (dummyPasswordHash ??= encryptPassword(randomUUID()));
  const matches =
    passwordHash !== undefined &&
    passwordHash !== "" &&
    (await bcrypt.compare(password, passwordHash));
  if (userResponse.status === "error" || !matches) {
    return {
      status: "error",
      statusCode: 401,
      message: INCORRECT_CREDENTIALS_MESSAGE,
    };
  }
  return { status: "success", statusCode: 200, data: userResponse.data };
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
