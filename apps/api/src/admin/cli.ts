// Administration commands, run with Node from the server's compiled code:
//
//   node apps/api/dist/admin/cli.js promote USERNAME
//
// promote makes a user who has signed up an administrator, which is how a new
// site gets its first one. The database comes from PQ_MONGODB_URI, so the
// command can run on the server, or on another computer against the same
// database. It signs the user out everywhere, so their next sign-in has the
// new role. See the README's "Making an administrator".
import mongoose from "mongoose";
import { runIfStarted } from "../command.js";
import { config } from "../config.js";
import { AuthorizationLevel, UserModel } from "../models/user.model.js";
import * as UserService from "../services/user.service.js";

const USAGE = "Usage: promote USERNAME";

/**
 * Writes a line for whoever runs the command.
 * @param line the line
 */
function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Runs a command.
 * @param args the command line, after the script
 * @returns the exit code
 */
export async function run(args: string[]): Promise<number> {
  const [command, userName, ...rest] = args;
  if (command !== "promote" || !userName || rest.length > 0) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  await mongoose.connect(config.PQ_MONGODB_URI);
  try {
    const name = userName.toLowerCase();
    const user = await UserModel.findOne({ userName: name }).lean();
    if (!user) {
      process.stderr.write(
        `There's no user named ${name}. Sign up on the site first, then promote that user.\n`
      );
      return 1;
    }
    if (user.authorizationLevel >= AuthorizationLevel.ADMIN) {
      say(`${name} is already an administrator.`);
      return 0;
    }
    const result = await UserService.updateUser(name, {
      authorizationLevel: AuthorizationLevel.ADMIN,
    });
    if (result.status === "error") {
      process.stderr.write(`${result.message}\n`);
      return 1;
    }
    say(`${name} is now an administrator. They'll need to sign in again.`);
    return 0;
  } finally {
    await mongoose.connection.close();
  }
}

await runIfStarted(import.meta.filename, run);
