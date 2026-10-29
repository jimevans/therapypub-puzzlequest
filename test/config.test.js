import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

const required = {
  PQ_MONGODB_URI: "mongodb://localhost:27017/puzzlequest",
  PQ_SECRET_KEY: "a-secret-key-that-is-at-least-32-characters",
};

function parseError(environment) {
  try {
    parseConfig(environment);
  } catch (err) {
    return err.message;
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

  it("reports every missing required setting at once", () => {
    const message = parseError({});

    expect(message).toContain("PQ_MONGODB_URI is required");
    expect(message).toContain("PQ_SECRET_KEY is required");
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

  it("rejects a short secret key", () => {
    expect(parseError({ ...required, PQ_SECRET_KEY: "too-short" })).toContain(
      "PQ_SECRET_KEY must be at least 32 characters"
    );
  });

  it("rejects the placeholder secret key from .env.example", () => {
    expect(
      parseError({
        ...required,
        PQ_SECRET_KEY: "replace-with-a-long-random-string",
      })
    ).toContain("PQ_SECRET_KEY is still the placeholder");
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
});
