import path from "path";

// Locations of files the application reads and writes at run time. Static
// files stay in src/ even when the application runs from compiled output
// in dist/, so paths are resolved from the workspace rather than from this
// module. Both src/ and dist/ sit directly under the workspace's root.
const workspaceRoot = path.resolve(import.meta.dirname, "..");
const sourceDirectory = path.join(workspaceRoot, "src");

/** Static files served to browsers. */
export const publicDirectory = path.join(sourceDirectory, "public");

/** The React app's built files. */
export const webDirectory = path.resolve(workspaceRoot, "../web/dist");

/**
 * Files people create while using the site, outside the code so a deployment
 * can't touch them. A puzzle's media path, such as /puzzleData/riddle.png, is
 * relative to this.
 */
export const storageDirectory = path.resolve(workspaceRoot, "../../storage");

/** Uploaded puzzle media, served from /puzzleData. */
export const puzzleDataDirectory = path.join(storageDirectory, "puzzleData");

/** The optional .env file with configuration settings, for development. */
export const environmentFile = path.join(workspaceRoot, ".env");
