// Records the live-update messages as they now are in live-updates.json, which
// the tests hold later versions to. Only additions are recorded: a change
// that would break a client written against the recorded messages is refused.
import { readFileSync, writeFileSync } from "node:fs";
import {
  liveUpdateBreakingChanges,
  liveUpdateSchemasOf,
} from "../src/compatibility.ts";

const read = (file) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

const recorded = read("live-updates.json");
const current = liveUpdateSchemasOf(read("openapi.json"));
const changes = liveUpdateBreakingChanges(recorded, current);
if (changes.length > 0) {
  console.error(
    "Not recorded: these changes would break clients of version 1.\n" +
      changes.map((change) => `- ${change}`).join("\n")
  );
  process.exit(1);
}
writeFileSync(
  new URL("../live-updates.json", import.meta.url),
  `${JSON.stringify(current, null, 2)}\n`
);
console.log("Recorded the live updates in live-updates.json.");
