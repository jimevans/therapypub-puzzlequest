// The check of every v1 response against the API's description, which runs
// after every test (setup.ts, contract.ts).
import compression from "compression";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { checkResponses } from "./contract.js";

/**
 * An app that answers one route of the API's description as it's told.
 * @param answer how to answer
 * @returns the app
 */
function appAnswering(answer: (res: express.Response) => void) {
  const app = express();
  app.use(compression({ threshold: 0 }));
  app.get("/api/v1/teams/:teamName", (_req, res) => answer(res));
  app.post("/api/v1/webhooks/twilio/voice", (_req, res) => {
    res.json({ anything: true });
  });
  app.get("/api/v1/nowhere", (_req, res) => {
    res.json({ anything: true });
  });
  return app;
}

describe("the check of v1 responses", () => {
  it("passes a response that matches, read before it's compressed", async () => {
    await request(
      appAnswering((res) => {
        res.json({ teamName: "red", displayName: "The Reds" });
      })
    )
      .get("/api/v1/teams/red")
      .set("Accept-Encoding", "gzip");

    expect(checkResponses()).toEqual([]);
  });

  it("catches a body that doesn't match", async () => {
    await request(
      appAnswering((res) => {
        res.json({ teamName: "red" });
      })
    ).get("/api/v1/teams/red");

    expect(checkResponses()).toEqual([
      "GET /teams/{teamName} 200 doesn't match its description: the body must have required property 'displayName'",
    ]);
  });

  it("catches a status the route doesn't list, and a body where there's none", async () => {
    await request(
      appAnswering((res) => {
        res.status(204).end();
      })
    ).get("/api/v1/teams/red");
    await request(
      appAnswering((res) => {
        res.status(418).json({});
      })
    ).get("/api/v1/teams/red");

    expect(checkResponses()).toEqual([
      "GET /teams/{teamName} answered 204, which its description doesn't list (it lists 200, 401, 403, 404, 500)",
      "GET /teams/{teamName} answered 418, which its description doesn't list (it lists 200, 401, 403, 404, 500)",
    ]);
  });

  it("leaves out webhooks and routes the description doesn't have", async () => {
    const app = appAnswering(() => undefined);
    await request(app).post("/api/v1/webhooks/twilio/voice");
    await request(app).get("/api/v1/nowhere");

    expect(checkResponses()).toEqual([]);
  });
});
