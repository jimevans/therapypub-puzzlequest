// The API's reference page, /api/v1/docs: Swagger UI, served from the site
// itself under its Content Security Policy.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/createApp.js";

const app = createApp();

describe("the API reference", () => {
  it("is a page loading Swagger UI and its starting script from this site", async () => {
    const response = await request(app).get("/api/v1/docs");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.get("Content-Security-Policy")).toContain(
      "script-src 'self'"
    );
    expect(response.text).toContain(
      '<link rel="stylesheet" href="/api/v1/docs/swagger-ui.css" />'
    );
    expect(response.text).toContain(
      '<script src="/api/v1/docs/swagger-ui-bundle.js"></script>'
    );
    expect(response.text).toContain(
      '<script src="/script/api-reference.js"></script>'
    );
    // Nothing inline, which the policy would block.
    expect(response.text).not.toMatch(/<script>|<style|style="/);
  });

  it.each([
    ["/api/v1/docs/swagger-ui.css", "text/css"],
    ["/api/v1/docs/swagger-ui-bundle.js", "text/javascript"],
    ["/script/api-reference.js", "text/javascript"],
  ])("serves %s", async (path, type) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(200);
    expect(response.type).toBe(type);
  });

  it("starts Swagger UI on the API's description, without its validator", async () => {
    const script = (await request(app).get("/script/api-reference.js")).text;

    expect(script).toContain('url: "/api/v1/openapi.json"');
    expect(script).toContain("validatorUrl: null");
  });

  it("serves none of Swagger UI's other files", async () => {
    for (const path of [
      "index.html",
      "swagger-initializer.js",
      "package.json",
    ]) {
      expect((await request(app).get(`/api/v1/docs/${path}`)).status).toBe(404);
    }
  });
});
