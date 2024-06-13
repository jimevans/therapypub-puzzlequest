import { UserModel as User, AuthorizationLevel } from "../models/user.model.js";

export async function authenticate(userName, password) {
  const user = await User.findOne({ userName: userName }).lean();
  if (user === null) {
    return { error: `No user with user name ${userName} found` };
  }
  if (!(await bcrypt.compare(password, user.password))) {
    return { error: `Password for user ${userName} does not match` };
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
  return { status: "success", token: token };
}

export function isUserAdmin(user) {
  return user.authorizationLevel === AuthorizationLevel.ADMIN.value;
}

export function isCurrentUser(userName, currentUser) {
  return userName === currentUser.userName;
}
