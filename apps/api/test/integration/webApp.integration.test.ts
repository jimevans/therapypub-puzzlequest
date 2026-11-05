// Tests of how the server serves the React app's built files. They use a small
// stand-in for the build, so they don't depend on the web app having been built.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

const paths = vi.hoisted(() => ({ webDirectory: "" }));

vi.mock("../../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/paths.js")>();
  return {
    ...actual,
    get webDirectory() {
      return paths.webDirectory;
    },
  };
});

const PAGE =
  '<!doctype html><script type="module" src="/assets/a.js"></script>';
const LARGE_SCRIPT = `export const text = "${"puzzle ".repeat(1000)}";`;

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "pq-web-"));
paths.webDirectory = path.join(temporaryDirectory, "built");
mkdirSync(path.join(paths.webDirectory, "assets"), { recursive: true });
writeFileSync(path.join(paths.webDirectory, "index.html"), PAGE);
writeFileSync(path.join(paths.webDirectory, "assets", "a.js"), LARGE_SCRIPT);

const { createApp } = await import("../../src/createApp.js");
const app = createApp();

describe("the web app", () => {
  afterAll(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("serves its page, which browsers must check for changes", async () => {
    const response = await request(app).get("/web-check");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.text).toBe(PAGE);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("serves its page under the site's Content Security Policy", async () => {
    const response = await request(app).get("/web-check");

    const policy = response.headers["content-security-policy"];
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toContain("unsafe");
  });

  it("lets browsers keep built files, whose names change with them", async () => {
    const response = await request(app).get("/assets/a.js");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/javascript");
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("compresses what it sends", async () => {
    const response = await request(app)
      .get("/assets/a.js")
      .set("Accept-Encoding", "gzip");

    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(response.text).toBe(LARGE_SCRIPT);
  });

  it("answers 404, not the page, for a built file that doesn't exist", async () => {
    const response = await request(app).get("/assets/gone.js");

    expect(response.status).toBe(404);
    expect(response.text).not.toContain("<script");
  });

  it("doesn't serve the page at addresses that aren't its own", async () => {
    const response = await request(app).get("/not-a-page");

    expect(response.status).toBe(404);
    expect(response.text).not.toBe(PAGE);
  });

  describe("before it has been built", () => {
    const built = paths.webDirectory;

    beforeAll(() => {
      paths.webDirectory = path.join(temporaryDirectory, "missing");
    });

    afterAll(() => {
      paths.webDirectory = built;
    });

    it("says so", async () => {
      const response = await request(createApp()).get("/web-check");

      expect(response.status).toBe(503);
      expect(response.text).toBe("The web app hasn't been built.");
    });
  });
});
