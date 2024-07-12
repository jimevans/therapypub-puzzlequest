import { UserModel as User, AuthorizationLevel } from "../models/user.model.js";

/**
 * Authenticates a user.
 * @param {string} userName the user name to authenticate
 * @param {string} password the password to authenticate
 * @returns {object} a response object containing a status, status code, and data
 */
export async function authenticate(userName, password) {
  const user = await User.findOne({ userName: userName }).lean();
  if (user === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with user name ${userName} found`
    };
  }
  if (!(await bcrypt.compare(password, user.password))) {
    return {
      status: "error",
      statusCode: 401,
      message: `Password for user ${userName} does not match`
    };
  }
  const token = jwt.sign(
    {
      userName: user.userName,
      displayName: user.displayName,
      email: user.email,
      sms: user.sms,
      authorizationLevel: user.authorizationLevel,
    },
    config.PQ_SECRET_KEY,
    {
      expiresIn: "2h",
    }
  );
  return { status: "success", statusCode: 200, data: token };
}

/**
 * Gets a value indicating wither the user is a user with administrative privileges.
 * @param {User} user and object representing a user
 * @returns {boolean} true if the user is an admin user; otherwise, false
 */
export function isUserAdmin(user) {
  return user && user.authorizationLevel === AuthorizationLevel.ADMIN;
}

/**
 * Gets a value indicating whether a user name is the currently logged in user.
 * @param {string} userName the user name to check
 * @param {User} currentUser the currently logged in user
 * @returns {boolean} true if the user name is the currently logged in user; otherwise, false
 */
export function isCurrentUser(userName, currentUser) {
  return userName === currentUser.userName;
}
