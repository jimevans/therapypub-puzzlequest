// Answers for tests to fake from the API client, shaped as openapi-fetch
// returns them. Every faked answer is checked against the API's description
// after each test (see setup.ts), so these build complete ones.
import type { Schemas } from "@puzzlequest/api-client";
import description from "@puzzlequest/api-client/openapi.json" with { type: "json" };

/** The status of each problem type, from the table in the description. */
const STATUS_OF_PROBLEM = new Map(
  [
    ...description.info.description.matchAll(
      /\| `(\/problems\/[\w-]+)` \| (\d+) \|/g
    ),
  ].map(([, type, status]) => [type, Number(status)])
);

/**
 * A successful answer.
 * @param data the body, if there is one
 * @param status the status
 * @returns the answer
 */
export function ok(data?: unknown, status = 200) {
  return { data, response: new Response(null, { status }) };
}

/**
 * A refusal: a problem, with its type's status.
 * @param type the problem's type, without /problems/, such as "not-found"
 * @param detail what went wrong
 * @param errors for an invalid request, each problem with it
 * @returns the answer
 */
export function refusal(
  type: string,
  detail = "Refused",
  errors?: Schemas["FieldError"][]
) {
  const status = STATUS_OF_PROBLEM.get(`/problems/${type}`);
  if (status === undefined) {
    throw new Error(`The API has no problem of type /problems/${type}`);
  }
  return {
    error: {
      type: `/problems/${type}`,
      title: "Refused",
      status,
      detail,
      ...(errors ? { errors } : {}),
    },
    response: new Response(null, { status }),
  };
}

/** The answer when nobody's signed in, or their session has ended. */
export function signedOut() {
  return refusal("sign-in-required", "Sign in to do this");
}

/** The answer when something went wrong on the server. */
export function serverError() {
  return refusal("unexpected", "An unexpected error occurred");
}

/**
 * A user, as the API describes one.
 * @param fields what differs from a verified player
 * @returns the user
 */
export function aUser(fields: Partial<Schemas["User"]> = {}): Schemas["User"] {
  return {
    id: "1",
    userName: "player",
    displayName: "The Player",
    email: "player@example.com",
    emailVerified: true,
    phone: "",
    sms: false,
    role: "player",
    ...fields,
  };
}

/** A team that plays quests in tests, as an entrant. */
export const THE_REDS = {
  kind: "team",
  name: "reds",
  displayName: "The Reds",
} as const;

/**
 * A quest played by one team or player, from its definition and its one
 * entry's progress written side by side, as quests were before they could
 * have several entries.
 * @param quest the quest's name and display name, its visibility if any, and
 *  the entry's status, progress and puzzles
 * @param entrant who plays it
 * @param id the entry's ID
 * @returns the quest, with its one entry
 */
export function withOneEntry<
  Quest extends { questName: string; displayName: string; visibility?: string },
>(quest: Quest, entrant: object = THE_REDS, id = "entry-1") {
  const { questName, displayName, visibility, ...entry } = quest;
  return {
    questName,
    displayName,
    ...(visibility === undefined ? {} : { visibility }),
    entries: [{ id, entrant, ...entry }],
  };
}
