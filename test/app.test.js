import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { config } from "../src/config.js";
import { createApp } from "../src/createApp.js";

afterEach(() => {
  config.PQ_TRUST_PROXY = undefined;
});

describe("createApp", () => {
  it("renders the login page", async () => {
    const response = await request(createApp()).get("/login");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain("<form");
  });

  it("serves static files", async () => {
    const response = await request(createApp()).get("/style/pq.css");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/css");
  });

  it("serves the browser build of marked from the installed package", async () => {
    const response = await request(createApp()).get("/vendor/marked.esm.js");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/javascript");
    expect(response.text).toContain("export");
  });

  it("rejects anonymous API requests that require a user", async () => {
    const response = await request(createApp()).get("/api/user/list");

    expect(response.status).toBe(401);
    // Controllers send JSON.stringify output, which Express labels text/html,
    // so the body has to be parsed by hand.
    expect(JSON.parse(response.text).status).toBe("error");
  });

  it("does not trust proxy headers unless configured to", async () => {
    expect(createApp().get("trust proxy")).toBe(false);
  });

  it("applies the configured trust proxy setting", async () => {
    config.PQ_TRUST_PROXY = 1;

    expect(createApp().get("trust proxy")).toBe(1);
  });
});
