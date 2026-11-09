// Browser tests of the main journeys, driven by WebdriverIO over WebDriver
// BiDi, in Chrome and Firefox (`npm run test:e2e`). They run against the built
// application with an in-memory database. NODE_ENV=test keeps a developer's
// apps/api/.env out of it, so no real email or text message can be sent.
import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import QRCode from "qrcode";
import {
  ADMIN,
  BASE_URL,
  PASSWORD,
  SCANNED_CODE,
  SERVER_LOG,
  TWILIO_AUTH_TOKEN,
  api,
} from "./support.js";

const APPLICATION = path.join(import.meta.dirname, "../apps/api/dist/app.js");
const ADMIN_COMMANDS = path.join(
  import.meta.dirname,
  "../apps/api/dist/admin/cli.js"
);

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

/** The video the fake camera plays: one frame, a QR code, over and over. */
const FAKE_CAMERA_VIDEO = path.join(tmpdir(), "puzzlequest-e2e-camera.y4m");

/**
 * Writes the fake camera's video, in the uncompressed format Chrome reads.
 * @param text what the QR code in it says
 */
function writeFakeCameraVideo(text: string): void {
  const WIDTH = 640;
  const HEIGHT = 480;
  const SCALE = 8;
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = modules.size * SCALE;
  const left = Math.floor((WIDTH - size) / 2);
  const top = Math.floor((HEIGHT - size) / 2);
  const WHITE = 235;
  const BLACK = 16;
  const brightness = Buffer.alloc(WIDTH * HEIGHT, WHITE);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules.get(Math.floor(y / SCALE), Math.floor(x / SCALE))) {
        brightness[(top + y) * WIDTH + left + x] = BLACK;
      }
    }
  }
  const NO_COLOR = 128;
  writeFileSync(
    FAKE_CAMERA_VIDEO,
    Buffer.concat([
      Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420\nFRAME\n`),
      brightness,
      Buffer.alloc((WIDTH * HEIGHT) / 2, NO_COLOR),
    ])
  );
}

const SPECS = path.join(import.meta.dirname, "specs/**/*.e2e.ts");
const CAMERA_SPECS = path.join(import.meta.dirname, "camera-specs/**/*.e2e.ts");

const chromeArguments = [
  "--headless=new",
  "--window-size=1280,900",
  // GitHub's runners don't allow Chrome's sandbox.
  ...(process.env.CI ? ["--no-sandbox"] : []),
];

// The camera is refused, so that no test waits on a permission prompt or on a
// developer's own camera, and the fall-back to typing is what every test uses.
const chrome = {
  browserName: "chrome",
  webSocketUrl: true,
  "goog:chromeOptions": {
    args: chromeArguments,
    prefs: { "profile.default_content_setting_values.media_stream_camera": 2 },
  },
};

const firefox = {
  browserName: "firefox",
  webSocketUrl: true,
  "moz:firefoxOptions": {
    args: ["-headless", "-width=1280", "-height=900"],
    // E2E_FIREFOX_BINARY runs a particular Firefox, such as one downloaded with
    // `npx @puppeteer/browsers install firefox@159.0`.
    ...(process.env.E2E_FIREFOX_BINARY
      ? { binary: process.env.E2E_FIREFOX_BINARY }
      : {}),
    prefs: { "permissions.default.camera": 2 },
  },
};

// Scanning, with a camera that shows a QR code. Firefox can't be given a chosen
// picture, so it's only in Chrome, in a session of its own, because this camera
// would try its code on every puzzle the other tests open.
const chromeWithCamera = {
  browserName: "chrome",
  webSocketUrl: true,
  "wdio:specs": [CAMERA_SPECS],
  "wdio:exclude": [SPECS],
  "goog:chromeOptions": {
    args: [
      ...chromeArguments,
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${FAKE_CAMERA_VIDEO}`,
    ],
  },
};

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: path.join(import.meta.dirname, "tsconfig.json"),
  specs: [SPECS],
  // One browser at a time: they share the server and its rate limits.
  maxInstances: 1,
  // E2E_BROWSER=chrome or firefox runs just that one.
  capabilities: [chrome, chromeWithCamera, firefox].filter(
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
    writeFakeCameraVideo(SCANNED_CODE);
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
    // An administrator, made as a new site's first one is: by signing up,
    // then promoting the account. Run without blocking, since this process
    // hosts the database, which stalls if its output isn't read.
    await api("POST", "/users", undefined, {
      userName: ADMIN,
      displayName: "E2E Admin",
      email: "e2e-admin@example.com",
      password: PASSWORD,
    });
    const promote = spawn(
      process.execPath,
      [ADMIN_COMMANDS, "promote", ADMIN],
      {
        stdio: "inherit",
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          PQ_MONGODB_URI: mongoServer.getUri("puzzlequest"),
        },
      }
    );
    const code = await new Promise((resolve) => promote.on("exit", resolve));
    if (code !== 0) {
      throw new Error(`Promoting ${ADMIN} failed (exit code ${String(code)})`);
    }
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
