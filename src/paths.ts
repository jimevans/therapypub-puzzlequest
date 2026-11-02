import path from "path";

// Locations of files the application reads and writes at run time. They stay
// in src/ even when the application runs from compiled output in dist/, so
// paths are resolved from the project root rather than from this module.
// Both src/ and dist/ sit directly under the project root.
const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceDirectory = path.join(projectRoot, "src");

/** The EJS templates. */
export const viewsDirectory = path.join(sourceDirectory, "views");

/** Static files served to browsers. */
export const publicDirectory = path.join(sourceDirectory, "public");

/** Uploaded puzzle media, served from /puzzleData. */
export const puzzleDataDirectory = path.join(publicDirectory, "puzzleData");

/** The optional .env file with configuration settings. */
export const environmentFile = path.join(sourceDirectory, ".env");
