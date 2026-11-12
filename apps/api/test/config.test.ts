import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
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
        .toString()
        .trim();
    const appleKey = pem("ec");
    const googleKey = pem("rsa");
    const serviceAccount = (privateKey: string) =>
      JSON.stringify({
        type: "service_account",
        project_id: "puzzlequest",
        client_email: "sender@puzzlequest.iam.gserviceaccount.com",
        private_key: privateKey,
      });
    const apns = {
      PQ_APNS_KEY: appleKey.replaceAll("\n", "\\n"),
      PQ_APNS_KEY_ID: "KEY123",
      PQ_APNS_TEAM_ID: "TEAM123",
      PQ_APNS_BUNDLE_ID: "com.example.app",
    };

    it("leaves sending off when none are set", () => {
      const config = parseConfig(required);

      expect(config.PQ_APNS_KEY).toBeUndefined();
      expect(config.PQ_FCM_SERVICE_ACCOUNT).toBeUndefined();
    });

    it("takes Apple's key with its line breaks written as \\n", () => {
      const config = parseConfig({ ...required, ...apns });

      expect(config.PQ_APNS_KEY).toBe(appleKey);
    });

    it("takes Apple's key with its line breaks kept", () => {
      const config = parseConfig({
        ...required,
        ...apns,
        PQ_APNS_KEY: appleKey,
      });

      expect(config.PQ_APNS_KEY).toBe(appleKey);
    });

    it.each([
      [
        "without its first and last lines",
        appleKey.split("\n").slice(1, -1).join("\n"),
      ],
      ["with its line breaks made spaces", appleKey.replaceAll("\n", " ")],
      ["cut short", appleKey.slice(0, 80)],
      ["an RSA key, not Apple's kind", googleKey],
    ])("refuses Apple's key %s", (_, key) => {
      const message = parseError({ ...required, ...apns, PQ_APNS_KEY: key });

      expect(message).toContain(
        "PQ_APNS_KEY must be the contents of Apple's .p8 key file"
      );
    });

    it("needs all of Apple's settings once any is set", () => {
      const message = parseError({
        ...required,
        PQ_APNS_KEY_ID: "KEY123",
        PQ_APNS_BUNDLE_ID: "com.example.app",
      });

      expect(message).toContain(
        "PQ_APNS_KEY is required when any PQ_APNS_ setting is set"
      );
      expect(message).toContain(
        "PQ_APNS_TEAM_ID is required when any PQ_APNS_ setting is set"
      );
      expect(message).not.toContain("PQ_APNS_KEY_ID is required");
    });

    it("reads Firebase's service account key", () => {
      const config = parseConfig({
        ...required,
        PQ_FCM_SERVICE_ACCOUNT: serviceAccount(googleKey),
      });

      expect(config.PQ_FCM_SERVICE_ACCOUNT).toEqual({
        project_id: "puzzlequest",
        client_email: "sender@puzzlequest.iam.gserviceaccount.com",
        private_key: googleKey,
        token_uri: "https://oauth2.googleapis.com/token",
      });
    });

    it.each([
      ["cut short", googleKey.slice(0, 80)],
      ["an elliptic-curve key, not Google's kind", appleKey],
    ])("refuses a service account whose key is %s", (_, key) => {
      const message = parseError({
        ...required,
        PQ_FCM_SERVICE_ACCOUNT: serviceAccount(key),
      });

      expect(message).toContain(
        "PQ_FCM_SERVICE_ACCOUNT must be a Firebase service account's JSON key; its private_key isn't a readable RSA key"
      );
    });

    it.each(["not json", JSON.stringify({ project_id: "puzzlequest" })])(
      "refuses a service account key that isn't one: %s",
      (value) => {
        const message = parseError({
          ...required,
          PQ_FCM_SERVICE_ACCOUNT: value,
        });

        expect(message).toContain(
          "PQ_FCM_SERVICE_ACCOUNT must be a Firebase service account's JSON key"
        );
      }
    );
  });
});
