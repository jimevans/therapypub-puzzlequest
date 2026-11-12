import { describe, expect, it } from "vitest";
import recorded from "../live-updates.json" with { type: "json" };
import recordedPush from "../push-notifications.json" with { type: "json" };
import description from "../openapi.json" with { type: "json" };
import {
  breakingChanges,
  type LiveUpdateSchemas,
  liveUpdateBreakingChanges,
  liveUpdateSchemasOf,
  pushNotificationBreakingChanges,
  pushNotificationSchemaOf,
  type Schema,
} from "./compatibility.js";

// The live updates as clients may rely on them (live-updates.json): version
// 1.0's, plus whatever has been added since.
// `npm run accept-live-updates --workspace=@puzzlequest/api-client` records
// new messages and fields there, and refuses a breaking change.
const current = liveUpdateSchemasOf(
  description as unknown as Parameters<typeof liveUpdateSchemasOf>[0]
);

describe("the live updates", () => {
  it("are compatible with the version clients were written against", () => {
    expect(
      liveUpdateBreakingChanges(recorded as LiveUpdateSchemas, current)
    ).toEqual([]);
  });

  it("are all recorded, so a later change can't remove what was added", () => {
    expect(
      current,
      "The live updates differ from live-updates.json. If they only gained something, record it: npm run accept-live-updates --workspace=@puzzlequest/api-client"
    ).toEqual(recorded);
  });
});

// What push notifications carry, as apps may rely on it
// (push-notifications.json), held to the same rules as the server's live
// updates. `npm run accept-push-notifications --workspace=@puzzlequest/api-client`
// records additions there, and refuses a breaking change.
const currentPush = pushNotificationSchemaOf(
  description as unknown as Parameters<typeof pushNotificationSchemaOf>[0]
);

describe("the push notifications", () => {
  it("are compatible with the version apps were written against", () => {
    expect(
      pushNotificationBreakingChanges(recordedPush as Schema, currentPush)
    ).toEqual([]);
  });

  it("are all recorded, so a later change can't remove what was added", () => {
    expect(
      currentPush,
      "The push notifications differ from push-notifications.json. If they only gained something, record it: npm run accept-push-notifications --workspace=@puzzlequest/api-client"
    ).toEqual(recordedPush);
  });

  const base: Schema = {
    type: "object",
    properties: {
      category: { type: "string", enum: ["questStarted", "stopSolved"] },
      questName: { type: "string" },
      puzzleName: { type: "string" },
    },
    required: ["category", "questName"],
  };

  it("may gain kinds and fields", () => {
    expect(
      pushNotificationBreakingChanges(base, {
        ...base,
        properties: {
          ...(base.properties as object),
          category: {
            type: "string",
            enum: ["questStarted", "stopSolved", "message"],
          },
          entryId: { type: "string" },
        },
      })
    ).toEqual([]);
  });

  it("may not lose a kind, lose a field, or stop always sending one", () => {
    expect(
      pushNotificationBreakingChanges(base, {
        type: "object",
        properties: {
          category: { type: "string", enum: ["questStarted"] },
          questName: { type: "string" },
        },
        required: ["category"],
      })
    ).toEqual([
      'PushNotification: category no longer allows "stopSolved"',
      "PushNotification: puzzleName was removed",
      "PushNotification: questName became optional",
    ]);
  });
});

/** A server message with the given fields, all required. */
const message = (name: string, fields: Record<string, Schema> = {}) => ({
  type: "object",
  properties: { message: { type: "string", const: name }, ...fields },
  required: ["message", ...Object.keys(fields)],
  additionalProperties: false,
});

const string = { type: "string" };

describe("finding breaking changes", () => {
  const base = {
    oneOf: [
      message("puzzleSolved", { puzzleName: string }),
      message("questUpdated", {
        status: { type: "string", enum: ["inProgress", "completed"] },
      }),
    ],
  };

  it("allows the server to send new messages, fields, and values", () => {
    const grown = {
      oneOf: [
        message("puzzleSolved", { puzzleName: string, endTime: string }),
        message("questUpdated", {
          status: {
            type: "string",
            enum: ["notStarted", "inProgress", "completed"],
          },
        }),
        message("hintRevealed"),
      ],
    };
    expect(breakingChanges(base, grown, "fromServer")).toEqual([]);
  });

  it("reports a server message or field that's gone", () => {
    const shrunk = { oneOf: [message("puzzleSolved")] };
    expect(breakingChanges(base, shrunk, "fromServer")).toEqual([
      "message puzzleSolved.puzzleName was removed",
      "message questUpdated was removed",
    ]);
  });

  it("reports a field that changed its type, or may now be missing", () => {
    const changed = {
      oneOf: [
        {
          ...message("puzzleSolved", { puzzleName: { type: "integer" } }),
          required: ["message"],
        },
        base.oneOf[1],
      ],
    };
    expect(breakingChanges(base, changed, "fromServer")).toEqual([
      "message puzzleSolved.puzzleName changed its type or constraints",
      "message puzzleSolved.puzzleName became optional",
    ]);
  });

  it("reports a value that's no longer allowed", () => {
    const narrowed = {
      oneOf: [
        base.oneOf[0],
        message("questUpdated", {
          status: { type: "string", enum: ["completed"] },
        }),
      ],
    };
    expect(breakingChanges(base, narrowed, "fromServer")).toEqual([
      'message questUpdated.status no longer allows "inProgress"',
    ]);
  });

  it("allows a client's message an optional field, but not a required one", () => {
    const subscribe = {
      anyOf: [message("subscribe", { questName: string })],
    };
    const optional = {
      anyOf: [
        {
          ...message("subscribe", { questName: string, since: string }),
          required: ["message", "questName"],
        },
      ],
    };
    expect(breakingChanges(subscribe, optional, "toServer")).toEqual([]);
    expect(
      breakingChanges(
        subscribe,
        { anyOf: [message("subscribe", { questName: string, since: string })] },
        "toServer"
      )
    ).toEqual(["message subscribe with message, questName was removed"]);
  });

  it("ignores changes to descriptions", () => {
    const described = {
      oneOf: base.oneOf.map((choice) => ({ ...choice, description: "New" })),
    };
    expect(
      liveUpdateBreakingChanges(
        { LiveUpdate: base, LiveUpdateSubscription: {} },
        liveUpdateSchemasOf({
          components: {
            schemas: { LiveUpdate: described, LiveUpdateSubscription: {} },
          },
        })
      )
    ).toEqual([]);
  });
});
