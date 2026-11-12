// Sending to Android phones, with Google's services replaced by a fake fetch.
import { generateKeyPairSync, verify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFcmSender } from "../../src/push/fcm.js";
import type { PushSender } from "../../src/push/types.js";
import type { PushTarget } from "../../src/services/session.service.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const serviceAccount = {
  project_id: "puzzlequest",
  client_email: "sender@puzzlequest.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  token_uri: "https://oauth.example/token",
};

const target: PushTarget = {
  platform: "android",
  token: "fcm-token",
  environment: "production",
};

const notification = {
  category: "questStarted",
  questName: "Harbor walk",
  title: "Harbor walk",
  body: "Harbor walk has begun.",
};

/** What the fake answers FCM's sends with. */
let sendAnswer: () => Response;
let clock: number;
let accessTokens: number;
const fakeFetch = vi.fn<typeof fetch>();
let sender: PushSender;

beforeEach(() => {
  clock = Date.UTC(2026, 10, 12, 12);
  accessTokens = 0;
  sendAnswer = () => Response.json({ name: "projects/puzzlequest/messages/1" });
  fakeFetch.mockReset();
  fakeFetch.mockImplementation(async (url) => {
    if (url === serviceAccount.token_uri) {
      accessTokens++;
      return Response.json({
        access_token: `access-${accessTokens}`,
        expires_in: 3600,
      });
    }
    return sendAnswer();
  });
  sender = createFcmSender({
    serviceAccount,
    origin: "https://fcm.example",
    fetch: fakeFetch,
    now: () => clock,
  });
});

/** The requests made to send, with their bodies parsed. */
function sends() {
  return fakeFetch.mock.calls
    .filter(([url]) => url !== serviceAccount.token_uri)
    .map(([url, init]) => ({
      url,
      authorization: (init?.headers as Record<string, string>).authorization,
      body: JSON.parse(String(init?.body)) as unknown,
    }));
}

describe("sending to an Android phone", () => {
  it("signs in as the service account, then sends a notification", async () => {
    expect(await sender.send(target, notification)).toBe("sent");

    const [tokenUrl, tokenRequest] = fakeFetch.mock.calls[0];
    expect(tokenUrl).toBe(serviceAccount.token_uri);
    const form = new URLSearchParams(String(tokenRequest?.body));
    expect(form.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer"
    );
    const [header, claims, signature] = form.get("assertion")!.split(".");
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${claims}`),
        publicKey,
        Buffer.from(signature, "base64url")
      )
    ).toBe(true);
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: serviceAccount.token_uri,
      iat: clock / 1000,
      exp: clock / 1000 + 3600,
    });

    expect(sends()).toEqual([
      {
        url: "https://fcm.example/v1/projects/puzzlequest/messages:send",
        authorization: "Bearer access-1",
        body: {
          message: {
            token: "fcm-token",
            notification: {
              title: "Harbor walk",
              body: "Harbor walk has begun.",
            },
            data: { category: "questStarted", questName: "Harbor walk" },
            android: { notification: { tag: "Harbor walk" } },
          },
        },
      },
    ]);
  });

  it("names the puzzle when there is one", async () => {
    await sender.send(target, {
      ...notification,
      puzzleName: "The Lighthouse",
    });

    expect(sends()[0].body).toMatchObject({
      message: { data: { puzzleName: "The Lighthouse" } },
    });
  });

  it("reuses its access token until near its end", async () => {
    await sender.send(target, notification);
    clock += 54 * 60 * 1000;
    await sender.send(target, notification);
    clock += 2 * 60 * 1000;
    await sender.send(target, notification);

    expect(sends().map(({ authorization }) => authorization)).toEqual([
      "Bearer access-1",
      "Bearer access-1",
      "Bearer access-2",
    ]);
  });

  it("gets another access token after Google refuses one", async () => {
    sendAnswer = () => new Response("", { status: 401 });
    expect(await sender.send(target, notification)).toBe("failed");
    sendAnswer = () => Response.json({});
    await sender.send(target, notification);

    expect(accessTokens).toBe(2);
  });

  it.each([
    ["404", () => new Response("", { status: 404 })],
    [
      "UNREGISTERED",
      () =>
        Response.json(
          {
            error: {
              status: "NOT_FOUND",
              details: [{ errorCode: "UNREGISTERED" }],
            },
          },
          { status: 400 }
        ),
    ],
  ])("says a token is gone when Firebase answers %s", async (_, answer) => {
    sendAnswer = answer;

    expect(await sender.send(target, notification)).toBe("gone");
  });

  it.each([
    ["500", () => new Response("not json", { status: 500 })],
    [
      "QUOTA_EXCEEDED",
      () =>
        Response.json(
          { error: { details: [{ errorCode: "QUOTA_EXCEEDED" }] } },
          { status: 429 }
        ),
    ],
  ])(
    "fails without forgetting the token when Firebase answers %s",
    async (_, answer) => {
      sendAnswer = answer;

      expect(await sender.send(target, notification)).toBe("failed");
    }
  );

  it("fails when Google refuses the service account", async () => {
    fakeFetch.mockImplementation(async () => new Response("", { status: 400 }));

    expect(await sender.send(target, notification)).toBe("failed");
    expect(sends()).toEqual([]);
  });

  it("fails when Firebase can't be reached", async () => {
    sendAnswer = () => {
      throw new TypeError("fetch failed");
    };

    expect(await sender.send(target, notification)).toBe("failed");
  });
});
