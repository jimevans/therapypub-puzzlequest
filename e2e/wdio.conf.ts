// Browser tests of the main journeys, driven by WebdriverIO over WebDriver
// BiDi, in Chrome and Firefox (`npm run test:e2e`). They run against the built
// application with an in-memory database. NODE_ENV=test keeps a developer's
// apps/api/.env out of it, so no real email or text message can be sent.
import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  ADMIN,
  BASE_URL,
  PASSWORD,
  SERVER_LOG,
  TWILIO_AUTH_TOKEN,
  api,
} from "./support.js";

const APPLICATION = path.join(import.meta.dirname, "../apps/api/dist/app.js");

let mongoServer: MongoMemoryServer | undefined;
let server: ChildProcess | undefined;

/**
 * Waits for the application to answer.
 */
async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE_URL}/api/v1/openapi.json`)).ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`The application didn't start; see ${SERVER_LOG}`);
}

const chrome = {
  browserName: "chrome",
  webSocketUrl: true,
  "goog:chromeOptions": {
    args: [
      "--headless=new",
      "--window-size=1280,900",
      // GitHub's runners don't allow Chrome's sandbox.
      ...(process.env.CI ? ["--no-sandbox"] : []),
    ],
  },
};

const firefox = {
  browserName: "firefox",
  webSocketUrl: true,
  "moz:firefoxOptions": {
    args: ["-headless", "-width=1280", "-height=900"],
  },
};

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: path.join(import.meta.dirname, "tsconfig.json"),
  specs: [path.join(import.meta.dirname, "specs/**/*.e2e.ts")],
  // One browser at a time: they share the server and its rate limits.
  maxInstances: 1,
  // E2E_BROWSER=chrome or firefox runs just that one.
  capabilities: [chrome, firefox].filter(
    ({ browserName }) =>
      !process.env.E2E_BROWSER || browserName === process.env.E2E_BROWSER
  ),
  baseUrl: BASE_URL,
  logLevel: "error",
  waitforTimeout: 10000,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 120000 },

  async onPrepare() {
    mongoServer = await MongoMemoryServer.create();
    const log = openSync(SERVER_LOG, "w");
    server = spawn(process.execPath, [APPLICATION], {
      stdio: ["ignore", log, log],
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        PQ_RUNTIME_ENVIRONMENT: "development",
        PQ_MONGODB_URI: mongoServer.getUri("puzzlequest"),
        PQ_PORT: new URL(BASE_URL).port,
        PQ_BASE_URL: BASE_URL,
        PQ_TWILIO_AUTH_TOKEN: TWILIO_AUTH_TOKEN,
      },
    });
    closeSync(log);
    await waitForServer();
    // The first account to sign up becomes an administrator.
    await api("POST", "/users", undefined, {
      userName: ADMIN,
      displayName: "E2E Admin",
      email: "e2e-admin@example.com",
      password: PASSWORD,
    });
  },

  async onComplete() {
    server?.kill();
    await mongoServer?.stop();
  },

  // The point is to test over BiDi, so don't let a session quietly fall back
  // to classic WebDriver.
  before() {
    if (!browser.isBidi) {
      throw new Error("This session isn't using WebDriver BiDi");
    }
  },
};
