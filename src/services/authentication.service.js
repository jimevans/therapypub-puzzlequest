import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import * as UserService from "./user.service.js";

/**
 * Authenticates a user.
 * @param {string} userName the user name to authenticate
 * @param {string} password the password to authenticate
 * @returns {object} a response object containing a status, status code, and data
 */
export async function authenticate(userName, password) {
  const userResponse = await UserService.getUserByUserName(userName);
  if (userResponse.status === "error") {
    return userResponse;
  }
  const user = userResponse.data;
  if (!(await bcrypt.compare(password, user.password))) {
    return {
      status: "error",
      statusCode: 401,
      message: `Password for user ${userName} does not match`
    };
  }
  const token = jwt.sign(
    {
      userName: user.userName.toLowerCase(),
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      sms: user.sms,
      authorizationLevel: user.authorizationLevel,
    },
    config.PQ_SECRET_KEY,
    {
      expiresIn: "12h",
    }
  );
  return { status: "success", statusCode: 200, data: token };
}

/**
 * Encrypts a password for storage in the data store.
 * @param {string} plainTextPassword the plain text password
 * @returns {string} the encrypted password
 */
export async function encryptPassword(plainTextPassword) {
  return await bcrypt.hash(plainTextPassword, 10);
}
