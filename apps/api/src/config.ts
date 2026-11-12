import { config as loadEnvironmentFile } from "dotenv";
import { z } from "zod";
import { environmentFile } from "./paths.js";

/**
 * Wraps a schema so that a missing or blank environment variable is treated
 * as unset, which lets `.optional()` and `.default()` apply to lines such as
 * `PQ_TRUST_PROXY=` in a .env file.
 * @param schema the schema for the variable's value
 * @returns the wrapped schema
 */
function setting<T extends z.ZodType>(schema: T) {
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
 * @param value the configured value
 * @returns the Express setting
 */
function parseTrustProxy(
  value: string | undefined
): number | boolean | string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

/** The parts of a Firebase service account's JSON key that sending uses. */
const fcmServiceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.url().default("https://oauth2.googleapis.com/token"),
});

/** A Firebase service account's key, as sending uses it. */
export type FcmServiceAccount = z.infer<typeof fcmServiceAccountSchema>;

/**
 * Parses JSON, giving undefined instead of throwing for malformed text.
 * @param json the text
 * @returns the value, or undefined
 */
function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

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
    PQ_BASE_URL: setting(z.url("must be a URL").optional()),
    PQ_TRUST_PROXY: setting(z.string().optional().transform(parseTrustProxy)),
    // The least severe entries the log keeps.
    PQ_LOG_LEVEL: setting(
      z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"], {
          error:
            "must be one of fatal, error, warn, info, debug, trace, or silent",
        })
        .default("info")
    ),

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

    // Push notifications to the iOS app, through Apple's service (APNs): the
    // signing key's contents (the .p8 file, whose line breaks may be written
    // as \n), its key ID, the Apple Developer team's ID, and the app's bundle
    // ID. All four, or none, which turns sending to iPhones off.
    PQ_APNS_KEY: setting(
      z
        .string()
        .optional()
        .transform((key) => key?.replaceAll("\\n", "\n"))
    ),
    PQ_APNS_KEY_ID: setting(z.string().optional()),
    PQ_APNS_TEAM_ID: setting(z.string().optional()),
    PQ_APNS_BUNDLE_ID: setting(z.string().optional()),
    // Push notifications to the Android app, through Firebase Cloud
    // Messaging: the contents of a Firebase service account's JSON key file.
    // Unset, sending to Android phones is off.
    PQ_FCM_SERVICE_ACCOUNT: setting(
      z
        .string()
        .optional()
        .transform((json, context) => {
          if (json === undefined) {
            return undefined;
          }
          const parsed = fcmServiceAccountSchema.safeParse(parseJson(json));
          if (!parsed.success) {
            context.addIssue({
              code: "custom",
              message:
                "must be a Firebase service account's JSON key, with project_id, client_email, and private_key",
            });
            return z.NEVER;
          }
          return parsed.data;
        })
    ),
  })
  .superRefine((settings, context) => {
    if (settings.PQ_SMTP_HOST && !settings.PQ_EMAIL_FROM) {
      context.addIssue({
        code: "custom",
        path: ["PQ_EMAIL_FROM"],
        message: "is required when PQ_SMTP_HOST is set",
      });
    }
    const apns = [
      "PQ_APNS_KEY",
      "PQ_APNS_KEY_ID",
      "PQ_APNS_TEAM_ID",
      "PQ_APNS_BUNDLE_ID",
    ] as const;
    if (apns.some((name) => settings[name])) {
      for (const name of apns.filter((name) => !settings[name])) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "is required when any PQ_APNS_ setting is set",
        });
      }
    }
  });

/** The validated application configuration. */
export type Config = z.infer<typeof configSchema>;

/**
 * Validates configuration settings and converts them to their typed values.
 * @param environment the raw settings, usually process.env
 * @returns the validated configuration
 * @throws {Error} if any setting is missing or invalid; the message lists
 *  every problem
 */
export function parseConfig(
  environment: Record<string, string | undefined>
): Config {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  ${issue.path.join(".")} ${issue.message}`
    );
    throw new Error(
      `Invalid PuzzleQuest configuration:\n${problems.join("\n")}\n` +
        "See apps/api/.env.example for the available settings."
    );
  }
  return result.data;
}

// Settings come from environment variables, with apps/api/.env (if present) filling
// in any that are not set. Tests supply their own settings (see
// vitest.config.js), so a developer's .env never affects them.
/** Where the settings came from, for the log when the server starts. */
export let configSource = "process.env";
if (process.env.NODE_ENV !== "test") {
  // quiet: the server logs where its settings came from instead.
  const result = loadEnvironmentFile({ path: environmentFile, quiet: true });
  if (!("error" in result)) {
    configSource = `${environmentFile} and process.env`;
  }
}

export const config: Config = parseConfig(process.env);
