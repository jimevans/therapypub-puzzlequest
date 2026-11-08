// What the browser tests share: where the server is, and ways to set up data
// and see what the server sent without going through a browser.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import twilio from "twilio";

/** Where wdio.conf.ts starts the application. */
export const BASE_URL = "http://localhost:3950";

/** The Twilio auth token the test server checks webhooks' signatures with. */
export const TWILIO_AUTH_TOKEN = "e2e-twilio-auth-token";

/** Where the test server's output goes, including the emails it would send. */
export const SERVER_LOG = path.join(tmpdir(), "puzzlequest-e2e-server.log");

/** What the QR code says that the fake camera shows (see wdio.conf.ts). */
export const SCANNED_CODE = "e2e-scanned-code";

/** The password of every account the tests create, unless they change it. */
export const PASSWORD = "a long enough password";

/**
 * The administrator wdio.conf.ts creates, by signing up and promoting the
 * account, as a new site gets its first one.
 */
export const ADMIN = "e2e-admin";

/**
 * Makes names unique, since each browser runs each spec against one server.
 * @param name the base of the name
 * @returns the name, with a suffix unique to this run of the spec
 */
export function unique(name: string): string {
  return `${name}-${Date.now().toString(36)}`;
}

/**
 * Calls the API.
 * @param method the HTTP method
 * @param apiPath the path below /api/v1
 * @param token the session token, if signed in
 * @param body the JSON body, if any
 * @returns the response
 */
async function call(
  method: string,
  apiPath: string,
  token?: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${BASE_URL}/api/v1${apiPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Calls the API as part of a test's setup, failing the test if it fails.
 * @param method the HTTP method
 * @param apiPath the path below /api/v1
 * @param token the session token, if signed in
 * @param body the JSON body, if any
 * @returns the response's JSON, if it has any
 */
export async function api(
  method: string,
  apiPath: string,
  token?: string,
  body?: unknown
): Promise<any> {
  const response = await call(method, apiPath, token, body);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${apiPath}: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : undefined;
}

/**
 * Starts a session without a browser, as an app would.
 * @param userName the user
 * @returns the session token
 */
export async function sessionToken(userName: string): Promise<string> {
  const session = await api("POST", "/sessions", undefined, {
    userName,
    password: PASSWORD,
    client: "native",
  });
  return session.token;
}

/**
 * Calls the quest's phone number, as Twilio reports a call: a signed webhook.
 * @param from the caller's number, in E.164 format
 * @returns what the caller hears, as TwiML
 */
export async function callQuestNumber(from: string): Promise<string> {
  const url = `${BASE_URL}/api/v1/webhooks/twilio/voice`;
  const fields = { From: from };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": twilio.getExpectedTwilioSignature(
        TWILIO_AUTH_TOKEN,
        url,
        fields
      ),
    },
    body: new URLSearchParams(fields),
  });
  if (!response.ok) {
    throw new Error(`The simulated call failed: ${response.status}`);
  }
  return response.text();
}

/**
 * Waits for a link in an email the server sent. With no mail server
 * configured, it logs each email instead.
 * @param to the address the email went to
 * @param linkPath the path of the link, such as /user/email/verify
 * @returns the link
 */
export async function emailedLink(
  to: string,
  linkPath: string
): Promise<string> {
  let link: string | undefined;
  await browser.waitUntil(
    () => {
      // The server logs each email it would send, in development, as the
      // message of a JSON log line.
      const emails = readFileSync(SERVER_LOG, "utf8")
        .split("\n")
        .flatMap((line) => {
          try {
            return [String((JSON.parse(line) as { msg?: unknown }).msg)];
          } catch {
            return [];
          }
        })
        .filter((message) => message.includes(`To: ${to}\n`));
      link = emails
        .flatMap((email) => email.match(/https?:\/\/\S+/g) ?? [])
        .findLast((url) => new URL(url).pathname === linkPath);
      return link !== undefined;
    },
    { timeoutMsg: `No email to ${to} with a link to ${linkPath}` }
  );
  return link as string;
}

/**
 * Signs in through the sign-in page.
 * @param userName the user
 * @param password the password
 */
export async function signIn(
  userName: string,
  password = PASSWORD
): Promise<void> {
  await browser.url("/login");
  await $("#user-name").setValue(userName);
  await $("#password").setValue(password);
  await $("#login").click();
}

/**
 * Selects the marker a page sets once the server is sending it live updates.
 * An update sent before then never reaches the page, so a test that expects
 * one must wait for this first.
 */
export const LIVE_UPDATES_CONNECTED = '[data-live-updates="connected"]';

/**
 * Records what the Content Security Policy blocks on every page from now on,
 * from before the page's own scripts run.
 */
export async function recordPolicyViolations(): Promise<void> {
  await browser.addInitScript(() => {
    const blocked: string[] = [];
    (window as unknown as { blockedByPolicy: string[] }).blockedByPolicy =
      blocked;
    document.addEventListener("securitypolicyviolation", (event) => {
      blocked.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
}

/**
 * Selects what the Content Security Policy has blocked on the page since it
 * loaded (see recordPolicyViolations).
 * @returns the blocked directives and addresses
 */
export async function blockedByPolicy(): Promise<string[]> {
  return browser.execute(
    () => (window as unknown as { blockedByPolicy: string[] }).blockedByPolicy
  );
}

/** axe-core's script, put into pages to check them. */
const AXE_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8"
);

/**
 * Checks the page as it is against WCAG 2.2 AA with axe-core, in the real
 * browser, where color contrast and the page's structure can be judged.
 * @returns each problem found, one line each: the rule, and where
 */
export async function accessibilityProblems(): Promise<string[]> {
  // Put in by the automation, which the page's security policy doesn't
  // govern; the page itself never loads it.
  await browser.execute(`if (!window.axe) { ${AXE_SOURCE} }`);
  return browser.execute(async () => {
    const results = await (
      window as unknown as {
        axe: {
          run(
            context: object,
            options: object
          ): Promise<{
            violations: {
              id: string;
              help: string;
              nodes: { target: string[] }[];
            }[];
          }>;
        };
      }
    ).axe.run(
      // React Aria's own announcer: see apps/web/src/test/accessibility.ts.
      { include: [document], exclude: ["[data-live-announcer]"] },
      {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      }
    );
    return results.violations.flatMap((violation) =>
      violation.nodes.map(
        (node) =>
          `${violation.id}: ${violation.help} (${node.target.join(" ")})`
      )
    );
  });
}

/**
 * Expects the page as it is to meet WCAG 2.2 AA, as far as axe-core can tell.
 */
export async function expectAccessible(): Promise<void> {
  expect(await accessibilityProblems()).toEqual([]);
}
