// Checks that the live-update messages stay compatible with what version 1.0
// promised (decision 0023). The routes are checked by oasdiff in CI, but it
// only follows what the routes refer to, and no route refers to the messages
// sent over the websocket, so they are checked here, by the same rules: the
// server's messages may gain messages, fields, and enumerated values, but not
// lose or change them; a client's messages may gain optional fields, but the
// server must still accept everything it accepted before.

/** A JSON Schema, as it appears in the API's description. */
export type Schema = { [keyword: string]: unknown };

/** Which way a message goes, which decides what is a breaking change. */
export type Direction = "fromServer" | "toServer";

/** The live-update schemas, as kept in `live-updates.json`. */
export interface LiveUpdateSchemas {
  LiveUpdate: Schema;
  LiveUpdateSubscription: Schema;
}

/** Keywords that only explain a schema, which can change freely. */
const ANNOTATIONS = new Set(["description", "examples", "title"]);

/** Keywords whose subschemas are compared one by one, not as a whole. */
const STRUCTURE = new Set([
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "oneOf",
  "anyOf",
]);

const isSchema = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Inlines a schema's references to the description's components and drops
 * its annotations, so that schemas compare by what they allow.
 * @param schema the schema
 * @param schemas the description's component schemas
 * @returns the schema, whole
 */
export function resolve(
  schema: unknown,
  schemas: Record<string, Schema>
): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => resolve(item, schemas));
  }
  if (!isSchema(schema)) {
    return schema;
  }
  const ref = schema.$ref;
  if (typeof ref === "string") {
    const name = ref.replace("#/components/schemas/", "");
    const target = schemas[name];
    if (!target) {
      throw new Error(`Unknown schema ${ref}`);
    }
    return resolve(target, schemas);
  }
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([keyword]) => !ANNOTATIONS.has(keyword))
      .map(([keyword, value]) => [
        keyword,
        // A property named like an annotation is still a property.
        keyword === "properties" && isSchema(value)
          ? Object.fromEntries(
              Object.entries(value).map(([name, property]) => [
                name,
                resolve(property, schemas),
              ])
            )
          : resolve(value, schemas),
      ])
  );
}

/**
 * Gets the live-update schemas from the API's description, whole.
 * @param description the API's OpenAPI description
 * @returns the schemas of the server's and the client's messages
 */
export function liveUpdateSchemasOf(description: {
  components: { schemas: Record<string, Schema> };
}): LiveUpdateSchemas {
  const { schemas } = description.components;
  return {
    LiveUpdate: resolve(schemas.LiveUpdate, schemas) as Schema,
    LiveUpdateSubscription: resolve(
      schemas.LiveUpdateSubscription,
      schemas
    ) as Schema,
  };
}

/** What a schema requires of an object, as a set. */
const requiredOf = (schema: Schema) =>
  new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);

/**
 * Names one of a union's choices, to find the same choice in another version:
 * by its `message` for the server's messages, which may gain required fields;
 * by its `message` and required fields for a client's, which may not.
 */
function choiceKey(choice: Schema, direction: Direction): string {
  const properties = isSchema(choice.properties) ? choice.properties : {};
  const message = isSchema(properties.message)
    ? properties.message.const
    : undefined;
  if (message === undefined) {
    return JSON.stringify(choice.type ?? choice.const ?? choice);
  }
  return direction === "fromServer"
    ? `message ${String(message)}`
    : `message ${String(message)} with ${[...requiredOf(choice)].sort().join(", ")}`;
}

/** The keywords a schema is compared by as a whole. */
const constraintsOf = (schema: Schema) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(schema)
        .filter(([keyword]) => !STRUCTURE.has(keyword))
        .sort(([a], [b]) => a.localeCompare(b))
    )
  );

/**
 * Lists the ways a new version of a schema would break a client written
 * against the old one.
 * @param base the old version
 * @param current the new version
 * @param direction which way the messages go
 * @param at where in the message the schemas are, for the report
 * @returns each breaking change, described; none if compatible
 */
export function breakingChanges(
  base: unknown,
  current: unknown,
  direction: Direction,
  at = ""
): string[] {
  const where = at || "the message";
  if (!isSchema(base) || !isSchema(current)) {
    return JSON.stringify(base) === JSON.stringify(current)
      ? []
      : [`${where} changed`];
  }
  const changes: string[] = [];

  if (constraintsOf(base) !== constraintsOf(current)) {
    changes.push(`${where} changed its type or constraints`);
  }

  if (Array.isArray(base.enum)) {
    const values = new Set(Array.isArray(current.enum) ? current.enum : []);
    for (const value of base.enum) {
      if (!values.has(value)) {
        changes.push(`${where} no longer allows ${JSON.stringify(value)}`);
      }
    }
  }

  for (const union of ["oneOf", "anyOf"] as const) {
    const baseChoices = base[union];
    if (!Array.isArray(baseChoices)) {
      continue;
    }
    const currentChoices = new Map(
      (Array.isArray(current[union]) ? (current[union] as Schema[]) : []).map(
        (choice) => [choiceKey(choice, direction), choice]
      )
    );
    for (const choice of baseChoices as Schema[]) {
      const key = choiceKey(choice, direction);
      const match = currentChoices.get(key);
      if (match) {
        changes.push(
          ...breakingChanges(
            choice,
            match,
            direction,
            at ? `${at} (${key})` : key
          )
        );
      } else {
        changes.push(`${at ? `${at}: ` : ""}${key} was removed`);
      }
    }
  }

  if (isSchema(base.properties)) {
    const properties = isSchema(current.properties) ? current.properties : {};
    for (const [name, property] of Object.entries(base.properties)) {
      const path = at ? `${at}.${name}` : name;
      if (name in properties) {
        changes.push(
          ...breakingChanges(property, properties[name], direction, path)
        );
      } else {
        changes.push(`${path} was removed`);
      }
    }
  }

  const baseRequired = requiredOf(base);
  const currentRequired = requiredOf(current);
  if (direction === "fromServer") {
    // A client may rely on a field the server always sent. (A field that's
    // gone altogether is reported as removed.)
    const kept = isSchema(current.properties) ? current.properties : {};
    for (const name of baseRequired) {
      if (!currentRequired.has(name) && name in kept) {
        changes.push(`${at ? `${at}.` : ""}${name} became optional`);
      }
    }
  } else {
    // A client that leaves out a field the server didn't need would fail.
    for (const name of currentRequired) {
      if (!baseRequired.has(name)) {
        changes.push(`${at ? `${at}.` : ""}${name} became required`);
      }
    }
  }

  if (base.items !== undefined) {
    changes.push(
      ...breakingChanges(base.items, current.items, direction, `${where}[]`)
    );
  }

  return changes;
}

/**
 * Lists the breaking changes between two versions of the live updates.
 * @param base the version clients were written against
 * @param current the version now described
 * @returns each breaking change, described; none if compatible
 */
export function liveUpdateBreakingChanges(
  base: LiveUpdateSchemas,
  current: LiveUpdateSchemas
): string[] {
  return [
    ...breakingChanges(base.LiveUpdate, current.LiveUpdate, "fromServer").map(
      (change) => `LiveUpdate: ${change}`
    ),
    ...breakingChanges(
      base.LiveUpdateSubscription,
      current.LiveUpdateSubscription,
      "toServer"
    ).map((change) => `LiveUpdateSubscription: ${change}`),
  ];
}

/**
 * Gets the push notification schema from the API's description, whole.
 * @param description the API's OpenAPI description
 * @returns what a push notification carries
 */
export function pushNotificationSchemaOf(description: {
  components: { schemas: Record<string, Schema> };
}): Schema {
  const { schemas } = description.components;
  return resolve(schemas.PushNotification, schemas) as Schema;
}

/**
 * Lists the breaking changes between two versions of what push
 * notifications carry. Like the server's live updates, they may gain
 * fields and kinds, but not lose or change them.
 * @param base the version apps were written against
 * @param current the version now described
 * @returns each breaking change, described; none if compatible
 */
export function pushNotificationBreakingChanges(
  base: Schema,
  current: Schema
): string[] {
  return breakingChanges(base, current, "fromServer").map(
    (change) => `PushNotification: ${change}`
  );
}
