// The download budgets, checked by `npm run size` after building. Each budget
// names a screen's source file, and the files it loads come from the build's own
// manifest, including any shared chunk, so nothing here can fall out of date as
// the bundler rearranges code.
import { existsSync, readFileSync } from "node:fs";

const MANIFEST = "dist/.vite/manifest.json";
if (!existsSync(MANIFEST)) {
  throw new Error(`${MANIFEST} is missing: run the build first`);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

/**
 * Finds the scripts that load as soon as a source file is needed: its own, and
 * what those import, but not what they load later on with import().
 * @param {string} source the file's key in the manifest
 * @param {Set<string>} files the files found so far
 * @returns {Set<string>} the built files
 */
function scriptsOf(source, files = new Set()) {
  const entry = manifest[source];
  if (!entry) {
    throw new Error(`${source} isn't in ${MANIFEST}`);
  }
  if (!files.has(entry.file)) {
    files.add(entry.file);
    for (const imported of entry.imports ?? []) {
      scriptsOf(imported, files);
    }
  }
  return files;
}

const firstLoad = scriptsOf("index.html");

const budget = (name, files, limit) => ({
  name,
  path: [...files].map((file) => `dist/${file}`),
  limit,
  gzip: true,
});

const onTopOfFirstLoad = (name, source, limit) =>
  budget(
    name,
    [...scriptsOf(source)].filter((file) => !firstLoad.has(file)),
    limit
  );

export default [
  budget("What every page downloads first", firstLoad, "116 KB"),
  onTopOfFirstLoad("The home screen", "src/screens/home/Home.tsx", "18 KB"),
  onTopOfFirstLoad(
    "The quest screen",
    "src/screens/quest/QuestScreen.tsx",
    "4 KB"
  ),
  onTopOfFirstLoad(
    "The puzzle screen",
    "src/screens/puzzle/PuzzleScreen.tsx",
    "23 KB"
  ),
  onTopOfFirstLoad(
    "A text puzzle's Markdown",
    "src/screens/puzzle/PuzzleText.tsx",
    "50 KB"
  ),
  onTopOfFirstLoad(
    "The QR code reader",
    "src/screens/puzzle/decodeQr.ts",
    "47 KB"
  ),
  onTopOfFirstLoad(
    "The sign-in screen",
    "src/screens/signIn/SignIn.tsx",
    "30 KB"
  ),
  // Already compressed, and only the Latin files download, by unicode-range.
  {
    name: "Fonts",
    path: "dist/assets/barlow*-latin-[0-9]*-normal-*.woff2",
    limit: "70 KB",
    gzip: false,
  },
];
