import path from 'path';
import { fileURLToPath } from 'url';
import { config as environmentConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const result = environmentConfig({ 'path': `${__dirname}/.env` });

let config;

if (!('error' in result)) {
  console.log(`loaded config from ${__dirname}/.env`);
  config = result.parsed;
} else {
  console.log(`loaded config from process.env`);
  for (const key in process.env) {
    if (key.startsWith('PQ')) {
      config[key] = process.env[key];
    }
  }
}

export { config };
