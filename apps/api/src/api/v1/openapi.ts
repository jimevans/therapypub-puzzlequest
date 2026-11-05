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
const DESCRIPTION = `PuzzleQuest's API, for its web pages and for apps.

Sign in with \`POST /sessions\`. A browser keeps the session in a cookie; an app asks for its token (\`"client": "native"\`) and sends it as \`Authorization: Bearer <token>\`. A request that changes something and is sent with the cookie must come from this site.

Lists come a page at a time: \`?limit=\` (default 50, at most 200) and \`?after=\`, the \`next\` value of the page before.

Clients follow a quest as it happens over the live-update websocket, \`/api/v1/updates\`. Anyone may connect. A client sends a \`LiveUpdateSubscription\` naming the quest; the server answers with its connection's ID, then sends a \`LiveUpdate\` for each change to that quest, naming the puzzle concerned where there is one. A client sends its connection's ID as \`connectionId\` with its own actions, so their updates aren't sent back to it. Both messages are described under the schemas. Updates can be missed, so a client should fetch the quest's state again each time it connects. Starting and resetting a quest send no update.

Errors are problem details (RFC 9457), sent as \`${PROBLEM_MEDIA_TYPE}\`. Act on their \`type\`, one of:

| Type | Status | When |
| --- | --- | --- |
${Object.values(Problems as Record<string, ProblemType>)
  .map(
    (problem) =>
      `| \`${problem.type}\` | ${problem.status} | ${problem.description} |`
  )
  .join("\n")}
| \`about:blank\` | 4xx | Any other HTTP error, such as a body too large to read; the title is the status's. |`;

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
    security:
      route.access === "public" ? [] : [{ sessionCookie: [] }, { bearer: [] }],
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
  return createDocument({
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
}
