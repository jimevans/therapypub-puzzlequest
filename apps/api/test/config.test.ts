import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { getErrorMessage } from "../src/errors.js";

const required = {
  PQ_MONGODB_URI: "mongodb://localhost:27017/puzzlequest",
};

function parseError(environment: Record<string, string>): string {
  try {
    parseConfig(environment);
  } catch (err) {
    return getErrorMessage(err);
  }
  throw new Error("expected parseConfig to throw");
}

describe("parseConfig", () => {
  it("applies defaults when only the required settings are present", () => {
    const config = parseConfig(required);

    expect(config).toMatchObject({
      ...required,
      PQ_RUNTIME_ENVIRONMENT: "production",
      PQ_PORT: 3000,
      PQ_SMTP_PORT: 587,
      PQ_SMTP_SECURE: false,
    });
    expect(config.PQ_TRUST_PROXY).toBeUndefined();
    expect(config.PQ_BASE_URL).toBeUndefined();
  });

  it("reports a missing required setting", () => {
    const message = parseError({});

    expect(message).toContain("PQ_MONGODB_URI is required");
  });

  it("treats blank values as unset", () => {
    const config = parseConfig({
      ...required,
      PQ_TRUST_PROXY: "",
      PQ_SMTP_HOST: "  ",
      PQ_PORT: "",
    });

    expect(config.PQ_TRUST_PROXY).toBeUndefined();
    expect(config.PQ_SMTP_HOST).toBeUndefined();
    expect(config.PQ_PORT).toBe(3000);
  });

  it("rejects a MongoDB URI that is not a connection string", () => {
    expect(parseError({ ...required, PQ_MONGODB_URI: "localhost" })).toContain(
      "PQ_MONGODB_URI must be a mongodb://"
    );
    expect(
      parseConfig({ ...required, PQ_MONGODB_URI: "mongodb+srv://cluster/db" })
        .PQ_MONGODB_URI
    ).toBe("mongodb+srv://cluster/db");
  });

  it("rejects an invalid base URL", () => {
    expect(parseError({ ...required, PQ_BASE_URL: "not a url" })).toContain(
      "PQ_BASE_URL must be a URL"
    );
  });

  it.each([
    ["1", 1],
    ["2", 2],
    ["true", true],
    ["loopback", "loopback"],
    ["10.0.0.0/8", "10.0.0.0/8"],
  ])("converts PQ_TRUST_PROXY=%s for Express", (value, expected) => {
    expect(
      parseConfig({ ...required, PQ_TRUST_PROXY: value }).PQ_TRUST_PROXY
    ).toBe(expected);
  });

  it("converts numeric and boolean SMTP settings", () => {
    const config = parseConfig({
      ...required,
      PQ_SMTP_HOST: "smtp.example.com",
      PQ_SMTP_PORT: "465",
      PQ_SMTP_SECURE: "true",
      PQ_EMAIL_FROM: "PuzzleQuest <no-reply@example.com>",
    });

    expect(config.PQ_SMTP_PORT).toBe(465);
    expect(config.PQ_SMTP_SECURE).toBe(true);
  });

  it("rejects invalid port and boolean values", () => {
    const message = parseError({
      ...required,
      PQ_PORT: "http",
      PQ_SMTP_SECURE: "yes",
    });

    expect(message).toContain("PQ_PORT");
    expect(message).toContain('PQ_SMTP_SECURE must be "true" or "false"');
  });

  it("requires a sender address when SMTP is configured", () => {
    expect(
      parseError({ ...required, PQ_SMTP_HOST: "smtp.example.com" })
    ).toContain("PQ_EMAIL_FROM is required when PQ_SMTP_HOST is set");
  });

  describe("push notification settings", () => {
    const pem = (type: "ec" | "rsa") =>
      (type === "ec"
        ? generateKeyPairSync("ec", { namedCurve: "P-256" })
        : generateKeyPairSync("rsa", { modulusLength: 2048 })
      ).privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString();
    const appleKey = pem("ec");
    const googleKey = pem("rsa");
    const directory = mkdtempSync(join(tmpdir(), "puzzlequest-config-"));
    afterAll(() => rmSync(directory, { recursive: true, force: true }));

    /**
     * Writes a file for a setting to name.
     * @returns its path
     */
    const file = (name: string, contents: string) => {
      const path = join(directory, name);
      writeFileSync(path, contents);
      return path;
    };
    const serviceAccount = (privateKey: string) =>
      // Pretty-printed, as Firebase's download is.
      JSON.stringify(
        {
          type: "service_account",
          project_id: "puzzlequest",
          client_email: "sender@puzzlequest.iam.gserviceaccount.com",
          private_key: privateKey,
        },
        null,
        2
      );
    const apns = {
      PQ_APNS_KEY_FILE: file("AuthKey_KEY123.p8", appleKey),
      PQ_APNS_KEY_ID: "KEY123",
      PQ_APNS_TEAM_ID: "TEAM123",
      PQ_APNS_BUNDLE_ID: "com.example.app",
    };

    it("leaves sending off when none are set", () => {
      const config = parseConfig(required);

      expect(config.PQ_APNS_KEY_FILE).toBeUndefined();
      expect(config.PQ_FCM_SERVICE_ACCOUNT_FILE).toBeUndefined();
    });

    it("reads Apple's key from its file", () => {
      const config = parseConfig({ ...required, ...apns });

      expect(config.PQ_APNS_KEY_FILE).toEqual({
        path: apns.PQ_APNS_KEY_FILE,
        key: appleKey,
      });
    });

    it.each([
      [
        "without its first and last lines",
        appleKey.split("\n").slice(1, -2).join("\n"),
      ],
      ["cut short", appleKey.slice(0, 80)],
      ["an RSA key, not Apple's kind", googleKey],
    ])("refuses Apple's key %s", (name, key) => {
      const path = file(`${name}.p8`, key);

      const message = parseError({
        ...required,
        ...apns,
        PQ_APNS_KEY_FILE: path,
      });

      expect(message).toContain(
        `PQ_APNS_KEY_FILE must be Apple's .p8 key file; ${path} isn't one`
      );
    });

    it("refuses a key file that doesn't exist", () => {
      const path = join(directory, "missing.p8");

      const message = parseError({
        ...required,
        ...apns,
        PQ_APNS_KEY_FILE: path,
      });

      expect(message).toContain(
        `PQ_APNS_KEY_FILE names ${path}, which doesn't exist`
      );
    });

    it("refuses a key file that can't be read", () => {
      const message = parseError({
        ...required,
        ...apns,
        PQ_APNS_KEY_FILE: directory,
      });

      expect(message).toContain(
        `PQ_APNS_KEY_FILE names ${directory}, which can't be read (EISDIR)`
      );
    });

    it("needs all of Apple's settings once any is set", () => {
      const message = parseError({
        ...required,
        PQ_APNS_KEY_ID: "KEY123",
        PQ_APNS_BUNDLE_ID: "com.example.app",
      });

      expect(message).toContain(
        "PQ_APNS_KEY_FILE is required when any PQ_APNS_ setting is set"
      );
      expect(message).toContain(
        "PQ_APNS_TEAM_ID is required when any PQ_APNS_ setting is set"
      );
      expect(message).not.toContain("PQ_APNS_KEY_ID is required");
    });

    it("reads Firebase's service account key file as downloaded", () => {
      const path = file("service-account.json", serviceAccount(googleKey));

      const config = parseConfig({
        ...required,
        PQ_FCM_SERVICE_ACCOUNT_FILE: path,
      });

      expect(config.PQ_FCM_SERVICE_ACCOUNT_FILE).toEqual({
        path,
        account: {
          project_id: "puzzlequest",
          client_email: "sender@puzzlequest.iam.gserviceaccount.com",
          private_key: googleKey,
          token_uri: "https://oauth2.googleapis.com/token",
        },
      });
    });

    it.each([
      ["cut short", googleKey.slice(0, 80)],
      ["an elliptic-curve key, not Google's kind", appleKey],
    ])("refuses a service account whose key is %s", (name, key) => {
      const path = file(`${name}.json`, serviceAccount(key));

      const message = parseError({
        ...required,
        PQ_FCM_SERVICE_ACCOUNT_FILE: path,
      });

      expect(message).toContain(
        `PQ_FCM_SERVICE_ACCOUNT_FILE must be a Firebase service account's JSON key file; the private_key in ${path} isn't a readable RSA key`
      );
    });

    it.each([
      ["not JSON", "not json"],
      ["missing its key", JSON.stringify({ project_id: "puzzlequest" })],
    ])("refuses a service account file that's %s", (name, contents) => {
      const path = file(`${name}.json`, contents);

      const message = parseError({
        ...required,
        PQ_FCM_SERVICE_ACCOUNT_FILE: path,
      });

      expect(message).toContain(
        `PQ_FCM_SERVICE_ACCOUNT_FILE must be a Firebase service account's JSON key file, with project_id, client_email, and private_key; ${path} isn't one`
      );
    });

    it("refuses a service account file that doesn't exist", () => {
      const path = join(directory, "missing.json");

      const message = parseError({
        ...required,
        PQ_FCM_SERVICE_ACCOUNT_FILE: path,
      });

      expect(message).toContain(
        `PQ_FCM_SERVICE_ACCOUNT_FILE names ${path}, which doesn't exist`
      );
    });
  });
});
