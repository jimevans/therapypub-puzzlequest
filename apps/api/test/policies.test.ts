// The legal pages are served under the strict Content Security Policy, which
// blocks inline styles and scripts (decision 0012). Termly's exports are full
// of both, so a policy pasted in from a new export would show as plain text.
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/createApp.js";

async function page(name: string): Promise<string> {
  const response = await request(createApp()).get(`/policies/${name}.html`);
  expect(response.status).toBe(200);
  return response.text;
}

describe.each(["privacy", "terms", "cookies", "delete-account", "support"])(
  "the %s page",
  (name) => {
    it("is a whole page, styled only by its stylesheet", async () => {
      const html = await page(name);

      expect(html).toMatch(/^<!doctype html>\s*<html lang="en">/);
      expect(html).toMatch(/<title>[^<]+ · PuzzleQuest<\/title>/);
      expect(html).toContain(
        '<link rel="stylesheet" href="/style/policies.css" />'
      );
      expect(html.match(/<h1[ >]/g)).toHaveLength(1);
      expect(html).not.toMatch(/<style|<script|\sstyle=/i);
    });

    it("has a target for every link within it", async () => {
      const html = await page(name);

      const ids = new Set(
        [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id)
      );
      const missing = [...html.matchAll(/href="#([^"]+)"/g)]
        .map(([, id]) => id)
        .filter((id) => !ids.has(id));
      expect(missing).toEqual([]);
    });
  }
);

it("says how to delete an account, rather than linking a page that isn't there", async () => {
  const html = await page("privacy");

  expect(html).not.toContain("privacyrequest");
  expect(html).toContain('href="/policies/delete-account.html"');
  expect(html).toContain('href="/policies/cookies.html"');
});

// The app stores link to these: Google Play's account deletion page and the
// App Store's support page, which must be reachable without signing in.
describe("the pages the app stores link to", () => {
  it("say how to delete an account, in the app and on the website", async () => {
    const html = await page("delete-account");

    expect(html).toContain("<strong>Delete account</strong>");
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/user/password/forgot"');
    expect(html).toContain('href="mailto:privacy@thepuzzlequest.com"');
  });

  it("give a way to contact support, and link the policies", async () => {
    const html = await page("support");

    expect(html).toContain('href="mailto:jim@thepuzzlequest.com"');
    for (const policy of ["privacy", "terms", "cookies", "delete-account"]) {
      expect(html).toContain(`href="/policies/${policy}.html"`);
    }
  });
});

it("serves the legal pages' stylesheet", async () => {
  const response = await request(createApp()).get("/style/policies.css");

  expect(response.status).toBe(200);
  expect(response.type).toBe("text/css");
});
