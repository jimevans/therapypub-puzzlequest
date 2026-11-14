// Sending to iPhones, against a local HTTP/2 server standing in for Apple's
// push service.
import { generateKeyPairSync, verify } from "node:crypto";
import {
  createServer,
  type Http2Server,
  type IncomingHttpHeaders,
} from "node:http2";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApnsSender } from "../../src/push/apns.js";
import type { PushSender } from "../../src/push/types.js";
import type { PushTarget } from "../../src/services/session.service.js";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});

/** A request the stand-in received. */
interface Received {
  headers: IncomingHttpHeaders;
  body: unknown;
}

let server: Http2Server;
let origin: string;
let received: Received[];
/** What the stand-in answers: a status and body, or nothing at all. */
let answer: { status: number; body?: object } | "hang up";
let sender: PushSender;
let clock: number;

const target: PushTarget = {
  platform: "ios",
  token: "a1b2c3",
  environment: "production",
};

const notification = {
  category: "stopSolved" as const,
  questName: "Harbor walk",
  puzzleName: "The Lighthouse",
  title: "Harbor walk",
  body: "Your team solved The Lighthouse.",
};

beforeEach(async () => {
  received = [];
  answer = { status: 200 };
  clock = Date.UTC(2026, 10, 12, 12);
  server = createServer();
  server.on("stream", (stream, headers) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => (body += chunk));
    stream.on("end", () => {
      received.push({ headers, body: JSON.parse(body) });
      if (answer === "hang up") {
        stream.close();
        return;
      }
      stream.respond({ ":status": answer.status });
      stream.end(answer.body ? JSON.stringify(answer.body) : undefined);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  sender = createApnsSender({
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    keyId: "KEY123",
    teamId: "TEAM123",
    bundleId: "com.example.puzzlequest",
    origins: { production: origin, development: "http://127.0.0.1:1" },
    now: () => clock,
  });
});

afterEach(async () => {
  sender.close();
  await new Promise((resolve) => server.close(resolve));
});

/**
 * Reads a request's bearer token, checking its signature.
 * @param headers the request's headers
 * @param key the public key it should be signed with
 * @returns the token's header and claims
 */
function bearer(headers: IncomingHttpHeaders, key = publicKey) {
  const token = String(headers.authorization).replace(/^bearer /, "");
  const [header, claims, signature] = token.split(".");
  expect(
    verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url")
    )
  ).toBe(true);
  const decode = (part: string) =>
    JSON.parse(Buffer.from(part, "base64url").toString()) as object;
  return { token, header: decode(header), claims: decode(claims) };
}

describe("sending to an iPhone", () => {
  it("signs for the sandbox with its own key, when it has one", async () => {
    const sandbox = generateKeyPairSync("ec", { namedCurve: "P-256" });
    sender.close();
    sender = createApnsSender({
      key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      keyId: "KEY123",
      teamId: "TEAM123",
      bundleId: "com.example.puzzlequest",
      sandbox: {
        key: sandbox.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
        keyId: "SANDBOX1",
      },
      // Both environments at the stand-in, to see what each is sent.
      origins: { production: origin, development: origin },
      now: () => clock,
    });

    // An app from Xcode, then one from the App Store or TestFlight.
    expect(
      await sender.send({ ...target, environment: "development" }, notification)
    ).toBe("sent");
    expect(await sender.send(target, notification)).toBe("sent");

    expect(bearer(received[0].headers, sandbox.publicKey).header).toEqual({
      alg: "ES256",
      kid: "SANDBOX1",
    });
    expect(bearer(received[1].headers).header).toEqual({
      alg: "ES256",
      kid: "KEY123",
    });
  });

  it("signs for both environments with the one key, when the sandbox has none", async () => {
    sender.close();
    sender = createApnsSender({
      key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      keyId: "KEY123",
      teamId: "TEAM123",
      bundleId: "com.example.puzzlequest",
      origins: { production: origin, development: origin },
      now: () => clock,
    });

    await sender.send({ ...target, environment: "development" }, notification);
    await sender.send(target, notification);

    expect(received.map(({ headers }) => bearer(headers).header)).toEqual([
      { alg: "ES256", kid: "KEY123" },
      { alg: "ES256", kid: "KEY123" },
    ]);
  });

  it("posts an alert to the device, signed with the account's key", async () => {
    expect(await sender.send(target, notification)).toBe("sent");

    const [{ headers, body }] = received;
    expect(headers[":path"]).toBe("/3/device/a1b2c3");
    expect(headers[":method"]).toBe("POST");
    expect(headers["apns-topic"]).toBe("com.example.puzzlequest");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(bearer(headers)).toMatchObject({
      header: { alg: "ES256", kid: "KEY123" },
      claims: { iss: "TEAM123", iat: clock / 1000 },
    });
    expect(body).toEqual({
      aps: {
        alert: {
          title: "Harbor walk",
          body: "Your team solved The Lighthouse.",
        },
        sound: "default",
        "thread-id": "Harbor walk",
      },
      category: "stopSolved" as const,
      questName: "Harbor walk",
      puzzleName: "The Lighthouse",
    });
  });

  it("leaves out a puzzle when there isn't one", async () => {
    await sender.send(target, { ...notification, puzzleName: undefined });

    expect(received[0].body).not.toHaveProperty("puzzleName");
  });

  it("reuses its signed token for most of an hour, then signs another", async () => {
    await sender.send(target, notification);
    clock += 49 * 60 * 1000;
    await sender.send(target, notification);
    clock += 2 * 60 * 1000;
    await sender.send(target, notification);

    const tokens = received.map(({ headers }) => bearer(headers).token);
    expect(tokens[1]).toBe(tokens[0]);
    expect(tokens[2]).not.toBe(tokens[0]);
  });

  it("signs another token after Apple refuses one", async () => {
    answer = { status: 403, body: { reason: "ExpiredProviderToken" } };
    expect(await sender.send(target, notification)).toBe("failed");
    clock += 1000;
    answer = { status: 200 };
    await sender.send(target, notification);

    expect(bearer(received[1].headers).token).not.toBe(
      bearer(received[0].headers).token
    );
  });

  it.each([
    [410, { reason: "Unregistered" }],
    [400, { reason: "BadDeviceToken" }],
  ])("says a token is gone when Apple answers %i", async (status, body) => {
    answer = { status, body };

    expect(await sender.send(target, notification)).toBe("gone");
  });

  it.each([
    [400, { reason: "PayloadTooLarge" }],
    [429, { reason: "TooManyRequests" }],
    [500, undefined],
  ])(
    "fails without forgetting the token when Apple answers %i",
    async (status, body) => {
      answer = { status, body };

      expect(await sender.send(target, notification)).toBe("failed");
    }
  );

  it("fails when Apple doesn't answer", async () => {
    answer = "hang up";

    expect(await sender.send(target, notification)).toBe("failed");
  });

  it("fails when Apple can't be reached, and sends a development app's notifications to the sandbox", async () => {
    const unreachable = createApnsSender({
      key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      keyId: "KEY123",
      teamId: "TEAM123",
      bundleId: "com.example.puzzlequest",
      origins: { production: "http://127.0.0.1:1", development: origin },
    });

    expect(await unreachable.send(target, notification)).toBe("failed");
    expect(
      await unreachable.send(
        { ...target, environment: "development" },
        notification
      )
    ).toBe("sent");
    unreachable.close();
  });
});
