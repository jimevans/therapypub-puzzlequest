import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { config } from "../src/config.js";
import { createApp } from "../src/createApp.js";

afterEach(() => {
  config.PQ_TRUST_PROXY = undefined;
});

describe("createApp", () => {
  it("serves static files", async () => {
    const response = await request(createApp()).get("/style/error.css");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/css");
  });

  it("rejects anonymous API requests that require a user", async () => {
    const response = await request(createApp()).get("/api/v1/users");

    expect(response.status).toBe(401);
    expect(JSON.parse(response.text).type).toBe("/problems/sign-in-required");
  });

  it("does not trust proxy headers unless configured to", async () => {
    expect(createApp().get("trust proxy")).toBe(false);
  });

  it("applies the configured trust proxy setting", async () => {
    config.PQ_TRUST_PROXY = 1;

    expect(createApp().get("trust proxy")).toBe(1);
  });
});
