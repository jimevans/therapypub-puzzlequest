// Checks responses against the API's OpenAPI description, the contract every
// client relies on. The server's tests check what it really sends; the web
// app's tests check the answers they fake for its screens. For tests only:
// Ajv isn't part of the client apps download.
import { Ajv2020 } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";

// ajv-formats is CommonJS: its default import is the plugin under a bundler,
// and the module, with the plugin as its default, under Node's resolution.
type FormatsPlugin = (ajv: Ajv2020) => unknown;
const formats = ajvFormats as unknown as FormatsPlugin & {
  default?: FormatsPlugin;
};
const addFormats = formats.default ?? formats;

/** One answer from the API: what was asked, and what came back. */
export interface Exchange {
  /** The HTTP method, in any letter case. */
  method: string;
  /** The path as the description writes it, such as /users/{userName}. */
  path: string;
  status: number;
  /** The response's media type, without parameters such as charset. */
  mediaType?: string;
  /** The response's body, parsed if it's JSON; undefined if there's none. */
  body?: unknown;
}

/** A contract made from an OpenAPI description. */
export interface Contract {
  /**
   * Finds the path, as the description writes it, that a request's path
   * matches.
   * @param requestPath the request's path below the API's base, such as
   *   /users/alice
   * @returns the description's path, such as /users/{userName}, or
   *   undefined if none matches
   */
  pathOf(requestPath: string): string | undefined;
  /**
   * Says whether the description has an operation.
   * @param method the HTTP method
   * @param path the description's path
   * @returns true if it does
   */
  has(method: string, path: string): boolean;
  /**
   * Checks an answer against the description.
   * @param exchange the answer
   * @returns what doesn't match, or undefined if it all does
   */
  check(exchange: Exchange): string | undefined;
  /**
   * Lists every response the description gives, as "GET /users 200".
   * @returns the responses
   */
  responses(): string[];
}

interface Operation {
  responses: Record<
    string,
    | {
        /** For problems, the types it can be, such as "/problems/x: Title." */
        description?: string;
        content?: Record<string, { schema?: unknown }>;
      }
    | undefined
  >;
}

interface Description {
  paths: Record<string, Record<string, Operation | undefined>>;
}

const JSON_MEDIA_TYPES = new Set([
  "application/json",
  "application/problem+json",
]);

/**
 * Escapes a name for a JSON pointer.
 * @param name the name
 * @returns the escaped name
 */
function escapePointer(name: string): string {
  return name.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Checks that a problem is of a type its response lists. The description's
 * schema allows any string, but each response's description names the
 * types the route reports with that status; "about:blank" stands for a
 * plain HTTP error, which any route may give.
 * @param name the operation, such as "GET /users"
 * @param status the status
 * @param description the response's description
 * @param body the body, which matched its schema
 * @returns what doesn't match, or undefined
 */
function problemTypeMismatch(
  name: string,
  status: number,
  description: string | undefined,
  body: unknown
): string | undefined {
  const types = [...(description ?? "").matchAll(/(\/problems\/[\w-]+):/g)].map(
    ([, type]) => type
  );
  const type = (body as { type?: unknown } | null)?.type;
  if (
    types.length === 0 ||
    typeof type !== "string" ||
    type === "about:blank" ||
    types.includes(type)
  ) {
    return undefined;
  }
  return `${name} ${status} is a problem of type ${type}, where its description lists ${types.join(", ")}`;
}

/**
 * Closes every object schema that doesn't say what other fields it allows,
 * so checking against it fails on a field it doesn't list. The published
 * description leaves responses open, since version 1 may add fields and
 * clients must ignore them; but what this version sends must be exactly
 * what it describes, which is how tests catch a field leaking into a
 * response, such as a quest's length into a player's view.
 * @param schema a schema, or any part of the description
 * @returns a closed copy
 */
function closed(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(closed);
  }
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }
  const copy = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      // A schema's properties are a map of names to schemas, not a schema:
      // close each property, but not the map, which may have any names.
      key === "properties" && typeof value === "object" && value !== null
        ? Object.fromEntries(
            Object.entries(value).map(([name, property]) => [
              name,
              closed(property),
            ])
          )
        : closed(value),
    ])
  );
  return "properties" in copy && !("additionalProperties" in copy)
    ? { ...copy, additionalProperties: false }
    : copy;
}

/**
 * Makes a contract from an OpenAPI 3.1 description. Responses are checked
 * as exactly what it describes: a field it doesn't list fails (see closed).
 * @param description the description, as parsed JSON
 * @returns the contract
 */
export function createContract(description: unknown): Contract {
  const { paths } = description as Description;
  // OpenAPI 3.1's schemas are JSON Schema 2020-12. The description is added
  // whole, so each response's schema is compiled where it is, with its
  // references to shared schemas resolved.
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(closed(description) as object, "api");

  // A literal segment beats a parameter, so /sessions/current is found
  // before a /sessions/{id} would be.
  const matchers = Object.keys(paths)
    .map((path) => ({
      path,
      pattern: new RegExp(
        `^${path
          .split("/")
          .map((segment) =>
            /^\{\w+\}$/.test(segment)
              ? "[^/]+"
              : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          )
          .join("/")}$`
      ),
      parameters: (path.match(/\{/g) ?? []).length,
    }))
    .sort((a, b) => a.parameters - b.parameters);

  return {
    pathOf(requestPath) {
      return matchers.find(({ pattern }) => pattern.test(requestPath))?.path;
    },

    has(method, path) {
      return paths[path]?.[method.toLowerCase()] !== undefined;
    },

    check({ method, path, status, mediaType, body }) {
      const name = `${method.toUpperCase()} ${path}`;
      const operation = paths[path]?.[method.toLowerCase()];
      if (!operation) {
        return `${name} isn't in the API's description`;
      }
      const response = operation.responses[String(status)];
      if (!response) {
        return `${name} answered ${status}, which its description doesn't list (it lists ${Object.keys(operation.responses).join(", ")})`;
      }
      if (!response.content) {
        return body === undefined || body === ""
          ? undefined
          : `${name} ${status} has a body, where its description has none`;
      }
      const mediaTypes = Object.keys(response.content);
      if (mediaType === undefined || !mediaTypes.includes(mediaType)) {
        return `${name} ${status} was sent as ${mediaType ?? "nothing"}, where its description says ${mediaTypes.join(" or ")}`;
      }
      // A picture or document is checked only by its media type.
      if (!JSON_MEDIA_TYPES.has(mediaType)) {
        return undefined;
      }
      const validate = ajv.getSchema(
        `api#/paths/${escapePointer(path)}/${method.toLowerCase()}/responses/${status}/content/${escapePointer(mediaType)}/schema`
      )!;
      if (validate(body)) {
        return problemTypeMismatch(name, status, response.description, body);
      }
      const errors = (validate.errors ?? [])
        .map(
          (error) =>
            `${error.instancePath || "the body"} ${error.message ?? "is wrong"}${
              "additionalProperty" in error.params
                ? ` (${String(error.params.additionalProperty)})`
                : ""
            }`
        )
        .join("; ");
      return `${name} ${status} doesn't match its description: ${errors}`;
    },

    responses() {
      return Object.entries(paths).flatMap(([path, operations]) =>
        Object.entries(operations).flatMap(([method, operation]) =>
          Object.keys(operation?.responses ?? {}).map(
            (status) => `${method.toUpperCase()} ${path} ${status}`
          )
        )
      );
    },
  };
}
