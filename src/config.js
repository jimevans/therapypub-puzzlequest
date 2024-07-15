import path from "path";
import { fileURLToPath } from "url";
import { config as environmentConfig } from "dotenv";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const result = environmentConfig({ path: `${dirname}/.env` });

const config = "error" in result ? {} : result.parsed;

if ("error" in result) {
  console.log("loaded config from process.env");
  for (const key in process.env) {
    if (key.startsWith("PQ")) {
      config[key] = process.env[key];
    }
  }
} else {
  console.log(`loaded config from ${dirname}/.env`);
}

export { config };
