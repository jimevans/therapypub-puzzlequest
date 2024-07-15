import path from "path";
import { fileURLToPath } from "url";
import { config as environmentConfig } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const result = environmentConfig({ path: `${__dirname}/.env` });

const config = "error" in result ? {} : result.parsed;

if ("error" in result) {
  console.log("loaded config from process.env");
  for (const key in process.env) {
    if (key.startsWith("PQ")) {
      console.loq(`loading environment variable: ${key}=${process.env[key]}`);
      config[key] = process.env[key];
    }
  }
} else {
  console.log(`loaded config from ${__dirname}/.env`);
}

export { config };
