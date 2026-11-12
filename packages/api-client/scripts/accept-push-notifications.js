// Records what push notifications now carry in push-notifications.json,
// which the tests hold later versions to. Only additions are recorded: a
// change that would break an app written against the recorded schema is
// refused.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  pushNotificationBreakingChanges,
  pushNotificationSchemaOf,
} from "../src/compatibility.ts";

const file = (name) => new URL(`../${name}`, import.meta.url);
const read = (name) => JSON.parse(readFileSync(file(name), "utf8"));

const current = pushNotificationSchemaOf(read("openapi.json"));
if (existsSync(file("push-notifications.json"))) {
  const changes = pushNotificationBreakingChanges(
    read("push-notifications.json"),
    current
  );
  if (changes.length > 0) {
    console.error(
      "Not recorded: these changes would break apps written for version 1.\n" +
        changes.map((change) => `- ${change}`).join("\n")
    );
    process.exit(1);
  }
}
writeFileSync(
  file("push-notifications.json"),
  `${JSON.stringify(current, null, 2)}\n`
);
console.log("Recorded the push notifications in push-notifications.json.");
