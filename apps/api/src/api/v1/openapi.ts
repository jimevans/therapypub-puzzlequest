// The OpenAPI 3.1 description of the v1 API, generated from the routes'
// definitions and schemas.
import {
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
  type ZodOpenApiResponseObject,
  type ZodOpenApiResponsesObject,
  createDocument,
} from "zod-openapi";
import {
  PROBLEM_MEDIA_TYPE,
  Problems,
  type ProblemType,
  problemSchema,
} from "../problems.js";
import {
  liveUpdateSchema,
  liveUpdateSubscriptionSchema,
} from "../../schemas/liveUpdates.js";
import { type AnyRoute, problemsOf } from "./route.js";

/** The version of the v1 API's description, for clients' caches. */
export const API_VERSION = "1.0.0";

/** The API's description, with the problem types it reports. */
const DESCRIPTION = `PuzzleQuest's API, for its web pages and for apps. This description is at \`/api/v1/openapi.json\`, and shown as a reference at \`/api/v1/docs\`.

Sign in with \`POST /sessions\`. A browser keeps the session in a cookie; an app asks for its token (\`"client": "native"\`) and sends it as \`Authorization: Bearer <token>\`. A request that changes something and is sent with the cookie must come from this site.

Lists come a page at a time: \`?limit=\` (default 50, at most 200) and \`?after=\`, the \`next\` value of the page before.

Names and values follow the same conventions throughout. Things are named in paths and bodies as \`questName\`, \`puzzleName\`, \`teamName\`, and \`userName\`; a quest's stop is named by its puzzle's \`puzzleName\`. Enumerated values, such as statuses, roles, and event types, are camelCase strings. A field whose value isn't set, such as a time that hasn't come yet, is present with the value \`null\`; a field is absent only when the caller isn't allowed to see it, as each such field's description says. Units are in names: \`timePenaltySeconds\`, \`elapsedMs\`.

Version 1.0 can gain fields, enumerated values, problem types, and live-update messages without a new version. Clients must ignore fields they don't recognise, and treat a value they don't recognise sensibly, such as an unknown status as unknown, rather than failing; the schemas here describe this version's responses exactly.

Clients follow a quest as it happens over the live-update websocket, \`/api/v1/updates\`. Anyone may connect. A client sends a \`LiveUpdateSubscription\` naming the quest, with a ticket from \`POST /quests/{questName}/live-tickets\`; the server answers with its connection's ID, then sends a \`LiveUpdate\` for each change to that quest, naming the puzzle concerned where there is one. A client sends its connection's ID as \`connectionId\` with its own actions, so their updates aren't sent back to it. Each update names the entry whose progress changed (\`entryId\`). While a quest is a race that not every entry has finished, a connection is sent an update's content only if its ticket was issued to staff, an administrator, or a player of that entry; every other connection is sent \`questUpdated\` with the entry's ID instead, and fetches what it shows again. Starting and resetting a quest send no update to its followers. A player's home screen instead names the user, with a ticket from \`POST /users/{userName}/live-tickets\`, and is sent \`questsChanged\` whenever the list of quests they play should be fetched again, starting and resetting included. Both messages are described under the schemas. Updates can be missed, so a client should fetch what it follows again each time it connects.

Errors are problem details (RFC 9457), sent as \`${PROBLEM_MEDIA_TYPE}\`. Act on their \`type\`, one of:

| Type | Status | When |
| --- | --- | --- |
${Object.values(Problems as Record<string, ProblemType>)
  .map(
    (problem) =>
      `| \`${problem.type}\` | ${problem.status} | ${problem.description} |`
  )
  .join("\n")}
| \`about:blank\` | 4xx | Any other HTTP error, such as a body that isn't valid JSON; the title is the status's. |`;

/**
 * Describes a route's responses: its successes, and its problems, grouped
 * by status code.
 * @param route the route
 * @returns the responses
 */
function describeResponses(route: AnyRoute): ZodOpenApiResponsesObject {
  const responses: Record<string, ZodOpenApiResponseObject> = {};
  for (const [status, response] of Object.entries(route.responses)) {
    responses[status] = {
      description: response.description,
      ...(response.body
        ? {
            content: {
              [response.mediaType ?? "application/json"]: {
                schema: response.body,
              },
            },
          }
        : {}),
      ...(response.headers
        ? {
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([name, header]) => [
                name,
                { description: header.description, schema: { type: "string" } },
              ])
            ),
          }
        : {}),
    };
  }
  const byStatus = new Map<number, ProblemType[]>();
  for (const problem of [...problemsOf(route), Problems.unexpected]) {
    byStatus.set(problem.status, [
      ...(byStatus.get(problem.status) ?? []),
      problem,
    ]);
  }
  for (const [status, problems] of byStatus) {
    responses[String(status)] = {
      description: problems
        .map((problem) => `${problem.type}: ${problem.title}.`)
        .join(" "),
      content: { [PROBLEM_MEDIA_TYPE]: { schema: problemSchema } },
    };
  }
  return responses as ZodOpenApiResponsesObject;
}

/**
 * Describes a route as an OpenAPI operation.
 * @param route the route
 * @returns the operation
 */
function describeOperation(route: AnyRoute): ZodOpenApiOperationObject {
  const { body, query, params, multipart, bodyMediaType } = route.request ?? {};
  return {
    operationId: route.operationId,
    summary: route.summary,
    ...(route.description ? { description: route.description } : {}),
    tags: route.tags,
    security: route.acceptsShareLink
      ? [{}, { shareLink: [] }, { sessionCookie: [] }, { bearer: [] }]
      : route.access === "public"
        ? []
        : [{ sessionCookie: [] }, { bearer: [] }],
    ...(query || params
      ? {
          requestParams: {
            ...(query ? { query } : {}),
            ...(params ? { path: params } : {}),
          },
        }
      : {}),
    ...(body || multipart
      ? {
          requestBody: {
            required: true,
            content: {
              ...(body
                ? { [bodyMediaType ?? "application/json"]: { schema: body } }
                : {}),
              ...(multipart
                ? { "multipart/form-data": { schema: multipart } }
                : {}),
            },
          },
        }
      : {}),
    responses: describeResponses(route),
  };
}

/**
 * Leaves out the component schemas nothing refers to. The live-update
 * messages, which no route returns, are rendered both as input and output,
 * so the schemas they share with responses would otherwise appear twice.
 * @param document the document
 * @param kept the components to keep even though nothing refers to them
 * @returns the document
 */
function withoutUnusedSchemas<
  D extends { components?: { schemas?: Record<string, unknown> } },
>(document: D, kept: readonly string[]): D {
  const schemas = document.components?.schemas;
  if (!schemas) {
    return document;
  }
  for (;;) {
    const text = JSON.stringify(document);
    const unused = Object.keys(schemas).filter(
      (name) =>
        !kept.includes(name) && !text.includes(`"#/components/schemas/${name}"`)
    );
    if (!unused.length) {
      return document;
    }
    for (const name of unused) {
      delete schemas[name];
    }
  }
}

/**
 * Creates the OpenAPI document describing routes.
 * @param routes the v1 routes
 * @returns the document
 */
export function createOpenApiDocument(
  routes: AnyRoute[]
): ReturnType<typeof createDocument> {
  const paths: ZodOpenApiPathsObject = {};
  for (const route of routes.filter((r) => r.documented !== false)) {
    paths[route.path] = {
      ...paths[route.path],
      [route.method]: describeOperation(route),
    };
  }
  const document = createDocument({
    openapi: "3.1.0",
    info: {
      title: "PuzzleQuest API",
      version: API_VERSION,
      description: DESCRIPTION,
    },
    servers: [{ url: "/api/v1" }],
    paths,
    components: {
      // The live-update websocket's messages, which no route returns.
      schemas: {
        LiveUpdate: liveUpdateSchema,
        LiveUpdateSubscription: liveUpdateSubscriptionSchema,
      },
      securitySchemes: {
        shareLink: {
          type: "apiKey",
          in: "header",
          name: "X-Share-Token",
          description:
            "A share link's token, which lets its holder follow a private quest.",
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "pq-session",
          description: "The session cookie a browser gets on signing in.",
        },
        bearer: {
          type: "http",
          scheme: "bearer",
          description:
            'The session token an app gets on signing in with client "native".',
        },
      },
    },
  });
  return withoutUnusedSchemas(document, [
    "LiveUpdate",
    "LiveUpdateSubscription",
  ]);
}
