import path from "path";
import { config as loadEnvironmentFile } from "dotenv";
import { z } from "zod";

/**
 * Wraps a schema so that a missing or blank environment variable is treated
 * as unset, which lets `.optional()` and `.default()` apply to lines such as
 * `PQ_TRUST_PROXY=` in a .env file.
 * @param {z.ZodType} schema the schema for the variable's value
 * @returns {z.ZodType} the wrapped schema
 */
function setting(schema) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema
  );
}

/**
 * Converts PQ_TRUST_PROXY to the value Express expects for "trust proxy":
 * a hop count (e.g. "1"), true for "true", or a named or IP value such as
 * "loopback".
 * @param {string | undefined} value the configured value
 * @returns {number | boolean | string | undefined} the Express setting
 */
function parseTrustProxy(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

// The placeholder in .env.example is long enough to pass the length check, so
// it is rejected explicitly.
const EXAMPLE_SECRET_KEY = "replace-with-a-long-random-string";

const configSchema = z
  .object({
    // "development" disables secure cookies and logs emails to the console
    // when SMTP is not configured.
    PQ_RUNTIME_ENVIRONMENT: setting(z.string().default("production")),
    PQ_PORT: setting(z.coerce.number().int().min(1).max(65535).default(3000)),
    PQ_MONGODB_URI: setting(
      z
        .string({ error: "is required" })
        .regex(
          /^mongodb(\+srv)?:\/\//,
          "must be a mongodb:// or mongodb+srv:// connection string"
        )
    ),
    PQ_SECRET_KEY: setting(
      z
        .string({ error: "is required" })
        .min(
          32,
          "must be at least 32 characters (generate one with `openssl rand -base64 48`)"
        )
        .refine(
          (value) => value !== EXAMPLE_SECRET_KEY,
          "is still the placeholder from .env.example (generate one with `openssl rand -base64 48`)"
        )
    ),
    PQ_BASE_URL: setting(z.url("must be a URL").optional()),
    PQ_TRUST_PROXY: setting(z.string().optional().transform(parseTrustProxy)),

    PQ_SMTP_HOST: setting(z.string().optional()),
    PQ_SMTP_PORT: setting(
      z.coerce.number().int().min(1).max(65535).default(587)
    ),
    PQ_SMTP_SECURE: setting(
      z
        .enum(["true", "false"], { error: 'must be "true" or "false"' })
        .default("false")
        .transform((value) => value === "true")
    ),
    PQ_SMTP_USER: setting(z.string().optional()),
    PQ_SMTP_PASSWORD: setting(z.string().optional()),
    PQ_EMAIL_FROM: setting(z.string().optional()),

    PQ_TWILIO_ACCOUNT_SID: setting(z.string().optional()),
    PQ_TWILIO_AUTH_TOKEN: setting(z.string().optional()),
    PQ_TWILIO_MESSAGING_SERVICE_ID: setting(z.string().optional()),
  })
  .superRefine((settings, context) => {
    if (settings.PQ_SMTP_HOST && !settings.PQ_EMAIL_FROM) {
      context.addIssue({
        code: "custom",
        path: ["PQ_EMAIL_FROM"],
        message: "is required when PQ_SMTP_HOST is set",
      });
    }
  });

/**
 * Validates configuration settings and converts them to their typed values.
 * @param {Record<string, string | undefined>} environment the raw settings,
 *  usually process.env
 * @returns {z.infer<typeof configSchema>} the validated configuration
 * @throws {Error} if any setting is missing or invalid; the message lists
 *  every problem
 */
export function parseConfig(environment) {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  ${issue.path.join(".")} ${issue.message}`
    );
    throw new Error(
      `Invalid PuzzleQuest configuration:\n${problems.join("\n")}\n` +
        "See src/.env.example for the available settings."
    );
  }
  return result.data;
}

// Settings come from environment variables, with src/.env (if present) filling
// in any that are not set. Tests supply their own settings (see
// vitest.config.js), so a developer's .env never affects them.
if (process.env.NODE_ENV !== "test") {
  const environmentFile = path.join(import.meta.dirname, ".env");
  const result = loadEnvironmentFile({ path: environmentFile });
  console.log(
    "error" in result
      ? "loaded config from process.env"
      : `loaded config from ${environmentFile} and process.env`
  );
}

const config = parseConfig(process.env);

export { config };
